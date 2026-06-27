import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AppStore {
  /** Currently selected ticker across all pages */
  activeTicker: string;
  setActiveTicker: (ticker: string) => void;

  /** FastAPI backend base URL (proxied through Vite in dev) */
  serverUrl: string;

  /** UI theme — dark only for now */
  theme: "dark";

  /** Discord integration settings */
  discordToken: string;
  setDiscordToken: (token: string) => void;
  discordChannel: string;
  setDiscordChannel: (channel: string) => void;
  webhookUrl: string;
  setWebhookUrl: (url: string) => void;

  /** Personal iFlow watchlist — persisted to localStorage, syncs across tabs. */
  watchlist: string[];
  toggleWatchlist: (ticker: string) => void;
  isWatched: (ticker: string) => boolean;

  /** Per-contract watchlist. Identified by ticker|strike|opt_type|normalized-expiry. */
  watchedContracts: WatchedContract[];
  toggleWatchedContract: (c: Omit<WatchedContract, "addedAt">) => void;
  isContractWatched: (c: Omit<WatchedContract, "addedAt">) => boolean;
}

export interface WatchedContract {
  ticker: string;
  strike: number;
  opt_type: string; // "CALL" or "PUT" (uppercased)
  expiry_norm: string; // canonical "M/D" string (matches normExpiry in iflow/utils.ts)
  addedAt: string; // ISO timestamp
}

function contractKey(c: { ticker: string; strike: number; opt_type: string; expiry_norm: string }): string {
  return `${c.ticker}|${c.strike}|${c.opt_type}|${c.expiry_norm}`;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // No ticker auto-loads on startup — the user picks one from the
      // watchlist or the input. (Not persisted; see partialize below.)
      activeTicker: "",
      setActiveTicker: (ticker: string) =>
        set({ activeTicker: ticker.toUpperCase().trim() }),

      serverUrl: "/api",
      theme: "dark",

      discordToken: "",
      setDiscordToken: (token) => set({ discordToken: token }),
      discordChannel: "",
      setDiscordChannel: (channel) => set({ discordChannel: channel }),
      webhookUrl: "",
      setWebhookUrl: (url) => set({ webhookUrl: url }),

      watchlist: [],
      toggleWatchlist: (ticker: string) => {
        const t = ticker.toUpperCase().trim();
        if (!t) return;
        const list = get().watchlist;
        set({
          watchlist: list.includes(t) ? list.filter((x) => x !== t) : [...list, t],
        });
      },
      isWatched: (ticker: string) =>
        get().watchlist.includes(ticker.toUpperCase().trim()),

      watchedContracts: [],
      toggleWatchedContract: (c) => {
        const norm = {
          ticker: c.ticker.toUpperCase().trim(),
          strike: Number(c.strike),
          opt_type: c.opt_type.toUpperCase().trim(),
          expiry_norm: c.expiry_norm,
        };
        if (!norm.ticker || !norm.opt_type || !norm.expiry_norm || !norm.strike) return;
        const key = contractKey(norm);
        const list = get().watchedContracts;
        const exists = list.some((x) => contractKey(x) === key);
        set({
          watchedContracts: exists
            ? list.filter((x) => contractKey(x) !== key)
            : [...list, { ...norm, addedAt: new Date().toISOString() }],
        });
      },
      isContractWatched: (c) => {
        const norm = {
          ticker: c.ticker.toUpperCase().trim(),
          strike: Number(c.strike),
          opt_type: c.opt_type.toUpperCase().trim(),
          expiry_norm: c.expiry_norm,
        };
        const key = contractKey(norm);
        return get().watchedContracts.some((x) => contractKey(x) === key);
      },
    }),
    {
      name: "stock-timefm-app",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        watchlist: s.watchlist,
        watchedContracts: s.watchedContracts,
      }),
    },
  ),
);
