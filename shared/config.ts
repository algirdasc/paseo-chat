import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const BACKGROUND_PRESETS = [
  "constellation",
  "swell",
  "drift",
  "halo",
  "caustics",
  "contour",
  "ripple",
  "mesh",
  "interference",
  "cascade",
  "fluid",
] as const;
export type BackgroundPresetName = (typeof BACKGROUND_PRESETS)[number];

export const pluginConfig = defineSettings({
  id: "config",
  scope: "host",
  version: 2,
  schema: z.object({
    syntaxHighlight: z.boolean().default(true),
    mergeSteps: z.boolean().default(true),
    backgroundEnabled: z.boolean().default(true),
    backgroundSidesOnly: z.boolean().default(true),
    backgroundPreset: z.enum(BACKGROUND_PRESETS).default("constellation"),
    backgroundSpeed: z.number().min(0).max(5).default(0.5),
    backgroundOpacity: z.number().min(0).max(1).default(0.3),
    backgroundCellSize: z.number().min(6).max(24).default(10),
    backgroundInk: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#8f8d86"),
    /** Max width of chat rows in px; 0 follows Paseo's own content width. */
    chatMaxWidth: z.number().int().min(0).max(2000).default(0),
  }),
  // v2: opacity default moved 0.6 to 0.3; remap only exact old-default values, keep chosen ones.
  migrate: (values) => {
    const v = typeof values === "object" && values !== null ? (values as Record<string, unknown>) : {};
    return { ...v, backgroundOpacity: v.backgroundOpacity === 0.6 ? 0.3 : v.backgroundOpacity };
  },
});
export type PluginConfig = z.output<typeof pluginConfig.schema>;

export const DEFAULT_CONFIG: PluginConfig = pluginConfig.schema.parse({});
