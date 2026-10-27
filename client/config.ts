import { DEFAULT_CONFIG, type PluginConfig } from "../shared/config";

let current: PluginConfig = DEFAULT_CONFIG;
const listeners = new Set<() => void>();

/** Transformers and the DOM background run outside React; this is their read of the settings. */
export function getConfig(): PluginConfig {
  return current;
}

export function pushConfig(values: PluginConfig) {
  if (values === current) return;
  current = values;
  for (const listener of listeners) listener();
}

export function subscribeConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
