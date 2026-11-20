import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, ReceiptText } from "lucide-react";
import { useGame } from "../../app/context";
import type { RequestStatus, TopUpRequest } from "../../api/client";
import { LoadingStatus } from "../../components/LoadingStatus";
import { Price } from "../../components/Price";

export const requestStatusLabel: Record<RequestStatus, string> = {
  pending: "На рассмотрении",
  approved: "Одобрена",
  rejected: "Отклонена",
};
const PAGE_SIZE = 8;
const date = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Minsk", dateStyle: "medium", timeStyle: "short",
});

export function History({ onDeposit, recentRequest }: { onDeposit: () => void; recentRequest?: TopUpRequest }) {
  const service = useGame();
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [requests, setRequests] = useState<TopUpRequest[]>(() => recentRequest ? [recentRequest] : []);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => service.requests()).then(
      (rows) => { if (active) setRequests(rows); },
      (reason: Error) => { if (active) setError(reason.message); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [service, revision]);

  const pageCount = Math.max(1, Math.ceil(requests.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount - 1);
  const visible = requests.slice(visiblePage * PAGE_SIZE, (visiblePage + 1) * PAGE_SIZE);
  function refresh() {
    setLoading(true);
    setError("");
    setRevision((value) => value + 1);
  }
  return (
    <section className="section history-page">
      <div className="section-heading">
        <h1>История заявок</h1>
        <div className="result-actions">
          <button className="secondary" disabled={loading} onClick={refresh}>Обновить</button>
          <button className="primary" onClick={onDeposit}><Plus size={16} /> Создать заявку</button>
        </div>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : loading && <LoadingStatus>Загружаем заявки…</LoadingStatus>}
      {visible.length ? (
        <div className="deposit-list history-deposit-list">
          {visible.map((request) => (
            <article className="deposit-row" key={request.id}>
              <div className="deposit-icon"><ReceiptText size={17} aria-hidden="true" /></div>
              <div className="deposit-main">
                <div>
                  <strong>{request.method} · {requestStatusLabel[request.status]}</strong>
                  <time dateTime={request.created_at}>{date.format(new Date(request.created_at))} · Минск</time>
                </div>
                <div className="deposit-tags">
                  <span>{request.rubles.toLocaleString("ru-RU")} ₽</span>
                  {request.promo && <span>{request.promo}</span>}
                  {request.decided_at && <span>Решение {date.format(new Date(request.decided_at))}</span>}
                </div>
              </div>
              {request.status !== "rejected" && (
                <div className="deposit-amount">
                  <small>{request.status === "approved" ? "Зачислено" : "Ожидается"}</small>
                  <Price value={request.credited_minor} />
                </div>
              )}
            </article>
          ))}
        </div>
      ) : !loading && !error && <p className="empty-small">Заявок пока нет</p>}
      {pageCount > 1 && (
        <nav className="pagination" aria-label="Страницы заявок">
          <button aria-label="Предыдущая страница" disabled={!visiblePage} onClick={() => setPage(visiblePage - 1)}><ChevronLeft size={15} /></button>
          <span>{visiblePage + 1} / {pageCount}</span>
          <button aria-label="Следующая страница" disabled={visiblePage + 1 >= pageCount} onClick={() => setPage(visiblePage + 1)}><ChevronRight size={15} /></button>
        </nav>
      )}
    </section>
  );
}
