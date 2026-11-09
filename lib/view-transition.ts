// Smooth page-wide animations for switching theme and language (same idea as Project 1).
// They use the browser's View Transitions: it takes a picture of the page before the change,
// makes the change, then animates from the old picture to the new page.
import { flushSync } from "react-dom";

function canAnimate() {
  return (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    // People who turned off animations in their phone settings get an instant switch.
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Cross-fade the whole page (used for the language switch). */
export function fadeSwitch(update: () => void) {
  if (!canAnimate()) return update();
  document.documentElement.dataset.vt = "fade";
  const t = document.startViewTransition(() => flushSync(update));
  t.finished.finally(() => delete document.documentElement.dataset.vt);
}

/** The new theme grows as a circle from the point (x, y), the middle of the button that was pressed. */
export function circleSwitch(update: () => void, x: number, y: number) {
  if (!canAnimate()) return update();
  document.documentElement.dataset.vt = "circle";
  const t = document.startViewTransition(() => flushSync(update));
  // The circle must reach the farthest corner of the screen.
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 550, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
  t.finished.finally(() => delete document.documentElement.dataset.vt);
}
