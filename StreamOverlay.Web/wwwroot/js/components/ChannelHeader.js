export class ChannelHeader {
    constructor(elementId) {
        this.element = document.getElementById(elementId);
        this.channels = {};
    }
    updateChannel(platform, displayName) {
        if (!this.element) return;
        this.channels[platform] = displayName || "—";
        this.render();
    }
    render() {
        const items = Object.entries(this.channels)
            .filter(([_, name]) => name && name !== "—")
            .map(([_, name]) => name);

        this.element.textContent = items.length ? items.join(" / ") : "OneGoldShow";
    }
}