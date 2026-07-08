type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export function memGet<T>(key: string): T | undefined {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function memSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function memInvalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(prefix + ":")) {
      store.delete(key);
    }
  }
}

export function memClear(): void {
  store.clear();
}

export async function memCached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const hit = memGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  return memSet(key, value, ttlMs);
}
