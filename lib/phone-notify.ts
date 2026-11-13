"use client";

// Notifications on the phone itself (the system's notifications, with the app's icon), for each person who turns
// them on (the account menu / «حسابي»). Two ways:
// 1) Now, in every version: when a notification or a support message arrives while the app is in the
//    background (another app in front, the screen off with the app open), the page asks the service worker
//    (public/sw.js) to show it on the phone.
// 2) With the real backend: the phone also subscribes to Web Push (when NEXT_PUBLIC_VAPID_KEY is set) and the
//    subscription goes to the server, which sends each new notification to it — so they come with the app
//    closed too (docs/backend.md).
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";

const KEY = "nahrain.phone-notify";
const subs = new Set<() => void>();
const VAPID = process.env.NEXT_PUBLIC_VAPID_KEY ?? "";

export const phoneNotifySupported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

/** "on" (turned on and allowed), "off", "blocked" (the browser refuses: allowed in its settings), "unsupported". */
export type PhoneNotifyState = "on" | "off" | "blocked" | "unsupported";
function read(): PhoneNotifyState {
  if (!phoneNotifySupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    return localStorage.getItem(KEY) === "on" && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "off";
  }
}
export function usePhoneNotify(): PhoneNotifyState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    read,
    () => "off",
  );
}

function register() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** Turn them on (asks the phone's permission) or off. Returns the state after. */
export async function setPhoneNotify(on: boolean): Promise<PhoneNotifyState> {
  if (!phoneNotifySupported()) return "unsupported";
  try {
    if (on) {
      const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (p !== "granted") {
        subs.forEach((f) => f());
        return read();
      }
      localStorage.setItem(KEY, "on");
      const reg = await register();
      // With the real backend: this phone's push address goes to the server.
      if (VAPID && "PushManager" in window) {
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) as BufferSource }));
        await api.savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }).catch(() => {});
      }
      // A first one, so the person sees what they look like.
      await notifyPhone({ title: "النهرين", body: "ستصلك الإشعارات على هاتفك هكذا.", url: location.pathname, tag: "hello" }, true);
    } else {
      localStorage.setItem(KEY, "off");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await api.deletePushSubscription(sub.endpoint).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
    }
  } catch {}
  subs.forEach((f) => f());
  return read();
}

/** Show one on the phone — only when it is on and the app isn't in front (in front, the page's own card shows). */
export async function notifyPhone(n: { title: string; body?: string; url?: string; tag?: string }, always = false) {
  if (read() !== "on") return;
  if (!always && document.visibilityState === "visible") return;
  try {
    const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await register());
    const sw = reg.active ?? (await navigator.serviceWorker.ready).active;
    sw?.postMessage({ type: "show", ...n });
  } catch {}
}

/** The worker is registered again on each visit (to receive the taps), for whoever turned them on. */
export function keepPhoneNotify() {
  if (read() === "on") register().catch(() => {});
}

function b64ToBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
