//(() => {
//    const chatEl = document.getElementById("chat");
//    const channelNameEl = document.getElementById("channelName");
//    const viewerCountEl = document.getElementById("viewerCount");
//    const liveStatusEl = document.getElementById("liveStatus");
//    const state = {
//        channels: {},
//        viewers: {
//            twitch: 0,
//            vk: 0
//        },
//        live: {
//            twitch: null,
//            vk: null
//        },
//        connection: "CONNECTING"
//    };
//    const platformTitles = {
//        twitch: "TWITCH",
//        vk: "VK"
//    };
//    const platformColors = {
//        twitch: "#9146FF",
//        vk: "#2787F5"
//    };
//    function renderChannels() {
//        const items = Object.entries(state.channels)
//            .filter(([_, value]) => value)
//            .map(([platform, name]) => `${platformTitles[platform] || platform.toUpperCase()}: ${name}`);
//        channelNameEl.textContent = items.length ? items.join(" | ") : "—";
//    }
//    function renderViewers() {
//        const twitch = Number(state.viewers.twitch || 0);
//        const vk = Number(state.viewers.vk || 0);
//        const total = twitch + vk;

//        viewerCountEl.textContent = String(total);

//    }
//    function renderStatus() {
//        const parts = [];
//        if (state.connection) {
//            parts.push(state.connection);
//        }
//        ["twitch", "vk"].forEach(platform => {
//            const value = state.live[platform];
//            if (value === null) return;
//            parts.push(`${platformTitles[platform]}: ${value ? "LIVE" : "OFFLINE"}`);
//        });
//        liveStatusEl.textContent = parts.length ? parts.join(" | ") : "—";
//        if (state.connection === "RECONNECTING" || state.connection === "CONNECTING") {
//            liveStatusEl.style.color = "#fbbf24";
//            return;
//        }
//        const anyLive = Object.values(state.live).some(x => x === true);
//        liveStatusEl.style.color = anyLive ? "#00ffad" : "#ef4444";
//    }
//    function createPlatformBadge(platform) {
//        const badge = document.createElement("span");
//        badge.textContent = platformTitles[platform] || (platform || "UNK").toUpperCase();
//        badge.style.display = "inline-block";
//        badge.style.marginRight = "8px";
//        badge.style.padding = "2px 6px";
//        badge.style.borderRadius = "6px";
//        badge.style.background = platformColors[platform] || "#374151";
//        badge.style.color = "#ffffff";
//        badge.style.fontSize = "12px";
//        badge.style.fontWeight = "700";
//        badge.style.verticalAlign = "middle";
//        return badge;
//    }
//    function appendChatMessage(payload) {
//        const platform = (payload?.platform || "unknown").toLowerCase();
//        const line = document.createElement("div");
//        line.className = "chat-line";
//        const badge = createPlatformBadge(platform);
//        const user = document.createElement("span");
//        user.className = "user";
//        user.textContent = payload?.user || "Anonymous";
//        if (payload?.color) {
//            user.style.color = payload.color;
//        }
//        const sep = document.createTextNode(": ");
//        const msg = document.createElement("span");
//        msg.className = "msg";
//        msg.textContent = payload?.message || "";
//        line.appendChild(badge);
//        line.appendChild(user);
//        line.appendChild(sep);
//        line.appendChild(msg);
//        chatEl.appendChild(line);
//        const maxLines = 80;
//        while (chatEl.children.length > maxLines) {
//            chatEl.removeChild(chatEl.firstChild);
//        }
//        chatEl.scrollTo({
//            top: chatEl.scrollHeight,
//            behavior: "smooth"
//        });
//    }
//    const connection = new signalR.HubConnectionBuilder()
//        .withUrl("/chat")
//        .withAutomaticReconnect()
//        .build();
//    connection.on("channelInfo", (payload) => {
//        const platform = (payload?.platform || "").toLowerCase();
//        if (!platform) return;
//        const name = payload?.displayName || payload?.login || "—";
//        state.channels[platform] = name;
//        renderChannels();
//    });
//    connection.on("viewerCount", (payload) => {
//        console.log("Событие viewerCount получено:", payload); // ДОБАВЬТЕ ЭТО
//        const platform = (payload?.platform || "").toLowerCase();
//        if (!platform) return;
//        state.viewers[platform] = Number(payload?.count ?? 0);
//        state.live[platform] = Boolean(payload?.isLive);
//        renderViewers();
//        renderStatus();
//    });
//    connection.on("chatMessage", (payload) => {
//        appendChatMessage(payload);
//    });
//    async function start() {
//        try {
//            await connection.start();
//            console.log("SignalR connected");
//            state.connection = "CONNECTED";
//            renderStatus();
//        } catch (e) {
//            console.error("SignalR connection error:", e);
//            state.connection = "RECONNECTING";
//            renderStatus();
//            setTimeout(start, 5000);
//        }
//    }
//    connection.onreconnecting(() => {
//        state.connection = "RECONNECTING";
//        renderStatus();
//    });
//    connection.onreconnected(() => {
//        state.connection = "CONNECTED";
//        renderStatus();
//    });
//    connection.onclose(() => {
//        state.connection = "DISCONNECTED";
//        renderStatus();
//    });
//    renderChannels();
//    renderViewers();
//    renderStatus();
//    start();
//})();


(() => {
    // Элементы DOM
    const chatEl = document.getElementById("chat");
    const channelNameEl = document.getElementById("channelName");
    const viewerCountEl = document.getElementById("viewerCount");
    const twitchViewersEl = document.getElementById("twitchViewers");
    const vkViewersEl = document.getElementById("vkViewers");
    const liveStatusEl = document.getElementById("liveStatus");
    // Состояние приложения
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
    // Рендер названия канала
    function renderChannels() {
        const items = Object.entries(state.channels)
            .filter(([_, name]) => name)
            .map(([_, name]) => name);
        channelNameEl.textContent = items.length ? items.join(" / ") : "—";
    }
    // Рендер количества зрителей
    function renderViewers() {
        const twitch = Number(state.viewers.twitch || 0);
        const vk = Number(state.viewers.vk || 0);

        twitchViewersEl.textContent = String(twitch);
        vkViewersEl.textContent = String(vk);
        viewerCountEl.textContent = String(twitch + vk);
    }
    // Рендер статуса трансляции
    function renderStatus() {
        let statusText = "";
        let statusColor = "#ffffff";
        if (state.connection === "CONNECTING" || state.connection === "RECONNECTING") {
            statusText = state.connection;
            statusColor = "#fbbf24"; // Желтый при подключении
        } else {
            const anyLive = Object.values(state.live).some(x => x === true);
            statusText = anyLive ? "ONLINE" : "OFFLINE";
            statusColor = anyLive ? "#00ffad" : "#ef4444"; // Зеленый если онлайн, красный если оффлайн
        }
        liveStatusEl.textContent = statusText;
        liveStatusEl.style.color = statusColor;
    }
    // Создание бейджа платформы для чата
    function createPlatformBadge(platform) {
        const badge = document.createElement("span");
        badge.className = "platform-tag";
        badge.textContent = platformTitles[platform] || (platform || "UNK").toUpperCase();
        badge.style.background = platformColors[platform] || "#374151";
        return badge;
    }
    // Добавление сообщения в чат
    function appendChatMessage(payload) {
        const platform = (payload?.platform || "unknown").toLowerCase();
        const line = document.createElement("div");
        line.className = "chat-line";
        // Создаем бейдж [VK] или [TW]
        const badge = createPlatformBadge(platform);

        // Имя пользователя
        const user = document.createElement("span");
        user.className = "user";
        user.textContent = payload?.user || "Anonymous";
        if (payload?.color) {
            user.style.color = payload.color;
        }
        // Текст сообщения
        const msg = document.createElement("span");
        msg.className = "msg";
        msg.textContent = ": " + (payload?.message || "");
        // Собираем строку
        line.appendChild(badge);
        line.appendChild(user);
        line.appendChild(msg);
        chatEl.appendChild(line);
        // Лимит сообщений в чате
        const maxLines = 80;
        while (chatEl.children.length > maxLines) {
            chatEl.removeChild(chatEl.firstChild);
        }
        // Авто-скролл вниз
        chatEl.scrollTo({
            top: chatEl.scrollHeight,
            behavior: "smooth"
        });
    }
    // Настройка SignalR
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/chat")
        .withAutomaticReconnect()
        .build();
    // Слушатели событий
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
        renderStatus();
    });
    connection.on("chatMessage", (payload) => {
        appendChatMessage(payload);
    });
    // Запуск подключения
    async function start() {
        try {
            await connection.start();
            state.connection = "CONNECTED";
            renderStatus();
        } catch (e) {
            state.connection = "RECONNECTING";
            renderStatus();
            setTimeout(start, 5000);
        }
    }
    // Обработка состояний соединения
    connection.onreconnecting(() => {
        state.connection = "RECONNECTING";
        renderStatus();
    });
    connection.onreconnected(() => {
        state.connection = "CONNECTED";
        renderStatus();
    });
    connection.onclose(() => {
        state.connection = "DISCONNECTED";
        renderStatus();
    });
    // Инициализация
    renderChannels();
    renderViewers();
    renderStatus();
    start();
})();
