import { useEffect, useState, type FormEvent } from "react";
import { useGame } from "../../app/context";
import type { TopUpQuote, TopUpRequest } from "../../api/client";
import { DISCLAIMER, money } from "../../api/economy";
import { LoadingStatus } from "../../components/LoadingStatus";
import { Modal } from "../../components/Modal";
import { Price } from "../../components/Price";

const methods = ["СБП", "Карта", "Крипта"];

export function Payment({ onClose, onViewHistory, onSubmitted }: { onClose: () => void; onViewHistory: () => void; onSubmitted: (request: TopUpRequest) => void }) {
  const service = useGame();
  const [rubles, setRubles] = useState("500");
  const [method, setMethod] = useState(methods[0]);
  const [promo, setPromo] = useState("");
  const [estimate, setEstimate] = useState<{ key: string; data?: TopUpQuote; error?: string }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const amount = Number(rubles);
  const valid = Number.isSafeInteger(amount) && amount > 0;
  const key = JSON.stringify([amount, method, promo]);
  const quote = estimate?.key === key ? estimate.data : undefined;

  useEffect(() => {
    if (!valid || submitted) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const data = await service.quoteTopUp({ rubles: amount, method, promo });
        if (active) setEstimate({ key, data });
      } catch (reason) {
        if (active) setEstimate({ key, error: (reason as Error).message });
      }
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [service, amount, method, promo, key, valid, submitted]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || busy) return;
    setBusy(true);
    setError("");
    try {
      const request = await service.createTopUp({ rubles: amount, method, promo });
      setSubmitted(true);
      onSubmitted(request);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="SEREGA PAY" onClose={onClose} busy={busy}>
      {submitted ? (
        <div className="form-stack">
          <strong role="status">Заявка на рассмотрении</strong>
          <p className="muted">После одобрения золото появится на балансе.</p>
          <button className="primary" onClick={onViewHistory}>Посмотреть заявку</button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <fieldset className="form-stack request-fields" disabled={busy}>
            <label>Условная сумма, ₽
              <input type="number" min="1" step="1" required value={rubles}
                onChange={(event) => setRubles(event.target.value)} aria-describedby="pay-error" />
            </label>
            <div className="result-actions">
              {[100, 500, 1000, 5000].map((value) => (
                <button key={value} className="secondary" type="button"
                  aria-pressed={amount === value} onClick={() => setRubles(String(value))}>
                  {value.toLocaleString("ru-RU")} ₽
                </button>
              ))}
            </div>
            <label>Способ
              <select value={method} onChange={(event) => setMethod(event.target.value)}>
                {methods.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>Промокод
              <input value={promo} onChange={(event) => setPromo(event.target.value)}
                aria-describedby="pay-error" autoComplete="off" />
            </label>
          </fieldset>
          <div>
            {quote ? (
              <>
                <p role="status">Ожидается <Price value={quote.credited_minor} /></p>
                {quote.bonus_minor > 0 && <p className="muted">Включая бонус {money(quote.bonus_minor)} G</p>}
              </>
            ) : valid && estimate?.key !== key ? <LoadingStatus>Рассчитываем сумму…</LoadingStatus> : null}
          </div>
          <p className="error" id="pay-error" role="alert">
            {error || (estimate?.key === key ? estimate.error : "")}
          </p>
          <button className="primary" disabled={!quote || busy}>
            {busy ? "Отправляем…" : "Создать заявку"}
          </button>
        </form>
      )}
      <p className="disclaimer">{DISCLAIMER}</p>
    </Modal>
  );
}
