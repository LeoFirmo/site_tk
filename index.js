const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();

app.get('/api/imagem', async (req, res) => {
    const { e, timeD, t, AK, AH, AD } = req.query;

    // 1. Extração do IP real do visitante
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ip = rawIp.split(',')[0].trim() || 'N/A';

    // 2. Extração dos dados de geolocalização via cabeçalhos da Vercel
    const pais = req.headers['x-vercel-ip-country'] || 'N/A';
    const estado = req.headers['x-vercel-ip-country-region'] || 'N/A';
    const cidade = req.headers['x-vercel-ip-city']
        ? decodeURIComponent(req.headers['x-vercel-ip-city'])
        : 'N/A';

    // 3. Informações de contexto (origem do site e navegador/dispositivo)
    const origem = req.headers['referer'] || 'Acesso Direto';
    const dispositivo = req.headers['user-agent'] || 'N/A';

    let linkFinal = null;

    // Lógica de montagem de Links de redirecionamento (caso usado em cliques)
    if (AK) {
        linkFinal = `https://pay.kiwify.com.br/${AK}`;
    } else if (AH) {
        linkFinal = `https://go.hotmart.com/${AH}`;
    } else if (AD) {
        const baseUrl = AD.endsWith('/') ? AD.slice(0, -1) : AD;
        linkFinal = `${baseUrl}#aff=leofirmo`;
    }

    // Pixel transparente de 1x1 em formato PNG
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    const agora = Date.now();
    const momentoDisparo = Number(timeD);
    const diferencaSegundos = (agora - momentoDisparo) / 1000;

    // Filtro anti-robô para aberturas imediatas em disparos de e-mail
    if (!linkFinal && !isNaN(momentoDisparo) && diferencaSegundos < 30) {
        console.log(`Robô detectado: ${e}`);
        res.setHeader('Content-Type', 'image/png');
        return res.status(200).send(pixel);
    }

    try {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];

        const disparoLegivel = !isNaN(momentoDisparo)
            ? new Date(momentoDisparo).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : 'N/A';

        const dataAberturaSaoPaulo = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        // Gravação dos dados na planilha
        await sheet.addRow({
            'Email': e || 'N/A',
            'Horário Disparo': disparoLegivel,
            'Data Abertura': dataAberturaSaoPaulo,
            'Assunto': t || 'Acesso Direto ao Site',
            'Link clicado': linkFinal || '',
            'IP': ip,
            'Cidade': cidade,
            'Estado': estado,
            'País': pais,
            'Origem': origem,
            'Dispositivo': dispositivo
        });

    } catch (error) {
        console.error('Erro ao registrar no Google Sheets:', error.message);
    } finally {
        if (linkFinal) {
            return res.redirect(linkFinal);
        }

        if (!res.headersSent) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            return res.status(200).send(pixel);
        }
    }
});

module.exports = app;
