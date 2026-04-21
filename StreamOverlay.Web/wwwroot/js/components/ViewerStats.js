export class ViewerStats {
    constructor(containerId) {
        this.container = document.getElementById(containerId);

        if (this.container) {
            this.container.innerHTML = `
                    <div class="info-block">
                        <div class="label">Twitch</div>
                        <div id="twitchViewers" class="value">0</div>
                    </div>
                    <div class="info-block">
                        <div class="label">VK</div>
                        <div id="vkViewers" class="value">0</div>
                    </div>
                    <div class="info-block">
                        <div class="label">Всего</div>
                        <div id="viewerCount" class="value">0</div>
                    </div>
            `;

            this.twitchEl = this.container.querySelector("#twitchViewers");
            this.vkEl = this.container.querySelector("#vkViewers");
            this.totalEl = this.container.querySelector("#viewerCount");
        }
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