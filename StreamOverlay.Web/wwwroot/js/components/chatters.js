export class Chatters {

    constructor(elementId) {
        this.container = document.getElementById(elementId);

        this.viewers = new Map();
    }


    addViewer(viewer) {

        if (!viewer || !viewer.userId) {
            return;
        }

        // Пользователь уникален внутри платформы
        const id =
            `${viewer.platform}:${viewer.userId}`.toLowerCase();

        if (this.viewers.has(id)) {
            return;
        }

        const data = {
            id,
            userId: viewer.userId,
            login: viewer.login,
            displayName: viewer.displayName || viewer.login,
            platform: viewer.platform,
            detectedAt: new Date(viewer.detectedAt).getTime()
        };

        this.viewers.set(id, data);

        this.render();
        this.updateCount();
    }


    removeViewer(viewer) {

        if (!viewer || !viewer.userId) {
            return;
        }

        const id =
            `${viewer.platform}:${viewer.userId}`.toLowerCase();

        if (!this.viewers.has(id)) {
            return;
        }

        this.viewers.delete(id);

        this.render();
        this.updateCount();
    }


    render() {

        const viewers =
            Array.from(this.viewers.values())
                .sort((a, b) =>
                    b.detectedAt - a.detectedAt
                );


        this.container.innerHTML = "";


        if (viewers.length === 0) {

            this.container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        👀
                    </div>

                    <div class="empty-text">
                        Пока никто не смотрит
                    </div>
                </div>
            `;

            this.updateCount();

            return;
        }


        for (const viewer of viewers) {

            const element =
                document.createElement("div");

            element.className = "viewer";

            const platformClass =
                viewer.platform === "vk"
                    ? "vk"
                    : "twitch";


            element.innerHTML = `
                <div class="platform-dot ${platformClass}"></div>

                <div class="viewer-name">
                    ${this.escapeHtml(viewer.displayName)}
                </div>

                <div class="viewer-time">
                    ${this.formatTime(viewer.detectedAt)}
                </div>
            `;

            this.container.appendChild(element);
        }

        this.updateCount();
    }


    updateCount() {

        const counter =
            document.getElementById("viewerCount");

        if (!counter) {
            return;
        }

        counter.textContent =
            this.viewers.size;
    }


    updateTimes() {

        const viewers =
            Array.from(this.viewers.values())
                .sort((a, b) =>
                    b.detectedAt - a.detectedAt
                );


        this.container
            .querySelectorAll(".viewer")
            .forEach((element, index) => {

                const viewer =
                    viewers[index];

                if (!viewer) {
                    return;
                }

                const time =
                    element.querySelector(".viewer-time");

                if (time) {

                    time.textContent =
                        this.formatTime(
                            viewer.detectedAt
                        );
                }
            });
    }


    formatTime(timestamp) {

        if (!timestamp) {
            return "сейчас";
        }

        const seconds =
            Math.floor(
                (Date.now() - timestamp) / 1000
            );

        if (seconds < 10) {
            return "сейчас";
        }

        if (seconds < 60) {
            return `${seconds}с`;
        }

        const minutes =
            Math.floor(seconds / 60);

        if (minutes < 60) {
            return `${minutes}м`;
        }

        const hours =
            Math.floor(minutes / 60);

        return `${hours}ч`;
    }


    escapeHtml(value) {

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}