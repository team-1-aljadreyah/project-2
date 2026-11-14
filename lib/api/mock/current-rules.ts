// The company's rules in force for this request (the manager's advanced settings, lib/api/advanced.ts), taken once
// at the start of every request (and by the seed) so every rule reads the same values. A module of its own, so
// any rule file can read them without a loop of imports.
import { DEFAULT_RULES, rulesOf, type AdvancedRules } from "../advanced";
import type { Db } from "./db";

let rules: AdvancedRules = DEFAULT_RULES;

export function takeRules(db: Db): AdvancedRules {
  rules = rulesOf(db.settings);
  return rules;
}

/** The rules in force for this request. */
export const R = () => rules;
