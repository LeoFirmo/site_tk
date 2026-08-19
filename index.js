const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();

app.get('/api/imagem', async (req, res) => {
    // Parâmetros reduzidos conforme sua solicitação
    const { e, timeD, t, AK, AH, AD } = req.query;
    
    let linkFinal = null;

    // Lógica de montagem de Links
    if (AK) {
        // Kiwify: Base + Parâmetro enviado
        linkFinal = `https://pay.kiwify.com.br/${AK}`;
    } else if (AH) {
        // Hotmart: Base + ID enviado
        linkFinal = `https://go.hotmart.com/${AH}`;
    } else if (AD) {
        // Digistore24: Base enviada + seu ID fixo de afiliado
        // Removemos uma possível barra no final para padronizar antes de anexar o ID
        const baseUrl = AD.endsWith('/') ? AD.slice(0, -1) : AD;
        linkFinal = `${baseUrl}#aff=leofirmo`;
    }

    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    const agora = Date.now();
    const momentoDisparo = Number(timeD);
    const diferencaSegundos = (agora - momentoDisparo) / 1000;

    // Anti-bot apenas para abertura (quando não há link de redirecionamento)
    if (!linkFinal && !isNaN(momentoDisparo) && diferencaSegundos < 30) {
        console.log(`🤖 Bot detectado: ${e}`);
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

        // Registro na planilha com a coluna 'Link clicado'
        await sheet.addRow({
            'Email': e || 'N/A',
            'Horário Disparo': disparoLegivel,
            'Data Abertura': new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            'Assunto': t || 'Sem Assunto',
            'Link clicado': linkFinal || '' 
        });

    } catch (error) {
        console.error('❌ Erro no Sheets:', error.message);
    } finally {
        if (linkFinal) {
            // Redireciona para o link de afiliado montado
            return res.redirect(linkFinal);
        }

        if (!res.headersSent) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.status(200).send(pixel);
        }
    }
});

module.exports = app;
