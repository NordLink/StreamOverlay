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
            } else {
                physics.vx = (dx > 0 ? walkSpeedPxPerFrame : -walkSpeedPxPerFrame);
            }
            return;
        }

        // Ближний бой – поочередные удары
        if (physics.fightCanAttack) {
            physics.fightAttackTimer += delta;
            if (physics.fightAttackTimer >= 1000) {
                // Запускаем анимацию удара
                renderer.playAttackEffect();

                setTimeout(() => {
                    // Проверяем, что цель все еще существует и жива
                    const currentTarget = characters.get(physics.fightTargetKey);
                    if (!currentTarget || currentTarget.physics.state === 'dead') return;

                    // Нанесение урона
                    const damagePercent = Math.random() * 0.30 + 0.01;
                    const damageMs = config.MAX_LIFETIME * damagePercent;
                    currentTarget.physics.dieTime -= damageMs;

                    const damageValue = Math.round(damagePercent * 100);

                    // Показываем хит-эффект и цифры урона
                    if (currentTarget.renderer.playHitEffect) {
                        currentTarget.renderer.playHitEffect();
                    }
                    currentTarget.renderer.showDamage(damageValue);

                    // Ход противника
                    physics.fightCanAttack = false;
                    currentTarget.physics.fightCanAttack = true;
                    currentTarget.physics.fightAttackTimer = 0;

                }, 300); // Задержка 300мс (половина от 600ms анимации)

                physics.fightAttackTimer = 0;
            }
        } else {
            physics.fightAttackTimer = 0;
        }

        // Заморозка ИИ-поведения во время боя
        physics.actionTimer = 0;
        physics.isGrounded = true;
    }
}

// ГЛАВНЫЙ КЛАСС

export class GameWorld {
    constructor(elementId, customConfig = {}) {
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
            MAX_LIFETIME: 7200000,
            MAX_CHARACTERS: 20,
            MAX_MESSAGE_LENGTH: 160,
            TARGET_FPS: 60,
            character: 'turtle'
        };
        this.config = { ...defaultConfig, ...customConfig };

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
        requestAnimationFrame(this._animationLoop);
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

    spawnFromMessage(payload) {
        const platform = (payload?.platform || "unknown").toLowerCase();
        const userName = payload?.user || "Anonymous";
        const color = resolveMessageColor(payload);
        const message = payload?.message || "";
        const emotes = payload?.emotes || [];
        const attackerKey = `${platform}:${userName.trim().toLowerCase()}`;

        if (message.trim().toLowerCase().startsWith('!дуэль')) {
           
            const parts = message.trim().split(/\s+/);
            const hasTarget = parts.length >= 2;
            const targetNick = hasTarget ? parts[1].trim().toLowerCase() : null;

            let attacker = this.characters.get(attackerKey);
            let isNew = false;
            if (!attacker) {
                const initialMessage = hasTarget ? `Внезапная атака на ${targetNick}` : "Введите никнейм цели";
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

            if (!hasTarget) {
                attacker.renderer.updateBubble("Введите никнейм цели");
                return;
            }

            if (!isNew) {
                this._updateCharacterBubble(attacker.renderer, `Вызываю на дуэль ${targetNick}`, []);
            }

            let targetKey = `${platform}:${targetNick}`;
            let target = this.characters.get(targetKey);

            if (!target) {
                for (let [key, entry] of this.characters.entries()) {
                    const nick = key.split(':')[1];
                    if (nick === targetNick && key !== attackerKey) {
                        targetKey = key;
                        target = entry;
                        break;
                    }
                }
            }

            if (!target || attacker === target) {
                attacker.renderer.updateBubble("Цель не найдена");
                return;
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
            deadTimer: 0
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


        // Восстанавение полного здоровья обоим персонажам перед боем
        const now = Date.now();
        charA.physics.dieTime = now + this.config.MAX_LIFETIME;
        charB.physics.dieTime = now + this.config.MAX_LIFETIME;

        charA.renderer.showHeal(100);
        charB.renderer.showHeal(100);

        charA.renderer.setWinner(false);
        charB.renderer.setWinner(false);

        charA.renderer.setInCombat(true);
        charB.renderer.setInCombat(true);

        // Поворот персонажей лицом друг к другу
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
            // Восстанавление полного здоровья победителю
            winner.physics.dieTime = Date.now() + this.config.MAX_LIFETIME;
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
            winner.renderer.setInCombat(false);
            if (loser.physics.state !== 'dead') {
                loser.physics.state = 'dead';
                loser.physics.deadTimer = 10000;
                loser.physics.vx = 0;
                loser.renderer.setState('dead');
                loser.renderer.updateLifeBar(0);
            }
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

            // Состояние смерти
            if (physics.state === 'dead') {
                physics.deadTimer -= delta;
                if (physics.deadTimer <= 0) {
                    renderer.destroy(true);
                    this.characters.delete(key);
                } else {
                    PhysicsSystem.applyGravityAndMovement(physics, platforms, worldWidth, worldHeight, this.config);
                    this._updateContainerPosition(renderer, physics);
                }
                continue;
            }

            // Жизненный цикл
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

            // Логика ИИ и боя
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

            // Физика
            PhysicsSystem.applyGravityAndMovement(physics, platforms, worldWidth, worldHeight, this.config);

            // Анимация
            let visualState = physics.state;
            if (isFightingActive) {
                visualState = physics.fightMoveToTarget ? 'walking' : 'fighting';
            }
            renderer.setState(visualState);
            renderer.setDirection(physics.vx);

            // Позиционирование
            this._updateContainerPosition(renderer, physics);
            this._updateColliderBlockStyle(renderer, physics);
        }

        requestAnimationFrame(this._animationLoop);
    }
}