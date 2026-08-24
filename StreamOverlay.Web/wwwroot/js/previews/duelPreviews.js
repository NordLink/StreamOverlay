export async function renderDuelPreview(app) {

    app.innerHTML = `
        <div class="page-header">
            <div class="page-title">
                Дуэль
            </div>

            <div class="page-description">
                Предпросмотр и настройка дуэли
            </div>
        </div>

        <div class="widget-page">

            <div class="widget-preview">
                <div id="duelPreview"></div>
            </div>

            <div class="widget-settings">
                <div id="duelSettings"></div>
            </div>

        </div>
    `;
}