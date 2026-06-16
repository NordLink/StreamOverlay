import TurtleRenderer from '../components/gameworld/turtleRenderer.js';

class DuelDisplay {
    static DUEL_CHAR_SIZE_PERCENT = 35;
    static DESIRED_DISTANCE_FACTOR = 0.9;

    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container ${containerId} not found`);

        this.renderers = new Map();
        this.lastConfig = null;
        this.channel = new BroadcastChannel('duel_broadcast');
        this.channel.onmessage = (event) => this._handleMessage(event.data);

        this.pendingStates = new Map();
        this._cleanupTimer = null;
        this._duelTimeoutId = null;
        this._pendingDamages = new Map();

        this.victoryTextElement = null;
        this.winnerKey = null;

        this._resizeHandler = this._resizeHandler.bind(this);
        window.addEventListener('resize', this._resizeHandler);
    }

    _handleMessage(data) {
        switch (data.type) {
            case 'duelStart':
                this._onDuelStart(data);
                break;
            case 'duelStateChange':
                this._onDuelStateChange(data);
                break;
            case 'duelAttack':
                this._onDuelAttack(data);
                break;
            case 'duelEnd':
                this._onDuelEnd(data);
                break;
            case 'duelAbort':
                this._onDuelAbort(data);
                break;
        }
    }

    _onDuelStateChange(data) {
        const { fighterKey, state } = data;
        const fighter = this.renderers.get(fighterKey);
        if (fighter) {
            fighter.renderer.setState(state);
        } else {
            this.pendingStates.set(fighterKey, state);
        }
        this._resetDuelTimeout();
    }

    async _onDuelStart(data) {
        this._clearRenderers();
        this.pendingStates.clear();
        for (let timeout of this._pendingDamages.values()) clearTimeout(timeout);
        this._pendingDamages.clear();

        const { left, right, config } = data;
        this.lastConfig = config;
        const worldWidth = this.container.clientWidth;
        const worldHeight = this.container.clientHeight;

        const [leftRenderer, rightRenderer] = await Promise.all([
            this._createRenderer(left, config, worldWidth, worldHeight),
            this._createRenderer(right, config, worldWidth, worldHeight)
        ]);

        leftRenderer.setInCombat(true);
        rightRenderer.setInCombat(true);

        this.renderers.set(left.key, {
            renderer: leftRenderer,
            healthPercent: 100,
            side: 'left'
        });
        this.renderers.set(right.key, {
            renderer: rightRenderer,
            healthPercent: 100,
            side: 'right'
        });

        this._updatePositions();

        if (left.isWinner) leftRenderer.setWinner(true);
        if (right.isWinner) rightRenderer.setWinner(true);
        leftRenderer.setFacing('right');
        rightRenderer.setFacing('left');

        for (let [key, state] of this.pendingStates.entries()) {
            const fighter = this.renderers.get(key);
            if (fighter) fighter.renderer.setState(state);
        }
        this.pendingStates.clear();

        this._resetDuelTimeout();
    }

    async _createRenderer(charData, config, worldWidth, worldHeight) {
        const fullSizePx = (DuelDisplay.DUEL_CHAR_SIZE_PERCENT / 100) * worldWidth;
        const colliderWidthPx = fullSizePx * (config.COLLIDER_WIDTH_PERCENT / 100);
        const colliderOffsetX = (fullSizePx - colliderWidthPx) / 2;

        const renderer = new TurtleRenderer(this.container, {
            fullWidth: fullSizePx,
            fullHeight: fullSizePx,
            colliderWidth: colliderWidthPx,
            colliderHeight: fullSizePx,
            colliderOffsetX: colliderOffsetX,
            debugCollider: false,
            color: charData.color,
            nickname: charData.nickname,
            turtleColor: charData.turtleColor,
            message: '',
            emotes: []
        });
        await renderer.init();
        if (renderer.bubbleEl) renderer.bubbleEl.style.display = 'none';
        return renderer;
    }

    _updatePositions() {
        const worldWidth = this.container.clientWidth;
        const worldHeight = this.container.clientHeight;
        if (worldWidth === 0 || this.renderers.size !== 2) return;

        let leftChar = null, rightChar = null;
        for (let [key, data] of this.renderers.entries()) {
            if (data.side === 'left') leftChar = data;
            else if (data.side === 'right') rightChar = data;
        }
        if (!leftChar || !rightChar) return;

        const leftRenderer = leftChar.renderer;
        const rightRenderer = rightChar.renderer;

        const charWidth = leftRenderer.options.fullWidth;
        const desiredCenterDistance = charWidth * DuelDisplay.DESIRED_DISTANCE_FACTOR;
        const halfDistance = desiredCenterDistance / 2;
        const worldCenter = worldWidth / 2;

        let leftX = worldCenter - halfDistance - leftRenderer.options.colliderWidth / 2;
        let rightX = worldCenter + halfDistance - rightRenderer.options.colliderWidth / 2;

        leftX = Math.max(0, Math.min(worldWidth - leftRenderer.options.colliderWidth, leftX));
        rightX = Math.max(0, Math.min(worldWidth - rightRenderer.options.colliderWidth, rightX));

        const leftContainerX = leftX - leftRenderer.options.colliderOffsetX;
        const rightContainerX = rightX - rightRenderer.options.colliderOffsetX;

        const yPx = worldHeight - charWidth;

        leftRenderer.setPosition(leftContainerX, yPx);
        rightRenderer.setPosition(rightContainerX, yPx);
    }

    _resizeHandler() {
        if (this.renderers.size === 0) return;
        const worldWidth = this.container.clientWidth;
        if (worldWidth === 0) return;

        for (let [key, data] of this.renderers.entries()) {
            const { renderer, healthPercent } = data;
            const newFullSizePx = (DuelDisplay.DUEL_CHAR_SIZE_PERCENT / 100) * worldWidth;
            const newColliderWidthPx = newFullSizePx * (this.lastConfig.COLLIDER_WIDTH_PERCENT / 100);
            const newColliderOffsetX = (newFullSizePx - newColliderWidthPx) / 2;

            renderer.setSize(newFullSizePx, newFullSizePx);
            renderer.updateColliderDimensions(newColliderWidthPx, newFullSizePx, newColliderOffsetX);
            renderer.options.fullWidth = newFullSizePx;
            renderer.options.fullHeight = newFullSizePx;
            renderer.options.colliderWidth = newColliderWidthPx;
            renderer.options.colliderOffsetX = newColliderOffsetX;

            renderer.updateLifeBar(healthPercent);
        }

        this._updatePositions();
    }

    _onDuelAttack(data) {
        this._resetDuelTimeout();
        const { attackerKey, targetKey, damageValue } = data;
        const attacker = this.renderers.get(attackerKey);
        const target = this.renderers.get(targetKey);
        if (!attacker || !target) return;

        attacker.renderer.playAttackEffect();

        const timeoutId = setTimeout(() => {
            this._pendingDamages.delete(targetKey);
            if (!this.renderers.has(attackerKey) || !this.renderers.has(targetKey)) return;
            const newHealth = Math.max(0, target.healthPercent - damageValue);
            target.healthPercent = newHealth;
            target.renderer.updateLifeBar(newHealth);
            target.renderer.playHitEffect();
            target.renderer.showDamage(damageValue);
        }, 300);

        this._pendingDamages.set(targetKey, timeoutId);
    }

    _onDuelEnd(data) {
        this._resetDuelTimeout();

        setTimeout(() => {
            const { winnerKey, loserKey, winnerHealthPercent, loserHealthPercent } = data;
            const winner = this.renderers.get(winnerKey);
            const loser = this.renderers.get(loserKey);

            if (winner) {
                winner.healthPercent = winnerHealthPercent;
                winner.renderer.updateLifeBar(winnerHealthPercent);
                winner.renderer.setWinner(true);
                winner.renderer.setLoser(false);
                this._showVictoryText(winnerKey, winner.renderer.options.nickname, winner.renderer.options.color);
            }
            if (loser) {
                loser.healthPercent = loserHealthPercent;
                loser.renderer.updateLifeBar(loserHealthPercent);
                loser.renderer.setWinner(false);
                loser.renderer.setLoser(true);
            }

            if (this._cleanupTimer) clearTimeout(this._cleanupTimer);
            this._cleanupTimer = setTimeout(() => this._clearRenderers(), 10000);
        }, 350);
    }

    _onDuelAbort(data) {
        console.log('Дуэль прервана (gameWorld уничтожен)', data);
        this._clearRenderers();
    }

    _resetDuelTimeout() {
        if (this._duelTimeoutId) clearTimeout(this._duelTimeoutId);
        this._duelTimeoutId = setTimeout(() => {
            console.warn('Таймаут дуэли: нет активности от gameWorld, очищаем рендеры');
            this._clearRenderers();
        }, 30000);
    }

    _showVictoryText(winnerKey, nickname, color) {
        if (this.victoryTextElement) {
            this.victoryTextElement.remove();
            this.victoryTextElement = null;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'victory-overlay';
        wrapper.innerHTML = `<span style="color: ${color}">${this._escapeHtml(nickname)}</span> победил!`;
        this.container.appendChild(wrapper);
        this.victoryTextElement = wrapper;
    }

    _escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function (m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    _clearRenderers() {
        for (let timeout of this._pendingDamages.values()) clearTimeout(timeout);
        this._pendingDamages.clear();

        if (this._duelTimeoutId) {
            clearTimeout(this._duelTimeoutId);
            this._duelTimeoutId = null;
        }
        if (this._cleanupTimer) {
            clearTimeout(this._cleanupTimer);
            this._cleanupTimer = null;
        }

        if (this.victoryTextElement) {
            this.victoryTextElement.remove();
            this.victoryTextElement = null;
        }
        this.winnerKey = null;

        for (let [, data] of this.renderers.entries()) {
            data.renderer.destroy(true);
        }
        this.renderers.clear();
        this.pendingStates.clear();
    }

    destroy() {
        this.channel.close();
        window.removeEventListener('resize', this._resizeHandler);
        this._clearRenderers();
    }
}

function initDuelDisplay() {
    const containerId = 'duel-world';
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container ${containerId} not found`);
        return;
    }
    new DuelDisplay(containerId);
}

initDuelDisplay();