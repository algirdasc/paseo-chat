import { useSettings } from "@getpaseo/plugin/client";
import { useEffect } from "react";
import { DEFAULT_CONFIG, pluginConfig, type PluginConfig } from "../shared/config";

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

// There is no always-mounted plugin surface (the sidebar item is gone), so every surface the
// plugin renders — settings screen, timeline rows — pushes the host's settings into the store.
export function useConfigBridge() {
  const settings = useSettings(pluginConfig);
  const values = settings.status === "ready" ? settings.values : null;
  useEffect(() => {
    if (values) pushConfig(values);
  }, [values]);
  return settings;
}
