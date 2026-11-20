// CSS angles are clockwise from 12 o'clock; 180° is the bottom of the wheel.
export const UPGRADE_DURATION = 5200;
export const BONUS_SPIN_DURATION = 2100;
export const WHEEL_MARK_STEP = 15;
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
export function wheelMarkIndex(angle: number) {
  const normalized = ((angle % 360) + 360) % 360;
  return Math.floor(normalized / WHEEL_MARK_STEP);
}
export function nextRotation(current: number, landing: number, turns = 5) {
  const normalized = ((current % 360) + 360) % 360;
  return current + turns * 360 + ((landing - normalized + 360) % 360);
}
export function bonusSpinEnd(current: number, chance: number, won: boolean, sample: number) {
  return nextRotation(current, upgradeLanding(chance, won, sample), 2);
}
export function reelStopOffset(index: number, point: number, width = REEL_CARD_WIDTH, gap = REEL_GAP) {
  return index * (width + gap) + point;
}
export function reelLandingPoint(sample: number, width = REEL_CARD_WIDTH) {
  // Never land in a gap or on a card boundary; vary across most of the winner.
  return width * (0.16 + Math.max(0, Math.min(1, sample)) * 0.68);
}

export const WHEEL_WAIT_SPEED = 1; // degrees/ms
export const REEL_WAIT_SPEED = 0.009; // cards/ms

// The second half of cubic-bezier(0.18, 0, 0.12, 1), split at Bézier parameter 0.5
// and rescaled to cover the braking segment from start to stop.
const WHEEL_BRAKE_X1 = 0.1175 / 0.7625;
const WHEEL_BRAKE_X2 = 0.3225 / 0.7625;
export const WHEEL_BRAKE_EASING = `cubic-bezier(${WHEEL_BRAKE_X1}, 0.5, ${WHEEL_BRAKE_X2}, 1)`;

export function wheelStopTiming(distance: number) {
  const brakeStartSlope = 0.5 / WHEEL_BRAKE_X1;
  // The linear segment and the braking segment start at the same degrees/ms.
  const brakeDuration = (UPGRADE_DURATION - distance / WHEEL_WAIT_SPEED) / (1 - 1 / brakeStartSlope);
  const coastDuration = UPGRADE_DURATION - brakeDuration;
  return { coastDuration, brakeDuration, coastDistance: coastDuration * WHEEL_WAIT_SPEED };
}

export function spinHandoffEasing(distance: number, duration: number, speed: number) {
  const initialSlope = speed * duration / distance;
  const firstTime = 1 / 3;
  // Keep the first two control segments at the lead-in slope, then flatten to zero.
  return `cubic-bezier(${firstTime}, ${firstTime * initialSlope}, ${1 / initialSlope}, 1)`;
}
