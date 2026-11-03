/**
 * Version allégée de tweets.json, destinée à la lecture par une IA :
 * auteur en clair, heure de Paris et texte, dans l'ordre chronologique.
 */

import { formatParis } from "./paris-time.mjs";

/** @typedef {import("./store.mjs").TweetStore} TweetStore */
/** @typedef {import("./syndication.mjs").Tweet} Tweet */

/**
 * @typedef {Object} CompactTweet
 * @property {string} author_name
 * @property {string} published_at   Heure de Paris, « AAAA-MM-JJ HH:MM »
 * @property {string} text
 */

/**
 * @typedef {Object} CompactFile
 * @property {string|null} list_name
 * @property {string} timezone
 * @property {string} generated_at
 * @property {string} period
 * @property {boolean} coverage_complete
 * @property {number} count
 * @property {CompactTweet[]} tweets
 */

/**
 * @param {TweetStore} store
 * @returns {CompactFile}
 */
export function buildCompact(store) {
    const chronological = [...store.tweets].reverse();

    return {
        list_name: store.list_name,
        timezone: "Europe/Paris",
        generated_at: formatParis(store.updated_at),
        period: `du ${formatParis(store.window_start)} au ${formatParis(store.updated_at)}`,
        coverage_complete: store.coverage_complete,
        count: chronological.length,
        tweets: chronological.map(toCompactTweet),
    };
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
