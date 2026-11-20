import type { PluginServerContext } from "@getpaseo/plugin/server";
import { AnnotationStore } from "./server/annotations";
import { readHostStats } from "./server/host-stats";
import { listAnnotations, removeAnnotations, saveAnnotations } from "./shared/annotations";
import { pluginConfig } from "./shared/config";
import { hostStatsRpc } from "./shared/host-stats";
import { quickPromptsSettings } from "./shared/prompts";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(pluginConfig);
  server.registerSettings(quickPromptsSettings);
  server.handle(hostStatsRpc, () => readHostStats());

  const annotations = new AnnotationStore();
  server.handle(listAnnotations, async () => ({ annotations: await annotations.all() }));
  server.handle(saveAnnotations, async ({ annotations: changed }) => {
    await annotations.save(changed);
    return {};
  });
  server.handle(removeAnnotations, async ({ ids }) => {
    await annotations.remove(ids);
    return {};
  });
  return () => {};
}
