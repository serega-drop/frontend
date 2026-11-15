import { useState, type FormEvent } from "react";
import {
  Check,
  CreditCard,
  LoaderCircle,
  Wallet,
  Zap,
} from "lucide-react";
import { useDemo } from "../../app/context";
import { Modal } from "../../components/Modal";
import { Price } from "../../components/Price";
import {
  DAILY_LIMIT,
  depositQuote,
  DISCLAIMER,
  money,
  remainingLimit,
} from "../../api/economy";

export function Payment({
  onClose,
  onViewHistory,
}: {
  onClose: () => void;
  onViewHistory: () => void;
}) {
  const service = useDemo();
  const account = service.current()!;
  const [rubles, setRubles] = useState("500");
  const [promo, setPromo] = useState("");
  const [method, setMethod] = useState("СБП");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credited, setCredited] = useState<number | null>(null);
  let quote;
  try {
    quote = depositQuote(Number(rubles), promo);
  } catch {
    /* Validation shown on submit. */
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      depositQuote(Number(rubles), promo);
      await new Promise((r) => setTimeout(r, 1700));
      const result = service.deposit(Number(rubles), method, promo);
      setCredited(result.credited_minor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="SEREGA PAY" onClose={onClose} busy={busy}>
      {credited !== null ? (
        <div className="payment-success" role="status">
          <span className="success-orb">
            <Check size={36} />
          </span>
          <h3>Баланс пополнен</h3>
          <p>
            Зачислено <Price value={credited} />
          </p>
          <p className="muted">
            Новый баланс: {money(account.balance_minor)} G
          </p>
          <div className="payment-success-actions">
            <button className="secondary" onClick={onViewHistory}>
              История пополнений
            </button>
            <button className="primary" onClick={onClose}>
              Готово
            </button>
          </div>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit} aria-busy={busy}>
          <p className="muted">Виртуальное пополнение · 1 ₽ = 1,5 G</p>
          <fieldset disabled={busy}>
            <legend>Способ пополнения</legend>
            <div className="segmented">
              {["СБП", "Карта", "Крипта"].map((m, i) => (
                <button
                  type="button"
                  key={m}
                  className={m === method ? "selected" : ""}
                  aria-pressed={m === method}
                  onClick={() => setMethod(m)}
                >
                  {i === 0 ? (
                    <Zap size={17} />
                  ) : i === 1 ? (
                    <CreditCard size={17} />
                  ) : (
                    <Wallet size={17} />
                  )}{" "}
                  {m}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            Сумма, ₽
            <input
              type="number"
              min="1"
              step="1"
              value={rubles}
              onChange={(e) => setRubles(e.target.value)}
              disabled={busy}
              required
              aria-describedby="pay-error"
            />
          </label>
          <div className="quick-row">
            {[100, 500, 1000, 5000].map((n) => (
              <button
                disabled={busy}
                type="button"
                key={n}
                onClick={() => setRubles(String(n))}
              >
                {n.toLocaleString("ru-RU")} ₽
              </button>
            ))}
          </div>
          <label>
            Промокод <span className="muted">· необязательно</span>
            <input
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder="SEREGA"
              disabled={busy}
              aria-describedby="pay-error"
            />
          </label>
          <span className="hint">SEREGA добавляет 20% к начислению</span>
          <div className="payment-breakdown">
            <span>
              Базовое начисление <Price value={quote?.base_minor ?? 0} />
            </span>
            <span>
              Бонус{" "}
              <strong className="green">
                +{money(quote?.bonus_minor ?? 0)} G
              </strong>
            </span>
            <span className="payment-total">
              К зачислению <Price value={quote?.credited_minor ?? 0} />
            </span>
          </div>
          <p className="hint">
            Осталось на сегодня: {money(remainingLimit(account))} /{" "}
            {money(DAILY_LIMIT)} G
          </p>
          <p className="error" id="pay-error" role="alert">
            {error}
          </p>
          <button className="primary" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle className="spin" size={18} /> Проверяем платёж…
              </>
            ) : (
              "Задонатить"
            )}
          </button>
        </form>
      )}
      <p className="disclaimer">{DISCLAIMER}</p>
    </Modal>
  );
}
