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
| PRODUTOS
|--------------------------------------------------------------------------
*/

const produtos = {
    'akemi-coffee-boost': {
        default: 'https://www.treejammer.com/L1HDNH9/9KCZZ7S/',
        paises: {
            US: 'https://www.pixlbonk.com/L1HDNH9/9MLGPC5/',
            CA: 'https://www.pixlbonk.com/L1HDNH9/9MLGPC5/',
            AU: 'https://www.treejammer.com/L1HDNH9/9KCZZ7S/'
        }
    },

    'vitaslimex': {
        default: 'https://www.pixlbonk.com/L1HDNH9/9CGPSMK/',
        paises: {
            DK: 'https://www.pixlbonk.com/L1HDNH9/9DLN5KJ/',
            IT: 'https://www.pixlbonk.com/L1HDNH9/9CPN8BL/',
            BE: 'https://www.pixlbonk.com/L1HDNH9/99883J8/',
            NO: 'https://www.pixlbonk.com/L1HDNH9/9CLWGTD/',
            IE: 'https://www.pixlbonk.com/L1HDNH9/9CGPSMK/',
            UK: 'https://www.pixlbonk.com/L1HDNH9/9CGPSMK/',
            FI: 'https://www.pixlbonk.com/L1HDNH9/99C1T1G/',
            SE: 'https://www.pixlbonk.com/L1HDNH9/999LZ8T/',
            FR: 'https://www.pixlbonk.com/L1HDNH9/99883J8/',
            CH: 'https://www.pixlbonk.com/L1HDNH9/996T6RM/',
            DE: 'https://www.pixlbonk.com/L1HDNH9/996T6RM/',
            AT: 'https://www.pixlbonk.com/L1HDNH9/996T6RM/'
        }
    },

    'corevalin': {
        default: 'https://www.pixlbonk.com/L1HDNH9/9BPWKLG/',
        paises: {
            UK: 'https://www.pixlbonk.com/L1HDNH9/9BPWKLG/'
        }
        
    }
};

/*
|--------------------------------------------------------------------------
| FALLBACK DE EMERGÊNCIA
|--------------------------------------------------------------------------
*/

const fallbackSistema = 'https://www.google.com.br/';

/*
|--------------------------------------------------------------------------
| PARÂMETROS DE RASTREAMENTO
|--------------------------------------------------------------------------
*/

function obterValorQuery(req, chave) {
    const valor = req.query ? req.query[chave] : '';

    if (typeof valor === 'string') {
        return valor.trim();
    }

    if (Array.isArray(valor) && typeof valor[0] === 'string') {
        return valor[0].trim();
    }

    if (typeof valor === 'number') {
        return String(valor);
    }

    return '';
}

function obterParametrosRastreamento(req) {
    const gclid = obterValorQuery(req, 'gclid');
    const gbraid = obterValorQuery(req, 'gbraid');
    const wbraid = obterValorQuery(req, 'wbraid');

    const utmSource = obterValorQuery(req, 'utm_source');
    const utmMedium = obterValorQuery(req, 'utm_medium');
    const utmCampaign = obterValorQuery(req, 'utm_campaign');
    const utmContent = obterValorQuery(req, 'utm_content');
    const utmTerm = obterValorQuery(req, 'utm_term');

    const sub1Recebido = obterValorQuery(req, 'sub1');
    const sub2Recebido = obterValorQuery(req, 'sub2');
    const sub3Recebido = obterValorQuery(req, 'sub3');

    const partesSub3 = [
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm
    ];

    const sub3Montado = partesSub3.some(Boolean)
        ? partesSub3.join('cXnXl')
        : '';

    return {
        gclid,
        gbraid,
        wbraid,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        sub1: sub1Recebido || utmSource,
        sub2: sub2Recebido || gclid || gbraid || wbraid,
        sub3: sub3Recebido || sub3Montado
    };
}

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
| OBTÉM IP
|--------------------------------------------------------------------------
*/

function obterIp(req) {
    const rawIp =
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        '';

    return rawIp.split(',')[0].trim() || 'N/A';
}

/*
|--------------------------------------------------------------------------
| VERIFICA IP
|--------------------------------------------------------------------------
*/

function ipValido(ip) {
    if (!ip || ip === 'N/A') return false;
    if (ip === '127.0.0.1') return false;
    if (ip === '::1') return false;
    if (ip.startsWith('192.168.')) return false;
    if (ip.startsWith('10.')) return false;

    return true;
}

/*
|--------------------------------------------------------------------------
| LOCALIZAÇÃO
|--------------------------------------------------------------------------
*/

async function obterLocalizacao(req, ip) {
    const codigoPais =
        req.headers['x-vercel-ip-country'] ||
        'N/A';

    const codigoRegiao =
        req.headers['x-vercel-ip-country-region'] ||
        'N/A';

    let cidade =
        req.headers['x-vercel-ip-city']
            ? decodeURIComponent(req.headers['x-vercel-ip-city'])
            : 'Não Identificada';

    let estado =
        codigoPais === 'BR' && estadosBrasil[codigoRegiao]
            ? estadosBrasil[codigoRegiao]
            : codigoRegiao;

    let pais = 'Não Identificado';

    if (codigoPais !== 'N/A') {
        try {
            pais = tradutorPais.of(codigoPais) || codigoPais;
        } catch {
            pais = codigoPais;
        }
    }

    /*
     * Consulta externa.
     */

    if (ipValido(ip)) {
        try {
            const controller = new AbortController();

            const timeoutId = setTimeout(
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

            const dados = await resposta.json();

            if (dados.status === 'success') {
                cidade = dados.city || cidade;
                estado = dados.regionName || estado;
                pais = dados.country || pais;
            }
        } catch (erroGeo) {
            console.error(
                'Consulta externa de geolocalizacao falhou:',
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
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,

        key: process.env.GOOGLE_PRIVATE_KEY
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
    const auth = criarAutenticacaoGoogle();

    const doc = new GoogleSpreadsheet(
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
    const sheet = await obterPlanilha();

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
            '',

        // Identificadores de clique.
        'GCLID':
            dados.gclid || '',

        'GBRAID':
            dados.gbraid || '',

        'WBRAID':
            dados.wbraid || '',

        // UTMs.
        'UTM Source':
            dados.utmSource || '',

        'UTM Medium':
            dados.utmMedium || '',

        'UTM Campaign':
            dados.utmCampaign || '',

        'UTM Content':
            dados.utmContent || '',

        'UTM Term':
            dados.utmTerm || '',

        // SubIDs.
        'Sub1':
            dados.sub1 || '',

        'Sub2':
            dados.sub2 || '',

        'Sub3':
            dados.sub3 || ''
    });
}

/*
|--------------------------------------------------------------------------
| /api/imagem
|--------------------------------------------------------------------------
|
| Registra a abertura da página.
|
*/

app.get('/api/imagem', async (req, res) => {
    const nomeSite = String(
        req.query.t ||
        req.query.site ||
        'Site Indefinido'
    ).trim();

    const parametrosRastreamento =
        obterParametrosRastreamento(req);

    /*
     * IP.
     */

    const ip = obterIp(req);

    /*
     * ID ÚNICO DA VISITA.
     */

    const visitId = String(
        req.query.visitId ||
        crypto.randomUUID()
    ).trim();

    /*
     * Localização.
     */

    const localizacao = await obterLocalizacao(
        req,
        ip
    );

    /*
     * Idioma.
     */

    const rawLang =
        req.headers['accept-language'] || '';

    const idioma = rawLang
        ? rawLang.split(',')[0].trim()
        : 'Não Identificado';

    /*
     * Dispositivo.
     */

    const userAgent =
        req.headers['user-agent'] || '';

    const ehCelular =
        /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
            .test(userAgent);

    const tipoDispositivo = userAgent
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
        req.headers['referer'] || 'Acesso Direto';

    /*
     * Data e hora.
     */

    const dataHora = new Date().toLocaleString(
        'pt-BR',
        {
            timeZone: 'America/Sao_Paulo'
        }
    );

    /*
     * Registra no Google Sheets.
     */

    try {
        await registrarVisita({
            site: nomeSite,
            dataHora,
            ip,
            cidade: localizacao.cidade,
            estado: localizacao.estado,
            pais: localizacao.pais,
            idioma,
            tipoDispositivo,
            origem,
            userAgent: userAgent || 'Não Identificado',
            visitId,
            ...parametrosRastreamento
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
     * Pixel 1x1 transparente.
     */

    const pixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64'
    );

    res.setHeader('Content-Type', 'image/png');

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
| ATUALIZA TEMPO DA PÁGINA
|--------------------------------------------------------------------------
*/

async function atualizarTempoPagina(req, res) {
    const visitId = req.query.visitId;
    const tempo = req.query.tempo;

    if (!visitId || !tempo) {
        return res
            .status(400)
            .send('Parâmetros ausentes.');
    }

    const tempoSeguro = Math.max(
        1,
        parseInt(tempo, 10) || 1
    );

    try {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,

            key: process.env.GOOGLE_PRIVATE_KEY
                .replace(/\\n/g, '\n'),

            scopes: [
                'https://www.googleapis.com/auth/spreadsheets'
            ]
        });

        const doc = new GoogleSpreadsheet(
            process.env.GOOGLE_SHEET_ID,
            serviceAccountAuth
        );

        await doc.loadInfo();

        const sheet = doc.sheetsByIndex[0];

        // Garante que os cabeçalhos estejam carregados.
        await sheet.loadHeaderRow();

        const colunaId = 'ID Visita';
        const colunaTempo = 'Tempo na Página (segundos)';

        // Carrega todas as linhas.
        const rows = await sheet.getRows();

        console.log(`Procurando ID: ${visitId}`);
        console.log(`Total de linhas encontradas: ${rows.length}`);

        let linhaEncontrada = null;

        for (const row of rows) {
            let idDaLinha = '';

            try {
                idDaLinha = row.get(colunaId);
            } catch (erro) {
                console.log(
                    'Erro ao ler ID da linha:',
                    erro.message
                );
            }

            if (
                String(idDaLinha).trim() ===
                String(visitId).trim()
            ) {
                linhaEncontrada = row;
                break;
            }
        }

        if (!linhaEncontrada) {
            console.log(
                `VISITA NÃO ENCONTRADA: ${visitId}`
            );

            return res
                .status(404)
                .send('Visita não encontrada.');
        }

        console.log(
            `Linha encontrada. ID: ${linhaEncontrada.get(colunaId)}`
        );

        // Atualiza usando a API própria da biblioteca.
        linhaEncontrada.set(
            colunaTempo,
            tempoSeguro
        );

        // Salva efetivamente na planilha.
        await linhaEncontrada.save();

        console.log(
            `TEMPO ATUALIZADO COM SUCESSO | ID: ${visitId} | Tempo: ${tempoSeguro}s`
        );

        return res
            .status(200)
            .send('OK');

    } catch (error) {
        console.error(
            'ERRO AO ATUALIZAR TEMPO:',
            error.message
        );

        return res
            .status(500)
            .send('Erro ao atualizar tempo.');
    }
}

/*
|--------------------------------------------------------------------------
| GET /api/tempo
|--------------------------------------------------------------------------
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
| O navigator.sendBeacon() utiliza POST.
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
     * Produto.
     */

    const produtoNome = String(
        req.query.product || ''
    ).trim();

    /*
     * Nome do site.
     */

    const nomeSite = String(
        req.query.site ||
        produtoNome ||
        'Redirecionamento'
    ).trim();

    /*
     * Parâmetros de rastreamento.
     */

    const parametrosRastreamento =
        obterParametrosRastreamento(req);

    /*
     * Procura produto.
     */

    const produto = produtos[produtoNome];

    /*
     * Produto inexistente.
     */

    if (!produto) {
        console.error(
            `Produto não encontrado: ${produtoNome}`
        );

        return res.redirect(
            302,
            fallbackSistema
        );
    }

    /*
     * IP.
     */

    const ip = obterIp(req);

    /*
     * Localização.
     */

    const localizacao = await obterLocalizacao(
        req,
        ip
    );

    /*
     * Procura URL do país.
     */

    const urlPais =
        produto.paises[localizacao.codigoPais];

    /*
     * Usa:
     *
     * 1. URL específica do país.
     * 2. Fallback do próprio produto.
     */

    const destino =
        urlPais || produto.default;

    /*
     * Acrescenta SubIDs à URL de rastreamento da oferta.
     * A URL base definida em produtos permanece inalterada.
     *
     * Somente SubIDs são enviados ao destino. O GCLID e as UTMs
     * também ficam registrados na planilha.
     */

    const destinoComTracking = new URL(destino);

    ['sub1', 'sub2', 'sub3'].forEach((chave) => {
        const valor = parametrosRastreamento[chave];

        if (
            typeof valor === 'string' &&
            valor.trim()
        ) {
            destinoComTracking.searchParams.set(
                chave,
                valor.trim()
            );
        }
    });

    const destinoFinal =
        destinoComTracking.toString();

    /*
     * ID da visita.
     */

    const visitId = crypto.randomUUID();

    /*
     * Idioma.
     */

    const rawLang =
        req.headers['accept-language'] || '';

    const idioma = rawLang
        ? rawLang.split(',')[0].trim()
        : 'Não Identificado';

    /*
     * Dispositivo.
     */

    const userAgent =
        req.headers['user-agent'] || '';

    const ehCelular =
        /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
            .test(userAgent);

    const tipoDispositivo = userAgent
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
        req.headers['referer'] || 'Acesso Direto';

    /*
     * Data e hora.
     */

    const dataHora = new Date().toLocaleString(
        'pt-BR',
        {
            timeZone: 'America/Sao_Paulo'
        }
    );

    /*
     * Registra o redirecionamento.
     */

    try {
        await registrarVisita({
            site: nomeSite,
            dataHora,
            ip,
            cidade: localizacao.cidade,
            estado: localizacao.estado,
            pais: localizacao.pais,
            idioma,
            tipoDispositivo,
            origem,
            userAgent: userAgent || 'Não Identificado',
            visitId,
            ...parametrosRastreamento
        });

        console.log(
            `Redirecionamento | Produto: ${produtoNome} | País: ${localizacao.codigoPais} | Destino: ${destinoFinal} | Sub2: ${parametrosRastreamento.sub2 ? 'presente' : 'ausente'}`
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

    return res.redirect(
        302,
        destinoFinal
    );
});

/*
|--------------------------------------------------------------------------
| ROTA PRINCIPAL
|--------------------------------------------------------------------------
*/

app.get(
    '/',
    (req, res) => {
        res
            .status(200)
            .send('Servidor de rastreamento online.');
    }
);

/*
|--------------------------------------------------------------------------
| EXPORTAÇÃO
|--------------------------------------------------------------------------
*/

module.exports = app;
