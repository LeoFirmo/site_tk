const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();

// Tradutor nativo universal para países por extenso em português
const tradutorPais = new Intl.DisplayNames(['pt-BR'], { type: 'region' });

// Tabela auxiliar para converter siglas de estados brasileiros caso a consulta externa falhe
const estadosBrasil = {
    'AC': 'Acre', 'AL': 'Alagoas', 'AP': 'Amapá', 'AM': 'Amazonas',
    'BA': 'Bahia', 'CE': 'Ceará', 'DF': 'Distrito Federal', 'ES': 'Espírito Santo',
    'GO': 'Goiás', 'MA': 'Maranhão', 'MT': 'Mato Grosso', 'MS': 'Mato Grosso do Sul',
    'MG': 'Minas Gerais', 'PA': 'Pará', 'PB': 'Paraíba', 'PR': 'Paraná',
    'PE': 'Pernambuco', 'PI': 'Piauí', 'RJ': 'Rio de Janeiro', 'RN': 'Rio Grande do Norte',
    'RS': 'Rio Grande do Sul', 'RO': 'Rondônia', 'RR': 'Roraima', 'SC': 'Santa Catarina',
    'SP': 'São Paulo', 'SE': 'Sergipe', 'TO': 'Tocantins'
};

app.get('/api/imagem', async (req, res) => {
    const nomeSite = req.query.t || req.query.site || 'Site Indefinido';

    // 1. Extração do IP público
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ip = rawIp.split(',')[0].trim() || 'N/A';

    // 2. Dados preliminares via cabeçalhos de borda da Vercel
    const siglaPais = req.headers['x-vercel-ip-country'] || 'N/A';
    const siglaRegiao = req.headers['x-vercel-ip-country-region'] || 'N/A';
    
    let cidade = req.headers['x-vercel-ip-city'] 
        ? decodeURIComponent(req.headers['x-vercel-ip-city']) 
        : 'Não Identificada';

    let estado = siglaPais === 'BR' && estadosBrasil[siglaRegiao] 
        ? estadosBrasil[siglaRegiao] 
        : siglaRegiao;

    let pais = 'Não Identificado';
    if (siglaPais !== 'N/A') {
        try {
            pais = tradutorPais.of(siglaPais) || siglaPais;
        } catch {
            pais = siglaPais;
        }
    }

    // 3. Consulta global aprofundada (traduz estados e cidades do mundo todo para português)
    const ipValido = ip !== 'N/A' && ip !== '127.0.0.1' && !ip.startsWith('192.168.') && !ip.startsWith('10.');
    
    if (ipValido) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // Limite de 2 segundos para não atrasar a resposta

            const resposta = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city&lang=pt-BR`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const dados = await resposta.json();

            if (dados.status === 'success') {
                cidade = dados.city || cidade;
                estado = dados.regionName || estado;
                pais = dados.country || pais;
            }
        } catch (erroGeo) {
            console.error('Consulta externa de geolocalizacao falhou, utilizando dados da Vercel:', erroGeo.message);
        }
    }

    // 4. Idioma e Tipo de Dispositivo
    const rawLang = req.headers['accept-language'] || '';
    const idioma = rawLang ? rawLang.split(',')[0].trim() : 'Não Identificado';

    const userAgent = req.headers['user-agent'] || '';
    const ehCelular = /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    const tipoDispositivo = userAgent ? (ehCelular ? 'Celular' : 'Computador') : 'Não Identificado';

    const origem = req.headers['referer'] || 'Acesso Direto';
    const dataHoraSP = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Pixel 1x1 transparente
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

    try {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];

        // Gravação dos dados na planilha
        await sheet.addRow({
            'Site': nomeSite,
            'Data Abertura': dataHoraSP,
            'IP': ip,
            'Cidade': cidade,
            'Estado': estado,
            'País': pais,
            'Idioma': idioma,
            'Tipo Dispositivo': tipoDispositivo,
            'Origem': origem,
            'Dispositivo': userAgent || 'Não Identificado'
        });

    } catch (error) {
        console.error('Erro ao registrar visita na planilha:', error.message);
    } finally {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        return res.status(200).send(pixel);
    }
});

module.exports = app;
