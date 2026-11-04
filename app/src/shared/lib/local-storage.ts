export const SERVER_ADDR_KEY = "sidekick:server";
export const MIC_PRIMER_KEY = "sidekick:mic-primer";
export const MIC_PERMISSION_DENIED_KEY = "sidekick:mic-permission-denied";
export const THEME_STORAGE_KEY = "sidekick:theme";

export function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
