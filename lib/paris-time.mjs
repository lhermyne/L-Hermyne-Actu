const PARIS_FORMAT = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

/**
 * Formate une date ISO en heure de Paris : « 2026-11-03 09:12 ».
 * @param {string} iso
 */
export function formatParis(iso) {
    const parts = {};
    for (const part of PARIS_FORMAT.formatToParts(new Date(iso))) {
        parts[part.type] = part.value;
    }
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
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
