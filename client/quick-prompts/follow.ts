// Adapted from paseo-quick-prompts (https://github.com/kingsleydon/paseo-plugins, MIT),
// reduced: no retry loop, a failure logs and the next settings change or reload reads again.
import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { quickPromptsSettings, settingsFromRead } from "../../shared/prompts";
import { logError } from "../annotations/log";
import type { PromptPills } from "./pills";

/** Keeps the pills on the saved prompts: reads now, after a reconnect, and on any client's save. */
export function followPromptSettings(client: PluginClientContext, pills: PromptPills, lifetime: AbortSignal): void {
  const { read } = settingsRpc(quickPromptsSettings.id);
  let latest = 0;
  const load = async (): Promise<void> => {
    const request = ++latest;
    try {
      const result = await client.rpc(read, {});
      if (!lifetime.aborted && request === latest) pills.setSettings(settingsFromRead(result));
    } catch (error) {
      if (!lifetime.aborted) logError("Failed to load quick prompts", error);
    }
  };
  client.paseo
    .observeEvents(["status.plugin_settings_changed"], { signal: lifetime })
    .subscribe({
      snapshot: () => void load(),
      update: (message) => {
        if (
          message.type === "status" &&
          message.payload.status === "plugin_settings_changed" &&
          message.payload.settingsId === quickPromptsSettings.id
        ) {
          void load();
        }
      },
      error: (error) => {
        if (!lifetime.aborted) logError("Quick prompts settings observation failed", error);
      },
    });
}
