import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const hostStatsRpc = defineRpc({
  name: "pretty-chat.host.stats",
  input: z.object({}),
  output: z.object({
    cpuPercent: z.number(),
    memoryPercent: z.number(),
    /** 1-minute load average. */
    loadAverage: z.number(),
    uptimeSeconds: z.number(),
    /** Down/up bytes per second over real interfaces; null until the second read (and where unsupported). */
    network: z.object({ rxBytesPerSec: z.number(), txBytesPerSec: z.number() }).nullable(),
  }),
});

export type HostStats = z.output<typeof hostStatsRpc.output>;
