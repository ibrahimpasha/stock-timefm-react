import { useState, useEffect } from "react";
import { Download, Loader2, Eye, EyeOff, Hash } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import apiClient from "../../api/client";

const LS_TOKEN_KEY = "owls_discord_token";
const LS_WEBHOOK_KEY = "owls_discord_webhook";

const DEFAULT_CHANNELS = [
  { id: "1344031856211005460", label: "Channel 1" },
  { id: "1009169239325802507", label: "Channel 2" },
];

function loadSaved(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function savePersist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function FetchOwlsPanel() {
  const store = useAppStore();
  const [token, setToken] = useState(
    store.discordToken || loadSaved(LS_TOKEN_KEY)
  );
  const [channels, setChannels] = useState(
    DEFAULT_CHANNELS.map((c) => c.id)
  );
  const [webhook, setWebhook] = useState(
    store.webhookUrl || loadSaved(LS_WEBHOOK_KEY)
  );
  const [showToken, setShowToken] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<
    { channel: string; msg: string; ok: boolean }[]
  >([]);
  const [progress, setProgress] = useState<{
    step: string; detail: string; pct: number; images_done: number; images_total: number;
  } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Persist token to localStorage whenever it changes
  useEffect(() => {
    if (token) {
      savePersist(LS_TOKEN_KEY, token);
      store.setDiscordToken(token);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (webhook) {
      savePersist(LS_WEBHOOK_KEY, webhook);
      store.setWebhookUrl(webhook);
    }
  }, [webhook]); // eslint-disable-line react-hooks/exhaustive-deps

  const runPipeline = async () => {
    const activeChannels = channels.filter((c) => c.trim());
    if (!token || activeChannels.length === 0) return;

    setIsRunning(true);
    setResults([]);
    setProgress(null);

    const newResults: { channel: string; msg: string; ok: boolean }[] = [];

    for (const channelId of activeChannels) {
      // Start polling progress
      const pollId = setInterval(async () => {
        try {
          const { data: p } = await apiClient.get("/flow/fetch-owls/progress");
          if (p.running) setProgress(p);
        } catch { /* ignore */ }
      }, 1500);

      try {
        const { data } = await apiClient.post(
          "/flow/fetch-owls",
          {
            token,
            channel_id: channelId,
            webhook_url: webhook,
          },
          { timeout: 600_000 }
        );
        clearInterval(pollId);
        const errors = data.errors || [];
        if (errors.length > 0 && data.images_downloaded === 0) {
          newResults.push({
            channel: channelId,
            msg: errors[0],
            ok: false,
          });
        } else {
          newResults.push({
            channel: channelId,
            msg: `${data.images_downloaded ?? 0} images → ${data.entries_stored ?? 0} entries → ${data.picks_created ?? 0} picks`,
            ok: true,
          });
        }
      } catch (err: unknown) {
        clearInterval(pollId);
        const msg =
          err instanceof Error ? err.message : "Pipeline failed";
        newResults.push({ channel: channelId, msg, ok: false });
      }
      setResults([...newResults]);
    }

    setProgress(null);
    setIsRunning(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:text-accent-blue hover:border-accent-blue/40 transition-all"
      >
        <Download size={14} />
        Fetch OWLS
      </button>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          OWLS Discord Pipeline
        </h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-xs text-text-muted hover:text-text-secondary"
        >
          Close
        </button>
      </div>

      {/* Token */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">
          Discord Auth Token (saved in browser)
        </label>
        <div className="relative">
          <input
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="From browser F12 → Network → Authorization"
            className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary pr-8"
          />
          <button
            onClick={() => setShowToken(!showToken)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
          >
            {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      </div>

      {/* Channel IDs */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">
          Channel IDs (fetches from all)
        </label>
        <div className="space-y-1.5">
          {channels.map((ch, i) => (
            <div key={i} className="flex items-center gap-2">
              <Hash size={12} className="text-text-muted flex-shrink-0" />
              <input
                type="text"
                value={ch}
                onChange={(e) => {
                  const updated = [...channels];
                  updated[i] = e.target.value;
                  setChannels(updated);
                }}
                placeholder="Channel ID"
                className="flex-1 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary"
              />
              {channels.length > 1 && (
                <button
                  onClick={() =>
                    setChannels(channels.filter((_, j) => j !== i))
                  }
                  className="text-text-muted hover:text-accent-red text-xs"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {channels.length < 5 && (
            <button
              onClick={() => setChannels([...channels, ""])}
              className="text-[10px] text-accent-blue hover:underline"
            >
              + Add channel
            </button>
          )}
        </div>
      </div>

      {/* Webhook */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">
          Discord Webhook URL (for alerts)
        </label>
        <input
          type="text"
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={runPipeline}
          disabled={isRunning || !token || channels.every((c) => !c.trim())}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue text-bg-primary font-semibold text-sm transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Running ({channels.filter((c) => c.trim()).length} channels)...
            </>
          ) : (
            <>
              <Download size={14} />
              Fetch & Analyze ({channels.filter((c) => c.trim()).length})
            </>
          )}
        </button>
      </div>

      {/* Progress bar */}
      {progress && isRunning && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-accent-blue font-semibold">{progress.step}</span>
            <span className="text-text-muted font-mono">{progress.pct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-blue transition-all duration-500"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <div className="text-[10px] text-text-muted">
            {progress.detail}
            {progress.images_total > 0 && (
              <span className="ml-2 font-mono">
                ({progress.images_done}/{progress.images_total} images)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((r, i) => (
            <div
              key={i}
              className={`text-xs px-2 py-1 rounded ${
                r.ok
                  ? "bg-accent-green/10 text-accent-green"
                  : "bg-accent-red/10 text-accent-red"
              }`}
            >
              <span className="font-mono text-text-muted">#{r.channel.slice(-4)}</span>{" "}
              {r.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
