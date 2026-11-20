import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  Backpack,
  CircleHelp,
  Plus,
  Search,
  Target,
  X,
} from "lucide-react";
import { useGame, useGameRestoring } from "../../app/context";
import { defaultSettings } from "../../api/client";
import { nearestUpgradeTarget } from "../../api/economy";
import type { UpgradeInput, UpgradeQuote, UpgradeResult } from "../../api/client";
import { Modal } from "../../components/Modal";
import type { Skin, InventoryItem } from "../../api/types";
import { SkinCard, SkinImage } from "../../components/SkinCard";
import { LoadingStatus } from "../../components/LoadingStatus";
import { Price } from "../../components/Price";
import { CatalogPicker } from "../../components/CatalogPicker";
import { DropResult } from "../../components/DropResult";
import { useAnimationCompletion } from "../../components/useAnimationCompletion";
import { gameSoundEnabled, playGameSound, unlockGameAudio } from "../../api/sounds";
import {
  BONUS_SPIN_DURATION,
  MAX_UPGRADE_ITEMS,
  UPGRADE_DURATION,
  WHEEL_MARK_STEP,
  WHEEL_WAIT_SPEED,
  spinHandoffEasing,
  bonusSpinEnd,
  upgradeArc,
  nextRotation,
  randomUnit,
  wheelMarkIndex,
} from "../../api/animation";
type Phase = "idle" | "requesting" | "spinning" | "bonus-ready" | "bonus-spinning" | "bonus-reveal" | "result";
interface BonusFrame {
  index: number;
  start: number;
  end: number;
}
interface QuoteRequest {
  input: UpgradeInput;
  result?: Promise<UpgradeQuote | undefined>;
}
interface UpgradeAttempt {
  id: string;
  sources: InventoryItem[];
  inventory: InventoryItem[];
  target: Skin;
  chance: number;
  result: UpgradeResult;
  start: number;
  end: number;
}
export function Upgrade({
  initialId,
  goCases,
  onLogin,
  onCollectionChange,
}: {
  initialId?: string;
  goCases: () => void;
  onLogin: () => void;
  onCollectionChange: (items: InventoryItem[] | null) => void;
}) {
  const service = useGame(),
    account = service.current();
  const restoring = useGameRestoring();
  const [sourceIds, setSourceIds] = useState<string[]>(
    initialId ? [initialId] : [],
  );
  const [target, setTarget] = useState<Skin | null>(null);
  const [quote, setQuote] = useState<UpgradeQuote>();
  const [quoting, setQuoting] = useState(false);
  const [desiredChance, setDesiredChance] = useState("");
  const pendingQuote = useRef<QuoteRequest>(undefined);
  const multiplier = useRef(defaultSettings.upgrade_multiplier);
  const alive = useRef(true);
  const quoteTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pendingQuote.current = undefined;
      window.clearTimeout(quoteTimer.current);
      onCollectionChange(null);
    };
  }, [onCollectionChange]);
  const [attempt, setAttempt] = useState<UpgradeAttempt | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [bonusFrame, setBonusFrame] = useState<BonusFrame | null>(null);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [inventorySort, setInventorySort] = useState("price");
  const lock = useRef(false);
  const markerElement = useRef<HTMLSpanElement>(null);
  const busy = phase === "spinning" || phase === "bonus-spinning";
  const waiting = phase === "requesting";
  const moving = (waiting || busy) && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const controlsLocked = phase !== "idle";
  const bonus = attempt?.result.bonus;
  const bonusIndex = bonusFrame?.index ?? 0;
  const bonusStep = phase.startsWith("bonus-") ? bonus?.steps[bonusIndex] : undefined;
  const bonusValue = phase === "bonus-reveal"
    ? bonusStep?.value_minor
    : bonus?.steps[bonusIndex - 1]?.value_minor ?? bonus?.initial_minor;
  const spin = bonusStep ? bonusFrame ?? attempt : attempt;
  const spinStart = spin?.start ?? rotation;
  const spinDuration = bonusStep ? BONUS_SPIN_DURATION : UPGRADE_DURATION;
  const selected = sourceIds.flatMap(
    (id) => account?.inventory.find((i) => i.id === id) ?? [],
  );
  const sources = attempt && controlsLocked ? attempt.sources : selected;
  const total = sources.reduce(
    (sum, i) => sum + service.skin(i.skin_id).price_minor,
    0,
  );
  const hasSources = sources.length > 0;
  const validTarget =
    attempt && controlsLocked
      ? attempt.target
      : target && target.price_minor > total
        ? target
        : null;
  const chance = bonusStep?.chance ?? (attempt && controlsLocked
    ? attempt.chance
    : quote?.chance ?? (validTarget ? multiplier.current * total / validTarget.price_minor : 0));
  const arc = upgradeArc(chance);
  const visibleInventory =
    attempt && phase !== "result" ? attempt.inventory : (account?.inventory ?? []);
  const inventory = visibleInventory
    .filter((i) => {
      const skin = service.skin(i.skin_id);
      return `${skin.weapon} ${skin.name}`
        .toLowerCase()
        .includes(query.toLowerCase());
    })
    .sort((a, b) =>
      inventorySort === "price"
        ? service.skin(b.skin_id).price_minor - service.skin(a.skin_id).price_minor
        : Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  const hasBonusSteps = Boolean(bonus?.steps.length);
  const complete = useCallback(() => {
    setPhase((current) => {
      if (current === "spinning") return hasBonusSteps ? "bonus-ready" : "result";
      return current === "bonus-spinning" ? "bonus-reveal" : current;
    });
  }, [hasBonusSteps]);
  const finishAnimation = useAnimationCompletion(busy, spinDuration, complete);

  useEffect(() => {
    if (!bonus || (phase !== "bonus-ready" && phase !== "bonus-reveal")) return;
    const next = phase === "bonus-ready" ? 0 : bonusIndex + 1;
    const timer = window.setTimeout(() => {
      const step = bonus.steps[next];
      if (!step) {
        setPhase("result");
        return;
      }
      const end = bonusSpinEnd(rotation, step.chance, step.won, randomUnit());
      setBonusFrame({ index: next, start: rotation, end });
      setRotation(end);
      setPhase("bonus-spinning");
    }, 700);
    return () => window.clearTimeout(timer);
  }, [bonus, bonusIndex, phase, rotation]);
  useEffect(() => {
    const marker = markerElement.current;
    if (!moving || !marker) return;

    const stopChime = playGameSound("game-chime");
    let lastMark: number | undefined;
    let frame: number;
    const playCrossings = () => {
      if (gameSoundEnabled()) {
        const transform = getComputedStyle(marker).transform;
        if (transform !== "none") {
          const matrix = new DOMMatrixReadOnly(transform);
          const angle = Math.atan2(matrix.m12, matrix.m11) * 180 / Math.PI;
          const mark = wheelMarkIndex(angle);
          if (lastMark !== undefined && mark !== lastMark) playGameSound("case-tick");
          lastMark = mark;
        }
      }
      frame = requestAnimationFrame(playCrossings);
    };
    frame = requestAnimationFrame(playCrossings);
    return () => {
      cancelAnimationFrame(frame);
      stopChime();
    };
  }, [moving]);
  useEffect(() => {
    if (!attempt) return;
    if (phase === "bonus-ready" && !attempt.result.won) return playGameSound("upgrade-loss");
    if (phase !== "result") return;
    onCollectionChange(null);
    if (bonus?.rewards.length || attempt.result.won) return playGameSound("skin-reward");
    return playGameSound("upgrade-loss");
  }, [phase, attempt, bonus, onCollectionChange]);
  function chooseSource(id: string) {
    if (controlsLocked) return;
    const owned = account?.inventory ?? [];
    if (!owned.some((item) => item.id === id)) return;
    const activeIds = selected.map((item) => item.id);
    const next = activeIds.includes(id)
      ? activeIds.filter((itemId) => itemId !== id)
      : [...activeIds, id];
    if (next.length > MAX_UPGRADE_ITEMS) {
      setError("Можно выбрать не больше 6 предметов");
      return;
    }
    const total = next.reduce((sum, id) => {
      const item = owned.find((i) => i.id === id);
      return sum + (item ? service.skin(item.skin_id).price_minor : 0);
    }, 0);
    setSourceIds(next);
    setError("");
    clearQuote();
    if (target && target.price_minor > total && next.length) {
      void requestQuote({ inventory_item_ids: next, target_skin_id: target.id });
    } else if (target && target.price_minor <= total) setTarget(null);
  }
  function clearQuote() {
    window.clearTimeout(quoteTimer.current);
    pendingQuote.current = undefined;
    setQuote(undefined);
    setQuoting(false);
  }
  function fetchQuote(request: QuoteRequest) {
    window.clearTimeout(quoteTimer.current);
    return (request.result ??= (async () => {
      const { input } = request;
      try {
        const next = await service.quoteUpgrade(input);
        if (pendingQuote.current !== request) return;
        const stake = (service.current()?.inventory ?? [])
          .filter((item) => input.inventory_item_ids.includes(item.id))
          .reduce((sum, item) => sum + service.skin(item.skin_id).price_minor, 0);
        if (stake > 0) multiplier.current = next.chance * next.target.price_minor / stake;
        setQuote(next);
        setTarget(next.target);
        return next;
      } catch (reason) {
        if (pendingQuote.current === request) setError((reason as Error).message);
      } finally {
        if (pendingQuote.current === request) setQuoting(false);
      }
    })());
  }
  function requestQuote(input: UpgradeInput, delay = 0) {
    clearQuote();
    const request = { input };
    pendingQuote.current = request;
    setQuoting(true);
    setError("");
    if (delay) quoteTimer.current = window.setTimeout(() => void fetchQuote(request), delay);
    else void fetchQuote(request);
  }
  function quick(input: Pick<UpgradeInput, "desired_chance" | "target_multiplier">, delay = 0) {
    if (!hasSources || controlsLocked) return;
    const desired = input.desired_chance ?? multiplier.current / (input.target_multiplier ?? 2);
    setTarget(nearestUpgradeTarget(service.skins(), total, multiplier.current, desired) ?? null);
    requestQuote({ inventory_item_ids: selected.map((item) => item.id), ...input }, delay);
  }
  function currentAngle() {
    const marker = markerElement.current;
    if (!marker) return rotation;
    const transform = getComputedStyle(marker).transform;
    if (transform === "none") return rotation;
    const matrix = new DOMMatrixReadOnly(transform);
    return Math.atan2(matrix.m12, matrix.m11) * 180 / Math.PI;
  }
  function resetWaiting() {
    setRotation(currentAngle());
    lock.current = false;
    onCollectionChange(null);
    setPhase("idle");
  }
  async function run() {
    const request = pendingQuote.current;
    if (!hasSources || !validTarget || (!quote && (!quoting || !request)) || lock.current) return;
    unlockGameAudio();
    setError("");
    lock.current = true;
    onCollectionChange(account?.inventory ?? []);
    setPhase("requesting");
    try {
      const confirmed = quote ?? (request && await fetchQuote(request));
      if (!alive.current) return;
      if (!confirmed) {
        resetWaiting();
        return;
      }
      if (confirmed.target.id !== validTarget.id || confirmed.target.price_minor !== validTarget.price_minor ||
          confirmed.chance.toFixed(2) !== chance.toFixed(2)) {
        resetWaiting();
        setError("Условия изменились. Проверьте цель и шанс и нажмите «Апгрейд» ещё раз.");
        return;
      }
      const result = await service.upgrade({
        inventory_item_ids: sources.map((item) => item.id),
        target_skin_id: validTarget.id,
      }, confirmed);
      if (!alive.current) return;
      const start = currentAngle();
      const end = nextRotation(start, result.landing_angle, 5);
      setAttempt({
        id: result.operation_id,
        sources: [...sources],
        inventory: [...(account?.inventory ?? [])],
        target: validTarget,
        chance: result.chance,
        result,
        start,
        end,
      });
      setRotation(end);
      setPhase(
        matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "result"
          : "spinning",
      );
    } catch (e) {
      if (!alive.current) return;
      resetWaiting();
      const failure = e as Error & { status?: number };
      if (failure.status === 409) clearQuote();
      setError(failure.message);
    }
  }
  function closeResult() {
    setPhase("idle");
    setSourceIds([]);
    clearQuote();
    setAttempt(null);
    setBonusFrame(null);
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
          <CircleHelp size={13} /> Шанс рассчитывается по стоимости ставки и цели
        </span>
      </div>
      <div className="upgrade-stage">
        <div className="selection-column">
          <div
            className={`upgrade-slot source-slot ${hasSources ? "has-item" : ""}`}
          >
            <span className="slot-label">{bonusStep ? "СТОИМОСТЬ СЕРИИ" : "ТВОИ ПРЕДМЕТЫ"}</span>
            {bonusStep && bonusValue !== undefined ? (
              <div className="bonus-slot-value"><Price value={bonusValue} /></div>
            ) : hasSources ? (
              <>
                <div className="selected-source-grid">
                  {sources.map((item) => {
                    const skin = service.skin(item.skin_id);
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
          {bonusStep ? (
            <div className="slot-controls"><span>Бонусный спин <b>{bonusIndex + 1} / {bonus?.steps.length}</b></span></div>
          ) : <div className="slot-controls">
            <span>
              Выбрано <b>{sources.length} / 6</b>
            </span>
            <button
              disabled={!hasSources || controlsLocked}
              onClick={() => {
                setSourceIds([]);
                clearQuote();
                setError("");
              }}
            >
              <X size={12} /> Сбросить
            </button>
          </div>}
        </div>
        <div className={`chance-block ${busy ? "is-upgrading" : ""}`}>
          <div
            className={`chance-ring ${bonusStep || (hasSources && validTarget) ? "chance-ready" : ""}`}
            style={
              {
                "--arc-start": `${arc.start}deg`,
                "--arc-end": `${arc.end}deg`,
                "--wheel-mark-step": `${WHEEL_MARK_STEP}deg`,
              } as CSSProperties
            }
          >
            <div className="ring-ticks" />
            {!bonusStep && attempt?.result.gold_sector && (
              <span className="gold-sector" aria-label="Золотой сектор"
                style={{
                  "--gold-start": `${attempt.result.gold_sector.start}deg`,
                  "--gold-width": `${attempt.result.gold_sector.width}deg`,
                } as CSSProperties} />
            )}
            <div className="chance-core">
              <strong>
                {hasSources && validTarget && !quote && !attempt && !bonusStep && "≈"}
                {bonusStep || (hasSources && validTarget)
                  ? chance.toLocaleString("ru-RU", { maximumFractionDigits: 2 })
                  : "?"}
                <span>%</span>
              </strong>
              <span>
                {bonusStep
                  ? `БОНУСНЫЙ СПИН ${bonusIndex + 1}/${bonus?.steps.length}`
                  : waiting || busy
                    ? "ИДЁТ АПГРЕЙД"
                    : quoting ? "ПОДТВЕРЖДАЕМ ШАНС"
                  : hasSources && validTarget
                    ? "ШАНС УСПЕХА"
                    : "ВЫБЕРИ ПРЕДМЕТЫ"}
              </span>
            </div>
            <span
              ref={markerElement}
              className={`ring-marker ${waiting ? "marker-waiting" : busy ? "marker-spinning" : ""}`}
              style={
                {
                  transform: `rotate(${rotation}deg)`,
                  "--spin-start": `${spinStart}deg`,
                  "--spin-end": `${spin?.end ?? rotation}deg`,
                  "--spin-duration": `${spinDuration}ms`,
                  "--spin-easing": phase === "spinning" && attempt
                    ? spinHandoffEasing(attempt.end - attempt.start, UPGRADE_DURATION, WHEEL_WAIT_SPEED)
                    : undefined,
                  "--wait-start": `${rotation}deg`,
                  "--wait-end": `${rotation + 360}deg`,
                  "--wait-duration": `${360 / WHEEL_WAIT_SPEED}ms`,
                } as CSSProperties
              }
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) finishAnimation();
              }}
            />
          </div>
          <button
            className="primary upgrade-submit"
            disabled={!hasSources || !validTarget || (!quote && !quoting) || controlsLocked}
            onClick={run}
          >
            <ArrowUpRight size={23} />
            {phase === "bonus-ready" ? "Бесплатные спины" : bonusStep
              ? `Спин ${bonusIndex + 1} из ${bonus?.steps.length}`
              : phase === "requesting" ? "Запускаем…" : busy ? "Апгрейд…" : "Апгрейд"}
          </button>
          <span className="upgrade-cost-note" role="status">
            {phase === "bonus-reveal" && bonusStep
              ? bonusStep.won ? "Успех" : "Стоимость без изменений"
              : bonusStep ? "Бонусная серия"
              : hasSources ? "Все выбранные предметы будут использованы" : "Выбери от 1 до 6 предметов"}
          </span>
        </div>
        <div className="selection-column">
          {bonusStep ? (
            <div className="upgrade-slot target-slot has-item">
              <span className="slot-label">ПРИ УСПЕХЕ</span>
              <strong className="bonus-slot-value">
                ×{(100 / bonusStep.chance).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
              </strong>
            </div>
          ) : (
            <>
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
                        onClick={() => { setDesiredChance(""); quick({ target_multiplier: m }); }}
                      >
                        x{m}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span>Желаемый шанс</span>
                  <form className="desired-chance" onSubmit={(event) => {
                    event.preventDefault();
                    quick({ desired_chance: Number(desiredChance) });
                  }}>
                    <input aria-label="Желаемый шанс, %" type="number" min="0.01" max="100" step="0.01"
                      required disabled={!hasSources || controlsLocked}
                      value={desiredChance} onChange={(event) => {
                        const { value, valueAsNumber, validity } = event.target;
                        setDesiredChance(value);
                        if (value && validity.valid) quick({ desired_chance: valueAsNumber }, 250);
                        else clearQuote();
                      }} />
                    <button type="submit" disabled={!hasSources || !desiredChance || controlsLocked}>Подобрать</button>
                  </form>
                  <div>
                    {[35, 55, 75].map((n) => (
                      <button
                        key={n}
                        disabled={!hasSources || controlsLocked}
                        onClick={() => { setDesiredChance(String(n)); quick({ desired_chance: n }); }}
                      >
                        {n}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="upgrade-message" aria-live="polite">
        <p className="error" role="alert">
          {error}
        </p>
        {error && !quote && validTarget && selected.length > 0 && !controlsLocked && !quoting && (
          <button className="secondary" onClick={() => void requestQuote({
            inventory_item_ids: selected.map((item) => item.id),
            target_skin_id: validTarget.id,
          })}>Пересчитать шанс</button>
        )}
      </div>
      <div
        className={`upgrade-columns ${busy ? "locked" : ""}`}
        aria-busy={waiting || busy}
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
          {restoring ? <LoadingStatus>Загружаем инвентарь…</LoadingStatus> : !account ? (
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
                  skin={service.skin(i.skin_id)}
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
              if (controlsLocked) return;
              setTarget(s);
              setDesiredChance("");
              if (selected.length) void requestQuote({
                inventory_item_ids: selected.map((item) => item.id), target_skin_id: s.id,
              });
              else clearQuote();
            }}
          />
        </section>
      </div>
      {phase === "result" && attempt && (
        attempt.result.bonus || attempt.result.consolation ? (
          <Modal title={attempt.result.bonus ? "Итог бесплатных спинов" : "Утешительный скин"}
            onClose={closeResult}>
            {attempt.result.bonus ? (
              <div className="form-stack">
                <p>{attempt.result.won ? "Апгрейд удался" : "Апгрейд не удался"} · Старт <Price value={attempt.result.bonus.initial_minor} /></p>
                {!bonusFrame && <ol className="bonus-steps">
                  {attempt.result.bonus.steps.map((step, index) => (
                    <li key={index}>
                      {step.chance.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}% ·
                      {step.won ? " Успех" : " Без изменения"} · <Price value={step.value_minor} />
                    </li>
                  ))}
                </ol>}
                <p>Итог серии <Price value={attempt.result.bonus.final_minor} /> · Награда <Price value={
                  attempt.result.bonus.rewards.reduce((total, skin) => total + skin.price_minor, 0)
                } /></p>
                <div className="skin-grid">
                  {attempt.result.bonus.rewards.map((skin, index) => <SkinCard key={`${skin.id}:${index}`} skin={skin} />)}
                </div>
              </div>
            ) : attempt.result.consolation && <SkinCard skin={attempt.result.consolation} />}
            <button className="primary" onClick={closeResult}>К апгрейду</button>
          </Modal>
        ) : <DropResult skin={attempt.target} won={attempt.result.won} kind="upgrade" onClose={closeResult} />
      )}
    </section>
  );
}
