import { useState, type FormEvent } from "react";
import { ArrowLeft, LogOut, Plus, Search, Shield, Trash2 } from "lucide-react";
import { useDemo } from "../../app/context";
import { getSkin } from "../../api/catalog";
import type { Account, InventoryItem } from "../../api/types";
import { money } from "../../api/economy";
import { Modal } from "../../components/Modal";
import { Price } from "../../components/Price";
import { SkinCard } from "../../components/SkinCard";
import { CatalogPicker } from "../../components/CatalogPicker";
export function Admin() {
  const service = useDemo();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [create, setCreate] = useState(false);
  function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      service.adminLogin(String(new FormData(e.currentTarget).get("password")));
      setError("");
    } catch (e) {
      setError((e as Error).message);
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
          <button className="primary">Войти в админку</button>
        </form>
        <p className="demo-note">
          Пароль локальной демо-версии: <strong>admin</strong>
        </p>
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
        <button className="secondary" onClick={() => service.adminLogout()}>
          <LogOut size={16} /> Выйти
        </button>
      </div>
      <p className="notice">
        Локальная демо-админка. Все изменения сохраняются только в этом
        браузере.
      </p>
      <div className="admin-layout">
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
            <AccountEditor key={account.id} account={account} />
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
      </div>
      {create && (
        <Modal title="Создать игрока" onClose={() => setCreate(false)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const id = service.createAccount(
                  String(f.get("username")),
                  String(f.get("name")),
                  String(f.get("password")),
                );
                setSelected(id);
                setCreate(false);
              } catch (e) {
                setError((e as Error).message);
              }
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
            <button className="primary">Создать игрока</button>
          </form>
        </Modal>
      )}
      <a className="text-button" href="/">
        <ArrowLeft size={16} /> На сайт
      </a>
    </section>
  );
}
function AccountEditor({ account: a }: { account: Account }) {
  const service = useDemo();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [grant, setGrant] = useState(false);
  const [revoke, setRevoke] = useState<InventoryItem | null>(null);
  const [page, setPage] = useState(0);
  function perform(fn: () => void) {
    setError("");
    setNotice("");
    try {
      fn();
      setNotice("Изменения сохранены");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="account-editor">
      <h2>
        {a.name} <span className="muted">@{a.username}</span>
      </h2>
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
          <button className="secondary">Сохранить профиль</button>
        </form>
        <div className="panel form-stack">
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const p = String(new FormData(form).get("password"));
              perform(() => {
                service.editAccount(a.id, {
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
            <button className="secondary">Изменить пароль</button>
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
            <button className="secondary">Установить баланс</button>
          </form>
        </div>
      </div>
      <p className="error" role="alert">
        {error}
      </p>
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
          <SkinCard key={i.id} skin={getSkin(i.skin_id)}>
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
      <h3>История пополнений</h3>
      {a.deposits.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Дата · Минск</th>
                  <th>Сумма</th>
                  <th>Промокод</th>
                  <th>Бонус</th>
                  <th>Зачислено</th>
                </tr>
              </thead>
              <tbody>
                {a.deposits.slice(page * 8, (page + 1) * 8).map((d) => (
                  <tr key={d.id}>
                    <td>
                      {new Date(d.created_at).toLocaleString("ru-RU", {
                        timeZone: "Europe/Minsk",
                      })}
                    </td>
                    <td>{d.rubles} ₽</td>
                    <td>{d.promo || "—"}</td>
                    <td>{money(d.bonus_minor)} G</td>
                    <td>{money(d.credited_minor)} G</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              ← Назад
            </button>
            <span>
              {page + 1} / {Math.ceil(a.deposits.length / 8)}
            </span>
            <button
              disabled={(page + 1) * 8 >= a.deposits.length}
              onClick={() => setPage(page + 1)}
            >
              Далее →
            </button>
          </div>
        </>
      ) : (
        <p className="empty-small">Пополнений пока нет</p>
      )}
      {grant && (
        <Modal title="Выдать предмет" onClose={() => setGrant(false)}>
          <CatalogPicker
            onSelect={(s) => {
              perform(() => service.grant(a.id, s.id));
              setGrant(false);
            }}
          />
        </Modal>
      )}
      {revoke && (
        <Modal title="Изъять экземпляр?" onClose={() => setRevoke(null)}>
          <p>
            {getSkin(revoke.skin_id).weapon} {getSkin(revoke.skin_id).name}
          </p>
          <p className="muted">ID: {revoke.id}</p>
          <button
            className="primary"
            onClick={() => {
              perform(() => service.revoke(a.id, revoke.id));
              setRevoke(null);
            }}
          >
            Изъять предмет
          </button>
        </Modal>
      )}
    </div>
  );
}
