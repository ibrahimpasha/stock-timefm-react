import { useState, useRef, useEffect } from "react";
import {
  useFlowChat,
  useAnalyzeFlow,
  useSendChatMessage,
  useClearChat,
} from "../../api/flow";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { MessageCircle, Send, Trash2, Loader2, Bot, User, FileText } from "lucide-react";
import type { FlowChatMessage } from "../../lib/types";

/* ── Single Chat Message ─────────────────────────────────── */

function ChatMessage({ msg }: { msg: FlowChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          isUser ? "rounded-br-sm" : "rounded-bl-sm"
        }`}
        style={{
          background: isUser ? "rgba(88,166,255,0.15)" : "rgba(13,17,23,0.8)",
          border: `1px solid ${isUser ? "rgba(88,166,255,0.3)" : "var(--border)"}`,
        }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {isUser ? (
            <User size={11} className="text-accent-blue" />
          ) : (
            <Bot size={11} className="text-accent-purple" />
          )}
          <span className="text-xs text-text-muted">
            {isUser ? "You" : "Claude"} &middot;{" "}
            {new Date(msg.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    </div>
  );
}

/* ── Main FlowChat ───────────────────────────────────────── */

export function FlowChat() {
  const { data: messages, isLoading } = useFlowChat();
  const analyzeMutation = useAnalyzeFlow();
  const chatMutation = useSendChatMessage();
  const clearMutation = useClearChat();

  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const saveIntelMutation = useMutation({
    mutationFn: (text: string) => apiClient.post("/flow/intel", { text, source: "gemini" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow", "chat"] });
      qc.invalidateQueries({ queryKey: ["owls-synthesis"] });
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSubmitChat = () => {
    if (!input.trim()) return;
    chatMutation.mutate(input.trim());
    setInput("");
  };

  const handleAnalyzeFlow = () => {
    if (!input.trim()) return;
    analyzeMutation.mutate(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitChat();
    }
  };

  const isPending = analyzeMutation.isPending || chatMutation.isPending || saveIntelMutation.isPending;

  return (
    <div className="card flex flex-col" style={{ height: "500px" }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-accent-blue" />
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Flow Chat
          </span>
          {messages && (
            <span className="text-xs font-mono text-text-muted">
              ({messages.length} messages)
            </span>
          )}
        </div>
        <button
          onClick={() => clearMutation.mutate()}
          disabled={clearMutation.isPending || !messages?.length}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors disabled:opacity-30"
        >
          <Trash2 size={11} />
          Clear
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-1">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
              >
                <div className="h-16 w-3/4 rounded-lg bg-text-muted/10" />
              </div>
            ))}
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <Bot size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Paste options flow data below to analyze</p>
            <p className="text-xs mt-1">
              Or ask a question about flow patterns
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <ChatMessage key={idx} msg={msg} />
            ))}
            {isPending && (
              <div className="flex justify-start mb-3">
                <div
                  className="rounded-lg rounded-bl-sm px-3 py-3"
                  style={{
                    background: "rgba(13,17,23,0.8)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-accent-purple" />
                    <span className="text-sm text-text-secondary">
                      Analyzing flow data...
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border pt-3 mt-auto">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste flow data, Gemini research, or ask about options flow..."
            rows={2}
            disabled={isPending}
            className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent-blue transition-colors disabled:opacity-50 font-mono"
          />
          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleSubmitChat}
              disabled={isPending || !input.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 transition-colors disabled:opacity-30"
            >
              <Send size={12} />
              Chat
            </button>
            <button
              onClick={handleAnalyzeFlow}
              disabled={isPending || !input.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-purple/15 text-accent-purple hover:bg-accent-purple/25 transition-colors disabled:opacity-30"
            >
              {analyzeMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Bot size={12} />
              )}
              Analyze
            </button>
            <button
              onClick={() => {
                if (input.trim()) {
                  saveIntelMutation.mutate(input.trim());
                  setInput("");
                }
              }}
              disabled={saveIntelMutation.isPending || !input.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-cyan/15 text-accent-cyan hover:bg-accent-cyan/25 transition-colors disabled:opacity-30"
            >
              {saveIntelMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <FileText size={12} />
              )}
              Save Intel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
