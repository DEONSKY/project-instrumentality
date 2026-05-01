import * as vscode from "vscode";

/**
 * The viewsWelcome contribution in package.json handles the "no kb detected"
 * case. This module hosts any *additional* contextual messages we want to
 * show inside the tree itself when a kb IS detected but a section is empty.
 *
 * Currently a no-op surface — the tree provider's empty-state messages
 * cover this. Kept as a seam so Phase B can add per-section welcome cards
 * to the dashboard without touching the tree.
 */
export function registerWelcome(_context: vscode.ExtensionContext): void {
  // intentionally empty — viewsWelcome is fully declarative in package.json
}
