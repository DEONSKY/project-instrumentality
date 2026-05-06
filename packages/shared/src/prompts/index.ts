import type {
  CodeDriftEntry,
  KbDriftEntry,
  StandardsDriftEntry,
  PromotionEntry,
  ConformPending,
  LintViolation,
} from "../types.js";
import { codeDriftPrompt } from "./code-drift.js";
import { kbDriftPrompt } from "./kb-drift.js";
import { standardsDriftPrompt } from "./standards-drift.js";
import { promotionPrompt } from "./promotion.js";
import { conformPrompt } from "./conform.js";
import { lintPrompt } from "./lint.js";
import { standardAuthorPrompt, type StandardAuthorMode } from "./standard-author.js";

export type PromptInput =
  | { kind: "code-drift"; entry: CodeDriftEntry }
  | { kind: "kb-drift"; entry: KbDriftEntry }
  | { kind: "standards-drift"; entry: StandardsDriftEntry }
  | { kind: "promotion"; entry: PromotionEntry }
  | { kind: "conform"; entry: ConformPending }
  | { kind: "lint"; entry: LintViolation }
  | { kind: "standard-author"; entry: StandardsDriftEntry; mode: StandardAuthorMode };

export function getActionPrompt(input: PromptInput): string {
  switch (input.kind) {
    case "code-drift":
      return codeDriftPrompt(input.entry);
    case "kb-drift":
      return kbDriftPrompt(input.entry);
    case "standards-drift":
      return standardsDriftPrompt(input.entry);
    case "promotion":
      return promotionPrompt(input.entry);
    case "conform":
      return conformPrompt(input.entry);
    case "lint":
      return lintPrompt(input.entry);
    case "standard-author":
      return standardAuthorPrompt(input.entry, input.mode);
  }
}

export {
  codeDriftPrompt,
  kbDriftPrompt,
  standardsDriftPrompt,
  promotionPrompt,
  conformPrompt,
  lintPrompt,
  standardAuthorPrompt,
};
export type { StandardAuthorMode };
