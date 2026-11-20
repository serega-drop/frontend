import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import type { GameCase, InventoryItem, Skin } from "../../api/types";
import { useGame, useGameRestoring } from "../../app/context";
import { SkinCard, SkinImage } from "../../components/SkinCard";
import { LoadingStatus } from "../../components/LoadingStatus";
import { Price } from "../../components/Price";
import { DropResult } from "../../components/DropResult";
import { useAnimationCompletion } from "../../components/useAnimationCompletion";
import { gameSoundEnabled, playGameSound, unlockGameAudio } from "../../api/sounds";
import {
  CASE_DURATION,
  REEL_CARD_WIDTH,
  REEL_GAP,
  REEL_WAIT_SPEED,
  spinHandoffEasing,
  randomUnit,
  reelLandingPoint,
  reelStopOffset,
} from "../../api/animation";
export function Cases({
  requireLogin,
  goInventory,
  initialSlug,
  onCollectionChange,
}: {
  requireLogin: (action: () => void) => void;
  goInventory: () => void;
  initialSlug?: string;
  onCollectionChange: (items: InventoryItem[] | null) => void;
}) {
  const service = useGame();
  const cases = service.cases();
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const selected = cases.find((c) => c.slug === selectedSlug);
  return selected ? (
    <CaseDetail
      key={selected.slug}
      gameCase={selected}
      back={() => setSelectedSlug(undefined)}
      onCollectionChange={onCollectionChange}
      requireLogin={requireLogin}
      goInventory={goInventory}
    />
  ) : (
    <section className="section cases-page">
      <div className="page-title">
        <h1>Кейсы</h1>
        <span className="muted">
          Кейсов: {cases.length} · состав и шансы открыты
        </span>
      </div>
      <div className="case-grid">
        {cases.map((c, i) => {
          const prizes = c.entries
            .map((e) => service.skin(e.skin_id))
            .sort((a, b) => b.price_minor - a.price_minor)
            .slice(0, 3);
          return (
            <button
              className={`case-card case-card-${i % 3}`}
              key={c.slug}
              onClick={() => setSelectedSlug(c.slug)}
            >
              <div className="case-showcase">
                {prizes.map((skin, j) => (
                  <div key={skin.id} className={`case-prize case-prize-${j}`}>
                    <SkinImage skin={skin} />
                  </div>
                ))}
              </div>
              <div className="case-card-copy">
                <h2>{c.name}</h2>
                <div className="case-rarities">
                  {[
                    ...new Set(c.entries.map((e) => service.skin(e.skin_id).rarity)),
                  ].map((r) => (
                    <span key={r} className={`rarity-${r}`}>
                      {r}
                    </span>
                  ))}
                </div>
                <span className="case-chance">
                  Базовый шанс хорошего дропа
                  <strong>{c.entries.filter((entry) => service.skin(entry.skin_id).price_minor >= c.price_minor).reduce((sum, entry) => sum + entry.probability, 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%</strong>
                </span>
                <span className="case-cta">
                  <Price value={c.price_minor} />
                  <span>
                    Открыть <ChevronRight size={15} />
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
function CaseDetail({
  gameCase: c,
  back,
  requireLogin,
  goInventory,
  onCollectionChange,
}: {
  gameCase: GameCase;
  back: () => void;
  requireLogin: (action: () => void) => void;
  goInventory: () => void;
  onCollectionChange: (items: InventoryItem[] | null) => void;
}) {
  const service = useGame();
  const restoring = useGameRestoring();
  const [phase, setPhase] = useState<
    "idle" | "requesting" | "spinning" | "result" | "settled"
  >("idle");
  const [result, setResult] = useState<Skin | null>(null);
  const [error, setError] = useState("");
  const [roll, setRoll] = useState<{
    reel: Skin[];
    start: number;
    stop: number;
    winner: number;
  } | null>(null);
  const [leadIn, setLeadIn] = useState<{
    reel: Skin[];
    start: number;
    period: number;
    stride: number;
  }>();
  const lock = useRef(false);
  const spinning = phase === "spinning";
  const waiting = phase === "requesting";
  const busy = spinning || waiting;
  const stride = leadIn?.stride;
  const moving = busy && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const alive = useRef(true);
  const reelElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; onCollectionChange(null); };
  }, [onCollectionChange]);
  const complete = useCallback(
    () => { setPhase("result"); onCollectionChange(null); },
    [onCollectionChange],
  );
  const finishAnimation = useAnimationCompletion(
    spinning,
    CASE_DURATION,
    complete,
  );
  useEffect(() => {
    const reel = reelElement.current;
    if (!moving || !stride || !reel) return;

    let card: number | undefined;
    let frame: number;
    const playCrossings = () => {
      if (gameSoundEnabled()) {
        const transform = getComputedStyle(reel).transform;
        if (transform !== "none") {
          const offset = -new DOMMatrixReadOnly(transform).m41;
          const next = Math.floor(offset / stride);
          if (card !== undefined && next !== card) playGameSound("case-tick");
          card = next;
        }
      }
      frame = requestAnimationFrame(playCrossings);
    };
    frame = requestAnimationFrame(playCrossings);
    return () => cancelAnimationFrame(frame);
  }, [moving, stride]);
  useEffect(() => {
    if (phase === "result") return playGameSound("case-drop");
  }, [phase]);
  const idleReel = c.entries.slice(0, 9).map((e) => service.skin(e.skin_id));
  async function open() {
    if (lock.current) return;
    setError("");
    lock.current = true;
    onCollectionChange(service.current()?.inventory ?? []);
    const element = reelElement.current;
    const width = element?.firstElementChild?.getBoundingClientRect().width || REEL_CARD_WIDTH;
    const measuredGap = element ? parseFloat(getComputedStyle(element).columnGap) : NaN;
    const gap = Number.isFinite(measuredGap) ? measuredGap : REEL_GAP;
    const cardStride = width + gap;
    const first = roll ? Math.max(0, roll.winner - 6) : 0;
    const cycle = roll ? roll.reel.slice(first, roll.winner + 7) : idleReel;
    const period = cycle.length * cardStride;
    const start = period + (roll ? roll.stop - first * cardStride : width / 2);
    const lead = [...cycle, ...cycle, ...cycle, ...cycle];
    setLeadIn({ reel: lead, start, period, stride: cardStride });
    setPhase("requesting");
    setResult(null);
    setRoll(null);
    try {
      const prize = await service.openCase(c);
      if (!alive.current) return;
      const skin = service.skin(prize.skin_id);
      const transform = element?.classList.contains("reel-waiting") && getComputedStyle(element).transform;
      const offset = transform && transform !== "none" ? -new DOMMatrixReadOnly(transform).m41 : start;
      const winner = Math.floor(offset / cardStride) + 32 + Math.floor(randomUnit() * 7);
      const reel = Array.from({ length: winner + 7 }, (_, index) =>
        index === winner ? skin : lead[index] ?? cycle[index % cycle.length],
      );
      setResult(skin);
      setRoll({
        reel,
        winner,
        start: offset,
        stop: reelStopOffset(winner, reelLandingPoint(randomUnit(), width), width, gap),
      });
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) complete();
      else setPhase("spinning");
    } catch (e) {
      if (!alive.current) return;
      lock.current = false;
      setPhase("idle");
      onCollectionChange(null);
      setError((e as Error).message);
    }
  }
  function closeResult() {
    setPhase("settled");
    lock.current = false;
  }
  return (
    <section className="section case-detail">
      <button className="text-button" disabled={busy} onClick={back}>
        <ArrowLeft size={17} /> Все кейсы
      </button>
      <div className="page-title">
        <h1>{c.name}</h1>
      </div>
      <div className="reel-window" aria-hidden="true">
        <div className="reel-pointer" />
        <div
          ref={reelElement}
          className={`reel ${waiting ? "reel-waiting" : spinning ? "reel-spinning" : ""}`}
          style={
            roll
              ? ({
                  transform: `translate3d(${-roll.stop}px,0,0)`,
                  "--reel-start": `${-roll.start}px`,
                  "--roll-easing": spinHandoffEasing(roll.stop - roll.start, CASE_DURATION,
                    REEL_WAIT_SPEED * (stride ?? REEL_CARD_WIDTH + REEL_GAP), 0.16, 0.11),
                  "--reel-stop": `${-roll.stop}px`,
                  "--roll-duration": `${CASE_DURATION}ms`,
                } as CSSProperties)
              : waiting && leadIn ? ({
                transform: `translate3d(${-leadIn.start}px,0,0)`,
                "--reel-start": `${-leadIn.start}px`,
                "--reel-stop": `${-leadIn.start - leadIn.period}px`,
                "--roll-duration": `${leadIn.period / (REEL_WAIT_SPEED * leadIn.stride)}ms`,
              } as CSSProperties) : undefined
          }
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) finishAnimation();
          }}
        >
          {(roll?.reel ?? (waiting ? leadIn?.reel : undefined) ?? idleReel).map((s, i) => (
            <div
              className={`reel-item rarity-${s.rarity} ${!busy && roll?.winner === i ? "reel-winner" : ""}`}
              key={i}
            >
              <SkinImage skin={s} eager />
              <strong>{s.weapon}</strong>
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="open-controls">
        <button
          className="primary"
          disabled={busy || restoring}
          onClick={() => { unlockGameAudio(); requireLogin(open); }}
        >
          {busy ? (
            "Открываем…"
          ) : (
            <>
              {result ? "Открыть ещё" : "Открыть за"}{" "}
              <Price value={c.price_minor} />
            </>
          )}
        </button>
        {result && !busy && (
          <button className="secondary" onClick={goInventory}>
            В инвентарь <ArrowRight size={17} />
          </button>
        )}
        <p className="error" role="alert">
          {error}
        </p>
        <div className="game-action-status" aria-live="polite">
          <div data-inactive={!waiting || undefined}>
            <LoadingStatus>Получаем результат открытия…</LoadingStatus>
          </div>
          {result && !busy && (
            <span className="drop-result">
              Твой дроп:{" "}
              <strong>
                {result.weapon} {result.name}
              </strong>{" "}
              · <Price value={result.price_minor} />
            </span>
          )}
        </div>
      </div>
      <div className="section-heading">
        <h2>Базовые вероятности предметов</h2>
        <span className="muted small">Шанс на момент первого открытия</span>
      </div>
      <div className="skin-grid">
        {c.entries.map((e) => (
          <SkinCard
            key={e.skin_id}
            skin={service.skin(e.skin_id)}
            eyebrow={`${e.probability.toLocaleString("ru-RU", { maximumFractionDigits: 4 })}%`}
          />
        ))}
      </div>
      {phase === "result" && result && (
        <DropResult
          kind="case"
          skin={result}
          onClose={closeResult}
          onInventory={() => {
            closeResult();
            goInventory();
          }}
        />
      )}
    </section>
  );
}
