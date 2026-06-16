import { resolveMessageColor } from '../../utils/colorUtils.js';
import { formatMessageWithEmotes } from '../../utils/messageUtils.js';
import TurtleRenderer from './turtleRenderer.js';
import PortalEffect from './portalEffect.js';

// СИСТЕМЫ

// PhysicsSystem отвечает за гравитацию, движение и коллизии с платформами/границами. Не зависит от игровой логики (бои, AI) – только физика.
class PhysicsSystem {
    // Применяет гравитацию, обновляет позицию, обрабатывает столкновения.
    // Добавлен параметр timeScale для независимости от FPS
    static applyGravityAndMovement(physics, platforms, worldWidth, worldHeight, config, timeScale = 1) {
        // Умножаем гравитацию на timeScale
        physics.vy += config.GRAVITY * timeScale;

        const prevY = physics.colliderY;

        // Умножаем скорости на timeScale при обновлении позиции
        physics.colliderX += physics.vx * timeScale;
        physics.colliderY += physics.vy * timeScale;

        if (physics.colliderX < 0) {
            physics.colliderX = 0;
            if (!physics.isFighting) physics.vx *= -1;
            else physics.vx = 0;
        } else if (physics.colliderX + physics.colliderWidth > worldWidth) {
            physics.colliderX = worldWidth - physics.colliderWidth;
            if (!physics.isFighting) physics.vx *= -1;
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

                    if (!physics.isFighting) {
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
            if (!physics.isFighting) {
                physics.state = physics.vx === 0 ? 'idle' : 'walking';
            }
        }
    }
}

// Управляет случайным блужданием персонажей, когда они не в бою
class AISystem {

    // Обновляет таймер действия и меняет направление/прыжок случайным образом.
    // delta - время с прошлого кадра
    static updateWandering(physics, walkSpeedPxPerFrame, config, delta, duelZone) {
        // Если есть активная дуэль и персонаж не в бою, то обрабатываем избегание зоны
        if (duelZone && !physics.isFighting) {
            const charLeft = physics.colliderX;
            const charRight = physics.colliderX + physics.colliderWidth;
            // Если персонаж внутри зоны дуэли или пересёк бы её при движении
            if (charRight > duelZone.left && charLeft < duelZone.right) {
                // Выталкиваем в ближайшую сторону
                const distToLeft = charLeft - duelZone.left;
                const distToRight = duelZone.right - charRight;
                if (distToLeft < distToRight) {
                    // Выходим налево
                    physics.vx = -walkSpeedPxPerFrame;
                } else {
                    // Выходим направо
                    physics.vx = walkSpeedPxPerFrame;
                }
                physics.actionTimer = 500; // задержка перед следующим действием
                physics.state = 'walking';
                return;
            }
        }

        // Обычная логика блуждания
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

// Управляет боем двух персонажей: сближение, поочерёдные удары, нанесение урона.
class CombatSystem {

    // Обрабатывает один кадр боя.
    // {string} key - ключ текущего персонажа
    // {Object} entry - запись {physics, renderer}
    // {Map} characters - все персонажи
    // {Object} config - конфигурация (MAX_LIFETIME и др.)
    // {number} walkSpeedPxPerFrame - скорость для сближения
    // {number} delta - время с прошлого кадра
    // {number} now - текущее время
    // {number} worldWidth - ширина мира
    // {Function} onFightEnd - колбэк при завершении боя
    // {Function} onAttack - НОВОЕ: колбэк при нанесении удара (для трансляции)

    static processFight(key, entry, characters, config, walkSpeedPxPerFrame, delta, now, worldWidth, onFightEnd, onAttack, onStateChange) {
        const physics = entry.physics;
        const renderer = entry.renderer;
        const target = characters.get(physics.fightTargetKey);

        // Если цели нет или она стала лузером – бой заканчивается
        if (!target || target.physics.isLoser || !characters.has(physics.fightTargetKey)) {
            // Безопасно завершаем бой, даже если один участник исчез
            onFightEnd(key, physics.fightTargetKey);
            return;
        }

        // Сближение перед боем
        if (physics.fightMoveToTarget) {
            if (physics.fightTargetX === undefined || physics.fightTargetX === null) {

                const currCenter = physics.colliderX + physics.colliderWidth / 2;
                const targetCenter = target.physics.colliderX + target.physics.colliderWidth / 2;
                const dx = targetCenter - currCenter;
                const distance = Math.abs(dx);
                const desiredDistance = physics.fullWidth * 0.8; // желаемая дистанция = ширина персонажа

                if (distance < desiredDistance) {
                    // Достигли нужной дистанции – останавливаем сближение
                    physics.fightMoveToTarget = false;
                    physics.vx = 0;
                    target.physics.fightMoveToTarget = false;
                    target.physics.vx = 0;

                    // Коррекция позиции, чтобы не было наложения
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
                        // Ограничение границами мира
                        physics.colliderX = Math.max(0, Math.min(worldWidth - physics.colliderWidth, physics.colliderX));
                        target.physics.colliderX = Math.max(0, Math.min(worldWidth - target.physics.colliderWidth, target.physics.colliderX));
                    }
                    if (onStateChange) {
                        onStateChange(key, 'fighting');
                    }

                    // Оба бойца могут начинать атаковать (первый удар получает тот, у кого true в _startFight)
                    if (!physics.fightMoveToTarget && !target.physics.fightMoveToTarget) {
                        if (physics.isAttacker) physics.fightCanAttack = true;
                        else if (target.physics.isAttacker) target.physics.fightCanAttack = true;
                    }
                } else {
                    physics.vx = (dx > 0 ? walkSpeedPxPerFrame : -walkSpeedPxPerFrame);
                }
                return;
            }

            const targetX = physics.fightTargetX;
            const currentX = physics.colliderX;
            const distanceToTarget = targetX - currentX;
            const eps = 1;

            if (Math.abs(distanceToTarget) <= eps) {
                physics.colliderX = targetX;
                physics.vx = 0;
                physics.fightMoveToTarget = false;

                if (physics.fightSide === 'left') renderer.setFacing('right');
                else if (physics.fightSide === 'right') renderer.setFacing('left');

                const targetChar = characters.get(physics.fightTargetKey);
                if (targetChar && !targetChar.physics.fightMoveToTarget) {
                    if (targetChar.physics.fightSide === 'left') targetChar.renderer.setFacing('right');
                    else if (targetChar.physics.fightSide === 'right') targetChar.renderer.setFacing('left');

                    if (physics.isAttacker && !physics.fightCanAttack) {
                        physics.fightCanAttack = true;
                    } else if (targetChar.physics.isAttacker && !targetChar.physics.fightCanAttack) {
                        targetChar.physics.fightCanAttack = true;
                    }
                }

                // 🔥 ОТПРАВЛЯЕМ СОБЫТИЕ СМЕНЫ СОСТОЯНИЯ НА 'fighting'
                if (onStateChange) {
                    onStateChange(key, 'fighting');
                  
                }
                return;
            } else {
                physics.vx = distanceToTarget > 0 ? walkSpeedPxPerFrame : -walkSpeedPxPerFrame;
            }
            return;
        }

        // Ближний бой – поочередные удары
        if (physics.fightCanAttack) {
            physics.fightAttackTimer += delta;
            if (physics.fightAttackTimer >= 1000) { // удар раз в секунду
                renderer.playAttackEffect(); // анимация удара

                if (physics.fightTimeout) clearTimeout(physics.fightTimeout);
                physics.fightTimeout = setTimeout(() => {
                    const currentTarget = characters.get(physics.fightTargetKey);
                    if (!currentTarget || currentTarget.physics.isLoser || !currentTarget.physics.isFighting) return;

                    const damagePercent = Math.random() * 0.30 + 0.01; // Урон: случайный процент от MAX_LIFETIME
                    const damageMs = config.MAX_LIFETIME * damagePercent;
                    currentTarget.physics.dieTime -= damageMs;
                    const damageValue = Math.round(damagePercent * 100);

                    // НОВОЕ: вызов колбэка для трансляции удара
                    if (onAttack) onAttack(key, physics.fightTargetKey, damageValue);

                    if (currentTarget.renderer.playHitEffect) currentTarget.renderer.playHitEffect();
                    currentTarget.renderer.showDamage(damageValue);

                    physics.fightCanAttack = false;
                    currentTarget.physics.fightCanAttack = true;
                    currentTarget.physics.fightAttackTimer = 0;

                    if (physics.fightTimeout) physics.fightTimeout = null;
                }, 300); // задержка 300 мс для визуального совпадения с анимацией

                physics.fightAttackTimer = 0;
            }
        } else {
            physics.fightAttackTimer = 0;
        }

        physics.actionTimer = 0; // блокировка случайного AI во время боя
    }
}

// ГЛАВНЫЙ КЛАСС

export class GameWorld {
    constructor(elementId, customConfig = {}, onDuelEndCallback = null, connectionService = null) {
        this.world = document.getElementById(elementId);
        if (!this.world) throw new Error(`Элемент с id "${elementId}" не был найден`);

        this.characterRenderers = new Map();
        this.registerCharacterRenderer('turtle', TurtleRenderer);

        this.characters = new Map(); // ключ -> { physics, renderer }
        this.platformsData = []; // данные платформ в процентах

        const defaultConfig = {
            GRAVITY: 0.4,
            JUMP_POWER: -8,
            WALK_SPEED_PERCENT_PER_SECOND: 5,
            CHAR_SIZE: 6, // размер персонажа в % от ширины мира
            COLLIDER_WIDTH_PERCENT: 50, // ширина коллайдера в % от размера персонажа
            DUEL_ZONE_MARGIN_PERCENT: 5, // ширина дуэль зоны
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

        this.portalEffect = new PortalEffect(elementId);
        this.pendingSpawns = new Map(); // key -> { timeout, portal, resolve }

        this.isDuelInProgress = false;
        this.currentDuelZone = null;
        this.currentDuelParticipants = null;

        // Для предотвращения параллельного создания одного персонажа
        this.pendingCreations = new Map(); // key -> Promise

        // НОВОЕ: канал для трансляции дуэлей на вторую страницу
        this.duelChannel = new BroadcastChannel('duel_broadcast');

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
        // Отменяем анимационный цикл
        if (this._animationId) {
            cancelAnimationFrame(this._animationId);
            this._animationId = null;
        }
        window.removeEventListener('resize', this._handleResize);

        // Очищаем таймауты боев у всех персонажей
        for (let entry of this.characters.values()) {
            if (entry.physics.fightTimeout) {
                clearTimeout(entry.physics.fightTimeout);
                entry.physics.fightTimeout = null;
            }
            entry.renderer.destroy(true);
        }
        this.characters.clear();

        // Удаляем лидерборд
        if (this.leaderboardElement) {
            this.leaderboardElement.remove();
            this.leaderboardElement = null;
        }

        // Уничтожаем эффект портала
        if (this.portalEffect && this.portalEffect.destroy) {
            this.portalEffect.destroy();
        }

        // Сбрасываем флаги дуэли
        this.isDuelInProgress = false;
        this.currentDuelZone = null;

        // 🔥 НОВОЕ: если дуэль активна – уведомляем вторую страницу о принудительном завершении
        if (this.duelChannel && this.isDuelInProgress && this.currentDuelParticipants) {
            this.duelChannel.postMessage({
                type: 'duelAbort',
                reason: 'gameworld_destroyed',
                timestamp: Date.now()
            });
        }

        // Закрываем канал трансляции дуэлей
        if (this.duelChannel) {
            this.duelChannel.close();
        }
    }

    _createLeaderboardElement() {
        this.leaderboardElement = document.createElement('div');
        this.leaderboardElement.className = 'game-leaderboard';
        this.world.appendChild(this.leaderboardElement);
        this.leaderboardElement.innerHTML = '<div class="loading">Загрузка...</div>';
    }

    _setupLeaderboardUpdates() {
        if (!this.connectionService) return;
        this.connectionService.onLeaderboardUpdateCallback = (data) => { this.renderLeaderboard(data); };
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
                html += `<div class="ticker-container"><div class="ticker-text">${tickerText}</div></div>`;
            }
        } else {
            if (data.topStreak && data.topStreak.wins > 0) {
                const streakName = this._getDisplayName(data.topStreak.name);
                const tickerText = `🔥 Топ винстрик: ${streakName} — ${data.topStreak.wins} подряд`;
                html += `<div class="ticker-container"><div class="ticker-text">${this._escapeHtml(tickerText)}</div></div>`;
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

    // Пересчёт скорости ходьбы при изменении размера окна
    _updateSpeedScale() {
        const worldWidth = this.world.offsetWidth;
        if (worldWidth === 0) return;
        const pixelsPerSecond = (this.config.WALK_SPEED_PERCENT_PER_SECOND / 100) * worldWidth;
        this.walkSpeedPxPerFrame = pixelsPerSecond / this.config.TARGET_FPS;
    }
    // Получение координат платформ в пикселях на основе текущих размеров мира
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
    // Парсит строку вида "ник" / "платформа:ник" / "ник@платформа" 
    _parseTargetSpecifier(spec, defaultPlatform) {
        if (!spec) return null;
        spec = spec.trim();
        if (spec.includes(':')) {
            const [platform, nickname] = spec.split(':', 2);
            if (platform && nickname) return { platform: platform.toLowerCase(), nickname: nickname.trim() };
        } else if (spec.includes('@')) {
            const [nickname, platform] = spec.split('@', 2);
            if (nickname && platform) return { platform: platform.toLowerCase(), nickname: nickname.trim() };
        } else {
            return { platform: defaultPlatform, nickname: spec };
        }
        return null;
    }

    // Раскрашивает ник для вставки в сообщение
    _colorizeNickname(nickname, color) {
        const safeNick = this._escapeHtml(nickname);
        if (color) {
            return `<span style="color: ${color};">${safeNick}</span>`;
        }
        return safeNick;
    }

    // Ищет персонажей по никнейму(без учёта платформы)
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
    // Проверяет возможность дуэли: цель не лузер, не в бою, существует. Если найдено несколько одинаковых ников – просит уточнить платформу.
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
            const coloredNick = this._colorizeNickname(nickname, target.renderer.options.color);
            if (target.physics.isRemoving) {
                return { success: false, message: `${coloredNick} сейчас исчезает и не может сражаться` };
            }
            if (target.physics.isLoser) return { success: false, message: `${coloredNick} временно выведен из строя и не может сражаться` };
            if (target.physics.isFighting) return { success: false, message: `Цель ${coloredNick} уже в бою` };
            return { success: true, targetKey: exactKey };
        }
        const candidates = this._findCharacterByNickname(nickname);
        if (candidates.length === 0) return { success: false, message: `Персонаж с ником "${nickname}" не найден` };
        if (candidates.length === 1) {
            const targetKey = candidates[0].key;
            const target = candidates[0].entry;
            const coloredNick = this._colorizeNickname(nickname, target.renderer.options.color);
            if (target.physics.isRemoving) {
                return { success: false, message: `${coloredNick} сейчас исчезает и не может сражаться` };
            }
            if (target.physics.isLoser) return { success: false, message: `Цель ${coloredNick} временно выведен из строя и не может сражаться` };
            if (target.physics.isFighting) return { success: false, message: `Цель ${coloredNick} уже в бою` };
            return { success: true, targetKey };
        }
        const platformList = candidates.map(c => c.key.split(':')[0]).join(', ');
        return { success: false, message: `Найдено несколько персонажей с ником "${nickname}" на платформах: ${platformList}. Уточните, указав платформу, например: ${candidates[0].key}` };
    }

    // Показывает сообщение атакующему, создавая персонажа при необходимости.   
    _showMessageToAttacker(attackerKey, color, userName, message, type = 'warning') {
        let attacker = this.characters.get(attackerKey);
        if (!attacker) {
            this._createCharacter(attackerKey, color, userName, message, [], type);
            attacker = this.characters.get(attackerKey);
        }
        if (attacker) {
            if (!attacker.physics.isFighting && !attacker.physics.isLoser) {
                attacker.physics.dieTime = Date.now() + this.config.MAX_LIFETIME;
                attacker.renderer.showHeal(100);
            }
            attacker.renderer.updateBubble(message, type);
        }
    }

    // Асинхронная версия _ensureCharacter
    async _ensureCharacterAsync(key, color, name, defaultMessage, type = 'info') {
        let character = this.characters.get(key);
        if (!character) {
            character = await this._createCharacter(key, color, name, defaultMessage, [], type);
        } else {
            if (!character.physics.isFighting && !character.physics.isLoser) {
                character.physics.dieTime = Date.now() + this.config.MAX_LIFETIME;
                character.renderer.showHeal(100);
            }
            character.renderer.updateBubble(defaultMessage, type);
        }
        return character;
    }

    async spawnFromMessage(payload) {
        const platform = (payload?.platform || "unknown").toLowerCase();
        const userName = payload?.user || "Anonymous";
        const color = resolveMessageColor(payload);
        const message = payload?.message || "";
        const emotes = payload?.emotes || [];
        const attackerKey = `${platform}:${userName.trim().toLowerCase()}`;

        // Обрезаем пробелы и проверяем, начинается ли сообщение с '!'
        const trimmedMsg = message.trim();
        const isCommand = trimmedMsg.startsWith('!') && trimmedMsg.length > 1 && trimmedMsg[1] !== ' ';

        if (trimmedMsg.toLowerCase().startsWith('!дуэль')) {

            if (this.isDuelInProgress) {
                this._showMessageToAttacker(attackerKey, color, userName, "Сейчас идёт другая дуэль! Подождите...", 'warning');
                return;
            }

            const match = message.trim().match(/^!дуэль\s+(.+)$/i);
            if (!match) {
                this._showMessageToAttacker(attackerKey, color, userName, "Укажите никнейм цели! </br> Например: !дуэль Никнейм или !дуэль twitch:никнейм", 'warning');
                return;
            }
            const targetSpec = match[1].trim();

            const existingAttacker = this.characters.get(attackerKey);
            if (existingAttacker && existingAttacker.physics.isLoser) {
                this._showMessageToAttacker(attackerKey, color, userName, "Вы потерпели поражение и временно не можете участвовать в сражениях", 'warning');
                return;
            }

            const resolution = this._resolveDuelTarget(attackerKey, targetSpec);
            if (!resolution.success) {
                this._showMessageToAttacker(attackerKey, color, userName, resolution.message, 'warning');
                return;
            }
            const targetKey = resolution.targetKey;
            let target = this.characters.get(targetKey);
            if (!target) {
                this._showMessageToAttacker(attackerKey, color, userName, "Цель исчезла. Попробуйте ещё раз", 'warning');
                return;
            }

            if (attackerKey === targetKey) {
                this._showMessageToAttacker(attackerKey, color, userName, "Нельзя вызвать самого себя", 'warning');
                return;
            }

            if (existingAttacker && existingAttacker.physics.isFighting) {
                this._showMessageToAttacker(attackerKey, color, userName, "Вы уже в бою", 'warning');
                return;
            }

            const coloredTarget = this._colorizeNickname(target.physics.nickname, target.renderer.options.color);
            let attacker = await this._ensureCharacterAsync(attackerKey, color, userName, `Вызываю на дуэль ${coloredTarget}`, 'info');
            if (!attacker) return;

            target = this.characters.get(targetKey);
            attacker = this.characters.get(attackerKey);

            if (!target || target.physics.isRemoving || target.physics.isLoser || target.physics.isFighting) {
                const targetNick = target?.physics.nickname || targetKey.split(':')[1] || 'Неизвестный';
                const targetColor = target?.renderer?.options?.color || color;
                const coloredNick = this._colorizeNickname(targetNick, targetColor);
                this._showMessageToAttacker(attackerKey, color, userName, `${coloredNick} недоступен для дуэли`, 'warning');
                return;
            }

            if (!attacker || attacker.physics.isRemoving || attacker.physics.isFighting) {
                return;
            }

            const coloredAttackerNick = this._colorizeNickname(attacker.physics.nickname, attacker.renderer.options.color);
            target.renderer.updateBubble(`Принимаю вызов ${coloredAttackerNick}`, 'info');

            this._startFight(attackerKey, targetKey);
            return;
        }

        if (trimmedMsg.toLowerCase().startsWith('!статистика')) {
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
                    let callerChar = await this._ensureCharacterAsync(callerKey, color, userName, "Некорректный формат. Используйте: ник или платформа:ник", 'info');
                    if (callerChar) callerChar.renderer.updateBubble("Некорректный формат. Используйте: ник или платформа:ник");
                    return;
                }
            }
            let callerChar = await this._ensureCharacterAsync(callerKey, color, userName, "Запрос статистики...", 'info');
            if (!callerChar) return;

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
                    if (existingChar && existingChar.renderer.options.color) colorForName = existingChar.renderer.options.color;
                    const coloredName = colorForName ? `<span style="color: ${colorForName};">${this._escapeHtml(displayName)}</span>` : this._escapeHtml(displayName);
                    const isSelf = (playerKey === callerKey);
                    if (isSelf) messageText = `⚔️ Игрок ${coloredName} ещё не участвовал в боях 😔`;
                    else messageText = `⚔️ Нет данных для игрока "${coloredName}"`;
                }
                targetChar.renderer.updateBubble(messageText, 'info');
                this.connectionService.onPlayerStatsCallback = null;
            };
            this.connectionService.requestPlayerStats(callerKey, targetKey);
            return;
        }

        if (isCommand) {
            const firstWord = trimmedMsg.split(/\s+/)[0].toLowerCase();
            let entry = this.characters.get(attackerKey);
            if (!entry) {
                await this._createCharacter(attackerKey, color, userName,
                    `Неизвестная команда: ${firstWord}`, [], 'error');
            } else {
                if (!entry.physics.isFighting && !entry.physics.isLoser) {
                    entry.physics.dieTime = Date.now() + this.config.MAX_LIFETIME;
                    entry.renderer.showHeal(100);
                }
                entry.renderer.updateBubble(`Неизвестная команда: ${firstWord}`, 'error');
            }
            return;
        }

        // Обычное сообщение
        if (this.characters.has(attackerKey)) {
            const entry = this.characters.get(attackerKey);
            if (!entry.physics.isFighting && !entry.physics.isLoser) {
                entry.physics.dieTime = Date.now() + this.config.MAX_LIFETIME;
                entry.renderer.showHeal(100);
            }
            this._updateCharacterBubble(entry.renderer, message, emotes);
        } else {
            // Запускаем асинхронное создание, но не ждём
            this._createCharacter(attackerKey, color, userName, message, emotes);
        }
    }

    async _spawnCharacterWithPortal(key, color, nickname, message, emotes, bubbleType = null) {
        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;
        if (worldWidth === 0) return null;

        // Рассчет позиции спавна (случайная по X, на земле по Y)
        const fullSizePx = (this.config.CHAR_SIZE / 100) * worldWidth;
        const colliderWidthPx = fullSizePx * (this.config.COLLIDER_WIDTH_PERCENT / 100);
        const colliderOffsetX = (fullSizePx - colliderWidthPx) / 2;
        const colliderX = Math.random() * (worldWidth - colliderWidthPx);
        const colliderY = worldHeight - fullSizePx;

        // Спавн портала в точке появления
        const portalCenterX = colliderX + colliderWidthPx / 2;
        const portalCenterY = colliderY + fullSizePx * 0.4;

        const portal = this.portalEffect.spawnPortal(
            portalCenterX,
            portalCenterY,
            worldWidth,
            worldHeight,
            { widthPercent: 8, heightPercent: 80 }
        );

        // Открываем портал и ждём завершения анимации
        await portal.open();

        // Задержка перед появлением персонажа
        await new Promise(resolve => setTimeout(resolve, 1000));

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
            fightTimeout: null,
            fightTargetX: null,
            fightSide: null,
            isAttacker: false,
            key: key,
            platform: key.split(':')[0],
            nickname: nickname,
            isLoser: false,
            loserUntil: 0,
            isRemoving: false
        };

        // Ререндер
        const characterType = this.config.character;
        const RendererClass = this.characterRenderers.get(characterType) || this.characterRenderers.get('turtle');

        // НОВОЕ: выбор цвета панциря для черепахи (чтобы синхронизировать с дуэльным экраном)
        let turtleColor = null;
        if (RendererClass === TurtleRenderer) {
            // Используем тот же список цветов, что и в TurtleRenderer (можно вынести в константу)
            const turtleColors = [
                '#89af41', '#76a032', '#a3c35d', '#6b8e23', '#556b2f',
                '#7cb342', '#558b2f', '#8bc34a', '#9e9d24', '#cddc39',
                '#4caf50', '#2e7d32', '#81c784', '#aed581', '#dcedc8',
                '#c5e1a5', '#f0f4c3', '#afb42b', '#827717', '#33691e',
                '#1b5e20', '#004d40', '#00695c', '#26a69a', '#80cbc4'
            ];
            turtleColor = turtleColors[Math.floor(Math.random() * turtleColors.length)];
        }

        const renderer = new RendererClass(this.world, {
            fullWidth: physics.fullWidth,
            fullHeight: physics.fullHeight,
            colliderWidth: physics.colliderWidth,
            colliderHeight: physics.colliderHeight,
            colliderOffsetX: physics.colliderOffsetX,
            debugCollider: this.config.DEBUG_COLLIDER,
            color, nickname, message, emotes,
            turtleColor  // НОВОЕ: передаём фиксированный цвет
        });

        // Добавляем в коллекцию и инициализируем
        this.characters.set(key, { physics, renderer });
        renderer.init();
        this._updateContainerPosition(renderer, physics);

        // Показываем сообщение (после того как персонаж полностью появился)
        if (message) {
            const truncated = message.length > this.config.MAX_MESSAGE_LENGTH
                ? message.substring(0, this.config.MAX_MESSAGE_LENGTH) + '...'
                : message;
            const hasHtml = /<[^>]+>/.test(truncated);
            const formatted = hasHtml ? truncated : formatMessageWithEmotes(truncated, emotes);
            renderer.updateBubble(formatted, bubbleType);
        }

        // Закрываем портал после появления персонажа
        await portal.close();

        // Возвращаем ссылку на персонажа для дальнейшего использования
        return { physics, renderer };
    }

    // Асинхронное создание персонажа (с порталом)
    async _createCharacter(key, color, nickname, message, emotes, bubbleType = null) {
        // Если уже создаётся – ждём существующий Promise
        if (this.pendingCreations.has(key)) {
            return this.pendingCreations.get(key);
        }

        const createPromise = (async () => {
            const worldWidth = this.world.offsetWidth;
            if (worldWidth === 0) return null;

            // Проверка лимита персонажей
            if (this.characters.size >= this.config.MAX_CHARACTERS) {
                let oldestKey = null;
                let minDieTime = Infinity;
                for (let [k, entry] of this.characters) {
                    if (!entry.physics.isLoser && entry.physics.dieTime < minDieTime) {
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

            try {
                // Попытка создать через портал
                const result = await this._spawnCharacterWithPortal(key, color, nickname, message, emotes, bubbleType);
                if (result) return result;
            } catch (err) {
                console.error('Ошибка при спавне через портал:', err);
            }

            // Fallback: синхронное создание без портала
            return this._createCharacterFallback(key, color, nickname, message, emotes, bubbleType);
        })();

        this.pendingCreations.set(key, createPromise);
        try {
            return await createPromise;
        } finally {
            this.pendingCreations.delete(key);
        }
    }

    // Синхронное создание персонажа (без портала, для fallback)
    _createCharacterFallback(key, color, nickname, message, emotes, bubbleType = null) {
        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;
        if (worldWidth === 0) return null;

        // Лимит персонажей
        if (this.characters.size >= this.config.MAX_CHARACTERS) {
            let oldestKey = null;
            let minDieTime = Infinity;
            for (let [k, entry] of this.characters) {
                if (!entry.physics.isLoser && entry.physics.dieTime < minDieTime) {
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

        // Расчёт размеров и позиции
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
            fightTimeout: null,
            fightTargetX: null,
            fightSide: null,
            isAttacker: false,
            key: key,
            platform: key.split(':')[0],
            nickname: nickname,
            isLoser: false,
            loserUntil: 0
        };

        const characterType = this.config.character;
        const RendererClass = this.characterRenderers.get(characterType) || this.characterRenderers.get('turtle');

        // НОВОЕ: выбор цвета панциря для черепахи
        let turtleColor = null;
        if (RendererClass === TurtleRenderer) {
            const turtleColors = [
                '#89af41', '#76a032', '#a3c35d', '#6b8e23', '#556b2f',
                '#7cb342', '#558b2f', '#8bc34a', '#9e9d24', '#cddc39',
                '#4caf50', '#2e7d32', '#81c784', '#aed581', '#dcedc8',
                '#c5e1a5', '#f0f4c3', '#afb42b', '#827717', '#33691e',
                '#1b5e20', '#004d40', '#00695c', '#26a69a', '#80cbc4'
            ];
            turtleColor = turtleColors[Math.floor(Math.random() * turtleColors.length)];
        }

        const renderer = new RendererClass(this.world, {
            fullWidth: physics.fullWidth,
            fullHeight: physics.fullHeight,
            colliderWidth: physics.colliderWidth,
            colliderHeight: physics.colliderHeight,
            colliderOffsetX: physics.colliderOffsetX,
            debugCollider: this.config.DEBUG_COLLIDER,
            color, nickname, message, emotes,
            turtleColor
        });

        this.characters.set(key, { physics, renderer });
        renderer.init();
        this._updateContainerPosition(renderer, physics);

        if (message) {
            const truncated = message.length > this.config.MAX_MESSAGE_LENGTH
                ? message.substring(0, this.config.MAX_MESSAGE_LENGTH) + '...'
                : message;
            const hasHtml = /<[^>]+>/.test(truncated);
            const formatted = hasHtml ? truncated : formatMessageWithEmotes(truncated, emotes);
            renderer.updateBubble(formatted, bubbleType);
        }

        return { physics, renderer };
    }

    //Начинает дуэль между двумя персонажами.
    //Обоим выставляется 100% HP, сбрасываются статусы лузера/победителя,
    //включается флаг isFighting, задаётся направление (кто левее/правее).
    //Первый удар делает атакующий (attacker).
    _startFight(keyA, keyB) {
        const charA = this.characters.get(keyA);
        const charB = this.characters.get(keyB);
        if (!charA || !charB || charA.physics.isRemoving || charB.physics.isRemoving) return;

        const worldWidth = this.world.offsetWidth;
        if (worldWidth === 0) return;

        const worldCenter = worldWidth / 2;
        const desiredCenterDistance = charA.physics.fullWidth * 0.9;
        const halfDistance = desiredCenterDistance / 2;

        const centerA = charA.physics.colliderX + charA.physics.colliderWidth / 2;
        const centerB = charB.physics.colliderX + charB.physics.colliderWidth / 2;

        let leftChar, rightChar;
        if (centerA < centerB) {
            leftChar = charA;
            rightChar = charB;
        } else {
            leftChar = charB;
            rightChar = charA;
        }

        leftChar.physics.fightSide = 'left';
        rightChar.physics.fightSide = 'right';

        const attackerIsLeft = (keyA === leftChar.physics.key);
        leftChar.physics.isAttacker = attackerIsLeft;
        rightChar.physics.isAttacker = !attackerIsLeft;

        const leftTargetX = worldCenter - halfDistance - leftChar.physics.colliderWidth / 2;
        const rightTargetX = worldCenter + halfDistance - rightChar.physics.colliderWidth / 2;

        leftChar.physics.fightTargetX = Math.max(0, Math.min(worldWidth - leftChar.physics.colliderWidth, leftTargetX));
        rightChar.physics.fightTargetX = Math.max(0, Math.min(worldWidth - rightChar.physics.colliderWidth, rightTargetX));

        // вычисляем зону дуэли (с небольшим запасом)
        const margin = (this.config.DUEL_ZONE_MARGIN_PERCENT / 100) * worldWidth;
        const zoneLeft = Math.min(leftChar.physics.fightTargetX, rightChar.physics.fightTargetX) - margin;
        const zoneRight = Math.max(leftChar.physics.fightTargetX + leftChar.physics.colliderWidth, rightChar.physics.fightTargetX + rightChar.physics.colliderWidth) + margin;
        this.currentDuelZone = { left: Math.max(0, zoneLeft), right: Math.min(worldWidth, zoneRight) };
        this.isDuelInProgress = true;
        this.currentDuelParticipants = [keyA, keyB];

        const now = Date.now();
        charA.physics.dieTime = now + this.config.MAX_LIFETIME;
        charB.physics.dieTime = now + this.config.MAX_LIFETIME;
        charA.renderer.showHeal(100);
        charB.renderer.showHeal(100);
        charA.renderer.setLoser(false);
        charB.renderer.setLoser(false);
        charA.renderer.setInCombat(true);
        charB.renderer.setInCombat(true);

        const setupFighter = (char, targetKey, targetX) => {
            char.physics.isFighting = true;
            char.physics.fightTargetKey = targetKey;
            char.physics.fightMoveToTarget = true;
            char.physics.fightTargetX = targetX;
            char.physics.vx = 0;
            char.physics.actionTimer = 0;
            char.physics.fightAttackTimer = 0;
            char.physics.fightCanAttack = false;
        };

        setupFighter(leftChar, rightChar.physics.key, leftTargetX);
        setupFighter(rightChar, leftChar.physics.key, rightTargetX);



        // отправляем событие начала дуэли на вторую страницу
        this._sendDuelStart(keyA, keyB, leftChar, rightChar, worldWidth);
        if (!leftChar.physics.fightMoveToTarget && !rightChar.physics.fightMoveToTarget) {
            this._sendDuelStateChange(leftChar.physics.key, 'fighting');
            this._sendDuelStateChange(rightChar.physics.key, 'fighting');
        } else {
            this._sendDuelStateChange(leftChar.physics.key, 'walking');
            this._sendDuelStateChange(rightChar.physics.key, 'walking');
        }
    }

    // отправка события начала дуэли
    _sendDuelStart(attackerKey, defenderKey, leftChar, rightChar, worldWidth) {
        const leftTargetXPercent = (leftChar.physics.fightTargetX / worldWidth) * 100;
        const rightTargetXPercent = (rightChar.physics.fightTargetX / worldWidth) * 100;

        const getCharData = (char, side, targetXPercent) => ({
            key: char.physics.key,
            nickname: char.physics.nickname,
            color: char.renderer.options.color,
            turtleColor: char.renderer.selectedTurtleColor || null,
            side: side,
            targetXPercent: targetXPercent,
            fullWidthPx: char.physics.fullWidth,
            colliderWidthPx: char.physics.colliderWidth,
            colliderOffsetX: char.physics.colliderOffsetX,
            isWinner: char.renderer._winnerFlag || false,
        });

        const left = getCharData(leftChar, 'left', leftTargetXPercent);
        const right = getCharData(rightChar, 'right', rightTargetXPercent);

        this.duelChannel.postMessage({
            type: 'duelStart',
            attackerKey: attackerKey,
            defenderKey: defenderKey,
            left: left,
            right: right,
            config: {
                CHAR_SIZE: this.config.CHAR_SIZE,
                COLLIDER_WIDTH_PERCENT: this.config.COLLIDER_WIDTH_PERCENT,
                MAX_LIFETIME: this.config.MAX_LIFETIME,
                TARGET_FPS: this.config.TARGET_FPS,
                DUEL_ZONE_MARGIN_PERCENT: this.config.DUEL_ZONE_MARGIN_PERCENT,
            },
            timestamp: Date.now()
        });
    }

    _sendDuelStateChange(fighterKey, state) {
        this.duelChannel.postMessage({
            type: 'duelStateChange',
            fighterKey: fighterKey,
            state: state,       // 'walking' или 'fighting'
            timestamp: Date.now()
        });
    }

    // НОВОЕ: отправка события удара
    _sendDuelAttack(attackerKey, targetKey, damageValue) {
        this.duelChannel.postMessage({
            type: 'duelAttack',
            attackerKey: attackerKey,
            targetKey: targetKey,
            damageValue: damageValue,
            timestamp: Date.now()
        });
    }

    // НОВОЕ: отправка события завершения дуэли
    _sendDuelEnd(winnerKey, loserKey, winnerHealthPercent = 100, loserHealthPercent = 50) {
        this.duelChannel.postMessage({
            type: 'duelEnd',
            winnerKey: winnerKey,
            loserKey: loserKey,
            winnerHealthPercent: winnerHealthPercent,
            loserHealthPercent: loserHealthPercent,
            timestamp: Date.now()
        });
    }

    // Завершает дуэль. Победитель: 100% HP, получает класс winner. Проигравший: 50 % HP, получает класс loser на время равное 10 % от MAX_LIFETIME.
    _endFight(winnerKey, loserKey) {
        const winner = this.characters.get(winnerKey);
        const loser = this.characters.get(loserKey);
        const now = Date.now();

        if (winner && winner.physics.fightTimeout) clearTimeout(winner.physics.fightTimeout);
        if (loser && loser.physics.fightTimeout) clearTimeout(loser.physics.fightTimeout);

        // Победитель
        if (winner) {
            winner.physics.dieTime = now + this.config.MAX_LIFETIME;
            winner.physics.isFighting = false;
            winner.physics.fightTargetKey = null;
            winner.physics.fightMoveToTarget = false;
            winner.physics.fightAttackTimer = 0;
            winner.physics.fightCanAttack = false;
            winner.physics.isLoser = false;
            winner.physics.loserUntil = 0;
            winner.physics.fightTargetX = null;
            winner.physics.fightSide = null;
            winner.physics.isAttacker = false;
            winner.renderer.setLoser(false);
            winner.renderer.setWinner(true);
            winner.renderer.setInCombat(false);
            winner.renderer.updateLifeBar(100);
            winner.renderer.updateBubble("Flawless Victory!", 'info');
        }

        // Проигравший
        if (loser) {
            loser.physics.dieTime = now + this.config.MAX_LIFETIME * 0.5;
            loser.physics.isFighting = false;
            loser.physics.fightTargetKey = null;
            loser.physics.fightMoveToTarget = false;
            loser.physics.fightAttackTimer = 0;
            loser.physics.fightCanAttack = false;
            loser.physics.isLoser = true;
            loser.physics.loserUntil = now + this.config.MAX_LIFETIME * 0.07;
            loser.physics.fightTargetX = null;
            loser.physics.fightSide = null;
            loser.physics.isAttacker = false;
            loser.renderer.setLoser(true);
            loser.renderer.setWinner(false);
            loser.renderer.setInCombat(false);
            loser.renderer.updateLifeBar(50);
        }

        // сброс флагов дуэли
        this.isDuelInProgress = false;
        this.currentDuelParticipants = null;
        this.currentDuelZone = null;

        // НОВОЕ: отправляем событие завершения
        this._sendDuelEnd(winnerKey, loserKey, 100, 50);

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

    // Обновление текста пузыря над головой (с форматированием эмодзи)
    _updateCharacterBubble(renderer, message, emotes, bubbleType = null) {
        if (!message) return;
        const truncated = message.length > this.config.MAX_MESSAGE_LENGTH ? message.substring(0, this.config.MAX_MESSAGE_LENGTH) + '...' : message;
        const formatted = formatMessageWithEmotes(truncated, emotes);
        renderer.updateBubble(formatted, bubbleType);
    }
    // Позиционирование контейнера персонажа (коллайдер, смещение)
    _updateContainerPosition(renderer, physics) {
        const containerX = physics.colliderX - physics.colliderOffsetX;
        const containerY = physics.colliderY;
        renderer.setPosition(containerX, containerY);
    }

    _updateColliderBlockStyle(renderer, physics) {
        renderer.updateColliderDimensions(physics.colliderWidth, physics.colliderHeight, physics.colliderOffsetX);
    }

    _revalidateDuelAfterResize() {
        if (!this.isDuelInProgress || !this.currentDuelParticipants) return;
        const [keyA, keyB] = this.currentDuelParticipants;
        const charA = this.characters.get(keyA);
        const charB = this.characters.get(keyB);
        if (!charA || !charB) {
            this._endFight(keyA, keyB);
            return;
        }

        const worldWidth = this.world.offsetWidth;
        if (worldWidth === 0) return;

        const worldCenter = worldWidth / 2;
        const desiredCenterDistance = charA.physics.fullWidth * 0.9;
        const halfDistance = desiredCenterDistance / 2;

        // Определяем левого и правого по сохранённому fightSide
        let leftChar, rightChar;
        if (charA.physics.fightSide === 'left') {
            leftChar = charA;
            rightChar = charB;
        } else if (charB.physics.fightSide === 'left') {
            leftChar = charB;
            rightChar = charA;
        } else {
            // fallback: определяем по текущей позиции
            const centerA = charA.physics.colliderX + charA.physics.colliderWidth / 2;
            const centerB = charB.physics.colliderX + charB.physics.colliderWidth / 2;
            if (centerA < centerB) {
                leftChar = charA;
                rightChar = charB;
            } else {
                leftChar = charB;
                rightChar = charA;
            }
        }

        const leftTargetX = worldCenter - halfDistance - leftChar.physics.colliderWidth / 2;
        const rightTargetX = worldCenter + halfDistance - rightChar.physics.colliderWidth / 2;

        leftChar.physics.fightTargetX = Math.max(0, Math.min(worldWidth - leftChar.physics.colliderWidth, leftTargetX));
        rightChar.physics.fightTargetX = Math.max(0, Math.min(worldWidth - rightChar.physics.colliderWidth, rightTargetX));

        // Обновляем зону дуэли
        const margin = (this.config.DUEL_ZONE_MARGIN_PERCENT / 100) * worldWidth;
        const zoneLeft = Math.min(leftChar.physics.fightTargetX, rightChar.physics.fightTargetX) - margin;
        const zoneRight = Math.max(leftChar.physics.fightTargetX + leftChar.physics.colliderWidth,
            rightChar.physics.fightTargetX + rightChar.physics.colliderWidth) + margin;
        this.currentDuelZone = { left: Math.max(0, zoneLeft), right: Math.min(worldWidth, zoneRight) };

        // Заставляем обоих бойцов двигаться к новым позициям
        leftChar.physics.fightMoveToTarget = true;
        rightChar.physics.fightMoveToTarget = true;
        leftChar.physics.fightCanAttack = false;
        rightChar.physics.fightCanAttack = false;
        leftChar.physics.fightAttackTimer = 0;
        rightChar.physics.fightAttackTimer = 0;
    }

    async _removeCharacterWithPortal(key, entry) {
        const { physics, renderer } = entry;
        if (physics.isRemoving) return;
        physics.isRemoving = true;

        // остановка персонажа
        physics.vx = 0;
        physics.vy = 0;
        physics.isGrounded = true;      // чтобы не было анимации падения
        renderer.setState('Idle')         // визуальное состояние перед исчезновением

        const portalCenterX = physics.colliderX + physics.colliderWidth / 2;
        const portalCenterY = physics.colliderY + physics.fullHeight * 0.4;

        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;

        const portal = this.portalEffect.spawnPortal(
            portalCenterX,
            portalCenterY,
            worldWidth,
            worldHeight,
            { widthPercent: 8, heightPercent: 80 }
        );

        await portal.open();

        await new Promise(resolve => setTimeout(resolve, 300));

        if (physics.fightTimeout) {
            clearTimeout(physics.fightTimeout);
            physics.fightTimeout = null;
        }
        renderer.destroy(true);
        this.characters.delete(key);

        await portal.close();
    }

    // Обработка изменения размера окна – пересчёт размеров персонажей и скорости
    _handleResize() {
        const oldSpeed = this.walkSpeedPxPerFrame;
        this._updateSpeedScale();
        this._updateAllCharacterSizes();
        this._revalidateDuelAfterResize();
        if (oldSpeed > 0 && this.walkSpeedPxPerFrame > 0) {
            const scale = this.walkSpeedPxPerFrame / oldSpeed;
            for (let entry of this.characters.values()) {
                if (Math.abs(entry.physics.vx) > 0.01) entry.physics.vx *= scale;
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

    // ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ. Выполняется на каждом кадре. Порядок действий важен:
    // 1) Снятие лузера по таймеру (без изменения здоровья).
    // 2) Обработка боя (если есть) – может изменить dieTime, isFighting.
    // 3) Физика (гравитация, коллизии).
    // 4) Визуальные обновления (состояние, направление, позиция).
    // 5) Проверка истечения HP:
    // - Лузер с HP <=0 → восстанавливает 50% HP (не умирает).
    // - Персонаж в бою с HP <=0 → вызывается _endFight (становится лузером).
    // - Обычный персонаж не в бою с HP <=0 → удаляется навсегда.
    // 6) Обновление полоски жизни.   
    _animationLoop(timestamp) {
        if (!this._lastTimestamp) this._lastTimestamp = timestamp;

        // Считаем разницу во времени между кадрами
        let delta = timestamp - this._lastTimestamp;

        // Защита от скачков (если вкладка свернута или OBS завис на мгновение)
        if (delta > 100) delta = 100;
        if (delta <= 0) delta = 16.66; // Дефолтный шаг для 60fps

        this._lastTimestamp = timestamp;
        // Вычисляем масштаб времени на основе целевого FPS. 
        // При 60 FPS delta будет ~16.6, и timeScale = 1.
        // При 30 FPS (в OBS) delta будет ~33.3, и timeScale = ~2.
        const timeScale = delta / (1000 / this.config.TARGET_FPS);
        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;
        const now = Date.now();
        const platforms = this._getComputedPlatforms();
        for (let [key, entry] of this.characters) {
            const physics = entry.physics;
            const renderer = entry.renderer;
            if (physics.isRemoving) continue;
            // Снятие статуса лузера по таймеру
            if (physics.isLoser && physics.loserUntil && now > physics.loserUntil) {
                physics.isLoser = false;
                physics.loserUntil = 0;
                renderer.setLoser(false);
            }
            // Обработка боя
            let isFightingActive = physics.isFighting && physics.fightTargetKey;
            if (isFightingActive) {
                CombatSystem.processFight(
                    key, entry, this.characters, this.config,
                    this.walkSpeedPxPerFrame, delta, now, worldWidth,
                    (winnerKey, loserKey) => this._endFight(winnerKey, loserKey),
                    (attackerKey, targetKey, damageValue) => this._sendDuelAttack(attackerKey, targetKey, damageValue), // НОВОЕ: колбэк удара
                    (fighterKey, newState) => this._sendDuelStateChange(fighterKey, newState)
                );
            } else {
                AISystem.updateWandering(physics, this.walkSpeedPxPerFrame, this.config, delta, this.currentDuelZone);
            }
            // Физика
            PhysicsSystem.applyGravityAndMovement(physics, platforms, worldWidth, worldHeight, this.config, timeScale);
            // Визуальное состояние
            let visualState = physics.state;
            if (isFightingActive) {
                visualState = physics.fightMoveToTarget ? 'walking' : 'fighting';
            }
            renderer.setState(visualState);
            if (!isFightingActive || physics.fightMoveToTarget) {
                renderer.setDirection(physics.vx);
            }
            this._updateContainerPosition(renderer, physics);
            this._updateColliderBlockStyle(renderer, physics);
            // Проверка истечения HP
            const timeLeft = physics.dieTime - now;

            if (timeLeft <= 0) {
                if (physics.isFighting && physics.fightTargetKey) {
                    this._endFight(physics.fightTargetKey, key);
                    continue;
                } else {
                    if (physics.isRemoving) continue; // необязательно, но для ясности
                    this._removeCharacterWithPortal(key, entry);
                    continue;
                }
            }
            // Обновляем полоску жизни
            const percent = Math.max(0, ((physics.dieTime - now) / this.config.MAX_LIFETIME) * 100);
            renderer.updateLifeBar(percent);
        }
        this._animationId = requestAnimationFrame(this._animationLoop);
    }
}