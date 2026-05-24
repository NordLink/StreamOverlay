export default class PortalEffect {
    constructor(containerId = 'world') {
        this.container = document.getElementById(containerId);
        this.NS = 'http://www.w3.org/2000/svg';
        this.initSVGContainer();
        this.buildTemplate();
        this.startRingAnimation();
    }

    initSVGContainer() {
        this.svg = document.createElementNS(this.NS, 'svg');
        this.svg.setAttribute('style', 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;');
        this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        const defs = document.createElementNS(this.NS, 'defs');
        defs.innerHTML = `
            <radialGradient id="portalGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#ccff99" stop-opacity="1"/>
                <stop offset="40%" stop-color="#3eff6a" stop-opacity="0.9"/>
                <stop offset="80%" stop-color="#008e24" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="#004d0e" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="portalCore" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#f2ffb0"/>
                <stop offset="100%" stop-color="#2acf4a"/>
            </radialGradient>
            <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
                <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur2"/>
                <feMerge>
                    <feMergeNode in="blur2"/>
                    <feMergeNode in="blur1"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
        `;

        // Стили для вращающегося кольца
        const style = document.createElement('style');
        style.textContent = `
            .rotating-ring {
                animation: subtlePulse 1.2s infinite alternate;
            }
            .portal-particle {
                animation: floatParticle 2.5s infinite alternate ease-in-out;
            }
            @keyframes subtlePulse {
                0% { stroke-opacity: 0.4; stroke-width: 2; }
                100% { stroke-opacity: 1; stroke-width: 3.5; }
            }
            @keyframes floatParticle {
                0% { transform: translate(0px, 0px) scale(1); opacity: 0.4; }
                100% { transform: translate(5px, -7px) scale(1.3); opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        this.portalsLayer = document.createElementNS(this.NS, 'g');
        this.svg.appendChild(defs);
        this.svg.appendChild(this.portalsLayer);
        this.container.appendChild(this.svg);
    }

    buildTemplate() {
        this.templateInner = document.createElementNS(this.NS, 'g');
        this.templateInner.setAttribute('class', 'portal-inner');
        this.templateInner.style.transform = 'scale(0,0)';

        const glowOval = document.createElementNS(this.NS, 'ellipse');
        glowOval.setAttribute('rx', '70');
        glowOval.setAttribute('ry', '95');
        glowOval.setAttribute('fill', 'url(#portalGlow)');
        glowOval.setAttribute('filter', 'url(#neonGlow)');

        const mainOval = document.createElementNS(this.NS, 'ellipse');
        mainOval.setAttribute('rx', '58');
        mainOval.setAttribute('ry', '82');
        mainOval.setAttribute('fill', 'url(#portalCore)');
        mainOval.setAttribute('stroke', '#a2ff7a');
        mainOval.setAttribute('stroke-width', '3');

        // Вращающееся кольцо (пульсация + вращение)
        const ring = document.createElementNS(this.NS, 'ellipse');
        ring.setAttribute('rx', '45');
        ring.setAttribute('ry', '65');
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', '#e2ffb0');
        ring.setAttribute('stroke-width', '2.5');
        ring.setAttribute('stroke-dasharray', '12 10');
        ring.setAttribute('class', 'rotating-ring');

        const core = document.createElementNS(this.NS, 'ellipse');
        core.setAttribute('rx', '30');
        core.setAttribute('ry', '42');
        core.setAttribute('fill', '#c2ff88');
        core.setAttribute('opacity', '0.9');

        this.templateInner.appendChild(glowOval);
        this.templateInner.appendChild(mainOval);
        this.templateInner.appendChild(ring);
        this.templateInner.appendChild(core);

        // Партиклы
        for (let i = 0; i < 18; i++) {
            const particle = document.createElementNS(this.NS, 'circle');
            const angle = (i / 18) * Math.PI * 2;
            const radX = 62 + Math.random() * 14;
            const radY = 86 + Math.random() * 18;
            particle.setAttribute('cx', Math.cos(angle) * radX);
            particle.setAttribute('cy', Math.sin(angle) * radY);
            particle.setAttribute('r', '2.2');
            particle.setAttribute('fill', `rgba(190, 255, 120, ${0.5 + Math.random() * 0.5})`);
            particle.classList.add('portal-particle');
            this.templateInner.appendChild(particle);
        }
    }

    // Анимация вращения пунктирной линии кольца (stroke-dashoffset)
    startRingAnimation() {
        let offset = 0;
        const animate = () => {
            offset = (offset - 2.4) % 44;
            const rings = document.querySelectorAll('.rotating-ring');
            rings.forEach(ring => {
                ring.setAttribute('stroke-dashoffset', offset);
            });
            requestAnimationFrame(animate);
        };
        animate();
    }

    spawnPortal(x, y, worldWidth, worldHeight, options = {}) {
        const widthPercent = options.widthPercent ?? 8;
        const heightPercent = options.heightPercent ?? 80;

        const targetWidth = worldWidth * widthPercent / 100;
        const targetHeight = worldHeight * heightPercent / 100;

        const baseWidth = 140;
        const baseHeight = 190;

        const scaleX = targetWidth / baseWidth;
        const scaleY = targetHeight / baseHeight;

        const inner = this.templateInner.cloneNode(true);
        const outer = document.createElementNS(this.NS, 'g');
        outer.setAttribute('transform', `translate(${x}, ${y})`);
        outer.appendChild(inner);
        this.portalsLayer.appendChild(outer);

        return {
            open: () => new Promise(resolve => {
                void inner.getBoundingClientRect();
                inner.style.transition = 'transform 0.45s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
                inner.style.transform = `scale(${scaleX}, ${scaleY})`;
                inner.addEventListener('transitionend', resolve, { once: true });
                setTimeout(resolve, 500);
            }),
            close: () => new Promise(resolve => {
                inner.style.transition = 'transform 0.4s ease-in';
                inner.style.transform = 'scale(0,0)';
                const onComplete = () => {
                    if (outer.parentNode) outer.remove();
                    resolve();
                };
                inner.addEventListener('transitionend', onComplete, { once: true });
                setTimeout(onComplete, 450);
            }),
            destroy() {
                if (this.svg && this.svg.parentNode) {
                    this.svg.parentNode.removeChild(this.svg);
                }
                this.portalsLayer = null;
                this.templateInner = null;
                this.svg = null;
            }
        };
    }
}