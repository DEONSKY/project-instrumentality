---
id: decision-design-asset-storage
type: decision
aliases: [design-storage, asset-strategy, attachment-policy]
cssclasses: [kb-decision]
app_scope: all
depends_on: []
owner: kb-mcp
created: 2026-05-21
tags: [obsidian, assets, design, attachments, excalidraw, canvas]
status: accepted
---

<!--
  DECISION FILES = architectural records. This one governs HOW the KB stores
  visual artefacts (mockups, diagrams, screenshots) so the rule is the same
  for every contributor and Obsidian renders consistently.
-->

## Context

The KB is opened as an Obsidian vault. Three kinds of visual artefact compete for a home, and each has different editing, versioning, and embedding needs:

1. **Ad-hoc screenshots** — paste-from-clipboard into a feature doc to illustrate a state. High volume, low intent. Created in seconds, often replaced.
2. **Diagrams and wireframes** — sequence diagrams, low-fidelity UI sketches, system maps. Editable, version-controlled, embedded in multiple docs.
3. **Polished UI design** — production mockups that live in Figma / Sketch / Penpot. The source-of-truth tool is external; the KB needs a reference plus a snapshot for offline / git-blame purposes.

Treating all three the same — "drop them in `assets/`" — produces a folder where 200 random `Pasted image 20260521.png` files drown one carefully-named wireframe. The rules must be different for each kind.

## Decision

Three tracks, one folder structure:

```
knowledge/
  assets/
    screenshots/                ← Track 1: ad-hoc paste, auto-managed
      <auto-named PNGs from Obsidian Attachment plugin>
    design/                     ← Tracks 2 & 3: deliberate artefacts
      <feature-or-domain>/      ← subfolder per context (e.g. design/billing/)
        wireframe.excalidraw.md ← Track 2: Excalidraw — editable in Obsidian
        mockup-v3.png           ← Track 3: PNG export from Figma / Sketch
        mockup-source.md        ← one-line file: Figma URL + exporter notes
      system-map.canvas         ← Obsidian Canvas (top-level when cross-domain)
```

### Track 1 — Ad-hoc screenshots

Configure Obsidian's built-in **Files & Links** settings:

- "Default location for new attachments" → **In the folder specified below**
- Specified folder → `assets/screenshots`
- "Use [[Wikilinks]]" → on
- (Optional) Install the **Attachment Management** community plugin if per-folder defaults are needed

Result: any paste-from-clipboard image lands in `assets/screenshots/` with an auto-generated name. Embed in a feature doc with `![[<filename>.png]]`. No subfolder discipline required for these — quantity over curation.

### Track 2 — Diagrams and wireframes (Excalidraw)

Install the **Excalidraw** community plugin. New `.excalidraw.md` files are markdown-compatible (text representation of the drawing + JSON payload). They:

- Edit inside Obsidian — no external tool launch.
- Version-control cleanly — git diffs show the JSON payload.
- Embed in any note with `![[<name>.excalidraw]]` — render inline.
- Survive without the plugin — the markdown body holds a fallback description.

Use Excalidraw for: sequence diagrams, wireframes, system component sketches, journey maps. Store under `assets/design/<context>/` so each domain has its own pile.

### Track 3 — Polished UI design (Figma / Sketch / Penpot)

The KB does **not** replicate the design tool. For each polished mockup that appears in a feature spec:

1. Keep the live source in Figma / Sketch / Penpot — that's where it gets edited.
2. Export a snapshot PNG/SVG to `assets/design/<context>/mockup-<name>-v<n>.png`.
3. Write a one-paragraph sidecar `assets/design/<context>/mockup-<name>.md` containing:
   - Figma URL
   - Frame/page name
   - Last-exported commit SHA
   - Who owns the design
4. Reference both in the feature doc:
   ```markdown
   ![[assets/design/billing/mockup-checkout-v3.png]]
   See [[assets/design/billing/mockup-checkout]] for the Figma source.
   ```

The PNG ages; the sidecar tells you whether to trust it. When Figma changes meaningfully, re-export the PNG and bump `v3` → `v4`.

### Cross-cutting — Obsidian Canvas for system maps

`.canvas` files are native Obsidian — no plugin needed. Use them for:

- Whole-system architecture overviews
- Cross-domain feature relationships (billing ↔ identity ↔ notifications)
- Onboarding diagrams where each card links to a feature doc

Store top-level: `assets/system-map.canvas`, or per-domain: `assets/design/<context>/<context>-canvas.canvas`. Canvas files reference other notes by path — they will not survive a folder rename without manual fixup, so keep them shallow.

## Alternatives considered

### Single flat `assets/` folder, no subfolders

Drop everything in `assets/`. **Not chosen** — within three months a single folder has 500+ files and no contributor can find anything. Obsidian's quick-switcher (Cmd+O) chokes on attachment lists.

### Per-feature attachment folders (`features/billing_attachments/`)

Obsidian's Attachment Management plugin can colocate attachments next to the note. **Not chosen** — produces dozens of `*_attachments/` folders polluting the vault tree, and makes shared assets (one wireframe referenced by three features) impossible without duplication.

### Store Figma source files directly in the repo

Treat `.fig` files as the source of truth and check them into `assets/design/`. **Not chosen** — `.fig` files are opaque binaries (no git diff), 5–50 MB each, and require the Figma desktop app to open. The cost outweighs the benefit; the link + PNG-snapshot pattern keeps git history navigable while preserving the live link.

### Use only Excalidraw for everything, drop external tools

Reject Figma entirely. **Not chosen** — Excalidraw is excellent for sketches and diagrams but not a production UI design tool. Designers need vector libraries, component systems, and collaborative editing that Excalidraw does not provide. The boundary is: Excalidraw for *engineering* diagrams, Figma for *product* design.

> [!info] Consequences
>
> **Positive:**
> - Each artefact type has one canonical home — no ambiguity for contributors.
> - `assets/screenshots/` can grow unbounded without affecting `assets/design/` curation.
> - Excalidraw files are git-friendly, edit inside Obsidian, and survive plugin removal (fallback markdown body).
> - Figma URLs in sidecar files surface in `kb_get` keyword search — "where is the checkout mockup?" finds it.
> - Canvas files give a low-effort way to ship visual architecture without a separate tool.
>
> **Negative / trade-offs:**
> - Three rules instead of one; contributors must learn the distinction between tracks.
> - PNG snapshots can rot relative to the Figma source; the sidecar file's `Last-exported` line is the only signal.
> - Excalidraw plugin removal would leave existing `.excalidraw.md` files as fallback text — readable but not editable in-place.

## Obsidian setup checklist

For every contributor opening this vault:

- [ ] Install the **Excalidraw** community plugin.
- [ ] Open Settings → Files & Links → set default attachment folder to `assets/screenshots`.
- [ ] (Optional) Install **Attachment Management** if per-folder overrides are needed later.
- [ ] Enable Canvas core plugin (on by default; verify under Settings → Core plugins).
- [ ] Add `.obsidian/snippets/kb.css` if you want the per-type cssclass colouring referenced in [README.md → Obsidian vault compatibility](../../README.md#obsidian-vault-compatibility).
