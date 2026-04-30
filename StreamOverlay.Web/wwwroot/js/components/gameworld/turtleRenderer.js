import { BaseCharacterRenderer } from './baseCharacterRenderer.js';

export default class TurtleRenderer extends BaseCharacterRenderer {
    static svgTemplate = null;

    constructor(worldElement, options) {
        super(worldElement, options);
        this.turtleColors = ['#89af41', '#76a032', '#a3c35d', '#6b8e23', '#556b2f'];
    }

    async _addSvgContent() {
        if (!TurtleRenderer.svgTemplate) {
            try {
                const response = await fetch('/assets/sprites/turtle.svg');
                const svgText = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(svgText, 'image/svg+xml');
                TurtleRenderer.svgTemplate = doc.documentElement;
            } catch (error) {
                console.error('Не удалось загрузить turtle.svg:', error);
                return;
            }
        }
        const svgClone = TurtleRenderer.svgTemplate.cloneNode(true);
        svgClone.style.width = '100%';
        svgClone.style.height = '100%';
        svgClone.style.display = 'block';
        this.container.appendChild(svgClone);

        const bodyColor = this.turtleColors[Math.floor(Math.random() * this.turtleColors.length)];
        this.container.style.setProperty('--mask-color', this.options.color);
        this.container.style.setProperty('--turtle-color', bodyColor);
    }
}