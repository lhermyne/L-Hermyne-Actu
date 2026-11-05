const PARIS_FORMAT = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

const HOUR_MS = 3_600_000;

/** @param {Date} date */
function readParisParts(date) {
    const parts = {};
    for (const part of PARIS_FORMAT.formatToParts(date)) {
        parts[part.type] = part.value;
    }
    return parts;
}

/**
 * Formate une date ISO en heure de Paris : « 2026-11-03 09:12 ».
 * @param {string} iso
 */
export function formatParis(iso) {
    const parts = readParisParts(new Date(iso));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * Renvoie le dernier instant, au plus tard à `date`, où il est pile l'une de ces
 * heures à Paris. Le décalage de Paris étant d'un nombre entier d'heures, on peut
 * remonter d'heure pleine en heure pleine.
 * @param {Date} date
 * @param {number[]} parisHours
 * @returns {Date}
 */
export function findLastParisHour(date, parisHours) {
    let candidate = Math.floor(date.getTime() / HOUR_MS) * HOUR_MS;

    while (!parisHours.includes(Number(readParisParts(new Date(candidate)).hour))) {
        candidate -= HOUR_MS;
    }
    return new Date(candidate);
}

/**
 * Durée lisible : « 1 h 23 min », « 45 min ».
 * @param {number} minutes
 */
export function formatDuration(minutes) {
    const rounded = Math.round(minutes);
    const hours = Math.floor(rounded / 60);
    const rest = rounded % 60;

    if (hours === 0) {
        return `${rest} min`;
    }
    return `${hours} h ${String(rest).padStart(2, "0")} min`;
}
