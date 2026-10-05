const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();

// ============================================================
// CONFIGURAÇÃO DOS PRODUTOS E OFERTAS
// ============================================================

const produtos = {
    'akemi-coffee-boost': {
        paises: {
            US: 'https://www.pixlbonk.com/L1HDNH9/9MLGPC5/',
            CA: 'https://www.pixlbonk.com/L1HDNH9/9MLGPC5/',
            AU: 'https://www.treejammer.com/L1HDNH9/9KCZZ7S/'
        }
    },

    'vitaslimex': {
        paises: {
            FR: 'https://www.pixlbonk.com/L1HDNH9/992NJKS/',
            CH: 'https://www.pixlbonk.com/L1HDNH9/992NJKS/',
            BE: 'https://www.pixlbonk.com/L1HDNH9/992NJKS/',
            ES: 'https://www.pixlbonk.com/L1HDNH9/698ABCD/'
        }
    }
};

// Se não encontrar país, produto ou oferta:
const destinoPadrao = 'https://www.google.com.br/';


// ============================================================
// TRADUÇÃO DE PAÍSES
// ============================================================

const tradutorPais = new Intl.DisplayNames(['pt-BR'], {
    type: 'region'
});


// ============================================================
// ESTADOS BRASILEIROS
// ============================================================

const estadosBrasil = {
    'AC': 'Acre',
    'AL': 'Alagoas',
    'AP': 'Amapá',
    'AM': 'Amazonas',
    'BA': 'Bahia',
    'CE': 'Ceará',
    'DF': 'Distrito Federal',
    'ES': 'Espírito Santo',
    'GO': 'Goiás',
    'MA': 'Maranhão',
    'MT': 'Mato Grosso',
    'MS': 'Mato Grosso do Sul',
    'MG': 'Minas Gerais',
    'PA': 'Pará',
    'PB': 'Paraíba',
    'PR': 'Paraná',
    'PE': 'Pernambuco',
    'PI': 'Piauí',
    'RJ': 'Rio de Janeiro',
    'RN': 'Rio Grande do Norte',
    'RS': 'Rio Grande do Sul',
    'RO': 'Rondônia',
    'RR': 'Roraima',
    'SC': 'Santa Catarina',
    'SP': 'São Paulo',
    'SE': 'Sergipe',
    'TO': 'Tocantins'
};


// ============================================================
// OBTÉM O IP REAL DO VISITANTE
// ============================================================

function obterIp(req) {
    const rawIp =
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        '';

    return rawIp.split(',')[0].trim() || 'N/A';
}


// ============================================================
// VERIFICA SE O IP É VÁLIDO PARA CONSULTA EXTERNA
// ============================================================

function ipValido(ip) {
    return (
        ip &&
        ip !== 'N/A' &&
        ip !== '127.0.0.1' &&
        ip !== '::1' &&
        !ip.startsWith('192.168.') &&
        !ip.startsWith('10.') &&
        !ip.startsWith('172.16.') &&
        !ip.startsWith('172.17.') &&
        !ip.startsWith('172.18.') &&
        !ip.startsWith('172.19.') &&
        !ip.startsWith('172.20.') &&
        !ip.startsWith('172.21.') &&
        !ip.startsWith('172.22.') &&
        !ip.startsWith('172.23.') &&
        !ip.startsWith('172.24.') &&
        !ip.startsWith('172.25.') &&
        !ip.startsWith('172.26.') &&
        !ip.startsWith('172.27.') &&
        !ip.startsWith('172.28.') &&
        !ip.startsWith('172.29.') &&
        !ip.startsWith('172.30.') &&
        !ip.startsWith('172.31.')
    );
}


// ============================================================
// OBTÉM LOCALIZAÇÃO DO VISITANTE
// ============================================================

async function obterLocalizacao(req) {

    // IP
    const ip = obterIp(req);

    // País fornecido pela infraestrutura da Vercel
    const siglaPais =
        req.headers['x-vercel-ip-country'] || 'N/A';

    // Região/estado fornecido pela Vercel
    const siglaRegiao =
        req.headers['x-vercel-ip-country-region'] || 'N/A';

    // Cidade fornecida pela Vercel
    let cidade = 'Não Identificada';

    if (req.headers['x-vercel-ip-city']) {
        try {
            cidade = decodeURIComponent(
                req.headers['x-vercel-ip-city']
            );
        } catch {
            cidade = req.headers['x-vercel-ip-city'];
        }
    }

    // Estado
    let estado =
        siglaPais === 'BR' && estadosBrasil[siglaRegiao]
            ? estadosBrasil[siglaRegiao]
            : siglaRegiao;

    // País
    let pais = 'Não Identificado';

    if (siglaPais !== 'N/A') {
        try {
            pais =
                tradutorPais.of(siglaPais) ||
                siglaPais;
        } catch {
            pais = siglaPais;
        }
    }

    // ========================================================
    // CONSULTA EXTERNA PARA COMPLEMENTAR CIDADE/ESTADO/PAÍS
    // ========================================================

    if (ipValido(ip)) {

        try {

            const controller = new AbortController();

            const timeoutId = setTimeout(() => {
                controller.abort();
            }, 2000);

            const resposta = await fetch(
                `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,countryCode&lang=pt-BR`,
                {
                    signal: controller.signal
                }
            );

            clearTimeout(timeoutId);

            const dados = await resposta.json();

            if (dados.status === 'success') {

                cidade =
                    dados.city ||
                    cidade;

                estado =
                    dados.regionName ||
                    estado;

                pais =
                    dados.country ||
                    pais;

                // Para o redirecionamento usamos o código do país
                // retornado pela API externa quando disponível.
                if (dados.countryCode) {
                    return {
                        ip,
                        codigoPais: dados.countryCode.toUpperCase(),
                        pais,
                        cidade,
                        estado
                    };
                }
            }

        } catch (erroGeo) {

            console.error(
                'Consulta externa de geolocalização falhou. Utilizando dados da Vercel:',
                erroGeo.message
            );
        }
    }

    // Retorno usando os dados da Vercel
    return {
        ip,
        codigoPais:
            siglaPais !== 'N/A'
                ? siglaPais.toUpperCase()
                : null,
        pais,
        cidade,
        estado
    };
}


// ============================================================
// REGISTRA VISITA NA PLANILHA
// ============================================================

async function registrarVisita(
    req,
    localizacao,
    nomeSite
) {

    // Idioma
    const rawLang =
        req.headers['accept-language'] || '';

    const idioma =
        rawLang
            ? rawLang.split(',')[0].trim()
            : 'Não Identificado';

    // User Agent
    const userAgent =
        req.headers['user-agent'] || '';

    // Tipo de dispositivo
    const ehCelular =
        /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
            .test(userAgent);

    const tipoDispositivo =
        userAgent
            ? (ehCelular
                ? 'Celular'
                : 'Computador')
            : 'Não Identificado';

    // Origem
    const origem =
        req.headers['referer'] ||
        'Acesso Direto';

    // Data/hora de São Paulo
    const dataHoraSP =
        new Date().toLocaleString(
            'pt-BR',
            {
                timeZone: 'America/Sao_Paulo'
            }
        );

    try {

        const serviceAccountAuth =
            new JWT({
                email:
                    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,

                key:
                    process.env.GOOGLE_PRIVATE_KEY
                        .replace(/\\n/g, '\n'),

                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets'
                ]
            });

        const doc =
            new GoogleSpreadsheet(
                process.env.GOOGLE_SHEET_ID,
                serviceAccountAuth
            );

        await doc.loadInfo();

        const sheet =
            doc.sheetsByIndex[0];

        // ====================================================
        // IMPORTANTE:
        // MANTÉM EXATAMENTE AS MESMAS COLUNAS
        // ====================================================

        await sheet.addRow({

            'Site':
                nomeSite,

            'Data Abertura':
                dataHoraSP,

            'IP':
                localizacao.ip,

            'Cidade':
                localizacao.cidade,

            'Estado':
                localizacao.estado,

            'País':
                localizacao.pais,

            'Idioma':
                idioma,

            'Tipo Dispositivo':
                tipoDispositivo,

            'Origem':
                origem,

            'Dispositivo':
                userAgent ||
                'Não Identificado'
        });

    } catch (error) {

        console.error(
            'Erro ao registrar visita na planilha:',
            error.message
        );
    }
}


// ============================================================
// /api/imagem
//
// ESTA É A ROTA ANTIGA.
// NÃO MUDE A URL DOS SEUS SITES ANTIGOS.
//
// Exemplo:
// /api/imagem?site=Stelle
// /api/imagem?site=OutroSite
// ============================================================

app.get('/api/imagem', async (req, res) => {

    const nomeSite =
        req.query.t ||
        req.query.site ||
        'Site Indefinido';

    // Obtém localização
    const localizacao =
        await obterLocalizacao(req);

    // Registra na planilha
    await registrarVisita(
        req,
        localizacao,
        nomeSite
    );

    // Pixel 1x1 transparente
    const pixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64'
    );

    res.setHeader(
        'Content-Type',
        'image/png'
    );

    res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    return res
        .status(200)
        .send(pixel);
});


// ============================================================
// /api/go
//
// NOVA ROTA PARA REDIRECIONAMENTO POR PAÍS
//
// Exemplo:
//
// /api/go?product=akemi-coffee-boost&site=Stelle
//
// ============================================================

app.get('/api/go', async (req, res) => {

    const product =
        String(
            req.query.product || ''
        )
        .trim()
        .toLowerCase();

    // site é recebido para identificar a campanha/site,
    // mas NÃO é necessário para escolher a oferta.
    const nomeSite =
        String(
            req.query.site || ''
        )
        .trim();

    console.log(
        `Redirecionamento solicitado. Produto: ${product} | Site: ${nomeSite || 'Não informado'}`
    );

    // ========================================================
    // VERIFICA SE O PRODUTO EXISTE
    // ========================================================

    const produto =
        produtos[product];

    if (!produto) {

        console.log(
            `Produto não configurado: ${product}. Enviando para fallback.`
        );

        return res.redirect(
            302,
            destinoPadrao
        );
    }

    // ========================================================
    // IDENTIFICA O PAÍS
    // ========================================================

    const localizacao =
        await obterLocalizacao(req);

    const codigoPais =
        localizacao.codigoPais;

    console.log(
        `País identificado: ${codigoPais || 'Não identificado'}`
    );

    // ========================================================
    // PROCURA A OFERTA DO PAÍS
    // ========================================================

    const destino =
        codigoPais
            ? produto.paises[codigoPais]
            : null;

    // ========================================================
    // SE NÃO HOUVER OFERTA:
    // GOOGLE BRASIL
    // ========================================================

    if (!destino) {

        console.log(
            `Nenhuma oferta configurada para ${codigoPais || 'país desconhecido'} no produto ${product}. Fallback.`
        );

        return res.redirect(
            302,
            destinoPadrao
        );
    }

    // ========================================================
    // REDIRECIONAMENTO
    // ========================================================

    console.log(
        `Redirecionando ${codigoPais} para: ${destino}`
    );

    return res.redirect(
        302,
        destino
    );
});


// ============================================================
// ROTA RAIZ
// ============================================================

app.get('/', (req, res) => {

    res.status(200).send(
        'Servidor de tracking e redirecionamento funcionando.'
    );
});


// ============================================================
// EXPORTAÇÃO PARA A VERCEL
// ============================================================

module.exports = app;
