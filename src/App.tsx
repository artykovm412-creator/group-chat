
import { useRef, useState, type FormEvent } from "react";
import "./App.css";

import {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
} from "./api";

import {
  connectChat,
  sendChatMessage,
  type ChatMessage,
} from "./socket";

type AuthMode = "login" | "register";

function App() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Не подключено");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const manualCloseRef = useRef(false);
  const refreshingRef = useRef(false);

  async function recoverSession() {
    if (refreshingRef.current || manualCloseRef.current) return;

    refreshingRef.current = true;
    setStatus("Обновление сессии...");

    try {
      const result = await refreshAccessToken();

      if (!result.access) {
        throw new Error("Сервер не вернул новый Access Token");
      }

      await connectToChat(result.access);
    } catch {
      setIsLoggedIn(false);
      setStatus("Отключено");
      setError("Сессия завершилась. Войдите в аккаунт снова.");
    } finally {
      refreshingRef.current = false;
    }
  }

  function connectToChat(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let authenticated = false;
      let settled = false;
      let socket: WebSocket;

      const timeout = window.setTimeout(() => {
        if (!authenticated) {
          socket.close();
          if (!settled) {
            settled = true;
            reject(new Error("Сервер не подтвердил авторизацию за 10 секунд"));
          }
        }
      }, 10000);

      socket = connectChat(
        token,

        (serverUsername) => {
          authenticated = true;
          window.clearTimeout(timeout);

          setUsername(serverUsername);
          setIsLoggedIn(true);
          setStatus("Подключено");
          setError("");
          setNotice("Вы успешно вошли в чат!");

          if (!settled) {
            settled = true;
            resolve();
          }
        },

        (newMessage) => {
          setMessages((previous) => [...previous, newMessage]);
        },

        (errorMessage) => {
          setError(errorMessage);

          if (!authenticated) {
            window.clearTimeout(timeout);
            socket.close();

            if (!settled) {
              settled = true;
              reject(new Error(errorMessage));
            }
          }
        },

        () => {
          window.clearTimeout(timeout);

          if (manualCloseRef.current) return;

          if (authenticated) {
            setStatus("Соединение потеряно. Обновление...");
            void recoverSession();
          } else if (!settled) {
            settled = true;
            reject(new Error("WebSocket закрыл соединение до авторизации"));
          }
        }
      );

      socketRef.current = socket;
      setStatus("Подключение...");
    });
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setNotice("");
    setBusy(true);
    manualCloseRef.current = false;

    try {
      if (mode === "register") {
        await registerUser(username.trim(), password);

        setMode("login");
        setPassword("");
        setNotice("Регистрация успешна! Теперь войдите в аккаунт.");
      } else {
        const result = await loginUser(username.trim(), password);

        if (!result.access) {
          throw new Error("Сервер не вернул Access Token");
        }

        await connectToChat(result.access);
        setPassword("");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось выполнить запрос"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError("");
    setNotice("");

    manualCloseRef.current = true;

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setIsLoggedIn(false);
    setMessages([]);
    setMessage("");
    setPassword("");
    setStatus("Не подключено");

    try {
      await logoutUser();
      setNotice("Вы успешно вышли из аккаунта.");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Вы отключены от чата, но серверный logout не подтвердился: ${err.message}`
          : "Не удалось подтвердить выход на сервере."
      );
    } finally {
      manualCloseRef.current = false;
      setBusy(false);
    }
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!message.trim()) return;

    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Нет подключения к чату. Войдите снова.");
      return;
    }

    const sent = sendChatMessage(socket, message.trim());

    if (sent) {
      setMessage("");
      setError("");
    } else {
      setError("Не удалось отправить сообщение.");
    }
  }

  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (!isLoggedIn) {
    return (
      <main className="auth-page">
        <div className="auth-decoration decoration-one" />
        <div className="auth-decoration decoration-two" />

        <section className="auth-card">
          <div className="brand">
            <div className="brand-icon">✦</div>
            <span>
              GROUP<span className="brand-accent">CHAT</span>
            </span>
          </div>

          <div className="auth-heading">
            <span className="eyebrow">YOUR SPACE TO CONNECT</span>

            <h1>
              {mode === "login"
                ? "С возвращением!"
                : "Создать аккаунт"}
            </h1>

            <p>
              {mode === "login"
                ? "Войдите в аккаунт, чтобы общаться с другими участниками."
                : "Зарегистрируйтесь и присоединяйтесь к общению."}
            </p>
          </div>

          {notice && <div className="notice success">{notice}</div>}
          {error && <div className="notice error">{error}</div>}

          <form className="auth-form" onSubmit={handleAuth}>
            <label>Имя пользователя</label>

            <input
              type="text"
              autoComplete="username"
              placeholder="Введите username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            <label>Пароль</label>

            <input
              type="password"
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button
              className="primary-button"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Подождите..."
                : mode === "login"
                  ? "Войти в аккаунт"
                  : "Зарегистрироваться"}

              <span>→</span>
            </button>
          </form>

          <div className="auth-switch">
            {mode === "login"
              ? "Ещё нет аккаунта?"
              : "Уже есть аккаунт?"}

            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setNotice("");
              }}
            >
              {mode === "login" ? "Создать аккаунт" : "Войти"}
            </button>
          </div>

          <div className="auth-footer">
            <span>●</span> GROUPCHAT COMMUNITY
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="chat-page">
      <aside className="sidebar">
        <div className="brand sidebar-brand">
          <div className="brand-icon">✦</div>
          <span>
            GROUP<span className="brand-accent">CHAT</span>
          </span>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <div className="workspace-item active">
          <span className="channel-icon">#</span>
          Общий чат
          <span className="online-dot" />
        </div>

        <div className="sidebar-label members-label">
          COMMUNITY
        </div>

        <div className="member">
          <div className="avatar green">
            {username.charAt(0).toUpperCase()}
          </div>
          <span>{username}</span>
          <i />
        </div>

        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar green">
              {username.charAt(0).toUpperCase()}
            </div>

            <div className="profile-info">
              <strong>{username}</strong>
              <span>Авторизованный пользователь</span>
            </div>

            <button
              className="logout-button"
              onClick={handleLogout}
              disabled={busy}
              title="Выйти"
            >
              ↪
            </button>
          </div>
        </div>
      </aside>

      <section className="chat-content">
        <header className="chat-header">
          <div>
            <div className="chat-title">
              <span>#</span> Общий чат
            </div>
            <p>Групповое общение в реальном времени</p>
          </div>

          <div className="header-status">
            <span
              className="online-dot"
              style={{
                background:
                  status === "Подключено" ? "#43d69a" : "#e4a34c",
              }}
            />
            {status}
          </div>
        </header>

        <div className="messages-area">
          <div className="welcome-block">
            <div className="welcome-icon">✦</div>

            <h2>Добро пожаловать в общий чат!</h2>

            <p>
              Вы подключены как {username}. Начните общение!
            </p>

            <span>GROUPCHAT COMMUNITY</span>
          </div>

          {messages.length === 0 && (
            <div className="empty-chat">
              Пока сообщений нет. Напишите первым!
            </div>
          )}

          {messages.map((item, index) => (
            <div
              className={`message-row ${
                item.sender === username ? "my-message" : ""
              }`}
              key={`${item.timestamp}-${index}`}
            >
              <div className="avatar message-avatar">
                {item.sender.charAt(0).toUpperCase()}
              </div>

              <div className="message-body">
                <div className="message-meta">
                  <strong>{item.sender}</strong>
                  <span>{formatTime(item.timestamp)}</span>
                </div>

                <div className="message-text">
                  {item.text}
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="chat-error">{error}</div>}

        <form className="message-form" onSubmit={handleSend}>
          <input
            type="text"
            placeholder="Напишите сообщение..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <button
            type="submit"
            disabled={!message.trim() || status !== "Подключено"}
          >
            ➤
          </button>
        </form>

        <div className="chat-hint">
          Сообщения доступны только авторизованным пользователям
        </div>
      </section>
    </main>
  );
}

export default App;
