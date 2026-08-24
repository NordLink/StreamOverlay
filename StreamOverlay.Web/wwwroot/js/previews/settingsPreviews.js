export async function renderSettingsPreview(app) {

    app.innerHTML = `
        <div class="page-header">
            <div class="page-title">
                Настройки
            </div>

            <div class="page-description">
                Настройки приложения и подключения
            </div>
        </div>

        <div class="settings-page">

            <div id="settings"></div>

        </div>
    `;

}