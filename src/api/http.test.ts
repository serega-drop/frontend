import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./http";
import type { GameCase, InventoryItem } from "./types";

const gameCase: GameCase = { slug: "starter", name: "Starter", subtitle: "", price_minor: 100, accent: "", entries: [] };
const item: InventoryItem = { id: "item-1", skin_id: "skin-1", created_at: "2026-11-20T10:00:00Z" };
const profile = { id: "player-1", username: "player", name: "Player", active: true, balance_minor: 500 };
const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("HTTP client", () => {
  it("restores both roles independently and signs out only the player", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const route = new URL(String(input)).pathname;
      const headers = new Headers(init?.headers);
      expect(init?.credentials).toBe("include");
      switch (route) {
        case "/api/v1/auth/refresh": return json({ access_token: "player-token" });
        case "/api/v1/admin/refresh": return json({ access_token: "admin-token" });
        case "/api/v1/me":
          expect(headers.get("Authorization")).toBe("Bearer player-token");
          return json(profile);
        case "/api/v1/inventory": return json({ items: [item], total: 1 });
        case "/api/v1/admin/accounts":
          expect(headers.get("Authorization")).toBe("Bearer admin-token");
          return json({ items: [profile], total: 1 });
        case "/api/v1/auth/logout": return new Response(null, { status: 204 });
        case "/api/v1/skins": return json([]);
        case "/api/v1/cases": return json([gameCase]);
        default: throw Error(route);
      }
    });
    const client = createHttpClient("https://app.example", fetcher);
    await client.initialize();
    expect(client.current()?.inventory).toEqual([item]);
    expect(client.isAdmin()).toBe(true);
    await client.logout();
    expect(client.current()).toBeNull();
    expect(client.accounts()).toHaveLength(1);
    expect(client.isAdmin()).toBe(true);
  });

  it("surfaces a rejected frontend origin during session restoration", async () => {
    const client = createHttpClient("https://app.example", async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/refresh")) {
        return json({ code: "invalid_origin", message: "Недопустимый источник запроса" }, 403);
      }
      return json([]);
    });
    await expect(client.initialize()).rejects.toMatchObject({ status: 403, code: "invalid_origin" });
  });

  it("reuses the case idempotency key after uncertain failure and uses the server result", async () => {
    const keys: (string | null)[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const route = new URL(String(input)).pathname;
      switch (route) {
        case "/api/v1/auth/login": return json({ access_token: "player-token" });
        case "/api/v1/me": return json(profile);
        case "/api/v1/inventory": return json([]);
        case "/api/v1/cases/starter/open": {
          keys.push(new Headers(init?.headers).get("Idempotency-Key"));
          if (keys.length === 1) throw Error("Connection closed after commit");
          return json({ item, balance_minor: 400 });
        }
        default: throw Error(route);
      }
    });
    const client = createHttpClient("https://app.example", fetcher);
    await client.login("player", "password");
    await expect(client.openCase(gameCase)).rejects.toThrow("Connection closed");
    expect(client.current()?.inventory).toEqual([]);
    await expect(client.openCase(gameCase)).resolves.toEqual(item);
    expect(client.current()).toMatchObject({ balance_minor: 400, inventory: [item] });
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    await client.openCase(gameCase);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("refreshes inventory after a stale sell-all quote", async () => {
    let quoteAttempted = false;
    const client = createHttpClient("https://app.example", async (input) => {
      switch (new URL(String(input)).pathname) {
        case "/api/v1/auth/login": return json({ access_token: "player-token" });
        case "/api/v1/me": return json(profile);
        case "/api/v1/inventory": return json(quoteAttempted ? [] : [item]);
        case "/api/v1/inventory/sales":
          quoteAttempted = true;
          return json({ code: "quote_changed", message: "Инвентарь изменился" }, 409);
        default: throw Error(String(input));
      }
    });
    await client.login("player", "password");
    expect(client.current()?.inventory).toEqual([item]);
    await expect(client.sell({ quote_id: "old", total_minor: 100, inventory_item_ids: [item.id] }))
      .rejects.toMatchObject({ status: 409, code: "quote_changed" });
    expect(client.current()?.inventory).toEqual([]);
  });
});
