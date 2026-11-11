"use client";

// The sound of a new notification: two short notes, made by the browser itself (no sound file to load).
// Each person can turn it off on his own device (the account menu); the choice is kept in the browser.
//
// Browsers don't let a page play sound before the person touched it. So the sound "wakes up" at the first
// click or key press, and a notification that comes before that is shown without its sound.
import { useEffect, useSyncExternalStore } from "react";

const KEY = "nahrain.sound";
const subs = new Set<() => void>();
let ctx: AudioContext | null = null;

function readOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  subs.forEach((f) => f());
}

/** Is the notification sound on, on this device? */
export function useSoundOn() {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    readOn,
    () => true,
  );
}

/** Get the sound ready. It only works from inside a click or a key press. */
function wake() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {}
}

/** Wake the sound up at the person's first click or key press on the page. */
export function useWakeSound() {
  useEffect(() => {
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);
}

/** One soft note: it starts at once and fades out. */
function note(c: AudioContext, freq: number, at: number, length: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/**
 * Play the notification sound (two rising notes), and shake the phone a little.
 * `force`: also when the sound is turned off (the "try it" of the switch itself).
 * Returns false when it could not play (turned off, or the page was not touched yet).
 */
export function playAlert(force = false): boolean {
  if (!force && !readOn()) return false;
  try {
    navigator.vibrate?.([80, 60, 80]);
  } catch {}
  if (!ctx || ctx.state !== "running") return false;
  const t = ctx.currentTime;
  note(ctx, 880, t, 0.22);
  note(ctx, 1174.66, t + 0.16, 0.36);
  return true;
}
