import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsInput, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { BACKGROUND_PRESETS, pluginConfig, type PluginConfig } from "../shared/config";

const NUMBER_LIMITS = {
  backgroundSpeed: [0, 5],
  backgroundOpacity: [0, 1],
  backgroundCellSize: [6, 24],
  chatMaxWidth: [0, 2000],
} as const;

export function ConfigSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(pluginConfig);

  if (settings.status === "loading") {
    return <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>;
  }
  if (settings.status === "invalid" || settings.status === "error") {
    return <Text style={{ color: theme.colors.statusDanger }}>Settings unavailable: {settings.error}</Text>;
  }

  const values = settings.values;
  const save = (patch: Partial<PluginConfig>) => void settings.save({ ...values, ...patch }, settings.revision);
  const saveNumber = (key: keyof typeof NUMBER_LIMITS) => (text: string) => {
    const parsed = Number.parseFloat(text);
    if (!Number.isFinite(parsed)) return;
    const [min, max] = NUMBER_LIMITS[key];
    const clamped = Math.min(max, Math.max(min, parsed));
    save({ [key]: key === "chatMaxWidth" || key === "backgroundCellSize" ? Math.round(clamped) : clamped });
  };

  return (
    <>
      <SettingsSection title="Chat">
        <SettingsCard>
          <SettingsSwitch
            label="Syntax highlighting"
            value={values.syntaxHighlight}
            onValueChange={(syntaxHighlight) => save({ syntaxHighlight })}
          />
          <SettingsSwitch
            label="Merge steps into one row"
            value={values.mergeSteps}
            onValueChange={(mergeSteps) => save({ mergeSteps })}
          />
          <SettingsInput
            label="Chat width (px)"
            hint="Max width of chat rows. 0 follows Paseo's own content width."
            initialValue={String(values.chatMaxWidth)}
            placeholder="0"
            onChangeText={saveNumber("chatMaxWidth")}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="ASCII background">
        <SettingsCard>
          <SettingsSwitch
            label="Enabled"
            value={values.backgroundEnabled}
            onValueChange={(backgroundEnabled) => save({ backgroundEnabled })}
          />
          <SettingsSwitch
            label="Sides only"
            hint="Keep the field out from behind chat content; wide windows only."
            value={values.backgroundSidesOnly}
            onValueChange={(backgroundSidesOnly) => save({ backgroundSidesOnly })}
          />
          <SettingsSelect
            label="Animation"
            value={values.backgroundPreset}
            options={BACKGROUND_PRESETS.map((preset) => ({
              value: preset,
              label: preset.charAt(0).toUpperCase() + preset.slice(1),
            }))}
            onValueChange={(backgroundPreset) => save({ backgroundPreset })}
          />
          <SettingsInput
            label="Speed"
            hint="0 to 5. Default 0.5."
            initialValue={String(values.backgroundSpeed)}
            placeholder="0.5"
            onChangeText={saveNumber("backgroundSpeed")}
          />
          <SettingsInput
            label="Opacity"
            hint="0 to 1. Default 0.6."
            initialValue={String(values.backgroundOpacity)}
            placeholder="0.6"
            onChangeText={saveNumber("backgroundOpacity")}
          />
          <SettingsInput
            label="Cell size (px)"
            hint="6 to 24. Default 10."
            initialValue={String(values.backgroundCellSize)}
            placeholder="10"
            onChangeText={saveNumber("backgroundCellSize")}
          />
          <SettingsInput
            label="Ink color"
            hint="Hex, e.g. #8f8d86. Empty keeps the current color."
            initialValue={values.backgroundInk}
            placeholder="#8f8d86"
            onChangeText={(text) => {
              if (/^#[0-9a-fA-F]{6}$/.test(text.trim())) save({ backgroundInk: text.trim() });
            }}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
