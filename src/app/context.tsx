import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { LoadingStatus } from "../components/LoadingStatus";
import type { GameClient } from "../api/client";
import { createHttpClient } from "../api/http";

const Context = createContext<{ service: GameClient; revision: number } | null>(null);

async function connect(): Promise<GameClient> {
  const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : undefined);
  let service: GameClient;
  if (base === undefined) {
    const { createDemoClient } = await import("../api/demo");
    service = createDemoClient(localStorage, sessionStorage);
  } else {
    service = createHttpClient(base.trim());
  }
  await service.initialize();
  return service;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<GameClient>();
  const [revision, setRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const connection = useRef<Promise<GameClient> | undefined>(undefined);

  useEffect(() => service?.subscribe(() => setRevision((value) => value + 1)), [service]);
  useEffect(() => {
    let active = true;
    const pending = (connection.current ??= connect());
    pending.then(
      (client) => { if (active) setService(client); },
      (reason: Error) => {
        if (!active) return;
        connection.current = undefined;
        setError(reason.message);
      },
    );
    return () => { active = false; };
  }, [attempt]);

  if (!service) return (
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
  return <Context.Provider value={{ service, revision }}>{children}</Context.Provider>;
}

export function useGame() {
  const context = useContext(Context);
  if (!context) throw Error("GameProvider is missing");
  return context.service;
}
