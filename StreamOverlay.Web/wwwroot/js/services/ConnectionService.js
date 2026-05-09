export class ConnectionService {
    constructor(url = "/chat-hub") {
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(url)
            .withAutomaticReconnect()
            .build();

        this.status = "CONNECTING";

        // Коллбеки для событий (подписчики)
        this.onChannelInfoCallback = null;
        this.onViewerCountCallback = null;
        this.onChatMessageCallback = null;
        this.onStatusChangeCallback = null;
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

    // Отправка результата дуэли на сервер
    async sendDuelResult(winner, loser) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try {
                await this.connection.invoke("ReceiveDuelResult", winner, loser);
                console.log(`Результат дуэли: ${winner} vs ${loser} отправлен на сервер!`);
            } catch (err) {
                console.error("Ошибка отправки результата дуэли на сервер:", err);
            }
        } else {
            console.warn("SignalR не подключен, невозможно отправить результат дуэли на сервер");
        }
    }
}