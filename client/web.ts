// Web/desktop only: the Asciify Constellation background behind the chat (asciify-engine/kit),
// and the optional chat-width override. Native clients get no-ops — plugins can only touch the
// DOM on web. The engine itself inks the field, follows the element's size, pauses off screen,
// holds a still frame under reduced motion, and degrades to an inert handle without WebGL2.
import { Platform } from "react-native";
import type { BackgroundHandle, BackgroundPreset } from "asciify-engine/kit";
import { getConfig, subscribeConfig } from "./config";

declare const document: any;
declare const window: any;
declare function getComputedStyle(el: any): any;
declare function setInterval(cb: () => void, ms: number): any;
declare function clearInterval(id: any): void;

const isWeb = Platform.OS === "web" && typeof document !== "undefined";

export function installChatBackground(): () => void {
  if (!isWeb) return () => {};

  let handle: BackgroundHandle | null = null;
  let host: any = null;
  let scroller: any = null;
  let stopped = false;

  const detach = () => {
    handle?.destroy();
    handle = host = scroller = null;
  };

  // The chat stream when a conversation is open; the draft/new-chat screen has none, so anchor on
  // the composer's model selector rail and take its panel-sized ancestor as the host instead.
  const findTarget = () => {
    const stream = Array.from(document.querySelectorAll('[data-testid="agent-chat-scroll"]')).find(
      (el: any) => el.getBoundingClientRect().height > 0,
    ) as any;
    if (stream?.parentElement) return { host: stream.parentElement, scroller: stream };
    const chip = Array.from(document.querySelectorAll('[data-testid="combined-model-selector"]')).find(
      (el: any) => el.getBoundingClientRect().height > 0,
    ) as any;
    let el = chip?.parentElement ?? null;
    while (el && el !== document.body) {
      if (el.getBoundingClientRect().height >= (window.innerHeight || 800) * 0.6) return { host: el, scroller: null };
      el = el.parentElement;
    }
    return null;
  };

  const attach = async () => {
    const config = getConfig();
    if (!config.backgroundEnabled) return;
    const found = findTarget();
    if (!found) return;
    const kit = await import("asciify-engine/kit");
    if (stopped) return;
    const preset = (kit[config.backgroundPreset] ?? kit.constellation) as BackgroundPreset;
    host = found.host;
    scroller = found.scroller;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    // Sides only: quiet the centered content column. Paseo centers each row's inner wrapper
    // (width 100%, maxWidth contentMaxWidth, margin auto), so the column is a mounted row's first
    // child. Narrow window: the wrapper fills the width and the field disappears.
    const clearColumn = () => {
      if (!scroller) return [];
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

  // The chat scroller unmounts when its tab closes and a draft chat has none; poll at 1Hz and
  // re-attach whenever the host element changes (draft -> conversation, tab switches).
  const poll = setInterval(() => {
    const found = findTarget();
    if (handle && host?.isConnected && found && found.host === host) return;
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
