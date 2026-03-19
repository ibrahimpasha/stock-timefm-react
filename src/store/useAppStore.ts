import { create } from "zustand";
import { DEFAULT_TICKER } from "../lib/constants";

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
}

export const useAppStore = create<AppStore>((set) => ({
  activeTicker: DEFAULT_TICKER,
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
}));
