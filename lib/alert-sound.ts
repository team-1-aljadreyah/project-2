"use client";

// The sound of a new notification: two short notes, made by the browser itself (no sound file to load).
// Each person can turn it off on his own device (the account menu); the choice is kept in the browser.
//
// Browsers don't let a page play sound before the person touched it. So the sound "wakes up" at the first
// touch, click or key press, and a sound that came before that plays then (once), so nothing is missed.
// Two sounds: the notification (two rising notes) and a chat message (a short soft "pop", different on purpose).
import { useEffect, useSyncExternalStore } from "react";

const KEY = "nahrain.sound";
const subs = new Set<() => void>();
let ctx: AudioContext | null = null;
/** A sound that came before the page was touched: it plays at the first touch. */
let pending: Kind | null = null;
type Kind = "alert" | "message";
/** Two sounds in the same second (a shop's first message also makes a notification): one is enough. */
let lastAt = 0;

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
    const go = () => {
      if (pending && ctx?.state === "running") {
        const k = pending;
        pending = null;
        tones(k);
      }
    };
    if (ctx.state === "suspended") void ctx.resume().then(go);
    else go();
  } catch {}
}

/** Wake the sound up at the person's first click or key press on the page. */
export function useWakeSound() {
  useEffect(() => {
    const evs = ["pointerdown", "keydown", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, wake));
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
  return play("alert", force);
}

/** The chat message sound (a new message in the support chat): one soft "pop", shorter than a notification. */
export function playMessage(force = false): boolean {
  return play("message", force);
}

function tones(kind: Kind) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (kind === "alert") {
    note(ctx, 880, t, 0.22);
    note(ctx, 1174.66, t + 0.16, 0.36);
  } else {
    note(ctx, 587.33, t, 0.12);
    note(ctx, 783.99, t + 0.07, 0.2);
  }
}

function play(kind: Kind, force: boolean): boolean {
  if (!force && !readOn()) return false;
  try {
    navigator.vibrate?.(kind === "alert" ? [80, 60, 80] : [40]);
  } catch {}
  if (!ctx || ctx.state !== "running") {
    // Not touched yet: it plays at the first touch (a notification wins over a message).
    if (pending !== "alert") pending = kind;
    return false;
  }
  if (!force && Date.now() - lastAt < 1200) return true;
  lastAt = Date.now();
  tones(kind);
  return true;
}
