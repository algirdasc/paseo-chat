// Web/desktop only: the Asciify Constellation background behind the chat (asciify-engine/kit),
// and the optional chat-width override. Native clients get no-ops — plugins can only touch the
// DOM on web. The engine itself inks the field, follows the element's size, pauses off screen,
// holds a still frame under reduced motion, and degrades to an inert handle without WebGL2.
import { Platform } from "react-native";
import type { BackgroundHandle, BackgroundPreset } from "asciify-engine/kit";
import { getConfig, subscribeConfig } from "./config";

declare const document: any;
declare function setInterval(cb: () => void, ms: number): any;
declare function clearInterval(id: any): void;

const isWeb = Platform.OS === "web" && typeof document !== "undefined";

export function installChatBackground(): () => void {
  if (!isWeb) return () => {};

  let handle: BackgroundHandle | null = null;
  let host: any = null;
  let stopped = false;

  const detach = () => {
    handle?.destroy();
    handle = host = null;
  };

  const attach = async () => {
    const config = getConfig();
    if (!config.backgroundEnabled) return;
    const scroller = Array.from(document.querySelectorAll('[data-testid="agent-chat-scroll"]')).find(
      (el: any) => el.getBoundingClientRect().height > 0,
    ) as any;
    if (!scroller?.parentElement) return;
    const kit = await import("asciify-engine/kit");
    if (stopped) return;
    const preset = (kit[config.backgroundPreset] ?? kit.constellation) as BackgroundPreset;
    host = scroller.parentElement;
    // Sides only: quiet the centered content column. Paseo centers each row's inner wrapper
    // (width 100%, maxWidth contentMaxWidth, margin auto), so the column is a mounted row's first
    // child. Narrow window: the wrapper fills the width and the field disappears.
    const clearColumn = () => {
      const row = scroller.querySelector("[data-history-row-id], [data-message-id]");
      const column = row?.firstElementChild ?? null;
      const bounds = host.getBoundingClientRect();
      if (!column) return [];
      const rect = column.getBoundingClientRect();
      return [{ left: rect.left, right: rect.right, top: rect.top, bottom: bounds.bottom, width: rect.width, height: bounds.bottom - rect.top }];
    };
    handle = kit.background(host, {
      preset,
      palette: config.backgroundInk,
      cellSize: config.backgroundCellSize,
      speed: config.backgroundSpeed,
      cursor: "lantern",
      mark: "glyph",
      opacity: config.backgroundOpacity,
      dither: 0,
      clear: config.backgroundSidesOnly ? clearColumn : false,
      clearStrength: 1,
    });
  };

  // The chat scroller unmounts when its tab closes; poll at 1Hz rather than observe the whole DOM.
  const poll = setInterval(() => {
    if (handle && host?.isConnected) return;
    detach();
    void attach();
  }, 1000);
  void attach();
  const unsubscribe = subscribeConfig(() => {
    detach();
    void attach();
  });

  return () => {
    stopped = true;
    unsubscribe();
    clearInterval(poll);
    detach();
  };
};

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
