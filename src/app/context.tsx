import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createDemoService, type DemoService } from "../api/demo";
const Context = createContext<{
  service: DemoService;
  revision: number;
} | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [service] = useState(() => createDemoService(localStorage));
  const [revision, update] = useState(0);
  useEffect(() => service.subscribe(() => update((v) => v + 1)), [service]);
  return (
    <Context.Provider value={{ service, revision }}>
      {children}
    </Context.Provider>
  );
}
export function useDemo() {
  const service = useContext(Context);
  if (!service) throw Error("DemoProvider is missing");
  return service.service;
}
