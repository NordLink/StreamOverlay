export async function renderChattersPreview(app) {

    app.innerHTML = `
        <div class="page-header">
            <div class="page-title">
                Зрители
            </div>

            <div class="page-description">
                Предпросмотр и настройка списка зрителей
            </div>
        </div>

        <div class="widget-page">

            <div class="widget-preview">
                <div id="viewersPreview"></div>
            </div>

            <div class="widget-settings">
                <div id="viewersSettings"></div>
            </div>

        </div>
    `;
}