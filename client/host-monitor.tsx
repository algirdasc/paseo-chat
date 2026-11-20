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

/** Bytes per second as a compact binary rate: 940, 82K, 1.2M. */
function formatRate(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return String(Math.round(bytesPerSec));
  if (bytesPerSec < 1024 * 1024) return `${Math.round(bytesPerSec / 1024)}K`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)}M`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `${hours}h`;
  return `${Math.floor(seconds / 60)}m`;
}

function Metric({ icon, text, color }: { icon: string; text: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Icon name={icon} size={13} color={color} />
      <Text style={{ color, fontSize: 12 }}>{text}</Text>
    </View>
  );
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
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        columnGap: 12,
        paddingVertical: 2,
        alignSelf: "stretch",
      }}
    >
      <Metric icon="Cpu" text={formatPercent(stats.cpuPercent)} color={color} />
      <Metric icon="MemoryStick" text={formatPercent(stats.memoryPercent)} color={color} />
      <Metric icon="Gauge" text={`${stats.loadAverage.toFixed(1)} · ${formatUptime(stats.uptimeSeconds)}`} color={color} />
      {stats.network ? (
        <Metric
          icon="ArrowDownUp"
          text={`${formatRate(stats.network.rxBytesPerSec)}/${formatRate(stats.network.txBytesPerSec)}`}
          color={color}
        />
      ) : null}
    </View>
  );
}
