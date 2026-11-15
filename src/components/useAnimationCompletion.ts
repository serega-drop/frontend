import { useCallback, useEffect } from "react";
// Animation events own the reveal. A fallback handles interrupted CSS animations.
export function useAnimationCompletion(
  active: boolean,
  duration: number,
  complete: () => void,
) {
  const finish = useCallback(() => complete(), [complete]);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(finish, duration + 200);
    return () => clearTimeout(timer);
  }, [active, duration, finish]);
  return finish;
}
