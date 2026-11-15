import { useState } from "react";
import { Search } from "lucide-react";
import { skins } from "../api/catalog";
import type { Skin } from "../api/types";
import { SkinCard } from "./SkinCard";
const PAGE_SIZE = 16;
export function CatalogPicker({
  minimum = 0,
  selected,
  onSelect,
}: {
  minimum?: number;
  selected?: string;
  onSelect: (skin: Skin) => void;
}) {
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("desc");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = skins
    .filter(
      (s) =>
        s.price_minor > minimum &&
        s.price_minor >= Number(from) * 100 &&
        (!to || s.price_minor <= Number(to) * 100) &&
        (!rarity || s.rarity === rarity) &&
        `${s.weapon} ${s.name}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "desc"
        ? b.price_minor - a.price_minor
        : a.price_minor - b.price_minor,
    );
  const last = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1),
    current = Math.min(page, last);
  return (
    <>
      <div className="catalog-tabs">
        <span>Выбери цель</span>
        <span>Найдено: {filtered.length.toLocaleString("ru-RU")}</span>
      </div>
      <div className="picker-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Поиск по каталогу"
            placeholder="Название предмета"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label="Сортировка каталога"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(0);
          }}
        >
          <option value="desc">Сначала дорогие</option>
          <option value="asc">Сначала дешёвые</option>
        </select>
      </div>
      <div className="catalog-filters">
        <label>
          ОТ
          <input
            aria-label="Цена от, G"
            type="number"
            min="0"
            placeholder="0"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          ДО
          <input
            aria-label="Цена до, G"
            type="number"
            min="0"
            placeholder="∞"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label="Редкость"
          value={rarity}
          onChange={(e) => {
            setRarity(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Все редкости</option>
          {[
            "Common",
            "Uncommon",
            "Rare",
            "Epic",
            "Legendary",
            "Arcane",
            "Nameless",
          ].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="picker-grid">
        {filtered
          .slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
          .map((s) => (
            <SkinCard
              key={s.id}
              skin={s}
              selected={s.id === selected}
              onClick={() => onSelect(s)}
            />
          ))}
      </div>
      {!filtered.length && (
        <p className="empty-small">Нет подходящих предметов</p>
      )}
      <div className="pagination">
        <button disabled={!current} onClick={() => setPage(current - 1)}>
          ← Назад
        </button>
        <span>
          {current + 1} / {last + 1}
        </span>
        <button disabled={current >= last} onClick={() => setPage(current + 1)}>
          Далее →
        </button>
      </div>
    </>
  );
}
