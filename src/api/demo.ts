import type { Account, DemoDatabase, GameCase, InventoryItem } from "./types";
import { depositQuote, remainingLimit, upgradeChance } from "./economy";
import { caseGoodDropChance, caseOddsAt, skins } from "./catalog";
import { MAX_UPGRADE_ITEMS } from "./animation";
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
) {
  let db: DemoDatabase;
  try {
    const raw = storage.getItem(KEY);
    db = raw ? JSON.parse(raw) : freshDatabase();
    if (db.version !== 1 || !Array.isArray(db.accounts)) throw Error();
  } catch {
    db = freshDatabase();
  }
  for (const account of db.accounts) account.case_miss_streaks ??= {};
  let playerSession: { id: string; version: number } | null = null;
  let adminSession = false;
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
      playerSession = null;
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
    const s = skins.find((s) => s.id === id);
    if (!s) throw Error("Скин не найден");
    return s;
  };
  return {
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
        playerSession = null;
        return null;
      }
      return structuredClone(a);
    },
    login(username: string, password: string) {
      const a = db.accounts.find(
        (a) =>
          a.username === username.trim().toLowerCase() &&
          a.password === password &&
          a.active,
      );
      if (!a) throw Error("Неверный логин или пароль");
      playerSession = { id: a.id, version: a.session_version };
      emit();
    },
    logout() {
      playerSession = null;
      emit();
    },
    deposit(rubles: number, method: string, promo: string) {
      return change(() => {
        const a = player();
        const q = depositQuote(rubles, promo);
        if (q.credited_minor > remainingLimit(a))
          throw Error("Недостаточно средств (превышен дневной лимит 10 000 G)");
        const d = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          rubles,
          method,
          ...q,
        };
        a.deposits.unshift(d);
        a.balance_minor += q.credited_minor;
        return d;
      });
    },
    openCase(c: GameCase) {
      return change(() => {
        const a = player();
        if (a.balance_minor < c.price_minor)
          throw Error("Недостаточно G. Пополните виртуальный баланс");
        const missStreak = a.case_miss_streaks[c.slug] ?? 0;
        const odds = caseOddsAt(c, caseGoodDropChance(missStreak));
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
        return result;
      });
    },
    sell(id: string) {
      return change(() => {
        const a = player();
        const i = a.inventory.findIndex((i) => i.id === id);
        if (i < 0) throw Error("Предмет уже продан или использован");
        const [owned] = a.inventory.splice(i, 1);
        a.balance_minor += skin(owned.skin_id).price_minor;
      });
    },
    upgrade(ids: string[], target_id: string) {
      return change(() => {
        const a = player();
        if (!ids.length || ids.length > MAX_UPGRADE_ITEMS)
          throw Error("Выберите от 1 до 6 предметов");
        const selected = new Set(ids);
        if (selected.size !== ids.length)
          throw Error("Один экземпляр нельзя выбрать дважды");
        const owned = ids.map((id) => a.inventory.find((i) => i.id === id));
        if (owned.some((i) => !i))
          throw Error("Один из исходных предметов больше недоступен");
        const price_minor = owned.reduce(
          (sum, i) => sum + skin(i!.skin_id).price_minor,
          0,
        );
        const target = skin(target_id);
        const chance = upgradeChance({ price_minor }, target);
        const won = random() * 100 < chance;
        a.inventory = a.inventory.filter((i) => !selected.has(i.id));
        if (won) a.inventory.unshift(item(target_id));
        return won;
      });
    },
    isAdmin() {
      return adminSession;
    },
    adminLogin(password: string) {
      if (password !== "admin") throw Error("Неверный пароль");
      adminSession = true;
      emit();
    },
    adminLogout() {
      adminSession = false;
      emit();
    },
    accounts() {
      admin();
      return structuredClone(db.accounts);
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
export type DemoService = ReturnType<typeof createDemoService>;
