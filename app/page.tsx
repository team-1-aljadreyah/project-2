"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeOf, useSession } from "@/lib/auth";

// The start address sends each person to their own home page, or to login.
export default function Home() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session === undefined) return;
    router.replace(session ? homeOf(session.user.role) : "/login");
  }, [session, router]);
  return null;
}
