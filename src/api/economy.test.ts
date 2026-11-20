import { describe, expect, it } from "vitest";
import { createDemoService, freshDatabase } from "./demo";
import { upgradeLanding } from "./animation";
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
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}
type Demo = ReturnType<typeof createDemoService>;
function approve(service: Demo, rubles: number) {
  const request = service.createTopUp({ rubles, method: "СБП", promo: "" });
  service.adminLogin("admin");
  service.decideRequest(request.id, "approve");
  service.adminLogout();
}
function attempt(service: Demo, inventory_item_ids: string[], target_skin_id: string) {
  const input = { inventory_item_ids, target_skin_id };
  return service.upgrade(input, service.quoteUpgrade(input));
}
function setup(random = () => 0) {
  const storage = memoryStorage();
  const service = createDemoService(storage, random);
  service.login("player", "player");
  return { service, storage };
}
function sequence(...values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
describe("Заявки на золото", () => {
  it("отправляет заявку без зачисления и применяет бонус при одобрении", () => {
    const { service } = setup();
    const request = service.createTopUp({ rubles: 500, method: "СБП", promo: "serega" });
    expect(request).toMatchObject({ status: "pending", base_minor: 75000, bonus_minor: 15000 });
    expect(service.current()!.balance_minor).toBe(0);
    service.adminLogin("admin");
    service.decideRequest(request.id, "approve");
    expect(service.current()!.balance_minor).toBe(90000);
    expect(service.requests()[0].status).toBe("approved");
    expect(() => service.decideRequest(request.id, "approve")).toThrow();
    expect(service.current()!.balance_minor).toBe(90000);
  });
  it("одобряет базу явно после исчерпания последней активации", () => {
    const { service } = setup();
    service.adminLogin("admin");
    service.createPromo({ code: "ONCE", percent: 20, activation_limit: 1 });
    const payload = { rubles: 5000, method: "Карта", promo: "ONCE" };
    const first = service.createTopUp(payload);
    const second = service.createTopUp(payload);
    service.decideRequest(first.id, "approve");
    expect(() => service.decideRequest(second.id, "approve")).toThrow("Промокод недоступен");
    expect(service.requests().find((r) => r.id === second.id)?.status).toBe("pending");
    service.decideRequest(second.id, "approve_base");
    expect(service.current()!.balance_minor).toBe(1650000);
    expect(service.promoCodes().find((p) => p.code === "ONCE")?.activations).toBe(1);
  });
  it("отклоняет неизвестный код и дробные рубли", () => {
    expect(() => setup().service.quoteTopUp({ rubles: 500, method: "СБП", promo: "wrong" })).toThrow("Промокод");
    expect(() => setup().service.quoteTopUp({ rubles: 1.5, method: "СБП", promo: "" })).toThrow("целую");
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
    const { service, storage } = setup(sequence(0, 0, 0, 0.999999));
    const progress = () => JSON.parse(storage.getItem("serega-drop:demo:v1")!).accounts[0].case_miss_streaks;
    approve(service, 200);
    const first = cases[0],
      second = cases[1];
    for (let attempt = 0; attempt < 3; attempt++)
      service.openCase(first);
    expect(progress()[first.slug]).toBe(3);
    service.openCase(second);
    expect(progress()[first.slug]).toBe(3);
    expect(progress()[second.slug]).toBe(0);
    service.openCase(first);
    expect(progress()[first.slug]).toBe(0);
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
    expect(service.current()!.balance_minor).toBe(0);
    expect(service.current()).not.toHaveProperty("case_miss_streaks");
  });
  it("не меняет pity при отказе открытия из-за баланса", () => {
    const { service } = setup();
    const before = service.current();
    expect(() => service.openCase(cases[0])).toThrow("Пополните");
    expect(service.current()).toEqual(before);
  });
  it("требует новое подтверждение, если после расчёта продажи добавился предмет", () => {
    const { service } = setup();
    service.adminLogin("admin");
    service.grant("demo-player", skins[0].id);
    const all = { mode: "all" as const, inventory_item_ids: [] };
    const stale = service.quoteSale(all);
    service.grant("demo-player", skins[0].id);
    expect(() => service.sell(stale)).toThrow("Инвентарь изменился");
    expect(service.current()?.inventory).toHaveLength(2);
    service.sell(service.quoteSale(all));
    expect(service.current()?.inventory).toHaveLength(0);
    expect(service.statistics("demo-player").items_sold).toBe(2);
  });
  it("отдельно продаёт две одинаковые копии", () => {
    const { service } = setup();
    approve(service, 100);
    const a = service.openCase(cases[0]),
      b = service.openCase(cases[0]);
    expect(a.skin_id).toBe(b.skin_id);
    expect(a.id).not.toBe(b.id);
    service.sell(service.quoteSale({ mode: "selected", inventory_item_ids: [a.id] }));
    expect(service.current()!.inventory.map((i) => i.id)).toEqual([b.id]);
    expect(() => service.quoteSale({ mode: "selected", inventory_item_ids: [a.id] })).toThrow();
  });
  it("сохраняет прогресс, но не сессию", () => {
    const { service, storage } = setup();
    approve(service, 100);
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
    const { service } = setup();
    service.adminLogin("admin");
    service.grant("demo-player", skins[0].id);
    const inventory_item_ids = [service.current()!.inventory[0].id];
    const result = service.quoteUpgrade({ inventory_item_ids, desired_chance: 35 });
    const differences = skins.filter((skin) => skin.price_minor > skins[0].price_minor)
      .map((skin) => Math.abs(90 * skins[0].price_minor / skin.price_minor - 35));
    expect(Math.abs(result.chance - 35)).toBeCloseTo(Math.min(...differences));
  });
  for (const won of [true, false])
    it(`забирает исходный экземпляр при ${won ? "успехе" : "проигрыше"}`, () => {
      const { service } = setup(() => (won ? 0 : 0.999999));
      service.adminLogin("admin");
      const source = skins.find((s) => s.price_minor === 500)!;
      const target = skins.find((s) => s.price_minor >= 10000)!;
      service.grant("demo-player", source.id);
      const id = service.current()!.inventory[0].id;
      expect(attempt(service, [id], target.id).won).toBe(won);
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
    const { service, ids, source, target } = granted(2);
    expect(service.quoteUpgrade({ inventory_item_ids: ids, target_skin_id: target.id }).chance)
      .toBeCloseTo(90 * 2 * source.price_minor / target.price_minor);
  });
  for (const won of [true, false])
    it(`расходует все 6 экземпляров при ${won ? "успехе" : "неудаче"}, сохраняя седьмой`, () => {
      const { service, ids, target, storage } = granted(7, won),
        selected = ids.slice(0, 6);
      expect(attempt(service, selected, target.id).won).toBe(won);
      const inventory = service.current()!.inventory;
      expect(inventory.some((i) => selected.includes(i.id))).toBe(false);
      expect(inventory.some((i) => i.id === ids[6])).toBe(true);
      expect(inventory.filter((i) => i.skin_id === target.id)).toHaveLength(
        won ? 1 : 0,
      );
      expect(() => attempt(service, selected, target.id).won).toThrow();
      const restored = createDemoService(storage);
      restored.login("player", "player");
      expect(restored.current()!.inventory).toEqual(inventory);
    });
  it("отклоняет пустой выбор, 7 экземпляров и повтор одного ID без списания", () => {
    const { service, ids, target } = granted(7),
      before = service.current();
    for (const invalid of [[], ids, [ids[0], ids[0]]]) {
      expect(() => attempt(service, invalid, target.id)).toThrow();
      expect(service.current()).toEqual(before);
    }
  });
  it("не списывает доступные экземпляры, если один отсутствует или цель не дороже суммы", () => {
    const { service, ids, source } = granted(2),
      before = service.current();
    expect(() => attempt(service, [ids[0], "missing"], source.id)).toThrow(
      "недоступен",
    );
    expect(service.current()).toEqual(before);
    const tooCheap = skins.find((s) => s.price_minor === 1000)!;
    expect(() => attempt(service, ids, tooCheap.id)).toThrow("дороже суммы");
    expect(service.current()).toEqual(before);
  });
  it("использует всю ставку в золотом проигрыше и не выдаёт утешение", () => {
    const source = skins.find((skin) => skin.price_minor > 150000 && skin.price_minor < 250000)!;
    const target = skins.find((skin) => skin.price_minor > 2 * source.price_minor)!;
    const angle = upgradeLanding(90 * 2 * source.price_minor / target.price_minor, false, 0.2);
    const { service } = setup(sequence(0.99, 0.2, 0, ((angle - 1 + 360) % 360) / 360, 0.99));
    service.adminLogin("admin");
    service.grant("demo-player", source.id);
    service.grant("demo-player", source.id);
    const result = attempt(service, service.current()!.inventory.map((item) => item.id), target.id);
    expect(result.won).toBe(false);
    expect(result.consolation).toBeUndefined();
    expect(result.bonus).toMatchObject({ initial_minor: 2 * source.price_minor, final_minor: 2 * source.price_minor });
    expect(result.bonus?.steps.every((step) => !step.won)).toBe(true);
    expect(result.bonus?.rewards.length).toBeLessThanOrEqual(6);
  });
  it("сбрасывает активные настройки к defaults и отклоняет устаревшую версию", () => {
    const { service } = setup();
    expect(() => service.gameSettings()).toThrow();
    service.adminLogin("admin");
    const previous = service.gameSettings();
    const edited = service.saveGameSettings({ ...previous.active, consolation_percent: 25 }, previous.version);
    expect(edited.active.consolation_percent).toBe(25);
    expect(edited.defaults.consolation_percent).toBe(previous.defaults.consolation_percent);
    expect(() => service.resetGameSettings(previous.version)).toThrow();
    const reset = service.resetGameSettings(edited.version);
    expect(reset.active).toEqual(previous.defaults);
    expect(reset.version).not.toBe(edited.version);
  });
  it("разрешает две копии одного скина с разными ID", () => {
    const { service, ids, target } = granted(2);
    expect(attempt(service, ids, target.id).won).toBe(true);
    expect(service.current()!.inventory).toHaveLength(1);
    expect(service.current()!.inventory[0].skin_id).toBe(target.id);
  });
});
