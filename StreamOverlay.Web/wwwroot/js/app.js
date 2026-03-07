(() => {
    const chatEl = document.getElementById("chat");
    const channelNameEl = document.getElementById("channelName");
    const viewerCountEl = document.getElementById("viewerCount");
    const liveStatusEl = document.getElementById("liveStatus");
    // Установка SignalR соединение
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/chat")
        .withAutomaticReconnect() // Авто-переподключение при сбоях сети
        .build();
  
    connection.on("channelInfo", (payload) => {
        const name = payload?.displayName || payload?.login || "—";
        channelNameEl.textContent = name;
    });
    
    connection.on("viewerCount", (payload) => {
        viewerCountEl.textContent = String(payload?.count ?? 0);
        liveStatusEl.textContent = payload?.isLive ? "LIVE" : "OFFLINE";

        liveStatusEl.style.color = payload?.isLive ? "#00ffad" : "#ef4444";
    });
    
    connection.on("chatMessage", (payload) => {
        const line = document.createElement("div");
        line.className = "chat-line";
        
        const u = document.createElement("span");
        u.className = "user";
        u.textContent = payload.user || "Anonym";

        if (payload.color) {
            u.style.color = payload.color;
        }
       
        const sep = document.createTextNode(": ");
       
        const m = document.createElement("span");
        m.className = "msg";
        m.textContent = payload.message || "";
       
        line.appendChild(u);
        line.appendChild(sep);
        line.appendChild(m);
      
        chatEl.appendChild(line);
      
        const maxLines = 80;
        while (chatEl.children.length > maxLines) {
            chatEl.removeChild(chatEl.firstChild);
        }
       
        chatEl.scrollTo({
            top: chatEl.scrollHeight,
            behavior: 'smooth'
        });
    });
  
    async function start() {
        try {
            await connection.start();
            console.log("SignalR connected");
            
            if (liveStatusEl.textContent === "—") {
                liveStatusEl.textContent = "CONNECTED";
            }
        } catch (e) {
            console.error("SignalR connection error:", e);
            liveStatusEl.textContent = "RECONNECTING";
            setTimeout(start, 5000); 
        }
    }
    
    connection.onreconnecting(() => {
        liveStatusEl.textContent = "RECONNECTING";
        liveStatusEl.style.color = "#fbbf24"; // Желтый
    });
    connection.onreconnected(() => {
        liveStatusEl.textContent = "CONNECTED";
        liveStatusEl.style.color = "#00ffad"; // Зеленый
    });
    start();
})();