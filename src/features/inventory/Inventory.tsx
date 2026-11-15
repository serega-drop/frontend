import { useState } from "react";
import { ArrowRight, Backpack, Search, TrendingUp } from "lucide-react";
import { useDemo } from "../../app/context";
import { getSkin } from "../../api/catalog";
import type { InventoryItem } from "../../api/types";
import { SkinCard } from "../../components/SkinCard";
import { Price } from "../../components/Price";
import { Modal } from "../../components/Modal";
export function Inventory({
  goCases,
  goUpgrade,
}: {
  goCases: () => void;
  goUpgrade: (id: string) => void;
}) {
  const service = useDemo(),
    account = service.current();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("new");
  const [sell, setSell] = useState<InventoryItem | null>(null);
  const [error, setError] = useState("");
  const items = (account?.inventory ?? [])
    .filter((i) => {
      const s = getSkin(i.skin_id);
      return `${s.weapon} ${s.name} ${s.rarity}`
        .toLowerCase()
        .includes(query.toLowerCase());
    })
    .sort((a, b) =>
      sort === "price"
        ? getSkin(b.skin_id).price_minor - getSkin(a.skin_id).price_minor
        : Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  return (
    <section className="section">
      <div className="page-title">
        <span className="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</span>
        <h1>
          Инвентарь{" "}
          <span className="count">{account?.inventory.length ?? 0}</span>
        </h1>
        <p className="muted">Продажа и выбор предметов для апгрейда.</p>
      </div>
      <div className="toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Поиск в инвентаре"
            placeholder="Найти свой скин"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="select-label">
          Сортировка
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="new">Сначала новые</option>
            <option value="price">Сначала дорогие</option>
          </select>
        </label>
        <span className="inventory-value">
          Стоимость коллекции{" "}
          <Price
            value={
              account?.inventory.reduce(
                (n, i) => n + getSkin(i.skin_id).price_minor,
                0,
              ) ?? 0
            }
          />
        </span>
      </div>
      {items.length ? (
        <div className="skin-grid">
          {items.map((i) => (
            <SkinCard key={i.id} skin={getSkin(i.skin_id)}>
              <button
                className="sell-button"
                onClick={() => {
                  setError("");
                  setSell(i);
                }}
              >
                Продать
              </button>
              <button
                aria-label={`Апгрейд ${getSkin(i.skin_id).name}`}
                className="icon-button"
                onClick={() => goUpgrade(i.id)}
              >
                <TrendingUp size={17} />
              </button>
            </SkinCard>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Backpack size={42} />
          <h2>{query ? "Ничего не найдено" : "Инвентарь пуст"}</h2>
          <p className="muted">
            {query
              ? "Попробуй другое название."
              : "Открой первый кейс — предмет появится здесь."}
          </p>
          <button
            className="primary"
            onClick={query ? () => setQuery("") : goCases}
          >
            {query ? (
              "Сбросить поиск"
            ) : (
              <>
                Выбрать кейс <ArrowRight size={17} />
              </>
            )}
          </button>
        </div>
      )}
      {sell && (
        <Modal title="Продать предмет?" onClose={() => setSell(null)}>
          <p>
            {getSkin(sell.skin_id).weapon} {getSkin(sell.skin_id).name}
          </p>
          <p className="muted">
            На баланс поступит{" "}
            <Price value={getSkin(sell.skin_id).price_minor} />
          </p>
          <p className="error" role="alert">
            {error}
          </p>
          <button
            className="primary"
            onClick={() => {
              try {
                service.sell(sell.id);
                setSell(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Продать за <Price value={getSkin(sell.skin_id).price_minor} />
          </button>
        </Modal>
      )}
    </section>
  );
}
