// Adapted from paseo-quick-prompts (https://github.com/kingsleydon/paseo-plugins, MIT),
// reduced. See NOTICE.md.
import type {
  PluginButton,
  PluginButtonRegistration,
  PluginComposerPillContribution,
} from "@getpaseo/plugin/client";
import type { QuickPrompt, QuickPromptsSettings } from "../../shared/prompts";

const ADD_PILL_ID = "add-quick-prompt";
const MENU_PILL_ID = "quick-prompts";

export interface PromptPillHost {
  addComposerPill(contribution: PluginComposerPillContribution): PluginButtonRegistration;
  send(agentId: string, text: string): Promise<void>;
  openSettings(): void;
}

export interface PromptPills {
  setSettings(settings: QuickPromptsSettings): void;
  upsertAgent(agent: { id: string; workspaceId: string }): void;
  removeAgent(agentId: string): void;
  removeAll(): void;
}

/** A pill an agent should show; `content` changes whenever its button does. */
interface PillSpec {
  id: string;
  content: string;
  button(agentId: string): PluginButton;
}

interface Pill {
  id: string;
  content: string;
  registration: PluginButtonRegistration;
}

/**
 * Keeps one composer pill per saved prompt on every agent, a single "Prompts" pill whose menu
 * lists them, or a single "Add quick prompt" pill when none are saved. Pills whose order is
 * unchanged update in place; a reorder, addition, removal, or display switch re-registers that
 * agent's pills, because registration order is display order.
 *
 * A factory rather than a class: plugin client bundles reach Hermes (iOS, Android) without Metro's
 * transforms, and Hermes rejects class syntax (getpaseo/paseo#5783).
 */
export function createPromptPills(host: PromptPillHost): PromptPills {
  /** Null until the first read, so agents do not flash the "Add quick prompt" pill. */
  let specs: readonly PillSpec[] | null = null;
  /** Agents that get pills, by id, with their workspace. */
  const targets = new Map<string, string>();
  const registered = new Map<string, Pill[]>();
  /**
   * Sends in flight by agent and prompt. Kept outside the registrations, which a reorder or display
   * switch replaces, so a replacement pill cannot send the same prompt again before the first settles.
   */
  const sending = new Map<string, Promise<void>>();

  const send = (agentId: string, prompt: QuickPrompt): Promise<void> => {
    const key = JSON.stringify([agentId, prompt.id]);
    const current = sending.get(key);
    if (current) return current;
    const next = host.send(agentId, prompt.text).finally(() => sending.delete(key));
    sending.set(key, next);
    return next;
  };

  const addSpec: PillSpec = {
    id: ADD_PILL_ID,
    content: "",
    button: () => ({
      title: "Add a quick prompt in settings",
      icon: "Plus",
      label: "Add quick prompt",
      behavior: { kind: "action", onPress: () => host.openSettings() },
    }),
  };

  const promptSpec = (prompt: QuickPrompt): PillSpec => ({
    id: `prompt-${prompt.id}`,
    content: JSON.stringify([prompt.label, prompt.text]),
    button: (agentId) => ({
      title: `Send quick prompt: ${prompt.label}`,
      icon: "Zap",
      label: prompt.label,
      // Paseo marks the pill busy until the send settles and shows a failure in a toast.
      behavior: { kind: "action", onPress: () => send(agentId, prompt) },
    }),
  });

  const menuSpec = (prompts: readonly QuickPrompt[]): PillSpec => ({
    id: MENU_PILL_ID,
    content: JSON.stringify(prompts),
    button: (agentId) => ({
      title: "Send a quick prompt",
      icon: "Zap",
      label: "Prompts",
      behavior: {
        kind: "menu",
        items: [
          ...prompts.map((prompt) => ({
            kind: "item" as const,
            id: `prompt-${prompt.id}`,
            title: prompt.label,
            behavior: { kind: "action" as const, onPress: () => send(agentId, prompt) },
          })),
          { kind: "separator", id: "manage-divider" },
          {
            kind: "item",
            id: "manage",
            title: "Manage prompts",
            icon: "Settings",
            behavior: { kind: "action", onPress: () => host.openSettings() },
          },
        ],
      },
    }),
  });

  const clear = (agentId: string): void => {
    for (const pill of registered.get(agentId) ?? []) pill.registration.remove();
    registered.delete(agentId);
  };

  const sync = (agentId: string): void => {
    if (specs === null) return;
    const workspaceId = targets.get(agentId);
    if (!workspaceId) return;
    const next = specs;
    const current = registered.get(agentId);
    const sameOrder =
      current !== undefined &&
      current.length === next.length &&
      current.every((pill, index) => pill.id === next[index]?.id);
    if (current && sameOrder) {
      current.forEach((pill, index) => {
        const spec = next[index];
        if (!spec || pill.content === spec.content) return;
        pill.content = spec.content;
        // The full button, so a menu gets its complete new behavior.
        pill.registration.update(spec.button(agentId));
      });
      return;
    }
    clear(agentId);
    registered.set(
      agentId,
      next.map(({ id, content, button }) => {
        const registration = host.addComposerPill({ id, workspaceId, agentId, button: button(agentId) });
        return { id, content, registration };
      }),
    );
  };

  return {
    setSettings({ prompts, display }) {
      if (prompts.length === 0) specs = [addSpec];
      else specs = display === "menu" ? [menuSpec(prompts)] : prompts.map(promptSpec);
      for (const agentId of targets.keys()) sync(agentId);
    },
    upsertAgent(agent) {
      targets.set(agent.id, agent.workspaceId);
      sync(agent.id);
    },
    removeAgent(agentId) {
      targets.delete(agentId);
      clear(agentId);
    },
    removeAll() {
      for (const agentId of [...targets.keys()]) {
        targets.delete(agentId);
        clear(agentId);
      }
    },
  };
}
