import { useState } from "react";
import { Download, Loader2, Eye, EyeOff } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import apiClient from "../../api/client";

export function FetchOwlsPanel() {
  const store = useAppStore();
  const [token, setToken] = useState(store.discordToken || "");
  const [channel, setChannel] = useState(store.discordChannel || "1009169239325802507");
  const [webhook, setWebhook] = useState(store.webhookUrl || "");
  const [showToken, setShowToken] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const runPipeline = async () => {
    if (!token || !channel) return;

    // Save to store
    store.setDiscordToken(token);
    store.setDiscordChannel(channel);
    if (webhook) store.setWebhookUrl(webhook);

    setIsRunning(true);
    setResult(null);

    try {
      const { data } = await apiClient.post("/flow/fetch-owls", {
        token,
        channel_id: channel,
        webhook_url: webhook,
      });
      setResult(
        `Done! ${data.images_downloaded ?? 0} images → ${data.entries_stored ?? 0} entries → ${data.picks_created ?? 0} picks`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Pipeline failed";
      setResult(`Error: ${msg}`);
    } finally {
      setIsRunning(false);
    }
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Token */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">
            Discord Auth Token
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

        {/* Channel ID */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">
            Channel ID
          </label>
          <input
            type="text"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary"
          />
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
          disabled={isRunning || !token || !channel}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue text-bg-primary font-semibold text-sm transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Running pipeline...
            </>
          ) : (
            <>
              <Download size={14} />
              Fetch & Analyze
            </>
          )}
        </button>

        {result && (
          <span
            className={`text-xs ${
              result.startsWith("Error")
                ? "text-accent-red"
                : "text-accent-green"
            }`}
          >
            {result}
          </span>
        )}
      </div>
    </div>
  );
}
