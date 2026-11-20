// CPU and RAM of the daemon host, read on demand. CPU is the busy-tick delta between two reads;
// RAM follows Activity Monitor on macOS (vm_stat: app + wired + compressor) and MemAvailable on
// Linux, so page cache does not read as used. The accounting approach is from paseo-kit's
// host-monitor (https://github.com/a31521424/paseo-kit, Apache-2.0), reduced to these two figures.
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

export async function readHostStats(): Promise<{ cpuPercent: number; memoryPercent: number }> {
  return { cpuPercent: readCpuPercent(), memoryPercent: await readMemoryPercent() };
}
