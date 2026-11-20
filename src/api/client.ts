import type { Account, Deposit, GameCase, InventoryItem, Skin } from "./types";

export type AccountView = Omit<Account, "password" | "case_miss_streaks" | "session_version" | "deposits"> & { boost_pending?: boolean };
export type RequestStatus = "pending" | "approved" | "rejected";
export type TopUpInput = Pick<Deposit, "rubles" | "method" | "promo">;
export type TopUpQuote = Pick<Deposit, "base_minor" | "bonus_minor" | "credited_minor" | "promo">;
export interface TopUpRequest extends Deposit {
  account_id: string;
  status: RequestStatus;
  decided_at?: string;
}
export type TopUpDecision = "approve" | "approve_base" | "reject";
export interface PromoCode {
  id: string;
  code: string;
  percent: number;
  activation_limit: number;
  activations: number;
  active: boolean;
}
export interface Statistics {
  cases_opened: number;
  good_drops: number;
  upgrades: number;
  successful_upgrades: number;
  items_sold: number;
  sales_minor: number;
  requests_pending: number;
  requests_approved: number;
  requests_rejected: number;
  credited_minor: number;
}
export interface SaleInput {
  mode: "selected" | "all";
  inventory_item_ids: string[];
}
export interface SaleQuote {
  quote_id: string;
  inventory_item_ids: string[];
  total_minor: number;
}
export interface UpgradeInput {
  inventory_item_ids: string[];
  target_skin_id?: string;
  desired_chance?: number;
  target_multiplier?: number;
}
export interface UpgradeQuote {
  quote_id: string;
  target: Skin;
  chance: number;
}
export interface UpgradeResult {
  operation_id: string;
  won: boolean;
  chance: number;
  landing_angle: number;
  gold_sector?: { start: number; width: number };
  consolation?: Skin;
  bonus?: {
    initial_minor: number;
    final_minor: number;
    steps: { chance: number; won: boolean; value_minor: number }[];
    rewards: Skin[];
  };
}
export interface GameSettings {
  case_good_drop_percent: number;
  case_cheap_drop_percent: number;
  case_pity_start: number;
  case_pity_step: number;
  case_pity_max: number;
  upgrade_multiplier: number;
  gold_sector_percent: number;
  gold_sector_width: number;
  bonus_step_percentages: number[];
  case_boost_threshold: number;
  consolation_percent: number;
  case_weights: Record<string, Record<string, number>>;
}
export interface SettingsView {
  version: string;
  active: GameSettings;
  defaults: GameSettings;
}
export const defaultSettings: GameSettings = {
  case_good_drop_percent: 15,
  case_cheap_drop_percent: 1,
  case_pity_start: 3,
  case_pity_step: 3,
  case_pity_max: 35,
  upgrade_multiplier: 90,
  gold_sector_percent: 12.5,
  gold_sector_width: 6,
  bonus_step_percentages: [75, 50, 100 / 3, 25, 20, 100 / 6],
  case_boost_threshold: 1.5,
  consolation_percent: 15,
  case_weights: {},
};

type Awaitable<T> = T | Promise<T>;
export interface GameClient {
  mode: "demo" | "api";
  initialize(): Awaitable<void>;
  subscribe(listener: () => void): () => void;
  current(): AccountView | null;
  cases(): GameCase[];
  skins(): Skin[];
  skin(id: string): Skin;
  login(username: string, password: string): Awaitable<void>;
  logout(): Awaitable<void>;
  openCase(gameCase: GameCase): Awaitable<InventoryItem>;
  quoteSale(input: SaleInput): Awaitable<SaleQuote>;
  sell(quote: SaleQuote): Awaitable<void>;
  quoteUpgrade(input: UpgradeInput): Awaitable<UpgradeQuote>;
  upgrade(input: UpgradeInput, quote: UpgradeQuote): Awaitable<UpgradeResult>;
  quoteTopUp(input: TopUpInput): Awaitable<TopUpQuote>;
  createTopUp(input: TopUpInput): Awaitable<TopUpRequest>;
  requests(): Awaitable<TopUpRequest[]>;
  isAdmin(): boolean;
  adminLogin(password: string): Awaitable<void>;
  adminLogout(): Awaitable<void>;
  accounts(): AccountView[];
  loadAccount(id: string): Awaitable<void>;
  createAccount(username: string, name: string, password: string): Awaitable<string>;
  editAccount(id: string, values: Pick<AccountView, "name" | "username" | "active"> & { password?: string }): Awaitable<void>;
  setBalance(id: string, amount: number): Awaitable<void>;
  grant(id: string, skinId: string): Awaitable<void>;
  revoke(id: string, itemId: string): Awaitable<void>;
  adminRequests(accountId?: string): Awaitable<TopUpRequest[]>;
  decideRequest(id: string, decision: TopUpDecision): Awaitable<TopUpRequest>;
  promoCodes(): Awaitable<PromoCode[]>;
  createPromo(promo: Pick<PromoCode, "code" | "percent" | "activation_limit">): Awaitable<PromoCode>;
  removePromo(id: string): Awaitable<void>;
  boost(id: string, chance: number): Awaitable<void>;
  statistics(accountId?: string): Awaitable<Statistics>;
  gameSettings(): Awaitable<SettingsView>;
  saveGameSettings(active: GameSettings, version: string): Awaitable<SettingsView>;
  resetGameSettings(version: string): Awaitable<SettingsView>;
}
