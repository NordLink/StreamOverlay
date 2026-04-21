import { resolveMessageColor } from '../utils/colorUtils.js';
import { formatMessageWithEmotes } from '../utils/messageUtils.js';
export class Chat {
    constructor(elementId, options = {}) {
        this.container = document.getElementById(elementId);
        this.container.classList.add('chat-list');
        this.maxLines = options.maxLines || 80;

        // Режим отображения платформы: 'tag' (по умолчанию) или 'border' (platformDisplay: 'border')
        this.platformDisplay = options.platformDisplay || 'tag';
        this.platformTitles = { twitch: "tw", vk: "vk" };
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
        const platformColor = this.platformColors[platform] || "#374151";
 
        const line = document.createElement("div");
        line.className = "chat-line";

        if (this.platformDisplay === 'tag') {
            const badge = this.createPlatformBadge(platform);
            line.appendChild(badge);
        } else if (this.platformDisplay === 'border') {
            line.style.borderRight = `6px solid ${platformColor}`;
            line.style.borderTopRightRadius = "6px";
            line.style.borderBottomRightRadius = "6px";
        }
       
        const user = document.createElement("span");
        user.className = "user";
        user.textContent = (payload?.user || "Anonymous") + ":";
        user.style.color = userColor;

        // Если используем border, убираем лишний левый отступ у имени, 
        if (this.platformDisplay === 'border') {
            user.style.marginLeft = "0";
        }
 
        const msg = document.createElement("span");
        msg.className = "msg";
        msg.innerHTML = formatMessageWithEmotes(payload.message || "", payload.emotes || []);

        line.append(user, msg); // badge уже добавлен выше, если выбран режим 'tag'
        this.container.appendChild(line);
        
        while (this.container.children.length > this.maxLines) {
            this.container.removeChild(this.container.firstChild);
        }
        
        this.container.scrollTo({
            top: this.container.scrollHeight,
            behavior: "smooth"
        });
    }
}