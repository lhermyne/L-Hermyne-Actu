#!/usr/bin/env node
/**
 * Lanceur local : récupère les tweets à intervalle régulier et publie le résultat
 * sur GitHub, en complément de l'action GitHub dont le cron est peu ponctuel.
 *
 * Chaque cycle travaille dans un clone réservé à cet usage :
 *   1. aligne le clone sur la version en ligne ;
 *   2. lance fetch-list-tweets.mjs, qui fusionne sans doublon ;
 *   3. commit et push ; si le push est refusé, recommence depuis l'étape 1.
 * Repartir de la version en ligne évite tout conflit Git sur les fichiers JSON.
 *
 * Usage :
 *   node watch-and-push.mjs [--interval 30] [--once] [--remote <url>] [--clone-dir <dossier>]
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

import { formatParis } from "./lib/paris-time.mjs";

// Le nom d'utilisateur dans l'URL fait utiliser le compte lhermyne pour ce dépôt seulement.
const DEFAULT_REMOTE = "https://lhermyne@github.com/lhermyne/L-Hermyne-Actu.git";
const DEFAULT_CLONE_DIR = join(homedir(), ".l-hermyne-actu");
const DEFAULT_INTERVAL_MINUTES = "30";
const BRANCH = "main";
const MAX_PUSH_ATTEMPTS = 3;
const PUSH_RETRY_DELAY_MS = 5_000;
const MINUTE_MS = 60_000;
const COLLECTOR_PATH = join(dirname(fileURLToPath(import.meta.url)), "fetch-list-tweets.mjs");

const run = promisify(execFile);

/**
 * @typedef {Object} Options
 * @property {string} remote
 * @property {string} cloneDir
 * @property {number} intervalMinutes
 * @property {boolean} once
 */

/** @returns {Options} */
function readOptions() {
    const { values } = parseArgs({
        options: {
            remote: { type: "string", default: DEFAULT_REMOTE },
            "clone-dir": { type: "string", default: DEFAULT_CLONE_DIR },
            interval: { type: "string", default: DEFAULT_INTERVAL_MINUTES },
            once: { type: "boolean", default: false },
        },
    });

    const intervalMinutes = Number(values.interval);
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
        throw new Error(`--interval invalide (minimum 1 minute) : ${values.interval}`);
    }

    return {
        remote: values.remote,
        cloneDir: resolve(values["clone-dir"]),
        intervalMinutes,
        once: values.once,
    };
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {Promise<string>} Sortie standard, sans espaces de fin
 */
async function git(cwd, args) {
    const { stdout } = await run("git", args, { cwd });
    return stdout.trim();
}

/**
 * Crée le clone s'il n'existe pas. Le dossier existant doit pointer vers le bon
 * dépôt, car le cycle y exécute un `reset --hard`.
 * @param {Options} options
 */
async function ensureClone(options) {
    if (!existsSync(options.cloneDir)) {
        await run("git", [
            "clone",
            "--depth", "1",
            "--branch", BRANCH,
            "--config", "core.autocrlf=false",
            options.remote,
            options.cloneDir,
        ]);
    }

    const origin = await git(options.cloneDir, ["remote", "get-url", "origin"]);
    if (origin !== options.remote) {
        throw new Error(`${options.cloneDir} pointe vers ${origin} au lieu de ${options.remote} : dossier refusé.`);
    }
}

/** @param {string} cloneDir */
async function alignOnRemote(cloneDir) {
    await git(cloneDir, ["fetch", "--depth", "1", "origin", BRANCH]);
    await git(cloneDir, ["reset", "--hard", "FETCH_HEAD"]);
}

/**
 * Crée un commit avec le dossier data, s'il a changé.
 * @param {string} cloneDir
 * @returns {Promise<boolean>} true si un commit a été créé
 */
async function commitData(cloneDir) {
    await git(cloneDir, ["add", "data"]);

    const changedFiles = await git(cloneDir, ["diff", "--cached", "--name-only"]);
    if (changedFiles === "") {
        return false;
    }

    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    await git(cloneDir, [
        "-c", "user.name=lhermyne-local",
        "-c", "user.email=lhermyne@users.noreply.github.com",
        "commit",
        "-m", `data: tweets du ${stamp} UTC (local)`,
    ]);
    return true;
}

// ---------------------------------------------------------------------------
// Cycle
// ---------------------------------------------------------------------------

/**
 * Lance le collecteur dans le dossier data du clone et renvoie son compte rendu.
 * @param {string} cloneDir
 */
async function collectTweets(cloneDir) {
    const { stdout } = await run(process.execPath, [COLLECTOR_PATH, "--data-dir", join(cloneDir, "data")]);
    return stdout.trim().replaceAll("\n", " ");
}

/**
 * Exécute un cycle complet, en recommençant si le push est refusé.
 * @param {Options} options
 */
async function runCycle(options) {
    await ensureClone(options);

    let lastError;
    for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
        await alignOnRemote(options.cloneDir);
        const summary = await collectTweets(options.cloneDir);

        if (!await commitData(options.cloneDir)) {
            return `${summary} Rien à publier.`;
        }

        try {
            await git(options.cloneDir, ["push", "origin", `HEAD:${BRANCH}`]);
            return `${summary} Publié.`;
        } catch (error) {
            if (isPermissionError(error)) {
                throw new Error(`Compte Git sans droit d'écriture sur ce dépôt : ${error.stderr ?? error.message}`);
            }
            lastError = error;
            log(`Push refusé (essai ${attempt}/${MAX_PUSH_ATTEMPTS}), nouvel essai depuis la version en ligne.`);
            await sleep(PUSH_RETRY_DELAY_MS);
        }
    }

    throw lastError;
}

/**
 * Réessayer ne sert à rien si le compte n'a pas les droits.
 * @param {Error & {stderr?: string}} error
 */
function isPermissionError(error) {
    return /Permission to .* denied|error: 403/.test(error.stderr ?? error.message);
}

function log(message) {
    console.log(`[${formatParis(new Date().toISOString())}] ${message}`);
}

function sleep(ms) {
    return new Promise((done) => setTimeout(done, ms));
}

/** Boucle sans fin : l'échec d'un cycle n'arrête pas les suivants. */
async function watch(options) {
    log(`Démarrage : un cycle toutes les ${options.intervalMinutes} min. Ctrl+C pour arrêter.`);

    while (true) {
        try {
            log(await runCycle(options));
        } catch (error) {
            log(`Échec du cycle : ${error.message}`);
        }
        await sleep(options.intervalMinutes * MINUTE_MS);
    }
}

async function main() {
    const options = readOptions();

    if (options.once) {
        log(await runCycle(options));
        return;
    }
    await watch(options);
}

main().catch((error) => {
    console.error(`Erreur : ${error.message}`);
    process.exit(1);
});
