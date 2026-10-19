export function createLatestRequest() {
  let controller: AbortController | undefined;
  return {
    begin() {
      controller?.abort();
      const next = new AbortController();
      controller = next;
      return {
        signal: next.signal,
        isCurrent: () => controller === next && !next.signal.aborted,
      };
    },
    cancel() {
      controller?.abort();
      controller = undefined;
    },
  };
}
