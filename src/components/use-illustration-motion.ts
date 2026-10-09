"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
function subscribe(listener: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
export function useIllustrationMotion(playing: boolean, speed: number) {
  const [progress, setProgress] = useState(0.16);
  const current = useRef(0.16);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      previous = 0,
      lastDraw = 0;
    function tick(now: number) {
      if (previous)
        current.current =
          (current.current + (Math.min(now - previous, 100) * speed) / 3600) %
          1;
      previous = now;
      if (now - lastDraw >= 1000 / 30) {
        setProgress(current.current);
        lastDraw = now;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);
  function seek(value: number) {
    current.current = value;
    setProgress(value);
  }
  return { progress, seek };
}
export function useStentExpansion(expanded: boolean, reduced: boolean) {
  const [value, setValue] = useState(expanded ? 1 : 0);
  const current = useRef(expanded ? 1 : 0);
  useEffect(() => {
    const target = expanded ? 1 : 0,
      from = current.current;
    let frame = 0,
      start = 0;
    function tick(now: number) {
      if (!start) start = now;
      const fraction = reduced ? 1 : Math.min((now - start) / 1400, 1);
      const eased = fraction * fraction * (3 - 2 * fraction);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (fraction < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [expanded, reduced]);
  return value;
}
