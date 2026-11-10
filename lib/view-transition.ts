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
  stopRunning();
  document.documentElement.dataset.vt = "fade";
  const t = start(update);
  t.finished.catch(() => {}).finally(() => done(t));
}

/** The new theme grows as a circle from the point (x, y), the middle of the button that was pressed. */
export function circleSwitch(update: () => void, x: number, y: number) {
  if (!canAnimate()) return update();
  stopRunning();
  document.documentElement.dataset.vt = "circle";
  const t = start(update);
  // The circle must reach the farthest corner of the screen.
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  t.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 450, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    // The browser skips the animation when the tab is in the background or another switch starts:
    // that is fine (the change itself already happened), so it must not show up as an error.
    .catch(() => {});
  t.finished.catch(() => {}).finally(() => done(t));
}

// ---- One animation at a time ----
// Pressing the switch again while its animation is still running used to start a second one on top
// ("Transition was aborted" errors and a flicker). Now the running one jumps to its end first.
let running: ViewTransition | null = null;

function start(update: () => void) {
  const t = document.startViewTransition(() => flushSync(update));
  running = t;
  // Safety net: if the browser never finishes the animation (for example the window is hidden and
  // nothing is drawn), still clean up after a moment so nothing stays half-switched.
  setTimeout(() => done(t), 1200);
  return t;
}

function stopRunning() {
  running?.skipTransition();
  running = null;
}

function done(t: ViewTransition) {
  if (running === t) running = null;
  if (!running) delete document.documentElement.dataset.vt;
}
