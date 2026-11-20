import type { Skin } from "./types";

export const DISCLAIMER =
  "SEREGA DROP(demo) — развлекательный симулятор, не связанный с Axlebolt. Все предметы и валюта виртуальные";

const formatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
export const money = (minor: number) => formatter.format(minor / 100);

export function nearestUpgradeTarget(
  skins: readonly Skin[], stake: number, multiplier: number, desiredChance: number,
) {
  let best: Skin | undefined;
  let bestDifference = Infinity;
  for (const skin of skins) {
    if (skin.price_minor <= stake) continue;
    const difference = Math.abs(multiplier * stake / skin.price_minor - desiredChance);
    if (!best || difference < bestDifference || (difference === bestDifference && (
      skin.price_minor < best.price_minor || (skin.price_minor === best.price_minor && skin.id < best.id)
    ))) {
      best = skin;
      bestDifference = difference;
    }
  }
  return best;
}
