#!/usr/bin/env node
/**
 * Récupère les derniers tweets d'une liste X (Twitter) et les accumule sur une
 * fenêtre glissante (24 h par défaut). À lancer régulièrement (toutes les 30 min
 * à 1 h), car X ne fournit sans connexion que les ~100 derniers tweets.
 *
 * Fichiers produits (dans data/ à côté du script, par défaut) :
 *   - tweets.json          tous les tweets de la fenêtre, sans doublon
 *   - tweets-compact.json  version allégée pour une IA (auteur, heure de Paris, texte)
 *   - gaps.json            bilan des lancements et trous possibles
 *
 * Aucune dépendance : Node.js >= 18. Aucun compte, cookie ni navigateur.
 *
 * Usage :
 *   node fetch-list-tweets.mjs [--list <id|url>] [--hours 24] [--data-dir data]
 */

import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { fetchListTimeline, extractListId } from "./lib/syndication.mjs";
import { createEmptyStore, mergeTimeline } from "./lib/store.mjs";
import { buildCompact } from "./lib/compact.mjs";
import { createEmptyGaps, recordRun } from "./lib/gaps.mjs";
import { readJson, writeJson } from "./lib/json-file.mjs";

const DEFAULT_LIST_ID = "1896274078501126399";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {Object} Options
 * @property {string} listId
 * @property {number} hours
 * @property {{tweets: string, compact: string, gaps: string}} paths
 */

/** @returns {Options} */
function readOptions() {
    const { values } = parseArgs({
        options: {
            list: { type: "string", default: DEFAULT_LIST_ID },
            hours: { type: "string", default: "24" },
            "data-dir": { type: "string", default: join(SCRIPT_DIR, "data") },
        },
    });

    const hours = Number(values.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error(`--hours invalide : ${values.hours}`);
    }

    const dataDir = resolve(values["data-dir"]);
    return {
        listId: extractListId(values.list),
        hours,
        paths: {
            tweets: join(dataDir, "tweets.json"),
            compact: join(dataDir, "tweets-compact.json"),
            gaps: join(dataDir, "gaps.json"),
        },
    };
}

async function main() {
    const options = readOptions();
    const now = new Date();

    const store = await readJson(options.paths.tweets, createEmptyStore(options.listId));
    const gaps = await readJson(options.paths.gaps, createEmptyGaps());

    const timeline = await fetchListTimeline(options.listId);
    const merge = mergeTimeline(store, timeline, { now, windowHours: options.hours });
    const report = recordRun(gaps, merge, timeline.tweets.length, now);

    await writeJson(options.paths.tweets, store);
    await writeJson(options.paths.compact, buildCompact(store));
    await writeJson(options.paths.gaps, gaps);

    console.log(`${merge.newTweets} nouveaux tweets, ${store.count} sur les ${options.hours} dernières heures.`);
    console.log(report.message);
}

main().catch((error) => {
    console.error(`Erreur : ${error.message}`);
    process.exit(1);
});
