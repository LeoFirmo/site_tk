const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();

app.get('/api/imagem', async (req, res) => {
    // Permite passar o nome do site tanto por ?t= quanto por ?site=
    const nomeSite = req.query.t || req.query.site || 'Site Indefinido';

    // 1. Captura de IP e Geolocalizacao (Vercel)
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ip = rawIp.split(',')[0].trim() || 'N/A';
    const pais = req.headers['x-vercel-ip-country'] || 'N/A';
    const estado = req.headers['x-vercel-ip-country-region'] || 'N/A';
    const cidade = req.headers['x-vercel-ip-city']
        ? decodeURIComponent(req.headers['x-vercel-ip-city'])
        : 'N/A';

    // 2. Metadados do Acesso
    const origem = req.headers['referer'] || 'Acesso Direto';
    const dispositivo = req.headers['user-agent'] || 'N/A';
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

        // Registro na planilha com as colunas exatas solicitadas
        await sheet.addRow({
            'Site': nomeSite,
            'Data Abertura': dataHoraSP,
            'IP': ip,
            'Cidade': cidade,
            'Estado': estado,
            'País': pais,
            'Origem': origem,
            'Dispositivo': dispositivo
        });

    } catch (error) {
        console.error('Erro ao registrar visita:', error.message);
    } finally {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        return res.status(200).send(pixel);
    }
});

module.exports = app;
