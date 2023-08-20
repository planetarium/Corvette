export type Awaitable<T> = T | PromiseLike<T>;

export function createMutex() {
  const queue: bigint[] = [];
  let sourcesMutex = new AbortController();
  sourcesMutex.abort();
  return async function doMutex<T>(fn: () => Awaitable<T>) {
    const ticket = crypto.getRandomValues(new BigUint64Array(1))[0];
    queue.push(ticket);
    do {
      await new Promise<void>((resolve) => {
        sourcesMutex.signal.addEventListener("abort", () => resolve());
        if (sourcesMutex.signal.aborted) resolve();
      });
    } while (queue[0] !== ticket);
    sourcesMutex = new AbortController();
    let result: T;
    try {
      result = await fn();
    } finally {
      queue.shift();
      sourcesMutex.abort();
    }
    return result;
  };
}
