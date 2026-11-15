export type Rarity =
  "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Arcane" | "Nameless";
export interface Skin {
  id: string;
  name: string;
  weapon: string;
  rarity: Rarity;
  price_minor: number;
  image: string;
}
export interface CaseEntry {
  skin_id: string;
  probability: number;
}
export interface GameCase {
  slug: string;
  name: string;
  subtitle: string;
  price_minor: number;
  accent: string;
  entries: CaseEntry[];
}
export interface InventoryItem {
  id: string;
  skin_id: string;
  created_at: string;
}
export interface Deposit {
  id: string;
  created_at: string;
  rubles: number;
  method: string;
  promo: string;
  base_minor: number;
  bonus_minor: number;
  credited_minor: number;
}
export interface Account {
  id: string;
  username: string;
  name: string;
  password: string;
  active: boolean;
  session_version: number;
  balance_minor: number;
  inventory: InventoryItem[];
  deposits: Deposit[];
  case_miss_streaks: Record<string, number>;
}
export interface DemoDatabase {
  version: 1;
  accounts: Account[];
}
