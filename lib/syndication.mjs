/**
 * Accès à l'endpoint public d'intégration (« embedded timeline ») de X.
 * Aucun compte ni cookie requis, mais seuls les ~100 derniers tweets de la liste
 * sont renvoyés.
 */

const SYNDICATION_URL = "https://syndication.twitter.com/srv/timeline-list/list-id/";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_ATTEMPTS = 3;
const MAX_RATE_LIMIT_WAIT_MS = 5 * 60_000;

/**
 * @typedef {Object} Tweet
 * @property {string} id
 * @property {string} created_at       Date ISO 8601 (UTC)
 * @property {string} author           Pseudo (@) du compte qui a publié ou retweeté
 * @property {string} author_name
 * @property {"tweet"|"retweet"|"quote"} type
 * @property {string} text             Texte complet, liens t.co développés
 * @property {string|null} retweeted_author
 * @property {string|null} quoted_author
 * @property {string|null} quoted_text
 * @property {string} lang
 * @property {string} url
 */

/**
 * @typedef {Object} ListTimeline
 * @property {string|null} listName
 * @property {Tweet[]} tweets
 */

/**
 * Télécharge la timeline de la liste et renvoie ses tweets normalisés.
 * @param {string} listId
 * @returns {Promise<ListTimeline>}
 */
export async function fetchListTimeline(listId) {
    const html = await fetchWithRetry(`${SYNDICATION_URL}${listId}`);
    const pageProps = extractNextData(html).props?.pageProps ?? {};
    const entries = pageProps.timeline?.entries ?? [];

    const tweets = entries
        .filter((entry) => entry.type === "tweet" && entry.content?.tweet)
        .map((entry) => normalizeTweet(entry.content.tweet));

    return {
        listName: pageProps.headerProps?.name ?? null,
        tweets,
    };
}

/** Accepte un identifiant ou une URL du type https://x.com/i/lists/<id>. */
export function extractListId(value) {
    const match = String(value).match(/(\d{5,})/);
    if (!match) {
        throw new Error(`Identifiant de liste invalide : ${value}`);
    }
    return match[1];
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/** @param {string} url */
async function fetchWithRetry(url) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9" },
            });
            if (response.status === 429) {
                await waitForRateLimitReset(response);
                continue;
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} sur ${url}`);
            }
            return await response.text();
        } catch (error) {
            lastError = error;
            await sleep(2000 * attempt);
        }
    }

    throw lastError ?? new Error(`Limite de débit toujours atteinte sur ${url}`);
}

/**
 * Attend la fin de la fenêtre de limitation (en-tête x-rate-limit-reset),
 * ou échoue si l'attente dépasse MAX_RATE_LIMIT_WAIT_MS.
 * @param {Response} response
 */
async function waitForRateLimitReset(response) {
    const resetSeconds = Number(response.headers.get("x-rate-limit-reset"));
    const waitMs = Number.isFinite(resetSeconds) && resetSeconds > 0
        ? resetSeconds * 1000 - Date.now() + 1000
        : 30_000;

    if (waitMs > MAX_RATE_LIMIT_WAIT_MS) {
        const resetAt = new Date(Date.now() + waitMs).toISOString();
        throw new Error(`Limite de débit atteinte (HTTP 429), réessayez après ${resetAt}.`);
    }

    console.warn(`Limite de débit atteinte, attente de ${Math.ceil(waitMs / 1000)} s…`);
    await sleep(Math.max(waitMs, 1000));
}

/** Extrait le JSON embarqué par Next.js dans la page. */
function extractNextData(html) {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (!match) {
        throw new Error("Format de page inattendu : bloc __NEXT_DATA__ introuvable (X a peut-être changé l'endpoint).");
    }
    return JSON.parse(match[1]);
}

function sleep(ms) {
    return new Promise((done) => setTimeout(done, ms));
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Remplace les liens t.co par leur URL réelle et retire les liens vers les médias.
 * @param {Object} raw  Tweet brut (full_text + entities)
 */
function expandText(raw) {
    let text = raw.full_text ?? raw.text ?? "";

    for (const link of raw.entities?.urls ?? []) {
        text = text.replaceAll(link.url, link.expanded_url ?? link.url);
    }
    for (const media of raw.entities?.media ?? []) {
        text = text.replaceAll(media.url, "");
    }

    return decodeEntities(text).trim();
}

function decodeEntities(text) {
    return text
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">");
}

/**
 * @param {Object} raw
 * @returns {Tweet}
 */
function normalizeTweet(raw) {
    const retweeted = raw.retweeted_status ?? null;
    const source = retweeted ?? raw;
    const quoted = source.quoted_status ?? null;

    let type = "tweet";
    if (retweeted) {
        type = "retweet";
    } else if (quoted) {
        type = "quote";
    }

    return {
        id: raw.id_str,
        created_at: new Date(raw.created_at).toISOString(),
        author: raw.user.screen_name,
        author_name: raw.user.name,
        type,
        text: expandText(source),
        retweeted_author: retweeted ? retweeted.user.screen_name : null,
        quoted_author: quoted ? quoted.user?.screen_name ?? null : null,
        quoted_text: quoted ? expandText(quoted) : null,
        lang: source.lang,
        url: `https://x.com/${raw.user.screen_name}/status/${raw.id_str}`,
    };
}
