import { renderHomePagePreview } from '../previews/homePreviews.js';
import { renderChatPreview } from '../previews/chatPreviews.js';
import { renderViewersPreview } from '../previews/viewersPreviews.js';
import { renderChattersPreview } from '../previews/chattersPreviews.js';
import { renderGameworldPreview } from '../previews/gameworldPreviews.js';
import { renderDuelPreview } from '../previews/duelPreviews.js';
import { renderSettingsPreview } from '../previews/settingsPreviews.js';

const routes = {
    home: renderHomePagePreview,
    chat: renderChatPreview,
    viewers: renderViewersPreview,
    chatters: renderChattersPreview,
    gameworld: renderGameworldPreview,
    dueldisplay: renderDuelPreview,
    settings: renderSettingsPreview
};

const app = document.getElementById('app');
const navigation = document.querySelectorAll('.nav-button');

export async function navigate(pageName) {
    const renderPage = routes[pageName];

    if (!renderPage) {
        return;
    }

    navigation.forEach(button => {
        button.classList.toggle(
            'active',
            button.dataset.page === pageName
        );
    });

    history.replaceState(
        null,
        '',
        '#' + pageName
    );

    app.innerHTML = '';

    await renderPage(app);
}

navigation.forEach(button => {

    button.addEventListener('click', () => {
        navigate(button.dataset.page);
    });

});

const initialPage =
    location.hash.replace('#', '') || 'home';

navigate(
    routes[initialPage]
        ? initialPage
        : 'home'
);