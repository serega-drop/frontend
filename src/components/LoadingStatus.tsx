import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export function LoadingStatus({ children }: { children: ReactNode }) {
  return (
    <p className="loading-status" role="status">
      <LoaderCircle size={18} aria-hidden="true" />
      {children}
    </p>
  );
}
