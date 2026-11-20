import { useEffect, useRef, useState, type FormEvent } from "react";
import { useGame } from "../../app/context";
import type { GameClient, GameSettings, PromoCode, SettingsView, Statistics, TopUpDecision, TopUpRequest } from "../../api/client";
import { LoadingStatus } from "../../components/LoadingStatus";
import { Modal } from "../../components/Modal";
import { Price } from "../../components/Price";
import { requestStatusLabel } from "../history/History";

function useAdminData<T>(load: (service: GameClient, accountId?: string) => T | Promise<T>, accountId?: string) {
  const service = useGame();
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => load(service, accountId)).then(
      (value) => { if (active) setData(value); },
      (reason: Error) => { if (active) setError(reason.message); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [service, accountId, load, revision]);
  return {
    data, error, loading, setData,
    reload: () => { setLoading(true); setError(""); setRevision((value) => value + 1); },
  };
}

function LoadStatus({ error, reload }: { error: string; reload: () => void }) {
  return error ? (
    <div role="alert">
      <p className="error">{error}</p>
      <button className="secondary" onClick={reload}>Повторить</button>
    </div>
  ) : <LoadingStatus>Загружаем…</LoadingStatus>;
}

const loadRequests = (service: GameClient, accountId?: string) => service.adminRequests(accountId);
const loadPromos = (service: GameClient) => service.promoCodes();
const loadStats = (service: GameClient, accountId?: string) => service.statistics(accountId);
const loadSettings = (service: GameClient) => service.gameSettings();
const date = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Minsk", dateStyle: "short", timeStyle: "short" });

export function RequestsPanel({ accountId }: { accountId?: string }) {
  const service = useGame();
  const { data, error, loading, reload, setData } = useAdminData(loadRequests, accountId);
  const [busy, setBusy] = useState<{ id: string; decision: TopUpDecision }>();
  const [feedback, setFeedback] = useState("");
  const [needsBase, setNeedsBase] = useState("");
  const [onlyPending, setOnlyPending] = useState(!accountId);

  async function decide(request: TopUpRequest, decision: TopUpDecision) {
    if (busy || loading) return;
    setBusy({ id: request.id, decision });
    setFeedback("");
    try {
      const decided = await service.decideRequest(request.id, decision);
      setData((rows) => rows?.map((row) => row.id === decided.id ? decided : row));
      setNeedsBase("");
    } catch (reason) {
      const failure = reason as Error & { code?: string };
      setFeedback(failure.message);
      if (decision === "approve" && (failure.code === "promo_unavailable" || failure.message.startsWith("Промокод недоступен")))
        setNeedsBase(request.id);
    } finally {
      setBusy(undefined);
    }
  }
  const visible = data?.filter((request) => !onlyPending || request.status === "pending");
  return (
    <section className="panel form-stack">
      <div className="section-heading">
        <h2>{accountId ? "Заявки игрока" : "Заявки на золото"}</h2>
        <button className="secondary" disabled={loading || Boolean(busy)} onClick={reload}>Обновить</button>
      </div>
      <label className="checkbox-label">
        <input type="checkbox" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} />
        Только ожидающие
      </label>
      {feedback && <p className="error" role="alert">{feedback}</p>}
      {(loading || error) && <LoadStatus error={error} reload={reload} />}
      {visible?.length ? (
        <div className="deposit-list">
          {visible.map((request) => (
            <article className="deposit-row" key={request.id}>
              <div className="deposit-main">
                <strong>{service.accounts().find((account) => account.id === request.account_id)?.name ?? request.account_id}</strong>
                <span>{requestStatusLabel[request.status]} · {request.method} · {date.format(new Date(request.created_at))}</span>
                <span>{request.rubles} ₽ {request.promo && `· ${request.promo}`}</span>
                {request.status !== "rejected" && <Price value={request.credited_minor} />}
              </div>
              {request.status === "pending" && (
                <div className="result-actions">
                  {needsBase === request.id ? (
                    <button className="primary" disabled={loading || Boolean(busy)} onClick={() => void decide(request, "approve_base")}>
                      {busy?.id === request.id && busy.decision === "approve_base"
                        ? "Одобряем…" : <>Одобрить базу · <Price value={request.base_minor} /></>}
                    </button>
                  ) : (
                    <button className="primary" disabled={loading || Boolean(busy)} onClick={() => void decide(request, "approve")}>{busy?.id === request.id && busy.decision === "approve" ? "Одобряем…" : "Одобрить"}</button>
                  )}
                  <button className="secondary" disabled={loading || Boolean(busy)} onClick={() => void decide(request, "reject")}>{busy?.id === request.id && busy.decision === "reject" ? "Отклоняем…" : "Отклонить"}</button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : data && <p className="muted">Заявок нет</p>}
    </section>
  );
}

export function PromosPanel() {
  const service = useGame();
  const { data, error, loading, reload, setData } = useAdminData(loadPromos);
  const [pendingDelete, setPendingDelete] = useState<PromoCode>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function execute(action: () => void | Promise<void>) {
    if (busy || loading) return;
    setBusy(true);
    setFeedback("");
    try {
      await action();
      setPendingDelete(undefined);
    } catch (reason) {
      setFeedback((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void execute(async () => {
      const created = await service.createPromo({
        code: String(values.get("code")), percent: Number(values.get("percent")),
        activation_limit: Number(values.get("limit")),
      });
      if (data) setData([created, ...data]);
      else reload();
      form.reset();
    });
  }

  return (
    <section className="panel form-stack">
      <h2>Промокоды</h2>
      <form className="toolbar" onSubmit={add}>
        <label>Код <input name="code" required autoComplete="off" /></label>
        <label>Бонус, % <input name="percent" type="number" min="0.01" step="0.01" required /></label>
        <label>Лимит <input name="limit" type="number" min="1" step="1" required /></label>
        <button className="primary" disabled={busy || loading}>
          {busy && !pendingDelete ? "Создаём…" : "Создать промокод"}
        </button>
      </form>
      {feedback && !pendingDelete && <p className="error" role="alert">{feedback}</p>}
      {(loading || error) && <LoadStatus error={error} reload={reload} />}
      {data?.length ? (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Код</th><th>Бонус</th><th>Активации</th><th>Статус</th><th>Действие</th></tr></thead>
            <tbody>{data.map((promo) => (
              <tr key={promo.id}>
                <td>{promo.code}</td><td>{promo.percent}%</td><td>{promo.activations} / {promo.activation_limit}</td>
                <td>{promo.active ? (promo.activations < promo.activation_limit ? "Доступен" : "Исчерпан") : "Отключён"}</td>
                <td>{promo.active && <button className="secondary" disabled={busy} onClick={() => {
                  setFeedback(""); setPendingDelete(promo);
                }}>Отключить</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : data && <p className="muted">Промокодов пока нет</p>}
      {pendingDelete && (
        <Modal title={`Отключить ${pendingDelete.code}?`} busy={busy} onClose={() => setPendingDelete(undefined)}>
          <p>Ожидающие заявки потребуют решения по базовой сумме.</p>
          {feedback && <p className="error" role="alert">{feedback}</p>}
          <div className="result-actions">
            <button className="secondary" autoFocus disabled={busy} onClick={() => setPendingDelete(undefined)}>Отмена</button>
            <button className="primary" disabled={busy} onClick={() => void execute(async () => {
              await service.removePromo(pendingDelete.id);
              setData((rows) => rows?.map((row) => row.id === pendingDelete.id ? { ...row, active: false } : row));
            })}>{busy ? "Отключаем…" : "Отключить"}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

const counters: [keyof Statistics, string][] = [
  ["cases_opened", "Кейсов открыто"], ["good_drops", "Хороших дропов"],
  ["upgrades", "Апгрейдов"], ["successful_upgrades", "Успешных апгрейдов"],
  ["items_sold", "Предметов продано"], ["sales_minor", "Зачислено от продаж"],
  ["requests_pending", "Заявок ожидают"], ["requests_approved", "Заявок одобрено"],
  ["requests_rejected", "Заявок отклонено"], ["credited_minor", "Зачислено по заявкам"],
];

export function StatisticsPanel({ accountId }: { accountId?: string }) {
  const { data, error, reload } = useAdminData(loadStats, accountId);
  return (
    <section className="panel form-stack">
      <div className="section-heading">
        <h2>{accountId ? "Статистика игрока" : "Общая статистика"}</h2>
        <button className="secondary" onClick={reload}>Обновить</button>
      </div>
      {data ? (
        <dl className="admin-stat-grid">
          {counters.map(([key, label]) => (
            <div key={key}><dt>{label}</dt><dd>{key.endsWith("_minor") ? <Price value={data[key]} /> : data[key]}</dd></div>
          ))}
          <div><dt>Успешность апгрейдов</dt><dd>{data.upgrades
            ? (data.successful_upgrades / data.upgrades * 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + "%"
            : "—"}</dd></div>
        </dl>
      ) : <LoadStatus error={error} reload={reload} />}
    </section>
  );
}

type NumberKey = { [K in keyof GameSettings]: GameSettings[K] extends number ? K : never }[keyof GameSettings];
const groups: { label: string; fields: [NumberKey, string][] }[] = [
  { label: "Кейсы и серия промахов", fields: [
    ["case_good_drop_percent", "Хороший дроп, %"], ["case_cheap_drop_percent", "Дешёвый дроп на предмет, %"],
    ["case_pity_start", "Промахов до усиления"], ["case_pity_step", "Прибавка за промах, п. п."],
    ["case_pity_max", "Предел шанса хорошего дропа, %"],
  ] },
  { label: "Апгрейд и золотой сектор", fields: [
    ["upgrade_multiplier", "Коэффициент шанса, %"], ["gold_sector_percent", "Появление сектора, %"],
    ["gold_sector_width", "Ширина сектора, % круга"],
  ] },
  { label: "Усиление и утешение", fields: [
    ["case_boost_threshold", "Порог усиленного кейса, ×"], ["consolation_percent", "Стоимость утешения, % ставки"],
  ] },
];

export function DangerZone() {
  const { data, setData, error, reload } = useAdminData(loadSettings);
  if (!data) return <LoadStatus error={error} reload={reload} />;
  return <SettingsEditor key={data.version} data={data} onSave={setData} onReload={reload} />;
}

function SettingsEditor({ data, onSave, onReload }: {
  data: SettingsView; onSave: (data: SettingsView) => void; onReload: () => void;
}) {
  const service = useGame();
  const [draft, setDraft] = useState(data.active);
  const [caseSlug, setCaseSlug] = useState(service.cases()[0]?.slug ?? "");
  const [confirm, setConfirm] = useState<"save" | "reset">();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const selected = service.cases().find((gameCase) => gameCase.slug === caseSlug);

  async function submit() {
    if (!confirm || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = confirm === "reset"
        ? await service.resetGameSettings(data.version)
        : await service.saveGameSettings(draft, data.version);
      onSave(result);
      setConfirm(undefined);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="panel form-stack danger-zone">
      <div className="section-heading">
        <h2>Опасная зона</h2>
        <button className="secondary" onClick={onReload}>Обновить настройки</button>
      </div>
      <p className="muted">Изменения действуют на новые попытки всех игроков.</p>
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault(); setError(""); setConfirm("save");
      }}>
        {groups.map((group) => (
          <fieldset className="settings-grid" key={group.label}>
            <legend>{group.label}</legend>
            {group.fields.map(([key, label]) => (
              <label key={key}>{label}
                <input type="number" min="0" step="any" required
                  value={Number.isNaN(draft[key]) ? "" : draft[key]}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.valueAsNumber })} />
                <small>По умолчанию: {data.defaults[key]}</small>
              </label>
            ))}
          </fieldset>
        ))}
        <fieldset className="settings-grid">
          <legend>Бесплатные спины</legend>
          {draft.bonus_step_percentages.map((value, index) => (
            <label key={index}>Шанс шага {index + 1}, %
              <input type="number" min="0" max="100" step="any" required
                value={Number.isNaN(value) ? "" : value}
                onChange={(event) => {
                  const bonus_step_percentages = [...draft.bonus_step_percentages];
                  bonus_step_percentages[index] = event.target.valueAsNumber;
                  setDraft({ ...draft, bonus_step_percentages });
                }} />
              <small>По умолчанию: {data.defaults.bonus_step_percentages[index]}</small>
            </label>
          ))}
        </fieldset>
        {selected && (
          <fieldset className="form-stack">
            <legend>Веса предметов кейса</legend>
            <label>Кейс
              <select value={caseSlug} onChange={(event) => setCaseSlug(event.target.value)}>
                {service.cases().map((gameCase) => <option key={gameCase.slug} value={gameCase.slug}>{gameCase.name}</option>)}
              </select>
            </label>
            <div className="settings-grid">
              {selected.entries.map((entry) => {
                const skin = service.skin(entry.skin_id);
                const weight = draft.case_weights[caseSlug]?.[entry.skin_id] ?? entry.probability;
                return (
                  <label key={entry.skin_id}>{skin.weapon} {skin.name}
                    <input type="number" min="0" step="any" required value={Number.isNaN(weight) ? "" : weight}
                      onChange={(event) => setDraft({ ...draft, case_weights: {
                        ...draft.case_weights, [caseSlug]: {
                          ...(draft.case_weights[caseSlug] ?? Object.fromEntries(selected.entries.map((item) => [item.skin_id, item.probability]))),
                          [entry.skin_id]: event.target.valueAsNumber,
                        },
                      } })} />
                    <small>По умолчанию: {data.defaults.case_weights[caseSlug]?.[entry.skin_id] ?? entry.probability}</small>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <div className="result-actions">
          <button className="primary">Применить изменения</button>
          <button className="secondary" type="button" onClick={() => { setError(""); setConfirm("reset"); }}>
            Сбросить к рассчитанным значениям
          </button>
        </div>
      </form>
      {confirm && (
        <Modal title={confirm === "reset" ? "Сбросить глобальные настройки?" : "Применить глобальные настройки?"}
          busy={busy} onClose={() => setConfirm(undefined)}>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="result-actions">
            <button className="secondary" autoFocus disabled={busy} onClick={() => setConfirm(undefined)}>Отмена</button>
            <button className="primary" disabled={busy} onClick={() => void submit()}>
              {busy ? "Сохраняем…" : confirm === "reset" ? "Сбросить" : "Применить"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
