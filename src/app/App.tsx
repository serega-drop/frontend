import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Backpack,
  Box,
  CircleHelp,
  History,
  LogIn,
  LogOut,
  Plus,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import { useGame } from "./context";
import { Price } from "../components/Price";
import { SkinImage } from "../components/SkinCard";
import { Cases } from "../features/cases/Cases";
import { Inventory } from "../features/inventory/Inventory";
import { History as HistoryPage } from "../features/history/History";
import { Upgrade } from "../features/upgrades/Upgrade";
import { Login } from "../features/auth/Login";
import { Payment } from "../features/payments/Payment";
import { Admin } from "../features/admin/Admin";
import { Modal } from "../components/Modal";
import { DISCLAIMER } from "../api/economy";
import type { TopUpRequest } from "../api/client";
import type { InventoryItem } from "../api/types";
import { gameSoundEnabled, preloadGameAudio, setGameSoundEnabled } from "../api/sounds";
type Page = "cases" | "upgrade" | "inventory" | "history" | "admin";
const paths: Record<Page, string> = {
  cases: "/cases",
  upgrade: "/",
  inventory: "/inventory",
  history: "/history",
  admin: "/admin",
};
const route = (): Page =>
  location.pathname === "/admin"
    ? "admin"
    : location.pathname === "/history"
      ? "history"
    : location.pathname === "/inventory"
      ? "inventory"
      : location.pathname === "/cases"
        ? "cases"
        : "upgrade";
export default function App() {
  const service = useGame(),
    account = service.current();
  const cases = service.cases();
  const [collectionSnapshot, setCollectionSnapshot] = useState<InventoryItem[] | null>(null);
  const collection = collectionSnapshot ?? account?.inventory ?? [];
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [page, setPage] = useState<Page>(route);
  const [login, setLogin] = useState(false);
  const [payment, setPayment] = useState(false);
  const [createdRequest, setCreatedRequest] = useState<TopUpRequest>();
  const [help, setHelp] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(gameSoundEnabled);
  useEffect(preloadGameAudio, []);
  const [upgradeId, setUpgradeId] = useState<string>();
  const [caseSlug, setCaseSlug] = useState<string>();
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    const handler = () => setPage(route());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  function navigate(next: Page) {
    if (next !== page) {
      history.pushState(null, "", paths[next]);
      setPage(next);
      window.scrollTo(0, 0);
    }
  }
  function requireLogin(action: () => void) {
    if (service.current()) action();
    else {
      pending.current = action;
      setLogin(true);
    }
  }
  function pay() {
    requireLogin(() => setPayment(true));
  }
  const recentRequest = createdRequest?.account_id === account?.id ? createdRequest : undefined;
  const nav = [
    { id: "upgrade" as const, label: "Апгрейд", icon: ArrowUpRight },
    { id: "cases" as const, label: "Кейсы", icon: Box },
    { id: "inventory" as const, label: "Инвентарь", icon: Backpack },
    { id: "history" as const, label: "История", icon: History },
  ];
  return (
    <>
      <header className="game-header">
        <a
          className="logo"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("upgrade");
          }}
          aria-label="SEREGA DROP(demo), главная"
        >
          <span>
            SEREGA<span className="logo-drop">DROP</span>
            <small>(demo)</small>
          </span>
        </a>
        <nav aria-label="Основная навигация">
          {nav.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={paths[id]}
              aria-current={page === id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (id === "inventory" || id === "history")
                  requireLogin(() => navigate(id));
                else {
                  if (id === "cases") setCaseSlug(undefined);
                  navigate(id);
                }
              }}
            >
              <Icon size={16} />
              {label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <span className="demo-indicator">DEMO</span>
          <button
            className="icon-button"
            aria-label="Звуки игры"
            aria-pressed={soundEnabled}
            title={soundEnabled ? "Выключить звуки" : "Включить звуки"}
            onClick={() => {
              setGameSoundEnabled(!soundEnabled);
              setSoundEnabled(!soundEnabled);
            }}
          >
            {soundEnabled ? <Volume2 size={17} aria-hidden="true" /> : <VolumeX size={17} aria-hidden="true" />}
          </button>
          <button
            className="icon-button help-button"
            aria-label="Как это работает"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={17} />
          </button>
          {account ? (
            <>
              <button className="balance" aria-label="Запросить золото" onClick={pay}>
                <Wallet size={15} />
                <Price value={account.balance_minor} />
                <Plus size={17} />
              </button>
              <button
                className="profile-button"
                onClick={() => { setLogoutError(""); setConfirmLogout(true); }}
                aria-label={`Выйти из аккаунта ${account.name}`}
                title={`Выйти · ${account.name}`}
              >
                <span className="avatar">{account.name[0]}</span>
                <span className="profile-name">{account.name}</span>
                <LogOut size={14} />
              </button>
            </>
          ) : (
            <button
              className="primary login-button"
              onClick={() => requireLogin(() => {})}
            >
              <LogIn size={15} /> Войти
            </button>
          )}
        </div>
      </header>
      <div className={`workspace ${page === "admin" ? "admin-workspace" : ""}`}>
        {page !== "admin" && (
          <aside className="game-sidebar" aria-label="Кейсы и коллекция">
            <div className="sidebar-label">
              <Box size={12} /> КЕЙСЫ{" "}
              <span>{String(cases.length).padStart(2, "0")}</span>
            </div>
            <div className="sidebar-cases">
              {cases.map((c, i) => {
                const prize = service.skin(c.entries[c.entries.length - 1].skin_id);
                return (
                  <button
                    key={c.slug}
                    className={`sidebar-case sidebar-case-${i % 3}`}
                    onClick={() => {
                      setCaseSlug(c.slug);
                      navigate("cases");
                    }}
                  >
                    <span>{c.name}</span>
                    <SkinImage skin={prize} />
                    <Price value={c.price_minor} />
                  </button>
                );
              })}
            </div>
            <button className="sidebar-pay" onClick={pay}>
              <Plus size={14} />
              <span>
                Запросить золото<small>SEREGA PAY</small>
              </span>
            </button>
            <div className="sidebar-label collection-label">
              <Backpack size={12} /> МОЯ КОЛЛЕКЦИЯ{" "}
              <span>{collection.length}</span>
            </div>
            {collection.length ? (
              <div className="sidebar-owned">
                {collection.slice(0, 5).map((i) => (
                  <button
                    key={i.id}
                    onClick={() => {
                      setUpgradeId(i.id);
                      navigate("upgrade");
                    }}
                  >
                    <SkinImage skin={service.skin(i.skin_id)} />
                    <span>
                      {service.skin(i.skin_id).name}
                      <small>{service.skin(i.skin_id).weapon}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="sidebar-empty">
                {account
                  ? "В инвентаре пока нет предметов"
                  : "Войди, чтобы увидеть свои предметы"}
              </p>
            )}
            <div className="sidebar-bottom">
              <ShieldCheck size={13} /> Виртуальная валюта
              <br />и предметы
            </div>
          </aside>
        )}
        <div className="workspace-content">
          <main>
            {page === "admin" ? (
              <Admin />
            ) : page === "cases" ? (
              <Cases
                key={caseSlug ?? "list"}
                initialSlug={caseSlug}
                requireLogin={requireLogin}
                goInventory={() => navigate("inventory")}
                onCollectionChange={setCollectionSnapshot}
              />
            ) : page === "inventory" ? (
              account ? (
                <Inventory
                  goCases={() => navigate("cases")}
                  goUpgrade={(id) => {
                    setUpgradeId(id);
                    navigate("upgrade");
                  }}
                />
              ) : (
                <section className="empty-state">
                  <Backpack size={30} />
                  <h1>Инвентарь</h1>
                  <p className="muted">Войди, чтобы увидеть свои предметы.</p>
                  <button
                    className="primary"
                    onClick={() => requireLogin(() => {})}
                  >
                    Войти
                  </button>
                </section>
              )
            ) : page === "history" ? (
              account ? (
                <HistoryPage
                  key={`${account.id}:${recentRequest?.id ?? ""}`}
                  recentRequest={recentRequest}
                  onDeposit={pay}
                />
              ) : (
                <section className="empty-state">
                  <History size={30} />
                  <h1>История заявок</h1>
                  <p className="muted">
                    Войди, чтобы увидеть историю заявок.
                  </p>
                  <button
                    className="primary"
                    onClick={() => requireLogin(() => {})}
                  >
                    Войти
                  </button>
                </section>
              )
            ) : (
              <Upgrade
                key={upgradeId ?? "upgrade"}
                initialId={upgradeId}
                goCases={() => {
                  setCaseSlug(undefined);
                  navigate("cases");
                }}
                onLogin={() => requireLogin(() => {})}
                onCollectionChange={setCollectionSnapshot}
              />
            )}
          </main>
          <footer>
            <p>{DISCLAIMER}</p>
            <div>
              <span>© 2026 SEREGA DROP</span>
              <span>Предметов: {service.skins().length.toLocaleString("ru-RU")}</span>
              <a
                href="/admin"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("admin");
                }}
              >
                Администратор <ArrowUpRight size={11} />
              </a>
            </div>
          </footer>
        </div>
      </div>
      {login && (
        <Login
          onClose={() => {
            pending.current = null;
            setLogin(false);
          }}
          onSuccess={() => {
            setLogin(false);
            const action = pending.current;
            pending.current = null;
            action?.();
          }}
        />
      )}
      {payment && account && (
        <Payment
          onClose={() => setPayment(false)}
          onSubmitted={setCreatedRequest}
          onViewHistory={() => {
            setPayment(false);
            navigate("history");
          }}
        />
      )}{" "}
      {confirmLogout && account && (
        <Modal title="Выйти из аккаунта?" onClose={() => setConfirmLogout(false)} busy={logoutBusy}>
          <p>{account.name}</p>
          {logoutError && <p className="error" role="alert">{logoutError}</p>}
          <div className="result-actions">
            <button type="button" className="secondary" autoFocus disabled={logoutBusy}
              onClick={() => setConfirmLogout(false)}>Отмена</button>
            <button type="button" className="primary" disabled={logoutBusy} onClick={async () => {
              setLogoutBusy(true);
              setLogoutError("");
              try {
                await service.logout();
                setConfirmLogout(false);
                setPayment(false);
                setCreatedRequest(undefined);
              } catch (reason) {
                setLogoutError((reason as Error).message);
              } finally {
                setLogoutBusy(false);
              }
            }}>{logoutBusy ? "Выходим…" : "Выйти"}</button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="Как это работает" onClose={() => setHelp(false)}>
          <ol className="help-steps">
            <li>
              <strong>Вход</strong>
              <p>
                Новых игроков создаёт администратор.
              </p>
            </li>
            <li>
              <strong>Баланс</strong>
              <p>
                1 ₽ = 1,5 G. Золото зачисляется после одобрения заявки администратором.
              </p>
            </li>
            <li>
              <strong>Кейсы</strong>
              <p>
                Хороший дроп — предмет не дешевле цены кейса. Базовый шанс и
                состав показаны до открытия.
              </p>
            </li>
            <li>
              <strong>Апгрейд</strong>
              <p>
                Выбери до шести своих предметов и более дорогую цель. Сервис рассчитает шанс и зафиксирует исход.
              </p>
            </li>
          </ol>
          <p className="disclaimer">{DISCLAIMER}</p>
        </Modal>
      )}
    </>
  );
}
