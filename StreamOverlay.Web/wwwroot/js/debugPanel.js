import { ConnectionService } from './services/connectionService.js';
import { GameWorld } from './components/gameworld/gameWorld.js';

const streamHub = new ConnectionService("/chat-hub");

const characterWorld = new GameWorld(
    "world",
    {
        character: 'turtle',
        MAX_CHARACTERS: 8,
        DEBUG_COLLIDER: false
    },
    (duelData) => {
        if (streamHub && streamHub.sendDuelResult) {
            streamHub.sendDuelResult(
                duelData.winnerKey,
                duelData.winnerDisplayName,
                duelData.winnerColor,
                duelData.loserKey,
                duelData.loserDisplayName,
                duelData.loserColor,
                duelData.timestamp
            );
        }
    },
    streamHub
);

characterWorld.init();

streamHub.onChatMessageCallback = (payload) => {
    characterWorld.spawnFromMessage(payload);
};

streamHub.start();

export function addDebugPanel() {

    const panel = document.createElement('div');
    panel.style.position = 'fixed';
    panel.style.top = '20px';
    panel.style.left = '20px';
    panel.style.backgroundColor = '#2c2c2c';
    panel.style.color = '#f0f0f0';
    panel.style.padding = '15px';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    panel.style.zIndex = '9999';
    panel.style.fontFamily = 'monospace';
    panel.style.fontSize = '14px';
    panel.style.width = '260px';
    panel.style.border = '1px solid #555';

    const title = document.createElement('div');
    title.innerText = '🐞 Debug: ручная отправка сообщения';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '12px';
    title.style.textAlign = 'center';
    panel.appendChild(title);

    function createField(labelText, inputId, defaultValue = '') {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '10px';

        const label = document.createElement('label');
        label.innerText = labelText;
        label.style.display = 'block';
        label.style.marginBottom = '4px';
        label.style.fontSize = '12px';

        const input = document.createElement('input');
        input.id = inputId;
        input.value = defaultValue;
        input.style.width = '100%';
        input.style.padding = '6px';
        input.style.borderRadius = '4px';
        input.style.border = '1px solid #888';
        input.style.backgroundColor = '#3c3c3c';
        input.style.color = '#fff';
        input.style.boxSizing = 'border-box';

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        panel.appendChild(wrapper);
        return input;
    }

    const userInput = createField('user (string)', 'debug_user', '1');
    const messageInput = createField('message (string)', 'debug_message', '!дуэль');
    const colorInput = createField('color (hex)', 'debug_color', '');
    const platformInput = createField('platform (string)', 'debug_platform', 'twitch');
    const timeInput = createField('time (string, например 16:16)', 'debug_time', '16:16');
    const emotesInput = createField('emotes (массив, через запятую)', 'debug_emotes', '');

    const sendButton = document.createElement('button');
    sendButton.innerText = 'Send';
    sendButton.style.width = '100%';
    sendButton.style.padding = '8px';
    sendButton.style.backgroundColor = '#00AA6C';
    sendButton.style.border = 'none';
    sendButton.style.borderRadius = '4px';
    sendButton.style.color = 'white';
    sendButton.style.fontWeight = 'bold';
    sendButton.style.cursor = 'pointer';
    sendButton.style.marginTop = '8px';
    sendButton.style.transition = '0.2s';

    sendButton.onmouseenter = () => sendButton.style.backgroundColor = '#008858';
    sendButton.onmouseleave = () => sendButton.style.backgroundColor = '#00AA6C';

    panel.appendChild(sendButton);

    const closeBtn = document.createElement('button');
    closeBtn.innerText = '✖';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '5px';
    closeBtn.style.right = '8px';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#aaa';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => panel.remove();
    panel.appendChild(closeBtn);

    sendButton.addEventListener('click', () => {

        let emotesArray = [];
        const rawEmotes = emotesInput.value.trim();
        if (rawEmotes !== '') {
            emotesArray = rawEmotes.split(',').map(em => em.trim()).filter(em => em !== '');
        }

        const payload = {
            user: userInput.value.trim(),
            message: messageInput.value,
            color: colorInput.value.trim(),
            platform: platformInput.value.trim(),
            time: timeInput.value.trim(),
            emotes: emotesArray
        };

        if (typeof characterWorld !== 'undefined' && characterWorld.spawnFromMessage) {
            characterWorld.spawnFromMessage(payload);
            console.log('[Debug] Отправлен payload:', payload);
        } else {
            console.error('[Debug] characterWorld.spawnFromMessage не найден!');
        }
    });

    document.body.appendChild(panel);
}

addDebugPanel();