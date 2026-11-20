import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const hostStatsRpc = defineRpc({
  name: "pretty-chat.host.stats",
  input: z.object({}),
  output: z.object({
    cpuPercent: z.number(),
    memoryPercent: z.number(),
  }),
});

export type HostStats = z.output<typeof hostStatsRpc.output>;
