"use client";
import { useEffect } from "react";
/** Keep single-finger scrolling and in-app PDF zoom controls available. */
export function MobileViewport() {
  useEffect(() => {
    const preventPinch = (event: TouchEvent) => {
      if (event.touches.length > 1 && event.cancelable) event.preventDefault();
    };
    const preventGesture = (event: Event) => {
      if (
        window.matchMedia("(any-pointer: coarse)").matches &&
        event.cancelable
      )
        event.preventDefault();
    };
    const options = { passive: false };
    document.addEventListener("touchstart", preventPinch, options);
    document.addEventListener("touchmove", preventPinch, options);
    document.addEventListener("gesturestart", preventGesture, options);
    document.addEventListener("gesturechange", preventGesture, options);
    return () => {
      document.removeEventListener("touchstart", preventPinch);
      document.removeEventListener("touchmove", preventPinch);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
    };
  }, []);
  return null;
}
