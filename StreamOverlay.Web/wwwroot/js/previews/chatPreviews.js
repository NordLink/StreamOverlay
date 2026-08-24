import { Chat } from '../components/chat.js';

export async function renderChatPreview(app) {

    app.innerHTML = `
        <style>
            .chat-wrapper {
                display: flex;
                flex-direction: column;
                width: 500px;
                aspect-ratio: 213 / 199;
                background: rgba(0, 0, 0, 0.8);
                box-sizing: border-box;
            }
        </style>

        <div class="page-header">
            <div class="page-title">
                💬 Чат
            </div>

            <div class="page-description">
                Предпросмотр и настройка виджета чата
            </div>
        </div>

        <div class="settings-layout">

            <div class="placeholder">

                <h3>👁 Предпросмотр</h3>

                <div class="preview-wrapper chat-widget">
                    <div class="chat-wrapper">
                        <div id="chat"></div>
                    </div>
                </div>
                <p class="text-muted" style="margin-top:12px;">Демо-данные, не реальный чат</p>
            </div>


            <div class="placeholder">

                <h3>⚙️ Настройки</h3>

            </div>

        </div>


        <div class="url-section">

            <span class="label">
                🔗 URL виджета
            </span>

            <div
                class="url-field"
                id="chatUrlField"
            >
                https://localhost:7017/chat
            </div>

            <div class="actions">

                <button
                    class="copy"
                    id="copyChatUrl"
                >
                    📋 Копировать
                </button>

                <button
                    class="open"
                    id="openChatUrl"
                >
                    ↗ Открыть
                </button>

            </div>

        </div>
    `;

    const chat = new Chat('chat', {
        maxLines: 10,
        showTime: true,
        showPlatformTag: true,
        showPlatformColor: true
    });

    const demoMessages = [
        {
            platform: 'twitch',
            user: 'MrNord',
            message: 'Всем привет! 👋',
            time: '19:42',
            badges: ['https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/1', 'https://static-cdn.jtvnw.net/badges/v1/4300a897-03dc-4e83-8c0e-c332fee7057f/1' ],
            emotes: [],
            highlighted: false
        },

        {
            platform: 'vk',
            user: 'Viewer123',
            message: 'Привет! Как дела?',
            time: '19:42',
            badges: [],
            emotes: [],
            highlighted: false
        },

        {
            platform: 'twitch',
            user: 'DarkSoul',
            message: 'Сегодня будет крутой стрим 🔥',
            time: '19:43',
            badges: ['https://static-cdn.jtvnw.net/badges/v1/58d48669-bfee-46e7-a83c-b65a30783400/1'],
            emotes: [],
            highlighted: false
        },

        {
            platform: 'twitch',
            user: 'Moderator',
            message: 'Не забудьте поставить лайк 👍',
            time: '19:43',
            badges: ['https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/1'],
            emotes: [],
            highlighted: true
        },

        {
            platform: 'vk',
            user: 'Растегаев Леха',
            message: 'Не забудьте поставить лайк 👍',
            time: '19:43',
            badges: ['https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/1'],
            emotes: [],
            highlighted: false
        },

        {
            platform: 'vk',
            user: 'Ninja',
            message: 'Я уже здесь!',
            time: '19:44',
            badges: [],
            emotes: [],
            highlighted: false
        }
    ];


    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    (async () => {
        for (const message of demoMessages) {
            chat.appendMessage(message);
            await sleep(1000);
        }
    })();

    const urlElement =
        document.getElementById('chatUrlField');

    const copyButton =
        document.getElementById('copyChatUrl');

    const openButton =
        document.getElementById('openChatUrl');


    const url =
        urlElement.textContent.trim();


    copyButton.addEventListener('click', async () => {

        try {

            await navigator.clipboard.writeText(url);

            copyButton.textContent = '✅ Скопировано';

            setTimeout(() => {
                copyButton.textContent = '📋 Копировать';
            }, 1500);

        }
        catch (error) {

            console.error(
                'Не удалось скопировать URL:',
                error
            );

        }

    });

    openButton.addEventListener('click', () => {

        window.open(
            url,
            '_blank',
            'noopener,noreferrer'
        );

    });
}