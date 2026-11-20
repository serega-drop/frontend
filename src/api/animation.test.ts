import { describe, expect, it } from "vitest";
import {
  bonusSpinEnd,
  CASE_DURATION,
  REEL_WAIT_SPEED,
  UPGRADE_DURATION,
  WHEEL_WAIT_SPEED,
  spinHandoffEasing,
  nextRotation,
  reelLandingPoint,
  reelStopOffset,
  REEL_CARD_WIDTH,
  REEL_GAP,
  upgradeArc,
  upgradeLanding,
  WHEEL_BRAKE_EASING,
  wheelStopTiming,
  wheelMarkIndex,
} from "./animation";
describe("Геометрия анимаций", () => {
  it.each([1800, 1980, 2160])("держит скорость до начала торможения колеса (%s°)", (distance) => {
    const { coastDuration, brakeDuration, coastDistance } = wheelStopTiming(distance);
    const [startX, startY, endX, endY] = WHEEL_BRAKE_EASING.slice(13, -1).split(",").map(Number);
    expect(coastDuration).toBeGreaterThan(0);
    expect(brakeDuration + coastDuration).toBeCloseTo(UPGRADE_DURATION, 10);
    expect(coastDistance / coastDuration).toBeCloseTo(WHEEL_WAIT_SPEED, 10);
    expect((distance - coastDistance) / brakeDuration * startY / startX).toBeCloseTo(WHEEL_WAIT_SPEED, 10);
    expect((1 - endY) / (1 - endX)).toBe(0);
  });
  it.each([
    [31 * 200, CASE_DURATION, REEL_WAIT_SPEED * 200],
    [39 * 200, CASE_DURATION, REEL_WAIT_SPEED * 200],
  ])("переходит с постоянной скорости к замедлению (%s)", (distance, duration, speed) => {
    const easing = spinHandoffEasing(distance, duration, speed);
    const [startX, startY, endX, endY] = easing.slice(13, -1).split(",").map(Number);
    const slope = (t: number, start: number, end: number) =>
      (1 - t) ** 2 * start + 2 * t * (1 - t) * (end - start) + t ** 2 * (1 - end);
    let previous = speed;
    for (let step = 0; step <= 100; step++) {
      const t = step / 100;
      const velocity = distance / duration * slope(t, startY, endY) / slope(t, startX, endX);
      expect(velocity).toBeGreaterThanOrEqual(0);
      expect(velocity).toBeLessThanOrEqual(previous + 1e-10);
      if (step === 0) expect(velocity).toBeCloseTo(speed, 10);
      previous = velocity;
    }
    expect(previous).toBe(0);
  });
  it("показывает исходы бонусной серии с той же шкалой и продолжает вращение", () => {
    let rotation = 2023;
    for (const [chance, won, sample] of [[75, true, 0.2], [50, false, 0.8], [100 / 3, true, 0.6], [100 / 6, false, 0.1]] as const) {
      const end = bonusSpinEnd(rotation, chance, won, sample);
      const angle = end % 360;
      const { start: low, end: high } = upgradeArc(chance);
      expect(end - rotation).toBeGreaterThanOrEqual(720);
      expect(end - rotation).toBeLessThan(1080);
      expect(angle >= low && angle <= high).toBe(won);
      rotation = end;
    }
  });
  it("отслеживает прохождение 15-градусных отметок и переход через ноль", () => {
    const samples = [1800, 1814.9, 1815, 1830, 2159.9, 2160, 2175];
    expect(samples.map(wheelMarkIndex)).toEqual([0, 0, 1, 2, 23, 0, 1]);
    expect(wheelMarkIndex(-0.01)).toBe(23);
    expect(wheelMarkIndex(-15)).toBe(23);
  });
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
