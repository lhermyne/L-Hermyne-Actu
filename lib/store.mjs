/**
 * Fichier tweets.json : tous les tweets de la liste sur la fenêtre glissante,
 * enrichi à chaque lancement (dédoublonnage par id, purge des tweets trop anciens).
 */

const MINUTE_MS = 60_000;

/** @typedef {import("./syndication.mjs").Tweet} Tweet */

/**
 * @typedef {Object} Gap
 * @property {string} from     Dernier tweet connu avant le trou (ISO)
 * @property {string} to       Plus ancien tweet récupéré après le trou (ISO)
 * @property {number} minutes
 */

/**
 * @typedef {Object} TweetStore
 * @property {string} list_id
 * @property {string|null} list_name
 * @property {string|null} updated_at
 * @property {number} window_hours
 * @property {string|null} window_start
 * @property {string|null} covered_since   Début de l'accumulation (plus ancien tweet jamais vu)
 * @property {boolean} coverage_complete   Fenêtre entièrement couverte et sans trou
 * @property {Gap[]} possible_gaps         Trous possibles encore dans la fenêtre
 * @property {number} count
 * @property {Tweet[]} tweets              Du plus récent au plus ancien
 */

/**
 * @typedef {Object} MergeResult
 * @property {number} newTweets
 * @property {string|null} newestKnownBefore
 * @property {string|null} oldestFetched
 * @property {Gap|null} gap
 */

/**
 * @param {string} listId
 * @returns {TweetStore}
 */
export function createEmptyStore(listId) {
    return {
        list_id: listId,
        list_name: null,
        updated_at: null,
        window_hours: 0,
        window_start: null,
        covered_since: null,
        coverage_complete: false,
        possible_gaps: [],
        count: 0,
        tweets: [],
    };
}

/**
 * Fusionne les tweets récupérés dans le stock, purge ce qui sort de la fenêtre
 * et met à jour les métadonnées.
 * @param {TweetStore} store
 * @param {{listName: string|null, tweets: Tweet[]}} timeline
 * @param {{now: Date, windowHours: number}} window
 * @returns {MergeResult}
 */
export function mergeTimeline(store, timeline, window) {
    const windowStart = new Date(window.now.getTime() - window.windowHours * 60 * MINUTE_MS).toISOString();
    const byId = new Map(store.tweets.map((tweet) => [tweet.id, tweet]));

    const newestKnownBefore = findNewest(store.tweets);
    const oldestFetched = findOldest(timeline.tweets);
    const gap = detectGap(newestKnownBefore, oldestFetched);

    let newTweets = 0;
    for (const tweet of timeline.tweets) {
        if (!byId.has(tweet.id)) {
            newTweets++;
        }
        byId.set(tweet.id, tweet);
    }

    store.tweets = [...byId.values()]
        .filter((tweet) => tweet.created_at >= windowStart)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));

    if (gap) {
        store.possible_gaps.push(gap);
    }
    store.possible_gaps = store.possible_gaps.filter((known) => known.to >= windowStart);

    if (!store.covered_since && oldestFetched) {
        store.covered_since = oldestFetched;
    }

    store.list_name = timeline.listName ?? store.list_name;
    store.updated_at = window.now.toISOString();
    store.window_hours = window.windowHours;
    store.window_start = windowStart;
    store.coverage_complete = store.covered_since !== null
        && store.covered_since <= windowStart
        && store.possible_gaps.length === 0;
    store.count = store.tweets.length;

    return { newTweets, newestKnownBefore, oldestFetched, gap };
}

/**
 * Si tous les tweets récupérés sont plus récents que le dernier tweet connu,
 * des tweets ont pu être publiés entre les deux sans être vus.
 * @param {string|null} newestKnownBefore
 * @param {string|null} oldestFetched
 * @returns {Gap|null}
 */
function detectGap(newestKnownBefore, oldestFetched) {
    if (!newestKnownBefore || !oldestFetched || oldestFetched <= newestKnownBefore) {
        return null;
    }

    const minutes = (Date.parse(oldestFetched) - Date.parse(newestKnownBefore)) / MINUTE_MS;
    return { from: newestKnownBefore, to: oldestFetched, minutes: Math.round(minutes) };
}

/** @param {Tweet[]} tweets */
function findNewest(tweets) {
    let newest = null;
    for (const tweet of tweets) {
        if (newest === null || tweet.created_at > newest) {
            newest = tweet.created_at;
        }
    }
    return newest;
}

/** @param {Tweet[]} tweets */
function findOldest(tweets) {
    let oldest = null;
    for (const tweet of tweets) {
        if (oldest === null || tweet.created_at < oldest) {
            oldest = tweet.created_at;
        }
    }
    return oldest;
}
