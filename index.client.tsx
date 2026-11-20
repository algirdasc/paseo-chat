import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { View } from "react-native";
import { z } from "zod";
import { observeAgents } from "./client/annotations/agents";
import { createComposerPills } from "./client/annotations/pill";
import { AnnotationStore } from "./client/annotations/store";
import { installWebAnnotations } from "./client/annotations/web";
import { getConfig, subscribeConfig, useConfigBridge } from "./client/config";
import { HostMonitorItem } from "./client/host-monitor";
import { MessageBody } from "./client/markdown";
import { ConfigSettings } from "./client/settings";
import { followAgent, onShownAgent, onStaleSteps, placeStep, resetMade } from "./client/steps";
import { StepsItem } from "./client/steps-view";
import { followPromptSettings } from "./client/quick-prompts/follow";
import { createPromptPills } from "./client/quick-prompts/pills";
import { QuickPromptsSettingsScreen } from "./client/quick-prompts/settings-screen";
import { installChatWidth } from "./client/web";

const stepsSchema = z.object({ head: z.string() });

const schema = z.object({
  text: z.string(),
  variant: z.enum(["user", "assistant"]).default("assistant"),
});

type Data = z.output<typeof schema>;

// Mirrors Paseo's native user bubble: right-aligned, raised surface, asymmetric top-right corner.
function RichMessage({ item, theme }: PluginTimelineItemProps<Data>) {
  useConfigBridge();
  if (item.data.variant === "user") {
    return (
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: theme.colors.surface2,
            borderRadius: 16,
            borderTopRightRadius: 4,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          <MessageBody text={item.data.text} theme={theme} />
        </View>
      </View>
    );
  }
  return <MessageBody text={item.data.text} theme={theme} />;
}

const FENCE = "```";
const INLINE_CODE = /`[^`\n]+`/;

// Paseo renders assistant markdown itself, so claim those only for fences (the highlighting is the
// added value). User bubbles render plain text natively, so claim those for inline code too.
function toRichMessage(item: { text: string }, variant: Data["variant"]) {
  if (!getConfig().syntaxHighlight) return undefined;
  if (!item.text.includes(FENCE) && !(variant === "user" && INLINE_CODE.test(item.text))) return undefined;
  return {
    items: [{ type: "plugin" as const, kind: "rich-markdown", version: 1, data: { text: item.text, variant } }],
  };
}

function toMergedStep(item: Parameters<typeof placeStep>[0], phase: "streaming" | "complete") {
  if (!getConfig().mergeSteps) return undefined;
  const placed = placeStep(item, phase);
  if (!placed) return undefined;
  if (placed.as === "none") return { items: [] };
  return { items: [{ type: "plugin" as const, kind: "merged-steps", version: 1, data: { head: placed.key } }] };
}

export default function contribute(client: PluginClientContext) {
  const addTransformers = () => {
    const removers = [
      client.addTimelineTransformer({
        id: "rich-markdown-assistant",
        query: { itemType: "assistant_message" },
        transform: ({ item }) => toRichMessage(item, "assistant"),
      }),
      client.addTimelineTransformer({
        id: "rich-markdown-user",
        query: { itemType: "user_message" },
        transform: ({ item }) => toRichMessage(item, "user"),
      }),
      client.addTimelineTransformer({
        id: "merged-steps-tool",
        query: { itemType: "tool_call" },
        transform: ({ item, phase }) => toMergedStep(item, phase),
      }),
      client.addTimelineTransformer({
        id: "merged-steps-reasoning",
        query: { itemType: "reasoning" },
        transform: ({ item, phase }) => toMergedStep(item, phase),
      }),
    ];
    return () => removers.forEach((remove) => void remove());
  };
  let removeTransformers = addTransformers();

  // A step transformed before its run was known renders wrong until Paseo transforms again; batch those.
  let staleTimer: ReturnType<typeof setTimeout> | undefined;
  onStaleSteps(() => {
    staleTimer ??= setTimeout(() => {
      staleTimer = undefined;
      resetMade();
      removeTransformers();
      removeTransformers = addTransformers();
    }, 50);
  });

  // shortcut: follow every agent whose merged row renders and never unfollow until teardown;
  // unfollowing idle tabs would cost the resync when they come back.
  const followed = new Map<string, () => void>();
  onShownAgent((agentId) => {
    if (!followed.has(agentId)) followed.set(agentId, followAgent(client.paseo, agentId));
  });

  // Settings change what the transformers claim; re-register so Paseo transforms again.
  const unsubscribeConfig = subscribeConfig(() => {
    resetMade();
    removeTransformers();
    removeTransformers = addTransformers();
  });

  const annotations = new AnnotationStore(client.rpc.bind(client));
  void annotations.load();
  const pills = createComposerPills(client, annotations);

  const QUICK_PROMPTS_SCREEN_ID = "quick-prompts";
  const promptPills = createPromptPills({
    addComposerPill: (contribution) => client.addComposerPill(contribution),
    send: (agentId, text) => client.paseo.agents.ref(agentId).send(text),
    openSettings: () => client.openSettings(QUICK_PROMPTS_SCREEN_ID),
  });
  const promptsLifetime = new AbortController();
  followPromptSettings(client, promptPills, promptsLifetime.signal);

  // One agent directory fans out to every pill owner.
  const agents = observeAgents(client, {
    upsert: (agent) => {
      pills.upsert(agent);
      promptPills.upsertAgent(agent);
    },
    remove: (agentId) => {
      pills.remove(agentId);
      promptPills.removeAgent(agentId);
    },
  });
  const removeAnnotations = installWebAnnotations(client, annotations, agents);

  client.addTimelineRenderer({ kind: "rich-markdown", version: 1, schema, Component: RichMessage });
  client.addTimelineRenderer({ kind: "merged-steps", version: 1, schema: stepsSchema, Component: StepsItem });
  client.addSettingsScreen({ id: "config", title: "Pretty Chat", icon: "SlidersHorizontal", Component: ConfigSettings });
  client.addSettingsScreen({
    id: QUICK_PROMPTS_SCREEN_ID,
    title: "Quick prompts",
    icon: "Zap",
    Component: QuickPromptsSettingsScreen,
  });
  client.addSidebarFooterItem({ id: "host-monitor", title: "Host usage", Component: HostMonitorItem });
  const removeChatWidth = installChatWidth();
  return () => {
    removeAnnotations();
    agents.dispose();
    pills.dispose();
    promptsLifetime.abort();
    promptPills.removeAll();
    unsubscribeConfig();
    removeChatWidth();
    removeTransformers();
    if (staleTimer) clearTimeout(staleTimer);
    for (const stop of followed.values()) stop();
    followed.clear();
  };
}
