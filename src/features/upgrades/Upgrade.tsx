import { useCallback, useRef, useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  Backpack,
  CircleHelp,
  Plus,
  Search,
  Target,
  X,
} from "lucide-react";
import { useDemo } from "../../app/context";
import { getSkin, skins } from "../../api/catalog";
import { nearestTarget, upgradeChance } from "../../api/economy";
import type { Skin, InventoryItem } from "../../api/types";
import { SkinCard, SkinImage } from "../../components/SkinCard";
import { Price } from "../../components/Price";
import { CatalogPicker } from "../../components/CatalogPicker";
import { DropResult } from "../../components/DropResult";
import { useAnimationCompletion } from "../../components/useAnimationCompletion";
import {
  MAX_UPGRADE_ITEMS,
  UPGRADE_DURATION,
  randomUnit,
  upgradeArc,
  upgradeLanding,
  nextRotation,
} from "../../api/animation";
interface UpgradeAttempt {
  id: string;
  sources: InventoryItem[];
  inventory: InventoryItem[];
  target: Skin;
  chance: number;
  won: boolean;
  start: number;
  end: number;
}
export function Upgrade({
  initialId,
  goCases,
  onLogin,
}: {
  initialId?: string;
  goCases: () => void;
  onLogin: () => void;
}) {
  const service = useDemo(),
    account = service.current();
  const [sourceIds, setSourceIds] = useState<string[]>(
    initialId ? [initialId] : [],
  );
  const [target, setTarget] = useState<Skin | null>(null);
  const [attempt, setAttempt] = useState<UpgradeAttempt | null>(null);
  const [phase, setPhase] = useState<"idle" | "spinning" | "result">("idle");
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [inventorySort, setInventorySort] = useState("price");
  const lock = useRef(false);
  const busy = phase === "spinning",
    controlsLocked = phase !== "idle";
  const selected = sourceIds.flatMap(
    (id) => account?.inventory.find((i) => i.id === id) ?? [],
  );
  const sources = attempt && controlsLocked ? attempt.sources : selected;
  const total = sources.reduce(
    (sum, i) => sum + getSkin(i.skin_id).price_minor,
    0,
  );
  const hasSources = sources.length > 0;
  const sourcePrice = { price_minor: total };
  const validTarget =
    attempt && controlsLocked
      ? attempt.target
      : target && target.price_minor > total
        ? target
        : null;
  const chance =
    attempt && controlsLocked
      ? attempt.chance
      : hasSources && validTarget
        ? upgradeChance(sourcePrice, validTarget)
        : 0;
  const arc = upgradeArc(chance);
  const visibleInventory =
    busy && attempt ? attempt.inventory : (account?.inventory ?? []);
  const inventory = visibleInventory
    .filter((i) => {
      const skin = getSkin(i.skin_id);
      return `${skin.weapon} ${skin.name}`
        .toLowerCase()
        .includes(query.toLowerCase());
    })
    .sort((a, b) =>
      inventorySort === "price"
        ? getSkin(b.skin_id).price_minor - getSkin(a.skin_id).price_minor
        : Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  const complete = useCallback(
    () => setPhase((current) => (current === "spinning" ? "result" : current)),
    [],
  );
  const finishAnimation = useAnimationCompletion(
    busy,
    UPGRADE_DURATION,
    complete,
  );
  function chooseSource(id: string) {
    if (controlsLocked) return;
    const next = sourceIds.includes(id)
      ? sourceIds.filter((i) => i !== id)
      : [...sourceIds, id];
    if (next.length > MAX_UPGRADE_ITEMS) {
      setError("Можно выбрать не больше 6 предметов");
      return;
    }
    const total = next.reduce((sum, id) => {
      const item = account?.inventory.find((i) => i.id === id);
      return sum + (item ? getSkin(item.skin_id).price_minor : 0);
    }, 0);
    setSourceIds(next);
    if (target && target.price_minor <= total) setTarget(null);
    setError("");
  }
  function quick(chance: number) {
    if (hasSources && !controlsLocked)
      setTarget(nearestTarget(sourcePrice, skins, chance) ?? null);
  }
  function run() {
    if (!hasSources || !validTarget || lock.current) return;
    setError("");
    lock.current = true;
    try {
      const won = service.upgrade(
        sources.map((i) => i.id),
        validTarget.id,
      );
      const landing = upgradeLanding(chance, won, randomUnit());
      const end = nextRotation(rotation, landing, 5);
      setAttempt({
        id: crypto.randomUUID(),
        sources: [...sources],
        inventory: [...(account?.inventory ?? [])],
        target: validTarget,
        chance,
        won,
        start: rotation,
        end,
      });
      setRotation(end);
      setPhase(
        matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "result"
          : "spinning",
      );
    } catch (e) {
      lock.current = false;
      setError((e as Error).message);
    }
  }
  function closeResult() {
    setPhase("idle");
    setSourceIds([]);
    setAttempt(null);
    lock.current = false;
  }
  function focusInventory() {
    if (!account) {
      onLogin();
      return;
    }
    document
      .getElementById("upgrade-inventory")
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function focusCatalog() {
    document
      .getElementById("upgrade-catalog")
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  return (
    <section className="upgrade-page">
      <div className="game-title">
        <h1>
          SEREGA<span>DROP</span>
          <small>АПГРЕЙД</small>
        </h1>
        <span className="game-rule">
          <CircleHelp size={13} /> 90 × сумма предметов / цена цели
        </span>
      </div>
      <div className="upgrade-stage">
        <div className="selection-column">
          <div
            className={`upgrade-slot source-slot ${hasSources ? "has-item" : ""}`}
          >
            <span className="slot-label">ТВОИ ПРЕДМЕТЫ</span>
            {hasSources ? (
              <>
                <div className="selected-source-grid">
                  {sources.map((item) => {
                    const skin = getSkin(item.skin_id);
                    return (
                      <button
                        key={item.id}
                        className="selected-source"
                        disabled={controlsLocked}
                        onClick={() => chooseSource(item.id)}
                        aria-label={`Убрать ${skin.weapon} ${skin.name}`}
                      >
                        <SkinImage skin={skin} />
                        <span title={`${skin.weapon} ${skin.name}`}>
                          {skin.name}
                        </span>
                        <X size={11} />
                      </button>
                    );
                  })}
                  {sources.length < MAX_UPGRADE_ITEMS && (
                    <button
                      className="add-source"
                      disabled={controlsLocked}
                      onClick={focusInventory}
                      aria-label="Добавить предмет в апгрейд"
                    >
                      <Plus size={23} />
                    </button>
                  )}
                </div>
                <div className="source-total">
                  Общая стоимость <Price value={total} />
                </div>
              </>
            ) : (
              <button className="source-empty-button" onClick={focusInventory}>
                <span className="slot-symbol">
                  <Plus size={30} />
                </span>
                <span className="slot-caption">ВЫБЕРИ ДО 6 ПРЕДМЕТОВ</span>
              </button>
            )}
          </div>
          <div className="slot-controls">
            <span>
              Выбрано <b>{sources.length} / 6</b>
            </span>
            <button
              disabled={!hasSources || controlsLocked}
              onClick={() => {
                setSourceIds([]);
                setError("");
              }}
            >
              <X size={12} /> Сбросить
            </button>
          </div>
        </div>
        <div className={`chance-block ${busy ? "is-upgrading" : ""}`}>
          <div
            className={`chance-ring ${hasSources && validTarget ? "chance-ready" : ""}`}
            style={
              {
                "--arc-start": `${arc.start}deg`,
                "--arc-end": `${arc.end}deg`,
              } as CSSProperties
            }
          >
            <div className="ring-ticks" />
            <div className="chance-core">
              <strong>
                {hasSources && validTarget
                  ? chance.toLocaleString("ru-RU", { maximumFractionDigits: 2 })
                  : "?"}
                <span>%</span>
              </strong>
              <span>
                {busy
                  ? "ИДЁТ АПГРЕЙД"
                  : hasSources && validTarget
                    ? "ШАНС УСПЕХА"
                    : "ВЫБЕРИ ПРЕДМЕТЫ"}
              </span>
            </div>
            <span
              key={attempt?.id ?? "rest"}
              className={`ring-marker ${busy ? "marker-spinning" : ""}`}
              style={
                {
                  transform: `rotate(${rotation}deg)`,
                  "--spin-start": `${attempt?.start ?? rotation}deg`,
                  "--spin-end": `${attempt?.end ?? rotation}deg`,
                  "--spin-duration": `${UPGRADE_DURATION}ms`,
                } as CSSProperties
              }
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) finishAnimation();
              }}
            />
          </div>
          <button
            className="primary upgrade-submit"
            disabled={!hasSources || !validTarget || controlsLocked}
            onClick={run}
          >
            <ArrowUpRight size={23} />
            {busy ? "Апгрейд…" : "Апгрейд"}
          </button>
          <span className="upgrade-cost-note">
            {hasSources
              ? "Все выбранные предметы будут использованы"
              : "Выбери от 1 до 6 предметов"}
          </span>
        </div>
        <div className="selection-column">
          <button
            className={`upgrade-slot target-slot ${validTarget ? "has-item" : ""}`}
            onClick={focusCatalog}
            disabled={controlsLocked}
          >
            <span className="slot-label">ЦЕЛЬ АПГРЕЙДА</span>
            {validTarget ? (
              <>
                <SkinImage skin={validTarget} />
                <strong>{validTarget.name}</strong>
                <span className="slot-weapon">
                  {validTarget.weapon} · {validTarget.rarity}
                </span>
                <Price value={validTarget.price_minor} />
              </>
            ) : (
              <>
                <span className="slot-symbol">
                  <Target size={29} />
                </span>
                <span className="slot-caption">ИЗ КАТАЛОГА НИЖЕ</span>
              </>
            )}
          </button>
          <div className="target-controls">
            <div>
              <span>Множитель</span>
              <div>
                {[2, 4, 8].map((m) => (
                  <button
                    key={m}
                    disabled={!hasSources || controlsLocked}
                    onClick={() => quick(90 / m)}
                  >
                    x{m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span>Шанс</span>
              <div>
                {[35, 55, 75].map((n) => (
                  <button
                    key={n}
                    disabled={!hasSources || controlsLocked}
                    onClick={() => quick(n)}
                  >
                    {n}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="upgrade-message" aria-live="polite">
        <p className="error" role="alert">
          {error}
        </p>
      </div>
      <div
        className={`upgrade-columns ${busy ? "locked" : ""}`}
        aria-busy={busy}
      >
        <section className="item-panel" id="upgrade-inventory">
          <div className="item-panel-heading">
            <h2>Твой инвентарь</h2>
            <span className="panel-count">
              Предметов: {account?.inventory.length ?? 0}
            </span>
          </div>
          <div className="inventory-tabs">
            <span className="active">Инвентарь</span>
            <button onClick={goCases}>
              Получить предметы <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="picker-toolbar">
            <label className="search-field">
              <Search size={15} />
              <input
                aria-label="Поиск в инвентаре"
                placeholder="Поиск по инвентарю"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Сортировка инвентаря"
              value={inventorySort}
              onChange={(e) => setInventorySort(e.target.value)}
            >
              <option value="price">Сначала дорогие</option>
              <option value="new">Сначала новые</option>
            </select>
          </div>
          {!account ? (
            <div className="inventory-guest">
              <Backpack size={34} />
              <h3>Войди в аккаунт</h3>
              <p>Твои предметы появятся здесь</p>
              <button className="primary" onClick={onLogin}>
                Войти
              </button>
              <span>Демо: player / player</span>
            </div>
          ) : inventory.length ? (
            <div className="picker-grid">
              {inventory.map((i) => (
                <SkinCard
                  key={i.id}
                  skin={getSkin(i.skin_id)}
                  selected={sourceIds.includes(i.id)}
                  onClick={() => {
                    if (!controlsLocked) chooseSource(i.id);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="inventory-guest">
              <Backpack size={34} />
              <h3>{query ? "Предметы не найдены" : "Инвентарь пуст"}</h3>
              <p>
                {query
                  ? "Попробуй другое название"
                  : "Получи первый предмет из кейса"}
              </p>
              <button
                className="secondary"
                disabled={controlsLocked}
                onClick={goCases}
              >
                К кейсам
              </button>
            </div>
          )}
        </section>
        <section className="item-panel" id="upgrade-catalog">
          <div className="item-panel-heading">
            <h2>Предмет для апгрейда</h2>
            <span className="panel-count">Каталог</span>
          </div>
          <CatalogPicker
            minimum={total}
            selected={target?.id}
            onSelect={(s) => {
              if (!controlsLocked) setTarget(s);
            }}
          />
        </section>
      </div>
      {phase === "result" && attempt && (
        <DropResult
          skin={attempt.target}
          won={attempt.won}
          kind="upgrade"
          onClose={closeResult}
        />
      )}
    </section>
  );
}
