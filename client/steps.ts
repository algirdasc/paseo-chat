// Adapted from github.com/lthieu96/paseo-chat-polish (MIT), reduced to reasoning + tool_call runs.
// A transformer sees one item at a time, so the runs come from each shown agent's own timeline
// (fetched once, then followed live); the transformer looks its item up here: the run's first step
// becomes the merged row, the others are removed from the list (never hidden in place: that crashed
// Paseo's virtual list).

import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

type Item = AgentTimelineItem;
export type Phase = "streaming" | "complete";
interface Entry {
  item: Item;
  at?: number;
}
interface Run {
  steps: Item[];
  ms?: number;
  open: boolean;
}

const toolName = (item: Extract<Item, { type: "tool_call" }>) => item.name.trim().replace(/[.\s-]+/g, "_").toLowerCase();
// What the app turns into its own todo rows; folding the calls too would double them.
const TODO_TOOLS = new Set(["todowrite", "todo_write", "update_plan"]);
// Claude's task tools render nothing natively, so a run must pass over them rather than start one.
const DROPPED_TOOLS = new Set(["taskcreate", "taskupdate", "tasklist"]);
const droppedByApp = (item: Item) => item.type === "tool_call" && DROPPED_TOOLS.has(toolName(item));

export function stepKey(item: Item): string | undefined {
  if (item.type === "tool_call") {
    const name = toolName(item);
    if (item.detail.type === "plan" || TODO_TOOLS.has(name) || DROPPED_TOOLS.has(name) || name === "agent_message") return undefined;
    return `t:${item.callId}`;
  }
  if (item.type !== "reasoning") return undefined;
  const words = item.text.replace(/\s+/g, " ").trim().slice(0, 80);
  return words ? `r:${words}` : undefined;
}

/** Folds a live timeline event into an agent's list the way the daemon's projection does. */
function applyItem(list: Entry[], item: Item, at: number): boolean {
  const last = list.at(-1);
  if (item.type === "tool_call") {
    const index = list.findLastIndex((entry) => entry.item.type === "tool_call" && entry.item.callId === item.callId);
    if (index < 0) return (list.push({ item, at }), true);
    const old = list[index]!.item as typeof item;
    list[index] = { item: { ...old, ...item, detail: item.detail.type === "unknown" ? old.detail : item.detail }, at };
  } else if (item.type === "reasoning" && last?.item.type === "reasoning") {
    list[list.length - 1] = { item: { type: "reasoning", text: last.item.text + item.text }, at };
  } else if (item.type === "assistant_message" && last?.item.type === "assistant_message") {
    last.at = at;
    return false;
  } else list.push({ item, at });
  return true;
}

const timestampMs = (timestamp: string | undefined) => {
  const at = Date.parse(timestamp ?? "");
  return Number.isFinite(at) ? at : undefined;
};

function historyEntries(entries: readonly { item: Item; timestamp: string }[], endedAt?: string): Entry[] {
  let ceiling = timestampMs(endedAt);
  const list: Entry[] = entries.map(({ item, timestamp }) => ({ item, at: timestampMs(timestamp) }));
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i]!;
    if (entry.at === undefined) continue;
    if (ceiling !== undefined && entry.at > ceiling) entry.at = undefined;
    if (entry.item.type === "user_message" && entry.at !== undefined) ceiling = entry.at;
  }
  return list;
}

export function stepRuns(list: readonly Entry[]): Run[] {
  const runs: Run[] = [];
  let run: Item[] = [];
  let start: number | undefined;
  let end: number | undefined;
  let timed = true;
  const close = (open = false) => {
    if (run.length) runs.push({ steps: run, ms: timed && start !== undefined && end !== undefined ? end - start : undefined, open });
    run = [];
    start = end = undefined;
    timed = true;
  };
  for (const [index, { item, at }] of list.entries()) {
    if (droppedByApp(item)) continue;
    if (!stepKey(item)) {
      close();
      continue;
    }
    if (!run.length) {
      start = index ? list[index - 1]!.at : at;
      timed = start !== undefined;
    }
    run.push(item);
    if (at === undefined || (start !== undefined && at < start)) timed = false;
    if (at !== undefined) end = Math.max(end ?? at, at);
  }
  close(true);
  return runs;
}

const PASEO_TOOL = /^(mcp__paseo(_[a-z0-9_]*)?__.|paseo(_[a-z0-9_]*)?\.|paseo_)/;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many).replace("#", String(n));

/** "Thought 2 times, edited 1 file and ran 3 commands", in the words and order of Paseo's own groups. */
export function stepSummary(items: readonly Item[]): string {
  const edited = new Set<string>();
  const read = new Set<string>();
  let thoughts = 0;
  let commands = 0;
  let searches = 0;
  let other = 0;
  let paseo = 0;
  for (const item of items) {
    if (item.type === "reasoning") thoughts++;
    if (item.type !== "tool_call") continue;
    const detail = item.detail;
    if (PASEO_TOOL.test(item.name.trim().toLowerCase())) paseo++;
    else if (detail.type === "edit" || detail.type === "write") edited.add(detail.filePath);
    else if (detail.type === "shell") commands++;
    else if (detail.type === "read") read.add(detail.filePath);
    else if (detail.type === "search") searches++;
    else other++;
  }
  const parts = [
    thoughts && plural(thoughts, "thought # time", "thought # times"),
    edited.size && plural(edited.size, "edited # file", "edited # files"),
    commands && plural(commands, "ran # command", "ran # commands"),
    read.size && plural(read.size, "read # file", "read # files"),
    searches && plural(searches, "searched # time", "searched # times"),
    other && plural(other, "used # other tool", "used # other tools"),
    paseo && plural(paseo, "called Paseo # time", "called Paseo # times"),
  ].filter((part): part is string => !!part);
  const text = parts.length > 2 ? `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}` : parts.join(" and ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The live state: every followed agent's list, and where each step sits.
const lists = new Map<string, Entry[]>();
const keysByAgent = new Map<string, string[]>();
const runs = new Map<string, Run>();
const places = new Map<string, { head: string; index: number }>();
/** The app's own copy of each step (with its phase), newer than the daemon's while it streams. */
const seen = new Map<string, { item: Item; phase: Phase }>();
/** What the transformer last made of each step, to tell when Paseo must transform again. */
const made = new Map<string, "head" | "none">();

// shortcut: seen keeps the latest few thousand steps across agents; key it per agent if long sessions show stale rows.
const SEEN_MAX = 4000;
const HISTORY_MAX = 1000;
const HISTORY_KEEP = 750;

const headListeners = new Map<string, Set<() => void>>();
const versions = new Map<string, number>();
const dirty = new Set<string>();
let flushQueued = false;
let onStale: () => void = () => {};
let onShown: (agentId: string) => void = () => {};

function touch(head: string) {
  dirty.add(head);
  if (flushQueued) return;
  flushQueued = true;
  // Transformers run during Paseo's render; listeners are told afterwards so no component updates mid-render.
  void Promise.resolve().then(() => {
    flushQueued = false;
    for (const head of dirty) {
      if (!headListeners.has(head)) continue;
      versions.set(head, (versions.get(head) ?? 0) + 1);
      headListeners.get(head)?.forEach((listener) => listener());
    }
    dirty.clear();
  });
}

function unplace(agentId: string) {
  for (const key of keysByAgent.get(agentId) ?? []) {
    places.delete(key);
    runs.delete(key);
  }
}

function forget(key: string) {
  seen.delete(key);
  made.delete(key);
  if (!headListeners.has(key)) versions.delete(key);
}

function trimHistory(list: Entry[]) {
  if (list.length <= HISTORY_MAX) return;
  let cut = 0;
  for (let i = 1; i < list.length; i++) {
    if (list[i]!.item.type !== "user_message") continue;
    cut = i;
    if (list.length - i <= HISTORY_KEEP) break;
  }
  if (cut) list.splice(0, cut);
}

function rebuild(agentId: string) {
  const oldKeys = keysByAgent.get(agentId) ?? [];
  const oldRuns = new Map(oldKeys.flatMap((key) => (runs.has(key) ? [[key, runs.get(key)!] as const] : [])));
  unplace(agentId);
  const keys: string[] = [];
  const list = lists.get(agentId) ?? [];
  for (const run of stepRuns(list)) {
    const head = stepKey(run.steps[0]!)!;
    const before = oldRuns.get(head);
    runs.set(head, run);
    if (
      !before ||
      before.ms !== run.ms ||
      before.open !== run.open ||
      before.steps.length !== run.steps.length ||
      before.steps.some((step, index) => step !== run.steps[index])
    ) {
      touch(head);
    }
    run.steps.forEach((item, index) => {
      const key = stepKey(item)!;
      places.set(key, { head, index: key === head ? 0 : index + 1 });
      keys.push(key);
    });
  }
  keysByAgent.set(agentId, keys);
  const retained = new Set(keys);
  let evictedRows = false;
  for (const key of oldKeys) {
    if (retained.has(key)) continue;
    evictedRows ||= made.has(key);
    forget(key);
    if (oldRuns.has(key)) touch(key);
  }
  if (evictedRows || keys.some(stale)) onStale();
}

/** A step the transformer made differently than it would now. */
function stale(key: string) {
  const was = made.get(key);
  return !!was && was !== expected(key);
}

function expected(key: string) {
  return (places.get(key)?.index ?? 0) > 0 ? "none" : "head";
}

// shortcut: any followed agent counts, so a new call of an agent opened next to a busy one waits for its event too (~50ms late, no split).
const GROWING_MS = 60_000;
function runGrowing() {
  const now = Date.now();
  for (const list of lists.values()) {
    const last = list.at(-1);
    if (last && last.at !== undefined && now - last.at < GROWING_MS && stepKey(last.item)) return true;
  }
  return false;
}

/** Called by the transformer for every step: "head" (render the merged row) or "none" (leave it out). */
export function placeStep(item: Item, phase: Phase): { key: string; as: "head" | "none" } | undefined {
  const key = stepKey(item);
  if (!key) return undefined;
  const previous = seen.get(key);
  seen.delete(key);
  seen.set(key, { item, phase });
  if (seen.size > SEEN_MAX) for (const old of [...seen.keys()].slice(0, SEEN_MAX / 4)) forget(old);
  const place = places.get(key);
  const as = !place && item.type === "tool_call" && runGrowing() ? "none" : expected(key);
  const changed = previous?.item !== item || previous.phase !== phase || made.get(key) !== as;
  made.set(key, as);
  if (changed) touch(place?.head ?? key);
  return { key, as };
}

interface TimelinePayload {
  event: { type: string; item?: Item };
  seq?: number;
  timestamp?: string;
}

interface TimelinePage {
  entries: { item: Item; timestamp: string }[];
  endCursor?: { seq?: number } | null;
  agent?: { status: string; updatedAt?: string } | null;
}

/** Keeps an agent's list current: the latest 1000 entries, then live events (those that raced the fetch are replayed past its end). */
export function followAgent(paseo: PluginClientContext["paseo"], agentId: string) {
  const timeline = paseo.agents.ref(agentId).timeline;
  let pending: Array<{ seq?: number; item: Item; at: number }> | undefined;
  let closed = false;
  const load = async () => {
    pending = [];
    try {
      const page = (await timeline.refetch({ direction: "tail", limit: 1000, projection: "projected" })) as unknown as TimelinePage;
      if (closed) return;
      const list = historyEntries(page.entries, page.agent?.status === "idle" ? page.agent.updatedAt : undefined);
      const end = page.endCursor?.seq ?? -1;
      for (const entry of pending) if (entry.seq === undefined || entry.seq > end) applyItem(list, entry.item, entry.at);
      trimHistory(list);
      lists.set(agentId, list);
      rebuild(agentId);
    } catch (error) {
      console.warn("[chat-markdown] Couldn't load the timeline to merge steps", error);
    } finally {
      pending = undefined;
    }
  };
  const subscription = timeline.subscribe((payload: unknown) => {
    const { event } = payload as TimelinePayload;
    if (event.type === "timeline" && event.item) {
      const at = timestampMs((payload as TimelinePayload).timestamp) ?? Date.now();
      if (pending) {
        pending.push({ seq: (payload as TimelinePayload).seq, item: event.item, at });
        return;
      }
      const list = lists.get(agentId);
      if (list && applyItem(list, event.item, at)) {
        trimHistory(list);
        rebuild(agentId);
      }
    } else if (event.type === "replacement" || event.type === "subscription_restored") {
      void load();
    }
  });
  (subscription as unknown as { ready: Promise<unknown> }).ready.then(load, (error: unknown) =>
    console.warn("[chat-markdown] Couldn't follow the timeline to merge steps", error),
  );
  return () => {
    if (closed) return;
    closed = true;
    (subscription as unknown as () => void)();
    for (const key of keysByAgent.get(agentId) ?? []) {
      forget(key);
      if (runs.has(key)) touch(key);
    }
    unplace(agentId);
    keysByAgent.delete(agentId);
    lists.delete(agentId);
  };
}

/** After a fresh transform everything is made again. */
export const resetMade = () => made.clear();
export const onStaleSteps = (fn: () => void) => void (onStale = fn);
/** A merged row rendered for an agent: the only way the plugin learns which timelines to follow. */
export const noteShownAgent = (agentId: string) => onShown(agentId);
export const onShownAgent = (fn: (agentId: string) => void) => void (onShown = fn);

/** A run's steps as the app last saw them and its duration; a single step when the head isn't known (yet). */
export function runOf(head: string): { steps: Array<{ item: Item; phase: Phase }>; ms?: number; open?: boolean } {
  const run = runs.get(head);
  if (!run) {
    const own = seen.get(head);
    return { steps: own ? [own] : [] };
  }
  return { steps: run.steps.map((item) => seen.get(stepKey(item)!) ?? { item, phase: "complete" as const }), ms: run.ms, open: run.open };
}

export function subscribeRun(head: string, listener: () => void) {
  let set = headListeners.get(head);
  if (!set) headListeners.set(head, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (!set.size) {
      headListeners.delete(head);
      versions.delete(head);
    }
  };
}

export const runVersion = (head: string) => versions.get(head) ?? 0;
