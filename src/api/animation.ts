// CSS angles are clockwise from 12 o'clock; 180° is the bottom of the wheel.
export const UPGRADE_DURATION = 5200;
export const CASE_DURATION = 6000;
export const REEL_CARD_WIDTH = 168;
export const REEL_GAP = 8;
export const MAX_UPGRADE_ITEMS = 6;
export const randomUnit = () =>
  crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
export function upgradeArc(chance: number) {
  const sweep = Math.max(0, Math.min(100, chance)) * 3.6;
  return { start: 180 - sweep / 2, end: 180 + sweep / 2, sweep };
}
export function upgradeLanding(chance: number, won: boolean, sample: number) {
  const { start, end, sweep } = upgradeArc(chance);
  // Keep the pointer unambiguously inside the selected sector, including tiny odds.
  const fraction = 0.08 + Math.max(0, Math.min(1, sample)) * 0.84;
  return won
    ? start + sweep * fraction
    : (end + (360 - sweep) * fraction) % 360;
}
export function nextRotation(current: number, landing: number, turns = 5) {
  const normalized = ((current % 360) + 360) % 360;
  return current + turns * 360 + ((landing - normalized + 360) % 360);
}
export function reelStopOffset(index: number, point: number) {
  return index * (REEL_CARD_WIDTH + REEL_GAP) + point;
}
export function reelLandingPoint(sample: number) {
  // Never land in a gap or on a card boundary; vary across most of the winner.
  return REEL_CARD_WIDTH * (0.16 + Math.max(0, Math.min(1, sample)) * 0.68);
}
