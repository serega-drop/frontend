import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import { Modal } from "../../components/Modal";
import { useGame } from "../../app/context";
export function Login({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const service = useGame();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await service.login(String(f.get("username")), String(f.get("password")));
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Вход" onClose={onClose} busy={busy}>
      <p className="muted">Введи логин и пароль аккаунта.</p>
      <form onSubmit={submit} className="form-stack">
        <label>
          Логин
          <input
            autoFocus
            name="username"
            autoComplete="username"
            required
            aria-describedby="login-error"
          />
        </label>
        <label>
          Пароль
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby="login-error"
          />
        </label>
        <p className="error" role="alert" id="login-error">
          {error}
        </p>
        <button className="primary" disabled={busy}>
          <LogIn size={18} /> {busy ? "Входим…" : "Войти"}
        </button>
      </form>
      {service.mode === "demo" && <div className="demo-note">
        Демо-аккаунт: <strong>player / player</strong>
        <br />
        Новые аккаунты создаёт администратор.
      </div>}
    </Modal>
  );
}
