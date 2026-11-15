import { useState, type ReactNode, type CSSProperties } from "react";
import type { Skin } from "../api/types";
import { Price } from "./Price";
export const rarityColors = {
  Common: "var(--rarity-common)",
  Uncommon: "var(--rarity-uncommon)",
  Rare: "var(--rarity-rare)",
  Epic: "var(--rarity-epic)",
  Legendary: "var(--rarity-legendary)",
  Arcane: "var(--rarity-arcane)",
  Nameless: "var(--rarity-nameless)",
};
export function SkinImage({ skin }: { skin: Skin }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="image-fallback">
      {skin.weapon}
      <span>Изображение недоступно</span>
    </div>
  ) : (
    <img
      src={skin.image}
      alt={`${skin.weapon} ${skin.name}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
export function SkinCard({
  skin,
  selected = false,
  onClick,
  children,
  eyebrow,
}: {
  skin: Skin;
  selected?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  eyebrow?: string;
}) {
  const body = (
    <>
      <div className="skin-card-top">
        <span>{skin.rarity}</span>
        {eyebrow && <span>{eyebrow}</span>}
      </div>
      <div className="skin-image">
        <SkinImage skin={skin} />
      </div>
      <div className="skin-card-bottom">
        <span className="skin-weapon">{skin.weapon}</span>
        <strong title={`${skin.weapon} ${skin.name}`}>{skin.name}</strong>
        <Price value={skin.price_minor} />
      </div>
    </>
  );
  const style = { "--rarity": rarityColors[skin.rarity] } as CSSProperties;
  return (
    <div className={`skin-card ${selected ? "is-selected" : ""}`} style={style}>
      {onClick ? (
        <button
          className="skin-select"
          onClick={onClick}
          aria-pressed={selected}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {children && <div className="skin-actions">{children}</div>}
    </div>
  );
}
