import type {
  AccountView, GameClient, PromoCode, SaleQuote, SettingsView, Statistics,
  TopUpQuote, TopUpRequest, UpgradeQuote, UpgradeResult,
} from "./client";
import type { GameCase, InventoryItem, Skin } from "./types";

type Role = "player" | "admin";
type Page<T> = { items: T[]; total: number };
type Session = { access_token: string };
type Profile = Omit<AccountView, "inventory">;
type Plays = { inventory: InventoryItem[]; balance_minor: number };
type CatalogStorage = Pick<Storage, "getItem" | "setItem">;
type CatalogSnapshot = { skins: Skin[]; cases: GameCase[]; skinsFetchedAt: number };
const SKINS_FRESH_FOR = 5 * 60_000;

function readCatalog(storage: CatalogStorage | undefined, key: string): CatalogSnapshot | undefined {
  try {
    const snapshot = JSON.parse(storage?.getItem(key) ?? "null") as CatalogSnapshot | null;
    if (snapshot && Number.isFinite(snapshot.skinsFetchedAt) &&
        Array.isArray(snapshot.skins) && snapshot.skins.length &&
        snapshot.skins.every((skin) => typeof skin?.id === "string") &&
        Array.isArray(snapshot.cases) && snapshot.cases.length &&
        snapshot.cases.every((gameCase) => gameCase?.entries?.length &&
          gameCase.entries.every((entry) => typeof entry?.skin_id === "string"))) return snapshot;
  } catch {
    // Start with the server catalog if storage is unavailable or corrupt.
  }
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}

export function createHttpClient(base: string, fetcher = fetch, storage?: CatalogStorage): GameClient {
  const url = `${base.replace(/\/$/, "")}/api/v1`;
  const storageKey = `serega-drop:catalog:v1:${url}`;
  const cachedCatalog = readCatalog(storage, storageKey);
  const tokens: Partial<Record<Role, string>> = {};
  const refreshing: Partial<Record<Role, Promise<boolean>>> = {};
  const listeners = new Set<() => void>();
  const generation = { player: 0, admin: 0 };
  const keys = new Map<string, string>();
  let player: AccountView | null = null;
  let players: AccountView[] = [];
  let publicCases = cachedCatalog?.cases ?? [];
  let publicSkins = cachedCatalog?.skins ?? [];
  let skinsById = new Map(publicSkins.map((skin) => [skin.id, skin]));
  let skinsFetchedAt = cachedCatalog?.skinsFetchedAt ?? 0;
  let caseRequest = 0;
  let bootstrap: Promise<void> | undefined;

  const emit = () => listeners.forEach((listener) => listener());
  const prefix = (role: Role) => role === "admin" ? "/admin" : "/auth";
  const clear = (role: Role) => {
    generation[role]++;
    delete tokens[role];
    if (role === "player") player = null;
    else players = [];
    for (const key of keys.keys()) if (key.startsWith(`${role}:`)) keys.delete(key);
    emit();
  };

  async function send<T>(path: string, role?: Role, method = "GET", body?: unknown, key?: string): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    if (role && tokens[role]) headers.set("Authorization", `Bearer ${tokens[role]}`);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (key) headers.set("Idempotency-Key", key);
    const signal = AbortSignal.timeout(60_000);
    const [response, data] = await (async () => {
      const response = await fetcher(url + path, {
        method, headers, credentials: "include", cache: "no-store",
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
      const data = response.status === 204 ? undefined : await response.json().catch((error) => {
        if (signal.aborted) throw error;
        return undefined;
      });
      return [response, data] as const;
    })().catch((error) => {
      if (signal.aborted) throw new Error("Сервер долго отвечает. Попробуйте ещё раз.");
      if (error instanceof TypeError) throw new Error("Не удалось связаться с сервером. Попробуйте ещё раз.");
      throw error;
    });
    if (!response.ok) {
      const message = data?.message ?? data?.detail?.message;
      throw new ApiError(response.status, typeof message === "string" ? message : `Не удалось выполнить запрос (${response.status})`, data?.code ?? data?.detail?.code);
    }
    if (response.status !== 204 && data === undefined)
      throw new Error("API вернул ответ в неизвестном формате");
    return data as T;
  }

  function refresh(role: Role): Promise<boolean> {
    return (refreshing[role] ??= (async () => {
      try {
        const session = await send<Session>(`${prefix(role)}/refresh`, undefined, "POST");
        tokens[role] = session.access_token;
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clear(role);
          return false;
        }
        throw error;
      } finally {
        delete refreshing[role];
      }
    })());
  }

  async function auth<T>(role: Role, path: string, method?: string, body?: unknown, key?: string): Promise<T> {
    const token = tokens[role];
    const version = generation[role];
    try {
      return await send<T>(path, role, method, body, key);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || generation[role] !== version) throw error;
      if ((!tokens[role] || tokens[role] === token) && !await refresh(role)) throw error;
      if (generation[role] !== version) throw error;
      return send<T>(path, role, method, body, key);
    }
  }

  async function mutate<T>(role: Role, path: string, method: string, body?: unknown): Promise<T> {
    const version = generation[role];
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body)));
    if (version !== generation[role]) throw new Error("Сессия изменилась. Повторите действие");
    const bodyHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const signature = `${role}:${version}:${method}:${path}:${bodyHash}`;
    const key = keys.get(signature) ?? crypto.randomUUID();
    keys.set(signature, key);
    try {
      const result = await auth<T>(role, path, method, body, key);
      keys.delete(signature);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) keys.delete(signature);
      throw error;
    }
  }

  async function list<T>(path: string, role?: Role): Promise<T[]> {
    const request = (page: number) => {
      const paged = `${path}${path.includes("?") ? "&" : "?"}page=${page}&page_size=100`;
      return role ? auth<Page<T> | T[]>(role, paged) : send<Page<T> | T[]>(paged);
    };
    const first = await request(1);
    if (Array.isArray(first)) return first;
    if (first.total <= first.items.length) return first.items;
    if (!first.items.length) throw new Error("API вернул пустую страницу каталога");
    const totalPages = Math.ceil(first.total / first.items.length);
    const result = [...first.items];
    for (let page = 2; page <= totalPages; page += 4) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(4, totalPages - page + 1) }, (_, index) => request(page + index)),
      );
      for (const next of batch) result.push(...(Array.isArray(next) ? next : next.items));
    }
    return result;
  }

  async function loadPlayer() {
    const version = generation.player;
    const [profile, inventory] = await Promise.all([
      auth<Profile>("player", "/me"),
      list<InventoryItem>("/inventory", "player"),
    ]);
    if (!tokens.player || version !== generation.player) return;
    player = { ...profile, inventory };
    emit();
  }

  async function loadPlayers() {
    const version = generation.admin;
    const profiles = await list<Profile>("/admin/accounts", "admin");
    if (!tokens.admin || version !== generation.admin) return;
    const previous = new Map(players.map((account) => [account.id, account.inventory]));
    players = profiles.map((profile) => ({ ...profile, inventory: previous.get(profile.id) ?? [] }));
    emit();
  }

  function applyPlay(play: Plays) {
    if (!player) return;
    player = { ...player, balance_minor: play.balance_minor, inventory: play.inventory };
    emit();
  }

  function saveCatalog() {
    if (!storage || !publicSkins.length || !publicCases.length) return;
    try {
      storage.setItem(storageKey, JSON.stringify({
        skins: publicSkins, cases: publicCases, skinsFetchedAt,
      } satisfies CatalogSnapshot));
    } catch {
      // Storage is optional when disabled or full.
    }
  }

  async function loadCases() {
    const request = ++caseRequest;
    const cases = await list<GameCase>("/cases");
    if (request !== caseRequest) return;
    publicCases = cases;
    saveCatalog();
    emit();
  }

  async function loadSkins() {
    if (skinsFetchedAt && Date.now() - skinsFetchedAt < SKINS_FRESH_FOR) return;
    publicSkins = await list<Skin>("/skins");
    skinsById = new Map(publicSkins.map((skin) => [skin.id, skin]));
    skinsFetchedAt = Date.now();
    saveCatalog();
    emit();
  }

  async function initialize() {
    const catalog = Promise.all([loadSkins(), loadCases()]);
    if (cachedCatalog) void catalog.catch(() => {});
    await Promise.all([
      cachedCatalog ? undefined : catalog,
      refresh("player").then((active) => active ? loadPlayer() : undefined),
      refresh("admin").then((active) => active ? loadPlayers() : undefined),
    ]);
  }

  const client: GameClient = {
    mode: "api",
    initialize() {
      return (bootstrap ??= initialize().catch((error) => {
        bootstrap = undefined;
        throw error;
      }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    current: () => player,
    cases: () => publicCases,
    skins: () => publicSkins,
    skin(id) {
      return skinsById.get(id) ?? {
        id, weapon: "", name: "Предмет недоступен", price_minor: 0, rarity: "Common", image: "",
      };
    },
    async login(username, password) {
      const session = await send<Session>("/auth/login", undefined, "POST", { username, password });
      generation.player++;
      tokens.player = session.access_token;
      await loadPlayer();
    },
    async logout() {
      if (refreshing.player) await refreshing.player;
      await send("/auth/logout", "player", "POST");
      clear("player");
    },
    async openCase(gameCase) {
      const version = generation.player;
      const result = await mutate<{ item: InventoryItem; balance_minor: number }>(
        "player", `/cases/${encodeURIComponent(gameCase.slug)}/open`, "POST",
      );
      if (player && version === generation.player) applyPlay({
        balance_minor: result.balance_minor,
        inventory: [result.item, ...player.inventory.filter((item) => item.id !== result.item.id)],
      });
      return result.item;
    },
    async quoteSale(input) {
      try { return await auth<SaleQuote>("player", "/inventory/sales/quote", "POST", input); }
      catch (error) {
        if (error instanceof ApiError && error.status === 409) await loadPlayer().catch(() => {});
        throw error;
      }
    },
    async sell(quote) {
      const version = generation.player;
      const result = await mutate<{ sold_ids: string[]; balance_minor: number }>(
        "player", "/inventory/sales", "POST", { quote_id: quote.quote_id },
      ).catch(async (error) => {
        if (error instanceof ApiError && error.status === 409) await loadPlayer().catch(() => {});
        throw error;
      });
      if (player && version === generation.player) {
        const sold = new Set(result.sold_ids);
        applyPlay({ balance_minor: result.balance_minor, inventory: player.inventory.filter((item) => !sold.has(item.id)) });
      }
    },
    quoteUpgrade: (input) => auth<UpgradeQuote>("player", "/upgrades/quote", "POST", input),
    async upgrade(input, quote) {
      const version = generation.player;
      const result = await mutate<UpgradeResult & { balance_minor: number; awarded_items: InventoryItem[] }>(
        "player", "/upgrades", "POST", {
          inventory_item_ids: input.inventory_item_ids, target_skin_id: quote.target.id, quote_id: quote.quote_id,
        },
      );
      if (player && version === generation.player) {
        const changed = new Set([...input.inventory_item_ids, ...result.awarded_items.map((item) => item.id)]);
        applyPlay({
          balance_minor: result.balance_minor,
          inventory: [...result.awarded_items, ...player.inventory.filter((item) => !changed.has(item.id))],
        });
      }
      return result;
    },
    quoteTopUp: (input) => auth<TopUpQuote>("player", "/wallet/top-up-requests/quote", "POST", input),
    createTopUp: (input) => mutate<TopUpRequest>("player", "/wallet/top-up-requests", "POST", input),
    async requests() {
      // An admin decision may have changed the balance while the player was on another page.
      const current = player;
      const [requests, profile] = await Promise.all([
        list<TopUpRequest>("/wallet/top-up-requests", "player"),
        auth<Profile>("player", "/me"),
      ]);
      if (player === current && player?.id === profile.id) {
        player = { ...player, ...profile };
        emit();
      }
      return requests;
    },
    isAdmin: () => Boolean(tokens.admin),
    async adminLogin(password) {
      const session = await send<Session>("/admin/login", undefined, "POST", { password });
      generation.admin++;
      tokens.admin = session.access_token;
      await loadPlayers();
    },
    async adminLogout() {
      if (refreshing.admin) await refreshing.admin;
      await send("/admin/logout", "admin", "POST");
      clear("admin");
    },
    accounts: () => players,
    async loadAccount(id) {
      const path = `/admin/accounts/${encodeURIComponent(id)}`;
      const [profile, inventory] = await Promise.all([
        auth<Profile>("admin", path),
        list<InventoryItem>(`${path}/inventory`, "admin"),
      ]);
      if (!tokens.admin) return;
      players = players.map((account) => account.id === id ? { ...profile, inventory } : account);
      emit();
    },
    async createAccount(username, name, password) {
      const profile = await mutate<Profile>("admin", "/admin/accounts", "POST", { username, name, password });
      players = [...players.filter((item) => item.id !== profile.id), { ...profile, inventory: [] }];
      emit();
      return profile.id;
    },
    async editAccount(id, values) {
      const profile = await mutate<Profile>("admin", `/admin/accounts/${encodeURIComponent(id)}`, "PATCH", values);
      players = players.map((account) => account.id === id ? { ...account, ...profile } : account);
      emit();
    },
    async setBalance(id, balance_minor) {
      const result = await mutate<{ balance_minor: number }>(
        "admin", `/admin/accounts/${encodeURIComponent(id)}/balance`, "PUT", { balance_minor },
      );
      players = players.map((account) => account.id === id ? { ...account, balance_minor: result.balance_minor } : account);
      emit();
    },
    async grant(id, skin_id) {
      const item = await mutate<InventoryItem>(
        "admin", `/admin/accounts/${encodeURIComponent(id)}/inventory`, "POST", { skin_id },
      );
      players = players.map((account) => account.id === id
        ? { ...account, inventory: [item, ...account.inventory.filter((owned) => owned.id !== item.id)] }
        : account);
      emit();
    },
    async revoke(id, itemId) {
      await mutate<void>("admin", `/admin/accounts/${encodeURIComponent(id)}/inventory/${encodeURIComponent(itemId)}`, "DELETE");
      players = players.map((account) => account.id === id
        ? { ...account, inventory: account.inventory.filter((item) => item.id !== itemId) }
        : account);
      emit();
    },
    adminRequests: (id) => list<TopUpRequest>(
      id ? `/admin/top-up-requests?account_id=${encodeURIComponent(id)}` : "/admin/top-up-requests", "admin",
    ),
    async decideRequest(id, decision) {
      const request = await mutate<TopUpRequest>(
        "admin", `/admin/top-up-requests/${encodeURIComponent(id)}/decision`, "POST", { decision },
      );
      void loadPlayers().catch(() => {});
      return request;
    },
    promoCodes: () => list<PromoCode>("/admin/promo-codes", "admin"),
    createPromo: (promo) => mutate<PromoCode>("admin", "/admin/promo-codes", "POST", promo),
    async removePromo(id) { await mutate("admin", `/admin/promo-codes/${encodeURIComponent(id)}`, "DELETE"); },
    async boost(id, chance) {
      await mutate("admin", `/admin/accounts/${encodeURIComponent(id)}/chance-boost`, "POST", { chance });
      players = players.map((account) => account.id === id ? { ...account, boost_pending: true } : account);
      emit();
    },
    statistics: (id) => auth<Statistics>("admin", id
      ? `/admin/accounts/${encodeURIComponent(id)}/statistics`
      : "/admin/statistics"),
    gameSettings: () => auth<SettingsView>("admin", "/admin/game-settings"),
    async saveGameSettings(active, version) {
      const view = await mutate<SettingsView>("admin", "/admin/game-settings", "PUT", { active, version });
      await loadCases().catch(() => {});
      return view;
    },
    async resetGameSettings(version) {
      const view = await mutate<SettingsView>("admin", "/admin/game-settings/reset", "POST", { version });
      await loadCases().catch(() => {});
      return view;
    },
  };
  return client;
}
