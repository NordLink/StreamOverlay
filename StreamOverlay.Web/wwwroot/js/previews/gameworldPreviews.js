export async function renderGameworldPreview(app) {

    app.innerHTML = `
        <div class="page-header">
            <div class="page-title">
                Игровой мир
            </div>

            <div class="page-description">
                Предпросмотр и настройка игрового мира
            </div>
        </div>

        <div class="widget-page">

            <div class="widget-preview">
                <div id="gameworldPreview"></div>
            </div>

            <div class="widget-settings">
                <div id="gameworldSettings"></div>
            </div>

        </div>
    `;
}