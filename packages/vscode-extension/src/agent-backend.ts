import * as vscode from "vscode";

export type AgentBackend = "clipboard" | "terminal" | "command";

export interface SendResult {
  ok: boolean;
  via: AgentBackend | "clipboard-fallback";
  message: string;
}

/**
 * Routes a generated prompt to the configured agent backend.
 *
 * - clipboard: copies the prompt; user pastes manually.
 * - terminal: types into the active terminal (works for any agent CLI). If
 *   no terminal is active, falls back to clipboard with a notice.
 * - command: executes a configured VS Code command id with the prompt as
 *   the first argument. Lets users wire to whatever extension exposes a
 *   prompt-insertion command.
 *
 * Why no Claude-Code-specific path: the SSE port Claude Code exposes is for
 * its CLI ↔ extension MCP handshake and the wire format is undocumented
 * and changes. Building on it would break on Claude Code updates.
 */
export async function sendPrompt(prompt: string): Promise<SendResult> {
  const cfg = vscode.workspace.getConfiguration("instrumentality");
  const backend = cfg.get<AgentBackend>("agent.backend", "clipboard");

  if (backend === "terminal") {
    const term = vscode.window.activeTerminal;
    if (!term) {
      await vscode.env.clipboard.writeText(prompt);
      return {
        ok: true,
        via: "clipboard-fallback",
        message: "No active terminal — prompt copied to clipboard instead.",
      };
    }
    term.show(true);
    term.sendText(prompt, false);
    return { ok: true, via: "terminal", message: "Prompt sent to active terminal." };
  }

  if (backend === "command") {
    const commandId = cfg.get<string>("agent.commandId", "").trim();
    if (!commandId) {
      await vscode.env.clipboard.writeText(prompt);
      return {
        ok: false,
        via: "clipboard-fallback",
        message:
          "Backend is 'command' but instrumentality.agent.commandId is empty. Prompt copied to clipboard.",
      };
    }
    try {
      await vscode.commands.executeCommand(commandId, prompt);
      return { ok: true, via: "command", message: `Prompt dispatched to '${commandId}'.` };
    } catch (err: any) {
      await vscode.env.clipboard.writeText(prompt);
      return {
        ok: false,
        via: "clipboard-fallback",
        message: `Command '${commandId}' failed: ${err?.message ?? err}. Prompt copied to clipboard.`,
      };
    }
  }

  // clipboard (default)
  await vscode.env.clipboard.writeText(prompt);
  return { ok: true, via: "clipboard", message: "Prompt copied to clipboard." };
}

/**
 * One-time hint: if the user hasn't configured an agent backend and Claude
 * Code (or another agent extension) is installed, suggest the right setting.
 */
export async function maybeSuggestAgentBackend(context: vscode.ExtensionContext): Promise<void> {
  const HINTED_KEY = "instrumentality.agentHintShown";
  if (context.globalState.get<boolean>(HINTED_KEY)) return;

  const cfg = vscode.workspace.getConfiguration("instrumentality");
  const backend = cfg.get<AgentBackend>("agent.backend", "clipboard");
  if (backend !== "clipboard") return; // user has already chosen

  const all = await vscode.commands.getCommands(true);
  const claudeLike = all.filter((c) =>
    /^(claude-code|claude|anthropic\.|codeium\.|continue\.)/i.test(c)
  );
  if (claudeLike.length === 0) return;

  void vscode.window
    .showInformationMessage(
      "Instrumentality detected an agent extension. Switch from clipboard to a direct backend?",
      "Configure",
      "Not now"
    )
    .then((choice) => {
      void context.globalState.update(HINTED_KEY, true);
      if (choice === "Configure") {
        void vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "instrumentality.agent"
        );
      }
    });
}
