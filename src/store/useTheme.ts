import { create } from "zustand";

/**
 * Light / dark theme. The whole dashboard is driven by CSS custom properties
 * (both the Tailwind `@theme` `--color-*` tokens and the runtime `--*` vars in
 * src/index.css), so flipping a single `data-theme` attribute on <html> swaps
 * every surface, border, text colour and accent at once.
 *
 * The initial value is set by a tiny inline script in index.html (so there's no
 * dark-flash before React mounts); this store reads it back and owns toggling
 * from there, persisting the raw choice under the same `stf-theme` key.
 */
export type Theme = "dark" | "light";

const KEY = "stf-theme";

function apply(t: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", t);
  }
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode / storage disabled — non-fatal, theme just won't persist */
  }
}

function initial(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  }
  return "dark";
}

interface ThemeStore {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeStore>((set, get) => ({
  theme: initial(),
  setTheme: (t) => {
    apply(t);
    set({ theme: t });
  },
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    apply(next);
    set({ theme: next });
  },
}));
