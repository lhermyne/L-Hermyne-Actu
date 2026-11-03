import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Lit un fichier JSON, ou renvoie `fallback` s'il n'existe pas encore.
 * @template T
 * @param {string} path
 * @param {T} fallback
 * @returns {Promise<T>}
 */
export async function readJson(path, fallback) {
    let content;
    try {
        content = await readFile(path, "utf8");
    } catch (error) {
        if (error.code === "ENOENT") {
            return fallback;
        }
        throw error;
    }
    return JSON.parse(content);
}

/**
 * Écrit `data` en JSON indenté, en créant le dossier si besoin.
 * @param {string} path
 * @param {unknown} data
 */
export async function writeJson(path, data) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
