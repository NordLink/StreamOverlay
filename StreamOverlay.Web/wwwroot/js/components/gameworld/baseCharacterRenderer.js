export class BaseCharacterRenderer {
    constructor(worldElement, options) {
        this.world = worldElement;
        this.options = options;
        this.container = null;
        this.colliderBlock = null;
        this.lifeFill = null;
        this.bubbleEl = null;
        this.nicknameEl = null;
        this.bubbleTimeout = null;
        this._inCombatFlag = false;

        // Приватные поля для отслеживания изменений
        this._currentState = null;
        this._currentDirection = null;
        this._winnerFlag = false;
        this._loserFlag = false;
        this._hitTimeout = null;
    }

    init() {
        this.container = document.createElement('div');
        this.container.className = 'character-container';
        this.container.style.position = 'absolute';

        // --- ДЛЯ ОПТИМИЗАЦИИ В OBS ---
        this.container.style.left = '0px';
        this.container.style.top = '0px';
        this.container.style.willChange = 'transform';

        this.container.style.overflow = 'visible';
        this.container.style.width = `${this.options.fullWidth}px`;
        this.container.style.height = `${this.options.fullHeight}px`;

        // Коллайдер блок
        this.colliderBlock = document.createElement('div');
        this.colliderBlock.className = 'character-collider';
        this.colliderBlock.style.position = 'absolute';
        this.colliderBlock.style.bottom = '0';
        this.colliderBlock.style.height = `${this.options.colliderHeight}px`;
        this.colliderBlock.style.width = `${this.options.colliderWidth}px`;
        this.colliderBlock.style.left = `${this.options.colliderOffsetX}px`;
        if (this.options.debugCollider) {
            this.colliderBlock.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            this.colliderBlock.style.border = '1px solid red';
        } else {
            this.colliderBlock.style.backgroundColor = 'transparent';
            this.colliderBlock.style.pointerEvents = 'none';
        }
        this.container.appendChild(this.colliderBlock);

        // Полоска жизни
        const lifeContainer = document.createElement('div');
        lifeContainer.className = 'life-bar-container';
        this.lifeFill = document.createElement('div');
        this.lifeFill.className = 'life-bar-fill';
        lifeContainer.appendChild(this.lifeFill);
        this.container.appendChild(lifeContainer);

        // Никнейм
        this.nicknameEl = document.createElement('div');
        this.nicknameEl.className = 'nickname';
        this.nicknameEl.style.color = this.options.color;
        this.nicknameEl.innerText = this.options.nickname;
        this.container.appendChild(this.nicknameEl);

        // Пузырь
        this.bubbleEl = document.createElement('div');
        this.bubbleEl.className = 'bubble';
        this.container.appendChild(this.bubbleEl);

        this._addSvgContent();

        this.world.appendChild(this.container);
        this.setState('idle');
    }

    setState(newState) {
        if (this._currentState === newState) return;
        if (this.container) {
            if (this._currentState) {
                this.container.classList.remove(this._currentState);
            }
            this.container.classList.add(newState);
            this._currentState = newState;
        }
    }

    setDirection(vx) {
        const svg = this.container?.querySelector('svg');
        if (!svg) return;

        let newDirection = null;
        if (vx > 0) newDirection = 'right';
        else if (vx < 0) newDirection = 'left';
        else newDirection = this._currentDirection;

        if (newDirection !== null && this._currentDirection !== newDirection) {
            this._currentDirection = newDirection;
            if (newDirection === 'right') {
                svg.style.transform = 'scaleX(1)';
            } else if (newDirection === 'left') {
                svg.style.transform = 'scaleX(-1)';
            }
        }
    }

    setInCombat(inCombat) {
        if (!this.container) return;
        if (inCombat === this._inCombatFlag) return;

        this._inCombatFlag = inCombat;
        if (inCombat) {
            this.container.classList.add('inCombat');
        } else {
            this.container.classList.remove('inCombat');
        }
    }

    setWinner(isWinner) {
        if (!this.container) return;
        if (isWinner === this._winnerFlag) return;
        this._winnerFlag = isWinner;
        if (isWinner) {
            this.container.classList.add('winner');
        } else {
            this.container.classList.remove('winner');
        }
    }

    setLoser(isLoser) {
        if (!this.container) return;
        if (isLoser === this._loserFlag) return;
        this._loserFlag = isLoser;
        if (isLoser) {
            this.container.classList.add('loser');
        } else {
            this.container.classList.remove('loser');
        }
    }

    playHitEffect() {
        if (!this.container) return;
        if (this._hitTimeout) clearTimeout(this._hitTimeout);

        this.container.classList.add('hit');
        this._hitTimeout = setTimeout(() => {
            if (this.container) this.container.classList.remove('hit');
            this._hitTimeout = null;
        }, 200);
    }

    setPosition(x, y) {
        if (this.container) {
            this.container.style.transform = `translate(${x}px, ${y}px)`;
        }
    }

    setSize(width, height) {
        if (this.container) {
            this.container.style.width = `${width}px`;
            this.container.style.height = `${height}px`;
        }
    }

    updateColliderDimensions(width, height, offsetX) {
        if (this.colliderBlock) {
            this.colliderBlock.style.width = `${width}px`;
            this.colliderBlock.style.height = `${height}px`;
            this.colliderBlock.style.left = `${offsetX}px`;
        }
    }

    updateLifeBar(percent) {
        if (this.lifeFill) {
            this.lifeFill.style.width = percent + '%';
            if (percent < 30) this.lifeFill.style.backgroundColor = '#e74c3c';
            else if (percent < 60) this.lifeFill.style.backgroundColor = '#f1c40f';
            else this.lifeFill.style.backgroundColor = '#2ecc71';
        }
    }

    updateBubble(htmlMessage, type = null) {
        if (!this.bubbleEl) return;
        clearTimeout(this.bubbleTimeout);

        // Сброс предыдцщих классов, оставляем 'bubble'
        this.bubbleEl.className = 'bubble';
        if (type && ['info', 'warning', 'error'].includes(type)) {
            this.bubbleEl.classList.add(`bubble-${type}`);
        }

        this.bubbleEl.innerHTML = htmlMessage;
        this.bubbleEl.style.opacity = '1';
        this.bubbleEl.style.display = 'block';

        let duration = 7000;
        if (type === 'error') duration = 10000;
        else if (type === 'warning') duration = 8000;

        this.bubbleTimeout = setTimeout(() => {
            this.bubbleEl.style.opacity = '0';
        }, duration);
    }

    destroy(animated = false) {
        if (!this.container) return;
        if (animated) {
            this.container.style.transition = 'opacity 0.5s, transform 0.5s';
            this.container.style.opacity = '0';
            this.container.style.transform += ' scale(0)';
            setTimeout(() => this.container.remove(), 500);
        } else {
            this.container.remove();
        }
        clearTimeout(this.bubbleTimeout);
        if (this._hitTimeout) clearTimeout(this._hitTimeout);
    }

    showDamage(amount) {
        const value = Math.abs(Math.round(amount));
        if (value === 0) return;
        this._showFloatingNumber(`-${value}`, true);
    }

    showHeal(amount) {
        const value = Math.abs(Math.round(amount));
        if (value === 0) return;
        this._showFloatingNumber(`+${value}`, false);
    }

    _showFloatingNumber(text, isDamage) {
        if (!this.container) return;

        const el = document.createElement('div');
        el.className = `float-number ${isDamage ? 'damage' : 'heal'}`;
        el.textContent = text;

        el.style.position = 'absolute';
        el.style.left = '50%';
        el.style.top = '0%';
        el.style.transform = 'translateX(-50%)';
        el.style.whiteSpace = 'nowrap';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '100';

        this.container.appendChild(el);

        setTimeout(() => {
            if (el && el.parentNode) el.remove();
        }, 1000);
    }

    playAttackEffect() {
        if (!this.container) return;

        this.container.classList.remove('attacking');
        this.container.classList.add('attacking');

        setTimeout(() => {
            if (this.container) this.container.classList.remove('attacking');
        }, 600);
    }

    setFacing(direction) {
        const svg = this.container?.querySelector('svg');
        if (!svg) return;
        if (direction === 'right') {
            svg.style.transform = 'scaleX(1)';
            this._currentDirection = 'right';
        } else if (direction === 'left') {
            svg.style.transform = 'scaleX(-1)';
            this._currentDirection = 'left';
        }
    }

    // Метод для наследников
    _addSvgContent() {
        throw new Error('_addSvgContent must be implemented by subclass');
    }
}