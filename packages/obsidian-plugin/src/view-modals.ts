import { Modal, App } from "obsidian";

// ── Modals ───────────────────────────────────────────────────────────────
//
// Thin promise-returning wrappers around Obsidian's Modal class. We use
// these instead of VSCode's quick-pick / modal info messages so the push
// + sync UX matches the VSCode extension closely.

export interface ConfirmModalOpts {
  title: string;
  detail: string;
  confirmLabel: string;
  hideCancel?: boolean;
}

export function confirmModal(app: App, opts: ConfirmModalOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new ConfirmModal(app, opts, resolve);
    modal.open();
  });
}

class ConfirmModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private opts: ConfirmModalOpts,
    private done: (v: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.opts.title);
    const detail = this.contentEl.createEl("pre", {
      cls: "instrumentality-modal-detail",
      text: this.opts.detail,
    });
    detail.style.whiteSpace = "pre-wrap";

    const actions = this.contentEl.createDiv({
      cls: "instrumentality-modal-actions",
    });
    if (!this.opts.hideCancel) {
      const cancel = actions.createEl("button", { text: "Cancel" });
      cancel.addEventListener("click", () => {
        this.resolved = true;
        this.done(false);
        this.close();
      });
    }
    const ok = actions.createEl("button", {
      cls: "mod-cta",
      text: this.opts.confirmLabel,
    });
    ok.addEventListener("click", () => {
      this.resolved = true;
      this.done(true);
      this.close();
    });
  }

  onClose(): void {
    if (!this.resolved) this.done(false);
    this.contentEl.empty();
  }
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectModalOpts {
  title: string;
  placeholder?: string;
  options: SelectOption[];
}

export function selectModal(
  app: App,
  opts: SelectModalOpts
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new SelectModal(app, opts, resolve);
    modal.open();
  });
}

class SelectModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private opts: SelectModalOpts,
    private done: (v: string | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.opts.title);
    if (this.opts.placeholder) {
      this.contentEl.createDiv({
        cls: "instrumentality-modal-placeholder",
        text: this.opts.placeholder,
      });
    }
    const list = this.contentEl.createDiv({
      cls: "instrumentality-modal-select-list",
    });
    for (const opt of this.opts.options) {
      const btn = list.createEl("button", {
        cls: "instrumentality-modal-select-item",
      });
      btn.createSpan({ text: opt.label });
      if (opt.description) {
        btn.createSpan({
          cls: "instrumentality-modal-select-desc",
          text: opt.description,
        });
      }
      btn.addEventListener("click", () => {
        this.resolved = true;
        this.done(opt.value);
        this.close();
      });
    }
  }

  onClose(): void {
    if (!this.resolved) this.done(null);
    this.contentEl.empty();
  }
}
