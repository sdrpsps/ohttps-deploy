export function watchCancellation(isCancelled: () => Promise<boolean>, intervalMs = 5_000) {
  const controller = new AbortController();
  let checking: Promise<void> | undefined;
  const check = () => {
    if (controller.signal.aborted) return Promise.resolve();
    if (!checking) checking = isCancelled().then((cancelled) => { if (cancelled) controller.abort(); }).catch(() => undefined).finally(() => { checking = undefined; });
    return checking;
  };
  const timer = setInterval(() => void check(), intervalMs);
  return { signal: controller.signal, check, stop: () => clearInterval(timer) };
}
