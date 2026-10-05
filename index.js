const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require('crypto');

const app = express();


/*
|--------------------------------------------------------------------------
| CONFIGURAÇÃO DOS PRODUTOS
|--------------------------------------------------------------------------
*/

const produtos = {

    'akemi-coffee-boost': {

        default: 'https://www.google.com.br/',

        paises: {
            US: 'https://www.pixlbonk.com/L1HDNH9/9MLGPC5/',
            CA: 'https://www.pixlbonk.com/L1HDNH9/9MLGPC5/',
            AU: 'https://www.treejammer.com/L1HDNH9/9KCZZ7S/'
        }

    },


    'vitaslimex': {

        default: 'https://www.google.com.br/',

        paises: {
            FR: 'https://www.pixlbonk.com/L1HDNH9/992NJKS/',
            CH: 'https://www.pixlbonk.com/L1HDNH9/992NJKS/',
            BE: 'https://www.pixlbonk.com/L1HDNH9/992NJKS/',
            ES: 'https://www.pixlbonk.com/L1HDNH9/698ABCD/'
        }

    }

};


/*
|--------------------------------------------------------------------------
| FALLBACK DE SEGURANÇA
|--------------------------------------------------------------------------
*/

const fallbackSistema =
    'https://www.google.com.br/';


/*
|--------------------------------------------------------------------------
| TRADUTOR DE PAÍSES
|--------------------------------------------------------------------------
*/

const tradutorPais =
    new Intl.DisplayNames(
        ['pt-BR'],
        {
            type: 'region'
        }
    );


/*
|--------------------------------------------------------------------------
| ESTADOS DO BRASIL
|--------------------------------------------------------------------------
*/

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


/*
|--------------------------------------------------------------------------
| OBTÉM IP
|--------------------------------------------------------------------------
*/

function obterIp(req) {

    const rawIp =
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        '';

    const ip =
        rawIp
            .split(',')[0]
            .trim();

    return ip || 'N/A';
}


/*
|--------------------------------------------------------------------------
| VERIFICA IP
|--------------------------------------------------------------------------
*/

function ipValido(ip) {

    if (!ip || ip === 'N/A') {
        return false;
    }

    if (ip === '127.0.0.1') {
        return false;
    }

    if (ip === '::1') {
        return false;
    }

    if (ip.startsWith('192.168.')) {
        return false;
    }

    if (ip.startsWith('10.')) {
        return false;
    }

    if (
        ip.startsWith('172.16.') ||
        ip.startsWith('172.17.') ||
        ip.startsWith('172.18.') ||
        ip.startsWith('172.19.') ||
        ip.startsWith('172.20.') ||
        ip.startsWith('172.21.') ||
        ip.startsWith('172.22.') ||
        ip.startsWith('172.23.') ||
        ip.startsWith('172.24.') ||
        ip.startsWith('172.25.') ||
        ip.startsWith('172.26.') ||
        ip.startsWith('172.27.') ||
        ip.startsWith('172.28.') ||
        ip.startsWith('172.29.') ||
        ip.startsWith('172.30.') ||
        ip.startsWith('172.31.')
    ) {
        return false;
    }

    return true;
}


/*
|--------------------------------------------------------------------------
| OBTÉM LOCALIZAÇÃO
|--------------------------------------------------------------------------
*/

async function obterLocalizacao(req) {

    const ip =
        obterIp(req);


    const siglaPais =
        req.headers['x-vercel-ip-country'] ||
        'N/A';


    const siglaRegiao =
        req.headers['x-vercel-ip-country-region'] ||
        'N/A';


    let cidade =
        'Não Identificada';


    if (req.headers['x-vercel-ip-city']) {

        try {

            cidade =
                decodeURIComponent(
                    req.headers['x-vercel-ip-city']
                );

        } catch {

            cidade =
                req.headers['x-vercel-ip-city'];

        }

    }


    let estado =
        siglaRegiao;


    if (
        siglaPais === 'BR' &&
        estadosBrasil[siglaRegiao]
    ) {

        estado =
            estadosBrasil[siglaRegiao];

    }


    let pais =
        'Não Identificado';


    if (siglaPais !== 'N/A') {

        try {

            pais =
                tradutorPais.of(siglaPais) ||
                siglaPais;

        } catch {

            pais =
                siglaPais;

        }

    }


    /*
    |--------------------------------------------------------------------------
    | CONSULTA IP-API
    |--------------------------------------------------------------------------
    */

    if (ipValido(ip)) {

        try {

            const controller =
                new AbortController();


            const timeoutId =
                setTimeout(
                    () => controller.abort(),
                    2000
                );


            const resposta =
                await fetch(
                    `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city&lang=pt-BR`,
                    {
                        signal: controller.signal
                    }
                );


            clearTimeout(timeoutId);


            const dados =
                await resposta.json();


            if (dados.status === 'success') {

                if (dados.city) {
                    cidade = dados.city;
                }


                if (dados.regionName) {
                    estado = dados.regionName;
                }


                if (dados.country) {
                    pais = dados.country;
                }


                if (dados.countryCode) {

                    return {

                        ip:
                            ip,

                        codigoPais:
                            dados.countryCode.toUpperCase(),

                        pais:
                            pais,

                        cidade:
                            cidade,

                        estado:
                            estado

                    };

                }

            }

        } catch (erroGeo) {

            console.error(
                'Consulta externa de geolocalizacao falhou:',
                erroGeo.message
            );

        }

    }


    return {

        ip:
            ip,

        codigoPais:
            siglaPais !== 'N/A'
                ? siglaPais.toUpperCase()
                : 'N/A',

        pais:
            pais,

        cidade:
            cidade,

        estado:
            estado

    };

}


/*
|--------------------------------------------------------------------------
| AUTENTICAÇÃO GOOGLE
|--------------------------------------------------------------------------
*/

function criarAutenticacaoGoogle() {

    return new JWT({

        email:
            process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,

        key:
            process.env.GOOGLE_PRIVATE_KEY
                .replace(/\\n/g, '\n'),

        scopes: [
            'https://www.googleapis.com/auth/spreadsheets'
        ]

    });

}


/*
|--------------------------------------------------------------------------
| OBTÉM PLANILHA
|--------------------------------------------------------------------------
*/

async function obterPlanilha() {

    const auth =
        criarAutenticacaoGoogle();


    const doc =
        new GoogleSpreadsheet(
            process.env.GOOGLE_SHEET_ID,
            auth
        );


    await doc.loadInfo();


    return doc.sheetsByIndex[0];

}


/*
|--------------------------------------------------------------------------
| REGISTRA VISITA
|--------------------------------------------------------------------------
*/

async function registrarVisita({

    site,
    ip,
    cidade,
    estado,
    pais,
    idioma,
    tipoDispositivo,
    origem,
    userAgent,
    visitId

}) {

    try {

        const sheet =
            await obterPlanilha();


        await sheet.addRow({

            'Site':
                site,

            'Data Abertura':
                new Date().toLocaleString(
                    'pt-BR',
                    {
                        timeZone:
                            'America/Sao_Paulo'
                    }
                ),

            'IP':
                ip,

            'Cidade':
                cidade,

            'Estado':
                estado,

            'País':
                pais,

            'Idioma':
                idioma,

            'Tipo Dispositivo':
                tipoDispositivo,

            'Origem':
                origem,

            'Dispositivo':
                userAgent ||
                'Não Identificado',

            'ID Visita':
                visitId,

            'Tempo na Página (segundos)':
                ''

        });


        return true;

    } catch (error) {

        console.error(
            'Erro ao registrar visita na planilha:',
            error.message
        );

        return false;

    }

}


/*
|--------------------------------------------------------------------------
| /api/imagem
|--------------------------------------------------------------------------
*/

app.get('/api/imagem', async (req, res) => {

    const nomeSite =
        req.query.site ||
        req.query.t ||
        'Site Indefinido';


    const visitId =
        String(
            req.query.visitId ||
            crypto.randomUUID()
        );


    const localizacao =
        await obterLocalizacao(req);


    const rawLang =
        req.headers['accept-language'] ||
        '';


    const idioma =
        rawLang
            ? rawLang.split(',')[0].trim()
            : 'Não Identificado';


    const userAgent =
        req.headers['user-agent'] ||
        '';


    const ehCelular =
        /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
            .test(userAgent);


    const tipoDispositivo =
        userAgent
            ? (
                ehCelular
                    ? 'Celular'
                    : 'Computador'
            )
            : 'Não Identificado';


    const origem =
        req.headers['referer'] ||
        'Acesso Direto';


    await registrarVisita({

        site:
            nomeSite,

        ip:
            localizacao.ip,

        cidade:
            localizacao.cidade,

        estado:
            localizacao.estado,

        pais:
            localizacao.pais,

        idioma:
            idioma,

        tipoDispositivo:
            tipoDispositivo,

        origem:
            origem,

        userAgent:
            userAgent,

        visitId:
            visitId

    });


    const pixel =
        Buffer.from(
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


/*
|--------------------------------------------------------------------------
| /api/tempo
|--------------------------------------------------------------------------
|
| ATUALIZA A MESMA LINHA DA VISITA
|--------------------------------------------------------------------------
*/

app.get('/api/tempo', async (req, res) => {

    const visitId =
        String(
            req.query.visitId ||
            ''
        ).trim();


    const tempo =
        Number(
            req.query.tempo
        );


    if (
        !visitId ||
        !Number.isFinite(tempo) ||
        tempo < 0
    ) {

        return res
            .status(400)
            .send('Dados inválidos.');

    }


    const tempoSeguro =
        Math.min(
            Math.round(tempo),
            604800
        );


    /*
    |--------------------------------------------------------------------------
    | TENTA LOCALIZAR A LINHA
    |--------------------------------------------------------------------------
    |
    | Até 5 tentativas.
    |
    */

    const maxTentativas = 5;


    for (
        let tentativa = 1;
        tentativa <= maxTentativas;
        tentativa++
    ) {

        try {

            const sheet =
                await obterPlanilha();


            const rows =
                await sheet.getRows();


            const linha =
                rows.find(
                    row =>
                        String(
                            row['ID Visita'] || ''
                        ) === visitId
                );


            /*
            |--------------------------------------------------------------------------
            | ENCONTROU
            |--------------------------------------------------------------------------
            */

            if (linha) {

                linha['Tempo na Página (segundos)'] =
                    tempoSeguro;


                await linha.save();


                console.log(
                    `Tempo atualizado: ${tempoSeguro}s | Visita: ${visitId}`
                );


                return res
                    .status(200)
                    .send('OK');

            }


            /*
            |--------------------------------------------------------------------------
            | NÃO ENCONTROU
            |--------------------------------------------------------------------------
            */

            console.log(
                `Visita ainda não encontrada. Tentativa ${tentativa}/${maxTentativas}`
            );


        } catch (error) {

            console.error(
                `Erro ao atualizar tempo. Tentativa ${tentativa}:`,
                error.message
            );

        }


        /*
        |--------------------------------------------------------------------------
        | Espera antes da próxima tentativa
        |--------------------------------------------------------------------------
        */

        if (tentativa < maxTentativas) {

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        700
                    )
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | NÃO ENCONTROU APÓS TODAS AS TENTATIVAS
    |--------------------------------------------------------------------------
    */

    console.error(
        `Não foi possível localizar a visita: ${visitId}`
    );


    return res
        .status(404)
        .send('Visita não encontrada.');

});


/*
|--------------------------------------------------------------------------
| /api/go
|--------------------------------------------------------------------------
*/

app.get('/api/go', async (req, res) => {

    const product =
        String(
            req.query.product ||
            ''
        )
        .trim()
        .toLowerCase();


    const nomeSite =
        String(
            req.query.site ||
            product ||
            'Clique'
        )
        .trim();


    const localizacao =
        await obterLocalizacao(req);


    const rawLang =
        req.headers['accept-language'] ||
        '';


    const idioma =
        rawLang
            ? rawLang.split(',')[0].trim()
            : 'Não Identificado';


    const userAgent =
        req.headers['user-agent'] ||
        '';


    const ehCelular =
        /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
            .test(userAgent);


    const tipoDispositivo =
        userAgent
            ? (
                ehCelular
                    ? 'Celular'
                    : 'Computador'
            )
            : 'Não Identificado';


    const origem =
        req.headers['referer'] ||
        'Acesso Direto';


    await registrarVisita({

        site:
            nomeSite,

        ip:
            localizacao.ip,

        cidade:
            localizacao.cidade,

        estado:
            localizacao.estado,

        pais:
            localizacao.pais,

        idioma:
            idioma,

        tipoDispositivo:
            tipoDispositivo,

        origem:
            origem,

        userAgent:
            userAgent,

        visitId:
            crypto.randomUUID()

    });


    const produto =
        produtos[product];


    if (!produto) {

        console.error(
            `Produto não encontrado: ${product}`
        );


        return res.redirect(
            302,
            fallbackSistema
        );

    }


    const destino =
        produto.paises[
            localizacao.codigoPais
        ] ||
        produto.default;


    return res.redirect(
        302,
        destino
    );

});


/*
|--------------------------------------------------------------------------
| ROTA PRINCIPAL
|--------------------------------------------------------------------------
*/

app.get('/', (req, res) => {

    return res
        .status(200)
        .send(
            'Servidor de rastreamento e redirecionamento online.'
        );

});


/*
|--------------------------------------------------------------------------
| EXPORTAÇÃO
|--------------------------------------------------------------------------
*/

module.exports = app;
