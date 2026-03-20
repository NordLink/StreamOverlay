(() => {
    const chatEl = document.getElementById("chat");
    const channelNameEl = document.getElementById("channelName");
    const viewerCountEl = document.getElementById("viewerCount");
    const twitchViewersEl = document.getElementById("twitchViewers");
    const vkViewersEl = document.getElementById("vkViewers");
    const liveStatusEl = document.getElementById("liveStatus");
    const worldEl = document.getElementById("world");
    const characterLayerEl = document.getElementById("characterLayer");
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
    const fallbackPalette = [
        "#FF0000", "#0000FF", "#008000", "#B22222", "#FF7F50",
        "#9ACD32", "#FF4500", "#2E8B57", "#DAA520", "#D2691E",
        "#5F9EA0", "#1E90FF", "#FF69B4", "#8A2BE2", "#00FF7F"
    ];
    const characters = new Map();
    const physics = {
        gravity: 1680,
        moveSpeed: 128,
        jumpStrength: 610,
        maxCharacters: 28,
        idleLifetimeMs: 120000
    };
    const world = {
        width: 0,
        height: 0,
        platforms: []
    };
    let lastFrameTime = performance.now();
    function fallbackUserColor(name) {
        const seed = (name || "anonymous").trim().toLowerCase();
        let hash = 5381;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
        }
        return fallbackPalette[Math.abs(hash) % fallbackPalette.length];
    }
    function resolveMessageColor(payload) {
        return payload?.color || fallbackUserColor(payload?.user || "anonymous");
    }
    function renderChannels() {
        const items = Object.entries(state.channels)
            .filter(([_, name]) => name)
            .map(([_, name]) => name);
        channelNameEl.textContent = items.length ? items.join(" / ") : "—";
    }
    function renderViewers() {
        const twitch = Number(state.viewers.twitch || 0);
        const vk = Number(state.viewers.vk || 0);
        twitchViewersEl.textContent = String(twitch);
        vkViewersEl.textContent = String(vk);
        viewerCountEl.textContent = String(twitch + vk);
    }
    function renderStatus() {
        let statusText = "";
        let statusColor = "#ffffff";
        if (state.connection === "CONNECTING" || state.connection === "RECONNECTING") {
            statusText = state.connection;
            statusColor = "#fbbf24";
        } else {
            const anyLive = Object.values(state.live).some(x => x === true);
            statusText = anyLive ? "ONLINE" : "OFFLINE";
            statusColor = anyLive ? "#00ffad" : "#ef4444";
        }
        liveStatusEl.textContent = statusText;
        liveStatusEl.style.color = statusColor;
    }
    function createPlatformBadge(platform) {
        const badge = document.createElement("span");
        badge.className = "platform-tag";
        badge.textContent = platformTitles[platform] || (platform || "UNK").toUpperCase();
        badge.style.background = platformColors[platform] || "#374151";
        return badge;
    }
    function appendChatMessage(payload) {
        const platform = (payload?.platform || "unknown").toLowerCase();
        const userColor = resolveMessageColor(payload);
        const line = document.createElement("div");
        line.className = "chat-line";
        const badge = createPlatformBadge(platform);
        const user = document.createElement("span");
        user.className = "user";
        user.textContent = payload?.user || "Anonymous";
        user.style.color = userColor;
        const msg = document.createElement("span");
        msg.className = "msg";
        msg.textContent = ": " + (payload?.message || "");
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
    function refreshWorldGeometry() {
        const worldRect = worldEl.getBoundingClientRect();
        world.width = worldRect.width;
        world.height = worldRect.height;
        world.platforms = [];
        worldEl.querySelectorAll(".platform").forEach((el) => {
            const rect = el.getBoundingClientRect();
            const x = rect.left - worldRect.left;
            const y = worldRect.bottom - rect.bottom;
            const height = rect.height;
            const width = rect.width;
            world.platforms.push({
                key: el.dataset.platform || "platform",
                x,
                y,
                width,
                height,
                top: y + height
            });
        });
        for (const character of characters.values()) {
            character.x = Math.max(0, Math.min(character.x, world.width - character.size));
            character.y = Math.max(getGroundTop(), character.y);
            renderCharacter(character);
        }
    }
    function getGroundTop() {
        const ground = world.platforms.find(p => p.key === "ground");
        return ground ? ground.top : 28;
    }
    function isOverPlatform(character, platform) {
        const characterLeft = character.x;
        const characterRight = character.x + character.size;
        return characterRight > platform.x + 8 && characterLeft < platform.x + platform.width - 8;
    }
    function getStandingPlatform(character) {
        let best = null;
        for (const platform of world.platforms) {
            if (!isOverPlatform(character, platform)) continue;
            if (Math.abs(character.y - platform.top) <= 4) {
                if (!best || platform.top > best.top) {
                    best = platform;
                }
            }
        }
        return best;
    }
    function getLandingPlatform(character, previousY) {
        let landing = null;
        for (const platform of world.platforms) {
            if (!isOverPlatform(character, platform)) continue;
            const crossedTop = previousY >= platform.top && character.y <= platform.top;
            if (!crossedTop) continue;
            if (!landing || platform.top > landing.top) {
                landing = platform;
            }
        }
        return landing;
    }
    function createCharacterElement(userName, color) {
        const el = document.createElement("div");
        el.className = "runner";
        const bubbleEl = document.createElement("div");
        bubbleEl.className = "runner-bubble";
        const labelEl = document.createElement("div");
        labelEl.className = "runner-name";
        labelEl.textContent = userName;
        labelEl.style.color = color;
        const bodyEl = document.createElement("div");
        bodyEl.className = "runner-body";
        bodyEl.style.setProperty("--runner-color", color);
        el.appendChild(bubbleEl);
        el.appendChild(labelEl);
        el.appendChild(bodyEl);
        characterLayerEl.appendChild(el);
        return { el, labelEl, bodyEl, bubbleEl };
    }
    function createCharacter(key, userName, color, platform) {
        const { el, labelEl, bodyEl, bubbleEl } = createCharacterElement(userName, color);
        const startY = getGroundTop();
        const startX = 24 + Math.random() * Math.max(60, world.width - 60);
        const character = {
            key,
            platform,
            userName,
            color,
            el,
            labelEl,
            bodyEl,
            bubbleEl,
            size: 30,
            x: startX,
            y: startY,
            vx: 0,
            vy: 0,
            dir: Math.random() < 0.5 ? -1 : 1,
            grounded: true,
            nextDecisionAt: performance.now() + 300 + Math.random() * 900,
            lastSeenAt: Date.now(),
            flashTimer: null,
            bubbleTimer: null
        };
        characters.set(key, character);
        renderCharacter(character);
        return character;
    }
    function renderCharacter(character) {
        character.el.style.left = `${character.x}px`;
        character.el.style.bottom = `${character.y}px`;
        character.el.classList.toggle("is-left", character.dir < 0);
    }
    function pulseCharacter(character) {
        character.el.classList.add("runner--active");
        if (character.flashTimer) {
            clearTimeout(character.flashTimer);
        }
        character.flashTimer = setTimeout(() => {
            character.el.classList.remove("runner--active");
        }, 55000);
    }
    function showCharacterBubble(character, text) {
        const raw = String(text || "").trim();
        if (!raw) return;
        const bubbleText = raw.length > 140
            ? raw.slice(0, 137) + "..."
            : raw;
        character.bubbleEl.textContent = bubbleText;
        character.bubbleEl.classList.add("is-visible");
        if (character.bubbleTimer) {
            clearTimeout(character.bubbleTimer);
        }
        const visibleMs = Math.min(5200, Math.max(2600, bubbleText.length * 42));
        character.bubbleTimer = setTimeout(() => {
            character.bubbleEl.classList.remove("is-visible");
        }, 5000);
    }
    function touchCharacterFromMessage(payload) {
        const platform = (payload?.platform || "unknown").toLowerCase();
        const userName = payload?.user || "Anonymous";
        const color = resolveMessageColor(payload);
        const key = `${platform}:${userName.trim().toLowerCase()}`;
        let character = characters.get(key);
        if (!character) {
            character = createCharacter(key, userName, color, platform);
        }
        character.platform = platform;
        character.userName = userName;
        character.color = color;
        character.lastSeenAt = Date.now();
        character.labelEl.textContent = userName;
        character.labelEl.style.color = color;
        character.bodyEl.style.setProperty("--runner-color", color);
        character.dir = Math.random() < 0.5 ? -1 : 1;
        character.nextDecisionAt = performance.now() + 250 + Math.random() * 700;
        if (character.grounded) {
            character.vy = physics.jumpStrength * (0.72 + Math.random() * 0.18);
            character.grounded = false;
        }
        showCharacterBubble(character, payload?.message || "");
        pulseCharacter(character);
        ensureCharacterLimit();
    }
    function ensureCharacterLimit() {
        if (characters.size <= physics.maxCharacters) return;
        const sorted = Array.from(characters.values())
            .sort((a, b) => a.lastSeenAt - b.lastSeenAt);
        while (sorted.length && characters.size > physics.maxCharacters) {
            const character = sorted.shift();
            removeCharacter(character.key);
        }
    }
    function removeCharacter(key) {
        const character = characters.get(key);
        if (!character) return;
        if (character.flashTimer) {
            clearTimeout(character.flashTimer);
        }
        if (character.bubbleTimer) {
            clearTimeout(character.bubbleTimer);
        }
        character.el.remove();
        characters.delete(key);
    }
    function cleanupIdleCharacters() {
        const now = Date.now();
        for (const character of characters.values()) {
            if (now - character.lastSeenAt > physics.idleLifetimeMs) {
                removeCharacter(character.key);
            }
        }
    }
    function chooseNextAction(character, now) {
        character.nextDecisionAt = now + 500 + Math.random() * 1400;
        const roll = Math.random();
        if (roll < 0.12) {
            character.dir = 0;
        } else if (roll < 0.56) {
            character.dir = -1;
        } else {
            character.dir = 1;
        }
        const standing = getStandingPlatform(character);
        const onGround = standing && standing.key === "ground";
        if (character.grounded) {
            if (onGround && Math.random() < 0.46) {
                character.vy = physics.jumpStrength * (0.92 + Math.random() * 0.18);
                character.grounded = false;
            } else if (!onGround && Math.random() < 0.24) {
                character.vy = physics.jumpStrength * (0.72 + Math.random() * 0.15);
                character.grounded = false;
            }
        }
    }
    function updateCharacter(character, dt, now) {
        if (now >= character.nextDecisionAt) {
            chooseNextAction(character, now);
        }
        const support = getStandingPlatform(character);
        character.grounded = Boolean(support && character.vy <= 0);
        if (!character.grounded) {
            character.vy -= physics.gravity * dt;
        } else {
            character.vy = Math.max(0, character.vy);
        }
        const targetVx = character.dir * physics.moveSpeed;
        character.vx += (targetVx - character.vx) * Math.min(1, dt * 5);
        const previousY = character.y;
        character.x += character.vx * dt;
        character.y += character.vy * dt;
        if (character.x < 0) {
            character.x = 0;
            character.dir = 1;
            character.vx = Math.abs(character.vx);
        }
        if (character.x > world.width - character.size) {
            character.x = world.width - character.size;
            character.dir = -1;
            character.vx = -Math.abs(character.vx);
        }
        if (character.vy <= 0) {
            const landing = getLandingPlatform(character, previousY);
            if (landing) {
                character.y = landing.top;
                character.vy = 0;
                character.grounded = true;
            }
        }
        const groundTop = getGroundTop();
        if (character.y < groundTop) {
            character.y = groundTop;
            character.vy = 0;
            character.grounded = true;
        }
        renderCharacter(character);
    }
    function animationLoop(timestamp) {
        const dt = Math.min(0.033, (timestamp - lastFrameTime) / 1000);
        lastFrameTime = timestamp;
        for (const character of characters.values()) {
            updateCharacter(character, dt, timestamp);
        }
        cleanupIdleCharacters();
        requestAnimationFrame(animationLoop);
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
        renderStatus();
    });
    connection.on("chatMessage", (payload) => {
        appendChatMessage(payload);
        touchCharacterFromMessage(payload);
    });
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
    window.addEventListener("resize", refreshWorldGeometry);
    renderChannels();
    renderViewers();
    renderStatus();
    refreshWorldGeometry();
    requestAnimationFrame(animationLoop);
    start();
    setTimeout(refreshWorldGeometry, 100);
})();