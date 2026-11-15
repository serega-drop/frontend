import { describe, expect, it } from "vitest";
import {
  depositQuote,
  DAILY_LIMIT,
  minskDay,
  nearestTarget,
  remainingLimit,
  upgradeChance,
} from "./economy";
import { createDemoService, freshDatabase } from "./demo";
import {
  CASE_GOOD_DROP_BASE_CHANCE,
  CASE_GOOD_DROP_CAP,
  CASE_GOOD_DROP_STEP,
  CASE_PITY_START_MISSES,
  CHEAP_ITEM_CHANCE,
  CHEAP_ITEM_PRICE_RATIO,
  caseGoodDropChance,
  caseOddsAt,
  cases,
  getSkin,
  skins,
} from "./catalog";
function setup(random = () => 0) {
  let value: string | null = null;
  const storage = {
    getItem: () => value,
    setItem: (_key: string, v: string) => {
      value = v;
    },
  };
  const service = createDemoService(storage, random);
  service.login("player", "player");
  return { service, storage };
}
function sequence(...values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
describe("Касса и календарь", () => {
  it("начисляет 750 + 150 = 900 G за 500 ₽", () =>
    expect(depositQuote(500, "serega")).toMatchObject({
      base_minor: 75000,
      bonus_minor: 15000,
      credited_minor: 90000,
    }));
  it("отклоняет неизвестный код и дробные рубли", () => {
    expect(() => depositQuote(500, "wrong")).toThrow("Промокод");
    expect(() => depositQuote(1.5, "")).toThrow("целую");
  });
  it("использует полночь по Минску", () => {
    expect(minskDay(new Date("2026-11-15T20:59:59Z"))).toBe("2026-11-15");
    expect(minskDay(new Date("2026-11-15T21:00:00Z"))).toBe("2026-11-16");
  });
  it("отклоняет превышение без изменения баланса и истории", () => {
    const { service } = setup();
    service.deposit(5000, "СБП", "SEREGA");
    expect(service.current()!.balance_minor).toBe(900000);
    expect(() => service.deposit(1000, "Карта", "")).toThrow("дневной лимит");
    expect(service.current()!.deposits).toHaveLength(1);
    expect(remainingLimit(service.current()!)).toBe(100000);
  });
  it("допускает ровный лимит и обновляет его в новый день", () => {
    const db = freshDatabase();
    db.accounts[0].balance_minor = 999850;
    db.accounts[0].deposits = [
      {
        id: "boundary",
        created_at: new Date().toISOString(),
        rubles: 1,
        method: "СБП",
        promo: "",
        base_minor: 999850,
        bonus_minor: 0,
        credited_minor: 999850,
      },
    ];
    let raw = JSON.stringify(db);
    const service = createDemoService({
      getItem: () => raw,
      setItem: (_, value) => {
        raw = value;
      },
    });
    service.login("player", "player");
    service.deposit(1, "СБП", "");
    const a = service.current()!;
    expect(a.balance_minor).toBe(DAILY_LIMIT);
    expect(remainingLimit(a)).toBe(0);
    const next = new Date(Date.now() + 86400000);
    expect(remainingLimit(a, next)).toBe(DAILY_LIMIT);
  });
});
describe("Каталог и экземпляры", () => {
  it("содержит весь снимок, 7 редкостей и точные суммы вероятностей", () => {
    expect(skins).toHaveLength(2383);
    expect(new Set(skins.map((s) => s.id)).size).toBe(2383);
    expect(new Set(skins.map((s) => s.rarity)).size).toBe(7);
    expect(cases).toHaveLength(15);
    expect(Math.max(...cases.map((c) => c.price_minor))).toBe(199_900);
    for (const c of cases) {
      expect(c.entries).toHaveLength(18);
      expect(c.entries.reduce((n, e) => n + e.probability, 0)).toBeCloseTo(
        100,
        8,
      );
      expect(new Set(c.entries.map((e) => e.skin_id)).size).toBe(
        c.entries.length,
      );
      const goodChance = c.entries
        .filter((entry) => getSkin(entry.skin_id).price_minor >= c.price_minor)
        .reduce((sum, entry) => sum + entry.probability, 0);
      expect(goodChance).toBeCloseTo(CASE_GOOD_DROP_BASE_CHANCE, 8);
      expect(
        c.entries.filter(
          (entry) =>
            getSkin(entry.skin_id).price_minor <
            c.price_minor * CHEAP_ITEM_PRICE_RATIO,
        ),
      ).toHaveLength(2);
      expect(
        Math.max(
          ...c.entries.map(
            (entry) => getSkin(entry.skin_id).price_minor / c.price_minor,
          ),
        ),
      ).toBeGreaterThanOrEqual(3);
      const expectedValue = c.entries.reduce(
        (sum, entry) =>
          sum + getSkin(entry.skin_id).price_minor * entry.probability,
        0,
      );
      expect(expectedValue / 100 / c.price_minor).toBeGreaterThanOrEqual(0.6);
      expect(expectedValue / 100 / c.price_minor).toBeLessThanOrEqual(0.9);
      for (const entry of c.entries) {
        const item = getSkin(entry.skin_id);
        expect(item).toBeDefined();
        expect(entry.probability).toBeGreaterThan(0);
        if (item.price_minor < c.price_minor * CHEAP_ITEM_PRICE_RATIO) {
          expect(entry.probability).toBeCloseTo(CHEAP_ITEM_CHANCE, 8);
        }
      }
      const pityOdds = caseOddsAt(c, CASE_GOOD_DROP_CAP);
      expect(
        pityOdds.reduce((sum, entry) => sum + entry.probability, 0),
      ).toBeCloseTo(100, 8);
      expect(
        pityOdds
          .filter(
            (entry) =>
              getSkin(entry.skin_id).price_minor >= c.price_minor,
          )
          .reduce((sum, entry) => sum + entry.probability, 0),
      ).toBeCloseTo(CASE_GOOD_DROP_CAP, 8);
    }
    expect(
      cases.some((c) =>
        c.entries.some((e) =>
          /knife|karambit|butterfly|jkommando|tanto|kunai|m9/i.test(
            getSkin(e.skin_id).weapon,
          ),
        ),
      ),
    ).toBe(true);
  });
  it("рассчитывает мягкий pity по серии промахов и ограничивает рост", () => {
    expect(
      [0, 1, 2, 3, 4, 8, 9, 30].map((misses) =>
        caseGoodDropChance(misses),
      ),
    ).toEqual([
      CASE_GOOD_DROP_BASE_CHANCE,
      CASE_GOOD_DROP_BASE_CHANCE,
      CASE_GOOD_DROP_BASE_CHANCE,
      CASE_GOOD_DROP_BASE_CHANCE +
        (3 - CASE_PITY_START_MISSES + 1) * CASE_GOOD_DROP_STEP,
      CASE_GOOD_DROP_BASE_CHANCE +
        (4 - CASE_PITY_START_MISSES + 1) * CASE_GOOD_DROP_STEP,
      CASE_GOOD_DROP_BASE_CHANCE +
        (8 - CASE_PITY_START_MISSES + 1) * CASE_GOOD_DROP_STEP,
      CASE_GOOD_DROP_CAP,
      CASE_GOOD_DROP_CAP,
    ]);
  });
  it("хранит pity отдельно по кейсам и сбрасывает его после хорошего дропа", () => {
    const { service } = setup(sequence(0, 0, 0, 0.999999));
    service.deposit(200, "СБП", "");
    const first = cases[0],
      second = cases[1];
    for (let attempt = 0; attempt < 3; attempt++)
      service.openCase(first);
    expect(service.current()!.case_miss_streaks[first.slug]).toBe(3);
    service.openCase(second);
    const progress = service.current()!.case_miss_streaks;
    expect(progress[first.slug]).toBe(3);
    expect(progress[second.slug]).toBe(0);
    service.openCase(first);
    expect(service.current()!.case_miss_streaks[first.slug]).toBe(0);
  });
  it("восстанавливает старый прогресс без счётчиков pity", () => {
    const legacy = JSON.parse(
      JSON.stringify(freshDatabase()),
    ) as ReturnType<typeof freshDatabase>;
    delete (legacy.accounts[0] as Partial<(typeof legacy.accounts)[number]>)
      .case_miss_streaks;
    let raw = JSON.stringify(legacy);
    const service = createDemoService({
      getItem: () => raw,
      setItem: (_, value) => {
        raw = value;
      },
    });
    service.login("player", "player");
    expect(service.current()!.case_miss_streaks).toEqual({});
  });
  it("не меняет pity при отказе открытия из-за баланса", () => {
    const { service } = setup();
    const before = service.current();
    expect(() => service.openCase(cases[0])).toThrow("Пополните");
    expect(service.current()).toEqual(before);
  });
  it("отдельно продаёт две одинаковые копии", () => {
    const { service } = setup();
    service.deposit(100, "СБП", "");
    const a = service.openCase(cases[0]),
      b = service.openCase(cases[0]);
    expect(a.skin_id).toBe(b.skin_id);
    expect(a.id).not.toBe(b.id);
    service.sell(a.id);
    expect(service.current()!.inventory.map((i) => i.id)).toEqual([b.id]);
    expect(() => service.sell(a.id)).toThrow();
  });
  it("сохраняет прогресс, но не сессию", () => {
    const { service, storage } = setup();
    service.deposit(100, "СБП", "");
    const fresh = createDemoService(storage);
    expect(fresh.current()).toBeNull();
    fresh.login("player", "player");
    expect(fresh.current()!.balance_minor).toBe(15000);
  });
  it("начинает аккаунт с нулём", () =>
    expect(freshDatabase().accounts[0].balance_minor).toBe(0));
});
describe("Апгрейды и администрирование", () => {
  it("подбирает ближайшую цену и вычисляет точный шанс", () => {
    const source = { ...skins[0], price_minor: 10000 },
      target = { ...skins[1], price_minor: 25000 };
    expect(upgradeChance(source, target)).toBe(36);
    expect(nearestTarget(source, [source, target], 35)).toEqual(target);
    expect(() => upgradeChance(target, source)).toThrow();
  });
  for (const won of [true, false])
    it(`забирает исходный экземпляр при ${won ? "успехе" : "проигрыше"}`, () => {
      const { service } = setup(() => (won ? 0 : 0.999999));
      service.adminLogin("admin");
      const source = skins.find((s) => s.price_minor === 500)!;
      const target = skins.find((s) => s.price_minor >= 10000)!;
      service.grant("demo-player", source.id);
      const id = service.current()!.inventory[0].id;
      expect(service.upgrade([id], target.id)).toBe(won);
      expect(service.current()!.inventory.some((i) => i.id === id)).toBe(false);
      expect(
        service.current()!.inventory.some((i) => i.skin_id === target.id),
      ).toBe(won);
    });
  it("разделяет роли, создаёт аккаунт и отзывает сессию", () => {
    const { service } = setup();
    expect(() => service.accounts()).toThrow();
    service.adminLogin("admin");
    const id = service.createAccount("new_player", "Новый", "test");
    expect(() => service.createAccount("new_player", "Другой", "test")).toThrow(
      "занят",
    );
    service.login("new_player", "test");
    expect(service.current()!.balance_minor).toBe(0);
    service.editAccount(id, {
      username: "new_player",
      name: "Новый",
      active: false,
    });
    expect(service.current()).toBeNull();
    expect(() => service.login("new_player", "test")).toThrow();
  });
});

describe("Несколько экземпляров в апгрейде", () => {
  function granted(count: number, won = true) {
    const { service, storage } = setup(() => (won ? 0 : 0.999999));
    service.adminLogin("admin");
    const source = skins.find((s) => s.price_minor === 500)!;
    const target = skins.find((s) => s.price_minor >= 10000)!;
    for (let i = 0; i < count; i++) service.grant("demo-player", source.id);
    return {
      service,
      storage,
      source,
      target,
      ids: service.current()!.inventory.map((i) => i.id),
    };
  }
  it("рассчитывает шанс по сумме цен", () => {
    const target = { ...skins[0], price_minor: 50000 };
    expect(upgradeChance({ price_minor: 10000 + 15000 }, target)).toBe(45);
    expect(nearestTarget({ price_minor: 25000 }, [target], 45)).toEqual(target);
  });
  for (const won of [true, false])
    it(`расходует все 6 экземпляров при ${won ? "успехе" : "неудаче"}, сохраняя седьмой`, () => {
      const { service, ids, target, storage } = granted(7, won),
        selected = ids.slice(0, 6);
      expect(service.upgrade(selected, target.id)).toBe(won);
      const inventory = service.current()!.inventory;
      expect(inventory.some((i) => selected.includes(i.id))).toBe(false);
      expect(inventory.some((i) => i.id === ids[6])).toBe(true);
      expect(inventory.filter((i) => i.skin_id === target.id)).toHaveLength(
        won ? 1 : 0,
      );
      expect(() => service.upgrade(selected, target.id)).toThrow();
      const restored = createDemoService(storage);
      restored.login("player", "player");
      expect(restored.current()!.inventory).toEqual(inventory);
    });
  it("отклоняет пустой выбор, 7 экземпляров и повтор одного ID без списания", () => {
    const { service, ids, target } = granted(7),
      before = service.current();
    for (const invalid of [[], ids, [ids[0], ids[0]]]) {
      expect(() => service.upgrade(invalid, target.id)).toThrow();
      expect(service.current()).toEqual(before);
    }
  });
  it("не списывает доступные экземпляры, если один отсутствует или цель не дороже суммы", () => {
    const { service, ids, source } = granted(2),
      before = service.current();
    expect(() => service.upgrade([ids[0], "missing"], source.id)).toThrow(
      "недоступен",
    );
    expect(service.current()).toEqual(before);
    const tooCheap = skins.find((s) => s.price_minor === 1000)!;
    expect(() => service.upgrade(ids, tooCheap.id)).toThrow("дороже суммы");
    expect(service.current()).toEqual(before);
  });
  it("разрешает две копии одного скина с разными ID", () => {
    const { service, ids, target } = granted(2);
    expect(service.upgrade(ids, target.id)).toBe(true);
    expect(service.current()!.inventory).toHaveLength(1);
    expect(service.current()!.inventory[0].skin_id).toBe(target.id);
  });
});
