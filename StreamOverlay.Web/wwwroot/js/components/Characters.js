import { resolveMessageColor } from '../utils/colorUtils.js';
import { formatMessageWithEmotes } from '../utils/messageUtils.js';

export class Characters {
    static svgTemplate = null;

    constructor(elementId, customConfig = {}) {
        this.world = document.getElementById(elementId);
        this.characters = new Map();
        this.platformsData = [];

        const defaultConfig = {
            GRAVITY: 0.5,
            JUMP_POWER: -10,
            WALK_SPEED_PERCENT_PER_SECOND: 5, // Сколько процентов ширины мира персонаж проходит за 1 секунду
            CHAR_SIZE: 5, // Визуальный размер персонажа (процент от ширины мира)
            COLLIDER_WIDTH_PERCENT: 50,  // Ширина коллайдера в процентах от CHAR_SIZE
            WORLD_HEIGHT: 400,
            MAX_LIFETIME: 720000, // В миллисекундах
            MAX_CHARACTERS: 20,
            MAX_MESSAGE_LENGTH: 160,
            TARGET_FPS: 60,
            DEBUG_COLLIDER: true
        };
        this.config = { ...defaultConfig, ...customConfig };

        this.platformSettings = [
            { left: 87, top: 77.5, width: 13, height: 20 },
            { left: 60.5, top: 65, width: 2.5, height: 20 },
            { left: 49.5, top: 63, width: 6.5, height: 20 },
            { left: 49.3, top: 81.25, width: 7, height: 20 },
            { left: 18.5, top: 63, width: 6.5, height: 20 },
            { left: 18.3, top: 81.25, width: 7, height: 20 },
            { left: 12, top: 65, width: 2.5, height: 20 }
        ];

        this.turtleColors = ['#89af41', '#76a032', '#a3c35d', '#6b8e23', '#556b2f'];
        this.walkSpeedPxPerFrame = 0;

        this._animationLoop = this._animationLoop.bind(this);
        this._handleResize = this._handleResize.bind(this);
    }

    init() {
        if (!this.world) return;
        this._createPlatforms(this.platformSettings);
        this._updateSpeedScale();
        this.loadSvgTemplate().then(() => {
            requestAnimationFrame(this._animationLoop);
        });
        window.addEventListener('resize', this._handleResize);
    }

    async loadSvgTemplate() {
        if (Characters.svgTemplate) return;
        try {
            const response = await fetch('/assets/sprites/turtle.svg');
            const svgText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, 'image/svg+xml');
            Characters.svgTemplate = doc.documentElement;
        } catch (error) {
            console.error('Не удалось загрузить SVG:', error);
        }
    }

    spawnFromMessage(payload) {
        const platform = (payload?.platform || "unknown").toLowerCase();
        const userName = payload?.user || "Anonymous";
        const color = resolveMessageColor(payload);
        const message = payload?.message || "";
        const key = `${platform}:${userName.trim().toLowerCase()}`;

        if (this.characters.has(key)) {
            const char = this.characters.get(key);
            char.dieTime = Date.now() + this.config.MAX_LIFETIME;
            this._updateCharacterBubble(char, message, payload.emotes);
        } else {
            this._createCharacter(key, color, userName, message, payload.emotes);
        }
    }

    _updateSpeedScale() {
        if (!this.world) return;
        const worldWidth = this.world.offsetWidth;
        if (worldWidth === 0) return;

        const pixelsPerSecond = (this.config.WALK_SPEED_PERCENT_PER_SECOND / 100) * worldWidth;
        this.walkSpeedPxPerFrame = pixelsPerSecond / this.config.TARGET_FPS;
    }

    _getComputedPlatforms() {
        if (!this.world) return [];
        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;

        return this.platformsData.map(p => {
            const topPx = (p.topPercent / 100) * worldHeight;
            return {
                left: (p.leftPercent / 100) * worldWidth,
                right: ((p.leftPercent + p.widthPercent) / 100) * worldWidth,
                top: topPx,
                bottom: topPx + p.height
            };
        });
    }

    _truncateMessage(message) {
        if (message.length > this.config.MAX_MESSAGE_LENGTH) {
            return message.substring(0, this.config.MAX_MESSAGE_LENGTH) + '...';
        }
        return message;
    }

    _updateCharacterBubble(char, message, emotes) {
        if (!message) return;
        clearTimeout(char.bubbleTimeout);

        const truncatedMessage = this._truncateMessage(message);
        const formattedMessage = formatMessageWithEmotes(truncatedMessage, emotes);

        char.bubbleEl.innerHTML = formattedMessage;
        char.bubbleEl.style.opacity = '1';
        char.bubbleEl.style.display = 'block';

        char.bubbleTimeout = setTimeout(() => {
            char.bubbleEl.style.opacity = '0';
        }, 7000);
    }

    _createPlatforms(pData) {
        if (!this.world) return;
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

    _updateCharacterSizes() {
        if (!this.world) return;
        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;
        if (worldWidth === 0) return;

        const newFullSizePx = (this.config.CHAR_SIZE / 100) * worldWidth;
        const newColliderWidthPx = newFullSizePx * (this.config.COLLIDER_WIDTH_PERCENT / 100);
        const newColliderOffsetX = (newFullSizePx - newColliderWidthPx) / 2;

        for (let [key, char] of this.characters) {
            if (!char.element) continue;

            const oldFullWidth = char.fullWidth;
            if (Math.abs(oldFullWidth - newFullSizePx) < 0.5) continue;

            // Сохранение текущей мировой позиции центра коллайдера (по горизонтали)
            const oldColliderCenterX = char.colliderX + char.colliderWidth / 2;
            const oldColliderBottomY = char.colliderY + char.colliderHeight;

            // Обновление размеров коллайдера и смещение
            char.fullWidth = newFullSizePx;
            char.fullHeight = newFullSizePx;
            char.colliderWidth = newColliderWidthPx;
            char.colliderHeight = newFullSizePx;
            char.colliderOffsetX = newColliderOffsetX;

            // Обновление CSS контейнера
            char.element.style.width = `${char.fullWidth}px`;
            char.element.style.height = `${char.fullHeight}px`;

            // Корректировка позиции коллайдера, сохраняя его центр и низ
            char.colliderX = oldColliderCenterX - char.colliderWidth / 2;
            char.colliderY = oldColliderBottomY - char.colliderHeight;

            // Ограничение коллайдера границами мира
            if (char.colliderX < 0) char.colliderX = 0;
            if (char.colliderX + char.colliderWidth > worldWidth) char.colliderX = worldWidth - char.colliderWidth;
            if (char.colliderY < 0) char.colliderY = 0;
            if (char.colliderY + char.colliderHeight > worldHeight) char.colliderY = worldHeight - char.colliderHeight;

            // Пересчитывание позиции контейнера и обновление коллайдер-блок
            char.isGrounded = false;
            this._updateContainerPosition(char);
            this._updateColliderBlockStyle(char);
        }
    }

    // Обновление transform контейнера на основе позиции коллайдера
    _updateContainerPosition(char) {
        const containerX = char.colliderX - char.colliderOffsetX;
        const containerY = char.colliderY;
        char.element.style.transform = `translate(${containerX}px, ${containerY}px)`;
    }

    // Синхронизация стили DOM-элемента коллайдера с логическими размерами
    _updateColliderBlockStyle(char) {
        if (!char.colliderBlock) return;
        char.colliderBlock.style.width = `${char.colliderWidth}px`;
        char.colliderBlock.style.left = `${char.colliderOffsetX}px`;
        char.colliderBlock.style.height = `${char.colliderHeight}px`;
    }

    _handleResize() {
        const oldSpeed = this.walkSpeedPxPerFrame;
        this._updateSpeedScale();
        this._updateCharacterSizes();

        if (oldSpeed > 0 && this.walkSpeedPxPerFrame > 0) {
            const scale = this.walkSpeedPxPerFrame / oldSpeed;
            for (let [key, char] of this.characters) {
                if (Math.abs(char.vx) > 0.01) {
                    char.vx = char.vx * scale;
                }
            }
        }
    }

    _createCharacter(key, color, nickname, message, emotes) {
        if (!this.world) return;
        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;
        if (worldWidth === 0) return;

        if (this.characters.size >= this.config.MAX_CHARACTERS) {
            let oldestKey = null;
            let minDieTime = Infinity;
            this.characters.forEach((char, k) => {
                if (char.dieTime < minDieTime) {
                    minDieTime = char.dieTime;
                    oldestKey = k;
                }
            });
            if (oldestKey) {
                const oldChar = this.characters.get(oldestKey);
                oldChar.element.remove();
                this.characters.delete(oldestKey);
            }
        }

        const spawnTime = Date.now();
        const fullSizePx = (this.config.CHAR_SIZE / 100) * worldWidth;
        const colliderWidthPx = fullSizePx * (this.config.COLLIDER_WIDTH_PERCENT / 100);
        const colliderOffsetX = (fullSizePx - colliderWidthPx) / 2;

        // Начальная позиция коллайдера (случайная по горизонтали, на полу)
        const colliderX = Math.random() * (worldWidth - colliderWidthPx);
        const colliderY = worldHeight - fullSizePx;

        const charObj = {
            // Логические параметры коллайдера
            colliderX: colliderX,
            colliderY: colliderY,
            colliderWidth: colliderWidthPx,
            colliderHeight: fullSizePx,
            colliderOffsetX: colliderOffsetX,
            // Полные визуальные размеры контейнера
            fullWidth: fullSizePx,
            fullHeight: fullSizePx,
            // Скорости
            vx: 0, vy: 0,
            state: 'Idle',
            color: color,
            nickname: nickname,
            isGrounded: true,
            actionTimer: 1000,
            dieTime: spawnTime + this.config.MAX_LIFETIME,
            bubbleTimeout: null,
            lifeFill: null,
            element: null,
            colliderBlock: null
        };

        const bodyColor = this.turtleColors[Math.floor(Math.random() * this.turtleColors.length)];
        const container = document.createElement('div');
        container.className = 'character-container Idle';
        container.style.position = 'absolute';
        container.style.width = `${charObj.fullWidth}px`;
        container.style.height = `${charObj.fullHeight}px`;
        container.style.setProperty('--mask-color', color);
        container.style.setProperty('--turtle-color', bodyColor);
        // Чтобы дочерние элементы (пузырь, ник) не обрезались
        container.style.overflow = 'visible';

        // Блок коллайдера
        const colliderDiv = document.createElement('div');
        colliderDiv.className = 'character-collider';
        colliderDiv.style.position = 'absolute';
        colliderDiv.style.bottom = '0';
        colliderDiv.style.height = '100%';
        colliderDiv.style.width = `${charObj.colliderWidth}px`;
        colliderDiv.style.left = `${charObj.colliderOffsetX}px`;
        if (this.config.DEBUG_COLLIDER) {
            colliderDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            colliderDiv.style.border = '1px solid red';
        } else {
            colliderDiv.style.backgroundColor = 'transparent';
            colliderDiv.style.pointerEvents = 'none';
        }
        container.appendChild(colliderDiv);
        charObj.colliderBlock = colliderDiv;

        // Полоска жизни
        const lifeContainer = document.createElement('div');
        lifeContainer.className = 'life-bar-container';
        const lifeFill = document.createElement('div');
        lifeFill.className = 'life-bar-fill';
        lifeContainer.appendChild(lifeFill);
        charObj.lifeFill = lifeFill;

        // Никнейм
        const nickEl = document.createElement('div');
        nickEl.className = 'nickname';
        nickEl.style.color = color;
        nickEl.innerText = nickname;

        // Пузырь с сообщением
        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'bubble';
        charObj.bubbleEl = bubbleEl;

        container.appendChild(bubbleEl);
        container.appendChild(lifeContainer);
        container.appendChild(nickEl);

        if (Characters.svgTemplate) {
            const svgClone = Characters.svgTemplate.cloneNode(true);
            svgClone.style.width = '100%';
            svgClone.style.height = '100%';
            svgClone.style.display = 'block';
            container.appendChild(svgClone);
        } else {
            console.warn('SVG шаблон не загружен, персонаж создаётся без иконки');
        }

        this.world.appendChild(container);
        charObj.element = container;
        this._updateContainerPosition(charObj);
        this.characters.set(key, charObj);
        this._updateCharacterBubble(charObj, message, emotes);
    }

    _animationLoop() {
        if (!this.world) return;
        const worldWidth = this.world.offsetWidth;
        const worldHeight = this.world.offsetHeight;
        const now = Date.now();
        const currentPlatforms = this._getComputedPlatforms();

        for (let [key, char] of this.characters) {
            const timeLeft = char.dieTime - now;
            const percent = Math.max(0, (timeLeft / this.config.MAX_LIFETIME) * 100);

            if (timeLeft <= 0) {
                char.element.style.transition = 'opacity 0.5s, transform 0.5s';
                char.element.style.opacity = '0';
                char.element.style.transform += ' scale(0)';
                setTimeout(() => char.element.remove(), 500);
                this.characters.delete(key);
                continue;
            }

            if (char.lifeFill) {
                char.lifeFill.style.width = percent + '%';
                if (percent < 30) char.lifeFill.style.backgroundColor = '#e74c3c';
                else if (percent < 60) char.lifeFill.style.backgroundColor = '#f1c40f';
                else char.lifeFill.style.backgroundColor = '#2ecc71';
            }

            char.actionTimer -= 16;
            if (char.actionTimer <= 0 && char.isGrounded) {
                char.actionTimer = Math.random() * 2000 + 500;
                const rand = Math.random();
                if (rand < 0.3) {
                    char.vx = -this.walkSpeedPxPerFrame;
                    char.state = 'Walking';
                } else if (rand < 0.6) {
                    char.vx = this.walkSpeedPxPerFrame;
                    char.state = 'Walking';
                } else if (rand < 0.8) {
                    char.vy = this.config.JUMP_POWER;
                    char.isGrounded = false;
                    char.state = 'Jumping';
                } else {
                    char.vx = 0;
                    char.state = 'Idle';
                }
            }

            // Физика на основе коллайдера
            char.vy += this.config.GRAVITY;
            const prevColliderY = char.colliderY;
            char.colliderX += char.vx;
            char.colliderY += char.vy;

            // Границы мира по горизонтали для коллайдера
            if (char.colliderX < 0) {
                char.colliderX = 0;
                char.vx *= -1;
            } else if (char.colliderX + char.colliderWidth > worldWidth) {
                char.colliderX = worldWidth - char.colliderWidth;
                char.vx *= -1;
            }

            char.isGrounded = false;

            // Коллизии с платформами
            if (char.vy > 0) {
                for (let p of currentPlatforms) {
                    if (prevColliderY + char.colliderHeight <= p.top &&
                        char.colliderY + char.colliderHeight >= p.top &&
                        char.colliderX + char.colliderWidth > p.left &&
                        char.colliderX < p.right) {
                        char.colliderY = p.top - char.colliderHeight;
                        char.vy = 0;
                        char.isGrounded = true;
                        char.state = char.vx === 0 ? 'Idle' : 'Walking';
                        break;
                    }
                }
            }

            // Ограничение по полу
            if (char.colliderY + char.colliderHeight >= worldHeight) {
                char.colliderY = worldHeight - char.colliderHeight;
                char.vy = 0;
                char.isGrounded = true;
                char.state = char.vx === 0 ? 'Idle' : 'Walking';
            }

            // Обновление позиции контейнера на основе нового положения коллайдера
            this._updateContainerPosition(char);
            // Синхронизация стилий коллайдера (размер, смещение)
            this._updateColliderBlockStyle(char);

            // Поворот SVG в зависимости от направления движения
            const svgChar = char.element.querySelector('svg');
            if (svgChar) {
                if (char.vx > 0) svgChar.style.transform = 'scaleX(1)';
                else if (char.vx < 0) svgChar.style.transform = 'scaleX(-1)';
            }

            char.element.className = `character-container ${char.state}`;
        }

        requestAnimationFrame(this._animationLoop);
    }
}