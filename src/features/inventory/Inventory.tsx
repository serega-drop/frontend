import { useRef, useState } from "react";
import { ArrowRight, Backpack, Search, TrendingUp } from "lucide-react";
import { useGame } from "../../app/context";
import type { SaleInput, SaleQuote } from "../../api/client";
import { SkinCard } from "../../components/SkinCard";
import { Price } from "../../components/Price";
import { Modal } from "../../components/Modal";

export function Inventory({ goCases, goUpgrade }: { goCases: () => void; goUpgrade: (id: string) => void }) {
  const service = useGame();
  const owned = service.current()?.inventory ?? [];
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("new");
  const [selected, setSelected] = useState<string[]>([]);
  const [quote, setQuote] = useState<SaleQuote>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const selection = owned.filter((item) => selected.includes(item.id));
  const total = (items: typeof owned) => items.reduce((sum, item) => sum + service.skin(item.skin_id).price_minor, 0);
  const items = owned.filter((item) => {
    const skin = service.skin(item.skin_id);
    return `${skin.weapon} ${skin.name} ${skin.rarity}`.toLowerCase().includes(query.toLowerCase());
  }).sort((left, right) => sort === "price"
    ? service.skin(right.skin_id).price_minor - service.skin(left.skin_id).price_minor
    : Date.parse(right.created_at) - Date.parse(left.created_at));

  async function prepare(input: SaleInput) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setQuote(await service.quoteSale(input));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function sell() {
    if (!quote || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await service.sell(quote);
      const sold = new Set(quote.inventory_item_ids);
      setSelected((ids) => ids.filter((id) => !sold.has(id)));
      setNotice(`Продано предметов: ${sold.size}`);
      setQuote(undefined);
    } catch (reason) {
      const failure = reason as Error & { status?: number };
      if (failure.status === 409) setQuote(undefined);
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="section inventory-page">
      <div className="page-title"><h1>Инвентарь <span className="count">{owned.length}</span></h1></div>
      <div className="toolbar">
        <label className="search-field">
          <Search size={18} />
          <input aria-label="Поиск в инвентаре" placeholder="Найти свой скин" value={query}
            onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="select-label">Сортировка
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="new">Сначала новые</option>
            <option value="price">Сначала дорогие</option>
          </select>
        </label>
        <span className="inventory-value">Стоимость коллекции <Price value={total(owned)} /></span>
      </div>
      {owned.length > 0 && (
        <div className="toolbar inventory-actions">
          <output>Выбрано: {selection.length} · <Price value={total(selection)} /></output>
          <button className="secondary" disabled={!selection.length || busy}
            onClick={() => void prepare({ mode: "selected", inventory_item_ids: selection.map((item) => item.id) })}>
            Продать выбранное
          </button>
          <button className="secondary" disabled={busy}
            onClick={() => void prepare({ mode: "all", inventory_item_ids: [] })}>Продать всё</button>
          {selection.length > 0 && <button className="text-button" onClick={() => setSelected([])}>Снять выбор</button>}
        </div>
      )}
      <div role="status">{notice}{busy && !quote && "Рассчитываем продажу…"}</div>
      {!quote && error && <p className="error" role="alert">{error}</p>}
      {items.length ? (
        <div className="skin-grid">
          {items.map((item) => {
            const skin = service.skin(item.skin_id);
            const checked = selected.includes(item.id);
            return (
              <SkinCard key={item.id} skin={skin} selected={checked}>
                <label className="checkbox-label">
                  <input type="checkbox" checked={checked} disabled={busy}
                    aria-label={`Выбрать ${skin.weapon} ${skin.name}`}
                    onChange={() => setSelected((ids) => checked ? ids.filter((id) => id !== item.id) : [...ids, item.id])} />
                  Выбрать
                </label>
                <button className="sell-button" disabled={busy}
                  onClick={() => void prepare({ mode: "selected", inventory_item_ids: [item.id] })}>Продать</button>
                <button aria-label={`Апгрейд ${skin.name}`} className="icon-button" onClick={() => goUpgrade(item.id)}>
                  <TrendingUp size={17} />
                </button>
              </SkinCard>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Backpack size={42} />
          <h2>{query ? "Ничего не найдено" : "Инвентарь пуст"}</h2>
          <button className="primary" onClick={query ? () => setQuery("") : goCases}>
            {query ? "Сбросить поиск" : <>Выбрать кейс <ArrowRight size={17} /></>}
          </button>
        </div>
      )}
      {quote && (
        <Modal title="Подтвердить продажу" busy={busy} onClose={() => setQuote(undefined)}>
          <p>Предметов: {quote.inventory_item_ids.length}</p>
          <p>На баланс поступит <Price value={quote.total_minor} /></p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="result-actions">
            <button className="secondary" autoFocus disabled={busy} onClick={() => setQuote(undefined)}>Отмена</button>
            <button className="primary" disabled={busy} onClick={() => void sell()}>{busy ? "Продаём…" : "Продать"}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
