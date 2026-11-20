// Sidebar footer line with the daemon host's CPU and RAM usage, polled from the server every
// configured number of seconds. Being mounted full-time, it also bridges the config store.
import { useRpc, type PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { hostStatsRpc, type HostStats } from "../shared/host-stats";
import { logError } from "./annotations/log";
import { DEFAULT_CONFIG } from "../shared/config";
import { useConfigBridge } from "./config";

function formatPercent(value: number): string {
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

export function HostMonitorItem({ theme }: PluginSidebarItemProps) {
  const settings = useConfigBridge();
  const read = useRpc(hostStatsRpc);
  const [stats, setStats] = useState<HostStats | null>(null);

  const values = settings.status === "ready" ? settings.values : DEFAULT_CONFIG;
  const enabled = values.hostMonitorEnabled;
  const intervalMs = values.hostMonitorIntervalSeconds * 1000;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await read({});
        if (!stopped) setStats(next);
      } catch (error) {
        if (!stopped) logError("Failed to read host stats", error);
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [enabled, intervalMs, read]);

  if (!enabled || !stats) return null;
  const color = theme.colors.foregroundMuted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Icon name="Cpu" size={13} color={color} />
        <Text style={{ color, fontSize: 12 }}>{formatPercent(stats.cpuPercent)}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Icon name="MemoryStick" size={13} color={color} />
        <Text style={{ color, fontSize: 12 }}>{formatPercent(stats.memoryPercent)}</Text>
      </View>
    </View>
  );
}
