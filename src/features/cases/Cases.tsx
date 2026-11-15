import { useCallback, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import {
  CASE_GOOD_DROP_BASE_CHANCE,
  cases,
  getSkin,
} from "../../api/catalog";
import type { GameCase, Skin } from "../../api/types";
import { useDemo } from "../../app/context";
import { SkinCard, SkinImage } from "../../components/SkinCard";
import { Price } from "../../components/Price";
import { DropResult } from "../../components/DropResult";
import { useAnimationCompletion } from "../../components/useAnimationCompletion";
import {
  CASE_DURATION,
  randomUnit,
  reelLandingPoint,
  reelStopOffset,
} from "../../api/animation";
export function Cases({
  requireLogin,
  goInventory,
  initialSlug,
}: {
  requireLogin: (action: () => void) => void;
  goInventory: () => void;
  initialSlug?: string;
}) {
  const [selected, setSelected] = useState<GameCase | null>(
    () => cases.find((c) => c.slug === initialSlug) ?? null,
  );
  return selected ? (
    <CaseDetail
      key={selected.slug}
      gameCase={selected}
      back={() => setSelected(null)}
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
            .map((e) => getSkin(e.skin_id))
            .sort((a, b) => b.price_minor - a.price_minor)
            .slice(0, 3);
          return (
            <button
              className={`case-card case-card-${i % 3}`}
              key={c.slug}
              onClick={() => setSelected(c)}
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
                    ...new Set(c.entries.map((e) => getSkin(e.skin_id).rarity)),
                  ].map((r) => (
                    <span key={r} className={`rarity-${r}`}>
                      {r}
                    </span>
                  ))}
                </div>
                <span className="case-chance">
                  Базовый шанс хорошего дропа
                  <strong>{CASE_GOOD_DROP_BASE_CHANCE}%</strong>
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
}: {
  gameCase: GameCase;
  back: () => void;
  requireLogin: (action: () => void) => void;
  goInventory: () => void;
}) {
  const service = useDemo();
  const [phase, setPhase] = useState<
    "idle" | "spinning" | "result" | "settled"
  >("idle");
  const [result, setResult] = useState<Skin | null>(null);
  const [error, setError] = useState("");
  const [roll, setRoll] = useState<{
    id: string;
    reel: Skin[];
    stop: number;
    winner: number;
  } | null>(null);
  const lock = useRef(false);
  const busy = phase === "spinning";
  const complete = useCallback(
    () => setPhase((current) => (current === "spinning" ? "result" : current)),
    [],
  );
  const finishAnimation = useAnimationCompletion(
    busy,
    CASE_DURATION,
    complete,
  );
  const idleReel = c.entries.slice(0, 9).map((e) => getSkin(e.skin_id));
  function open() {
    if (lock.current) return;
    setError("");
    lock.current = true;
    try {
      const prize = service.openCase(c),
        skin = getSkin(prize.skin_id);
      const winner = 32 + Math.floor(randomUnit() * 7);
      const reel = Array.from({ length: winner + 7 }, (_, i) =>
        i === winner
          ? skin
          : getSkin(
              c.entries[Math.floor(randomUnit() * c.entries.length)].skin_id,
            ),
      );
      setResult(skin);
      setRoll({
        id: crypto.randomUUID(),
        reel,
        winner,
        stop: reelStopOffset(winner, reelLandingPoint(randomUnit())),
      });
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
          key={roll?.id ?? "idle"}
          className={`reel ${busy ? "reel-spinning" : ""}`}
          style={
            roll
              ? ({
                  transform: `translate3d(${-roll.stop}px,0,0)`,
                  "--reel-start": "-84px",
                  "--reel-stop": `${-roll.stop}px`,
                  "--roll-duration": `${CASE_DURATION}ms`,
                } as CSSProperties)
              : undefined
          }
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) finishAnimation();
          }}
        >
          {(roll?.reel ?? idleReel).map((s, i) => (
            <div
              className={`reel-item rarity-${s.rarity} ${!busy && roll?.winner === i ? "reel-winner" : ""}`}
              key={i}
            >
              <SkinImage skin={s} />
              <strong>{s.weapon}</strong>
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="open-controls">
        <button
          className="primary"
          disabled={busy}
          onClick={() => requireLogin(open)}
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
        <div aria-live="polite">
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
            skin={getSkin(e.skin_id)}
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
