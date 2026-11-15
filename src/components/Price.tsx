import { money } from "../api/economy";
export function Price({ value }: { value: number }) {
  return (
    <span className="price">
      {money(value)} <span className="gold-unit">G</span>
    </span>
  );
}
