const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();


// ============================================================
// CONFIGURAÇÃO DOS PRODUTOS
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


// ============================================================
// DESTINO PADRÃO
// ============================================================

const destinoPadrao = 'https://www.google.com.br/';


// ============================================================
// TRADUTOR DE PAÍSES
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
// OBTÉM O IP
// ============================================================

function obterIp(req) {

    const rawIp =
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        '';

    return rawIp.split(',')[0].trim() || 'N/A';
}


// ============================================================
// VERIFICA SE O IP PODE SER CONSULTADO
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
// OBTÉM LOCALIZAÇÃO
// ============================================================

async function obterLocalizacao(req) {

    const ip = obterIp(req);

    // Dados fornecidos pela Vercel
    const siglaPais =
        req.headers['x-vercel-ip-country'] || 'N/A';

    const siglaRegiao =
        req.headers['x-vercel-ip-country-region'] || 'N/A';

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

    let estado =
        siglaPais === 'BR' &&
        estadosBrasil[siglaRegiao]
            ? estadosBrasil[siglaRegiao]
            : siglaRegiao;

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
    // CONSULTA IP-API
    // ========================================================

    if (ipValido(ip)) {

        try {

            const controller =
                new AbortController();

            const timeoutId =
                setTimeout(() => {
                    controller.abort();
                }, 2000);

            const resposta =
                await fetch(
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

                return {

                    ip,

                    codigoPais:
                        dados.countryCode
                            ? dados.countryCode.toUpperCase()
                            : (
                                siglaPais !== 'N/A'
                                    ? siglaPais.toUpperCase()
                                    : null
                            ),

                    pais,

                    cidade,

                    estado
                };
            }

        } catch (erroGeo) {

            console.error(
                'Consulta externa de geolocalização falhou. Usando dados da Vercel:',
                erroGeo.message
            );
        }
    }


    // ========================================================
    // FALLBACK PARA DADOS DA VERCEL
    // ========================================================

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
// REGISTRA DADOS NA PLANILHA
// ============================================================

async function registrarVisita(
    req,
    localizacao,
    nomeSite
) {

    // ========================================================
    // IDIOMA
    // ========================================================

    const rawLang =
        req.headers['accept-language'] || '';

    const idioma =
        rawLang
            ? rawLang.split(',')[0].trim()
            : 'Não Identificado';


    // ========================================================
    // USER AGENT
    // ========================================================

    const userAgent =
        req.headers['user-agent'] || '';


    // ========================================================
    // TIPO DE DISPOSITIVO
    // ========================================================

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


    // ========================================================
    // ORIGEM
    // ========================================================

    const origem =
        req.headers['referer'] ||
        'Acesso Direto';


    // ========================================================
    // DATA/HORA DE SÃO PAULO
    // ========================================================

    const dataHoraSP =
        new Date().toLocaleString(
            'pt-BR',
            {
                timeZone: 'America/Sao_Paulo'
            }
        );


    // ========================================================
    // GOOGLE SHEETS
    // ========================================================

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
        // MESMAS 10 COLUNAS DE SEMPRE
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


        console.log(
            `Registro salvo na planilha: ${nomeSite}`
        );


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
// REGISTRO DA PRIMEIRA ETAPA:
//
// Google Ads
//      ↓
// Página principal
//      ↓
// /api/imagem
//      ↓
// Planilha
//
// ESTA ROTA CONTINUA COMPATÍVEL COM TODOS OS SITES ANTIGOS.
// ============================================================

app.get('/api/imagem', async (req, res) => {

    const nomeSite =
        req.query.t ||
        req.query.site ||
        'Site Indefinido';


    // Obtém localização
    const localizacao =
        await obterLocalizacao(req);


    // Registra visita
    await registrarVisita(
        req,
        localizacao,
        nomeSite
    );


    // ========================================================
    // PIXEL 1x1 TRANSPARENTE
    // ========================================================

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


// ============================================================
// /api/go
//
// REGISTRO DA SEGUNDA ETAPA:
//
// Pessoa clica no link de afiliado
//      ↓
// /api/go
//      ↓
// REGISTRA O CLIQUE NA PLANILHA
//      ↓
// IDENTIFICA PAÍS
//      ↓
// ESCOLHE OFERTA
//      ↓
// REDIRECIONA
// ============================================================

app.get('/api/go', async (req, res) => {

    const product =
        String(
            req.query.product || ''
        )
        .trim()
        .toLowerCase();


    const nomeSite =
        String(
            req.query.site || ''
        )
        .trim() ||
        'Redirecionamento';


    console.log(
        `Clique recebido. Produto: ${product} | Site: ${nomeSite}`
    );


    // ========================================================
    // OBTÉM LOCALIZAÇÃO
    // ========================================================

    const localizacao =
        await obterLocalizacao(req);


    // ========================================================
    // REGISTRA O SEGUNDO CLIQUE NA PLANILHA
    //
    // O valor de "site" será exatamente o que veio na URL.
    //
    // Exemplo:
    //
    // ?site=Akemi-coofe-boost-redireciona
    //
    // A planilha receberá:
    //
    // Akemi-coofe-boost-redireciona
    // ========================================================

    await registrarVisita(
        req,
        localizacao,
        nomeSite
    );


    // ========================================================
    // VERIFICA SE O PRODUTO EXISTE
    // ========================================================

    const produto =
        produtos[product];


    if (!produto) {

        console.log(
            `Produto não configurado: ${product}. Fallback.`
        );


        return res.redirect(
            302,
            destinoPadrao
        );
    }


    // ========================================================
    // IDENTIFICA PAÍS
    // ========================================================

    const codigoPais =
        localizacao.codigoPais;


    console.log(
        `País identificado: ${codigoPais || 'Não identificado'}`
    );


    // ========================================================
    // PROCURA OFERTA PARA O PAÍS
    // ========================================================

    const destino =
        codigoPais
            ? produto.paises[codigoPais]
            : null;


    // ========================================================
    // SEM OFERTA → GOOGLE BRASIL
    // ========================================================

    if (!destino) {

        console.log(
            `Sem oferta para ${codigoPais || 'país desconhecido'} no produto ${product}. Fallback.`
        );


        return res.redirect(
            302,
            destinoPadrao
        );
    }


    // ========================================================
    // REDIRECIONA
    // ========================================================

    console.log(
        `Redirecionando ${codigoPais} para ${destino}`
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
// EXPORTAÇÃO PARA VERCEL
// ============================================================

module.exports = app;
