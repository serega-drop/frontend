import { useState } from "react";
import {
  ArrowDownToLine,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Plus,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { useDemo } from "../../app/context";
import { Price } from "../../components/Price";
import {
  DAILY_LIMIT,
  money,
  remainingLimit,
} from "../../api/economy";

const PAGE_SIZE = 8;
const depositDate = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Minsk",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function History({ onDeposit }: { onDeposit: () => void }) {
  const service = useDemo();
  const account = service.current()!;
  const [requestedPage, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(account.deposits.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount - 1);
  const visible = account.deposits.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );
  const totals = account.deposits.reduce(
    (result, deposit) => ({
      rubles: result.rubles + deposit.rubles,
      credited: result.credited + deposit.credited_minor,
      bonus: result.bonus + deposit.bonus_minor,
    }),
    { rubles: 0, credited: 0, bonus: 0 },
  );
  const todayCredited = DAILY_LIMIT - remainingLimit(account);

  return (
    <section className="section history-page">
      <div className="page-title history-title">
        <div>
          <span className="eyebrow">SEREGA PAY</span>
          <h1>История пополнений</h1>
          <p className="muted">
            Все зачисления виртуального баланса в одном месте.
          </p>
        </div>
        <button className="primary" onClick={onDeposit}>
          <Plus size={16} /> Пополнить
        </button>
      </div>

      <div className="history-summary">
        <article className="history-stat">
          <span className="history-stat-icon">
            <ReceiptText size={18} />
          </span>
          <span>Всего операций</span>
          <strong>{account.deposits.length}</strong>
        </article>
        <article className="history-stat">
          <span className="history-stat-icon">
            <WalletCards size={18} />
          </span>
          <span>Оплачено</span>
          <strong>{totals.rubles.toLocaleString("ru-RU")} ₽</strong>
        </article>
        <article className="history-stat">
          <span className="history-stat-icon">
            <ArrowDownToLine size={18} />
          </span>
          <span>Всего зачислено</span>
          <Price value={totals.credited} />
        </article>
        <article className="history-stat history-today">
          <span className="history-stat-icon">
            <CalendarClock size={18} />
          </span>
          <span>Зачислено сегодня</span>
          <Price value={todayCredited} />
          <small>
            лимит {money(DAILY_LIMIT)} G · бонусы за всё время{" "}
            {money(totals.bonus)} G
          </small>
        </article>
      </div>

      <div className="section-heading history-list-heading">
        <h2>Начисления</h2>
        <span className="muted small">Время указано по Минску</span>
      </div>

      {visible.length ? (
        <>
          <div className="deposit-list history-deposit-list">
            {visible.map((deposit) => (
              <article className="deposit-row" key={deposit.id}>
                <div className="deposit-icon" aria-hidden="true">
                  <ReceiptText size={17} />
                </div>
                <div className="deposit-main">
                  <div>
                    <strong>{deposit.method}</strong>
                    <time dateTime={deposit.created_at}>
                      {depositDate.format(new Date(deposit.created_at))} · Минск
                    </time>
                  </div>
                  <div className="deposit-tags">
                    <span>{deposit.rubles.toLocaleString("ru-RU")} ₽</span>
                    <span>
                      база {money(deposit.base_minor)} G
                      {deposit.promo ? ` · ${deposit.promo}` : ""}
                    </span>
                    {deposit.bonus_minor > 0 && (
                      <span className="deposit-bonus">
                        +{money(deposit.bonus_minor)} G
                      </span>
                    )}
                  </div>
                </div>
                <Price value={deposit.credited_minor} />
              </article>
            ))}
          </div>
          {pageCount > 1 && (
            <nav className="pagination" aria-label="Страницы истории">
              <button
                aria-label="Предыдущая страница"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <span>
                {page + 1} / {pageCount}
              </span>
              <button
                aria-label="Следующая страница"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="deposit-empty history-empty">
          <ReceiptText size={31} />
          <strong>Пополнений пока нет</strong>
          <p>
            После первого пополнения здесь появятся сумма, бонус и время
            зачисления.
          </p>
          <button className="primary" onClick={onDeposit}>
            <Plus size={16} /> Перейти к пополнению
          </button>
        </div>
      )}
    </section>
  );
}
