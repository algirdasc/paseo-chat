import type { PluginTheme } from "@getpaseo/plugin";
import { copyText, Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { highlightFor, syntaxColors, type SyntaxColors } from "./highlight";
import { splitBlocks, type Block } from "./blocks";

const MONOSPACE = Platform.select({ ios: "Menlo", default: "monospace" });

function CodeBlock({ code, lang, theme }: { code: string; lang: string; theme: PluginTheme }) {
  const toast = useToast();
  const colors: SyntaxColors = syntaxColors(theme.colors.surface0);
  const spans = useMemo(() => highlightFor(lang, code), [lang, code]);
  const copy = async () => {
    try {
      await copyText(code);
      toast.show("Copied", { variant: "success" });
    } catch {
      toast.error("Could not copy. Select the text and use Copy.");
    }
  };
  return (
    <View
      style={{
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{lang || "code"}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Copy code" onPress={copy} hitSlop={8}>
          <Text style={{ color: theme.colors.accent, fontSize: 12 }}>Copy</Text>
        </Pressable>
      </View>
      <ScrollView horizontal>
        <Text
          selectable
          style={{
            fontFamily: MONOSPACE,
            fontSize: 13,
            lineHeight: 19,
            color: theme.colors.foreground,
            padding: 12,
          }}
        >
          {spans.map((span, index) =>
            span.kind ? (
              <Text key={index} style={{ color: colors[span.kind] }}>
                {span.text}
              </Text>
            ) : (
              span.text
            ),
          )}
        </Text>
      </ScrollView>
    </View>
  );
}

export function MessageBody({ text, theme }: { text: string; theme: PluginTheme }) {
  const blocks = useMemo(() => splitBlocks(text), [text]);
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, index) =>
        block.kind === "text" ? (
          <Markdown key={index}>{block.text}</Markdown>
        ) : (
          <CodeBlock key={index} code={block.code} lang={block.lang} theme={theme} />
        ),
      )}
    </View>
  );
}
