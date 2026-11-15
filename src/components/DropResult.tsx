import { Check, X } from "lucide-react";
import { Modal } from "./Modal";
import { SkinImage, rarityColors } from "./SkinCard";
import { Price } from "./Price";
import type { Skin } from "../api/types";
import type { CSSProperties } from "react";
export function DropResult({
  skin,
  won = true,
  kind,
  onClose,
  onInventory,
}: {
  skin: Skin;
  won?: boolean;
  kind: "case" | "upgrade";
  onClose: () => void;
  onInventory?: () => void;
}) {
  return (
    <Modal
      title={
        won
          ? kind === "case"
            ? "Твой дроп"
            : "Апгрейд удался"
          : "Апгрейд не удался"
      }
      onClose={onClose}
    >
      <div
        className={`drop-reveal ${won ? "drop-reveal-won" : "drop-reveal-lost"}`}
        style={{ "--rarity": rarityColors[skin.rarity] } as CSSProperties}
        role="status"
      >
        <span className="result-emblem">
          {won ? <Check size={22} /> : <X size={22} />}
        </span>
        <div className="result-skin-image">
          <SkinImage skin={skin} />
        </div>
        <span className="result-rarity">{skin.rarity}</span>
        <h3>
          {skin.weapon} <strong>{skin.name}</strong>
        </h3>
        <Price value={skin.price_minor} />
        <p>
          {won
            ? "Предмет добавлен в твой инвентарь."
            : "Целевой предмет не получен. Выбранные предметы использованы."}
        </p>
      </div>
      <div className="result-actions">
        {won && onInventory && (
          <button className="secondary" onClick={onInventory}>
            В инвентарь
          </button>
        )}
        <button className="primary" onClick={onClose}>
          {kind === "case" ? "Продолжить" : "К апгрейду"}
        </button>
      </div>
    </Modal>
  );
}
