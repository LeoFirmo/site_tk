
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();


/*
|--------------------------------------------------------------------------
| CONFIGURAÇÃO DOS PRODUTOS
|--------------------------------------------------------------------------
|
| Aqui você cadastra os produtos e as ofertas de cada país.
|
| O código do país segue ISO 3166-1:
|
| US = Estados Unidos
| CA = Canadá
| AU = Austrália
| FR = França
| CH = Suíça
| BE = Bélgica
| ES = Espanha
|
|--------------------------------------------------------------------------
*/

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


/*
|--------------------------------------------------------------------------
| DESTINO PADRÃO
|--------------------------------------------------------------------------
|
| Caso:
|
| - país não seja identificado;
| - país não tenha oferta;
| - produto não exista;
| - API de geolocalização falhe;
|
|--------------------------------------------------------------------------
*/

const destinoPadrao = 'https://www.google.com.br/';


/*
|--------------------------------------------------------------------------
| TRADUTOR DE PAÍS
|--------------------------------------------------------------------------
*/

const tradutorPais = new Intl.DisplayNames(
    ['pt-BR'],
    {
        type: 'region'
    }
);


/*
|--------------------------------------------------------------------------
| ESTADOS BRASILEIROS
|--------------------------------------------------------------------------
*/

const estadosBrasil = {

    AC: 'Acre',
    AL: 'Alagoas',
    AP: 'Amapá',
    AM: 'Amazonas',
    BA: 'Bahia',
    CE: 'Ceará',
    DF: 'Distrito Federal',
    ES: 'Espírito Santo',
    GO: 'Goiás',
    MA: 'Maranhão',
    MT: 'Mato Grosso',
    MS: 'Mato Grosso do Sul',
    MG: 'Minas Gerais',
    PA: 'Pará',
    PB: 'Paraíba',
    PR: 'Paraná',
    PE: 'Pernambuco',
    PI: 'Piauí',
    RJ: 'Rio de Janeiro',
    RN: 'Rio Grande do Norte',
    RS: 'Rio Grande do Sul',
    RO: 'Rondônia',
    RR: 'Roraima',
    SC: 'Santa Catarina',
    SP: 'São Paulo',
    SE: 'Sergipe',
    TO: 'Tocantins'

};


/*
|--------------------------------------------------------------------------
| OBTÉM O IP
|--------------------------------------------------------------------------
*/

function obterIp(req) {

    const forwarded =
        req.headers['x-forwarded-for'];

    if (forwarded) {

        return forwarded
            .split(',')[0]
            .trim();

    }

    return (
        req.socket?.remoteAddress ||
        'N/A'
    );

}


/*
|--------------------------------------------------------------------------
| VERIFICA SE O IP É VÁLIDO PARA GEOLOCALIZAÇÃO
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

    return true;

}


/*
|--------------------------------------------------------------------------
| OBTÉM INFORMAÇÕES DE LOCALIZAÇÃO
|--------------------------------------------------------------------------
|
| Primeiro utiliza os dados da Vercel.
|
| Depois tenta complementar com ip-api.
|
|--------------------------------------------------------------------------
*/

async function obterLocalizacao(req) {

    const ip = obterIp(req);

    /*
    |--------------------------------------------------------------------------
    | Dados fornecidos pela Vercel
    |--------------------------------------------------------------------------
    */

    let codigoPais =
        req.headers['x-vercel-ip-country'] ||
        'N/A';

    const codigoRegiao =
        req.headers['x-vercel-ip-country-region'] ||
        'N/A';

    let cidade =
        req.headers['x-vercel-ip-city']
            ? decodeURIComponent(
                req.headers['x-vercel-ip-city']
            )
            : 'Não Identificada';


    let estado =
        codigoPais === 'BR' &&
        estadosBrasil[codigoRegiao]
            ? estadosBrasil[codigoRegiao]
            : codigoRegiao;


    /*
    |--------------------------------------------------------------------------
    | Nome do país
    |--------------------------------------------------------------------------
    */

    let pais = 'Não Identificado';

    if (codigoPais !== 'N/A') {

        try {

            pais =
                tradutorPais.of(codigoPais) ||
                codigoPais;

        } catch {

            pais = codigoPais;

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Complemento via IP-API
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
                    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,countryCode&lang=pt-BR`,
                    {
                        signal: controller.signal
                    }
                );


            clearTimeout(timeoutId);


            if (resposta.ok) {

                const dados =
                    await resposta.json();


                if (
                    dados.status === 'success'
                ) {

                    /*
                    |--------------------------------------------------------------------------
                    | Se a Vercel não forneceu país,
                    | utiliza o país retornado pelo IP-API.
                    |--------------------------------------------------------------------------
                    */

                    if (
                        (!codigoPais ||
                        codigoPais === 'N/A') &&
                        dados.countryCode
                    ) {

                        codigoPais =
                            dados.countryCode
                                .toUpperCase();

                    }


                    cidade =
                        dados.city ||
                        cidade;


                    estado =
                        dados.regionName ||
                        estado;


                    pais =
                        dados.country ||
                        pais;

                }

            }

        } catch (erro) {

            console.error(
                'Falha na geolocalização externa:',
                erro.message
            );

        }

    }


    return {

        ip,

        codigoPais:
            codigoPais.toUpperCase(),

        pais,

        cidade,

        estado

    };

}


/*
|--------------------------------------------------------------------------
| REGISTRO NO GOOGLE SHEETS
|--------------------------------------------------------------------------
*/

async function registrarVisita(
    req,
    localizacao,
    nomeSite
) {

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


    const dataHoraSP =
        new Date().toLocaleString(
            'pt-BR',
            {
                timeZone:
                    'America/Sao_Paulo'
            }
        );


    try {

        const serviceAccountAuth =
            new JWT({

                email:
                    process.env
                        .GOOGLE_SERVICE_ACCOUNT_EMAIL,

                key:
                    process.env
                        .GOOGLE_PRIVATE_KEY
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


        /*
        |--------------------------------------------------------------------------
        | Mantém as colunas atuais.
        |--------------------------------------------------------------------------
        */

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


/*
|--------------------------------------------------------------------------
| 1. ENDPOINT DE TRACKING
|--------------------------------------------------------------------------
|
| Este continua funcionando como o seu sistema atual.
|
| Exemplo:
|
| /api/imagem?site=Stelle
|
|--------------------------------------------------------------------------
*/

app.get(
    '/api/imagem',
    async (req, res) => {

        const nomeSite =
            req.query.t ||
            req.query.site ||
            'Site Indefinido';


        const localizacao =
            await obterLocalizacao(req);


        await registrarVisita(
            req,
            localizacao,
            nomeSite
        );


        /*
        |--------------------------------------------------------------------------
        | Pixel 1x1 transparente
        |--------------------------------------------------------------------------
        */

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

    }
);


/*
|--------------------------------------------------------------------------
| 2. ENDPOINT DE REDIRECIONAMENTO
|--------------------------------------------------------------------------
|
| Exemplo:
|
| /api/go?product=akemi-coffee-boost&site=Stelle
|
|--------------------------------------------------------------------------
*/

app.get(
    '/api/go',
    async (req, res) => {

        /*
        |--------------------------------------------------------------------------
        | Produto solicitado
        |--------------------------------------------------------------------------
        */

        const produtoId =
            String(
                req.query.product ||
                ''
            )
            .trim()
            .toLowerCase();


        /*
        |--------------------------------------------------------------------------
        | Nome do site/campanha
        |--------------------------------------------------------------------------
        */

        const nomeSite =
            req.query.site ||
            'Site Indefinido';


        /*
        |--------------------------------------------------------------------------
        | Busca o produto
        |--------------------------------------------------------------------------
        */

        const produto =
            produtos[produtoId];


        /*
        |--------------------------------------------------------------------------
        | Produto inexistente
        |--------------------------------------------------------------------------
        */

        if (!produto) {

            console.error(
                `Produto não encontrado: ${produtoId}`
            );

            return res.redirect(
                302,
                destinoPadrao
            );

        }


        /*
        |--------------------------------------------------------------------------
        | Descobre o país
        |--------------------------------------------------------------------------
        */

        const localizacao =
            await obterLocalizacao(req);


        const codigoPais =
            localizacao.codigoPais;


        /*
        |--------------------------------------------------------------------------
        | Busca a oferta daquele país
        |--------------------------------------------------------------------------
        */

        const destino =
            produto.paises[codigoPais] ||
            destinoPadrao;


        /*
        |--------------------------------------------------------------------------
        | REDIRECIONAMENTO
        |--------------------------------------------------------------------------
        */

        return res.redirect(
            302,
            destino
        );

    }
);


/*
|--------------------------------------------------------------------------
| EXPORTAÇÃO
|--------------------------------------------------------------------------
*/

module.exports = app;

