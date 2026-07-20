import { resolveMessageColor } from '../utils/colorUtils.js';
import { formatMessageWithEmotes } from '../utils/messageUtils.js';

export class Chat {
    constructor(elementId, options = {}) {
        this.container = document.getElementById(elementId);
        this.container.classList.add('chat-list');
        this.maxLines = options.maxLines || 50;
        this.showTime = options.showTime ?? true;
        this.showPlatformTag = options.showPlatformTag ?? true;
        this.showPlatformColor = options.showPlatformColor ?? true;
        this.platformTitles = { twitch: "tw", vk: "vk" };
        this.platformColors = { twitch: "#9146FF", vk: "#2787F5" };
    }

    createPlatformBadge(platform) {
        const badge = document.createElement("span");
        badge.className = "platform-tag";
        if (platform === "twitch") badge.classList.add("twitch");
        else if (platform === "vk") badge.classList.add("vk");
        else badge.classList.add("unknown");
        badge.setAttribute("aria-label", platform || "unknown platform");
        return badge;
    }

    appendMessage(payload) {

        if (!this.container) return;

        const platform = (payload?.platform || "unknown").toLowerCase();
        const userColor = resolveMessageColor(payload);

        const line = document.createElement("div");
        line.className = "chat-line";

        // Платформенный тег (иконка)
        if (this.showPlatformTag) {
            const badge = this.createPlatformBadge(platform);
            line.appendChild(badge);
        }
        // Выделенные сообщения
        if (payload.highlighted) {
            line.classList.add('message-highlight');
        }

        if (this.showPlatformColor) {
            if (platform === 'twitch') {
                line.classList.add('highlight-twitch');
            } else if (platform === 'vk') {
                line.classList.add('highlight-vk');
            }
           
        }

        // Время
        if (this.showTime) {
            const timeSpan = document.createElement("span");
            timeSpan.className = "send-time";
            timeSpan.textContent = payload?.time;
            line.appendChild(timeSpan);
        }

        // Имя пользователя
        const user = document.createElement("span");
        user.className = "user";
        user.textContent = (payload?.user || "Anonymous") + ":";
        user.style.color = userColor;

        // Текст сообщения (с эмодзи)
        const msg = document.createElement("span");
        msg.className = "msg";
        msg.innerHTML = formatMessageWithEmotes(payload.message || "", payload.emotes || []);

        line.append(user, msg);
        this.container.appendChild(line);

        // Ограничение количества строк
        while (this.container.children.length > this.maxLines) {
            this.container.removeChild(this.container.firstChild);
        }

        this.container.scrollTo({
            top: this.container.scrollHeight,
            behavior: "smooth"
        });
    }
}