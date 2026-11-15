import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import { Modal } from "../../components/Modal";
import { useDemo } from "../../app/context";
export function Login({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const service = useDemo();
  const [error, setError] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      service.login(String(f.get("username")), String(f.get("password")));
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title="Вход" onClose={onClose}>
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
        <button className="primary">
          <LogIn size={18} /> Войти
        </button>
      </form>
      <div className="demo-note">
        Демо-аккаунт: <strong>player / player</strong>
        <br />
        Новые аккаунты создаёт администратор.
      </div>
    </Modal>
  );
}
