import data from "./catalog-data.json";
import type { GameCase, Skin } from "./types";
export const skins = data as Skin[];
const byId = new Map(skins.map((s) => [s.id, s]));
export function getSkin(id: string): Skin {
  const s = byId.get(id);
  if (!s) throw Error("Предмет отсутствует в каталоге");
  return s;
}
const weapons = new Set([
  "AKR",
  "AKR12",
  "M4",
  "M4A1",
  "M16",
  "AWM",
  "M40",
  "USP",
  "G22",
  "P350",
  "F/S",
  "Desert Eagle",
  "TEC-9",
  "MP7",
  "MP5",
  "UMP45",
  "P90",
  "FAMAS",
  "FN FAL",
  "SM1014",
  "SPAS",
  "M110",
  "MAC10",
  "Berettas",
]);
const knife = (s: Skin) =>
  /karambit|butterfly|knife|jkommando|kunai|tanto|stiletto|scorpion|m9|kukri|fang|dual daggers|flip/i.test(
    s.weapon,
  );
export const CASE_GOOD_DROP_BASE_CHANCE = 15;
export const CASE_GOOD_DROP_STEP = 3;
export const CASE_GOOD_DROP_CAP = 35;
export const CASE_PITY_START_MISSES = 3;
export const CHEAP_ITEM_PRICE_RATIO = 0.2;
export const CHEAP_ITEM_CHANCE = 1;

const CHEAP_PRICE_TARGETS = [0.05, 0.12] as const;
const LOW_PRICE_TARGETS = [
  0.22, 0.28, 0.34, 0.4, 0.48, 0.58, 0.72, 0.9,
] as const;
const GOOD_PRICE_TARGETS = [1.05, 1.15, 1.3, 1.4, 1.5, 1.65, 2.1, 4] as const;
const LOW_GROUP_CHANCE = 83;
type GoodTier = "near" | "strong" | "big" | "elite";
const GOOD_TIER_CHANCE: Record<GoodTier, number> = {
  near: 4,
  strong: 8,
  big: 2,
  elite: 1,
};
const GOOD_TIER_ORDER: GoodTier[] = ["elite", "big", "strong", "near"];
const casePool = skins.filter((s) => weapons.has(s.weapon) || knife(s));
const recipes = [
  {
    slug: "serega-starter",
    name: "Serega Starter",
    subtitle: "ПЕРВЫЙ ШАГ К БОЛЬШОМУ ДРОПУ",
    price_minor: 4900,
    accent: "cyan",
  },
  {
    slug: "frost-byte",
    name: "Frost Byte",
    subtitle: "ХОЛОДНЫЙ СТАРТ",
    price_minor: 6900,
    accent: "ice",
  },
  {
    slug: "line-zero",
    name: "Line Zero",
    subtitle: "ТОНКАЯ СИНЯЯ ЛИНИЯ",
    price_minor: 9900,
    accent: "blue",
  },
  {
    slug: "cobalt-rush",
    name: "Cobalt Rush",
    subtitle: "БЫСТРЫЙ НАБОР ВЫСОТЫ",
    price_minor: 12900,
    accent: "cyan",
  },
  {
    slug: "neon-pulse",
    name: "Neon Pulse",
    subtitle: "ИМПУЛЬС НЕОНОВОГО ГОРОДА",
    price_minor: 16900,
    accent: "blue",
  },
  {
    slug: "pro-drop",
    name: "Pro Drop",
    subtitle: "ПОДНИМИ УРОВЕНЬ КОЛЛЕКЦИИ",
    price_minor: 21900,
    accent: "ice",
  },
  {
    slug: "arctic-signal",
    name: "Arctic Signal",
    subtitle: "СИГНАЛ ИЗ АРКТИКИ",
    price_minor: 27900,
    accent: "cyan",
  },
  {
    slug: "blue-circuit",
    name: "Blue Circuit",
    subtitle: "ЗАМКНУТЫЙ КОНТУР",
    price_minor: 34900,
    accent: "blue",
  },
  {
    slug: "night-protocol",
    name: "Night Protocol",
    subtitle: "ПОСЛЕ ПОЛУНОЧИ",
    price_minor: 42900,
    accent: "ice",
  },
  {
    slug: "azure-reactor",
    name: "Azure Reactor",
    subtitle: "РЕАКТОР НА МАКСИМУМЕ",
    price_minor: 52900,
    accent: "cyan",
  },
  {
    slug: "cyber-vault",
    name: "Cyber Vault",
    subtitle: "ХРАНИЛИЩЕ СЕТЕВЫХ РЕДКОСТЕЙ",
    price_minor: 64900,
    accent: "blue",
  },
  {
    slug: "zero-gravity",
    name: "Zero Gravity",
    subtitle: "ГРАВИТАЦИЯ БОЛЬШЕ НЕ ДЕРЖИТ",
    price_minor: 79900,
    accent: "ice",
  },
  {
    slug: "midnight-core",
    name: "Midnight Core",
    subtitle: "САМАЯ ГЛУБОКАЯ ТОЧКА",
    price_minor: 99900,
    accent: "cyan",
  },
  {
    slug: "neon-apex",
    name: "Neon Apex",
    subtitle: "ВЫСШИЙ КЛАСС ДРОПА",
    price_minor: 129900,
    accent: "blue",
  },
  {
    slug: "serega-prime",
    name: "Serega Prime",
    subtitle: "ПРЕМИАЛЬНЫЙ РЕЗЕРВ SEREGA",
    price_minor: 199900,
    accent: "ice",
  },
] as const;

type SelectedCaseSkin = {
  skin: Skin;
  group: "cheap" | "low" | GoodTier;
};

function goodTier(item: Skin, priceMinor: number): GoodTier {
  const ratio = item.price_minor / priceMinor;
  if (ratio < 1.25) return "near";
  if (ratio < 1.8) return "strong";
  if (ratio < 3) return "big";
  return "elite";
}

function findNearestSkin(
  priceMinor: number,
  targetRatio: number,
  minimumRatio: number,
  maximumRatio: number,
  usedIds: Set<string>,
) {
  let nearest: Skin | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of casePool) {
    const ratio = candidate.price_minor / priceMinor;
    if (
      usedIds.has(candidate.id) ||
      ratio < minimumRatio ||
      ratio >= maximumRatio
    )
      continue;
    const distance = Math.abs(ratio - targetRatio);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function selectCaseSkins(priceMinor: number): SelectedCaseSkin[] {
  const usedIds = new Set<string>();
  const selected: SelectedCaseSkin[] = [];
  const add = (
    targetRatio: number,
    minimumRatio: number,
    maximumRatio: number,
    group: SelectedCaseSkin["group"],
  ) => {
    const nearest = findNearestSkin(
      priceMinor,
      targetRatio,
      minimumRatio,
      maximumRatio,
      usedIds,
    );
    if (nearest) {
      usedIds.add(nearest.id);
      selected.push({ skin: nearest, group });
    }
  };
  for (const target of CHEAP_PRICE_TARGETS)
    add(target, 0.01, CHEAP_ITEM_PRICE_RATIO, "cheap");
  for (const target of LOW_PRICE_TARGETS) add(target, 0.2, 1, "low");
  for (const target of GOOD_PRICE_TARGETS) {
    const before = selected.length;
    add(target, 1, Number.POSITIVE_INFINITY, "near");
    if (selected.length > before) {
      const selectedItem = selected[selected.length - 1];
      selectedItem.group = goodTier(selectedItem.skin, priceMinor);
    }
  }
  return selected.sort((a, b) => a.skin.price_minor - b.skin.price_minor);
}

function buildCaseEntries(items: SelectedCaseSkin[]) {
  const groups = new Map<GoodTier, SelectedCaseSkin[]>([
    ["near", []],
    ["strong", []],
    ["big", []],
    ["elite", []],
  ]);
  for (const item of items)
    if (item.group !== "cheap" && item.group !== "low")
      groups.get(item.group)!.push(item);

  const fallback = GOOD_TIER_ORDER.find((tier) => groups.get(tier)!.length);
  if (!fallback) throw Error("В кейсе нет хороших предметов");
  const missingChance = GOOD_TIER_ORDER.reduce(
    (sum, tier) => sum + (groups.get(tier)!.length ? 0 : GOOD_TIER_CHANCE[tier]),
    0,
  );
  const probabilities = new Map<string, number>();
  const lowCount = items.filter((item) => item.group === "low").length;
  for (const item of items) {
    if (item.group === "cheap")
      probabilities.set(item.skin.id, CHEAP_ITEM_CHANCE);
    else if (item.group === "low")
      probabilities.set(item.skin.id, LOW_GROUP_CHANCE / lowCount);
    else {
      const group = groups.get(item.group)!;
      const groupChance =
        GOOD_TIER_CHANCE[item.group] +
        (item.group === fallback ? missingChance : 0);
      probabilities.set(item.skin.id, groupChance / group.length);
    }
  }
  return items.map(({ skin }) => ({
    skin_id: skin.id,
    probability: probabilities.get(skin.id)!,
  }));
}

export const cases: GameCase[] = recipes.map((recipe) => ({
  ...recipe,
  entries: buildCaseEntries(selectCaseSkins(recipe.price_minor)),
}));

export function caseGoodDropChance(missStreak: number) {
  const misses = Math.max(0, Math.floor(missStreak));
  return Math.min(
    CASE_GOOD_DROP_CAP,
    CASE_GOOD_DROP_BASE_CHANCE +
      Math.max(0, misses - CASE_PITY_START_MISSES + 1) * CASE_GOOD_DROP_STEP,
  );
}

export function caseOddsAt(gameCase: GameCase, goodDropChance: number) {
  const chance = Math.max(0, Math.min(100, goodDropChance));
  const isGood = (entry: GameCase["entries"][number]) =>
    getSkin(entry.skin_id).price_minor >= gameCase.price_minor;
  const baseGoodChance = gameCase.entries
    .filter(isGood)
    .reduce((sum, entry) => sum + entry.probability, 0);
  const baseBadChance = 100 - baseGoodChance;
  if (baseGoodChance <= 0 || baseBadChance <= 0)
    throw Error("В кейсе должны быть предметы по обе стороны цены");
  const result = gameCase.entries.map((entry) => ({
    ...entry,
    probability: isGood(entry)
      ? (entry.probability * chance) / baseGoodChance
      : (entry.probability * (100 - chance)) / baseBadChance,
  }));
  const highest = result.reduce(
    (best, entry, index) =>
      entry.probability > result[best].probability ? index : best,
    0,
  );
  result[highest].probability +=
    100 - result.reduce((sum, entry) => sum + entry.probability, 0);
  return result;
}
