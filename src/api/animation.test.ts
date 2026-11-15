import { describe, expect, it } from "vitest";
import {
  nextRotation,
  reelLandingPoint,
  reelStopOffset,
  REEL_CARD_WIDTH,
  REEL_GAP,
  upgradeArc,
  upgradeLanding,
} from "./animation";
describe("Геометрия анимаций", () => {
  it("центрирует золотой сектор в нижней точке полной окружности", () => {
    for (const chance of [0, 0.1, 35, 55, 75, 84, 89.99, 100]) {
      const arc = upgradeArc(chance);
      expect((arc.start + arc.end) / 2).toBeCloseTo(180, 10);
      expect(arc.end - arc.start).toBeCloseTo(chance * 3.6, 10);
    }
    expect(upgradeArc(84).start).toBeCloseTo(28.8);
    expect(upgradeArc(84).end).toBeCloseTo(331.2);
  });
  it("останавливает указатель внутри сектора, совпадающего с исходом", () => {
    for (const chance of [0.001, 1, 35, 55, 75, 84, 89.999])
      for (let i = 0; i <= 100; i++) {
        const arc = upgradeArc(chance);
        const win = upgradeLanding(chance, true, i / 100),
          loss = upgradeLanding(chance, false, i / 100);
        expect(win).toBeGreaterThan(arc.start);
        expect(win).toBeLessThan(arc.end);
        expect(loss < arc.start || loss > arc.end).toBe(true);
        const end = nextRotation(2183, win);
        expect(end - 2183).toBeGreaterThanOrEqual(5 * 360);
        expect(end % 360).toBeCloseTo(win, 8);
      }
  });
  it("указатель попадает в разные точки выигранной карточки, без щелей и соседних призов", () => {
    const points = new Set<number>();
    for (let index = 32; index <= 38; index++)
      for (let sample = 0; sample <= 100; sample++) {
        const point = reelLandingPoint(sample / 100),
          offset = reelStopOffset(index, point);
        const cardIndex = Math.floor(offset / (REEL_CARD_WIDTH + REEL_GAP));
        expect(cardIndex).toBe(index);
        expect(
          offset - cardIndex * (REEL_CARD_WIDTH + REEL_GAP),
        ).toBeGreaterThan(0);
        expect(offset - cardIndex * (REEL_CARD_WIDTH + REEL_GAP)).toBeLessThan(
          REEL_CARD_WIDTH,
        );
        points.add(point);
      }
    expect(points.size).toBeGreaterThan(50);
    expect(
      [...points].some((p) => Math.abs(p - REEL_CARD_WIDTH / 2) > 35),
    ).toBe(true);
  });
});
