import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const pluginConfig = defineSettings({
  id: "config",
  scope: "host",
  version: 4,
  schema: z.object({
    syntaxHighlight: z.boolean().default(true),
    mergeSteps: z.boolean().default(true),
    /** Max width of chat rows in px; 0 follows Paseo's own content width. */
    chatMaxWidth: z.number().int().min(0).max(2000).default(0),
    /** CPU/RAM line in the sidebar footer. */
    hostMonitorEnabled: z.boolean().default(true),
    /** Seconds between host usage reads. */
    hostMonitorIntervalSeconds: z.number().int().min(1).max(300).default(5),
  }),
  // v3: the ASCII background feature was removed; drop its settings.
  // v4: host monitor keys added; defaults fill them in.
  migrate: (values) => {
    const v = typeof values === "object" && values !== null ? { ...(values as Record<string, unknown>) } : {};
    for (const key of Object.keys(v)) if (key.startsWith("background")) delete v[key];
    return v;
  },
});
export type PluginConfig = z.output<typeof pluginConfig.schema>;

export const DEFAULT_CONFIG: PluginConfig = pluginConfig.schema.parse({});
