import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Joins CSS class names and lets later Tailwind classes win: cn("p-2", isBig && "p-4") -> "p-4"
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
