import { navigate } from '../orchestrates/homePage.js';

export async function renderHomePagePreview(app) {

    app.innerHTML = `
        <style>
            .home-connections {
                margin-top: 30px;
            }

            .home-section-title {
                font-size: 17px;
                font-weight: 600;
                margin-bottom: 14px;
            }

            .home-connections-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 14px;
            }

            .home-connection {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;

                padding: 18px;

                background: rgba(27, 40, 56, .72);
                border: 1px solid rgba(102, 153, 204, .18);
                border-radius: 14px;
            }

            .home-platform {
                display: flex;
                align-items: center;
                gap: 13px;
            }

            .home-platform-icon {
                width: 44px;
                height: 44px;

                display: flex;
                align-items: center;
                justify-content: center;

                border-radius: 10px;

                font-size: 16px;
                font-weight: 700;
            }

            .home-platform-icon.twitch {
                background: #2a1f44;
                color: #a970ff;
            }

            .home-platform-icon.vk {
                background: #1e2a3a;
                color: #5da7ff;
            }

            .home-platform-name {
                font-size: 15px;
                font-weight: 600;
            }

            .home-platform-status {
                margin-top: 5px;
                font-size: 12px;
                color: #f87171;
            }

            .home-auth-button {
                padding: 7px 14px;

                border: none;
                border-radius: 8px;

                color: white;
                font-size: 13px;
                font-weight: 500;

                cursor: pointer;
                text-decoration: none;

                white-space: nowrap;
            }

            .home-auth-button.twitch {
                background: #6d35c7;
            }

            .home-auth-button.twitch:hover {
                background: #7c3aed;
            }

            .home-auth-button.vk {
                background: #277bd6;
            }

            .home-auth-button:disabled {
                opacity: .5;
                cursor: default;
            }

            .home-widgets {
                margin-top: 30px;
            }

            .home-widgets-grid {
                display: grid;
                grid-template-columns:
                    repeat(auto-fill, minmax(240px, 1fr));

                gap: 18px;
            }

            .home-widget-card {
                display: flex;
                flex-direction: column;

                min-height: 155px;

                padding: 18px 20px 20px;

                background: rgba(27, 40, 56, .72);
                border: 1px solid rgba(102, 153, 204, .18);
                border-radius: 14px;

                transition:
                    border-color .2s,
                    transform .1s;
            }

            .home-widget-card:hover {
                border-color: #3a3a5a;
            }

            .home-widget-head {
                display: flex;
                align-items: center;
                justify-content: space-between;

                margin-bottom: 6px;
            }

            .home-widget-name {
                display: flex;
                align-items: center;
                gap: 8px;

                font-size: 16px;
                font-weight: 600;
            }

            .home-widget-status {
                padding: 2px 10px;

                border-radius: 20px;

                font-size: 11px;
                font-weight: 500;

                background: #1e2a2a;
                color: #4ade80;
            }

            .home-widget-status.inactive {
                background: #2a1e1e;
                color: #f87171;
            }

            .home-widget-url {
                margin: 8px 0 14px;

                padding: 5px 10px;

                background: #0A141E;
                border: 1px solid rgba(102, 153, 204, .18);
                border-radius: 6px;

                color: #6a6a86;

                font-family:
                    'SF Mono',
                    'Menlo',
                    monospace;

                font-size: 12px;

                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .home-widget-actions {
                display: flex;
                gap: 8px;

                margin-top: auto;

                flex-wrap: wrap;
            }

            .home-widget-actions button {
                padding: 6px 12px;

                border: 1px solid rgba(102, 153, 204, .25);
                border-radius: 8px;

                background: linear-gradient(
                    180deg,
                    #2a3a4f,
                    #1e2a3a
                );
                color: #cccccc;

                font-size: 12px;
                font-weight: 500;

                cursor: pointer;
            }

            .home-widget-actions button:hover {
                background: linear-gradient(
                    180deg,
                    #3c556e,
                    #263b4f
                );
            }

            .home-widget-actions .configure {
                background: linear-gradient(
                    180deg,
                    #6699cc,
                    #496d95
                );
                color: #e0eff9;
                border: 1px solid rgba(150,190,230,.5);
            }

            .home-widget-actions .configure:hover {
                background: linear-gradient(
                180deg,
                #7aaee0,
                #5b83ad
            );

            border-color: rgba(180, 215, 245, .7);

            box-shadow:
                0 0 0 2px rgba(102, 153, 204, .12),
                0 4px 12px rgba(0, 0, 0, .2);

            }

            @media (max-width: 700px) {

                .home-connections-grid {
                    grid-template-columns: 1fr;
                }

                .home-connection {
                    align-items: flex-start;
                }

                .home-widget-actions {
                    flex-direction: column;
                }

                .home-widget-actions button {
                    width: 100%;
                }
            }
        </style>


        <div class="page-header">
            <div class="page-title">
                🏠 Главная
            </div>

            <div class="page-description">
                Управление StreamOverlay
            </div>
        </div>

        <section class="home-connections">

            <div class="home-section-title">
                Подключения
            </div>

            <div class="home-connections-grid">

                <!-- Twitch -->

                <div class="home-connection">

                    <div class="home-platform">

                        <div class="home-platform-icon twitch">
                            T
                        </div>

                        <div>

                            <div class="home-platform-name">
                                Twitch
                            </div>

                            <div class="home-platform-status">
                                ● Требуется авторизация
                            </div>

                        </div>

                    </div>

                    <a
                        href="/auth/twitch/login"
                        class="home-auth-button twitch"
                    >
                        Авторизовать
                    </a>

                </div>


                <!-- VK -->

                <div class="home-connection">

                    <div class="home-platform">

                        <div class="home-platform-icon vk">
                            VK
                        </div>

                        <div>

                            <div class="home-platform-name">
                                VK Live
                            </div>

                            <div class="home-platform-status">
                                ● Требуется авторизация
                            </div>

                        </div>

                    </div>

                    <button
                        class="home-auth-button vk"
                        disabled
                    >
                        Скоро
                    </button>

                </div>

            </div>

        </section>

        <section class="home-widgets">

            <div class="home-section-title">
                Мои виджеты
            </div>


            <div class="home-widgets-grid">


                <!-- Чат -->

                <div class="home-widget-card">

                    <div class="home-widget-head">

                        <div class="home-widget-name">
                            💬 Чат
                        </div>

                    </div>

                    <div class="home-widget-url">
                        /chat
                    </div>

                    <div class="home-widget-actions">

                        <button
                            class="configure"
                            data-widget="chat"
                        >
                            Настроить
                        </button>

                        <button
                            data-copy-url="/chat"
                        >
                            Копировать ссылку
                        </button>

                        <button
                            data-open-url="/chat"
                        >
                            Открыть
                        </button>

                    </div>

                </div>

                <div class="home-widget-card">

                    <div class="home-widget-head">

                        <div class="home-widget-name">
                            🔢 Счётчик зрителей
                        </div>


                    </div>

                    <div class="home-widget-url">
                        /viewers
                    </div>

                    <div class="home-widget-actions">

                        <button
                            class="configure"
                            data-widget="viewers"
                        >
                            Настроить
                        </button>

                        <button
                            data-copy-url="/viewers"
                        >
                            Копировать ссылку
                        </button>

                        <button
                            data-open-url="/viewers"
                        >
                            Открыть
                        </button>

                    </div>

                </div>

                <div class="home-widget-card">

                    <div class="home-widget-head">

                        <div class="home-widget-name">
                            🎮 Игровой мир
                        </div>

                    </div>

                    <div class="home-widget-url">
                        /overlay
                    </div>

                    <div class="home-widget-actions">

                        <button
                            class="configure"
                            data-widget="gameworld"
                        >
                            Настроить
                        </button>

                        <button
                            data-copy-url="/overlay"
                        >
                            Копировать ссылку
                        </button>

                        <button
                            data-open-url="/overlay"
                        >
                            Открыть
                        </button>

                    </div>

                </div>


                <div class="home-widget-card">

                    <div class="home-widget-head">

                        <div class="home-widget-name">
                            ⚔️ Дуэль
                        </div>

                    </div>

                    <div class="home-widget-url">
                        /dueldisplay
                    </div>

                    <div class="home-widget-actions">

                        <button
                            class="configure"
                            data-widget="dueldisplay"
                        >
                            Настроить
                        </button>

                        <button
                            data-copy-url="/dueldisplay"
                        >
                            Копировать ссылку
                        </button>

                        <button
                            data-open-url="/dueldisplay"
                        >
                            Открыть
                        </button>

                    </div>

                </div>

                <div class="home-widget-card">

                    <div class="home-widget-head">

                        <div class="home-widget-name">
                            🖥️ Демо-сцена
                        </div>

                    </div>

                    <div class="home-widget-url">
                        /demo
                    </div>

                    <div class="home-widget-actions">


                        <button
                            data-copy-url="/demo"
                        >
                            Копировать ссылку
                        </button>

                        <button
                            data-open-url="/demo"
                        >
                            Открыть
                        </button>

                    </div>

                </div>


            </div>


        </section>

        <section class="home-widgets">

            <div class="home-section-title">
               Док-панели
            </div>


            <div class="home-widgets-grid">


                <!-- Чат -->

                <div class="home-widget-card">

                    <div class="home-widget-head">

                        <div class="home-widget-name">
                            👥 Чаттерсы
                        </div>

                    </div>

                    <div class="home-widget-url">
                        /chatters
                    </div>

                    <div class="home-widget-actions">

                        <button
                            class="configure"
                            data-widget="chatters"
                        >
                            Настроить
                        </button>

                        <button
                            data-copy-url="/chatters"
                        >
                            Копировать ссылку
                        </button>

                        <button
                            data-open-url="/chatters"
                        >
                            Открыть
                        </button>

                    </div>

                </div>
        </section>
    `;


    app.querySelectorAll('[data-copy-url]')
        .forEach(button => {

            button.addEventListener('click', async () => {

                const path =
                    button.dataset.copyUrl;

                const url =
                    `${window.location.origin}${path}`;

                await navigator.clipboard.writeText(url);
            });

        });


    app.querySelectorAll('[data-open-url]')
        .forEach(button => {

            button.addEventListener('click', () => {

                const path =
                    button.dataset.openUrl;

                const url =
                    `${window.location.origin}${path}`;

                window.open(url, '_blank');
            });

        });


    app.querySelectorAll('[data-widget]')
        .forEach(button => {

            button.addEventListener('click', () => {

                const widget =
                    button.dataset.widget;

                navigate(widget);
            });

        });
}