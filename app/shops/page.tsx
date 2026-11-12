"use client";

// The old shop owners' page. Their landing page is now the shops' app (/client), so this address,
// kept for old links and shared messages, sends the visitor there.
// On Cloudflare Pages the same redirect is done by the server (public/_redirects) before this page loads.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ShopsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/client");
  }, [router]);
  return null;
}
