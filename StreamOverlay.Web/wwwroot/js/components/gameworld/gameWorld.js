import { resolveMessageColor } from '../../utils/colorUtils.js';
import { formatMessageWithEmotes } from '../../utils/messageUtils.js';
import TurtleRenderer from './turtleRenderer.js';

// СИСТЕМЫ

class PhysicsSystem {
    static applyGravityAndMovement(physics, platforms, worldWidth, worldHeight, config) {
        physics.vy += config.GRAVITY;
        const prevY = physics.colliderY;

        physics.colliderX += physics.vx;
        physics.colliderY += physics.vy;

        // границы мира
        if (physics.colliderX < 0) {
            physics.colliderX = 0;
            if (!physics.isFighting && physics.state !== 'dead') physics.vx *= -1;
            else physics.vx = 0;
        } else if (physics.colliderX + physics.colliderWidth > worldWidth) {
            physics.colliderX = worldWidth - physics.colliderWidth;
            if (!physics.isFighting && physics.state !== 'dead') physics.vx *= -1;
            else physics.vx = 0;
        }

        physics.isGrounded = false;

        // коллизии с платформами (только при движении вниз)
        if (physics.vy > 0) {
            for (let p of platforms) {
                if (prevY + physics.colliderHeight <= p.top &&
                    physics.colliderY + physics.colliderHeight >= p.top &&
                    physics.colliderX + physics.colliderWidth > p.left &&
                    physics.colliderX < p.right) {

                    physics.colliderY = p.top - physics.colliderHeight;
                    physics.vy = 0;
                    physics.isGrounded = true;

                    if (!physics.isFighting && physics.state !== 'dead') {
                        physics.state = physics.vx === 0 ? 'idle' : 'walking';
                    }
                    break;
                }
            }
        }

        // пол (нижняя граница мира)
        if (physics.colliderY + physics.colliderHeight >= worldHeight) {
            physics.colliderY = worldHeight - physics.colliderHeight;
            physics.vy = 0;
            physics.isGrounded = true;
            if (!physics.isFighting && physics.state !== 'dead') {
                physics.state = physics.vx === 0 ? 'idle' : 'walking';
            }
        }
    }
}

class AISystem {
    static updateWandering(physics, walkSpeedPxPerFrame, config, delta) {
        if (physics.state === 'dead') return;

        physics.actionTimer -= delta;
        if (physics.actionTimer <= 0 && physics.isGrounded) {
            physics.actionTimer = Math.random() * 2000 + 500;
            const rand = Math.random();

            if (rand < 0.3) physics.vx = -walkSpeedPxPerFrame;
            else if (rand < 0.6) physics.vx = walkSpeedPxPerFrame;
            else if (rand < 0.8) {
                physics.vy = config.JUMP_POWER;
                physics.isGrounded = false;
                physics.state = 'jumping';
            } else {
                physics.vx = 0;
                physics.state = 'idle';
            }
        }
    }
}

class CombatSystem {
    static processFight(key, entry, characters, config, walkSpeedPxPerFrame, delta, now, worldWidth, onFightEnd) {
        const physics = entry.physics;
        const renderer = entry.renderer;
        const target = characters.get(physics.fightTargetKey);

        if (!target || target.physics.state === 'dead') {
            onFightEnd(key, physics.fightTargetKey);
            return;
        }

        // Сближение перед боем
        if (physics.fightMoveToTarget) {
            const currCenter = physics.colliderX + physics.colliderWidth / 2;
            const targetCenter = target.physics.colliderX + target.physics.colliderWidth / 2;
            const dx = targetCenter - currCenter;
            const distance = Math.abs(dx);
            const desiredDistance = physics.fullWidth * 1;

            if (distance < desiredDistance) {
                physics.fightMoveToTarget = false;
                physics.vx = 0;
                target.physics.fightMoveToTarget = false;
                target.physics.vx = 0;

                const overlap = desiredDistance - distance;
                if (overlap > 0) {
                    const correction = overlap / 2;
                    if (currCenter < targetCenter) {
                        physics.colliderX -= correction;
                        target.physics.colliderX += correction;
                    } else {
                        physics.colliderX += correction;
                        target.physics.colliderX -= correction;
                    }
                    physics.colliderX = Math.max(0, Math.min(worldWidth - physics.colliderWidth, physics.colliderX));
                    target.physics.colliderX = Math.max(0, Math.min(worldWidth - target.physics.colliderWidth, target.physics.colliderX));
                }

                if (!physics.fightCanAttack && !target.physics.fightCanAttack) {
                    physics.fightCanAttack = true;
                }
            } else {
                physics.vx = (dx > 0 ? walkSpeedPxPerFrame : -walkSpeedPxPerFrame);
            }
            return;
        }

        // Ближний бой – поочередные удары
        if (physics.fightCanAttack) {
            physics.fightAttackTimer += delta;
            if (physics.fightAttackTimer >= 1000) {
                renderer.playAttackEffect();

                if (physics.fightTimeout) clearTimeout(physics.fightTimeout);
                physics.fightTimeout = setTimeout(() => {

                    const currentTarget = characters.get(physics.fightTargetKey);
                    if (!currentTarget || currentTarget.physics.state === 'dead' || !currentTarget.physics.isFighting) {
                        return;
                    }

                    const damagePercent = Math.random() * 0.30 + 0.01;
                    const damageMs = config.MAX_LIFETIME * damagePercent;
                    currentTarget.physics.dieTime -= damageMs;

                    const damageValue = Math.round(damagePercent * 100);

                    if (currentTarget.renderer.playHitEffect) {
                        currentTarget.renderer.playHitEffect();
                    }
                    currentTarget.renderer.showDamage(damageValue);

                    physics.fightCanAttack = false;
                    currentTarget.physics.fightCanAttack = true;
                    currentTarget.physics.fightAttackTimer = 0;

                    if (physics.fightTimeout) physics.fightTimeout = null;
                }, 300);

                physics.fightAttackTimer = 0;
            }
        } else {
            physics.fightAttackTimer = 0;
        }

        physics.actionTimer = 0;
    }
}

// ГЛАВНЫЙ КЛАСС

export class GameWorld {
    constructor(elementId, customConfig = {}, onDuelEndCallback = null, connectionService = null) {
        this.world = document.getElementById(elementId);
        if (!this.world) throw new Error(`Элемент с id "${elementId}" не был найден`);

        this.characterRenderers = new Map();
        this.registerCharacterRenderer('turtle', TurtleRenderer);

        this.characters = new Map();
        this.platformsData = [];

        const defaultConfig = {
            GRAVITY: 0.4,
            JUMP_POWER: -8,
            WALK_SPEED_PERCENT_PER_SECOND: 5,
            CHAR_SIZE: 4,
            COLLIDER_WIDTH_PERCENT: 50,
            DEBUG_COLLIDER: false,
            WORLD_HEIGHT: 400,
            MAX_LIFETIME: 900000,
            MAX_CHARACTERS: 20,
            MAX_MESSAGE_LENGTH: 160,
            TARGET_FPS: 60,
            character: 'turtle'
        };
        this.config = { ...defaultConfig, ...customConfig };

        this.onDuelEndCallback = onDuelEndCallback;

        this.platformSettings = [
            { left: 87, top: 77.5, width: 13, height: 20 },
            { left: 60.5, top: 62, width: 2.5, height: 20 },
            { left: 49.5, top: 63, width: 6.5, height: 20 },
            { left: 49.3, top: 81.25, width: 7, height: 20 },
            { left: 18.5, top: 63, width: 6.5, height: 20 },
            { left: 18.3, top: 81.25, width: 7, height: 20 },
            { left: 12, top: 62, width: 2.5, height: 20 }
        ];

        this.walkSpeedPxPerFrame = 0;
        this._lastTimestamp = 0;
        this._animationId = null;

        this.connectionService = connectionService;
        this.leaderboardElement = null;

        this._animationLoop = this._animationLoop.bind(this);
        this._handleResize = this._handleResize.bind(this);
    }

    registerCharacterRenderer(type, rendererClass) {
        this.characterRenderers.set(type, rendererClass);
    }

    init() {
        this._createPlatforms(this.platformSettings);
        this._updateSpeedScale();
        window.addEventListener('resize', this._handleResize);

        this._createLeaderboardElement();
        this._setupLeaderboardUpdates();

        this._animationId = requestAnimationFrame(this._animationLoop);
    }

    destroy() {
        if (this._animationId) {
            cancelAnimationFrame(this._animationId);
            this._animationId = null;
        }
        window.removeEventListener('resize', this._handleResize);

        for (let entry of this.characters.values()) {
            if (entry.physics.fightTimeout) {
                clearTimeout(entry.physics.fightTimeout);
                entry.physics.fightTimeout = null;
            }
            entry.renderer.destroy(true);
        }
        this.characters.clear();

        if (this.leaderboardElement) {
            this.leaderboardElement.remove();
            this.leaderboardElement = null;
        }
    }

    _createLeaderboardElement() {
        this.leaderboardElement = document.createElement('div');
        this.leaderboardElement.className = 'game-leaderboard';
        this.world.appendChild(this.leaderboardElement);
        this.leaderboardElement.innerHTML = '<div class="loading">📊 Загрузка...</div>';
    }

    _setupLeaderboardUpdates() {
        if (!this.connectionService) return;

        this.connectionService.onLeaderboardUpdateCallback = (data) => {
            this.renderLeaderboard(data);
        };

        this._waitForConnectionAndRequest();
    }

    async _waitForConnectionAndRequest() {
        for (let i = 0; i < 20; i++) {
            if (this.connectionService.status === 'CONNECTED') {
                await this.connectionService.requestLeaderboard();
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        console.warn("Не удалось запросить лидерборд: таймаут соединения");
        if (this.leaderboardElement) {
            this.leaderboardElement.innerHTML = '<div class="error">⚠️ Топ временно недоступен</div>';
        }
    }

    renderLeaderboard(data) {
        if (!this.leaderboardElement) return;

        let html = `<div class="leaderboard-header">🏆 ЛУЧШИЕ ГЛАДИАТОРЫ</div>`;
        html += `<div class="leaderboard-table">
            <div class="table-header">
                <span class="col-place">#</span>
                <span class="col-name">Игрок</span>
                <span class="col-wins">В</span>
                <span class="col-losses">П</span>
                <span class="col-total">И</span>
                <span class="col-diff">%</span>
            </div>`;

        if (data.topWins && data.topWins.length) {
            data.topWins.forEach((entry, index) => {
                const displayName = this._getDisplayName(entry.name);
                const winrateClass = entry.winRate >= 50 ? 'positive' : 'negative';
                const nameStyle = entry.color ? `style="color: ${entry.color}"` : '';

                html += `<div class="table-row">
        <span class="col-place">${index + 1}</span>
        <span class="col-name" ${nameStyle} title="${this._escapeHtml(displayName)}">${this._escapeHtml(displayName)}</span>
        <span class="col-wins">${entry.wins}</span>
        <span class="col-losses">${entry.losses}</span>
        <span class="col-total">${entry.totalDuels}</span>
        <span class="col-diff ${winrateClass}">${entry.winRate}</span>
    </div>`;
            });
        } else {
            html += `<div class="empty">Нет данных</div>`;
        }

        html += `</div>`;

        if (data.topStreaks && data.topStreaks.length) {
            const validStreaks = data.topStreaks.filter(group => group.wins > 0);
            if (validStreaks.length) {
                let tickerText = '🔥 ТОП ВИНСТРИКИ ЗА ВСЁ ВРЕМЯ 🔥 • ';
                validStreaks.forEach((group, idx) => {
                    const playersHtml = group.players.map(player => {
                        const displayName = this._getDisplayName(player.name);
                        const colorStyle = player.color ? `style="color: ${player.color}"` : '';
                        return `<span ${colorStyle}>${this._escapeHtml(displayName)}</span>`;
                    }).join(', ');

                    let medal = '';
                    if (idx === 0) medal = '🥇 1е место: ';
                    else if (idx === 1) medal = '🥈 2е место: ';
                    else if (idx === 2) medal = '🥉 3е место: ';
                    tickerText += `${medal}${playersHtml} — ${group.wins} подряд • `;
                });
                tickerText = tickerText.slice(0, -3);
                html += `<div class="ticker-container">
                <div class="ticker-text">${tickerText}</div>
             </div>`;
            }
        } else {
            if (data.topStreak && data.topStreak.wins > 0) {
                const streakName = this._getDisplayName(data.topStreak.name);
                const tickerText = `🔥 Топ винстрик: ${streakName} — ${data.topStreak.wins} подряд`;
                html += `<div class="ticker-container">
                        <div class="ticker-text">${this._escapeHtml(tickerText)}</div>
                     </div>`;
            }
        }

        this.leaderboardElement.innerHTML = html;
    }

    _getDisplayName(fullKey) {
        const parts = fullKey.split(':');
        return parts.length > 1 ? parts[1] : fullKey;
    }

    _escapeHtml(str) {
        return str.replace(/[&<>]/g, function (m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    _updateSpeedScale() {
        const worldWidth = this.world.offsetWidth;
        if (worldWidth === 0) return;
        const pixelsPerSecond = (this.config.WALK_SPEED_PERCENT_PER_SECOND / 100) * worldWidth;
        this.walkSpeedPxPerFrame = pixelsPerSecond / this.config.TARGET_FPS;
    }

    _getComputedPlatforms() {
        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;
        return this.platformsData.map(p => ({
            left: (p.leftPercent / 100) * worldWidth,
            right: ((p.leftPercent + p.widthPercent) / 100) * worldWidth,
            top: (p.topPercent / 100) * worldHeight,
            bottom: (p.topPercent / 100) * worldHeight + p.height
        }));
    }

    _createPlatforms(pData) {
        pData.forEach(p => {
            const plat = document.createElement('div');
            plat.className = 'platform';
            plat.style.left = p.left + '%';
            plat.style.top = p.top + '%';
            plat.style.width = p.width + '%';
            plat.style.height = p.height + 'px';
            this.world.appendChild(plat);

            this.platformsData.push({
                leftPercent: p.left,
                topPercent: p.top,
                widthPercent: p.width,
                height: p.height
            });
        });
    }

    _parseTargetSpecifier(spec, defaultPlatform) {
        if (!spec) return null;
        spec = spec.trim();

        if (spec.includes(':')) {
            const [platform, nickname] = spec.split(':', 2);
            if (platform && nickname) {
                return { platform: platform.toLowerCase(), nickname: nickname.trim() };
            }
        } else if (spec.includes('@')) {
            const [nickname, platform] = spec.split('@', 2);
            if (nickname && platform) {
                return { platform: platform.toLowerCase(), nickname: nickname.trim() };
            }
        } else {
            return { platform: defaultPlatform, nickname: spec };
        }
        return null;
    }

    _findCharacterByNickname(nickname, excludeKey = null) {
        const results = [];
        for (let [key, entry] of this.characters.entries()) {
            if (excludeKey && key === excludeKey) continue;
            if (entry.physics.nickname.toLowerCase() === nickname.toLowerCase()) {
                results.push({ key, entry });
            }
        }
        return results;
    }

    _resolveDuelTarget(attackerKey, targetSpec) {
        const attackerPlatform = attackerKey.split(':')[0];
        const parsed = this._parseTargetSpecifier(targetSpec, attackerPlatform);
        if (!parsed) {
            return { success: false, message: "Некорректный формат цели. Используйте: ник или платформа:ник или ник@платформа" };
        }

        const { platform, nickname } = parsed;
        const exactKey = `${platform}:${nickname}`;

        if (this.characters.has(exactKey)) {
            const target = this.characters.get(exactKey);
            if (target.physics.state === 'dead') {
                return { success: false, message: `Цель ${nickname} мертва и не может сражаться` };
            }
            if (target.physics.isFighting) {
                return { success: false, message: `Цель ${nickname} уже в бою` };
            }
            return { success: true, targetKey: exactKey };
        }

        const candidates = this._findCharacterByNickname(nickname);
        if (candidates.length === 0) {
            return { success: false, message: `Персонаж с ником "${nickname}" не найден` };
        }
        if (candidates.length === 1) {
            const targetKey = candidates[0].key;
            const target = candidates[0].entry;
            if (target.physics.state === 'dead') {
                return { success: false, message: `Цель ${nickname} мертва` };
            }
            if (target.physics.isFighting) {
                return { success: false, message: `Цель ${nickname} уже в бою` };
            }
            return { success: true, targetKey };
        }

        const platformList = candidates.map(c => c.key.split(':')[0]).join(', ');
        return {
            success: false,
            message: `Найдено несколько персонажей с ником "${nickname}" на платформах: ${platformList}. Уточните, указав платформу, например: ${candidates[0].key}`
        };
    }

    spawnFromMessage(payload) {
        const platform = (payload?.platform || "unknown").toLowerCase();
        const userName = payload?.user || "Anonymous";
        const color = resolveMessageColor(payload);
        const message = payload?.message || "";
        const emotes = payload?.emotes || [];
        const attackerKey = `${platform}:${userName.trim().toLowerCase()}`;

        if (message.trim().toLowerCase().startsWith('!дуэль')) {
            const match = message.trim().match(/^!дуэль\s+(.+)$/i);
            const hasTarget = !!match;
            const targetSpec = hasTarget ? match[1].trim() : null;

            let attacker = this.characters.get(attackerKey);
            let isNew = false;
            if (!attacker) {
                const initialMessage = hasTarget ? `Поиск цели "${targetSpec}"...` : "Укажите никнейм цели";
                this._createCharacter(attackerKey, color, userName, initialMessage, []);
                attacker = this.characters.get(attackerKey);
                isNew = true;
            } else {
                if (!attacker.physics.isFighting && attacker.physics.state !== 'dead') {
                    attacker.physics.dieTime = Date.now() + this.config.MAX_LIFETIME;
                    attacker.renderer.showHeal(100);
                }
            }

            if (!attacker) return;

            if (!hasTarget || !targetSpec) {
                attacker.renderer.updateBubble("Укажите никнейм цели (например: !дуэль alex или !дуэль twitch:alex)");
                return;
            }

            const resolution = this._resolveDuelTarget(attackerKey, targetSpec);
            if (!resolution.success) {
                attacker.renderer.updateBubble(resolution.message);
                //if (isNew) {
                //    attacker.renderer.destroy(true);
                //    this.characters.delete(attackerKey);
                //}
                return;
            }

            const targetKey = resolution.targetKey;
            const target = this.characters.get(targetKey);

            if (!target) {
                attacker.renderer.updateBubble("Цель исчезла. Попробуйте ещё раз");
                if (isNew) {
                    attacker.renderer.destroy(true);
                    this.characters.delete(attackerKey);
                }
                return;
            }

            if (target === attacker) {
                attacker.renderer.updateBubble("Нельзя вызвать самого себя");
                if (isNew) {
                    attacker.renderer.destroy(true);
                    this.characters.delete(attackerKey);
                }
                return;
            }

            const targetDisplayNick = target.physics.nickname;
            if (!isNew) {
                this._updateCharacterBubble(attacker.renderer, `Вызываю на дуэль ${targetDisplayNick}`, []);
            } else {
                attacker.renderer.updateBubble(`Внезапная атака на ${targetDisplayNick}`);
            }

            if (attacker.physics.isFighting) {
                attacker.renderer.updateBubble("Вы уже в бою");
                return;
            }
            if (attacker.physics.state === 'dead') {
                return;
            }
            if (target.physics.state === 'dead') {
                attacker.renderer.updateBubble("Цель мертва");
                return;
            }
            if (target.physics.isFighting) {
                attacker.renderer.updateBubble("Цель уже сражается");
                return;
            }

            this._startFight(attackerKey, targetKey);
            return;
        }

        if (message.trim().toLowerCase().startsWith('!статистика')) {
            const match = message.trim().match(/^!статистика\s+(.+)$/i);
            const callerKey = `${platform}:${userName.trim().toLowerCase()}`;
            let targetSpec = match ? match[1].trim() : null;

            let targetKey = callerKey;

            if (targetSpec) {
                const defaultPlatform = platform;
                const parsed = this._parseTargetSpecifier(targetSpec, defaultPlatform);
                if (parsed) {
                    const { platform: p, nickname: n } = parsed;
                    targetKey = `${p}:${n.toLowerCase()}`;
                } else {
                    let callerChar = this.characters.get(callerKey);
                    if (!callerChar) {
                        this._createCharacter(callerKey, color, userName, "Некорректный формат. Используйте: ник или платформа:ник", []);
                        callerChar = this.characters.get(callerKey);
                    }
                    if (callerChar) {
                        callerChar.renderer.updateBubble("Некорректный формат. Используйте: ник или платформа:ник");
                    }
                    return;
                }
            }

            let callerChar = this.characters.get(callerKey);
            if (!callerChar) {
                this._createCharacter(callerKey, color, userName, "Запрос статистики...", []);
                callerChar = this.characters.get(callerKey);
            } else {
                callerChar.renderer.updateBubble("Запрос статистики...");
            }

            this.connectionService.onPlayerStatsCallback = (respCallerKey, playerKey, stats) => {
                if (respCallerKey !== callerKey) return;
                const targetChar = this.characters.get(callerKey);
                if (!targetChar) return;

                let messageText = "";
                if (stats) {
                    const safeName = this._escapeHtml(stats.name);
                    const colorStyle = stats.color ? `style="color: ${stats.color};"` : '';
                    const coloredName = `<span ${colorStyle}>${safeName}</span>`;
                    messageText = `⚔️ ${coloredName} провёл дуэлей: ${stats.totalDuels}<br>` +
                        `📊 Побед: ${stats.wins} | Поражений: ${stats.losses} | Винрейт: ${stats.winRate}%<br>` +
                        `📈 Текущий винстрик: ${stats.currentStreak} | Лучший: ${stats.bestStreak}`;
                } else {
                    const displayName = playerKey.includes(':') ? playerKey.split(':')[1] : playerKey;
                    let colorForName = '';
                    const existingChar = this.characters.get(playerKey);
                    if (existingChar && existingChar.renderer.options.color) {
                        colorForName = existingChar.renderer.options.color;
                    }
                    const coloredName = colorForName
                        ? `<span style="color: ${colorForName};">${this._escapeHtml(displayName)}</span>`
                        : this._escapeHtml(displayName);

                    const isSelf = (playerKey === callerKey);
                    if (isSelf) {
                        messageText = `⚔️ ${coloredName} ещё не стал(а) гладиатором 😔`;
                    } else {
                        messageText = `⚔️ Нет данных для игрока "${coloredName}"`;
                    }
                }
                targetChar.renderer.updateBubble(messageText);
                this.connectionService.onPlayerStatsCallback = null;
            };

            this.connectionService.requestPlayerStats(callerKey, targetKey);
            return;
        }

        if (this.characters.has(attackerKey)) {
            const entry = this.characters.get(attackerKey);
            if (!entry.physics.isFighting && entry.physics.state !== 'dead') {
                entry.physics.dieTime = Date.now() + this.config.MAX_LIFETIME;
                entry.renderer.showHeal(100);
            }
            this._updateCharacterBubble(entry.renderer, message, emotes);
        } else {
            this._createCharacter(attackerKey, color, userName, message, emotes);
        }
    }

    _createCharacter(key, color, nickname, message, emotes) {
        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;
        if (worldWidth === 0) return;

        if (this.characters.size >= this.config.MAX_CHARACTERS) {
            let oldestKey = null;
            let minDieTime = Infinity;
            for (let [k, entry] of this.characters) {
                if (entry.physics.state !== 'dead' && entry.physics.dieTime < minDieTime) {
                    minDieTime = entry.physics.dieTime;
                    oldestKey = k;
                }
            }
            if (!oldestKey) oldestKey = this.characters.keys().next().value;

            if (oldestKey) {
                const entry = this.characters.get(oldestKey);
                entry.renderer.destroy(true);
                this.characters.delete(oldestKey);
            }
        }

        const fullSizePx = (this.config.CHAR_SIZE / 100) * worldWidth;
        const colliderWidthPx = fullSizePx * (this.config.COLLIDER_WIDTH_PERCENT / 100);
        const colliderOffsetX = (fullSizePx - colliderWidthPx) / 2;

        const colliderX = Math.random() * (worldWidth - colliderWidthPx);
        const colliderY = worldHeight - fullSizePx;

        const physics = {
            colliderX, colliderY,
            colliderWidth: colliderWidthPx,
            colliderHeight: fullSizePx,
            colliderOffsetX,
            fullWidth: fullSizePx,
            fullHeight: fullSizePx,
            vx: 0, vy: 0,
            state: 'idle',
            isGrounded: true,
            actionTimer: 1000,
            dieTime: Date.now() + this.config.MAX_LIFETIME,
            isFighting: false,
            fightTargetKey: null,
            fightMoveToTarget: false,
            fightAttackTimer: 0,
            fightCanAttack: false,
            deadTimer: 0,
            fightTimeout: null,
            key: key,
            platform: key.split(':')[0],
            nickname: nickname,
        };

        const characterType = this.config.character;
        const RendererClass = this.characterRenderers.get(characterType) || this.characterRenderers.get('turtle');
        const renderer = new RendererClass(this.world, {
            fullWidth: physics.fullWidth,
            fullHeight: physics.fullHeight,
            colliderWidth: physics.colliderWidth,
            colliderHeight: physics.colliderHeight,
            colliderOffsetX: physics.colliderOffsetX,
            debugCollider: this.config.DEBUG_COLLIDER,
            color,
            nickname,
            message,
            emotes
        });

        this.characters.set(key, { physics, renderer });

        renderer.init();
        this._updateContainerPosition(renderer, physics);

        if (message) {
            this._updateCharacterBubble(renderer, message, emotes);
        }
    }

    _startFight(keyA, keyB) {
        const charA = this.characters.get(keyA);
        const charB = this.characters.get(keyB);
        if (!charA || !charB) return;

        const now = Date.now();
        charA.physics.dieTime = now + this.config.MAX_LIFETIME;
        charB.physics.dieTime = now + this.config.MAX_LIFETIME;

        charA.renderer.showHeal(100);
        charB.renderer.showHeal(100);

        charA.renderer.setWinner(false);
        charB.renderer.setWinner(false);

        charA.renderer.setInCombat(true);
        charB.renderer.setInCombat(true);

        const centerA = charA.physics.colliderX + charA.physics.colliderWidth / 2;
        const centerB = charB.physics.colliderX + charB.physics.colliderWidth / 2;
        if (centerA < centerB) {
            charA.renderer.setFacing('right');
            charB.renderer.setFacing('left');
        } else {
            charA.renderer.setFacing('left');
            charB.renderer.setFacing('right');
        }

        const setupFighter = (char, targetKey, isFirstStriker) => {
            char.physics.isFighting = true;
            char.physics.fightTargetKey = targetKey;
            char.physics.fightMoveToTarget = true;
            char.physics.vx = 0;
            char.physics.actionTimer = 0;
            char.physics.fightAttackTimer = 0;
            char.physics.fightCanAttack = isFirstStriker;
        };

        setupFighter(charA, keyB, true);
        setupFighter(charB, keyA, false);
    }

    _endFight(winnerKey, loserKey) {
        const winner = this.characters.get(winnerKey);
        const loser = this.characters.get(loserKey);

        if (winner && winner.physics.fightTimeout) {
            clearTimeout(winner.physics.fightTimeout);
            winner.physics.fightTimeout = null;
        }
        if (loser && loser.physics.fightTimeout) {
            clearTimeout(loser.physics.fightTimeout);
            loser.physics.fightTimeout = null;
        }

        if (winner && winner.physics.state !== 'dead') {
            const now = Date.now();
            const oldDieTime = winner.physics.dieTime;
            winner.physics.dieTime = now + this.config.MAX_LIFETIME;
            const healAmount = (winner.physics.dieTime - oldDieTime) / this.config.MAX_LIFETIME * 100;
            if (healAmount > 0) winner.renderer.showHeal(healAmount);
            winner.physics.isFighting = false;
            winner.physics.fightTargetKey = null;
            winner.physics.fightMoveToTarget = false;
            winner.physics.fightAttackTimer = 0;
            winner.physics.fightCanAttack = false;
            winner.renderer.setWinner(true);
            winner.renderer.setInCombat(false);
        }

        if (loser) {
            loser.physics.isFighting = false;
            loser.physics.fightTargetKey = null;
            loser.physics.fightMoveToTarget = false;
            loser.physics.fightAttackTimer = 0;
            loser.physics.fightCanAttack = false;
            loser.renderer.setWinner(false);
            loser.renderer.setInCombat(false);
            if (loser.physics.state !== 'dead') {
                loser.physics.state = 'dead';
                loser.physics.deadTimer = 10000;
                loser.physics.vx = 0;
                loser.renderer.setState('dead');
                loser.renderer.updateLifeBar(0);
            }
        }

        if (this.onDuelEndCallback && winner && loser) {
            this.onDuelEndCallback({
                winnerKey: winner.physics.key,
                winnerDisplayName: winner.physics.nickname,
                winnerColor: winner.renderer.options.color,
                loserKey: loser.physics.key,
                loserDisplayName: loser.physics.nickname,
                loserColor: loser.renderer.options.color,
                timestamp: Date.now()
            });
        }
    }

    _updateCharacterBubble(renderer, message, emotes) {
        if (!message) return;
        const truncated = message.length > this.config.MAX_MESSAGE_LENGTH
            ? message.substring(0, this.config.MAX_MESSAGE_LENGTH) + '...'
            : message;
        const formatted = formatMessageWithEmotes(truncated, emotes);
        renderer.updateBubble(formatted);
    }

    _updateContainerPosition(renderer, physics) {
        const containerX = physics.colliderX - physics.colliderOffsetX;
        const containerY = physics.colliderY;
        renderer.setPosition(containerX, containerY);
    }

    _updateColliderBlockStyle(renderer, physics) {
        renderer.updateColliderDimensions(physics.colliderWidth, physics.colliderHeight, physics.colliderOffsetX);
    }

    _handleResize() {
        const oldSpeed = this.walkSpeedPxPerFrame;
        this._updateSpeedScale();
        this._updateAllCharacterSizes();

        if (oldSpeed > 0 && this.walkSpeedPxPerFrame > 0) {
            const scale = this.walkSpeedPxPerFrame / oldSpeed;
            for (let entry of this.characters.values()) {
                if (Math.abs(entry.physics.vx) > 0.01) {
                    entry.physics.vx *= scale;
                }
            }
        }
    }

    _updateAllCharacterSizes() {
        const worldWidth = this.world.offsetWidth;
        if (worldWidth === 0) return;

        const newFullSizePx = (this.config.CHAR_SIZE / 100) * worldWidth;
        const newColliderWidthPx = newFullSizePx * (this.config.COLLIDER_WIDTH_PERCENT / 100);
        const newColliderOffsetX = (newFullSizePx - newColliderWidthPx) / 2;

        for (let [key, entry] of this.characters) {
            const physics = entry.physics;
            const renderer = entry.renderer;

            const oldCenterX = physics.colliderX + physics.colliderWidth / 2;
            const oldBottomY = physics.colliderY + physics.colliderHeight;

            physics.fullWidth = newFullSizePx;
            physics.fullHeight = newFullSizePx;
            physics.colliderWidth = newColliderWidthPx;
            physics.colliderHeight = newFullSizePx;
            physics.colliderOffsetX = newColliderOffsetX;

            physics.colliderX = oldCenterX - physics.colliderWidth / 2;
            physics.colliderY = oldBottomY - physics.colliderHeight;

            if (physics.colliderX < 0) physics.colliderX = 0;
            if (physics.colliderX + physics.colliderWidth > worldWidth) physics.colliderX = worldWidth - physics.colliderWidth;
            if (physics.colliderY < 0) physics.colliderY = 0;
            if (physics.colliderY + physics.colliderHeight > this.world.offsetHeight) physics.colliderY = this.world.offsetHeight - physics.colliderHeight;

            renderer.setSize(physics.fullWidth, physics.fullHeight);
            this._updateContainerPosition(renderer, physics);
            this._updateColliderBlockStyle(renderer, physics);
        }
    }

    _animationLoop(timestamp) {
        if (!this._lastTimestamp) this._lastTimestamp = timestamp;
        let delta = Math.min(100, timestamp - this._lastTimestamp);
        if (delta < 0) delta = 16;
        this._lastTimestamp = timestamp;

        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;
        const now = Date.now();
        const platforms = this._getComputedPlatforms();

        for (let [key, entry] of this.characters) {
            const physics = entry.physics;
            const renderer = entry.renderer;

            if (physics.state === 'dead') {
                physics.deadTimer -= delta;
                if (physics.deadTimer <= 0) {
                    if (physics.fightTimeout) clearTimeout(physics.fightTimeout);
                    renderer.destroy(true);
                    this.characters.delete(key);
                } else {
                    PhysicsSystem.applyGravityAndMovement(physics, platforms, worldWidth, worldHeight, this.config);
                    this._updateContainerPosition(renderer, physics);
                }
                continue;
            }

            const timeLeft = physics.dieTime - now;
            if (timeLeft <= 0) {
                if (physics.isFighting && physics.fightTargetKey) {
                    this._endFight(physics.fightTargetKey, key);
                }
                physics.state = 'dead';
                physics.deadTimer = 10000;
                physics.vx = 0;
                renderer.setState('dead');
                renderer.updateLifeBar(0);
                continue;
            }

            const percent = Math.max(0, (timeLeft / this.config.MAX_LIFETIME) * 100);
            renderer.updateLifeBar(percent);

            let isFightingActive = physics.isFighting && physics.fightTargetKey;
            if (isFightingActive) {
                CombatSystem.processFight(
                    key, entry, this.characters, this.config,
                    this.walkSpeedPxPerFrame, delta, now, worldWidth,
                    (winnerKey, loserKey) => this._endFight(winnerKey, loserKey)
                );
            } else {
                AISystem.updateWandering(physics, this.walkSpeedPxPerFrame, this.config, delta);
            }

            PhysicsSystem.applyGravityAndMovement(physics, platforms, worldWidth, worldHeight, this.config);

            let visualState = physics.state;
            if (isFightingActive) {
                visualState = physics.fightMoveToTarget ? 'walking' : 'fighting';
            }
            renderer.setState(visualState);
            renderer.setDirection(physics.vx);

            this._updateContainerPosition(renderer, physics);
            this._updateColliderBlockStyle(renderer, physics);
        }

        this._animationId = requestAnimationFrame(this._animationLoop);
    }
}