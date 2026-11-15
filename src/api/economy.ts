import type { Account, Skin } from "./types";
export const DAILY_LIMIT = 1_000_000;
export const DISCLAIMER =
  "SEREGA DROP(demo) — развлекательный симулятор, не связанный с Axlebolt. Все предметы и валюта виртуальные";
export const money = (minor: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
    minor / 100,
  );
export const minskDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Minsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function depositQuote(rubles: number, promo: string) {
  if (!Number.isSafeInteger(rubles) || rubles <= 0 || rubles > 1_000_000)
    throw new Error("Введите целую сумму от 1 до 1 000 000 ₽");
  const code = promo.trim().toUpperCase();
  if (code && code !== "SEREGA") throw new Error("Промокод не найден");
  const base_minor = rubles * 150;
  const bonus_minor = code ? rubles * 30 : 0;
  return {
    base_minor,
    bonus_minor,
    credited_minor: base_minor + bonus_minor,
    promo: code,
  };
}
export function remainingLimit(account: Account, now = new Date()) {
  return Math.max(
    0,
    DAILY_LIMIT -
      account.deposits
        .filter((d) => minskDay(new Date(d.created_at)) === minskDay(now))
        .reduce((n, d) => n + d.credited_minor, 0),
  );
}
export function upgradeChance(source: Pick<Skin, "price_minor">, target: Skin) {
  if (target.price_minor <= source.price_minor)
    throw new Error("Выберите цель дороже суммы выбранных предметов");
  return (90 * source.price_minor) / target.price_minor;
}
export function nearestTarget(
  source: Pick<Skin, "price_minor">,
  catalog: Skin[],
  chance: number,
) {
  const price = (source.price_minor * 90) / chance;
  return catalog
    .filter((s) => s.price_minor > source.price_minor)
    .sort(
      (a, b) =>
        Math.abs(a.price_minor - price) - Math.abs(b.price_minor - price),
    )[0];
}
