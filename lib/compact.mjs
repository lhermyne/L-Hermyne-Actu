/**
 * Version allégée de tweets.json, destinée à la lecture par une IA :
 * auteur en clair, heure de Paris et texte, dans l'ordre chronologique.
 *
 * Les tweets sont répartis en deux blocs autour du dernier horaire de résumé :
 *   - new : à résumer ;
 *   - context : déjà couvert par le résumé précédent, utile pour signaler les suites.
 */

import { findLastParisHour, formatParis } from "./paris-time.mjs";

const SUMMARY_PARIS_HOURS = [8, 20];
/** Un résumé lancé jusqu'à 2 h après son horaire voit encore la période qui vient de se finir. */
const SUMMARY_GRACE_MS = 2 * 3_600_000;
/** En dessous, deux textes identiques (« LOL ») ne sont pas considérés comme un doublon. */
const MIN_DUPLICATE_LENGTH = 30;
const URL_PATTERN = /https?:\/\/\S+/g;

/** @typedef {import("./store.mjs").TweetStore} TweetStore */
/** @typedef {import("./syndication.mjs").Tweet} Tweet */

/**
 * @typedef {Object} CompactTweet
 * @property {string} author_name
 * @property {string} published_at   Heure de Paris, « AAAA-MM-JJ HH:MM »
 * @property {string} text
 * @property {string[]} [also_by]    Autres comptes ayant publié le même contenu
 */

/**
 * @typedef {Object} CompactFile
 * @property {string|null} list_name
 * @property {string} timezone
 * @property {string} generated_at
 * @property {string} period
 * @property {string} new_period
 * @property {string} context_period
 * @property {boolean} coverage_complete
 * @property {number} new_count
 * @property {number} context_count
 * @property {number} duplicates_merged
 * @property {number} empty_removed
 * @property {CompactTweet[]} new
 * @property {CompactTweet[]} context
 */

/**
 * @param {TweetStore} store
 * @returns {CompactFile}
 */
export function buildCompact(store) {
    const generatedAt = new Date(store.updated_at);
    const cutoff = findSummaryCutoff(generatedAt).toISOString();

    const chronological = [...store.tweets].reverse();
    const published = chronological.filter(hasContent);

    const newTweets = mergeDuplicates(published.filter((tweet) => tweet.created_at >= cutoff));
    const contextTweets = mergeDuplicates(published.filter((tweet) => tweet.created_at < cutoff));
    const keptCount = newTweets.length + contextTweets.length;

    return {
        list_name: store.list_name,
        timezone: "Europe/Paris",
        generated_at: formatParis(store.updated_at),
        period: `du ${formatParis(store.window_start)} au ${formatParis(store.updated_at)}`,
        new_period: `du ${formatParis(cutoff)} au ${formatParis(store.updated_at)}`,
        context_period: `du ${formatParis(store.window_start)} au ${formatParis(cutoff)}`,
        coverage_complete: store.coverage_complete,
        new_count: newTweets.length,
        context_count: contextTweets.length,
        duplicates_merged: published.length - keptCount,
        empty_removed: chronological.length - published.length,
        new: newTweets,
        context: contextTweets,
    };
}

/**
 * Début du bloc `new` : dernier horaire de résumé, en tenant compte du délai de grâce.
 * Sans ce délai, un résumé lancé à 20 h 05 ne verrait que les 5 dernières minutes.
 * @param {Date} generatedAt
 * @returns {Date}
 */
function findSummaryCutoff(generatedAt) {
    const reference = new Date(generatedAt.getTime() - SUMMARY_GRACE_MS);
    return findLastParisHour(reference, SUMMARY_PARIS_HOURS);
}

/** @param {Tweet} tweet */
function hasContent(tweet) {
    return tweet.text !== "" || Boolean(tweet.quoted_text);
}

/**
 * Fusionne les tweets au contenu identique en gardant le plus ancien.
 * Reçoit les tweets dans l'ordre chronologique.
 * @param {Tweet[]} tweets
 * @returns {CompactTweet[]}
 */
function mergeDuplicates(tweets) {
    const merged = [];
    const byContent = new Map();

    for (const tweet of tweets) {
        const key = buildContentKey(tweet);
        const original = key.length >= MIN_DUPLICATE_LENGTH ? byContent.get(key) : undefined;

        if (original) {
            addAuthor(original, tweet.author_name);
            continue;
        }

        const compact = toCompactTweet(tweet);
        byContent.set(key, compact);
        merged.push(compact);
    }

    return merged;
}

/**
 * Clé de comparaison, sans les liens : un même article peut être publié avec deux
 * liens courts différents (Le Parisien et Le Parisien | politique).
 * @param {Tweet} tweet
 */
function buildContentKey(tweet) {
    return `${normalize(tweet.text)} ${normalize(tweet.quoted_text ?? "")}`.trim();
}

/** @param {string} text */
function normalize(text) {
    return text
        .replace(URL_PATTERN, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

/**
 * @param {CompactTweet} compact
 * @param {string} authorName
 */
function addAuthor(compact, authorName) {
    if (authorName === compact.author_name) {
        return;
    }

    compact.also_by ??= [];
    if (!compact.also_by.includes(authorName)) {
        compact.also_by.push(authorName);
    }
}

/**
 * @param {Tweet} tweet
 * @returns {CompactTweet}
 */
function toCompactTweet(tweet) {
    return {
        author_name: tweet.author_name,
        published_at: formatParis(tweet.created_at),
        text: describeText(tweet),
    };
}

/**
 * Indique dans le texte s'il s'agit d'un retweet ou d'une citation.
 * @param {Tweet} tweet
 */
function describeText(tweet) {
    if (tweet.type === "retweet") {
        return `[Retweet de @${tweet.retweeted_author}] ${tweet.text}`;
    }
    if (tweet.type === "quote" && tweet.quoted_text) {
        return `${tweet.text}\n[Cite @${tweet.quoted_author}] ${tweet.quoted_text}`;
    }
    return tweet.text;
}
