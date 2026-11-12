"use client";

// Asks before leaving a form that has something typed in and not saved (lib/unsaved.ts):
// - closing or reloading the window: the browser's own question;
// - a link inside the site (the menu, the bottom bar, any link): «لم تحفظ بعد» with stay / leave.
// It listens on the window, before every other click listener, so nothing moves the page first.
import { useEffect, useState } from "react";
import { Button, Dialog } from "@/components/ui";
import { useAppRouter } from "@/lib/app-path";
import { useFmt } from "@/lib/i18n";
import { forgetUnsaved, hasUnsaved } from "@/lib/unsaved";

export function UnsavedGuard() {
  const { tr } = useFmt();
  const router = useAppRouter();
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!hasUnsaved() || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href === window.location.pathname + window.location.search) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setLeaveTo(href);
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, []);
  if (!leaveTo) return null;
  return (
    <Dialog
      open
      onClose={() => setLeaveTo(null)}
      title={tr("لم تحفظ بعد", "Not saved yet")}
      footer={
        <>
          <Button variant="primary" onClick={() => setLeaveTo(null)}>
            {tr("ابقَ وأكمل", "Stay and finish")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const to = leaveTo;
              forgetUnsaved();
              setLeaveTo(null);
              router.push(to);
            }}
          >
            {tr("غادر دون حفظ", "Leave without saving")}
          </Button>
        </>
      }
    >
      <p className="text-sm">{tr("كتبت في هذه الصفحة شيئاً لم يُحفظ. إذا غادرت الآن يضيع ما كتبته.", "You typed something on this page that isn't saved. If you leave now it is lost.")}</p>
    </Dialog>
  );
}
