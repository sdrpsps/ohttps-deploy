export function startHeartbeat(write: () => Promise<void>, intervalMs = 30_000, onError: (error: unknown) => void = () => undefined) {
  let writing = false;
  const tick = () => {
    if (writing) return;
    writing = true;
    void write().catch(onError).finally(() => { writing = false; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
