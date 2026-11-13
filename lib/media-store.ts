"use client";

// Product videos in the demo. A video is too big for the demo's data (localStorage), so an uploaded file is kept
// in this browser's IndexedDB and the item keeps only "media:<key>". The real backend stores the file and
// gives the item its link (https://…), which plays everywhere; a pasted link works the same way here.
import { useEffect, useState } from "react";

const DB = "nahrain-media";
const STORE = "videos";

function open(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}

export async function putVideo(file: Blob): Promise<string> {
  const key = crypto.randomUUID();
  const db = await open();
  await new Promise<void>((ok, no) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(file, key);
    t.oncomplete = () => ok();
    t.onerror = () => no(t.error);
  });
  return `media:${key}`;
}

async function getVideo(key: string): Promise<Blob | undefined> {
  const db = await open();
  return new Promise((ok, no) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => ok(r.result as Blob | undefined);
    r.onerror = () => no(r.error);
  });
}

/** The address a <video> can play: the link as it is, or the uploaded file (null while looking / not here). */
export function useVideoSrc(video: string | undefined): string | null {
  const [url, setUrl] = useState<{ v: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!video?.startsWith("media:")) return;
    let made: string | null = null;
    let live = true;
    getVideo(video.slice(6))
      .then((b) => {
        made = b ? URL.createObjectURL(b) : null;
        if (live) setUrl({ v: video, url: made });
      })
      .catch(() => live && setUrl({ v: video, url: null }));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [video]);
  if (!video) return null;
  if (!video.startsWith("media:")) return video;
  return url?.v === video ? url.url : null;
}

/** A video's length in seconds (to keep them short), read in the browser. */
export function videoSeconds(file: Blob): Promise<number> {
  return new Promise((ok) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      ok(v.duration);
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => ok(0);
    v.src = URL.createObjectURL(file);
  });
}
