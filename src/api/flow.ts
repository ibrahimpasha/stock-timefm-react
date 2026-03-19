import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";
import type {
  FlowAlert,
  FlowPick,
  FlowEntry,
  FlowChatMessage,
  TrackedTicker,
} from "../lib/types";

/* ── Queries ──────────────────────────────────────────────── */

export function useFlowAlerts() {
  return useQuery({
    queryKey: ["flow", "alerts"],
    queryFn: async () => {
      const { data } = await apiClient.get<FlowAlert[]>("/flow/alerts");
      return data;
    },
    staleTime: STALE_TIMES.flow,
    refetchInterval: STALE_TIMES.flow,
  });
}

export function useFlowPicks(status: "open" | "closed" = "open") {
  return useQuery({
    queryKey: ["flow", "picks", status],
    queryFn: async () => {
      const { data } = await apiClient.get<FlowPick[]>(
        `/flow/picks?status=${status}`
      );
      return data;
    },
    staleTime: STALE_TIMES.flow,
  });
}

export function useFlowEntries(ticker: string, days: number = 30) {
  return useQuery({
    queryKey: ["flow", "entries", ticker, days],
    queryFn: async () => {
      const { data } = await apiClient.get<FlowEntry[]>(
        `/flow/entries?ticker=${ticker}&days=${days}`
      );
      return data;
    },
    staleTime: STALE_TIMES.flow,
    enabled: !!ticker,
  });
}

export function useTrackedTickers(days: number = 30, min: number = 2) {
  return useQuery({
    queryKey: ["flow", "tickers", days, min],
    queryFn: async () => {
      const { data } = await apiClient.get<TrackedTicker[]>(
        `/flow/tickers?days=${days}&min=${min}`
      );
      return data;
    },
    staleTime: STALE_TIMES.flow,
  });
}

export function useFlowChat() {
  return useQuery({
    queryKey: ["flow", "chat"],
    queryFn: async () => {
      const { data } = await apiClient.get<FlowChatMessage[]>("/flow/chat");
      return data;
    },
    staleTime: STALE_TIMES.flow,
  });
}

/* ── Mutations ────────────────────────────────────────────── */

export function useAnalyzeFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (flowText: string) => {
      const { data } = await apiClient.post("/flow/analyze", {
        text: flowText,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow"] });
    },
  });
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: number) => {
      const { data } = await apiClient.post(`/flow/alerts/dismiss/${alertId}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow", "alerts"] });
    },
  });
}

export function useClosePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pickId: number) => {
      const { data } = await apiClient.post(`/flow/picks/${pickId}/close`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow", "picks"] });
    },
  });
}

export function useSendDiscordAlert() {
  return useMutation({
    mutationFn: async (alertId: number) => {
      const { data } = await apiClient.post("/flow/alerts/send-discord", {
        alert_id: alertId,
      });
      return data;
    },
  });
}

export function useSendChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      const { data } = await apiClient.post("/flow/chat", { message });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow", "chat"] });
    },
  });
}

export function useClearChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete("/flow/chat");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow", "chat"] });
    },
  });
}
