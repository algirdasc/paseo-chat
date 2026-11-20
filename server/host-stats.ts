// CPU, RAM, load, uptime, and network throughput of the daemon host, read on demand. CPU and
// network are deltas between two reads; RAM follows Activity Monitor on macOS (vm_stat: app +
// wired + compressor) and MemAvailable on Linux, so page cache does not read as used. The
// accounting approach is from paseo-kit's host-monitor
// (https://github.com/a31521424/paseo-kit, Apache-2.0), reduced to these figures.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface CpuTimes {
  idle: number;
  total: number;
}

let previous: { times: CpuTimes; percent: number } = { times: readCpuTimes(), percent: 0 };

function readCpuTimes(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  return { idle, total };
}

function readCpuPercent(): number {
  const times = readCpuTimes();
  const totalDelta = times.total - previous.times.total;
  const idleDelta = times.idle - previous.times.idle;
  const percent = totalDelta > 0 ? Math.min(100, Math.max(0, (1 - idleDelta / totalDelta) * 100)) : previous.percent;
  previous = { times, percent };
  return percent;
}

/** Activity Monitor's "Memory Used": anonymous (minus purgeable) + wired + compressor pages. */
async function readMacMemoryPercent(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/vm_stat", [], { timeout: 2000 });
    const pageSize = Number(/page size of (\d+) bytes/.exec(stdout)?.[1]);
    const pages = new Map<string, number>();
    for (const line of stdout.split("\n")) {
      const match = /^"?([^":]+)"?:\s+(\d+)\.?$/.exec(line.trim());
      if (match) pages.set(match[1]!, Number(match[2]));
    }
    const anonymous = pages.get("Anonymous pages");
    const wired = pages.get("Pages wired down");
    const compressor = pages.get("Pages occupied by compressor");
    if (!pageSize || anonymous === undefined || wired === undefined || compressor === undefined) return null;
    const used = (anonymous - (pages.get("Pages purgeable") ?? 0) + wired + compressor) * pageSize;
    return Math.min(100, Math.max(0, (used / os.totalmem()) * 100));
  } catch {
    return null;
  }
}

function readLinuxMemoryPercent(): number | null {
  try {
    const match = /^MemAvailable:\s+(\d+) kB/m.exec(readFileSync("/proc/meminfo", "utf8"));
    if (!match) return null;
    return Math.min(100, Math.max(0, (1 - Number(match[1]) * 1024 / os.totalmem()) * 100));
  } catch {
    return null;
  }
}

async function readMemoryPercent(): Promise<number> {
  const platform = await readPlatformMemoryPercent();
  return platform ?? (1 - os.freemem() / os.totalmem()) * 100;
}

const readPlatformMemoryPercent =
  process.platform === "darwin" ? readMacMemoryPercent : process.platform === "linux" ? readLinuxMemoryPercent : async () => null;

interface NetworkTotals {
  rx: number;
  tx: number;
}

let previousNetwork: { totals: NetworkTotals; at: number; rates: { rxBytesPerSec: number; txBytesPerSec: number } } | null = null;

/** Linux: all interfaces except loopback and the usual virtual ones. */
function readLinuxNetworkTotals(): NetworkTotals | null {
  try {
    const raw = readFileSync("/proc/net/dev", "utf8");
    let rx = 0;
    let tx = 0;
    for (const line of raw.split("\n").slice(2)) {
      const [name, counters] = line.split(":");
      if (!name || !counters) continue;
      const iface = name.trim();
      if (iface === "lo" || /^(veth|docker|br-|virbr)/.test(iface)) continue;
      const fields = counters.trim().split(/\s+/).map(Number);
      rx += fields[0] ?? 0;
      tx += fields[8] ?? 0;
    }
    return { rx, tx };
  } catch {
    return null;
  }
}

/** macOS: netstat -b, one line per interface address; an interface's counters are its largest. */
async function readMacNetworkTotals(): Promise<NetworkTotals | null> {
  try {
    const { stdout } = await execFileAsync("/usr/sbin/netstat", ["-i", "-b", "-n"], { timeout: 2000 });
    const lines = stdout.split("\n");
    const headerIndex = lines.findIndex((line) => line.includes("Ibytes"));
    if (headerIndex < 0) return null;
    const columns = lines[headerIndex]!.trim().split(/\s+/);
    const [iName, iRx, iTx] = [columns.indexOf("Name"), columns.indexOf("Ibytes"), columns.indexOf("Obytes")];
    if (iName < 0 || iRx < 0 || iTx < 0) return null;
    const byInterface = new Map<string, NetworkTotals>();
    for (const line of lines.slice(headerIndex + 1)) {
      const fields = line.trim().split(/\s+/);
      const name = fields[iName];
      if (!name || !/^en\d+$/.test(name) || fields.length <= iTx) continue;
      const [rx, tx] = [Number(fields[iRx]), Number(fields[iTx])];
      if (!Number.isFinite(rx) || !Number.isFinite(tx)) continue;
      const current = byInterface.get(name);
      if (!current || rx > current.rx) byInterface.set(name, { rx, tx });
    }
    let rx = 0;
    let tx = 0;
    for (const totals of byInterface.values()) {
      rx += totals.rx;
      tx += totals.tx;
    }
    return { rx, tx };
  } catch {
    return null;
  }
}

const readNetworkTotals = process.platform === "darwin" ? readMacNetworkTotals : process.platform === "linux" ? async () => readLinuxNetworkTotals() : async () => null;

async function readNetworkRates(): Promise<{ rxBytesPerSec: number; txBytesPerSec: number } | null> {
  const totals = await readNetworkTotals();
  if (!totals) return null;
  const now = Date.now();
  const previous = previousNetwork;
  if (!previous) {
    previousNetwork = { totals, at: now, rates: { rxBytesPerSec: 0, txBytesPerSec: 0 } };
    return null;
  }
  const seconds = (now - previous.at) / 1000;
  const rates =
    seconds > 0.2
      ? {
          rxBytesPerSec: Math.max(0, (totals.rx - previous.totals.rx) / seconds),
          txBytesPerSec: Math.max(0, (totals.tx - previous.totals.tx) / seconds),
        }
      : previous.rates;
  previousNetwork = { totals, at: now, rates };
  return rates;
}

export async function readHostStats(): Promise<{
  cpuPercent: number;
  memoryPercent: number;
  loadAverage: number;
  uptimeSeconds: number;
  network: { rxBytesPerSec: number; txBytesPerSec: number } | null;
}> {
  const [memoryPercent, network] = await Promise.all([readMemoryPercent(), readNetworkRates()]);
  return {
    cpuPercent: readCpuPercent(),
    memoryPercent,
    loadAverage: os.loadavg()[0] ?? 0,
    uptimeSeconds: os.uptime(),
    network,
  };
}
