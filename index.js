const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const crypto = require('crypto');

const app = express();

/*
|--------------------------------------------------------------------------
| MIDDLEWARE
|--------------------------------------------------------------------------
*/

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


/*
|--------------------------------------------------------------------------
| CONFIGURAÇÃO DOS PRODUTOS
|--------------------------------------------------------------------------
|
| Cada produto possui seu próprio fallback.
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
| FALLBACK DE EMERGÊNCIA
|--------------------------------------------------------------------------
|
| Usado somente se o produto informado não existir.
|
*/

const fallbackSistema = 'https://www.google.com.br/';


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

    return rawIp
        .split(',')[0]
        .trim() || 'N/A';

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
| OBTÉM LOCALIZAÇÃO
|--------------------------------------------------------------------------
*/

async function obterLocalizacao(req, ip) {

    /*
     * Primeiro tenta os cabeçalhos da Vercel.
     */

    const codigoPais =
        req.headers['x-vercel-ip-country'] || 'N/A';

    const codigoRegiao =
        req.headers['x-vercel-ip-country-region'] || 'N/A';

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
     * Depois tenta uma consulta externa para melhorar
     * cidade, estado e país.
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
                `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,countryCode&lang=pt-BR`,
                {
                    signal: controller.signal
                }
            );


            clearTimeout(timeoutId);


            const dados =
                await resposta.json();


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

            }

        } catch (erroGeo) {

            console.error(
                'Consulta externa de geolocalizacao falhou. Utilizando dados da Vercel:',
                erroGeo.message
            );

        }

    }


    return {

        codigoPais,
        cidade,
        estado,
        pais

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

async function registrarVisita(dados) {

    const sheet =
        await obterPlanilha();


    await sheet.addRow({

        'Site':
            dados.site,

        'Data Abertura':
            dados.dataHora,

        'IP':
            dados.ip,

        'Cidade':
            dados.cidade,

        'Estado':
            dados.estado,

        'País':
            dados.pais,

        'Idioma':
            dados.idioma,

        'Tipo Dispositivo':
            dados.tipoDispositivo,

        'Origem':
            dados.origem,

        'Dispositivo':
            dados.userAgent,

        'ID Visita':
            dados.visitId,

        'Tempo na Página (segundos)':
            ''

    });

}


/*
|--------------------------------------------------------------------------
| PIXEL DE RASTREAMENTO
|--------------------------------------------------------------------------
*/

app.get('/api/imagem', async (req, res) => {

    /*
     * Nome do site.
     */

    const nomeSite =
        req.query.t ||
        req.query.site ||
        'Site Indefinido';


    /*
     * IP.
     */

    const ip =
        obterIp(req);


    /*
     * ID da visita.
     *
     * Se a página já enviou um ID, usamos ele.
     *
     * Caso contrário, criamos um novo.
     */

    const visitId =
        String(
            req.query.visitId ||
            crypto.randomUUID()
        ).trim();


    /*
     * Localização.
     */

    const localizacao =
        await obterLocalizacao(
            req,
            ip
        );


    /*
     * Idioma.
     */

    const rawLang =
        req.headers['accept-language'] ||
        '';


    const idioma =
        rawLang
            ? rawLang
                .split(',')[0]
                .trim()
            : 'Não Identificado';


    /*
     * Dispositivo.
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
     * Origem.
     */

    const origem =
        req.headers['referer'] ||
        'Acesso Direto';


    /*
     * Horário de São Paulo.
     */

    const dataHora =
        new Date().toLocaleString(
            'pt-BR',
            {
                timeZone:
                    'America/Sao_Paulo'
            }
        );


    /*
     * Salva a visita.
     */

    try {

        await registrarVisita({

            site:
                nomeSite,

            dataHora:
                dataHora,

            ip:
                ip,

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
                userAgent ||
                'Não Identificado',

            visitId:
                visitId

        });


        console.log(
            `Visita registrada | Site: ${nomeSite} | ID: ${visitId}`
        );


    } catch (error) {

        console.error(
            'Erro ao registrar visita na planilha:',
            error.message
        );

    }


    /*
     * Pixel transparente 1x1.
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
| ATUALIZA TEMPO NA MESMA LINHA
|--------------------------------------------------------------------------
*/

async function atualizarTempoPagina(req, res) {

    /*
     * Aceita tanto query string quanto body.
     *
     * GET:
     * /api/tempo?visitId=XXX&tempo=15
     *
     * POST:
     * /api/tempo?visitId=XXX&tempo=15
     */

    const visitId =
        String(
            req.query.visitId ||
            (req.body && req.body.visitId) ||
            ''
        ).trim();


    const tempo =
        Number(
            req.query.tempo ||
            (req.body && req.body.tempo)
        );


    /*
     * Validação.
     */

    if (
        !visitId ||
        !Number.isFinite(tempo) ||
        tempo < 0
    ) {

        console.error(
            'Dados inválidos recebidos em /api/tempo:',
            {
                visitId,
                tempo
            }
        );


        return res
            .status(400)
            .send('Dados inválidos.');

    }


    /*
     * Limite de segurança:
     *
     * 7 dias = 604800 segundos.
     */

    const tempoSeguro =
        Math.min(
            Math.round(tempo),
            604800
        );


    /*
     * Faz várias tentativas.
     *
     * Isso é importante porque o navegador pode enviar
     * /api/tempo praticamente no mesmo momento em que
     * /api/imagem ainda está salvando a linha.
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
                            row['ID Visita'] ||
                            ''
                        ) === visitId
                );


            /*
             * Encontrou a linha.
             */

            if (linha) {

                linha[
                    'Tempo na Página (segundos)'
                ] = tempoSeguro;


                await linha.save();


                console.log(
                    `Tempo atualizado com sucesso: ${tempoSeguro}s | ID: ${visitId}`
                );


                return res
                    .status(200)
                    .send('OK');

            }


            /*
             * Ainda não encontrou.
             */

            console.log(
                `Visita não encontrada. Tentativa ${tentativa}/${maxTentativas} | ID: ${visitId}`
            );


        } catch (error) {

            console.error(
                `Erro ao atualizar tempo. Tentativa ${tentativa}:`,
                error.message
            );

        }


        /*
         * Espera antes da próxima tentativa.
         */

        if (
            tentativa <
            maxTentativas
        ) {

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
     * Não encontrou após todas as tentativas.
     */

    console.error(
        `Não foi possível localizar a visita após ${maxTentativas} tentativas: ${visitId}`
    );


    return res
        .status(404)
        .send('Visita não encontrada.');

}


/*
|--------------------------------------------------------------------------
| GET /api/tempo
|--------------------------------------------------------------------------
|
| Mantido para compatibilidade.
|
*/

app.get(
    '/api/tempo',
    atualizarTempoPagina
);


/*
|--------------------------------------------------------------------------
| POST /api/tempo
|--------------------------------------------------------------------------
|
| ESTE É O IMPORTANTE PARA navigator.sendBeacon().
|
*/

app.post(
    '/api/tempo',
    atualizarTempoPagina
);


/*
|--------------------------------------------------------------------------
| REDIRECIONAMENTO POR PAÍS
|--------------------------------------------------------------------------
*/

app.get('/api/go', async (req, res) => {

    /*
     * Produto solicitado.
     */

    const produtoNome =
        String(
            req.query.product ||
            ''
        ).trim();


    /*
     * Nome do site/campanha.
     */

    const nomeSite =
        String(
            req.query.site ||
            produtoNome ||
            'Redirecionamento'
        ).trim();


    /*
     * Procura o produto.
     */

    const produto =
        produtos[produtoNome];


    /*
     * Se o produto não existir,
     * utiliza o fallback de emergência.
     */

    if (!produto) {

        console.error(
            `Produto não encontrado: ${produtoNome}`
        );


        return res
            .redirect(
                302,
                fallbackSistema
            );

    }


    /*
     * IP.
     */

    const ip =
        obterIp(req);


    /*
     * Localização.
     */

    const localizacao =
        await obterLocalizacao(
            req,
            ip
        );


    /*
     * URL do país.
     */

    const urlPais =
        produto.paises[
            localizacao.codigoPais
        ];


    /*
     * Se o país estiver configurado,
     * usa a URL dele.
     *
     * Caso contrário,
     * usa o fallback DO PRÓPRIO PRODUTO.
     */

    const destino =
        urlPais ||
        produto.default;


    /*
     * Registra o clique/visita do redirecionamento.
     */

    const visitId =
        crypto.randomUUID();


    const rawLang =
        req.headers['accept-language'] ||
        '';


    const idioma =
        rawLang
            ? rawLang
                .split(',')[0]
                .trim()
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


    const dataHora =
        new Date().toLocaleString(
            'pt-BR',
            {
                timeZone:
                    'America/Sao_Paulo'
            }
        );


    try {

        await registrarVisita({

            site:
                nomeSite,

            dataHora:
                dataHora,

            ip:
                ip,

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
                userAgent ||
                'Não Identificado',

            visitId:
                visitId

        });


        console.log(
            `Redirecionamento | Produto: ${produtoNome} | País: ${localizacao.codigoPais} | Destino: ${destino}`
        );


    } catch (error) {

        console.error(
            'Erro ao registrar redirecionamento:',
            error.message
        );

    }


    /*
     * Redireciona.
     */

    return res
        .redirect(
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

    res
        .status(200)
        .send(
            'Servidor de rastreamento online.'
        );

});


/*
|--------------------------------------------------------------------------
| EXPORTAÇÃO
|--------------------------------------------------------------------------
*/

module.exports = app;
