// Web/desktop only: the optional chat-width override, applied with a plain DOM poke.
// Native clients get a no-op — plugins can only touch the DOM on web.
import { Platform } from "react-native";
import { getConfig, subscribeConfig } from "./config";

declare const document: any;

const isWeb = Platform.OS === "web" && typeof document !== "undefined";

/** Chat width override: caps the centered row wrappers at the configured px (0 removes the cap). */
export function installChatWidth(): () => void {
  if (!isWeb) return () => {};
  const style = document.createElement("style");
  const apply = () => {
    const px = getConfig().chatMaxWidth;
    style.textContent =
      px > 0
        ? `[data-history-row-id] > div:first-child, [data-message-id] > div:first-child { max-width: ${px}px !important; }`
        : "";
  };
  apply();
  document.head.appendChild(style);
  const unsubscribe = subscribeConfig(apply);
  return () => {
    unsubscribe();
    style.remove();
  };
}
