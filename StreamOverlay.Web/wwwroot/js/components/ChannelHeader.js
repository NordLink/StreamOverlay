
// Инициализация ("channel-name", { staticName: "OneGoldShow" }). Без { staticName: "OneGoldShow" } будет отображаться динамическое имя подключенного канала
export class ChannelHeader {
    constructor(elementId, options = {}) {
        this.element = document.getElementById(elementId);
        this.channels = {};
        this.staticName = options.staticName || null;

        if (this.staticName && this.element) {
            this.element.textContent = this.staticName;
        }
    }
    updateChannel(platform, displayName) {
        if (!this.element) return;
        if (this.staticName) return;
        this.channels[platform] = displayName || "—";
        this.render();
    }
    render() {
        if (this.staticName) return
        const items = Object.entries(this.channels)
            .filter(([_, name]) => name && name !== "—")
            .map(([_, name]) => name);
        this.element.textContent = items.length ? items.join(" / ") : "—";
    }
}