import { ViewerStats } from '../components/viewerStats.js';

export async function renderViewersPreview(app) {

    app.innerHTML = `
        <style>
            .viewers-wrapper {
                display: flex;
                flex-direction: column;
                width: 500px;
                aspect-ratio: 213 / 199;
                box-sizing: border-box;
                padding: 20px;
            }

           
        </style>

        <div class="page-header">
            <div class="page-title">
                🔢 Счётчик зрителей
            </div>

            <div class="page-description">
                Предпросмотр и настройка виджета счётчика зрителей
            </div>
        </div>

        <div class="settings-layout">

            <div class="placeholder">

                <h3>👁 Предпросмотр</h3>

                <div class="preview-wrapper chat-widget">
                    <div class="viewers-wrapper">
                        <div id="viewers-info" class="viewers-info"></div>
                    </div>
                </div>

                <p
                    class="text-muted"
                    style="margin-top:12px;"
                >
                    Демо-данные, не реальный счётчик зрителей
                </p>

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
                id="counterUrlField"
            >
                https://localhost:7017/viewers
            </div>

            <div class="actions">

                <button
                    class="copy"
                    id="copyCounterUrl"
                >
                    📋 Копировать
                </button>

                <button
                    class="open"
                    id="openCounterUrl"
                >
                    ↗ Открыть
                </button>

            </div>

        </div>
    `;

    const stats = new ViewerStats('viewers-info');

    stats.update('twitch', 125, true);
    stats.update('vk', 43, true);


    const urlElement =
        document.getElementById('counterUrlField');

    const copyButton =
        document.getElementById('copyCounterUrl');

    const openButton =
        document.getElementById('openCounterUrl');

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