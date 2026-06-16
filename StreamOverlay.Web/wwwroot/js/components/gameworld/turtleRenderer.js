import { BaseCharacterRenderer } from './baseCharacterRenderer.js';

export default class TurtleRenderer extends BaseCharacterRenderer {
    static svgTemplate = null;

    constructor(worldElement, options) {
        super(worldElement, options);
        this.turtleColors = [
            '#89af41', '#76a032', '#a3c35d', '#6b8e23', '#556b2f', // старые цвета
            '#7cb342', '#558b2f', '#8bc34a', '#9e9d24', '#cddc39', // ярко-зелёные
            '#4caf50', '#2e7d32', '#81c784', '#aed581', '#dcedc8', // оттенки зелёного
            '#c5e1a5', '#f0f4c3', '#afb42b', '#827717', '#33691e', // оливково-жёлтые
            '#1b5e20', '#004d40', '#00695c', '#26a69a', '#80cbc4'  // тёмно-зелёные и бирюза
        ];
        // если передан конкретный цвет панциря – используем его, иначе случайный
        this.selectedTurtleColor = options.turtleColor || this._getRandomTurtleColor();
    }

    // метод для получения случайного цвета из списка (используется, если цвет не передан)
    _getRandomTurtleColor() {
        return this.turtleColors[Math.floor(Math.random() * this.turtleColors.length)];
    }

    async _addSvgContent() {
        if (!TurtleRenderer.svgTemplate) {
            try {
                const timestamp = Date.now();
                const response = await fetch(`/assets/sprites/turtle.svg?t=${timestamp}`); // откл кеш на время разработки
                //const response = await fetch('/assets/sprites/turtle.svg');
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
        //svgClone.style.width = '100%';
        svgClone.style.height = '100%';
        svgClone.style.display = 'block';
        this.container.appendChild(svgClone);

        // используем фиксированный цвет панциря
        this.container.style.setProperty('--mask-color', this.options.color);
        this.container.style.setProperty('--turtle-color', this.selectedTurtleColor);
    }
}