// Генератор цветов на случай, если цвет ника не определен сервером

const fallbackPalette = [
    "#FF0000", "#0000FF", "#008000", "#B22222", "#FF7F50",
    "#9ACD32", "#FF4500", "#2E8B57", "#DAA520", "#D2691E",
    "#5F9EA0", "#1E90FF", "#FF69B4", "#8A2BE2", "#00FF7F"
];

export function fallbackUserColor(name) {
    const seed = (name || "anonymous").trim().toLowerCase();
    let hash = 5381;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    }
    return fallbackPalette[Math.abs(hash) % fallbackPalette.length];
}

export function resolveMessageColor(payload) {
    return payload?.color || fallbackUserColor(payload?.user || "anonymous");
}