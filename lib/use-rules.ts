"use client";

// The company's rules on the pages (the manager's advanced settings, lib/api/advanced.ts): what they show and
// allow follows the same values the server checks. useRules: signed-in pages (from the lookups). usePublicRules:
// the pages before signing in too (login, sign-up, the shop's maintenance screen), from the public site settings.
import { useMemo } from "react";
import { useApp } from "@/components/shell";
import { DEFAULT_RULES, publicRules, rulesOf, type AdvancedRules, type PublicRules } from "@/lib/api/advanced";
import { userMay, type ActionKey } from "@/lib/api/permissions";
import { useSite } from "@/lib/site";

export function useRules(): AdvancedRules {
  const { lookups } = useApp();
  return useMemo(() => rulesOf(lookups.settings), [lookups.settings]);
}

/** May the signed-in person do this (advanced settings → who may do what, and his own exceptions)? */
export function useMay(): (key: ActionKey) => boolean {
  const { user } = useApp();
  const rules = useRules();
  return (key) => userMay(rules, user, key);
}

export function usePublicRules(): PublicRules {
  const site = useSite();
  return site.live ?? publicRules(DEFAULT_RULES);
}
