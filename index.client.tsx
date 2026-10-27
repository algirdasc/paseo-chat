import type { PluginClientContext, PluginSidebarItemProps, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect } from "react";
import { View } from "react-native";
import { z } from "zod";
import { getConfig, pushConfig, subscribeConfig } from "./client/config";
import { MessageBody } from "./client/markdown";
import { ConfigSettings } from "./client/settings";
import { followAgent, onShownAgent, onStaleSteps, placeStep, resetMade } from "./client/steps";
import { StepsItem } from "./client/steps-view";
import { installChatBackground, installChatWidth } from "./client/web";
import { pluginConfig } from "./shared/config";

const stepsSchema = z.object({ head: z.string() });

const schema = z.object({
  text: z.string(),
  variant: z.enum(["user", "assistant"]).default("assistant"),
});

type Data = z.output<typeof schema>;

// Mirrors Paseo's native user bubble: right-aligned, raised surface, asymmetric top-right corner.
function RichMessage({ item, theme }: PluginTimelineItemProps<Data>) {
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

// Always mounted beside the sidebar on desktop: pushes the host's settings into the module store
// transformers and the DOM background read, and opens the settings screen.
function ConfigBridge({ client }: PluginSidebarItemProps & { client: PluginClientContext }) {
  const settings = useSettings(pluginConfig);
  const values = settings.status === "ready" ? settings.values : null;
  useEffect(() => {
    if (values) pushConfig(values);
  }, [values]);
  return <SidebarRow icon="SlidersHorizontal" onPress={() => client.openSettings("config")} />;
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

  client.addTimelineRenderer({ kind: "rich-markdown", version: 1, schema, Component: RichMessage });
  client.addTimelineRenderer({ kind: "merged-steps", version: 1, schema: stepsSchema, Component: StepsItem });
  client.addSettingsScreen({ id: "config", title: "Chat Markdown", icon: "SlidersHorizontal", Component: ConfigSettings });
  client.addSidebarFooterItem({
    id: "config",
    title: "Chat Markdown",
    Component: (props: PluginSidebarItemProps) => <ConfigBridge {...props} client={client} />,
  });
  const removeBackground = installChatBackground();
  const removeChatWidth = installChatWidth();
  return () => {
    unsubscribeConfig();
    removeChatWidth();
    removeBackground();
    removeTransformers();
    if (staleTimer) clearTimeout(staleTimer);
    for (const stop of followed.values()) stop();
    followed.clear();
  };
}
