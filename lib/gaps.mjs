/**
 * Fichier gaps.json : bilan de chaque lancement (nouveaux tweets, trous possibles)
 * pour savoir si la fréquence des lancements est suffisante.
 */

import { formatParis, formatDuration } from "./paris-time.mjs";

const HISTORY_DAYS = 7;
const DAY_MS = 24 * 3_600_000;
const SATURATION_THRESHOLD = 0.8;

/** @typedef {import("./store.mjs").MergeResult} MergeResult */

/**
 * @typedef {Object} RunReport
 * @property {string} run_at               Heure de Paris
 * @property {string} run_at_utc           Date ISO
 * @property {number} fetched              Tweets renvoyés par X (~100 max)
 * @property {number} new_tweets
 * @property {number} saturation           Part de nouveaux tweets (1 = tout était nouveau)
 * @property {boolean} gap_detected
 * @property {number} gap_minutes
 * @property {string} message
 */

/**
 * @typedef {Object} GapsFile
 * @property {string|null} updated_at
 * @property {RunReport|null} last_run
 * @property {Object} last_24h
 * @property {string} advice
 * @property {RunReport[]} runs           Historique sur HISTORY_DAYS jours, du plus récent au plus ancien
 */

/** @returns {GapsFile} */
export function createEmptyGaps() {
    return {
        updated_at: null,
        last_run: null,
        last_24h: {},
        advice: "",
        runs: [],
    };
}

/**
 * Ajoute le bilan du lancement et recalcule la synthèse.
 * @param {GapsFile} gaps
 * @param {MergeResult} merge
 * @param {number} fetched
 * @param {Date} now
 */
export function recordRun(gaps, merge, fetched, now) {
    const report = buildReport(merge, fetched, now);
    const historyStart = now.getTime() - HISTORY_DAYS * DAY_MS;

    gaps.runs = [report, ...gaps.runs].filter((run) => Date.parse(run.run_at_utc) >= historyStart);
    gaps.updated_at = report.run_at;
    gaps.last_run = report;
    gaps.last_24h = summarize(gaps.runs, now);
    gaps.advice = buildAdvice(gaps.last_24h);

    return report;
}

/**
 * @param {MergeResult} merge
 * @param {number} fetched
 * @param {Date} now
 * @returns {RunReport}
 */
function buildReport(merge, fetched, now) {
    const saturation = fetched > 0 ? merge.newTweets / fetched : 0;

    let message = `Aucun trou détecté : ${merge.newTweets} nouveaux tweets sur ${fetched} récupérés.`;
    if (!merge.newestKnownBefore) {
        message = `Premier lancement : ${fetched} tweets récupérés, pas de lancement précédent à comparer.`;
    }
    if (merge.gap) {
        message = `Trou possible de ${formatDuration(merge.gap.minutes)} entre ${formatParis(merge.gap.from)} et ${formatParis(merge.gap.to)} : `
            + "tous les tweets récupérés étaient nouveaux, certains ont pu être manqués.";
    }

    return {
        run_at: formatParis(now.toISOString()),
        run_at_utc: now.toISOString(),
        fetched,
        new_tweets: merge.newTweets,
        saturation: Math.round(saturation * 100) / 100,
        gap_detected: merge.gap !== null,
        gap_minutes: merge.gap ? merge.gap.minutes : 0,
        message,
    };
}

/**
 * @param {RunReport[]} runs
 * @param {Date} now
 */
function summarize(runs, now) {
    const dayStart = now.getTime() - DAY_MS;
    const recent = runs.filter((run) => Date.parse(run.run_at_utc) >= dayStart);
    const withGap = recent.filter((run) => run.gap_detected);

    let totalNew = 0;
    let maxNew = 0;
    let maxSaturation = 0;
    for (const run of recent) {
        totalNew += run.new_tweets;
        maxNew = Math.max(maxNew, run.new_tweets);
        maxSaturation = Math.max(maxSaturation, run.saturation);
    }

    return {
        runs: recent.length,
        runs_with_gap: withGap.length,
        total_gap: formatDuration(withGap.reduce((sum, run) => sum + run.gap_minutes, 0)),
        new_tweets: totalNew,
        max_new_tweets_per_run: maxNew,
        max_saturation: maxSaturation,
    };
}

/** @param {{runs_with_gap: number, max_saturation: number}} summary */
function buildAdvice(summary) {
    if (summary.runs_with_gap > 0) {
        return "Trous détectés sur les dernières 24 h : augmenter la fréquence des lancements.";
    }
    if (summary.max_saturation >= SATURATION_THRESHOLD) {
        return "Pas de trou, mais un lancement a vu plus de 80 % de nouveaux tweets : la fréquence est juste, envisager de l'augmenter.";
    }
    return "Fréquence suffisante : aucun trou sur les dernières 24 h.";
}
