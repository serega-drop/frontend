import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, LogOut, Plus, Search, Shield, Trash2 } from "lucide-react";
import { useGame } from "../../app/context";
import type { InventoryItem } from "../../api/types";
import type { AccountView } from "../../api/client";
import { DangerZone, PromosPanel, RequestsPanel, StatisticsPanel } from "./AdminTools";
import { LoadingStatus } from "../../components/LoadingStatus";
import { Modal } from "../../components/Modal";
import { Price } from "../../components/Price";
import { SkinCard } from "../../components/SkinCard";
import { CatalogPicker } from "../../components/CatalogPicker";
const tabs = [
  ["players", "Игроки"], ["requests", "Заявки"], ["promos", "Промокоды"],
  ["statistics", "Статистика"], ["settings", "Опасная зона"],
] as const;

export function Admin() {
  const service = useGame();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [create, setCreate] = useState(false);
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("players");
  const [busy, setBusy] = useState(false);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await service.adminLogin(String(new FormData(e.currentTarget).get("password")));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!service.isAdmin())
    return (
      <section className="admin-login">
        <Shield size={36} className="orange" />
        <h1>Панель управления</h1>
        <p className="muted">Отдельный доступ администратора</p>
        <form className="form-stack" onSubmit={login}>
          <label>
            Пароль администратора
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-describedby="admin-error"
            />
          </label>
          <p className="error" role="alert" id="admin-error">
            {error}
          </p>
          <button className="primary" disabled={busy}>{busy ? "Входим…" : "Войти в админку"}</button>
        </form>
        {service.mode === "demo" && <p className="demo-note">Пароль локальной демо-версии: <strong>admin</strong></p>}
        <a className="text-button" href="/">
          ← На сайт
        </a>
      </section>
    );
  const accounts = service.accounts();
  const account = accounts.find((a) => a.id === selected);
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SEREGA CONTROL</span>
          <h1>Управление игроками</h1>
        </div>
        <button className="secondary" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try { await service.adminLogout(); }
          catch (reason) { setError((reason as Error).message); }
          finally { setBusy(false); }
        }}>
          <LogOut size={16} /> {busy ? "Выходим…" : "Выйти"}
        </button>
      </div>
      {service.mode === "demo" && <p className="notice">Локальная админка. Изменения сохранены в этом браузере.</p>}
      <nav className="toolbar admin-nav" aria-label="Разделы панели управления">
        {tabs.map(([id, label]) => (
          <button className={tab === id ? "primary" : "secondary"} aria-pressed={tab === id}
            key={id} onClick={() => { setError(""); setTab(id); }}>{label}</button>
        ))}
      </nav>
      {error && !create && <p className="error" role="alert">{error}</p>}
      {tab === "requests" && <RequestsPanel />}
      {tab === "promos" && <PromosPanel />}
      {tab === "statistics" && <StatisticsPanel />}
      {tab === "settings" && <DangerZone />}
      {tab === "players" && <div className="admin-layout">
        <aside className="admin-sidebar">
          <button
            className="primary"
            onClick={() => {
              setError("");
              setCreate(true);
            }}
          >
            <Plus size={17} /> Создать игрока
          </button>
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Поиск игроков"
              placeholder="Имя или логин"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {accounts
            .filter((a) =>
              `${a.name} ${a.username}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((a) => (
              <button
                key={a.id}
                className={`account-row ${a.id === selected ? "selected" : ""}`}
                onClick={() => setSelected(a.id)}
              >
                <span className="avatar">{a.name[0]}</span>
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    @{a.username} {!a.active && "· заблокирован"}
                  </small>
                </span>
                <Price value={a.balance_minor} />
              </button>
            ))}
        </aside>
        <div>
          {account ? (
            <AccountDetails key={account.id} account={account} />
          ) : (
            <div className="empty-state">
              <Shield size={36} />
              <h2>Выбери игрока</h2>
              <p className="muted">
                Профиль, баланс, предметы и история пополнений.
              </p>
            </div>
          )}
        </div>
      </div>}
      {create && (
        <Modal title="Создать игрока" busy={busy} onClose={() => setCreate(false)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const f = new FormData(e.currentTarget);
              setBusy(true); setError("");
              try {
                const id = await service.createAccount(
                  String(f.get("username")),
                  String(f.get("name")),
                  String(f.get("password")),
                );
                setSelected(id);
                setCreate(false);
              } catch (e) {
                setError((e as Error).message);
              } finally { setBusy(false); }
            }}
          >
            <label>
              Логин
              <input
                name="username"
                required
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9_]+"
                aria-describedby="create-error"
              />
            </label>
            <label>
              Отображаемое имя
              <input name="name" required maxLength={80} />
            </label>
            <label>
              Пароль
              <input
                name="password"
                type="password"
                required
                minLength={4}
                autoComplete="new-password"
              />
            </label>
            <p className="hint">Начальный баланс — 0 G</p>
            <p className="error" role="alert" id="create-error">
              {error}
            </p>
            <button className="primary" disabled={busy}>{busy ? "Создаём…" : "Создать игрока"}</button>
          </form>
        </Modal>
      )}
      <a className="text-button" href="/">
        <ArrowLeft size={16} /> На сайт
      </a>
    </section>
  );
}
function AccountDetails({ account }: { account: AccountView }) {
  const service = useGame();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const id = account.id;
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => service.loadAccount(id)).then(
      () => { if (active) setLoaded(true); },
      (reason: Error) => { if (active) setError(reason.message); },
    );
    return () => { active = false; };
  }, [service, id, revision]);
  if (error) return (
    <div role="alert"><p className="error">{error}</p><button className="secondary" onClick={() => {
      setError(""); setRevision((value) => value + 1);
    }}>Повторить</button></div>
  );
  return loaded ? <AccountEditor account={account} /> : <LoadingStatus>Загружаем профиль…</LoadingStatus>;
}

function AccountEditor({ account: a }: { account: AccountView }) {
  const service = useGame();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [grant, setGrant] = useState(false);
  const [revoke, setRevoke] = useState<InventoryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function perform(fn: () => void | Promise<void>, success = "Изменения сохранены") {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    setError(""); setNotice("");
    try {
      await fn();
      setNotice(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally { lock.current = false; setBusy(false); }
  }
  return (
    <div className="account-editor">
      <h2>
        {a.name} <span className="muted">@{a.username}</span>
      </h2>
      {busy && !grant && !revoke && <LoadingStatus>Сохраняем изменения…</LoadingStatus>}
      <div className="admin-forms">
        <form
          className="form-stack panel"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            perform(() =>
              service.editAccount(a.id, {
                name: String(f.get("name")),
                username: String(f.get("username")),
                active: f.get("active") === "on",
              }),
            );
          }}
        >
          <h3>Профиль</h3>
          <label>
            Имя
            <input key={a.name} name="name" defaultValue={a.name} required />
          </label>
          <label>
            Логин
            <input
              key={a.username}
              name="username"
              defaultValue={a.username}
              required
            />
          </label>
          <label className="checkbox-label">
            <input
              key={String(a.active)}
              type="checkbox"
              name="active"
              defaultChecked={a.active}
            />{" "}
            Вход разрешён
          </label>
          <button className="secondary" disabled={busy}>Сохранить профиль</button>
        </form>
        <div className="panel form-stack">
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const p = String(new FormData(form).get("password"));
              perform(async () => {
                await service.editAccount(a.id, {
                  name: a.name,
                  username: a.username,
                  active: a.active,
                  password: p,
                });
                form.reset();
              });
            }}
          >
            <h3>Сменить пароль</h3>
            <label>
              Новый пароль
              <input
                name="password"
                type="password"
                minLength={4}
                required
                autoComplete="new-password"
              />
            </label>
            <button className="secondary" disabled={busy}>Изменить пароль</button>
          </form>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              perform(() =>
                service.setBalance(
                  a.id,
                  Math.round(
                    Number(new FormData(e.currentTarget).get("balance")) * 100,
                  ),
                ),
              );
            }}
          >
            <h3>
              Баланс <Price value={a.balance_minor} />
            </h3>
            <label>
              Новая сумма, G
              <input
                key={a.balance_minor}
                name="balance"
                type="number"
                min="0"
                step="0.01"
                defaultValue={a.balance_minor / 100}
                required
              />
            </label>
            <button className="secondary" disabled={busy}>Установить баланс</button>
          </form>
        </div>
      </div>
      <form className="toolbar panel" onSubmit={(event) => {
        event.preventDefault();
        const chance = Number(new FormData(event.currentTarget).get("chance"));
        void perform(() => service.boost(a.id, chance), "Усиление поставлено");
      }}>
        <label>Шанс при усилении, %
          <input type="number" name="chance" min="0" max="100" step="0.01" required />
        </label>
        <button className="secondary" disabled={busy}>Boost chances</button>
        <span className="muted">{a.boost_pending ? "Усиление ожидает использования" : "Нет ожидающего усиления"}</span>
      </form>
      {!grant && !revoke && <p className="error" role="alert">{error}</p>}
      <p className="green" role="status">
        {notice}
      </p>
      <div className="section-heading">
        <h3>Инвентарь · {a.inventory.length}</h3>
        <button className="secondary" onClick={() => setGrant(true)}>
          <Plus size={16} /> Выдать скин
        </button>
      </div>
      <div className="skin-grid admin-inventory">
        {a.inventory.map((i) => (
          <SkinCard key={i.id} skin={service.skin(i.skin_id)}>
            <button
              className="sell-button"
              onClick={() => {
                setError("");
                setRevoke(i);
              }}
            >
              <Trash2 size={15} /> Изъять
            </button>
          </SkinCard>
        ))}
      </div>
      {!a.inventory.length && <p className="empty-small">Предметов пока нет</p>}
      <StatisticsPanel accountId={a.id} />
      <RequestsPanel accountId={a.id} />
      {grant && (
        <Modal title="Выдать предмет" busy={busy} onClose={() => setGrant(false)}>
          {error && <p className="error" role="alert">{error}</p>}
          {busy && <LoadingStatus>Выдаём предмет…</LoadingStatus>}
          <fieldset className="request-fields" disabled={busy}>
            <CatalogPicker
              onSelect={async (s) => {
                if (await perform(() => service.grant(a.id, s.id))) setGrant(false);
              }}
            />
          </fieldset>
        </Modal>
      )}
      {revoke && (
        <Modal title="Изъять экземпляр?" busy={busy} onClose={() => setRevoke(null)}>
          {error && <p className="error" role="alert">{error}</p>}
          <p>
            {service.skin(revoke.skin_id).weapon} {service.skin(revoke.skin_id).name}
          </p>
          <p className="muted">ID: {revoke.id}</p>
          <button
            className="primary"
            disabled={busy} onClick={async () => {
              if (await perform(() => service.revoke(a.id, revoke.id))) setRevoke(null);
            }}
          >
            {busy ? "Изъятие предмета…" : "Изъять предмет"}
          </button>
        </Modal>
      )}
    </div>
  );
}
