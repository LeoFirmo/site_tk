const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();

/*
|--------------------------------------------------------------------------
| CONFIGURAÇÃO DOS PRODUTOS
|--------------------------------------------------------------------------
|
| Cada produto possui:
|
| default: destino usado quando o país não estiver configurado.
|
| paises: destinos específicos por país.
|
| IMPORTANTE:
| Para mudar o default de um produto, altere SOMENTE a linha "default".
|
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
| FALLBACK DE SEGURANÇA DO SISTEMA
|--------------------------------------------------------------------------
|
| Isso NÃO é o default dos produtos.
|
| É usado somente se alguém chamar /api/go sem um produto válido.
|
*/

const fallbackSistema = 'https://www.google.com.br/';


/*
|--------------------------------------------------------------------------
| TRADUTOR DE PAÍSES
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
| OBTÉM O IP DO VISITANTE
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
| VERIFICA SE O IP É VÁLIDO PARA CONSULTA EXTERNA
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

    if (ip.startsWith('172.16.') ||
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
        ip.startsWith('172.31.')) {

        return false;
    }

    return true;
}


/*
|--------------------------------------------------------------------------
| OBTÉM LOCALIZAÇÃO DO VISITANTE
|--------------------------------------------------------------------------
|
| Primeiro tenta os cabeçalhos da Vercel.
|
| Depois tenta complementar os dados através do ip-api.
|
*/

async function obterLocalizacao(req) {

    const ip = obterIp(req);

    /*
    |--------------------------------------------------------------------------
    | Dados da Vercel
    |--------------------------------------------------------------------------
    */

    const siglaPais =
        req.headers['x-vercel-ip-country'] ||
        'N/A';

    const siglaRegiao =
        req.headers['x-vercel-ip-country-region'] ||
        'N/A';


    /*
    |--------------------------------------------------------------------------
    | Cidade
    |--------------------------------------------------------------------------
    */

    let cidade = 'Não Identificada';

    if (req.headers['x-vercel-ip-city']) {

        try {

            cidade = decodeURIComponent(
                req.headers['x-vercel-ip-city']
            );

        } catch {

            cidade =
                req.headers['x-vercel-ip-city'];

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Estado
    |--------------------------------------------------------------------------
    */

    let estado = siglaRegiao;

    if (
        siglaPais === 'BR' &&
        estadosBrasil[siglaRegiao]
    ) {

        estado =
            estadosBrasil[siglaRegiao];

    }


    /*
    |--------------------------------------------------------------------------
    | País
    |--------------------------------------------------------------------------
    */

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


    /*
    |--------------------------------------------------------------------------
    | Consulta externa pelo IP
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


            const resposta = await fetch(
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

                    cidade =
                        dados.city;

                }


                if (dados.regionName) {

                    estado =
                        dados.regionName;

                }


                if (dados.country) {

                    pais =
                        dados.country;

                }


                /*
                |--------------------------------------------------------------------------
                | O código do país retornado pelo ip-api
                |--------------------------------------------------------------------------
                */

                if (dados.countryCode) {

                    return {
                        ip: ip,
                        codigoPais: dados.countryCode.toUpperCase(),
                        pais: pais,
                        cidade: cidade,
                        estado: estado
                    };

                }

            }

        } catch (erroGeo) {

            console.error(
                'Consulta externa de geolocalizacao falhou, utilizando dados da Vercel:',
                erroGeo.message
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Retorna os dados da Vercel caso a consulta externa falhe
    |--------------------------------------------------------------------------
    */

    return {
        ip: ip,
        codigoPais:
            siglaPais !== 'N/A'
                ? siglaPais.toUpperCase()
                : 'N/A',

        pais: pais,
        cidade: cidade,
        estado: estado
    };

}


/*
|--------------------------------------------------------------------------
| REGISTRA VISITA NA GOOGLE SHEETS
|--------------------------------------------------------------------------
|
| Mantém exatamente as mesmas colunas:
|
| Site
| Data Abertura
| IP
| Cidade
| Estado
| País
| Idioma
| Tipo Dispositivo
| Origem
| Dispositivo
|
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
    userAgent
}) {

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
                'Não Identificado'
        });


    } catch (error) {

        /*
        |--------------------------------------------------------------------------
        | Se a planilha falhar, NÃO impede o restante da operação.
        |--------------------------------------------------------------------------
        */

        console.error(
            'Erro ao registrar visita na planilha:',
            error.message
        );

    }

}


/*
|--------------------------------------------------------------------------
| /api/imagem
|--------------------------------------------------------------------------
|
| ROTA ANTIGA
|
| Essa rota continua funcionando como antes.
|
| Exemplo:
|
| /api/imagem?site=Stelle
|
*/

app.get('/api/imagem', async (req, res) => {

    const nomeSite =
        req.query.site ||
        req.query.t ||
        'Site Indefinido';


    /*
    |--------------------------------------------------------------------------
    | Localização
    |--------------------------------------------------------------------------
    */

    const localizacao =
        await obterLocalizacao(req);


    /*
    |--------------------------------------------------------------------------
    | Idioma
    |--------------------------------------------------------------------------
    */

    const rawLang =
        req.headers['accept-language'] ||
        '';

    const idioma =
        rawLang
            ? rawLang.split(',')[0].trim()
            : 'Não Identificado';


    /*
    |--------------------------------------------------------------------------
    | Dispositivo
    |--------------------------------------------------------------------------
    */

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


    /*
    |--------------------------------------------------------------------------
    | Origem
    |--------------------------------------------------------------------------
    */

    const origem =
        req.headers['referer'] ||
        'Acesso Direto';


    /*
    |--------------------------------------------------------------------------
    | Registra no Google Sheets
    |--------------------------------------------------------------------------
    */

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
            userAgent
    });


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

});


/*
|--------------------------------------------------------------------------
| /api/go
|--------------------------------------------------------------------------
|
| NOVA ROTA
|
| Exemplo:
|
| /api/go?product=akemi-coffee-boost&site=Akemi-coofe-boost-redireciona
|
| Fluxo:
|
| 1. Descobre o país
| 2. Registra o clique
| 3. Escolhe o destino
| 4. Redireciona
|
*/

app.get('/api/go', async (req, res) => {

    /*
    |--------------------------------------------------------------------------
    | Produto
    |--------------------------------------------------------------------------
    */

    const product =
        String(
            req.query.product ||
            ''
        )
        .trim()
        .toLowerCase();


    /*
    |--------------------------------------------------------------------------
    | Nome que será registrado na planilha
    |--------------------------------------------------------------------------
    */

    const nomeSite =
        String(
            req.query.site ||
            product ||
            'Clique'
        )
        .trim();


    /*
    |--------------------------------------------------------------------------
    | Localização
    |--------------------------------------------------------------------------
    */

    const localizacao =
        await obterLocalizacao(req);


    /*
    |--------------------------------------------------------------------------
    | Idioma
    |--------------------------------------------------------------------------
    */

    const rawLang =
        req.headers['accept-language'] ||
        '';

    const idioma =
        rawLang
            ? rawLang.split(',')[0].trim()
            : 'Não Identificado';


    /*
    |--------------------------------------------------------------------------
    | Dispositivo
    |--------------------------------------------------------------------------
    */

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


    /*
    |--------------------------------------------------------------------------
    | Origem
    |--------------------------------------------------------------------------
    */

    const origem =
        req.headers['referer'] ||
        'Acesso Direto';


    /*
    |--------------------------------------------------------------------------
    | REGISTRA O CLIQUE ANTES DO REDIRECIONAMENTO
    |--------------------------------------------------------------------------
    */

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
            userAgent
    });


    /*
    |--------------------------------------------------------------------------
    | PROCURA O PRODUTO
    |--------------------------------------------------------------------------
    */

    const produto =
        produtos[product];


    /*
    |--------------------------------------------------------------------------
    | PRODUTO NÃO EXISTE
    |--------------------------------------------------------------------------
    |
    | Usa apenas o fallback de segurança do sistema.
    |
    */

    if (!produto) {

        console.error(
            `Produto não encontrado: ${product}`
        );


        return res.redirect(
            302,
            fallbackSistema
        );

    }


    /*
    |--------------------------------------------------------------------------
    | ESCOLHE O DESTINO
    |--------------------------------------------------------------------------
    |
    | 1. País configurado
    | 2. Default do próprio produto
    |
    */

    const destino =
        produto.paises[
            localizacao.codigoPais
        ] ||
        produto.default;


    /*
    |--------------------------------------------------------------------------
    | REDIRECIONAMENTO
    |--------------------------------------------------------------------------
    */

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

    return res.status(200).send(
        'Servidor de rastreamento e redirecionamento online.'
    );

});


/*
|--------------------------------------------------------------------------
| EXPORTAÇÃO
|--------------------------------------------------------------------------
*/

module.exports = app;
