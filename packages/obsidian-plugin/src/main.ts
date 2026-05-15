import { Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import { findKbRoot, type SectionKind } from "@instrumentality/shared";
import { InstrumentalityView, VIEW_TYPE_INSTRUMENTALITY, ICON_ID } from "./view";

interface InstrumentalityPluginData {
  dismissedBanners?: SectionKind[];
  openSection?: string;
  submodulesCollapsed?: boolean;
}

// Same SVG as the VSCode activity-bar icon. Obsidian renders it with
// currentColor at various sizes (ribbon, view header, tabs).
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
  <polygon points="12,3 21,12 12,21 3,12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="12" cy="6.5" r="1.7"/>
  <circle cx="6.5" cy="15.5" r="1.7"/>
  <circle cx="17.5" cy="15.5" r="1.7"/>
  <circle cx="12" cy="12" r="1.6"/>
</svg>`;

export default class InstrumentalityPlugin extends Plugin {
  private dismissedBanners: Set<SectionKind> = new Set();
  private openSection: string | undefined = undefined;
  private submodulesCollapsed = false;

  async onload(): Promise<void> {
    addIcon(ICON_ID, ICON_SVG);

    // Education-banner dismissals are persisted via Obsidian's plugin
    // data API (single JSON blob, kept inside `.obsidian/plugins/...`).
    // Once a user understands what "Code Drift" means, they don't want
    // the banner back on every vault re-open.
    const data = (await this.loadData()) as InstrumentalityPluginData | null;
    if (data && Array.isArray(data.dismissedBanners)) {
      this.dismissedBanners = new Set(data.dismissedBanners);
    }
    if (data && typeof data.openSection === "string") {
      this.openSection = data.openSection;
    }
    if (data && data.submodulesCollapsed === true) {
      this.submodulesCollapsed = true;
    }

    this.registerView(
      VIEW_TYPE_INSTRUMENTALITY,
      (leaf) =>
        new InstrumentalityView(leaf, {
          getKbRoot: () => this.detectKbRoot(),
          getDismissedBanners: () => this.dismissedBanners,
          dismissBanner: (kind) => void this.persistDismissedBanner(kind),
          getOpenSection: () => this.openSection,
          setOpenSection: (key) => void this.persistOpenSection(key),
          getSubmodulesCollapsed: () => this.submodulesCollapsed,
          setSubmodulesCollapsed: (flag) =>
            void this.persistSubmodulesCollapsed(flag),
        })
    );

    this.addRibbonIcon(ICON_ID, "Instrumentality", () => void this.activateView());

    this.addCommand({
      id: "open-pane",
      name: "Open Instrumentality pane",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "refresh",
      name: "Refresh Instrumentality",
      callback: () => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_INSTRUMENTALITY)) {
          const view = leaf.view as InstrumentalityView;
          void view.refresh();
        }
      },
    });
  }

  private async persistDismissedBanner(kind: SectionKind): Promise<void> {
    if (this.dismissedBanners.has(kind)) return;
    this.dismissedBanners.add(kind);
    await this.persistAll();
  }

  private async persistOpenSection(key: string): Promise<void> {
    if (this.openSection === key) return;
    this.openSection = key;
    await this.persistAll();
  }

  private async persistSubmodulesCollapsed(flag: boolean): Promise<void> {
    if (this.submodulesCollapsed === flag) return;
    this.submodulesCollapsed = flag;
    await this.persistAll();
  }

  private async persistAll(): Promise<void> {
    await this.saveData({
      dismissedBanners: [...this.dismissedBanners],
      openSection: this.openSection,
      submodulesCollapsed: this.submodulesCollapsed,
    } satisfies InstrumentalityPluginData);
  }

  onunload(): void {
    // Per Obsidian guidance, do NOT detachLeavesOfType in onunload — the user
    // may want their layout preserved across plugin reloads.
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null =
      workspace.getLeavesOfType(VIEW_TYPE_INSTRUMENTALITY)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_INSTRUMENTALITY, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  /**
   * Resolve the KB root by walking up from the vault's filesystem path.
   * Returns null if the vault adapter doesn't expose a base path (mobile
   * sandboxed installs) or no KB indicator is found in tree.
   */
  private detectKbRoot(): string | null {
    const adapter = this.app.vault.adapter as unknown as {
      basePath?: string;
      getBasePath?: () => string;
    };
    const basePath = adapter.basePath ?? adapter.getBasePath?.();
    if (!basePath) return null;
    return findKbRoot([basePath]);
  }
}
