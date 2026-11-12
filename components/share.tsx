"use client";

// «شارك عبر واتساب»: a ready message (with the link to the page) in one tap. With the shop's phone it opens
// that chat; without one, WhatsApp asks who to send it to. Iraqi numbers 07… become 9647….
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { useFmt } from "@/lib/i18n";

/** wa.me wants the number in international form, digits only. */
export function waPhone(phone?: string) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("964")) return d;
  return d.startsWith("0") ? `964${d.slice(1)}` : d;
}

export function openWhatsApp(text: string, phone?: string) {
  window.open(`https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

/** The page's own address, to put in the message (opens the same page for whoever may see it). */
export const pageLink = (path: string) => (typeof window === "undefined" ? path : `${window.location.origin}${path}`);

export function ShareWhatsApp({ text, phone, label, size }: { text: () => string; phone?: string; label?: string; size?: "sm" }) {
  const { tr } = useFmt();
  return (
    <Button size={size} onClick={() => openWhatsApp(text(), phone)} aria-label={tr("شارك عبر واتساب", "Share on WhatsApp")}>
      <MessageCircle className="size-4 text-[#25d366]" /> {label ?? tr("واتساب", "WhatsApp")}
    </Button>
  );
}
