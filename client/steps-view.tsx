import type { PluginTheme } from "@getpaseo/plugin";
import { useAgent, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { highlightShell, syntaxColors, type Span } from "./highlight";
import { noteShownAgent, runOf, runVersion, stepSummary, subscribeRun, type Phase } from "./steps";

const MONOSPACE = Platform.select({ ios: "Menlo", default: "monospace" });

type Item = AgentTimelineItem;

interface StepLabel {
  icon: string;
  verb: string;
  target?: string;
  mono: boolean;
}

const tense = (running: boolean, continuous: string, done: string) => (running ? continuous : done);
const firstLine = (text: string) => text.trim().split("\n")[0]!.trim();
const shortPath = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
};

function describeStep(item: Extract<Item, { type: "tool_call" }>): StepLabel {
  const running = item.status === "running";
  if (item.status === "canceled") return { icon: "CircleSlash", verb: "Canceled", mono: false };
  const detail = item.detail;
  switch (detail.type) {
    case "shell":
      return { icon: "SquareTerminal", verb: tense(running, "Running", "Ran"), target: firstLine(detail.command), mono: true };
    case "read":
      return { icon: "Eye", verb: tense(running, "Reading", "Read"), target: shortPath(detail.filePath), mono: true };
    case "edit":
      return { icon: "Pencil", verb: tense(running, "Editing", "Edited"), target: shortPath(detail.filePath), mono: true };
    case "write":
      return { icon: "FilePlus", verb: tense(running, "Writing", "Wrote"), target: shortPath(detail.filePath), mono: true };
    case "search":
      return { icon: "Search", verb: tense(running, "Searching", "Searched"), target: detail.query, mono: true };
    case "fetch":
      return { icon: "Globe", verb: tense(running, "Fetching", "Fetched"), target: detail.url.replace(/^https?:\/\//, "").split("/")[0], mono: true };
    default:
      return { icon: "Wrench", verb: tense(running, "Using", "Used"), target: item.name, mono: false };
  }
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function StepRow({
  theme,
  icon,
  iconColor,
  verb,
  target,
  targetSpans,
  mono,
  meta,
  metaColor,
  muted,
  open,
  onToggle,
}: {
  theme: PluginTheme;
  icon: string;
  iconColor?: string;
  verb: string;
  target?: string;
  targetSpans?: Span[];
  mono?: boolean;
  meta?: string;
  metaColor?: string;
  muted?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const syntax = syntaxColors(theme.colors.surface0);
  const verbColor = muted ? theme.colors.foregroundMuted : theme.colors.foreground;
  return (
    <Pressable
      accessibilityRole={onToggle ? "button" : undefined}
      disabled={!onToggle}
      onPress={onToggle}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 }}
    >
      <Icon name={icon} size={15} color={iconColor ?? theme.colors.foregroundMuted} />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: verbColor, fontSize: 13 }}>
        {verb}
        {targetSpans ? (
          <Text style={{ fontFamily: MONOSPACE, fontSize: 12, color: theme.colors.foregroundMuted }}>
            {" "}
            {targetSpans.map((span, index) =>
              span.kind ? (
                <Text key={index} style={{ color: syntax[span.kind] }}>
                  {span.text}
                </Text>
              ) : (
                span.text
              ),
            )}
          </Text>
        ) : target ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontFamily: mono ? MONOSPACE : undefined, fontSize: mono ? 12 : 13 }}>
            {" "}
            {target}
          </Text>
        ) : null}
      </Text>
      <View style={{ flex: 1 }} />
      {meta ? <Text style={{ color: metaColor ?? theme.colors.foregroundMuted, fontSize: 12 }}>{meta}</Text> : null}
      {onToggle ? (
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={theme.colors.foregroundMuted} />
      ) : null}
    </Pressable>
  );
}

function ReasoningStep({ step, phase, theme }: { step: Extract<Item, { type: "reasoning" }>; phase: Phase; theme: PluginTheme }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <StepRow
        theme={theme}
        icon="Brain"
        verb={phase === "streaming" ? "Thinking" : "Thought"}
        open={open}
        onToggle={() => setOpen((value) => !value)}
      />
      {open ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18, paddingLeft: 23, paddingBottom: 4 }}>
          {step.text}
        </Text>
      ) : null}
    </View>
  );
}

function StepContent({ step, phase, theme }: { step: Item; phase: Phase; theme: PluginTheme }) {
  if (step.type === "reasoning") {
    return <ReasoningStep step={step} phase={phase} theme={theme} />;
  }
  if (step.type === "tool_call") {
    const label = describeStep(step);
    const failed = step.status === "failed";
    const spans = step.detail.type === "shell" ? highlightShell(firstLine(step.detail.command)) : undefined;
    return (
      <StepRow
        theme={theme}
        icon={label.icon}
        iconColor={failed ? theme.colors.statusDanger : undefined}
        verb={label.verb}
        target={label.target}
        targetSpans={spans}
        mono={label.mono}
        meta={failed ? "failed" : undefined}
        metaColor={failed ? theme.colors.statusDanger : undefined}
      />
    );
  }
  return null;
}

export function StepsItem(props: PluginTimelineItemProps<{ head: string }>) {
  const { head } = props.item.data;
  const subscribe = useCallback((listener: () => void) => subscribeRun(head, listener), [head]);
  useSyncExternalStore(subscribe, () => runVersion(head));
  const { steps, ms, open: runOpen } = runOf(head);
  const working = useAgent(props.agentId, (agent) => agent.status === "running") ?? false;
  useEffect(() => noteShownAgent(props.agentId), [props.agentId]);
  const [open, setOpen] = useState(false);
  const { theme } = props;

  if (steps.length === 0) return null;

  const cardStyle = {
    backgroundColor: theme.colors.surface1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  } as const;

  if (steps.length === 1) {
    return (
      <View style={cardStyle}>
        <StepContent step={steps[0]!.item} phase={steps[0]!.phase} theme={theme} />
      </View>
    );
  }

  const live =
    steps.findLast((step) => step.phase === "streaming" || (step.item.type === "tool_call" && step.item.status === "running")) ??
    (runOpen && working ? steps.at(-1) : undefined);
  const failed = steps.filter((step) => step.item.type === "tool_call" && step.item.status === "failed").length;
  const label = live
    ? live.item.type === "tool_call"
      ? describeStep(live.item)
      : { icon: "Brain", verb: "Thinking", mono: false }
    : { icon: "ListTree", verb: stepSummary(steps.map((step) => step.item)), mono: false };
  const liveSpans =
    live?.item.type === "tool_call" && live.item.detail.type === "shell"
      ? highlightShell(firstLine(live.item.detail.command))
      : undefined;
  const meta = failed
    ? `${failed} failed`
    : live
      ? `${steps.length} steps`
      : ms !== undefined
        ? duration(ms)
        : undefined;

  return (
    <View style={cardStyle}>
      <StepRow
        theme={theme}
        icon={label.icon}
        iconColor={failed ? theme.colors.statusDanger : undefined}
        verb={label.verb}
        target={"target" in label ? label.target : undefined}
        targetSpans={liveSpans}
        mono={label.mono}
        meta={meta}
        metaColor={failed ? theme.colors.statusDanger : undefined}
        muted
        open={open}
        onToggle={() => setOpen((value) => !value)}
      />
      {open ? (
        <View
          style={{
            marginLeft: 7,
            paddingLeft: 16,
            borderLeftWidth: 1,
            borderLeftColor: theme.colors.border,
          }}
        >
          {steps.map((step, index) => (
            <StepContent key={index} step={step.item} phase={step.phase} theme={theme} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
