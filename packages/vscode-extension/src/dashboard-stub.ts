import * as vscode from "vscode";
import type { StatusSummary } from "@instrumentality/shared";

let panel: vscode.WebviewPanel | null = null;

export function openDashboard(getStatusSnapshot: () => StatusSummary | null): void {
  if (panel) {
    panel.reveal();
    panel.webview.html = renderHtml(getStatusSnapshot());
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "kbSync.dashboard",
    "KB Sync Dashboard",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: false }
  );

  panel.webview.html = renderHtml(getStatusSnapshot());

  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.command === "copyJson") {
      const snapshot = getStatusSnapshot();
      vscode.env.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      vscode.window.showInformationMessage("KB Sync: status JSON copied to clipboard.");
    }
  });

  panel.onDidDispose(() => {
    panel = null;
  });
}

function renderHtml(status: StatusSummary | null): string {
  const totals = status?.totals;
  const head = status?.currentHeadShort ?? "?";
  return /* html */ `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>KB Sync Dashboard</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 24px; line-height: 1.5; }
    h1 { margin-top: 0; }
    .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 16px 0; }
    .card { padding: 12px 16px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
    .card .n { font-size: 24px; font-weight: 600; }
    .card .l { font-size: 12px; opacity: 0.75; }
    .placeholder { padding: 20px; border: 1px dashed var(--vscode-panel-border); border-radius: 4px; opacity: 0.85; }
    button { padding: 6px 12px; margin-top: 12px; cursor: pointer; }
    code { background: var(--vscode-textBlockQuote-background); padding: 2px 4px; border-radius: 2px; }
  </style>
</head>
<body>
  <h1>KB Sync Dashboard</h1>
  <p>Workspace HEAD: <code>${head}</code></p>

  <div class="totals">
    <div class="card"><div class="n">${totals?.drifts ?? 0}</div><div class="l">Drifts</div></div>
    <div class="card"><div class="n">${totals?.conformPending ?? 0}</div><div class="l">Conform Pending</div></div>
    <div class="card"><div class="n">${totals?.promotions ?? 0}</div><div class="l">Promotions</div></div>
    <div class="card"><div class="n">${totals?.lintErrors ?? 0}</div><div class="l">Lint Errors</div></div>
    <div class="card"><div class="n">${totals?.lintWarnings ?? 0}</div><div class="l">Lint Warnings</div></div>
  </div>

  <div class="placeholder">
    <strong>Coming soon — v2 will land a rich dashboard here.</strong>
    <p>Cards per drift entry, syntax-highlighted prompt previews, baseline-SHA badges, and a sync timeline. For now, use the <em>KB Sync</em> tree view in the activity bar to browse entries and copy prompts.</p>
    <button onclick="(function(){const v=acquireVsCodeApi();v.postMessage({command:'copyJson'});})()">Copy current kb_status JSON</button>
  </div>
</body>
</html>`;
}
