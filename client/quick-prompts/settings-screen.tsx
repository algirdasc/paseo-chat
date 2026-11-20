// Adapted from paseo-quick-prompts (https://github.com/kingsleydon/paseo-plugins, MIT),
// reduced: edits save on blur/press against the displayed revision; a save that loses to
// another client reloads and toasts instead of keeping orphaned drafts. See NOTICE.md.
import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, SettingsCard, SettingsSection, SettingsSelect, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import {
  LABEL_MAX_LENGTH,
  MAX_PROMPTS,
  quickPromptSchema,
  quickPromptsSettings,
  newPromptId,
  type PromptDisplay,
  type QuickPrompt,
} from "../../shared/prompts";

type Theme = PluginSurfaceProps["theme"];

const DISPLAY_OPTIONS: ReadonlyArray<{ label: string; value: PromptDisplay }> = [
  { label: "Separate pills", value: "pills" },
  { label: "One menu pill", value: "menu" },
];

const LINE_HEIGHT = 20;
/** The prompt input grows with its text up to this many lines, then scrolls. */
const MAX_LINES = 5;

function fieldError(field: "label" | "text", value: string): string | null {
  return quickPromptSchema.shape[field].safeParse(value).error?.issues[0]?.message ?? null;
}

function FieldInput({
  field,
  value,
  error,
  accessibilityLabel,
  style,
  theme,
  onChangeText,
  onBlur,
}: {
  field: "label" | "text";
  value: string;
  error: string | null;
  accessibilityLabel: string;
  style: StyleProp<ViewStyle>;
  theme: Theme;
  onChangeText(text: string): void;
  onBlur?(): void;
}) {
  const multiline = field === "text";
  // The input has no padding of its own, so its content height is the height of its text.
  const [contentHeight, setContentHeight] = useState(LINE_HEIGHT);
  const maxHeight = LINE_HEIGHT * MAX_LINES;
  const height = multiline ? Math.min(Math.max(contentHeight, LINE_HEIGHT), maxHeight) : LINE_HEIGHT;
  return (
    <View style={style}>
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface2,
        }}
      >
        <TextInput
          multiline={multiline}
          scrollEnabled={multiline && contentHeight > maxHeight}
          accessibilityLabel={accessibilityLabel}
          value={value}
          placeholder={multiline ? "Prompt sent to the agent" : "Label"}
          placeholderTextColor={theme.colors.foregroundMuted}
          onChangeText={onChangeText}
          onBlur={onBlur}
          onContentSizeChange={multiline ? (event) => setContentHeight(event.nativeEvent.contentSize.height) : undefined}
          style={{ padding: 0, color: theme.colors.foreground, fontSize: 14, lineHeight: LINE_HEIGHT, height }}
        />
      </View>
      {error ? <Text style={{ color: theme.colors.statusDanger, fontSize: 12, marginTop: 2 }}>{error}</Text> : null}
    </View>
  );
}

function RowFrame({
  compact,
  label,
  text,
  actions,
}: {
  compact: boolean;
  label: React.ReactNode;
  text: React.ReactNode;
  actions: React.ReactNode;
}) {
  const row = { paddingHorizontal: compact ? 12 : 16, paddingVertical: 8, gap: 6 } as const;
  const line = { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 6 };
  if (compact) {
    return (
      <View style={row}>
        <View style={line}>
          {label}
          {actions}
        </View>
        {text}
      </View>
    );
  }
  return (
    <View style={[row, line]}>
      {label}
      {text}
      {actions}
    </View>
  );
}

function IconButton({
  icon,
  accessibilityLabel,
  color,
  disabled,
  onPress,
}: {
  icon: string;
  accessibilityLabel: string;
  color: string;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={16} color={color} />
    </Pressable>
  );
}

function PromptEditor({
  prompt,
  index,
  count,
  compact,
  theme,
  save,
}: {
  prompt: QuickPrompt;
  index: number;
  count: number;
  compact: boolean;
  theme: Theme;
  save(edit: (prompts: QuickPrompt[]) => QuickPrompt[]): void;
}) {
  const [draft, setDraft] = useState({ label: prompt.label, text: prompt.text });
  // Another client (or a failed save's reload) is the source of truth between edits.
  useEffect(() => setDraft({ label: prompt.label, text: prompt.text }), [prompt.label, prompt.text]);
  const name = prompt.label || `quick prompt ${index + 1}`;

  const commit = (field: "label" | "text") => () => {
    if (draft[field] === prompt[field]) return;
    if (fieldError(field, draft[field])) return;
    save((prompts) => prompts.map((p) => (p.id === prompt.id ? { ...p, [field]: draft[field] } : p)));
  };

  const input = (field: "label" | "text", accessibilityLabel: string) => (
    <FieldInput
      field={field}
      value={draft[field]}
      error={null}
      accessibilityLabel={accessibilityLabel}
      style={field === "label" ? (compact ? { flex: 1 } : { width: 160 }) : compact ? {} : { flex: 1 }}
      theme={theme}
      onChangeText={(value) => setDraft((current) => ({ ...current, [field]: value }))}
      onBlur={commit(field)}
    />
  );

  return (
    <RowFrame
      compact={compact}
      label={input("label", `Label for ${name}`)}
      text={input("text", `Prompt for ${name}`)}
      actions={
        <View style={{ flexDirection: "row", gap: 2, paddingTop: 3 }}>
          <IconButton
            icon="ArrowUp"
            accessibilityLabel={`Move ${name} up`}
            color={theme.colors.foreground}
            disabled={index === 0}
            onPress={() =>
              save((prompts) => {
                const next = [...prompts];
                [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                return next;
              })
            }
          />
          <IconButton
            icon="ArrowDown"
            accessibilityLabel={`Move ${name} down`}
            color={theme.colors.foreground}
            disabled={index === count - 1}
            onPress={() =>
              save((prompts) => {
                const next = [...prompts];
                [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                return next;
              })
            }
          />
          <IconButton
            icon="Trash2"
            accessibilityLabel={`Delete ${name}`}
            color={theme.colors.statusDanger}
            onPress={() => save((prompts) => prompts.filter((p) => p.id !== prompt.id))}
          />
        </View>
      }
    />
  );
}

function NewPromptRow({
  count,
  compact,
  theme,
  save,
}: {
  count: number;
  compact: boolean;
  theme: Theme;
  save(add: (prompts: QuickPrompt[]) => QuickPrompt[]): void;
}) {
  const [draft, setDraft] = useState({ label: "", text: "" });
  const [showErrors, setShowErrors] = useState(false);
  const disabled = count >= MAX_PROMPTS;
  const labelError = fieldError("label", draft.label);
  const textError = fieldError("text", draft.text);

  const add = () => {
    setShowErrors(true);
    if (labelError || textError || disabled) return;
    save((prompts) => [...prompts, { id: newPromptId(), label: draft.label.trim(), text: draft.text.trim() }]);
    setDraft({ label: "", text: "" });
    setShowErrors(false);
  };

  return (
    <RowFrame
      compact={compact}
      label={
        <FieldInput
          field="label"
          value={draft.label}
          error={showErrors ? labelError : null}
          accessibilityLabel="Label for the new quick prompt"
          style={compact ? { flex: 1 } : { width: 160 }}
          theme={theme}
          onChangeText={(value) => setDraft((current) => ({ ...current, label: value }))}
        />
      }
      text={
        <FieldInput
          field="text"
          value={draft.text}
          error={showErrors ? textError : null}
          accessibilityLabel="Prompt for the new quick prompt"
          style={compact ? {} : { flex: 1 }}
          theme={theme}
          onChangeText={(value) => setDraft((current) => ({ ...current, text: value }))}
        />
      }
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add quick prompt"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={add}
          style={{
            height: 34,
            paddingHorizontal: 12,
            borderRadius: 6,
            justifyContent: "center",
            backgroundColor: theme.colors.accent,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          <Text style={{ color: theme.colors.accentForeground, fontSize: 13 }}>Add</Text>
        </Pressable>
      }
    />
  );
}

export function QuickPromptsSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(quickPromptsSettings);
  const toast = useToast();
  const compact = layout.compact;

  if (settings.status === "loading") {
    return <Text style={{ color: theme.colors.foregroundMuted }}>Loading quick prompts…</Text>;
  }
  if (settings.status === "invalid" || settings.status === "error") {
    return <Text style={{ color: theme.colors.statusDanger }}>Settings unavailable: {settings.error}</Text>;
  }

  const { values, revision } = settings;
  const save = (edit: (prompts: QuickPrompt[]) => QuickPrompt[]): void => {
    const prompts = edit(values.prompts);
    if (prompts === values.prompts) return;
    void settings.save({ prompts, display: values.display }, revision).then((saved) => {
      if (!saved) {
        toast.error("Quick prompts changed elsewhere; reloading.");
        void settings.reload();
      }
    });
  };

  return (
    <SettingsSection title="Quick prompts">
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18 }}>
        Quick prompts appear above every agent's composer, as separate pills or in one Prompts menu. Choosing one
        sends the prompt to that agent as your message. Changes save automatically.
      </Text>
      <SettingsCard>
        {values.prompts.map((prompt, index) => (
          <PromptEditor
            key={prompt.id}
            prompt={prompt}
            index={index}
            count={values.prompts.length}
            compact={compact}
            theme={theme}
            save={save}
          />
        ))}
        <NewPromptRow count={values.prompts.length} compact={compact} theme={theme} save={save} />
      </SettingsCard>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
        {values.prompts.length === 0
          ? "No quick prompts yet."
          : `${values.prompts.length} of ${MAX_PROMPTS} quick prompts.`}{" "}
        Labels can be up to {LABEL_MAX_LENGTH} characters.
      </Text>
      <SettingsCard>
        <SettingsSelect
          label="Show prompts as"
          hint="Separate pills show one pill per prompt; one menu pill keeps them in a single menu."
          value={values.display}
          options={DISPLAY_OPTIONS}
          onValueChange={(display) =>
            void settings.save({ prompts: values.prompts, display }, revision).then((saved) => {
              if (!saved) void settings.reload();
            })
          }
        />
      </SettingsCard>
    </SettingsSection>
  );
}
