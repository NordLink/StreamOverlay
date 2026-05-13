export class ConnectionService {
    constructor(url = "/chat-hub") {
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(url)
            .withAutomaticReconnect()
            .build();

        this.status = "CONNECTING";

        // Коллбеки для событий
        this.onChannelInfoCallback = null;
        this.onViewerCountCallback = null;
        this.onChatMessageCallback = null;
        this.onStatusChangeCallback = null;
        this.onLeaderboardUpdateCallback = null;
        this.onPlayerStatsCallback = null;
        this._setupListeners();
    }

    _setupListeners() {
        this.connection.on("channelInfo", (payload) => {
            if (this.onChannelInfoCallback) this.onChannelInfoCallback(payload);
        });
        this.connection.on("viewerCount", (payload) => {
            if (this.onViewerCountCallback) this.onViewerCountCallback(payload);
        });
        this.connection.on("chatMessage", (payload) => {
            if (this.onChatMessageCallback) this.onChatMessageCallback(payload);
        });

        this.connection.on("leaderboardUpdate", (data) => {
            if (this.onLeaderboardUpdateCallback) {
                this.onLeaderboardUpdateCallback(data);
            }
        });

        this.connection.on("playerStats", (callerKey, playerKey, stats) => {
            if (this.onPlayerStatsCallback) this.onPlayerStatsCallback(callerKey, playerKey, stats);
        });

        this.connection.onreconnecting(() => this._setStatus("RECONNECTING"));
        this.connection.onreconnected(() => this._setStatus("CONNECTED"));
        this.connection.onclose(() => this._setStatus("DISCONNECTED"));
    }

    _setStatus(newStatus) {
        this.status = newStatus;
        if (this.onStatusChangeCallback) this.onStatusChangeCallback(this.status);
    }

    async start() {
        try {
            await this.connection.start();
            this._setStatus("CONNECTED");
        } catch (e) {
            this._setStatus("RECONNECTING");
            setTimeout(() => this.start(), 5000);
        }
    }

    async requestLeaderboard() {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try {
                await this.connection.invoke("RequestLeaderboard");
            } catch (err) {
                console.error("Ошибка вызова RequestLeaderboard:", err);
            }
        } else {
            console.warn("SignalR не подключен, невозможно запросить лидерборд");
        }
    }

    async sendDuelResult(
        winnerKey,
        winnerDisplayName,
        winnerColor,
        loserKey,
        loserDisplayName,
        loserColor,
        timestamp
    ) {
        await this.connection.invoke(
            "ReceiveDuelResult",
            winnerKey,
            winnerDisplayName,
            winnerColor,
            loserKey,
            loserDisplayName,
            loserColor,
            timestamp);
    }

    async requestPlayerStats(callerKey, playerKey) {
        console.log(`Запрос статы для: ${callerKey} vs ${playerKey} отправлен`)
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try {
                await this.connection.invoke("RequestPlayerStats", callerKey, playerKey);
            } catch (err) {
                console.error("Ошибка вызова RequestPlayerStats:", err);
            }
        } else {
            console.warn("SignalR не подключен, невозможно запросить статистику");
        }
    }
}