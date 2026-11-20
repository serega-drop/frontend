import { nearestUpgradeTarget } from "./economy";
import type { Account, DemoDatabase, GameCase, InventoryItem } from "./types";
import { caseGoodDropChance, caseOddsAt, cases, getSkin, skins } from "./catalog";
import { defaultSettings, type AccountView, type GameClient, type GameSettings, type PromoCode, type SaleInput, type SaleQuote, type SettingsView, type Statistics, type TopUpInput, type TopUpRequest, type UpgradeInput, type UpgradeQuote, type UpgradeResult } from "./client";
import { MAX_UPGRADE_ITEMS, upgradeLanding } from "./animation";
const KEY = "serega-drop:demo:v1";
export const freshDatabase = (): DemoDatabase => ({
  version: 1,
  accounts: [
    {
      id: "demo-player",
      username: "player",
      name: "Серёга",
      password: "player",
      active: true,
      session_version: 1,
      balance_minor: 0,
      inventory: [],
      deposits: [],
      case_miss_streaks: {},
    },
  ],
});
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function createDemoService(
  storage: StoragePort,
  random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
  sessions?: StoragePort,
) {
  let db: DemoDatabase & {
    requests?: TopUpRequest[];
    promos?: PromoCode[];
    statistics?: Record<string, Statistics>;
    boosts?: Record<string, number>;
    settings?: SettingsView;
  };
  try {
    const raw = storage.getItem(KEY);
    db = raw ? JSON.parse(raw) : freshDatabase();
    if (db.version !== 1 || !Array.isArray(db.accounts)) throw Error();
  } catch {
    db = freshDatabase();
  }
  for (const account of db.accounts) account.case_miss_streaks ??= {};
  type PlayerSession = { id: string; version: number };
  const playerSessionKey = "serega-drop:demo:player-session";
  const adminSessionKey = "serega-drop:demo:admin-session";
  let playerSession: PlayerSession | null = null;
  try {
    playerSession = JSON.parse(sessions?.getItem(playerSessionKey) ?? "null") as PlayerSession | null;
  } catch {
    // A corrupt preview session can be replaced by a normal sign-in.
  }
  let adminSession = sessions?.getItem(adminSessionKey) === "true";
  function setPlayerSession(session: PlayerSession | null) {
    playerSession = session;
    sessions?.setItem(playerSessionKey, JSON.stringify(session));
  }
  function setAdminSession(session: boolean) {
    adminSession = session;
    sessions?.setItem(adminSessionKey, String(session));
  }
  function view(a: Account): AccountView {
    return {
      id: a.id, username: a.username, name: a.name, active: a.active,
      balance_minor: a.balance_minor, inventory: structuredClone(a.inventory),
    };
  }
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const save = () => {
    storage.setItem(KEY, JSON.stringify(db));
    emit();
  };
  const change = <T>(fn: () => T): T => {
    const previous = structuredClone(db);
    try {
      const result = fn();
      save();
      return result;
    } catch (error) {
      db = previous;
      throw error;
    }
  };
  const account = (id: string) => {
    const a = db.accounts.find((a) => a.id === id);
    if (!a) throw Error("Игрок не найден");
    return a;
  };
  const player = () => {
    if (!playerSession) throw Error("Войдите в аккаунт");
    const a = account(playerSession.id);
    if (!a.active || a.session_version !== playerSession.version) {
      setPlayerSession(null);
      emit();
      throw Error("Сессия завершена. Войдите снова");
    }
    return a;
  };
  const admin = () => {
    if (!adminSession) throw Error("Войдите в админку");
  };
  const item = (skin_id: string): InventoryItem => ({
    id: crypto.randomUUID(),
    skin_id,
    created_at: new Date().toISOString(),
  });
  const skin = (id: string) => {
    return getSkin(id);
  };
  const emptyStats = (): Statistics => ({
    cases_opened: 0, good_drops: 0, upgrades: 0, successful_upgrades: 0,
    items_sold: 0, sales_minor: 0, requests_pending: 0, requests_approved: 0,
    requests_rejected: 0, credited_minor: 0,
  });
  function statsFor(id: string) {
    const stats = (db.statistics ??= {});
    return (stats[id] ??= emptyStats());
  }
  function allRequests() {
    return [
      ...(db.requests ?? []),
      ...db.accounts.flatMap((a) => a.deposits.map((deposit): TopUpRequest => ({
        ...deposit, account_id: a.id, status: "approved", decided_at: deposit.created_at,
      }))),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  function allPromos() {
    return (db.promos ??= [{
      id: "demo-serega", code: "SEREGA", percent: 20,
      activation_limit: 1000, activations: 0, active: true,
    }]);
  }
  const defaults: GameSettings = {
    ...defaultSettings,
    case_weights: Object.fromEntries(cases.map((c) => [
      c.slug, Object.fromEntries(c.entries.map((entry) => [entry.skin_id, entry.probability])),
    ])),
  };
  const settings = (): SettingsView =>
    db.settings ?? { version: "demo-defaults", active: defaults, defaults };
  function caseView(c: GameCase) {
    const config = settings().active;
    const weights = config.case_weights[c.slug];
    if (!weights) return c;
    const groups = c.entries.map((entry) => {
      const price = skin(entry.skin_id).price_minor;
      const group: "good" | "cheap" | "middle" = price >= c.price_minor ? "good" : price < c.price_minor / 5 ? "cheap" : "middle";
      return { ...entry, group, probability: weights[entry.skin_id] ?? entry.probability };
    });
    const groupTotals = { good: 0, cheap: 0, middle: 0 };
    for (const entry of groups) groupTotals[entry.group] += entry.probability;
    const cheapCount = groups.filter((entry) => entry.group === "cheap").length;
    const desired = {
      good: config.case_good_drop_percent,
      cheap: cheapCount * config.case_cheap_drop_percent,
      middle: 100 - config.case_good_drop_percent - cheapCount * config.case_cheap_drop_percent,
    };
    return {
      ...c,
      entries: groups.map(({ skin_id, group, probability }) => ({
        skin_id,
        probability: groupTotals[group] ? probability * desired[group] / groupTotals[group] : 0,
      })),
    };
  }
  function quoteTopUp({ rubles, promo }: TopUpInput) {
    if (!Number.isSafeInteger(rubles) || rubles < 1 || rubles > 1_000_000)
      throw Error("Введите целую сумму от 1 до 1 000 000 ₽");
    const code = promo.trim().toUpperCase();
    const available = allPromos().find((p) => p.code === code && p.active && p.activations < p.activation_limit);
    if (code && !available) throw Error("Промокод недоступен");
    const base_minor = rubles * 150;
    const bonus_minor = Math.round(base_minor * (available?.percent ?? 0) / 100);
    return { base_minor, bonus_minor, credited_minor: base_minor + bonus_minor, promo: code };
  }
  function quoteSale(input: SaleInput): SaleQuote {
    const a = player();
    const inventory_item_ids = input.mode === "all"
      ? a.inventory.map((i) => i.id)
      : input.inventory_item_ids;
    if (!inventory_item_ids.length || new Set(inventory_item_ids).size !== inventory_item_ids.length)
      throw Error("Выберите предметы для продажи");
    const total_minor = inventory_item_ids.reduce((total, id) => {
      const owned = a.inventory.find((i) => i.id === id);
      if (!owned) throw Error("Инвентарь изменился. Проверьте предметы");
      return total + skin(owned.skin_id).price_minor;
    }, 0);
    return { quote_id: JSON.stringify([input.mode, inventory_item_ids, total_minor]), inventory_item_ids, total_minor };
  }
  function quoteUpgrade(input: UpgradeInput): UpgradeQuote {
    const a = player();
    const ids = input.inventory_item_ids;
    if (!ids.length || ids.length > MAX_UPGRADE_ITEMS || new Set(ids).size !== ids.length)
      throw Error("Выберите от 1 до 6 разных экземпляров");
    const total = ids.reduce((sum, id) => {
      const owned = a.inventory.find((i) => i.id === id);
      if (!owned) throw Error("Исходный предмет больше недоступен");
      return sum + skin(owned.skin_id).price_minor;
    }, 0);
    const config = settings();
    const chanceAt = (price: number) => config.active.upgrade_multiplier * total / price;
    const desired = input.desired_chance ?? config.active.upgrade_multiplier / (input.target_multiplier ?? 2);
    const target = input.target_skin_id
      ? skins.find((candidate) => candidate.id === input.target_skin_id && candidate.price_minor > total)
      : nearestUpgradeTarget(skins, total, config.active.upgrade_multiplier, desired);
    if (!target) throw Error("Выберите цель дороже суммы выбранных предметов");
    return {
      quote_id: JSON.stringify([ids, target.id, total, config.version]),
      target,
      chance: chanceAt(target.price_minor),
    };
  }
  const nearest = (value: number) => skins.reduce((best, candidate) =>
    Math.abs(candidate.price_minor - value) < Math.abs(best.price_minor - value) ? candidate : best,
  );
  function demoBonusRewards(value: number) {
    const single = nearest(value);
    if (Math.abs(single.price_minor - value) <= value * 0.05) return [single];
    // The local preview uses a bounded greedy approximation. The API supplies actual rewards.
    const rewards = [nearest(value / 2)];
    while (rewards.length < 6) {
      const remaining = value - rewards.reduce((sum, reward) => sum + reward.price_minor, 0);
      const next = nearest(remaining);
      if (rewards.length > 1 && Math.abs(remaining - next.price_minor) >= Math.abs(remaining)) break;
      rewards.push(next);
    }
    return rewards;
  }
  function saveSettings(active: GameSettings, version: string) {
    admin();
    if (version !== settings().version) throw Error("Настройки уже изменились. Обновите форму");
    const percentages = [
      active.case_good_drop_percent, active.case_cheap_drop_percent, active.case_pity_step,
      active.case_pity_max, active.upgrade_multiplier, active.gold_sector_percent,
      active.gold_sector_width, active.consolation_percent, ...active.bonus_step_percentages,
    ];
    const budgetsValid = cases.every((c) => {
      const cheap = c.entries.filter((entry) => getSkin(entry.skin_id).price_minor < c.price_minor / 5).length;
      const weights = active.case_weights[c.slug];
      return active.case_good_drop_percent + cheap * active.case_cheap_drop_percent < 100 &&
        (!weights || c.entries.every((entry) => Number.isFinite(weights[entry.skin_id]) && weights[entry.skin_id] > 0));
    });
    if (percentages.some((value) => !Number.isFinite(value) || value < 0 || value > 100) ||
        active.case_good_drop_percent <= 0 || active.case_pity_max < active.case_good_drop_percent ||
        active.upgrade_multiplier <= 0 || !Number.isInteger(active.case_pity_start) || active.case_pity_start < 1 ||
        !Number.isFinite(active.case_boost_threshold) || active.case_boost_threshold <= 0 ||
        active.bonus_step_percentages.length !== 6 || active.bonus_step_percentages.some((p) => p <= 0) ||
        !budgetsValid) throw Error("Проверьте диапазоны вероятностей и веса кейсов");
    return change(() => {
      db.settings = { version: crypto.randomUUID(), active: structuredClone(active), defaults };
      return structuredClone(db.settings);
    });
  }
  return {
    mode: "demo" as const,
    initialize() {},
    cases() { return db.settings ? cases.map(caseView) : cases; },
    skins() { return skins; },
    skin,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    current() {
      if (!playerSession) return null;
      const a = db.accounts.find((a) => a.id === playerSession!.id);
      if (!a || !a.active || a.session_version !== playerSession.version) {
        return null;
      }
      return view(a);
    },
    login(username: string, password: string) {
      const a = db.accounts.find(
        (a) =>
          a.username === username.trim().toLowerCase() &&
          a.password === password &&
          a.active,
      );
      if (!a) throw Error("Неверный логин или пароль");
      setPlayerSession({ id: a.id, version: a.session_version });
      emit();
    },
    logout() {
      setPlayerSession(null);
      emit();
    },
    openCase(c: GameCase) {
      return change(() => {
        const a = player();
        if (a.balance_minor < c.price_minor)
          throw Error("Недостаточно G. Пополните виртуальный баланс");
        const missStreak = a.case_miss_streaks[c.slug] ?? 0;
        const config = settings().active;
        const chance = db.settings
          ? Math.min(config.case_pity_max, config.case_good_drop_percent + Math.max(0, missStreak - config.case_pity_start + 1) * config.case_pity_step)
          : caseGoodDropChance(missStreak);
        let odds = caseOddsAt(caseView(c), chance);
        const boost = db.boosts?.[a.id];
        if (boost !== undefined) {
          const candidates = odds.filter((entry) => skin(entry.skin_id).price_minor >= c.price_minor * config.case_boost_threshold);
          const preferred = new Set((candidates.length ? candidates : [odds.slice().sort((left, right) =>
            skin(right.skin_id).price_minor - skin(left.skin_id).price_minor || left.skin_id.localeCompare(right.skin_id),
          )[0]]).map((entry) => entry.skin_id));
          const preferredTotal = odds.filter((entry) => preferred.has(entry.skin_id)).reduce((sum, entry) => sum + entry.probability, 0);
          if (preferredTotal > 0 && preferredTotal < 100) odds = odds.map((entry) => ({
            ...entry, probability: preferred.has(entry.skin_id)
              ? entry.probability * boost / preferredTotal
              : entry.probability * (100 - boost) / (100 - preferredTotal),
          }));
          delete db.boosts![a.id];
        }
        let roll = random() * 100;
        const entry =
          odds.find((e) => {
            roll -= e.probability;
            return roll < 0;
          }) ?? odds[odds.length - 1];
        const isGoodDrop = skin(entry.skin_id).price_minor >= c.price_minor;
        a.case_miss_streaks[c.slug] = isGoodDrop ? 0 : missStreak + 1;
        const result = item(entry.skin_id);
        a.balance_minor -= c.price_minor;
        a.inventory.unshift(result);
        const stats = statsFor(a.id);
        stats.cases_opened++;
        if (isGoodDrop) stats.good_drops++;
        return result;
      });
    },
    quoteSale,
    sell(quote: SaleQuote) {
      return change(() => {
        const a = player();
        const [mode] = JSON.parse(quote.quote_id) as [SaleInput["mode"]];
        const updated = quoteSale({ mode, inventory_item_ids: quote.inventory_item_ids });
        if (updated.quote_id !== quote.quote_id) throw Error("Инвентарь изменился. Проверьте продажу снова");
        const sold = new Set(quote.inventory_item_ids);
        a.inventory = a.inventory.filter((owned) => !sold.has(owned.id));
        a.balance_minor += updated.total_minor;
        const stats = statsFor(a.id);
        stats.items_sold += sold.size;
        stats.sales_minor += updated.total_minor;
      });
    },
    quoteUpgrade,
    upgrade(input: UpgradeInput, quote: UpgradeQuote): UpgradeResult {
      return change(() => {
        const a = player();
        const next = quoteUpgrade({ inventory_item_ids: input.inventory_item_ids, target_skin_id: quote.target.id });
        if (next.quote_id !== quote.quote_id) throw Error("Условия изменились. Запросите новый расчёт");
        const config = settings().active;
        const ids = new Set(input.inventory_item_ids);
        const staked = a.inventory.filter((owned) => ids.has(owned.id));
        const total = staked.reduce((sum, owned) => sum + skin(owned.skin_id).price_minor, 0);
        const boosted = db.boosts?.[a.id];
        if (boosted !== undefined) delete db.boosts![a.id];
        const won = random() * 100 < (boosted ?? next.chance);
        const landing_angle = upgradeLanding(next.chance, won, random());
        const gold_sector = random() * 100 < config.gold_sector_percent
          ? { start: random() * 360, width: config.gold_sector_width * 3.6 }
          : undefined;
        const hitGold = gold_sector && (landing_angle - gold_sector.start + 360) % 360 < gold_sector.width;
        const result: UpgradeResult = { operation_id: crypto.randomUUID(), won, chance: next.chance, landing_angle, gold_sector };
        a.inventory = a.inventory.filter((owned) => !ids.has(owned.id));
        if (hitGold) {
          const initial_minor = won ? next.target.price_minor : total;
          let value = initial_minor;
          const steps = config.bonus_step_percentages.map((chance) => {
            const won = random() * 100 < chance;
            if (won) value *= 100 / chance;
            return { chance, won, value_minor: Math.round(value) };
          });
          const rewards = demoBonusRewards(value);
          a.inventory.unshift(...rewards.map((reward) => item(reward.id)));
          result.bonus = { initial_minor, final_minor: Math.round(value), steps, rewards };
        } else if (won) {
          a.inventory.unshift(item(next.target.id));
        } else if (staked.some((owned) => skin(owned.skin_id).price_minor > 150_000)) {
          result.consolation = nearest(total * config.consolation_percent / 100);
          a.inventory.unshift(item(result.consolation.id));
        }
        const stats = statsFor(a.id);
        stats.upgrades++;
        if (won) stats.successful_upgrades++;
        return result;
      });
    },
    quoteTopUp,
    createTopUp(input: TopUpInput) {
      return change(() => {
        const a = player();
        const request: TopUpRequest = {
          ...input, ...quoteTopUp(input), account_id: a.id, status: "pending",
          id: crypto.randomUUID(), created_at: new Date().toISOString(),
        };
        (db.requests ??= []).unshift(request);
        return structuredClone(request);
      });
    },
    requests() {
      const a = player();
      return structuredClone(allRequests().filter((request) => request.account_id === a.id));
    },
    adminRequests(accountId?: string) {
      admin();
      return structuredClone(allRequests().filter((request) => !accountId || request.account_id === accountId));
    },
    decideRequest(id: string, decision: "approve" | "approve_base" | "reject") {
      admin();
      return change(() => {
        const request = db.requests?.find((value) => value.id === id);
        if (!request || request.status !== "pending") throw Error("Заявка уже рассмотрена");
        if (decision === "approve") {
          let approved;
          try { approved = quoteTopUp(request); }
          catch { throw Error("Промокод недоступен. Одобрите базовую сумму или отклоните заявку"); }
          const promo = allPromos().find((p) => p.code === request.promo && p.active);
          if (promo) promo.activations++;
          Object.assign(request, approved);
        }
        if (decision === "approve_base") {
          if (!request.promo || allPromos().some((p) => p.active && p.code === request.promo && p.activations < p.activation_limit))
            throw Error("Базовое одобрение доступно только для заявки с недоступным кодом");
          request.bonus_minor = 0;
          request.credited_minor = request.base_minor;
        }
        request.status = decision === "reject" ? "rejected" : "approved";
        request.decided_at = new Date().toISOString();
        if (request.status === "approved") account(request.account_id).balance_minor += request.credited_minor;
        return structuredClone(request);
      });
    },
    promoCodes() {
      admin();
      return structuredClone(allPromos());
    },
    createPromo(promo: Pick<PromoCode, "code" | "percent" | "activation_limit">) {
      admin();
      return change(() => {
        const code = promo.code.trim().toUpperCase();
        if (!code || allPromos().some((p) => p.code === code)) throw Error("Укажите новый промокод");
        if (!Number.isFinite(promo.percent) || promo.percent <= 0 || !Number.isSafeInteger(promo.activation_limit) || promo.activation_limit < 1)
          throw Error("Укажите положительные бонус и лимит");
        const created = { ...promo, code, id: crypto.randomUUID(), activations: 0, active: true };
        allPromos().push(created);
        return structuredClone(created);
      });
    },
    removePromo(id: string) {
      admin();
      change(() => {
        const promo = allPromos().find((p) => p.id === id);
        if (!promo) throw Error("Промокод не найден");
        promo.active = false;
      });
    },
    boost(id: string, chance: number) {
      admin();
      change(() => {
        account(id);
        if (!Number.isFinite(chance) || chance < 0 || chance > 100) throw Error("Введите шанс от 0 до 100%");
        (db.boosts ??= {})[id] = chance;
      });
    },
    statistics(accountId?: string) {
      admin();
      const stats = emptyStats();
      for (const a of db.accounts.filter((a) => !accountId || accountId === a.id)) {
        const row = db.statistics?.[a.id];
        if (row) for (const key of Object.keys(row) as (keyof Statistics)[]) stats[key] += row[key];
      }
      for (const request of allRequests()) {
        if (accountId && request.account_id !== accountId) continue;
        stats[`requests_${request.status}`]++;
        if (request.status === "approved") stats.credited_minor += request.credited_minor;
      }
      return stats;
    },
    gameSettings() { admin(); return structuredClone(settings()); },
    saveGameSettings: saveSettings,
    resetGameSettings(version: string) { return saveSettings(defaults, version); },
    loadAccount(id: string) { admin(); account(id); },
    isAdmin() {
      return adminSession;
    },
    adminLogin(password: string) {
      if (password !== "admin") throw Error("Неверный пароль");
      setAdminSession(true);
      emit();
    },
    adminLogout() {
      setAdminSession(false);
      emit();
    },
    accounts() {
      admin();
      return db.accounts.map((player) => ({ ...view(player), boost_pending: db.boosts?.[player.id] !== undefined }));
    },
    createAccount(username: string, name: string, password: string) {
      admin();
      return change(() => {
        const login = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,32}$/.test(login))
          throw Error("Логин: 3–32 латинских символа, цифры или _");
        if (db.accounts.some((a) => a.username === login))
          throw Error("Этот логин уже занят");
        if (!name.trim() || password.length < 4)
          throw Error("Укажите имя и пароль от 4 символов");
        const a: Account = {
          id: crypto.randomUUID(),
          username: login,
          name: name.trim(),
          password,
          active: true,
          session_version: 1,
          balance_minor: 0,
          inventory: [],
          deposits: [],
          case_miss_streaks: {},
        };
        db.accounts.push(a);
        return a.id;
      });
    },
    editAccount(
      id: string,
      values: {
        username: string;
        name: string;
        password?: string;
        active: boolean;
      },
    ) {
      admin();
      change(() => {
        const a = account(id);
        const login = values.username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,32}$/.test(login)) throw Error("Некорректный логин");
        if (
          db.accounts.some(
            (other) => other.id !== id && other.username === login,
          )
        )
          throw Error("Этот логин уже занят");
        if (!values.name.trim()) throw Error("Укажите имя");
        if (values.password && values.password.length < 4)
          throw Error("Пароль — от 4 символов");
        if (values.password || a.active !== values.active) a.session_version++;
        a.username = login;
        a.name = values.name.trim();
        a.active = values.active;
        if (values.password) a.password = values.password;
      });
    },
    setBalance(id: string, value: number) {
      admin();
      change(() => {
        if (!Number.isSafeInteger(value) || value < 0)
          throw Error("Введите неотрицательную сумму с точностью до 0,01 G");
        account(id).balance_minor = value;
      });
    },
    grant(id: string, skin_id: string) {
      admin();
      change(() => {
        skin(skin_id);
        account(id).inventory.unshift(item(skin_id));
      });
    },
    revoke(id: string, item_id: string) {
      admin();
      change(() => {
        const a = account(id);
        if (!a.inventory.some((i) => i.id === item_id))
          throw Error("Предмет не найден");
        a.inventory = a.inventory.filter((i) => i.id !== item_id);
      });
    },
  };
}
export function createDemoClient(storage: StoragePort, sessions: StoragePort): GameClient {
  return createDemoService(storage, undefined, sessions);
}
