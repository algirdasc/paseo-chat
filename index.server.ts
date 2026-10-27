import type { PluginServerContext } from "@getpaseo/plugin/server";
import { pluginConfig } from "./shared/config";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(pluginConfig);
  return () => {};
}
