"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../shared/dist/types.js
var require_types = __commonJS({
  "../shared/dist/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../shared/dist/kb-root.js
var require_kb_root = __commonJS({
  "../shared/dist/kb-root.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2)
            if (Object.prototype.hasOwnProperty.call(o2, k))
              ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++)
            if (k[i] !== "default")
              __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.findKbRoot = findKbRoot2;
    exports2.kbSyncPath = kbSyncPath;
    var fs2 = __importStar(require("fs"));
    var path3 = __importStar(require("path"));
    var KB_INDICATORS = [
      ["knowledge", "_mcp", "server.js"],
      ["knowledge", "sync"],
      ["knowledge", "_rules.md"],
      ["knowledge", "_index.yaml"]
    ];
    function isKbRoot(dir) {
      for (const segs of KB_INDICATORS) {
        if (fs2.existsSync(path3.join(dir, ...segs)))
          return true;
      }
      return false;
    }
    function findKbRoot2(startPaths) {
      for (const start of startPaths) {
        let dir = path3.resolve(start);
        while (true) {
          if (isKbRoot(dir))
            return dir;
          const parent = path3.dirname(dir);
          if (parent === dir)
            break;
          dir = parent;
        }
      }
      return null;
    }
    function kbSyncPath(kbRoot, ...segments) {
      return path3.join(kbRoot, "knowledge", "sync", ...segments);
    }
  }
});

// ../shared/dist/parsers/baseline.js
var require_baseline = __commonJS({
  "../shared/dist/parsers/baseline.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseBaseline = parseBaseline;
    exports2.splitHeaderAndBlocks = splitHeaderAndBlocks;
    var BASELINE_RE = /<!--\s*baseline:\s*([0-9a-f]{7,40})\s*-->/i;
    function parseBaseline(content) {
      const m = content.match(BASELINE_RE);
      return { sha: m ? m[1] : null };
    }
    function splitHeaderAndBlocks(content) {
      const headerEnd = content.indexOf("\n## ");
      const header = headerEnd === -1 ? content : content.slice(0, headerEnd);
      const entriesStr = headerEnd === -1 ? "" : content.slice(headerEnd + 1);
      const blocks = entriesStr.split(/\n(?=## )/).filter((b) => b.trim());
      return { header, blocks };
    }
  }
});

// ../shared/dist/parsers/code-drift.js
var require_code_drift = __commonJS({
  "../shared/dist/parsers/code-drift.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2)
            if (Object.prototype.hasOwnProperty.call(o2, k))
              ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++)
            if (k[i] !== "default")
              __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseCodeDrift = parseCodeDrift;
    exports2.readCodeDrift = readCodeDrift;
    var fs2 = __importStar(require("fs"));
    var baseline_js_1 = require_baseline();
    var kb_root_js_1 = require_kb_root();
    var FILE_LINE_RE = /^\s+-\s+`([^`]+)`(?:\s+←\s+renamed from\s+`([^`]+)`)?\s+—\s+since\s+`([^`]+)`\s+\(([^)]+)\)(?:,\s+latest\s+`([^`]+)`\s+\(([^)]+)\))?/;
    function parseCodeDrift(content) {
      const baseline = (0, baseline_js_1.parseBaseline)(content);
      const { blocks } = (0, baseline_js_1.splitHeaderAndBlocks)(content);
      const entries = [];
      for (const block of blocks) {
        const headingMatch = block.match(/^## (.+)/);
        const kbTarget = headingMatch ? headingMatch[1].trim() : null;
        if (!kbTarget)
          continue;
        const hasShared = /\*\*Shared module:\*\*\s*true/.test(block);
        const codeFiles = [];
        for (const line of block.split("\n")) {
          const m = line.match(FILE_LINE_RE);
          if (!m)
            continue;
          const f = {
            path: m[1],
            sinceCommit: m[3],
            sinceDate: m[4]
          };
          if (m[2])
            f.renamedFrom = m[2];
          if (m[5]) {
            f.latestCommit = m[5];
            f.latestDate = m[6];
          }
          codeFiles.push(f);
        }
        entries.push({ kind: "code-drift", kbTarget, codeFiles, hasShared });
      }
      return { entries, baseline };
    }
    function readCodeDrift(kbRoot) {
      const file = (0, kb_root_js_1.kbSyncPath)(kbRoot, "code-drift.md");
      if (!fs2.existsSync(file))
        return { entries: [], baseline: { sha: null } };
      return parseCodeDrift(fs2.readFileSync(file, "utf8"));
    }
  }
});

// ../shared/dist/parsers/kb-drift.js
var require_kb_drift = __commonJS({
  "../shared/dist/parsers/kb-drift.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2)
            if (Object.prototype.hasOwnProperty.call(o2, k))
              ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++)
            if (k[i] !== "default")
              __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseKbDrift = parseKbDrift;
    exports2.readKbDrift = readKbDrift;
    var fs2 = __importStar(require("fs"));
    var baseline_js_1 = require_baseline();
    var kb_root_js_1 = require_kb_root();
    function parseKbDrift(content) {
      const baseline = (0, baseline_js_1.parseBaseline)(content);
      const { blocks } = (0, baseline_js_1.splitHeaderAndBlocks)(content);
      const entries = [];
      for (const block of blocks) {
        const headingMatch = block.match(/^## (.+)/);
        const kbFile = headingMatch ? headingMatch[1].trim() : null;
        if (!kbFile)
          continue;
        const renamedMatch = block.match(/\*\*Renamed from:\*\*\s*`([^`]+)`/);
        const sinceMatch = block.match(/\*\*Since:\*\*\s*`([^`]+)`\s*\(([^)]+)\)/);
        const latestMatch = block.match(/\*\*Latest:\*\*\s*`([^`]+)`\s*\(([^)]+)\)/);
        const unmapped = /KB spec changed without mapped code paths/.test(block);
        const codeAreas = [];
        const references = [];
        let inCodeAreas = false;
        let inRefs = false;
        let refCount;
        for (const line of block.split("\n")) {
          if (/^- \*\*Code areas to review:\*\*/.test(line)) {
            inCodeAreas = true;
            inRefs = false;
            continue;
          }
          if (/^- \*\*References to update:\*\*/.test(line)) {
            inCodeAreas = false;
            inRefs = true;
            const countMatch = line.match(/\*\*References to update:\*\*\s*(\d+)\s*file\(s\)\s*contain\s*`\[\[([^\]]+)\]\]`/);
            if (countMatch) {
              refCount = { count: parseInt(countMatch[1], 10), anchor: countMatch[2] };
            } else if (/none found/.test(line)) {
              refCount = { count: 0, anchor: null };
            }
            continue;
          }
          if (/^- \*\*/.test(line)) {
            inCodeAreas = false;
            inRefs = false;
            continue;
          }
          if (inCodeAreas) {
            const m = line.match(/^\s+-\s+`([^`]+)`/);
            if (m)
              codeAreas.push(m[1]);
          }
          if (inRefs) {
            const m = line.match(/^\s+-\s+`([^`]+)`/);
            if (m)
              references.push(m[1]);
          }
        }
        const entry = {
          kind: "kb-drift",
          kbFile,
          codeAreas,
          references,
          unmapped
        };
        if (renamedMatch)
          entry.renamedFrom = renamedMatch[1];
        if (refCount)
          entry.refCount = refCount;
        if (sinceMatch) {
          entry.sinceCommit = sinceMatch[1];
          entry.sinceDate = sinceMatch[2];
        }
        if (latestMatch) {
          entry.latestCommit = latestMatch[1];
          entry.latestDate = latestMatch[2];
        }
        entries.push(entry);
      }
      return { entries, baseline };
    }
    function readKbDrift(kbRoot) {
      const file = (0, kb_root_js_1.kbSyncPath)(kbRoot, "kb-drift.md");
      if (!fs2.existsSync(file))
        return { entries: [], baseline: { sha: null } };
      return parseKbDrift(fs2.readFileSync(file, "utf8"));
    }
  }
});

// ../shared/dist/parsers/standards-drift.js
var require_standards_drift = __commonJS({
  "../shared/dist/parsers/standards-drift.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2)
            if (Object.prototype.hasOwnProperty.call(o2, k))
              ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++)
            if (k[i] !== "default")
              __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseStandardsDrift = parseStandardsDrift;
    exports2.readStandardsDrift = readStandardsDrift;
    var fs2 = __importStar(require("fs"));
    var baseline_js_1 = require_baseline();
    var kb_root_js_1 = require_kb_root();
    var FILE_LINE_RE = /^\s+-\s+`([^`]+)`\s+—\s+since\s+`([^`]+)`\s+\(([^)]+)\)(?:,\s+latest\s+`([^`]+)`\s+\(([^)]+)\))?/;
    function parseStandardsDrift(content) {
      const baseline = (0, baseline_js_1.parseBaseline)(content);
      const { blocks } = (0, baseline_js_1.splitHeaderAndBlocks)(content);
      const entries = [];
      for (const block of blocks) {
        const headingMatch = block.match(/^## (.+)/);
        const queueKey = headingMatch ? headingMatch[1].trim() : null;
        if (!queueKey)
          continue;
        const stdMatch = block.match(/\*\*Standard:\*\*\s*`([^`]+)`(?:\s*\(([^)]+)\))?/);
        const ruleMatch = block.match(/\*\*Rule:\*\*\s*`([^`]+)`\s*—\s*(\w+)/);
        const reasonMatch = block.match(/\*\*Reason:\*\*\s*(.+?)(?:\n|$)/);
        const filesByParty = {};
        let currentParty = null;
        let inFiles = false;
        for (const line of block.split("\n")) {
          const partyMatch = line.match(/^- \*\*Files(?:\s*\(party:\s*([^)]+)\))?:\*\*/);
          if (partyMatch) {
            inFiles = true;
            currentParty = partyMatch[1] || null;
            const key = currentParty || "_";
            if (!filesByParty[key])
              filesByParty[key] = [];
            continue;
          }
          if (/^- \*\*/.test(line)) {
            inFiles = false;
            continue;
          }
          if (!inFiles)
            continue;
          const m = line.match(FILE_LINE_RE);
          if (!m)
            continue;
          const partyKey = currentParty || "_";
          const f = {
            path: m[1],
            sinceCommit: m[2],
            sinceDate: m[3]
          };
          if (m[4]) {
            f.latestCommit = m[4];
            f.latestDate = m[5];
          }
          filesByParty[partyKey].push(f);
        }
        entries.push({
          kind: "standards-drift",
          queueKey,
          standardId: stdMatch ? stdMatch[1] : null,
          standardKind: stdMatch ? stdMatch[2] || null : null,
          ruleId: ruleMatch ? ruleMatch[1] : null,
          severity: ruleMatch ? ruleMatch[2] : null,
          reason: reasonMatch ? reasonMatch[1].trim() : null,
          filesByParty
        });
      }
      return { entries, baseline };
    }
    function readStandardsDrift(kbRoot) {
      const file = (0, kb_root_js_1.kbSyncPath)(kbRoot, "standards-drift.md");
      if (!fs2.existsSync(file))
        return { entries: [], baseline: { sha: null } };
      return parseStandardsDrift(fs2.readFileSync(file, "utf8"));
    }
  }
});

// ../shared/dist/parsers/conform-pending.js
var require_conform_pending = __commonJS({
  "../shared/dist/parsers/conform-pending.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2)
            if (Object.prototype.hasOwnProperty.call(o2, k))
              ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++)
            if (k[i] !== "default")
              __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseConformPending = parseConformPending;
    exports2.readConformPending = readConformPending;
    exports2.conformPendingDir = conformPendingDir;
    exports2.resolveStandardPath = resolveStandardPath2;
    var fs2 = __importStar(require("fs"));
    var path3 = __importStar(require("path"));
    var kb_root_js_1 = require_kb_root();
    var STANDARD_GROUPS = ["code", "contracts", "knowledge", "process"];
    function parseConformPending(content) {
      try {
        const data = JSON.parse(content);
        if (!data || typeof data !== "object")
          return null;
        if (data.mode !== "current" && data.mode !== "aspirational")
          return null;
        return {
          mode: data.mode,
          scope: data.scope ?? null,
          requested: Array.isArray(data.requested) ? data.requested : [],
          head_sha_short: typeof data.head_sha_short === "string" ? data.head_sha_short : "",
          head_date: typeof data.head_date === "string" ? data.head_date : ""
        };
      } catch {
        return null;
      }
    }
    function readConformPending(kbRoot, mode) {
      const file = (0, kb_root_js_1.kbSyncPath)(kbRoot, ".conform-pending", `${mode}.json`);
      if (!fs2.existsSync(file))
        return null;
      return parseConformPending(fs2.readFileSync(file, "utf8"));
    }
    function conformPendingDir(kbRoot) {
      return path3.join((0, kb_root_js_1.kbSyncPath)(kbRoot, ".conform-pending"));
    }
    function resolveStandardPath2(kbRoot, standardId) {
      if (!standardId)
        return null;
      const standardsDir = path3.join(kbRoot, "knowledge", "standards");
      for (const group of STANDARD_GROUPS) {
        const candidate = path3.join(standardsDir, group, `${standardId}.md`);
        if (fs2.existsSync(candidate))
          return candidate;
      }
      return null;
    }
  }
});

// ../shared/dist/parsers/promotions.js
var require_promotions = __commonJS({
  "../shared/dist/parsers/promotions.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2)
            if (Object.prototype.hasOwnProperty.call(o2, k))
              ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++)
            if (k[i] !== "default")
              __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parsePromotions = parsePromotions;
    exports2.readPromotions = readPromotions;
    var fs2 = __importStar(require("fs"));
    var baseline_js_1 = require_baseline();
    var kb_root_js_1 = require_kb_root();
    var FILE_LINE_RE = /^\s+-\s+`([^`]+)`\s+—\s+promoted\s+`([^`]+)`(?:,\s+note:\s+"((?:[^"\\]|\\.)*)")?/;
    function parsePromotions(content) {
      const { blocks } = (0, baseline_js_1.splitHeaderAndBlocks)(content);
      const entries = [];
      for (const block of blocks) {
        const headingMatch = block.match(/^## (.+)/);
        const queueKey = headingMatch ? headingMatch[1].trim() : null;
        if (!queueKey)
          continue;
        const stdMatch = block.match(/\*\*Standard:\*\*\s*`([^`]+)`(?:\s*\(([^)]+)\))?/);
        const ruleMatch = block.match(/\*\*Rule:\*\*\s*`([^`]+)`\s*—\s*(\w+)/);
        const fpMatch = block.match(/\*\*Rule fingerprint:\*\*\s*`([^`]+)`/);
        const files = [];
        let inFiles = false;
        for (const line of block.split("\n")) {
          if (/^- \*\*Files:\*\*/.test(line)) {
            inFiles = true;
            continue;
          }
          if (/^- \*\*/.test(line)) {
            inFiles = false;
            continue;
          }
          if (!inFiles)
            continue;
          const m = line.match(FILE_LINE_RE);
          if (!m)
            continue;
          const f = {
            path: m[1],
            promotedAt: m[2]
          };
          if (m[3])
            f.note = m[3].replace(/\\"/g, '"');
          files.push(f);
        }
        const [defaultStd, defaultRule] = queueKey.split(".");
        entries.push({
          queueKey,
          standardId: stdMatch ? stdMatch[1] : defaultStd ?? null,
          standardKind: stdMatch ? stdMatch[2] || null : null,
          ruleId: ruleMatch ? ruleMatch[1] : defaultRule ?? null,
          severity: ruleMatch ? ruleMatch[2] : null,
          ruleFingerprint: fpMatch ? fpMatch[1] : null,
          files
        });
      }
      return entries;
    }
    function readPromotions(kbRoot) {
      const file = (0, kb_root_js_1.kbSyncPath)(kbRoot, "standards-promotions.md");
      if (!fs2.existsSync(file))
        return [];
      return parsePromotions(fs2.readFileSync(file, "utf8"));
    }
  }
});

// ../shared/dist/parsers/lint.js
var require_lint = __commonJS({
  "../shared/dist/parsers/lint.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2)
            if (Object.prototype.hasOwnProperty.call(o2, k))
              ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++)
            if (k[i] !== "default")
              __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseLintStderr = parseLintStderr;
    exports2.runLint = runLint;
    var node_child_process_1 = require("child_process");
    var fs2 = __importStar(require("fs"));
    var path3 = __importStar(require("path"));
    var LINE_RE = /^\[kb-lint\]\s+(WARN|ERROR)\s+(\S+):\s+(.*)$/;
    function parseLintStderr(stderr) {
      const out = [];
      for (const raw of stderr.split("\n")) {
        const m = raw.match(LINE_RE);
        if (!m)
          continue;
        out.push({
          severity: m[1] === "ERROR" ? "error" : "warn",
          file: m[2],
          message: m[3]
        });
      }
      return out;
    }
    function runLint(kbRoot, opts = {}) {
      if (opts.commandOverride && opts.commandOverride.trim().length > 0) {
        return runShell(opts.commandOverride.trim(), kbRoot);
      }
      const script = path3.join(kbRoot, "knowledge", "_mcp", "scripts", "lint-standalone.js");
      if (!fs2.existsSync(script)) {
        return Promise.resolve({ violations: [], ran: false });
      }
      return runProcess(process.execPath, [script], kbRoot);
    }
    function runShell(command, cwd) {
      return new Promise((resolve) => {
        const child = (0, node_child_process_1.spawn)(command, {
          cwd,
          shell: true,
          stdio: ["ignore", "ignore", "pipe"]
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString("utf8");
        });
        child.on("error", (err) => {
          resolve({ violations: [], ran: false, error: err.message });
        });
        child.on("close", () => {
          resolve({ violations: parseLintStderr(stderr), ran: true });
        });
      });
    }
    function runProcess(bin, args, cwd) {
      return new Promise((resolve) => {
        const child = (0, node_child_process_1.spawn)(bin, args, {
          cwd,
          stdio: ["ignore", "ignore", "pipe"]
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString("utf8");
        });
        child.on("error", (err) => {
          resolve({ violations: [], ran: false, error: err.message });
        });
        child.on("close", () => {
          resolve({ violations: parseLintStderr(stderr), ran: true });
        });
      });
    }
  }
});

// ../shared/dist/status.js
var require_status = __commonJS({
  "../shared/dist/status.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getStatus = getStatus2;
    var node_child_process_1 = require("child_process");
    var node_util_1 = require("util");
    var code_drift_js_1 = require_code_drift();
    var kb_drift_js_1 = require_kb_drift();
    var standards_drift_js_1 = require_standards_drift();
    var conform_pending_js_1 = require_conform_pending();
    var promotions_js_1 = require_promotions();
    var lint_js_1 = require_lint();
    var execFileP = (0, node_util_1.promisify)(node_child_process_1.execFile);
    async function getCurrentHeadShort(kbRoot) {
      try {
        const { stdout } = await execFileP("git", ["rev-parse", "--short", "HEAD"], {
          cwd: kbRoot
        });
        return stdout.trim() || null;
      } catch {
        return null;
      }
    }
    async function getStatus2(kbRoot, opts = {}) {
      const [codeDrift, kbDrift, standardsDrift, currentPending, asp, promotions, lint, head] = await Promise.all([
        Promise.resolve((0, code_drift_js_1.readCodeDrift)(kbRoot)),
        Promise.resolve((0, kb_drift_js_1.readKbDrift)(kbRoot)),
        Promise.resolve((0, standards_drift_js_1.readStandardsDrift)(kbRoot)),
        Promise.resolve((0, conform_pending_js_1.readConformPending)(kbRoot, "current")),
        Promise.resolve((0, conform_pending_js_1.readConformPending)(kbRoot, "aspirational")),
        Promise.resolve((0, promotions_js_1.readPromotions)(kbRoot)),
        opts.skipLint ? Promise.resolve({ violations: [], ran: false }) : (0, lint_js_1.runLint)(kbRoot, { commandOverride: opts.lintCommand }),
        getCurrentHeadShort(kbRoot)
      ]);
      const stale = (recorded) => head !== null && recorded.length > 0 && !head.startsWith(recorded) && !recorded.startsWith(head);
      const conformCurrent = currentPending ? { ...currentPending, staleAgainstHead: stale(currentPending.head_sha_short) } : null;
      const conformAspirational = asp ? { ...asp, staleAgainstHead: stale(asp.head_sha_short) } : null;
      const driftCount = codeDrift.entries.length + kbDrift.entries.length + standardsDrift.entries.length;
      const conformPendingCount = (conformCurrent?.requested.length ?? 0) + (conformAspirational?.requested.length ?? 0);
      const lintErrors = lint.violations.filter((v) => v.severity === "error").length;
      const lintWarnings = lint.violations.filter((v) => v.severity === "warn").length;
      return {
        kbRoot,
        currentHeadShort: head,
        codeDrift,
        kbDrift,
        standardsDrift,
        conformPending: { current: conformCurrent, aspirational: conformAspirational },
        promotions,
        lint,
        totals: {
          drifts: driftCount,
          conformPending: conformPendingCount,
          promotions: promotions.length,
          lintErrors,
          lintWarnings,
          grand: driftCount + conformPendingCount + promotions.length + lintErrors + lintWarnings
        }
      };
    }
  }
});

// ../shared/dist/entry-id.js
var require_entry_id = __commonJS({
  "../shared/dist/entry-id.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.stableEntryId = stableEntryId2;
    function stableEntryId2(seed, fallbackIndex) {
      const safe = (seed || "").replace(/[^a-zA-Z0-9_.\-/:@]/g, "_").slice(0, 120);
      return safe || `idx${fallbackIndex}`;
    }
  }
});

// ../shared/dist/prompts/code-drift.js
var require_code_drift2 = __commonJS({
  "../shared/dist/prompts/code-drift.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.codeDriftPrompt = codeDriftPrompt;
    function codeDriftPrompt(entry) {
      const fileLines = entry.codeFiles.map((f) => {
        const renamed = f.renamedFrom ? ` (renamed from \`${f.renamedFrom}\`)` : "";
        const since = f.sinceCommit ? ` since \`${f.sinceCommit}\`` : "";
        const latest = f.latestCommit && f.latestCommit !== f.sinceCommit ? `, latest \`${f.latestCommit}\`` : "";
        return `- \`${f.path}\`${renamed}${since}${latest}`;
      }).join("\n");
      const sharedNote = entry.hasShared ? "\n\nNote: at least one of these files is a shared module \u2014 make sure the KB update reflects cross-cutting impact." : "";
      return `Code drift: KB target \`${entry.kbTarget}\` is out of sync.

The following code files changed without a matching KB update:

${fileLines}${sharedNote}

Please use the \`kb_drift\` tool to inspect the drift, decide whether the KB target needs updating, and resolve the entry. If the KB needs an update, draft it; if the code change is intentional and the KB already covers it, dismiss the entry with a reason.`;
    }
  }
});

// ../shared/dist/prompts/kb-drift.js
var require_kb_drift2 = __commonJS({
  "../shared/dist/prompts/kb-drift.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.kbDriftPrompt = kbDriftPrompt;
    function kbDriftPrompt(entry) {
      const renamed = entry.renamedFrom ? `

Note: this KB file was renamed from \`${entry.renamedFrom}\`.` : "";
      const codeAreas = entry.codeAreas.length > 0 ? entry.codeAreas.map((p) => `- \`${p}\``).join("\n") : "- _(no mapped code paths \u2014 the KB has no `code_path_patterns` for this file)_";
      const refs = entry.refCount && entry.refCount.count > 0 ? `

${entry.refCount.count} other KB file(s) reference this one via \`[[${entry.refCount.anchor}]]\`. They may need updating too.` : "";
      const since = entry.sinceCommit ? `

Drift baseline: \`${entry.sinceCommit}\`` : "";
      const unmapped = entry.unmapped ? "\n\nWarning: KB spec changed but no code paths are mapped to it \u2014 verify the implementation manually, then add `code_path_patterns` in `_rules.md` to enable future automatic tracking." : "";
      return `KB drift: \`${entry.kbFile}\` was edited; code may be stale.${renamed}

Code areas to review:

${codeAreas}${refs}${since}${unmapped}

Please use \`kb_drift\` to inspect the entry. Decide whether the implementation needs to catch up to the new KB spec. If yes, draft the code change; if no, dismiss with a reason.`;
    }
  }
});

// ../shared/dist/prompts/standards-drift.js
var require_standards_drift2 = __commonJS({
  "../shared/dist/prompts/standards-drift.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.standardsDriftPrompt = standardsDriftPrompt;
    function standardsDriftPrompt(entry) {
      const partyKeys = Object.keys(entry.filesByParty);
      let filesBlock;
      if (partyKeys.length === 0) {
        filesBlock = "_(no files recorded)_";
      } else if (partyKeys.length === 1 && partyKeys[0] === "_") {
        filesBlock = entry.filesByParty["_"].map((f) => `- \`${f.path}\``).join("\n");
      } else {
        filesBlock = partyKeys.sort().map((party) => {
          const label = party === "_" ? "Files" : `Files (party: ${party})`;
          const lines = entry.filesByParty[party].map((f) => `  - \`${f.path}\``).join("\n");
          return `**${label}:**
${lines}`;
        }).join("\n\n");
      }
      const reason = entry.reason ? `

Reason recorded: ${entry.reason}` : "";
      const stdLine = `\`${entry.standardId}\`${entry.standardKind ? ` (${entry.standardKind})` : ""}`;
      const ruleLine = `\`${entry.ruleId}\` \u2014 ${entry.severity ?? "warn"}`;
      return `Standards drift: rule \`${entry.queueKey}\` is failing.

- Standard: ${stdLine}
- Rule: ${ruleLine}

Affected files:

${filesBlock}${reason}

Please use \`kb_conform\` to resolve this entry. Pick one of:

- \`applied\` \u2014 code was fixed to satisfy the rule
- \`exempted\` \u2014 write an exception into the rule for these files
- \`promoted\` \u2014 escalate to senior review (suppresses re-detection until the rule changes)
- \`dismissed\` \u2014 false positive`;
    }
  }
});

// ../shared/dist/prompts/promotion.js
var require_promotion = __commonJS({
  "../shared/dist/prompts/promotion.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.promotionPrompt = promotionPrompt;
    function promotionPrompt(entry) {
      const fileLines = entry.files.map((f) => {
        const note = f.note ? ` \u2014 note: "${f.note}"` : "";
        return `- \`${f.path}\` (promoted ${f.promotedAt})${note}`;
      }).join("\n");
      return `Pending promotion: \`${entry.queueKey}\` is awaiting senior review.

- Standard: \`${entry.standardId}\`${entry.standardKind ? ` (${entry.standardKind})` : ""}
- Rule: \`${entry.ruleId}\` \u2014 ${entry.severity ?? "warn"}

Promoted files:

${fileLines}

A senior reviewer should decide whether to update the rule itself or close the promotion. Use \`kb_conform\` with \`closed_promotion: [...]\` to close (writes an exception to the rule and removes the entry); update the rule definition directly to auto-close on fingerprint mismatch.`;
    }
  }
});

// ../shared/dist/prompts/conform.js
var require_conform = __commonJS({
  "../shared/dist/prompts/conform.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.conformPrompt = conformPrompt;
    function conformPrompt(entry) {
      const scopeLine = entry.scope ? `
- Scope: \`${entry.scope}\`` : "";
      const reqLines = entry.requested.map((r) => `- \`${r.file}\` against \`${r.standard_id}\` (rules: ${r.rule_ids.map((x) => `\`${x}\``).join(", ")})`).join("\n");
      const reqBlock = reqLines.length > 0 ? reqLines : "_(no pending evaluations)_";
      return `Conform pending (mode: ${entry.mode}) at baseline \`${entry.head_sha_short}\` (${entry.head_date}).${scopeLine}

The agent owes back judgments for these (file, standard, rule) triples:

${reqBlock}

Please call \`kb_conform\` with \`submit_judgments\` covering ALL of the requested triples in a single call (the tool validates completeness). For each triple, pick \`pass\`, \`fail\`, or \`n/a\` and supply a short reason for fails.`;
    }
  }
});

// ../shared/dist/prompts/lint.js
var require_lint2 = __commonJS({
  "../shared/dist/prompts/lint.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.lintPrompt = lintPrompt;
    function lintPrompt(entry) {
      return `Lint ${entry.severity}: \`${entry.file}\`

> ${entry.message}

Please open the file, fix the issue, and re-run lint. Common fixes: add the missing front-matter field, resolve the wikilink target, remove the conflict markers, or move misplaced fields to \`_index.yaml\`.`;
    }
  }
});

// ../shared/dist/prompts/index.js
var require_prompts = __commonJS({
  "../shared/dist/prompts/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.lintPrompt = exports2.conformPrompt = exports2.promotionPrompt = exports2.standardsDriftPrompt = exports2.kbDriftPrompt = exports2.codeDriftPrompt = void 0;
    exports2.getActionPrompt = getActionPrompt2;
    var code_drift_js_1 = require_code_drift2();
    Object.defineProperty(exports2, "codeDriftPrompt", { enumerable: true, get: function() {
      return code_drift_js_1.codeDriftPrompt;
    } });
    var kb_drift_js_1 = require_kb_drift2();
    Object.defineProperty(exports2, "kbDriftPrompt", { enumerable: true, get: function() {
      return kb_drift_js_1.kbDriftPrompt;
    } });
    var standards_drift_js_1 = require_standards_drift2();
    Object.defineProperty(exports2, "standardsDriftPrompt", { enumerable: true, get: function() {
      return standards_drift_js_1.standardsDriftPrompt;
    } });
    var promotion_js_1 = require_promotion();
    Object.defineProperty(exports2, "promotionPrompt", { enumerable: true, get: function() {
      return promotion_js_1.promotionPrompt;
    } });
    var conform_js_1 = require_conform();
    Object.defineProperty(exports2, "conformPrompt", { enumerable: true, get: function() {
      return conform_js_1.conformPrompt;
    } });
    var lint_js_1 = require_lint2();
    Object.defineProperty(exports2, "lintPrompt", { enumerable: true, get: function() {
      return lint_js_1.lintPrompt;
    } });
    function getActionPrompt2(input) {
      switch (input.kind) {
        case "code-drift":
          return (0, code_drift_js_1.codeDriftPrompt)(input.entry);
        case "kb-drift":
          return (0, kb_drift_js_1.kbDriftPrompt)(input.entry);
        case "standards-drift":
          return (0, standards_drift_js_1.standardsDriftPrompt)(input.entry);
        case "promotion":
          return (0, promotion_js_1.promotionPrompt)(input.entry);
        case "conform":
          return (0, conform_js_1.conformPrompt)(input.entry);
        case "lint":
          return (0, lint_js_1.lintPrompt)(input.entry);
      }
    }
  }
});

// ../shared/dist/index.js
var require_dist = __commonJS({
  "../shared/dist/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m)
        if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p))
          __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getActionPrompt = exports2.runLint = exports2.parseLintStderr = exports2.readPromotions = exports2.parsePromotions = exports2.resolveStandardPath = exports2.readConformPending = exports2.parseConformPending = exports2.readStandardsDrift = exports2.parseStandardsDrift = exports2.readKbDrift = exports2.parseKbDrift = exports2.readCodeDrift = exports2.parseCodeDrift = exports2.stableEntryId = void 0;
    __exportStar(require_types(), exports2);
    __exportStar(require_kb_root(), exports2);
    __exportStar(require_status(), exports2);
    var entry_id_js_1 = require_entry_id();
    Object.defineProperty(exports2, "stableEntryId", { enumerable: true, get: function() {
      return entry_id_js_1.stableEntryId;
    } });
    var code_drift_js_1 = require_code_drift();
    Object.defineProperty(exports2, "parseCodeDrift", { enumerable: true, get: function() {
      return code_drift_js_1.parseCodeDrift;
    } });
    Object.defineProperty(exports2, "readCodeDrift", { enumerable: true, get: function() {
      return code_drift_js_1.readCodeDrift;
    } });
    var kb_drift_js_1 = require_kb_drift();
    Object.defineProperty(exports2, "parseKbDrift", { enumerable: true, get: function() {
      return kb_drift_js_1.parseKbDrift;
    } });
    Object.defineProperty(exports2, "readKbDrift", { enumerable: true, get: function() {
      return kb_drift_js_1.readKbDrift;
    } });
    var standards_drift_js_1 = require_standards_drift();
    Object.defineProperty(exports2, "parseStandardsDrift", { enumerable: true, get: function() {
      return standards_drift_js_1.parseStandardsDrift;
    } });
    Object.defineProperty(exports2, "readStandardsDrift", { enumerable: true, get: function() {
      return standards_drift_js_1.readStandardsDrift;
    } });
    var conform_pending_js_1 = require_conform_pending();
    Object.defineProperty(exports2, "parseConformPending", { enumerable: true, get: function() {
      return conform_pending_js_1.parseConformPending;
    } });
    Object.defineProperty(exports2, "readConformPending", { enumerable: true, get: function() {
      return conform_pending_js_1.readConformPending;
    } });
    Object.defineProperty(exports2, "resolveStandardPath", { enumerable: true, get: function() {
      return conform_pending_js_1.resolveStandardPath;
    } });
    var promotions_js_1 = require_promotions();
    Object.defineProperty(exports2, "parsePromotions", { enumerable: true, get: function() {
      return promotions_js_1.parsePromotions;
    } });
    Object.defineProperty(exports2, "readPromotions", { enumerable: true, get: function() {
      return promotions_js_1.readPromotions;
    } });
    var lint_js_1 = require_lint();
    Object.defineProperty(exports2, "parseLintStderr", { enumerable: true, get: function() {
      return lint_js_1.parseLintStderr;
    } });
    Object.defineProperty(exports2, "runLint", { enumerable: true, get: function() {
      return lint_js_1.runLint;
    } });
    var index_js_1 = require_prompts();
    Object.defineProperty(exports2, "getActionPrompt", { enumerable: true, get: function() {
      return index_js_1.getActionPrompt;
    } });
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => InstrumentalityPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");
var import_shared2 = __toESM(require_dist());

// src/view.ts
var import_obsidian = require("obsidian");
var path2 = __toESM(require("path"));
var import_shared = __toESM(require_dist());

// src/watcher.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var DEBOUNCE_MS = 300;
var POLL_FALLBACK_MS = 5e3;
var SyncWatcher = class {
  constructor(kbRoot, onChange) {
    this.kbRoot = kbRoot;
    this.onChange = onChange;
  }
  fsWatcher = null;
  pollHandle = null;
  debounceTimer = null;
  lastMtimeSum = 0;
  start() {
    const dir = path.join(this.kbRoot, "knowledge", "sync");
    if (!fs.existsSync(dir))
      return;
    try {
      this.fsWatcher = fs.watch(dir, { recursive: true }, () => this.scheduleFire());
    } catch {
      try {
        this.fsWatcher = fs.watch(dir, () => this.scheduleFire());
      } catch {
      }
    }
    this.lastMtimeSum = this.computeMtimeSum(dir);
    this.pollHandle = setInterval(() => {
      const next = this.computeMtimeSum(dir);
      if (next !== this.lastMtimeSum) {
        this.lastMtimeSum = next;
        this.scheduleFire();
      }
    }, POLL_FALLBACK_MS);
  }
  stop() {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
  scheduleFire() {
    if (this.debounceTimer)
      clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      try {
        this.onChange();
      } catch (err) {
        console.error("[instrumentality] onChange error:", err);
      }
    }, DEBOUNCE_MS);
  }
  /**
   * Sum of mtimes for files in the sync dir. Cheap fingerprint that detects
   * any modification without parsing or hashing.
   */
  computeMtimeSum(dir) {
    let sum = 0;
    try {
      const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory())
            walk(full);
          else if (entry.isFile()) {
            try {
              sum += fs.statSync(full).mtimeMs;
            } catch {
            }
          }
        }
      };
      walk(dir);
    } catch {
    }
    return sum;
  }
};

// src/view.ts
var VIEW_TYPE_INSTRUMENTALITY = "instrumentality-view";
var ICON_ID = "instrumentality-icon";
var InstrumentalityView = class extends import_obsidian.ItemView {
  constructor(leaf, getKbRoot) {
    super(leaf);
    this.getKbRoot = getKbRoot;
  }
  status = null;
  kbRoot = null;
  watcher = null;
  entryIndex = /* @__PURE__ */ new Map();
  filterSearch = "";
  hiddenSections = /* @__PURE__ */ new Set();
  severityFilter = /* @__PURE__ */ new Set();
  getViewType() {
    return VIEW_TYPE_INSTRUMENTALITY;
  }
  getDisplayText() {
    return "Instrumentality";
  }
  getIcon() {
    return ICON_ID;
  }
  async onOpen() {
    this.contentEl.addClass("instrumentality-view");
    this.kbRoot = this.getKbRoot();
    if (this.kbRoot) {
      this.watcher = new SyncWatcher(this.kbRoot, () => void this.refresh());
      this.watcher.start();
    }
    await this.refresh();
  }
  async onClose() {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
  }
  async refresh() {
    const root = this.getKbRoot();
    this.kbRoot = root;
    if (!root) {
      this.status = null;
      this.render();
      return;
    }
    try {
      this.status = await (0, import_shared.getStatus)(root, { skipLint: true });
    } catch (err) {
      console.error("[instrumentality] getStatus failed:", err);
      this.status = null;
    }
    this.entryIndex = this.buildEntryIndex(this.status);
    this.render();
  }
  // ── rendering ──────────────────────────────────────────────────────────
  render() {
    this.contentEl.empty();
    const root = this.contentEl;
    if (!this.kbRoot) {
      root.createDiv({
        cls: "instrumentality-empty",
        text: "Knowledge base not detected. Open a vault containing a knowledge/ directory (with sync/, _rules.md, or _index.yaml)."
      });
      return;
    }
    if (!this.status) {
      root.createDiv({ cls: "instrumentality-empty", text: "Loading sync state\u2026" });
      return;
    }
    this.renderHeader(root);
    this.renderTotals(root);
    this.renderFilterBar(root);
    this.renderSections(root);
  }
  renderHeader(parent) {
    const header = parent.createDiv({ cls: "instrumentality-header" });
    const left = header.createDiv();
    left.createEl("h2", { text: "Instrumentality" });
    const meta = left.createDiv({ cls: "instrumentality-head-meta" });
    meta.createSpan({ text: "HEAD: " });
    meta.createEl("code", { text: this.status?.currentHeadShort ?? "?" });
    const tools = header.createDiv({ cls: "instrumentality-tools" });
    const refresh = tools.createEl("button", { text: "Refresh", cls: "mod-cta" });
    refresh.addEventListener("click", () => void this.refresh());
  }
  renderTotals(parent) {
    const totals = this.status.totals;
    const grid = parent.createDiv({ cls: "instrumentality-totals" });
    this.totalCard(grid, "Drifts", totals.drifts, totals.drifts > 0 ? "warn" : "ok");
    this.totalCard(
      grid,
      "Conform Pending",
      totals.conformPending,
      totals.conformPending > 0 ? "warn" : "ok"
    );
    this.totalCard(grid, "Promotions", totals.promotions, "");
    this.totalCard(
      grid,
      "Lint Errors",
      totals.lintErrors,
      totals.lintErrors > 0 ? "error" : "ok"
    );
    this.totalCard(
      grid,
      "Lint Warnings",
      totals.lintWarnings,
      totals.lintWarnings > 0 ? "warn" : "ok"
    );
  }
  totalCard(parent, label, n, cls) {
    const card = parent.createDiv({ cls: `instrumentality-total-card ${cls}` });
    card.createDiv({ cls: "n", text: String(n) });
    card.createDiv({ cls: "l", text: label });
  }
  renderFilterBar(parent) {
    const bar = parent.createDiv({ cls: "instrumentality-filter-bar" });
    const search = bar.createEl("input", {
      attr: { type: "search", placeholder: "Filter entries\u2026" }
    });
    search.value = this.filterSearch;
    search.addEventListener("input", (e) => {
      const v = e.target.value;
      this.filterSearch = v;
      this.applyFilterDom();
    });
    const severityGroup = bar.createDiv({ cls: "instrumentality-chip-group" });
    for (const sev of ["error", "warn", "info"]) {
      const chip = severityGroup.createSpan({
        cls: `instrumentality-chip sev-${sev}` + (this.severityFilter.has(sev) ? " on" : ""),
        text: sev
      });
      chip.addEventListener("click", () => {
        if (this.severityFilter.has(sev))
          this.severityFilter.delete(sev);
        else
          this.severityFilter.add(sev);
        chip.toggleClass("on", this.severityFilter.has(sev));
        this.applyFilterDom();
      });
    }
    const sectionGroup = bar.createDiv({ cls: "instrumentality-chip-group" });
    const sections = [
      { key: "code-drift", label: "Code" },
      { key: "kb-drift", label: "KB" },
      { key: "standards-drift", label: "Standards" },
      { key: "conform-pending", label: "Conform" },
      { key: "promotions", label: "Promotions" },
      { key: "lint", label: "Lint" }
    ];
    for (const s of sections) {
      const visible = !this.hiddenSections.has(s.key);
      const chip = sectionGroup.createSpan({
        cls: "instrumentality-chip section" + (visible ? " on" : ""),
        text: s.label
      });
      chip.addEventListener("click", () => {
        if (this.hiddenSections.has(s.key))
          this.hiddenSections.delete(s.key);
        else
          this.hiddenSections.add(s.key);
        chip.toggleClass("on", !this.hiddenSections.has(s.key));
        this.applyFilterDom();
      });
    }
    const clear = bar.createEl("button", { text: "Clear", cls: "instrumentality-link" });
    clear.addEventListener("click", () => {
      this.filterSearch = "";
      this.severityFilter.clear();
      this.hiddenSections.clear();
      this.render();
    });
  }
  renderSections(parent) {
    const grid = parent.createDiv({ cls: "instrumentality-section-grid" });
    this.renderCodeDriftCard(grid);
    this.renderKbDriftCard(grid);
    this.renderStandardsDriftCard(grid);
    this.renderConformCard(grid);
    this.renderPromotionsCard(grid);
    this.renderLintCard(grid);
    this.applyFilterDom();
  }
  sectionShell(parent, kind, title, count, badgeText) {
    const card = parent.createDiv({ cls: "instrumentality-section-card", attr: { "data-section": kind } });
    const header = card.createEl("header");
    const h2 = header.createEl("h2");
    h2.createSpan({ text: title });
    h2.createSpan({ cls: "count", text: String(count) });
    if (badgeText)
      h2.createSpan({ cls: "badge", text: badgeText });
    return card.createDiv({ cls: "body" });
  }
  placeholder(parent, text) {
    parent.createDiv({ cls: "instrumentality-placeholder", text });
  }
  renderCodeDriftCard(parent) {
    const entries = this.status.codeDrift.entries;
    const baseline = this.status.codeDrift.baseline.sha;
    const body = this.sectionShell(
      parent,
      "code-drift",
      "Code Drifts",
      entries.length,
      baseline ? baseline.slice(0, 7) : void 0
    );
    if (entries.length === 0)
      return this.placeholder(body, "No code drift");
    entries.forEach((e, i) => this.renderCodeDriftRow(body, e, i));
  }
  renderCodeDriftRow(parent, e, i) {
    const id = (0, import_shared.stableEntryId)(e.kbTarget, i);
    const sev = e.hasShared ? "warn" : "info";
    const text = e.kbTarget + " " + e.codeFiles.map((f) => f.path).join(" ");
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: e.kbTarget });
      if (e.hasShared)
        h2.createSpan({ cls: "badge shared", text: "shared" });
    };
    const meta = `${e.codeFiles.length} file(s) \xB7 ${e.codeFiles.slice(0, 3).map((f) => path2.basename(f.path)).join(", ")}${e.codeFiles.length > 3 ? ` (+${e.codeFiles.length - 3})` : ""}`;
    const detail = (d) => {
      const div = d.createDiv({ cls: "detail-meta" });
      const row = div.createDiv();
      row.createSpan({ text: "KB target: " });
      row.createEl("code", { text: e.kbTarget });
    };
    this.entryShell({
      parent,
      section: "code-drift",
      id,
      sev,
      text,
      summary,
      meta,
      detail,
      sourceFile: path2.join("knowledge", e.kbTarget)
    });
  }
  renderKbDriftCard(parent) {
    const entries = this.status.kbDrift.entries;
    const body = this.sectionShell(parent, "kb-drift", "KB Drifts", entries.length);
    if (entries.length === 0)
      return this.placeholder(body, "No KB drift");
    entries.forEach((e, i) => this.renderKbDriftRow(body, e, i));
  }
  renderKbDriftRow(parent, e, i) {
    const id = (0, import_shared.stableEntryId)(e.kbFile, i);
    const sev = e.unmapped ? "warn" : "info";
    const text = e.kbFile + " " + e.codeAreas.join(" ");
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: e.kbFile });
      if (e.unmapped)
        h2.createSpan({ cls: "badge sev-warn", text: "unmapped" });
    };
    const meta = `${e.codeAreas.length} code area(s)${e.refCount && e.refCount.count > 0 ? ` \xB7 ${e.refCount.count} reference(s)` : ""}`;
    const detail = (d) => {
      const div = d.createDiv({ cls: "detail-meta" });
      if (e.renamedFrom) {
        const row = div.createDiv();
        row.createSpan({ text: "Renamed from: " });
        row.createEl("code", { text: e.renamedFrom });
      }
      if (e.sinceCommit) {
        const row = div.createDiv();
        row.createSpan({ text: "Since: " });
        row.createEl("code", { text: e.sinceCommit });
        row.createSpan({ text: ` (${e.sinceDate ?? ""})` });
      }
      const areas = div.createDiv();
      areas.createSpan({ text: "Code areas: " });
      if (e.codeAreas.length === 0) {
        areas.createEl("em", { text: "none mapped" });
      } else {
        e.codeAreas.forEach((p, idx) => {
          if (idx > 0)
            areas.appendText(", ");
          areas.createEl("code", { text: p });
        });
      }
    };
    this.entryShell({
      parent,
      section: "kb-drift",
      id,
      sev,
      text,
      summary,
      meta,
      detail,
      sourceFile: path2.join("knowledge", e.kbFile)
    });
  }
  renderStandardsDriftCard(parent) {
    const entries = this.status.standardsDrift.entries;
    const body = this.sectionShell(parent, "standards-drift", "Standards Drifts", entries.length);
    if (entries.length === 0)
      return this.placeholder(body, "No standards drift");
    entries.forEach((e, i) => this.renderStandardsDriftRow(body, e, i));
  }
  renderStandardsDriftRow(parent, e, i) {
    const id = (0, import_shared.stableEntryId)(e.queueKey, i);
    const sev = e.severity ?? null;
    const fileCount = Object.values(e.filesByParty).reduce((s, fs2) => s + fs2.length, 0);
    const firstFile = Object.values(e.filesByParty).flat()[0]?.path;
    const text = e.queueKey + " " + (e.standardId ?? "") + " " + (e.reason ?? "");
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: e.queueKey });
      if (sev)
        h2.createSpan({ cls: `badge sev-${sev}`, text: sev });
    };
    const meta = `${e.standardId ?? "?"}${e.standardKind ? ` (${e.standardKind})` : ""} \xB7 ${fileCount} file(s)`;
    const detail = (d) => {
      const div = d.createDiv({ cls: "detail-meta" });
      if (e.reason) {
        const row = div.createDiv();
        row.createSpan({ text: "Reason: " });
        row.appendText(e.reason);
      }
      for (const [party, files] of Object.entries(e.filesByParty)) {
        const block = div.createDiv();
        block.createEl("strong", {
          text: party === "_" ? "Files:" : `Files (party: ${party}):`
        });
        const ul = block.createEl("ul");
        for (const f of files) {
          const li = ul.createEl("li");
          li.createEl("code", { text: f.path });
        }
      }
    };
    this.entryShell({
      parent,
      section: "standards-drift",
      id,
      sev: sev ?? "info",
      text,
      summary,
      meta,
      detail,
      sourceFile: firstFile,
      standardId: e.standardId
    });
  }
  renderConformCard(parent) {
    const c = this.status.conformPending.current;
    const a = this.status.conformPending.aspirational;
    const total = (c?.requested.length ?? 0) + (a?.requested.length ?? 0);
    const stale = c?.staleAgainstHead || a?.staleAgainstHead;
    const body = this.sectionShell(
      parent,
      "conform-pending",
      "Conform Pending",
      total,
      stale ? "baseline stale" : void 0
    );
    if (total === 0)
      return this.placeholder(body, "No conform pending");
    for (const p of [c, a]) {
      if (!p || p.requested.length === 0)
        continue;
      p.requested.forEach((r, i) => this.renderConformRow(body, p, r, i));
    }
  }
  renderConformRow(parent, p, r, i) {
    const id = (0, import_shared.stableEntryId)(`${p.mode}:${r.file}:${r.standard_id}`, i);
    const sev = p.staleAgainstHead ? "warn" : "info";
    const text = r.file + " " + r.standard_id + " " + r.rule_ids.join(" ");
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: r.file });
      if (p.staleAgainstHead)
        h2.createSpan({ cls: "badge sev-warn", text: "stale" });
    };
    const meta = `${r.standard_id} \xB7 ${r.rule_ids.join(", ")} (${p.mode} @ ${p.head_sha_short})`;
    const detail = (d) => {
      const div = d.createDiv({ cls: "detail-meta" });
      div.createDiv({ text: `Mode: ${p.mode}` });
      const baseline = div.createDiv();
      baseline.createSpan({ text: "Baseline: " });
      baseline.createEl("code", { text: p.head_sha_short });
      baseline.createSpan({ text: ` (${p.head_date})` });
      if (p.scope) {
        const sc = div.createDiv();
        sc.createSpan({ text: "Scope: " });
        sc.createEl("code", { text: p.scope });
      }
      const std = div.createDiv();
      std.createSpan({ text: "Standard: " });
      std.createEl("code", { text: r.standard_id });
      const rules = div.createDiv();
      rules.createSpan({ text: "Rules: " });
      r.rule_ids.forEach((x, idx) => {
        if (idx > 0)
          rules.appendText(", ");
        rules.createEl("code", { text: x });
      });
    };
    this.entryShell({
      parent,
      section: "conform-pending",
      id,
      sev,
      text,
      summary,
      meta,
      detail,
      sourceFile: r.file,
      standardId: r.standard_id
    });
  }
  renderPromotionsCard(parent) {
    const entries = this.status.promotions;
    const body = this.sectionShell(parent, "promotions", "Pending Promotions", entries.length);
    if (entries.length === 0)
      return this.placeholder(body, "No pending promotions");
    entries.forEach((e, i) => this.renderPromotionRow(body, e, i));
  }
  renderPromotionRow(parent, e, i) {
    const id = (0, import_shared.stableEntryId)(e.queueKey, i);
    const sev = e.severity ?? "info";
    const text = e.queueKey + " " + (e.standardId ?? "") + " " + e.files.map((f) => f.path).join(" ");
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: e.queueKey });
      if (e.severity)
        h2.createSpan({ cls: `badge sev-${e.severity}`, text: e.severity });
    };
    const meta = `${e.files.length} file(s) \xB7 ${e.standardId ?? "?"}`;
    const detail = (d) => {
      const div = d.createDiv({ cls: "detail-meta" });
      const rule = div.createDiv();
      rule.createSpan({ text: "Rule: " });
      rule.createEl("code", { text: e.ruleId ?? "?" });
      if (e.ruleFingerprint) {
        const fp = div.createDiv();
        fp.createSpan({ text: "Fingerprint: " });
        fp.createEl("code", { text: e.ruleFingerprint });
      }
      const filesBlock = div.createDiv();
      filesBlock.createEl("strong", { text: "Files:" });
      const ul = filesBlock.createEl("ul");
      for (const f of e.files) {
        const li = ul.createEl("li");
        li.createEl("code", { text: f.path });
        li.appendText(` \u2014 promoted ${f.promotedAt}`);
        if (f.note) {
          li.appendText(" ");
          li.createEl("em", { text: f.note });
        }
      }
    };
    this.entryShell({
      parent,
      section: "promotions",
      id,
      sev,
      text,
      summary,
      meta,
      detail,
      sourceFile: e.files[0]?.path,
      standardId: e.standardId
    });
  }
  renderLintCard(parent) {
    const v = this.status.lint.violations;
    const ran = this.status.lint.ran;
    const body = this.sectionShell(
      parent,
      "lint",
      "Lint Issues",
      v.length,
      ran ? void 0 : "unavailable"
    );
    if (!ran) {
      return this.placeholder(
        body,
        this.status.lint.error || "Lint subprocess unavailable in this workspace"
      );
    }
    if (v.length === 0)
      return this.placeholder(body, "No lint issues");
    v.forEach((violation, i) => this.renderLintRow(body, violation, i));
  }
  renderLintRow(parent, v, i) {
    const id = (0, import_shared.stableEntryId)(`${v.file}:${v.message.slice(0, 40)}`, i);
    const text = v.file + " " + v.message;
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: path2.basename(v.file) });
      h2.createSpan({ cls: `badge sev-${v.severity}`, text: v.severity });
    };
    const meta = `${v.file} \u2014 ${v.message}`;
    const detail = (d) => {
      const div = d.createDiv({ cls: "detail-meta" });
      const fileRow = div.createDiv();
      fileRow.createSpan({ text: "File: " });
      fileRow.createEl("code", { text: v.file });
      div.createDiv({ text: `Message: ${v.message}` });
    };
    this.entryShell({
      parent,
      section: "lint",
      id,
      sev: v.severity,
      text,
      summary,
      meta,
      detail,
      sourceFile: v.file
    });
  }
  // ── Entry shell + actions ──────────────────────────────────────────────
  entryShell(opts) {
    const row = opts.parent.createDiv({
      cls: "instrumentality-entry",
      attr: {
        "data-entry-section": opts.section,
        "data-entry-id": opts.id,
        "data-entry-sev": opts.sev,
        "data-entry-text": opts.text.toLowerCase()
      }
    });
    const summary = row.createDiv({ cls: "entry-summary" });
    const titleRow = summary.createDiv({ cls: "entry-title-row" });
    opts.summary(titleRow);
    summary.createDiv({ cls: "entry-meta", text: opts.meta });
    const detail = row.createDiv({ cls: "entry-detail" });
    opts.detail(detail);
    const promptPre = detail.createEl("pre", { cls: "entry-prompt" });
    promptPre.empty();
    const indexed = this.entryIndex.get(`${opts.section}:${opts.id}`);
    promptPre.appendText(indexed?.prompt ?? "(no prompt available)");
    const actions = detail.createDiv({ cls: "entry-actions" });
    const copyBtn = actions.createEl("button", { text: "Copy Prompt", cls: "mod-cta" });
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const indexed2 = this.entryIndex.get(`${opts.section}:${opts.id}`);
      if (!indexed2)
        return;
      await navigator.clipboard.writeText(indexed2.prompt);
      new import_obsidian.Notice("Instrumentality: prompt copied to clipboard.");
    });
    const openBtn = actions.createEl("button", { text: "Open Source" });
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.openSource(opts.sourceFile);
    });
    if (opts.standardId) {
      const stdBtn = actions.createEl("button", { text: "Open Standard" });
      stdBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.openStandard(opts.standardId);
      });
    }
    summary.addEventListener("click", () => row.toggleClass("open", !row.hasClass("open")));
  }
  async openSource(sourceFile) {
    if (!sourceFile || !this.kbRoot) {
      new import_obsidian.Notice("Instrumentality: no source file for this entry.");
      return;
    }
    const abs = path2.isAbsolute(sourceFile) ? sourceFile : path2.join(this.kbRoot, sourceFile);
    await this.openPath(abs);
  }
  async openStandard(standardId) {
    if (!this.kbRoot)
      return;
    const filePath = (0, import_shared.resolveStandardPath)(this.kbRoot, standardId);
    if (!filePath) {
      new import_obsidian.Notice(`Instrumentality: standard '${standardId}' not found.`);
      return;
    }
    await this.openPath(filePath);
  }
  /**
   * Open via Obsidian when the file lives inside the vault (preferred — keeps
   * navigation, backlinks, and tabs working). Fall back to Electron's shell
   * for code files outside the vault.
   */
  async openPath(absPath) {
    const vault = this.app.vault;
    const adapter = vault.adapter;
    const basePath = adapter.basePath ?? adapter.getBasePath?.();
    if (basePath && absPath.startsWith(basePath + path2.sep)) {
      const rel = absPath.slice(basePath.length + 1);
      const file = vault.getAbstractFileByPath(rel);
      if (file instanceof import_obsidian.TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
        return;
      }
    }
    try {
      const electron = window.require?.("electron");
      if (electron?.shell?.openPath) {
        const result = await electron.shell.openPath(absPath);
        if (result)
          new import_obsidian.Notice(`Instrumentality: cannot open ${absPath}: ${result}`);
        return;
      }
    } catch {
    }
    new import_obsidian.Notice(`Instrumentality: cannot open ${absPath} (not inside vault).`);
  }
  // ── Filter (DOM-only, no re-render) ─────────────────────────────────────
  applyFilterDom() {
    const search = this.filterSearch.toLowerCase();
    const sevFilter = this.severityFilter;
    const hidden = this.hiddenSections;
    const cards = this.contentEl.querySelectorAll("[data-section]");
    cards.forEach((card) => {
      const section = card.getAttribute("data-section");
      card.toggleClass("hidden", !!section && hidden.has(section));
    });
    const rows = this.contentEl.querySelectorAll(".instrumentality-entry");
    rows.forEach((row) => {
      const section = row.getAttribute("data-entry-section");
      const sev = row.getAttribute("data-entry-sev") || "";
      const text = row.getAttribute("data-entry-text") || "";
      let show = true;
      if (sevFilter.size > 0 && !sevFilter.has(sev))
        show = false;
      if (search && !text.includes(search))
        show = false;
      if (section && hidden.has(section))
        show = false;
      row.toggleClass("hidden", !show);
    });
  }
  // ── Index ──────────────────────────────────────────────────────────────
  buildEntryIndex(status) {
    const out = /* @__PURE__ */ new Map();
    if (!status)
      return out;
    const push = (e) => {
      const key = `${e.section}:${e.id}`;
      out.set(key, { ...e, prompt: (0, import_shared.getActionPrompt)(e.promptInput) });
    };
    status.codeDrift.entries.forEach(
      (e, i) => push({
        section: "code-drift",
        id: (0, import_shared.stableEntryId)(e.kbTarget, i),
        promptInput: { kind: "code-drift", entry: e },
        sourceFile: path2.join("knowledge", e.kbTarget)
      })
    );
    status.kbDrift.entries.forEach(
      (e, i) => push({
        section: "kb-drift",
        id: (0, import_shared.stableEntryId)(e.kbFile, i),
        promptInput: { kind: "kb-drift", entry: e },
        sourceFile: path2.join("knowledge", e.kbFile)
      })
    );
    status.standardsDrift.entries.forEach(
      (e, i) => push({
        section: "standards-drift",
        id: (0, import_shared.stableEntryId)(e.queueKey, i),
        promptInput: { kind: "standards-drift", entry: e },
        sourceFile: Object.values(e.filesByParty).flat()[0]?.path,
        standardId: e.standardId
      })
    );
    for (const p of [status.conformPending.current, status.conformPending.aspirational]) {
      if (!p || p.requested.length === 0)
        continue;
      p.requested.forEach(
        (r, i) => push({
          section: "conform-pending",
          id: (0, import_shared.stableEntryId)(`${p.mode}:${r.file}:${r.standard_id}`, i),
          promptInput: { kind: "conform", entry: p },
          sourceFile: r.file,
          standardId: r.standard_id
        })
      );
    }
    status.promotions.forEach(
      (e, i) => push({
        section: "promotions",
        id: (0, import_shared.stableEntryId)(e.queueKey, i),
        promptInput: { kind: "promotion", entry: e },
        sourceFile: e.files[0]?.path,
        standardId: e.standardId
      })
    );
    status.lint.violations.forEach(
      (v, i) => push({
        section: "lint",
        id: (0, import_shared.stableEntryId)(`${v.file}:${v.message.slice(0, 40)}`, i),
        promptInput: { kind: "lint", entry: v },
        sourceFile: v.file
      })
    );
    return out;
  }
};

// src/main.ts
var ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
  <polygon points="12,3 21,12 12,21 3,12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="12" cy="6.5" r="1.7"/>
  <circle cx="6.5" cy="15.5" r="1.7"/>
  <circle cx="17.5" cy="15.5" r="1.7"/>
  <circle cx="12" cy="12" r="1.6"/>
</svg>`;
var InstrumentalityPlugin = class extends import_obsidian2.Plugin {
  async onload() {
    (0, import_obsidian2.addIcon)(ICON_ID, ICON_SVG);
    this.registerView(
      VIEW_TYPE_INSTRUMENTALITY,
      (leaf) => new InstrumentalityView(leaf, () => this.detectKbRoot())
    );
    this.addRibbonIcon(ICON_ID, "Instrumentality", () => void this.activateView());
    this.addCommand({
      id: "open-pane",
      name: "Open Instrumentality pane",
      callback: () => void this.activateView()
    });
    this.addCommand({
      id: "refresh",
      name: "Refresh Instrumentality",
      callback: () => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_INSTRUMENTALITY)) {
          const view = leaf.view;
          void view.refresh();
        }
      }
    });
  }
  onunload() {
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_INSTRUMENTALITY)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf)
        leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_INSTRUMENTALITY, active: true });
    }
    workspace.revealLeaf(leaf);
  }
  /**
   * Resolve the KB root by walking up from the vault's filesystem path.
   * Returns null if the vault adapter doesn't expose a base path (mobile
   * sandboxed installs) or no KB indicator is found in tree.
   */
  detectKbRoot() {
    const adapter = this.app.vault.adapter;
    const basePath = adapter.basePath ?? adapter.getBasePath?.();
    if (!basePath)
      return null;
    return (0, import_shared2.findKbRoot)([basePath]);
  }
};
//# sourceMappingURL=main.js.map
