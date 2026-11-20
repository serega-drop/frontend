export const DISCLAIMER =
  "SEREGA DROP(demo) — развлекательный симулятор, не связанный с Axlebolt. Все предметы и валюта виртуальные";

const formatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
export const money = (minor: number) => formatter.format(minor / 100);
