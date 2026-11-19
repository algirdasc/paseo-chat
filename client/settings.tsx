import { type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsInput, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { type PluginConfig } from "../shared/config";
import { useConfigBridge } from "./config";

const NUMBER_LIMITS = {
  chatMaxWidth: [0, 2000],
} as const;

export function ConfigSettings({ theme }: PluginSurfaceProps) {
  const settings = useConfigBridge();

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
    save({ [key]: Math.round(clamped) });
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
    </>
  );
}
