export class ViewerStats {
    constructor() {
        this.twitchEl = document.getElementById("twitchViewers");
        this.vkEl = document.getElementById("vkViewers");
        this.totalEl = document.getElementById("viewerCount");

        this.viewers = { twitch: 0, vk: 0 };
        this.live = { twitch: false, vk: false };
    }
    update(platform, count, isLive) {
        this.viewers[platform] = Number(count ?? 0);
        this.live[platform] = Boolean(isLive);
        this.render();
    }
    render() {
        if (!this.twitchEl || !this.vkEl || !this.totalEl) return;

        const twitch = this.viewers.twitch;
        const vk = this.viewers.vk;

        this.twitchEl.textContent = String(twitch);
        this.vkEl.textContent = String(vk);
        this.totalEl.textContent = String(twitch + vk);
    }
    isAnyLive() {
        return Object.values(this.live).some(status => status === true);
    }
}