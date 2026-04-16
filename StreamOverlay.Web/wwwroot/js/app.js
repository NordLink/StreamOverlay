import { initCharacterWorld, spawnCharacterFromMessage } from './characters.js';
import { resolveMessageColor, fallbackUserColor } from './colorUtils.js';
import { formatMessageWithEmotes } from './messageUtils.js';

(() => {
    const chatEl = document.getElementById("chat");
    const channelNameEl = document.getElementById("channelName");
    const viewerCountEl = document.getElementById("viewerCount");
    const twitchViewersEl = document.getElementById("twitchViewers");
    const vkViewersEl = document.getElementById("vkViewers");

    const state = {
        channels: {},
        viewers: {
            twitch: 0,
            vk: 0
        },
        live: {
            twitch: null,
            vk: null
        },
        connection: "CONNECTING"
    };
    const platformTitles = {
        twitch: "TW",
        vk: "VK"
    };
    const platformColors = {
        twitch: "#9146FF",
        vk: "#2787F5"
    };
  

    let platformsData = [];
    
    let lastFrameTime = performance.now();

    function renderChannels() {
        const items = Object.entries(state.channels)
            .filter(([_, name]) => name)
            .map(([_, name]) => name);
        channelNameEl.textContent = items.length ? items.join(" / ") : "OneGoldShow";
    }
    function renderViewers() {
        const twitch = Number(state.viewers.twitch || 0);
        const vk = Number(state.viewers.vk || 0);
        twitchViewersEl.textContent = String(twitch);
        vkViewersEl.textContent = String(vk);
        viewerCountEl.textContent = String(twitch + vk);
    }
    function statusLogger() {
        let statusText = ""
        if (state.connection === "CONNECTING" || state.connection === "RECONNECTING") {
            statusText = state.connection;
        } else {
            const anyLive = Object.values(state.live).some(x => x === true);
            statusText = anyLive ? "ONLINE" : "OFFLINE";
        }
        console.log("ConnectionStatus: " + statusText)
    }
    function createPlatformBadge(platform) {
        const badge = document.createElement("span");
        badge.className = "platform-tag";
        badge.textContent = platformTitles[platform] || (platform || "UNK").toUpperCase();
        badge.style.background = platformColors[platform] || "#374151";
        return badge;
    }

    
 
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
   
    function appendChatMessage(payload) {
        const platform = (payload?.platform || "unknown").toLowerCase();
        const userColor = resolveMessageColor(payload);

        const line = document.createElement("div");
        line.className = "chat-line";

        const badge = createPlatformBadge(platform);

        const user = document.createElement("span");
        user.className = "user";
        user.textContent = (payload?.user || "Anonymous") + ":";
        user.style.color = userColor;

        const msg = document.createElement("span");
        msg.className = "msg";

        msg.innerHTML = formatMessageWithEmotes(payload.message || "", payload.emotes || []);

        line.appendChild(badge);
        line.appendChild(user);
        line.appendChild(msg);
        chatEl.appendChild(line);
        const maxLines = 80;
        while (chatEl.children.length > maxLines) {
            chatEl.removeChild(chatEl.firstChild);
        }
        chatEl.scrollTo({
            top: chatEl.scrollHeight,
            behavior: "smooth"
        });
    }
  
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/chat")
        .withAutomaticReconnect()
        .build();
    connection.on("channelInfo", (payload) => {
        const platform = (payload?.platform || "").toLowerCase();
        if (!platform) return;
        state.channels[platform] = payload?.displayName || payload?.login || "—";
        renderChannels();
    });

    connection.on("viewerCount", (payload) => {
        const platform = (payload?.platform || "").toLowerCase();
        if (!platform) return;
        state.viewers[platform] = Number(payload?.count ?? 0);
        state.live[platform] = Boolean(payload?.isLive);
        renderViewers();
        statusLogger();
    });

    connection.on("chatMessage", (payload) => {
        appendChatMessage(payload);
        spawnCharacterFromMessage(payload);
    });

    async function start() {
        try {
            await connection.start();
            state.connection = "CONNECTED";
            statusLogger();
        } catch (e) {
            state.connection = "RECONNECTING";
            statusLogger();
            setTimeout(start, 5000);
        }
    }
    connection.onreconnecting(() => {
        state.connection = "RECONNECTING";
        statusLogger();
    });
    connection.onreconnected(() => {
        state.connection = "CONNECTED";
        statusLogger();
    });
    connection.onclose(() => {
        state.connection = "DISCONNECTED";
        statusLogger();
    });

    initCharacterWorld();
    renderChannels();
    renderViewers();
    statusLogger();
    start();
})();