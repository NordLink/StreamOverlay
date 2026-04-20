import { resolveMessageColor } from '../utils/colorUtils.js';
import { formatMessageWithEmotes } from '../utils/messageUtils.js';
export class Chat {
    constructor(elementId, maxLines = 80) {
        this.container = document.getElementById(elementId);
        this.maxLines = maxLines;
        this.platformTitles = { twitch: "TW", vk: "VK" };
        this.platformColors = { twitch: "#9146FF", vk: "#2787F5" };
    }
    createPlatformBadge(platform) {
        const badge = document.createElement("span");
        badge.className = "platform-tag";
        badge.textContent = this.platformTitles[platform] || (platform || "UNK").toUpperCase();
        badge.style.background = this.platformColors[platform] || "#374151";
        return badge;
    }
    appendMessage(payload) {
      
        if (!this.container) return;
        const platform = (payload?.platform || "unknown").toLowerCase();
        const userColor = resolveMessageColor(payload);
        // Создаем строку чата
        const line = document.createElement("div");
        line.className = "chat-line";
        // Бейдж платформы
        const badge = this.createPlatformBadge(platform);
        // Имя пользователя
        const user = document.createElement("span");
        user.className = "user";
        user.textContent = (payload?.user || "Anonymous") + ":";
        user.style.color = userColor;
        // Сообщение
        const msg = document.createElement("span");
        msg.className = "msg";
        msg.innerHTML = formatMessageWithEmotes(payload.message || "", payload.emotes || []);
        // Собираем элемент
        line.append(badge, user, msg);
        this.container.appendChild(line);
        // Очистка старых сообщений
        while (this.container.children.length > this.maxLines) {
            this.container.removeChild(this.container.firstChild);
        }
        
        // Автоскролл
        this.container.scrollTo({
            top: this.container.scrollHeight,
            behavior: "smooth"
        });
    }
}