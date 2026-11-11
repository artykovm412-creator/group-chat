
export type ChatMessage = {
  sender: string;
  text: string;
  timestamp: number;
};

type ServerEvent = {
  type: string;
  payload?: Record<string, unknown>;
};

const WS_URL = "wss://inai-col3.fishrungames.com/chat/";

export function connectChat(
  token: string,
  onAuthSuccess: (username: string) => void,
  onNewMessage: (message: ChatMessage) => void,
  onError: (message: string) => void,
  onClose: () => void
): WebSocket {
  const socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    socket.send(
      JSON.stringify({
        type: "AUTH",
        payload: { token },
      })
    );
  };

  socket.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as ServerEvent;
      const payload = data.payload ?? {};

      if (data.type === "AUTH_SUCCESS") {
        if (typeof payload.username === "string") {
          onAuthSuccess(payload.username);
        }
      }

      if (data.type === "NEW_MESSAGE") {
        if (
          typeof payload.sender === "string" &&
          typeof payload.text === "string" &&
          typeof payload.timestamp === "number"
        ) {
          onNewMessage({
            sender: payload.sender,
            text: payload.text,
            timestamp: payload.timestamp,
          });
        }
      }

      if (data.type === "ERROR") {
        onError(
          typeof payload.detail === "string"
            ? payload.detail
            : "Ошибка сервера"
        );
      }
    } catch {
      onError("Ошибка обработки сообщения сервера");
    }
  };

  socket.onerror = () => {
    onError("Не удалось подключиться к WebSocket");
  };

  socket.onclose = () => {
    onClose();
  };

  return socket;
}

export function sendChatMessage(
  socket: WebSocket,
  text: string
): boolean {
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  socket.send(
    JSON.stringify({
      type: "CHAT_MESSAGE",
      payload: { text },
    })
  );

  return true;
}
