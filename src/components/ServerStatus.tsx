import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../api/client";
import { Wifi, WifiOff } from "lucide-react";

export function ServerStatus() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <div className="w-2 h-2 rounded-full bg-text-muted animate-pulse" />
        <span>Connecting...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-accent-red">
        <WifiOff size={12} />
        <span>Offline</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-accent-green">
      <Wifi size={12} />
      <span>Online</span>
      <span className="text-text-muted">
        ({data.models?.length ?? 0} models)
      </span>
    </div>
  );
}
