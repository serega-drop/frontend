import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { LoadingStatus } from "../components/LoadingStatus";
import type { GameClient } from "../api/client";
import { createHttpClient } from "../api/http";

const Context = createContext<{ service: GameClient; revision: number; restoring: boolean } | null>(null);

function browserCatalogStorage() {
  try { return window.localStorage; }
  catch { return undefined; }
}

function connect(): { cached?: GameClient; pending: Promise<GameClient> } {
  const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : undefined);
  if (base === undefined) {
    return {
      pending: import("../api/demo").then(async ({ createDemoClient }) => {
        const service = createDemoClient(localStorage, sessionStorage);
        await service.initialize();
        return service;
      }),
    };
  }
  const service = createHttpClient(base.trim(), fetch, browserCatalogStorage());
  return {
    cached: service.skins().length ? service : undefined,
    pending: Promise.resolve(service.initialize()).then(() => service),
  };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<GameClient>();
  const [revision, setRevision] = useState(0);
  const [restoring, setRestoring] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const connection = useRef<ReturnType<typeof connect> | undefined>(undefined);

  useEffect(() => service?.subscribe(() => setRevision((value) => value + 1)), [service]);
  useEffect(() => {
    let active = true;
    const { cached, pending } = (connection.current ??= connect());
    if (cached) setService(cached);
    pending.then(
      (client) => {
        if (!active) return;
        setService(client);
        setRestoring(false);
      },
      (reason: Error) => {
        if (!active) return;
        connection.current = undefined;
        setError(reason.message);
      },
    );
    return () => { active = false; };
  }, [attempt]);

  if (!service || error) return (
    <main className="section empty-state game-startup">
      {error ? (
        <>
          <p role="alert">Сервис недоступен. {error}</p>
          <button className="primary" onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}>Повторить</button>
        </>
      ) : <LoadingStatus>Подключаемся к серверу и загружаем каталог…</LoadingStatus>}
    </main>
  );
  return <Context.Provider value={{ service, revision, restoring }}>{children}</Context.Provider>;
}

export function useGame() {
  const context = useContext(Context);
  if (!context) throw Error("GameProvider is missing");
  return context.service;
}

export function useGameRestoring() {
  return useContext(Context)?.restoring ?? false;
}
