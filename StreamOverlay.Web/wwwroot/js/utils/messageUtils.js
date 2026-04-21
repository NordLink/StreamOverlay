export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
export function formatMessageWithEmotes(message, emotes) {
    if (!emotes || emotes.length === 0) {
        return escapeHtml(message);
    }
    let result = escapeHtml(message);
    const placeholders = emotes.map((emote, index) => {
        const placeholder = `__EMOTE_MARKER_${index}__`;
        return {
            name: emote.name,
            url: emote.url,
            placeholder: placeholder
        };
    });

    placeholders.sort((a, b) => b.name.length - a.name.length);

    placeholders.forEach(item => {
        const escapedName = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
        result = result.replace(regex, item.placeholder);
    });

    placeholders.forEach(item => {
        const imgTag = `<img src="${item.url}" alt="${item.name}" class="chat-emote" />`;
        result = result.split(item.placeholder).join(imgTag);
    });
    return result;
}