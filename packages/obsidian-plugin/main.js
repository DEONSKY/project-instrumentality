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
    var path4 = __importStar(require("path"));
    var KB_INDICATORS = [
      ["knowledge", "_mcp", "server.js"],
      ["knowledge", "sync"],
      ["knowledge", "_rules.md"],
      ["knowledge", "_index.yaml"]
    ];
    function isKbRoot(dir) {
      for (const segs of KB_INDICATORS) {
        if (fs2.existsSync(path4.join(dir, ...segs)))
          return true;
      }
      return false;
    }
    function findKbRoot2(startPaths) {
      for (const start of startPaths) {
        let dir = path4.resolve(start);
        while (true) {
          if (isKbRoot(dir))
            return dir;
          const parent = path4.dirname(dir);
          if (parent === dir)
            break;
          dir = parent;
        }
      }
      return null;
    }
    function kbSyncPath(kbRoot, ...segments) {
      return path4.join(kbRoot, "knowledge", "sync", ...segments);
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
    var FILE_LINE_RE = /^\s+-\s+`([^`]+)`(?:\s+←\s+renamed from\s+`([^`]+)`)?\s+—\s+since\s+`([^`]+)`\s+\(([^)]+)\)(?:,\s+latest\s+`([^`]+)`\s+\(([^)]+)\))?(?:\s+—\s+by\s+@(\S+))?/;
    var ACK_RE = /\*\*Acknowledged\*\*:\s*@(\S+)\s+at\s+`([^`]+)`\s+\(([^)]+)\)\s+—\s+"([^"]+)"/;
    function parseAck(block) {
      const m = block.match(ACK_RE);
      if (!m)
        return void 0;
      return { by: m[1], atCommit: m[2], atDate: m[3], reason: m[4] };
    }
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
            sinceDate: m[4],
            source: "committed"
          };
          if (m[2])
            f.renamedFrom = m[2];
          if (m[5]) {
            f.latestCommit = m[5];
            f.latestDate = m[6];
          }
          if (m[7])
            f.author = m[7];
          codeFiles.push(f);
        }
        const entry = { kind: "code-drift", kbTarget, codeFiles, hasShared, source: "committed" };
        const ack = parseAck(block);
        if (ack)
          entry.acknowledgement = ack;
        entries.push(entry);
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
    var ACK_RE = /\*\*Acknowledged\*\*:\s*@(\S+)\s+at\s+`([^`]+)`\s+\(([^)]+)\)\s+—\s+"([^"]+)"/;
    function parseAck(block) {
      const m = block.match(ACK_RE);
      if (!m)
        return void 0;
      return { by: m[1], atCommit: m[2], atDate: m[3], reason: m[4] };
    }
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
        const latestMatch = block.match(/\*\*Latest:\*\*\s*`([^`]+)`\s*\(([^)]+)\)(?:\s+—\s+by\s+@(\S+))?/);
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
          unmapped,
          source: "committed"
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
          if (latestMatch[3])
            entry.author = latestMatch[3];
        }
        const ack = parseAck(block);
        if (ack)
          entry.acknowledgement = ack;
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
    exports2.readStandardsBacklog = readStandardsBacklog;
    var fs2 = __importStar(require("fs"));
    var baseline_js_1 = require_baseline();
    var kb_root_js_1 = require_kb_root();
    var FILE_LINE_RE = /^\s+-\s+`([^`]+)`\s+—\s+since\s+`([^`]+)`\s+\(([^)]+)\)(?:,\s+latest\s+`([^`]+)`\s+\(([^)]+)\))?(?:\s+—\s+by\s+@(\S+))?/;
    var ACK_RE = /\*\*Acknowledged\*\*:\s*@(\S+)\s+at\s+`([^`]+)`\s+\(([^)]+)\)\s+—\s+"([^"]+)"/;
    function parseAck(block) {
      const m = block.match(ACK_RE);
      if (!m)
        return void 0;
      return { by: m[1], atCommit: m[2], atDate: m[3], reason: m[4] };
    }
    function parseStandardsDrift(content, mode = "current") {
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
            sinceDate: m[3],
            source: "committed"
          };
          if (m[4]) {
            f.latestCommit = m[4];
            f.latestDate = m[5];
          }
          if (m[6])
            f.author = m[6];
          filesByParty[partyKey].push(f);
        }
        const entry = {
          kind: "standards-drift",
          mode,
          queueKey,
          standardId: stdMatch ? stdMatch[1] : null,
          standardKind: stdMatch ? stdMatch[2] || null : null,
          ruleId: ruleMatch ? ruleMatch[1] : null,
          severity: ruleMatch ? ruleMatch[2] : null,
          reason: reasonMatch ? reasonMatch[1].trim() : null,
          filesByParty,
          source: "committed"
        };
        const ack = parseAck(block);
        if (ack)
          entry.acknowledgement = ack;
        entries.push(entry);
      }
      return { entries, baseline };
    }
    function readStandardsDrift(kbRoot) {
      const file = (0, kb_root_js_1.kbSyncPath)(kbRoot, "standards-drift.md");
      if (!fs2.existsSync(file))
        return { entries: [], baseline: { sha: null } };
      return parseStandardsDrift(fs2.readFileSync(file, "utf8"), "current");
    }
    function readStandardsBacklog(kbRoot) {
      const file = (0, kb_root_js_1.kbSyncPath)(kbRoot, "standards-backlog.md");
      if (!fs2.existsSync(file))
        return { entries: [], baseline: { sha: null } };
      return parseStandardsDrift(fs2.readFileSync(file, "utf8"), "aspirational");
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
    var path4 = __importStar(require("path"));
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
      return path4.join((0, kb_root_js_1.kbSyncPath)(kbRoot, ".conform-pending"));
    }
    function resolveStandardPath2(kbRoot, standardId) {
      if (!standardId)
        return null;
      const standardsDir = path4.join(kbRoot, "knowledge", "standards");
      for (const group of STANDARD_GROUPS) {
        const candidate = path4.join(standardsDir, group, `${standardId}.md`);
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
    var path4 = __importStar(require("path"));
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
      const script = path4.join(kbRoot, "knowledge", "_mcp", "scripts", "lint-standalone.js");
      if (!fs2.existsSync(script)) {
        return Promise.resolve({ violations: [], ran: false });
      }
      return runProcess(process.execPath, [script], kbRoot);
    }
    function runShell(command, cwd) {
      return new Promise((resolve2) => {
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
          resolve2({ violations: [], ran: false, error: err.message });
        });
        child.on("close", () => {
          resolve2({ violations: parseLintStderr(stderr), ran: true });
        });
      });
    }
    function runProcess(bin, args, cwd) {
      return new Promise((resolve2) => {
        const child = (0, node_child_process_1.spawn)(bin, args, {
          cwd,
          stdio: ["ignore", "ignore", "pipe"]
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString("utf8");
        });
        child.on("error", (err) => {
          resolve2({ violations: [], ran: false, error: err.message });
        });
        child.on("close", () => {
          resolve2({ violations: parseLintStderr(stderr), ran: true });
        });
      });
    }
  }
});

// ../shared/node_modules/js-yaml/lib/common.js
var require_common = __commonJS({
  "../shared/node_modules/js-yaml/lib/common.js"(exports2, module2) {
    "use strict";
    function isNothing(subject) {
      return typeof subject === "undefined" || subject === null;
    }
    function isObject(subject) {
      return typeof subject === "object" && subject !== null;
    }
    function toArray(sequence) {
      if (Array.isArray(sequence))
        return sequence;
      else if (isNothing(sequence))
        return [];
      return [sequence];
    }
    function extend(target, source) {
      var index, length, key, sourceKeys;
      if (source) {
        sourceKeys = Object.keys(source);
        for (index = 0, length = sourceKeys.length; index < length; index += 1) {
          key = sourceKeys[index];
          target[key] = source[key];
        }
      }
      return target;
    }
    function repeat(string, count) {
      var result = "", cycle;
      for (cycle = 0; cycle < count; cycle += 1) {
        result += string;
      }
      return result;
    }
    function isNegativeZero(number) {
      return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
    }
    module2.exports.isNothing = isNothing;
    module2.exports.isObject = isObject;
    module2.exports.toArray = toArray;
    module2.exports.repeat = repeat;
    module2.exports.isNegativeZero = isNegativeZero;
    module2.exports.extend = extend;
  }
});

// ../shared/node_modules/js-yaml/lib/exception.js
var require_exception = __commonJS({
  "../shared/node_modules/js-yaml/lib/exception.js"(exports2, module2) {
    "use strict";
    function formatError(exception, compact) {
      var where = "", message = exception.reason || "(unknown reason)";
      if (!exception.mark)
        return message;
      if (exception.mark.name) {
        where += 'in "' + exception.mark.name + '" ';
      }
      where += "(" + (exception.mark.line + 1) + ":" + (exception.mark.column + 1) + ")";
      if (!compact && exception.mark.snippet) {
        where += "\n\n" + exception.mark.snippet;
      }
      return message + " " + where;
    }
    function YAMLException(reason, mark) {
      Error.call(this);
      this.name = "YAMLException";
      this.reason = reason;
      this.mark = mark;
      this.message = formatError(this, false);
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      } else {
        this.stack = new Error().stack || "";
      }
    }
    YAMLException.prototype = Object.create(Error.prototype);
    YAMLException.prototype.constructor = YAMLException;
    YAMLException.prototype.toString = function toString(compact) {
      return this.name + ": " + formatError(this, compact);
    };
    module2.exports = YAMLException;
  }
});

// ../shared/node_modules/js-yaml/lib/snippet.js
var require_snippet = __commonJS({
  "../shared/node_modules/js-yaml/lib/snippet.js"(exports2, module2) {
    "use strict";
    var common = require_common();
    function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
      var head = "";
      var tail = "";
      var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
      if (position - lineStart > maxHalfLength) {
        head = " ... ";
        lineStart = position - maxHalfLength + head.length;
      }
      if (lineEnd - position > maxHalfLength) {
        tail = " ...";
        lineEnd = position + maxHalfLength - tail.length;
      }
      return {
        str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
        pos: position - lineStart + head.length
        // relative position
      };
    }
    function padStart(string, max) {
      return common.repeat(" ", max - string.length) + string;
    }
    function makeSnippet(mark, options) {
      options = Object.create(options || null);
      if (!mark.buffer)
        return null;
      if (!options.maxLength)
        options.maxLength = 79;
      if (typeof options.indent !== "number")
        options.indent = 1;
      if (typeof options.linesBefore !== "number")
        options.linesBefore = 3;
      if (typeof options.linesAfter !== "number")
        options.linesAfter = 2;
      var re = /\r?\n|\r|\0/g;
      var lineStarts = [0];
      var lineEnds = [];
      var match;
      var foundLineNo = -1;
      while (match = re.exec(mark.buffer)) {
        lineEnds.push(match.index);
        lineStarts.push(match.index + match[0].length);
        if (mark.position <= match.index && foundLineNo < 0) {
          foundLineNo = lineStarts.length - 2;
        }
      }
      if (foundLineNo < 0)
        foundLineNo = lineStarts.length - 1;
      var result = "", i, line;
      var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
      var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
      for (i = 1; i <= options.linesBefore; i++) {
        if (foundLineNo - i < 0)
          break;
        line = getLine(
          mark.buffer,
          lineStarts[foundLineNo - i],
          lineEnds[foundLineNo - i],
          mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
          maxLineLength
        );
        result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
      }
      line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
      result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
      result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
      for (i = 1; i <= options.linesAfter; i++) {
        if (foundLineNo + i >= lineEnds.length)
          break;
        line = getLine(
          mark.buffer,
          lineStarts[foundLineNo + i],
          lineEnds[foundLineNo + i],
          mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
          maxLineLength
        );
        result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
      }
      return result.replace(/\n$/, "");
    }
    module2.exports = makeSnippet;
  }
});

// ../shared/node_modules/js-yaml/lib/type.js
var require_type = __commonJS({
  "../shared/node_modules/js-yaml/lib/type.js"(exports2, module2) {
    "use strict";
    var YAMLException = require_exception();
    var TYPE_CONSTRUCTOR_OPTIONS = [
      "kind",
      "multi",
      "resolve",
      "construct",
      "instanceOf",
      "predicate",
      "represent",
      "representName",
      "defaultStyle",
      "styleAliases"
    ];
    var YAML_NODE_KINDS = [
      "scalar",
      "sequence",
      "mapping"
    ];
    function compileStyleAliases(map) {
      var result = {};
      if (map !== null) {
        Object.keys(map).forEach(function(style) {
          map[style].forEach(function(alias) {
            result[String(alias)] = style;
          });
        });
      }
      return result;
    }
    function Type(tag, options) {
      options = options || {};
      Object.keys(options).forEach(function(name) {
        if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
          throw new YAMLException('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
        }
      });
      this.options = options;
      this.tag = tag;
      this.kind = options["kind"] || null;
      this.resolve = options["resolve"] || function() {
        return true;
      };
      this.construct = options["construct"] || function(data) {
        return data;
      };
      this.instanceOf = options["instanceOf"] || null;
      this.predicate = options["predicate"] || null;
      this.represent = options["represent"] || null;
      this.representName = options["representName"] || null;
      this.defaultStyle = options["defaultStyle"] || null;
      this.multi = options["multi"] || false;
      this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
      if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
        throw new YAMLException('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
      }
    }
    module2.exports = Type;
  }
});

// ../shared/node_modules/js-yaml/lib/schema.js
var require_schema = __commonJS({
  "../shared/node_modules/js-yaml/lib/schema.js"(exports2, module2) {
    "use strict";
    var YAMLException = require_exception();
    var Type = require_type();
    function compileList(schema, name) {
      var result = [];
      schema[name].forEach(function(currentType) {
        var newIndex = result.length;
        result.forEach(function(previousType, previousIndex) {
          if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
            newIndex = previousIndex;
          }
        });
        result[newIndex] = currentType;
      });
      return result;
    }
    function compileMap() {
      var result = {
        scalar: {},
        sequence: {},
        mapping: {},
        fallback: {},
        multi: {
          scalar: [],
          sequence: [],
          mapping: [],
          fallback: []
        }
      }, index, length;
      function collectType(type) {
        if (type.multi) {
          result.multi[type.kind].push(type);
          result.multi["fallback"].push(type);
        } else {
          result[type.kind][type.tag] = result["fallback"][type.tag] = type;
        }
      }
      for (index = 0, length = arguments.length; index < length; index += 1) {
        arguments[index].forEach(collectType);
      }
      return result;
    }
    function Schema(definition) {
      return this.extend(definition);
    }
    Schema.prototype.extend = function extend(definition) {
      var implicit = [];
      var explicit = [];
      if (definition instanceof Type) {
        explicit.push(definition);
      } else if (Array.isArray(definition)) {
        explicit = explicit.concat(definition);
      } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
        if (definition.implicit)
          implicit = implicit.concat(definition.implicit);
        if (definition.explicit)
          explicit = explicit.concat(definition.explicit);
      } else {
        throw new YAMLException("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
      }
      implicit.forEach(function(type) {
        if (!(type instanceof Type)) {
          throw new YAMLException("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        }
        if (type.loadKind && type.loadKind !== "scalar") {
          throw new YAMLException("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
        }
        if (type.multi) {
          throw new YAMLException("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
        }
      });
      explicit.forEach(function(type) {
        if (!(type instanceof Type)) {
          throw new YAMLException("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        }
      });
      var result = Object.create(Schema.prototype);
      result.implicit = (this.implicit || []).concat(implicit);
      result.explicit = (this.explicit || []).concat(explicit);
      result.compiledImplicit = compileList(result, "implicit");
      result.compiledExplicit = compileList(result, "explicit");
      result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
      return result;
    };
    module2.exports = Schema;
  }
});

// ../shared/node_modules/js-yaml/lib/type/str.js
var require_str = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/str.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    module2.exports = new Type("tag:yaml.org,2002:str", {
      kind: "scalar",
      construct: function(data) {
        return data !== null ? data : "";
      }
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/seq.js
var require_seq = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/seq.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    module2.exports = new Type("tag:yaml.org,2002:seq", {
      kind: "sequence",
      construct: function(data) {
        return data !== null ? data : [];
      }
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/map.js
var require_map = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/map.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    module2.exports = new Type("tag:yaml.org,2002:map", {
      kind: "mapping",
      construct: function(data) {
        return data !== null ? data : {};
      }
    });
  }
});

// ../shared/node_modules/js-yaml/lib/schema/failsafe.js
var require_failsafe = __commonJS({
  "../shared/node_modules/js-yaml/lib/schema/failsafe.js"(exports2, module2) {
    "use strict";
    var Schema = require_schema();
    module2.exports = new Schema({
      explicit: [
        require_str(),
        require_seq(),
        require_map()
      ]
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/null.js
var require_null = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/null.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    function resolveYamlNull(data) {
      if (data === null)
        return true;
      var max = data.length;
      return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
    }
    function constructYamlNull() {
      return null;
    }
    function isNull(object) {
      return object === null;
    }
    module2.exports = new Type("tag:yaml.org,2002:null", {
      kind: "scalar",
      resolve: resolveYamlNull,
      construct: constructYamlNull,
      predicate: isNull,
      represent: {
        canonical: function() {
          return "~";
        },
        lowercase: function() {
          return "null";
        },
        uppercase: function() {
          return "NULL";
        },
        camelcase: function() {
          return "Null";
        },
        empty: function() {
          return "";
        }
      },
      defaultStyle: "lowercase"
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/bool.js
var require_bool = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/bool.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    function resolveYamlBoolean(data) {
      if (data === null)
        return false;
      var max = data.length;
      return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
    }
    function constructYamlBoolean(data) {
      return data === "true" || data === "True" || data === "TRUE";
    }
    function isBoolean(object) {
      return Object.prototype.toString.call(object) === "[object Boolean]";
    }
    module2.exports = new Type("tag:yaml.org,2002:bool", {
      kind: "scalar",
      resolve: resolveYamlBoolean,
      construct: constructYamlBoolean,
      predicate: isBoolean,
      represent: {
        lowercase: function(object) {
          return object ? "true" : "false";
        },
        uppercase: function(object) {
          return object ? "TRUE" : "FALSE";
        },
        camelcase: function(object) {
          return object ? "True" : "False";
        }
      },
      defaultStyle: "lowercase"
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/int.js
var require_int = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/int.js"(exports2, module2) {
    "use strict";
    var common = require_common();
    var Type = require_type();
    function isHexCode(c) {
      return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
    }
    function isOctCode(c) {
      return 48 <= c && c <= 55;
    }
    function isDecCode(c) {
      return 48 <= c && c <= 57;
    }
    function resolveYamlInteger(data) {
      if (data === null)
        return false;
      var max = data.length, index = 0, hasDigits = false, ch;
      if (!max)
        return false;
      ch = data[index];
      if (ch === "-" || ch === "+") {
        ch = data[++index];
      }
      if (ch === "0") {
        if (index + 1 === max)
          return true;
        ch = data[++index];
        if (ch === "b") {
          index++;
          for (; index < max; index++) {
            ch = data[index];
            if (ch === "_")
              continue;
            if (ch !== "0" && ch !== "1")
              return false;
            hasDigits = true;
          }
          return hasDigits && ch !== "_";
        }
        if (ch === "x") {
          index++;
          for (; index < max; index++) {
            ch = data[index];
            if (ch === "_")
              continue;
            if (!isHexCode(data.charCodeAt(index)))
              return false;
            hasDigits = true;
          }
          return hasDigits && ch !== "_";
        }
        if (ch === "o") {
          index++;
          for (; index < max; index++) {
            ch = data[index];
            if (ch === "_")
              continue;
            if (!isOctCode(data.charCodeAt(index)))
              return false;
            hasDigits = true;
          }
          return hasDigits && ch !== "_";
        }
      }
      if (ch === "_")
        return false;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_")
          continue;
        if (!isDecCode(data.charCodeAt(index))) {
          return false;
        }
        hasDigits = true;
      }
      if (!hasDigits || ch === "_")
        return false;
      return true;
    }
    function constructYamlInteger(data) {
      var value = data, sign = 1, ch;
      if (value.indexOf("_") !== -1) {
        value = value.replace(/_/g, "");
      }
      ch = value[0];
      if (ch === "-" || ch === "+") {
        if (ch === "-")
          sign = -1;
        value = value.slice(1);
        ch = value[0];
      }
      if (value === "0")
        return 0;
      if (ch === "0") {
        if (value[1] === "b")
          return sign * parseInt(value.slice(2), 2);
        if (value[1] === "x")
          return sign * parseInt(value.slice(2), 16);
        if (value[1] === "o")
          return sign * parseInt(value.slice(2), 8);
      }
      return sign * parseInt(value, 10);
    }
    function isInteger(object) {
      return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
    }
    module2.exports = new Type("tag:yaml.org,2002:int", {
      kind: "scalar",
      resolve: resolveYamlInteger,
      construct: constructYamlInteger,
      predicate: isInteger,
      represent: {
        binary: function(obj) {
          return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
        },
        octal: function(obj) {
          return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
        },
        decimal: function(obj) {
          return obj.toString(10);
        },
        /* eslint-disable max-len */
        hexadecimal: function(obj) {
          return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
        }
      },
      defaultStyle: "decimal",
      styleAliases: {
        binary: [2, "bin"],
        octal: [8, "oct"],
        decimal: [10, "dec"],
        hexadecimal: [16, "hex"]
      }
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/float.js
var require_float = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/float.js"(exports2, module2) {
    "use strict";
    var common = require_common();
    var Type = require_type();
    var YAML_FLOAT_PATTERN = new RegExp(
      // 2.5e4, 2.5 and integers
      "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
    );
    function resolveYamlFloat(data) {
      if (data === null)
        return false;
      if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
      // Probably should update regexp & check speed
      data[data.length - 1] === "_") {
        return false;
      }
      return true;
    }
    function constructYamlFloat(data) {
      var value, sign;
      value = data.replace(/_/g, "").toLowerCase();
      sign = value[0] === "-" ? -1 : 1;
      if ("+-".indexOf(value[0]) >= 0) {
        value = value.slice(1);
      }
      if (value === ".inf") {
        return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      } else if (value === ".nan") {
        return NaN;
      }
      return sign * parseFloat(value, 10);
    }
    var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
    function representYamlFloat(object, style) {
      var res;
      if (isNaN(object)) {
        switch (style) {
          case "lowercase":
            return ".nan";
          case "uppercase":
            return ".NAN";
          case "camelcase":
            return ".NaN";
        }
      } else if (Number.POSITIVE_INFINITY === object) {
        switch (style) {
          case "lowercase":
            return ".inf";
          case "uppercase":
            return ".INF";
          case "camelcase":
            return ".Inf";
        }
      } else if (Number.NEGATIVE_INFINITY === object) {
        switch (style) {
          case "lowercase":
            return "-.inf";
          case "uppercase":
            return "-.INF";
          case "camelcase":
            return "-.Inf";
        }
      } else if (common.isNegativeZero(object)) {
        return "-0.0";
      }
      res = object.toString(10);
      return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
    }
    function isFloat(object) {
      return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
    }
    module2.exports = new Type("tag:yaml.org,2002:float", {
      kind: "scalar",
      resolve: resolveYamlFloat,
      construct: constructYamlFloat,
      predicate: isFloat,
      represent: representYamlFloat,
      defaultStyle: "lowercase"
    });
  }
});

// ../shared/node_modules/js-yaml/lib/schema/json.js
var require_json = __commonJS({
  "../shared/node_modules/js-yaml/lib/schema/json.js"(exports2, module2) {
    "use strict";
    module2.exports = require_failsafe().extend({
      implicit: [
        require_null(),
        require_bool(),
        require_int(),
        require_float()
      ]
    });
  }
});

// ../shared/node_modules/js-yaml/lib/schema/core.js
var require_core = __commonJS({
  "../shared/node_modules/js-yaml/lib/schema/core.js"(exports2, module2) {
    "use strict";
    module2.exports = require_json();
  }
});

// ../shared/node_modules/js-yaml/lib/type/timestamp.js
var require_timestamp = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/timestamp.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var YAML_DATE_REGEXP = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
    );
    var YAML_TIMESTAMP_REGEXP = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
    );
    function resolveYamlTimestamp(data) {
      if (data === null)
        return false;
      if (YAML_DATE_REGEXP.exec(data) !== null)
        return true;
      if (YAML_TIMESTAMP_REGEXP.exec(data) !== null)
        return true;
      return false;
    }
    function constructYamlTimestamp(data) {
      var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
      match = YAML_DATE_REGEXP.exec(data);
      if (match === null)
        match = YAML_TIMESTAMP_REGEXP.exec(data);
      if (match === null)
        throw new Error("Date resolve error");
      year = +match[1];
      month = +match[2] - 1;
      day = +match[3];
      if (!match[4]) {
        return new Date(Date.UTC(year, month, day));
      }
      hour = +match[4];
      minute = +match[5];
      second = +match[6];
      if (match[7]) {
        fraction = match[7].slice(0, 3);
        while (fraction.length < 3) {
          fraction += "0";
        }
        fraction = +fraction;
      }
      if (match[9]) {
        tz_hour = +match[10];
        tz_minute = +(match[11] || 0);
        delta = (tz_hour * 60 + tz_minute) * 6e4;
        if (match[9] === "-")
          delta = -delta;
      }
      date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
      if (delta)
        date.setTime(date.getTime() - delta);
      return date;
    }
    function representYamlTimestamp(object) {
      return object.toISOString();
    }
    module2.exports = new Type("tag:yaml.org,2002:timestamp", {
      kind: "scalar",
      resolve: resolveYamlTimestamp,
      construct: constructYamlTimestamp,
      instanceOf: Date,
      represent: representYamlTimestamp
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/merge.js
var require_merge = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/merge.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    function resolveYamlMerge(data) {
      return data === "<<" || data === null;
    }
    module2.exports = new Type("tag:yaml.org,2002:merge", {
      kind: "scalar",
      resolve: resolveYamlMerge
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/binary.js
var require_binary = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/binary.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
    function resolveYamlBinary(data) {
      if (data === null)
        return false;
      var code, idx, bitlen = 0, max = data.length, map = BASE64_MAP;
      for (idx = 0; idx < max; idx++) {
        code = map.indexOf(data.charAt(idx));
        if (code > 64)
          continue;
        if (code < 0)
          return false;
        bitlen += 6;
      }
      return bitlen % 8 === 0;
    }
    function constructYamlBinary(data) {
      var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map = BASE64_MAP, bits = 0, result = [];
      for (idx = 0; idx < max; idx++) {
        if (idx % 4 === 0 && idx) {
          result.push(bits >> 16 & 255);
          result.push(bits >> 8 & 255);
          result.push(bits & 255);
        }
        bits = bits << 6 | map.indexOf(input.charAt(idx));
      }
      tailbits = max % 4 * 6;
      if (tailbits === 0) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      } else if (tailbits === 18) {
        result.push(bits >> 10 & 255);
        result.push(bits >> 2 & 255);
      } else if (tailbits === 12) {
        result.push(bits >> 4 & 255);
      }
      return new Uint8Array(result);
    }
    function representYamlBinary(object) {
      var result = "", bits = 0, idx, tail, max = object.length, map = BASE64_MAP;
      for (idx = 0; idx < max; idx++) {
        if (idx % 3 === 0 && idx) {
          result += map[bits >> 18 & 63];
          result += map[bits >> 12 & 63];
          result += map[bits >> 6 & 63];
          result += map[bits & 63];
        }
        bits = (bits << 8) + object[idx];
      }
      tail = max % 3;
      if (tail === 0) {
        result += map[bits >> 18 & 63];
        result += map[bits >> 12 & 63];
        result += map[bits >> 6 & 63];
        result += map[bits & 63];
      } else if (tail === 2) {
        result += map[bits >> 10 & 63];
        result += map[bits >> 4 & 63];
        result += map[bits << 2 & 63];
        result += map[64];
      } else if (tail === 1) {
        result += map[bits >> 2 & 63];
        result += map[bits << 4 & 63];
        result += map[64];
        result += map[64];
      }
      return result;
    }
    function isBinary(obj) {
      return Object.prototype.toString.call(obj) === "[object Uint8Array]";
    }
    module2.exports = new Type("tag:yaml.org,2002:binary", {
      kind: "scalar",
      resolve: resolveYamlBinary,
      construct: constructYamlBinary,
      predicate: isBinary,
      represent: representYamlBinary
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/omap.js
var require_omap = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/omap.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    var _toString = Object.prototype.toString;
    function resolveYamlOmap(data) {
      if (data === null)
        return true;
      var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
      for (index = 0, length = object.length; index < length; index += 1) {
        pair = object[index];
        pairHasKey = false;
        if (_toString.call(pair) !== "[object Object]")
          return false;
        for (pairKey in pair) {
          if (_hasOwnProperty.call(pair, pairKey)) {
            if (!pairHasKey)
              pairHasKey = true;
            else
              return false;
          }
        }
        if (!pairHasKey)
          return false;
        if (objectKeys.indexOf(pairKey) === -1)
          objectKeys.push(pairKey);
        else
          return false;
      }
      return true;
    }
    function constructYamlOmap(data) {
      return data !== null ? data : [];
    }
    module2.exports = new Type("tag:yaml.org,2002:omap", {
      kind: "sequence",
      resolve: resolveYamlOmap,
      construct: constructYamlOmap
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/pairs.js
var require_pairs = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/pairs.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var _toString = Object.prototype.toString;
    function resolveYamlPairs(data) {
      if (data === null)
        return true;
      var index, length, pair, keys, result, object = data;
      result = new Array(object.length);
      for (index = 0, length = object.length; index < length; index += 1) {
        pair = object[index];
        if (_toString.call(pair) !== "[object Object]")
          return false;
        keys = Object.keys(pair);
        if (keys.length !== 1)
          return false;
        result[index] = [keys[0], pair[keys[0]]];
      }
      return true;
    }
    function constructYamlPairs(data) {
      if (data === null)
        return [];
      var index, length, pair, keys, result, object = data;
      result = new Array(object.length);
      for (index = 0, length = object.length; index < length; index += 1) {
        pair = object[index];
        keys = Object.keys(pair);
        result[index] = [keys[0], pair[keys[0]]];
      }
      return result;
    }
    module2.exports = new Type("tag:yaml.org,2002:pairs", {
      kind: "sequence",
      resolve: resolveYamlPairs,
      construct: constructYamlPairs
    });
  }
});

// ../shared/node_modules/js-yaml/lib/type/set.js
var require_set = __commonJS({
  "../shared/node_modules/js-yaml/lib/type/set.js"(exports2, module2) {
    "use strict";
    var Type = require_type();
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    function resolveYamlSet(data) {
      if (data === null)
        return true;
      var key, object = data;
      for (key in object) {
        if (_hasOwnProperty.call(object, key)) {
          if (object[key] !== null)
            return false;
        }
      }
      return true;
    }
    function constructYamlSet(data) {
      return data !== null ? data : {};
    }
    module2.exports = new Type("tag:yaml.org,2002:set", {
      kind: "mapping",
      resolve: resolveYamlSet,
      construct: constructYamlSet
    });
  }
});

// ../shared/node_modules/js-yaml/lib/schema/default.js
var require_default = __commonJS({
  "../shared/node_modules/js-yaml/lib/schema/default.js"(exports2, module2) {
    "use strict";
    module2.exports = require_core().extend({
      implicit: [
        require_timestamp(),
        require_merge()
      ],
      explicit: [
        require_binary(),
        require_omap(),
        require_pairs(),
        require_set()
      ]
    });
  }
});

// ../shared/node_modules/js-yaml/lib/loader.js
var require_loader = __commonJS({
  "../shared/node_modules/js-yaml/lib/loader.js"(exports2, module2) {
    "use strict";
    var common = require_common();
    var YAMLException = require_exception();
    var makeSnippet = require_snippet();
    var DEFAULT_SCHEMA = require_default();
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    var CONTEXT_FLOW_IN = 1;
    var CONTEXT_FLOW_OUT = 2;
    var CONTEXT_BLOCK_IN = 3;
    var CONTEXT_BLOCK_OUT = 4;
    var CHOMPING_CLIP = 1;
    var CHOMPING_STRIP = 2;
    var CHOMPING_KEEP = 3;
    var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
    var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
    var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
    var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
    var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
    function _class(obj) {
      return Object.prototype.toString.call(obj);
    }
    function is_EOL(c) {
      return c === 10 || c === 13;
    }
    function is_WHITE_SPACE(c) {
      return c === 9 || c === 32;
    }
    function is_WS_OR_EOL(c) {
      return c === 9 || c === 32 || c === 10 || c === 13;
    }
    function is_FLOW_INDICATOR(c) {
      return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
    }
    function fromHexCode(c) {
      var lc;
      if (48 <= c && c <= 57) {
        return c - 48;
      }
      lc = c | 32;
      if (97 <= lc && lc <= 102) {
        return lc - 97 + 10;
      }
      return -1;
    }
    function escapedHexLen(c) {
      if (c === 120) {
        return 2;
      }
      if (c === 117) {
        return 4;
      }
      if (c === 85) {
        return 8;
      }
      return 0;
    }
    function fromDecimalCode(c) {
      if (48 <= c && c <= 57) {
        return c - 48;
      }
      return -1;
    }
    function simpleEscapeSequence(c) {
      return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
    }
    function charFromCodepoint(c) {
      if (c <= 65535) {
        return String.fromCharCode(c);
      }
      return String.fromCharCode(
        (c - 65536 >> 10) + 55296,
        (c - 65536 & 1023) + 56320
      );
    }
    function setProperty(object, key, value) {
      if (key === "__proto__") {
        Object.defineProperty(object, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value
        });
      } else {
        object[key] = value;
      }
    }
    var simpleEscapeCheck = new Array(256);
    var simpleEscapeMap = new Array(256);
    for (i = 0; i < 256; i++) {
      simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
      simpleEscapeMap[i] = simpleEscapeSequence(i);
    }
    var i;
    function State(input, options) {
      this.input = input;
      this.filename = options["filename"] || null;
      this.schema = options["schema"] || DEFAULT_SCHEMA;
      this.onWarning = options["onWarning"] || null;
      this.legacy = options["legacy"] || false;
      this.json = options["json"] || false;
      this.listener = options["listener"] || null;
      this.implicitTypes = this.schema.compiledImplicit;
      this.typeMap = this.schema.compiledTypeMap;
      this.length = input.length;
      this.position = 0;
      this.line = 0;
      this.lineStart = 0;
      this.lineIndent = 0;
      this.firstTabInLine = -1;
      this.documents = [];
    }
    function generateError(state, message) {
      var mark = {
        name: state.filename,
        buffer: state.input.slice(0, -1),
        // omit trailing \0
        position: state.position,
        line: state.line,
        column: state.position - state.lineStart
      };
      mark.snippet = makeSnippet(mark);
      return new YAMLException(message, mark);
    }
    function throwError(state, message) {
      throw generateError(state, message);
    }
    function throwWarning(state, message) {
      if (state.onWarning) {
        state.onWarning.call(null, generateError(state, message));
      }
    }
    var directiveHandlers = {
      YAML: function handleYamlDirective(state, name, args) {
        var match, major, minor;
        if (state.version !== null) {
          throwError(state, "duplication of %YAML directive");
        }
        if (args.length !== 1) {
          throwError(state, "YAML directive accepts exactly one argument");
        }
        match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
        if (match === null) {
          throwError(state, "ill-formed argument of the YAML directive");
        }
        major = parseInt(match[1], 10);
        minor = parseInt(match[2], 10);
        if (major !== 1) {
          throwError(state, "unacceptable YAML version of the document");
        }
        state.version = args[0];
        state.checkLineBreaks = minor < 2;
        if (minor !== 1 && minor !== 2) {
          throwWarning(state, "unsupported YAML version of the document");
        }
      },
      TAG: function handleTagDirective(state, name, args) {
        var handle, prefix;
        if (args.length !== 2) {
          throwError(state, "TAG directive accepts exactly two arguments");
        }
        handle = args[0];
        prefix = args[1];
        if (!PATTERN_TAG_HANDLE.test(handle)) {
          throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
        }
        if (_hasOwnProperty.call(state.tagMap, handle)) {
          throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
        }
        if (!PATTERN_TAG_URI.test(prefix)) {
          throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
        }
        try {
          prefix = decodeURIComponent(prefix);
        } catch (err) {
          throwError(state, "tag prefix is malformed: " + prefix);
        }
        state.tagMap[handle] = prefix;
      }
    };
    function captureSegment(state, start, end, checkJson) {
      var _position, _length, _character, _result;
      if (start < end) {
        _result = state.input.slice(start, end);
        if (checkJson) {
          for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
            _character = _result.charCodeAt(_position);
            if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
              throwError(state, "expected valid JSON character");
            }
          }
        } else if (PATTERN_NON_PRINTABLE.test(_result)) {
          throwError(state, "the stream contains non-printable characters");
        }
        state.result += _result;
      }
    }
    function mergeMappings(state, destination, source, overridableKeys) {
      var sourceKeys, key, index, quantity;
      if (!common.isObject(source)) {
        throwError(state, "cannot merge mappings; the provided source object is unacceptable");
      }
      sourceKeys = Object.keys(source);
      for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
        key = sourceKeys[index];
        if (!_hasOwnProperty.call(destination, key)) {
          setProperty(destination, key, source[key]);
          overridableKeys[key] = true;
        }
      }
    }
    function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
      var index, quantity;
      if (Array.isArray(keyNode)) {
        keyNode = Array.prototype.slice.call(keyNode);
        for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
          if (Array.isArray(keyNode[index])) {
            throwError(state, "nested arrays are not supported inside keys");
          }
          if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
            keyNode[index] = "[object Object]";
          }
        }
      }
      if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
        keyNode = "[object Object]";
      }
      keyNode = String(keyNode);
      if (_result === null) {
        _result = {};
      }
      if (keyTag === "tag:yaml.org,2002:merge") {
        if (Array.isArray(valueNode)) {
          for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
            mergeMappings(state, _result, valueNode[index], overridableKeys);
          }
        } else {
          mergeMappings(state, _result, valueNode, overridableKeys);
        }
      } else {
        if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
          state.line = startLine || state.line;
          state.lineStart = startLineStart || state.lineStart;
          state.position = startPos || state.position;
          throwError(state, "duplicated mapping key");
        }
        setProperty(_result, keyNode, valueNode);
        delete overridableKeys[keyNode];
      }
      return _result;
    }
    function readLineBreak(state) {
      var ch;
      ch = state.input.charCodeAt(state.position);
      if (ch === 10) {
        state.position++;
      } else if (ch === 13) {
        state.position++;
        if (state.input.charCodeAt(state.position) === 10) {
          state.position++;
        }
      } else {
        throwError(state, "a line break is expected");
      }
      state.line += 1;
      state.lineStart = state.position;
      state.firstTabInLine = -1;
    }
    function skipSeparationSpace(state, allowComments, checkIndent) {
      var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
      while (ch !== 0) {
        while (is_WHITE_SPACE(ch)) {
          if (ch === 9 && state.firstTabInLine === -1) {
            state.firstTabInLine = state.position;
          }
          ch = state.input.charCodeAt(++state.position);
        }
        if (allowComments && ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 10 && ch !== 13 && ch !== 0);
        }
        if (is_EOL(ch)) {
          readLineBreak(state);
          ch = state.input.charCodeAt(state.position);
          lineBreaks++;
          state.lineIndent = 0;
          while (ch === 32) {
            state.lineIndent++;
            ch = state.input.charCodeAt(++state.position);
          }
        } else {
          break;
        }
      }
      if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
        throwWarning(state, "deficient indentation");
      }
      return lineBreaks;
    }
    function testDocumentSeparator(state) {
      var _position = state.position, ch;
      ch = state.input.charCodeAt(_position);
      if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
        _position += 3;
        ch = state.input.charCodeAt(_position);
        if (ch === 0 || is_WS_OR_EOL(ch)) {
          return true;
        }
      }
      return false;
    }
    function writeFoldedLines(state, count) {
      if (count === 1) {
        state.result += " ";
      } else if (count > 1) {
        state.result += common.repeat("\n", count - 1);
      }
    }
    function readPlainScalar(state, nodeIndent, withinFlowCollection) {
      var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
      ch = state.input.charCodeAt(state.position);
      if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
        return false;
      }
      if (ch === 63 || ch === 45) {
        following = state.input.charCodeAt(state.position + 1);
        if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
          return false;
        }
      }
      state.kind = "scalar";
      state.result = "";
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
      while (ch !== 0) {
        if (ch === 58) {
          following = state.input.charCodeAt(state.position + 1);
          if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
            break;
          }
        } else if (ch === 35) {
          preceding = state.input.charCodeAt(state.position - 1);
          if (is_WS_OR_EOL(preceding)) {
            break;
          }
        } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
          break;
        } else if (is_EOL(ch)) {
          _line = state.line;
          _lineStart = state.lineStart;
          _lineIndent = state.lineIndent;
          skipSeparationSpace(state, false, -1);
          if (state.lineIndent >= nodeIndent) {
            hasPendingContent = true;
            ch = state.input.charCodeAt(state.position);
            continue;
          } else {
            state.position = captureEnd;
            state.line = _line;
            state.lineStart = _lineStart;
            state.lineIndent = _lineIndent;
            break;
          }
        }
        if (hasPendingContent) {
          captureSegment(state, captureStart, captureEnd, false);
          writeFoldedLines(state, state.line - _line);
          captureStart = captureEnd = state.position;
          hasPendingContent = false;
        }
        if (!is_WHITE_SPACE(ch)) {
          captureEnd = state.position + 1;
        }
        ch = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, captureEnd, false);
      if (state.result) {
        return true;
      }
      state.kind = _kind;
      state.result = _result;
      return false;
    }
    function readSingleQuotedScalar(state, nodeIndent) {
      var ch, captureStart, captureEnd;
      ch = state.input.charCodeAt(state.position);
      if (ch !== 39) {
        return false;
      }
      state.kind = "scalar";
      state.result = "";
      state.position++;
      captureStart = captureEnd = state.position;
      while ((ch = state.input.charCodeAt(state.position)) !== 0) {
        if (ch === 39) {
          captureSegment(state, captureStart, state.position, true);
          ch = state.input.charCodeAt(++state.position);
          if (ch === 39) {
            captureStart = state.position;
            state.position++;
            captureEnd = state.position;
          } else {
            return true;
          }
        } else if (is_EOL(ch)) {
          captureSegment(state, captureStart, captureEnd, true);
          writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
          captureStart = captureEnd = state.position;
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
          throwError(state, "unexpected end of the document within a single quoted scalar");
        } else {
          state.position++;
          captureEnd = state.position;
        }
      }
      throwError(state, "unexpected end of the stream within a single quoted scalar");
    }
    function readDoubleQuotedScalar(state, nodeIndent) {
      var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch !== 34) {
        return false;
      }
      state.kind = "scalar";
      state.result = "";
      state.position++;
      captureStart = captureEnd = state.position;
      while ((ch = state.input.charCodeAt(state.position)) !== 0) {
        if (ch === 34) {
          captureSegment(state, captureStart, state.position, true);
          state.position++;
          return true;
        } else if (ch === 92) {
          captureSegment(state, captureStart, state.position, true);
          ch = state.input.charCodeAt(++state.position);
          if (is_EOL(ch)) {
            skipSeparationSpace(state, false, nodeIndent);
          } else if (ch < 256 && simpleEscapeCheck[ch]) {
            state.result += simpleEscapeMap[ch];
            state.position++;
          } else if ((tmp = escapedHexLen(ch)) > 0) {
            hexLength = tmp;
            hexResult = 0;
            for (; hexLength > 0; hexLength--) {
              ch = state.input.charCodeAt(++state.position);
              if ((tmp = fromHexCode(ch)) >= 0) {
                hexResult = (hexResult << 4) + tmp;
              } else {
                throwError(state, "expected hexadecimal character");
              }
            }
            state.result += charFromCodepoint(hexResult);
            state.position++;
          } else {
            throwError(state, "unknown escape sequence");
          }
          captureStart = captureEnd = state.position;
        } else if (is_EOL(ch)) {
          captureSegment(state, captureStart, captureEnd, true);
          writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
          captureStart = captureEnd = state.position;
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
          throwError(state, "unexpected end of the document within a double quoted scalar");
        } else {
          state.position++;
          captureEnd = state.position;
        }
      }
      throwError(state, "unexpected end of the stream within a double quoted scalar");
    }
    function readFlowCollection(state, nodeIndent) {
      var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch === 91) {
        terminator = 93;
        isMapping = false;
        _result = [];
      } else if (ch === 123) {
        terminator = 125;
        isMapping = true;
        _result = {};
      } else {
        return false;
      }
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
      }
      ch = state.input.charCodeAt(++state.position);
      while (ch !== 0) {
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if (ch === terminator) {
          state.position++;
          state.tag = _tag;
          state.anchor = _anchor;
          state.kind = isMapping ? "mapping" : "sequence";
          state.result = _result;
          return true;
        } else if (!readNext) {
          throwError(state, "missed comma between flow collection entries");
        } else if (ch === 44) {
          throwError(state, "expected the node content, but found ','");
        }
        keyTag = keyNode = valueNode = null;
        isPair = isExplicitPair = false;
        if (ch === 63) {
          following = state.input.charCodeAt(state.position + 1);
          if (is_WS_OR_EOL(following)) {
            isPair = isExplicitPair = true;
            state.position++;
            skipSeparationSpace(state, true, nodeIndent);
          }
        }
        _line = state.line;
        _lineStart = state.lineStart;
        _pos = state.position;
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        keyTag = state.tag;
        keyNode = state.result;
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if ((isExplicitPair || state.line === _line) && ch === 58) {
          isPair = true;
          ch = state.input.charCodeAt(++state.position);
          skipSeparationSpace(state, true, nodeIndent);
          composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
          valueNode = state.result;
        }
        if (isMapping) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
        } else if (isPair) {
          _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
        } else {
          _result.push(keyNode);
        }
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if (ch === 44) {
          readNext = true;
          ch = state.input.charCodeAt(++state.position);
        } else {
          readNext = false;
        }
      }
      throwError(state, "unexpected end of the stream within a flow collection");
    }
    function readBlockScalar(state, nodeIndent) {
      var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch === 124) {
        folding = false;
      } else if (ch === 62) {
        folding = true;
      } else {
        return false;
      }
      state.kind = "scalar";
      state.result = "";
      while (ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
        if (ch === 43 || ch === 45) {
          if (CHOMPING_CLIP === chomping) {
            chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
          } else {
            throwError(state, "repeat of a chomping mode identifier");
          }
        } else if ((tmp = fromDecimalCode(ch)) >= 0) {
          if (tmp === 0) {
            throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
          } else if (!detectedIndent) {
            textIndent = nodeIndent + tmp - 1;
            detectedIndent = true;
          } else {
            throwError(state, "repeat of an indentation width identifier");
          }
        } else {
          break;
        }
      }
      if (is_WHITE_SPACE(ch)) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (is_WHITE_SPACE(ch));
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (!is_EOL(ch) && ch !== 0);
        }
      }
      while (ch !== 0) {
        readLineBreak(state);
        state.lineIndent = 0;
        ch = state.input.charCodeAt(state.position);
        while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
        if (!detectedIndent && state.lineIndent > textIndent) {
          textIndent = state.lineIndent;
        }
        if (is_EOL(ch)) {
          emptyLines++;
          continue;
        }
        if (state.lineIndent < textIndent) {
          if (chomping === CHOMPING_KEEP) {
            state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
          } else if (chomping === CHOMPING_CLIP) {
            if (didReadContent) {
              state.result += "\n";
            }
          }
          break;
        }
        if (folding) {
          if (is_WHITE_SPACE(ch)) {
            atMoreIndented = true;
            state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
          } else if (atMoreIndented) {
            atMoreIndented = false;
            state.result += common.repeat("\n", emptyLines + 1);
          } else if (emptyLines === 0) {
            if (didReadContent) {
              state.result += " ";
            }
          } else {
            state.result += common.repeat("\n", emptyLines);
          }
        } else {
          state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        }
        didReadContent = true;
        detectedIndent = true;
        emptyLines = 0;
        captureStart = state.position;
        while (!is_EOL(ch) && ch !== 0) {
          ch = state.input.charCodeAt(++state.position);
        }
        captureSegment(state, captureStart, state.position, false);
      }
      return true;
    }
    function readBlockSequence(state, nodeIndent) {
      var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
      if (state.firstTabInLine !== -1)
        return false;
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
      }
      ch = state.input.charCodeAt(state.position);
      while (ch !== 0) {
        if (state.firstTabInLine !== -1) {
          state.position = state.firstTabInLine;
          throwError(state, "tab characters must not be used in indentation");
        }
        if (ch !== 45) {
          break;
        }
        following = state.input.charCodeAt(state.position + 1);
        if (!is_WS_OR_EOL(following)) {
          break;
        }
        detected = true;
        state.position++;
        if (skipSeparationSpace(state, true, -1)) {
          if (state.lineIndent <= nodeIndent) {
            _result.push(null);
            ch = state.input.charCodeAt(state.position);
            continue;
          }
        }
        _line = state.line;
        composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
        _result.push(state.result);
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
        if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
          throwError(state, "bad indentation of a sequence entry");
        } else if (state.lineIndent < nodeIndent) {
          break;
        }
      }
      if (detected) {
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = "sequence";
        state.result = _result;
        return true;
      }
      return false;
    }
    function readBlockMapping(state, nodeIndent, flowIndent) {
      var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
      if (state.firstTabInLine !== -1)
        return false;
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = _result;
      }
      ch = state.input.charCodeAt(state.position);
      while (ch !== 0) {
        if (!atExplicitKey && state.firstTabInLine !== -1) {
          state.position = state.firstTabInLine;
          throwError(state, "tab characters must not be used in indentation");
        }
        following = state.input.charCodeAt(state.position + 1);
        _line = state.line;
        if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
          if (ch === 63) {
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = true;
            allowCompact = true;
          } else if (atExplicitKey) {
            atExplicitKey = false;
            allowCompact = true;
          } else {
            throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
          }
          state.position += 1;
          ch = following;
        } else {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
          if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
            break;
          }
          if (state.line === _line) {
            ch = state.input.charCodeAt(state.position);
            while (is_WHITE_SPACE(ch)) {
              ch = state.input.charCodeAt(++state.position);
            }
            if (ch === 58) {
              ch = state.input.charCodeAt(++state.position);
              if (!is_WS_OR_EOL(ch)) {
                throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
              }
              if (atExplicitKey) {
                storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
                keyTag = keyNode = valueNode = null;
              }
              detected = true;
              atExplicitKey = false;
              allowCompact = false;
              keyTag = state.tag;
              keyNode = state.result;
            } else if (detected) {
              throwError(state, "can not read an implicit mapping pair; a colon is missed");
            } else {
              state.tag = _tag;
              state.anchor = _anchor;
              return true;
            }
          } else if (detected) {
            throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        }
        if (state.line === _line || state.lineIndent > nodeIndent) {
          if (atExplicitKey) {
            _keyLine = state.line;
            _keyLineStart = state.lineStart;
            _keyPos = state.position;
          }
          if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
            if (atExplicitKey) {
              keyNode = state.result;
            } else {
              valueNode = state.result;
            }
          }
          if (!atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          skipSeparationSpace(state, true, -1);
          ch = state.input.charCodeAt(state.position);
        }
        if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
          throwError(state, "bad indentation of a mapping entry");
        } else if (state.lineIndent < nodeIndent) {
          break;
        }
      }
      if (atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
      }
      if (detected) {
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = "mapping";
        state.result = _result;
      }
      return detected;
    }
    function readTagProperty(state) {
      var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch !== 33)
        return false;
      if (state.tag !== null) {
        throwError(state, "duplication of a tag property");
      }
      ch = state.input.charCodeAt(++state.position);
      if (ch === 60) {
        isVerbatim = true;
        ch = state.input.charCodeAt(++state.position);
      } else if (ch === 33) {
        isNamed = true;
        tagHandle = "!!";
        ch = state.input.charCodeAt(++state.position);
      } else {
        tagHandle = "!";
      }
      _position = state.position;
      if (isVerbatim) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && ch !== 62);
        if (state.position < state.length) {
          tagName = state.input.slice(_position, state.position);
          ch = state.input.charCodeAt(++state.position);
        } else {
          throwError(state, "unexpected end of the stream within a verbatim tag");
        }
      } else {
        while (ch !== 0 && !is_WS_OR_EOL(ch)) {
          if (ch === 33) {
            if (!isNamed) {
              tagHandle = state.input.slice(_position - 1, state.position + 1);
              if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
                throwError(state, "named tag handle cannot contain such characters");
              }
              isNamed = true;
              _position = state.position + 1;
            } else {
              throwError(state, "tag suffix cannot contain exclamation marks");
            }
          }
          ch = state.input.charCodeAt(++state.position);
        }
        tagName = state.input.slice(_position, state.position);
        if (PATTERN_FLOW_INDICATORS.test(tagName)) {
          throwError(state, "tag suffix cannot contain flow indicator characters");
        }
      }
      if (tagName && !PATTERN_TAG_URI.test(tagName)) {
        throwError(state, "tag name cannot contain such characters: " + tagName);
      }
      try {
        tagName = decodeURIComponent(tagName);
      } catch (err) {
        throwError(state, "tag name is malformed: " + tagName);
      }
      if (isVerbatim) {
        state.tag = tagName;
      } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
        state.tag = state.tagMap[tagHandle] + tagName;
      } else if (tagHandle === "!") {
        state.tag = "!" + tagName;
      } else if (tagHandle === "!!") {
        state.tag = "tag:yaml.org,2002:" + tagName;
      } else {
        throwError(state, 'undeclared tag handle "' + tagHandle + '"');
      }
      return true;
    }
    function readAnchorProperty(state) {
      var _position, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch !== 38)
        return false;
      if (state.anchor !== null) {
        throwError(state, "duplication of an anchor property");
      }
      ch = state.input.charCodeAt(++state.position);
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (state.position === _position) {
        throwError(state, "name of an anchor node must contain at least one character");
      }
      state.anchor = state.input.slice(_position, state.position);
      return true;
    }
    function readAlias(state) {
      var _position, alias, ch;
      ch = state.input.charCodeAt(state.position);
      if (ch !== 42)
        return false;
      ch = state.input.charCodeAt(++state.position);
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (state.position === _position) {
        throwError(state, "name of an alias node must contain at least one character");
      }
      alias = state.input.slice(_position, state.position);
      if (!_hasOwnProperty.call(state.anchorMap, alias)) {
        throwError(state, 'unidentified alias "' + alias + '"');
      }
      state.result = state.anchorMap[alias];
      skipSeparationSpace(state, true, -1);
      return true;
    }
    function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
      var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type, flowIndent, blockIndent;
      if (state.listener !== null) {
        state.listener("open", state);
      }
      state.tag = null;
      state.anchor = null;
      state.kind = null;
      state.result = null;
      allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
      if (allowToSeek) {
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        }
      }
      if (indentStatus === 1) {
        while (readTagProperty(state) || readAnchorProperty(state)) {
          if (skipSeparationSpace(state, true, -1)) {
            atNewLine = true;
            allowBlockCollections = allowBlockStyles;
            if (state.lineIndent > parentIndent) {
              indentStatus = 1;
            } else if (state.lineIndent === parentIndent) {
              indentStatus = 0;
            } else if (state.lineIndent < parentIndent) {
              indentStatus = -1;
            }
          } else {
            allowBlockCollections = false;
          }
        }
      }
      if (allowBlockCollections) {
        allowBlockCollections = atNewLine || allowCompact;
      }
      if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
        if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
          flowIndent = parentIndent;
        } else {
          flowIndent = parentIndent + 1;
        }
        blockIndent = state.position - state.lineStart;
        if (indentStatus === 1) {
          if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
            hasContent = true;
          } else {
            if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
              hasContent = true;
            } else if (readAlias(state)) {
              hasContent = true;
              if (state.tag !== null || state.anchor !== null) {
                throwError(state, "alias node should not have any properties");
              }
            } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
              hasContent = true;
              if (state.tag === null) {
                state.tag = "?";
              }
            }
            if (state.anchor !== null) {
              state.anchorMap[state.anchor] = state.result;
            }
          }
        } else if (indentStatus === 0) {
          hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
        }
      }
      if (state.tag === null) {
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      } else if (state.tag === "?") {
        if (state.result !== null && state.kind !== "scalar") {
          throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
        }
        for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
          type = state.implicitTypes[typeIndex];
          if (type.resolve(state.result)) {
            state.result = type.construct(state.result);
            state.tag = type.tag;
            if (state.anchor !== null) {
              state.anchorMap[state.anchor] = state.result;
            }
            break;
          }
        }
      } else if (state.tag !== "!") {
        if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) {
          type = state.typeMap[state.kind || "fallback"][state.tag];
        } else {
          type = null;
          typeList = state.typeMap.multi[state.kind || "fallback"];
          for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
            if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
              type = typeList[typeIndex];
              break;
            }
          }
        }
        if (!type) {
          throwError(state, "unknown tag !<" + state.tag + ">");
        }
        if (state.result !== null && type.kind !== state.kind) {
          throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
        }
        if (!type.resolve(state.result, state.tag)) {
          throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
        } else {
          state.result = type.construct(state.result, state.tag);
          if (state.anchor !== null) {
            state.anchorMap[state.anchor] = state.result;
          }
        }
      }
      if (state.listener !== null) {
        state.listener("close", state);
      }
      return state.tag !== null || state.anchor !== null || hasContent;
    }
    function readDocument(state) {
      var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
      state.version = null;
      state.checkLineBreaks = state.legacy;
      state.tagMap = /* @__PURE__ */ Object.create(null);
      state.anchorMap = /* @__PURE__ */ Object.create(null);
      while ((ch = state.input.charCodeAt(state.position)) !== 0) {
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
        if (state.lineIndent > 0 || ch !== 37) {
          break;
        }
        hasDirectives = true;
        ch = state.input.charCodeAt(++state.position);
        _position = state.position;
        while (ch !== 0 && !is_WS_OR_EOL(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        directiveName = state.input.slice(_position, state.position);
        directiveArgs = [];
        if (directiveName.length < 1) {
          throwError(state, "directive name must not be less than one character in length");
        }
        while (ch !== 0) {
          while (is_WHITE_SPACE(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 35) {
            do {
              ch = state.input.charCodeAt(++state.position);
            } while (ch !== 0 && !is_EOL(ch));
            break;
          }
          if (is_EOL(ch))
            break;
          _position = state.position;
          while (ch !== 0 && !is_WS_OR_EOL(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          directiveArgs.push(state.input.slice(_position, state.position));
        }
        if (ch !== 0)
          readLineBreak(state);
        if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
          directiveHandlers[directiveName](state, directiveName, directiveArgs);
        } else {
          throwWarning(state, 'unknown document directive "' + directiveName + '"');
        }
      }
      skipSeparationSpace(state, true, -1);
      if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      } else if (hasDirectives) {
        throwError(state, "directives end mark is expected");
      }
      composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
      skipSeparationSpace(state, true, -1);
      if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
        throwWarning(state, "non-ASCII line breaks are interpreted as content");
      }
      state.documents.push(state.result);
      if (state.position === state.lineStart && testDocumentSeparator(state)) {
        if (state.input.charCodeAt(state.position) === 46) {
          state.position += 3;
          skipSeparationSpace(state, true, -1);
        }
        return;
      }
      if (state.position < state.length - 1) {
        throwError(state, "end of the stream or a document separator is expected");
      } else {
        return;
      }
    }
    function loadDocuments(input, options) {
      input = String(input);
      options = options || {};
      if (input.length !== 0) {
        if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
          input += "\n";
        }
        if (input.charCodeAt(0) === 65279) {
          input = input.slice(1);
        }
      }
      var state = new State(input, options);
      var nullpos = input.indexOf("\0");
      if (nullpos !== -1) {
        state.position = nullpos;
        throwError(state, "null byte is not allowed in input");
      }
      state.input += "\0";
      while (state.input.charCodeAt(state.position) === 32) {
        state.lineIndent += 1;
        state.position += 1;
      }
      while (state.position < state.length - 1) {
        readDocument(state);
      }
      return state.documents;
    }
    function loadAll(input, iterator, options) {
      if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
        options = iterator;
        iterator = null;
      }
      var documents = loadDocuments(input, options);
      if (typeof iterator !== "function") {
        return documents;
      }
      for (var index = 0, length = documents.length; index < length; index += 1) {
        iterator(documents[index]);
      }
    }
    function load(input, options) {
      var documents = loadDocuments(input, options);
      if (documents.length === 0) {
        return void 0;
      } else if (documents.length === 1) {
        return documents[0];
      }
      throw new YAMLException("expected a single document in the stream, but found more");
    }
    module2.exports.loadAll = loadAll;
    module2.exports.load = load;
  }
});

// ../shared/node_modules/js-yaml/lib/dumper.js
var require_dumper = __commonJS({
  "../shared/node_modules/js-yaml/lib/dumper.js"(exports2, module2) {
    "use strict";
    var common = require_common();
    var YAMLException = require_exception();
    var DEFAULT_SCHEMA = require_default();
    var _toString = Object.prototype.toString;
    var _hasOwnProperty = Object.prototype.hasOwnProperty;
    var CHAR_BOM = 65279;
    var CHAR_TAB = 9;
    var CHAR_LINE_FEED = 10;
    var CHAR_CARRIAGE_RETURN = 13;
    var CHAR_SPACE = 32;
    var CHAR_EXCLAMATION = 33;
    var CHAR_DOUBLE_QUOTE = 34;
    var CHAR_SHARP = 35;
    var CHAR_PERCENT = 37;
    var CHAR_AMPERSAND = 38;
    var CHAR_SINGLE_QUOTE = 39;
    var CHAR_ASTERISK = 42;
    var CHAR_COMMA = 44;
    var CHAR_MINUS = 45;
    var CHAR_COLON = 58;
    var CHAR_EQUALS = 61;
    var CHAR_GREATER_THAN = 62;
    var CHAR_QUESTION = 63;
    var CHAR_COMMERCIAL_AT = 64;
    var CHAR_LEFT_SQUARE_BRACKET = 91;
    var CHAR_RIGHT_SQUARE_BRACKET = 93;
    var CHAR_GRAVE_ACCENT = 96;
    var CHAR_LEFT_CURLY_BRACKET = 123;
    var CHAR_VERTICAL_LINE = 124;
    var CHAR_RIGHT_CURLY_BRACKET = 125;
    var ESCAPE_SEQUENCES = {};
    ESCAPE_SEQUENCES[0] = "\\0";
    ESCAPE_SEQUENCES[7] = "\\a";
    ESCAPE_SEQUENCES[8] = "\\b";
    ESCAPE_SEQUENCES[9] = "\\t";
    ESCAPE_SEQUENCES[10] = "\\n";
    ESCAPE_SEQUENCES[11] = "\\v";
    ESCAPE_SEQUENCES[12] = "\\f";
    ESCAPE_SEQUENCES[13] = "\\r";
    ESCAPE_SEQUENCES[27] = "\\e";
    ESCAPE_SEQUENCES[34] = '\\"';
    ESCAPE_SEQUENCES[92] = "\\\\";
    ESCAPE_SEQUENCES[133] = "\\N";
    ESCAPE_SEQUENCES[160] = "\\_";
    ESCAPE_SEQUENCES[8232] = "\\L";
    ESCAPE_SEQUENCES[8233] = "\\P";
    var DEPRECATED_BOOLEANS_SYNTAX = [
      "y",
      "Y",
      "yes",
      "Yes",
      "YES",
      "on",
      "On",
      "ON",
      "n",
      "N",
      "no",
      "No",
      "NO",
      "off",
      "Off",
      "OFF"
    ];
    var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
    function compileStyleMap(schema, map) {
      var result, keys, index, length, tag, style, type;
      if (map === null)
        return {};
      result = {};
      keys = Object.keys(map);
      for (index = 0, length = keys.length; index < length; index += 1) {
        tag = keys[index];
        style = String(map[tag]);
        if (tag.slice(0, 2) === "!!") {
          tag = "tag:yaml.org,2002:" + tag.slice(2);
        }
        type = schema.compiledTypeMap["fallback"][tag];
        if (type && _hasOwnProperty.call(type.styleAliases, style)) {
          style = type.styleAliases[style];
        }
        result[tag] = style;
      }
      return result;
    }
    function encodeHex(character) {
      var string, handle, length;
      string = character.toString(16).toUpperCase();
      if (character <= 255) {
        handle = "x";
        length = 2;
      } else if (character <= 65535) {
        handle = "u";
        length = 4;
      } else if (character <= 4294967295) {
        handle = "U";
        length = 8;
      } else {
        throw new YAMLException("code point within a string may not be greater than 0xFFFFFFFF");
      }
      return "\\" + handle + common.repeat("0", length - string.length) + string;
    }
    var QUOTING_TYPE_SINGLE = 1;
    var QUOTING_TYPE_DOUBLE = 2;
    function State(options) {
      this.schema = options["schema"] || DEFAULT_SCHEMA;
      this.indent = Math.max(1, options["indent"] || 2);
      this.noArrayIndent = options["noArrayIndent"] || false;
      this.skipInvalid = options["skipInvalid"] || false;
      this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
      this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
      this.sortKeys = options["sortKeys"] || false;
      this.lineWidth = options["lineWidth"] || 80;
      this.noRefs = options["noRefs"] || false;
      this.noCompatMode = options["noCompatMode"] || false;
      this.condenseFlow = options["condenseFlow"] || false;
      this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
      this.forceQuotes = options["forceQuotes"] || false;
      this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
      this.implicitTypes = this.schema.compiledImplicit;
      this.explicitTypes = this.schema.compiledExplicit;
      this.tag = null;
      this.result = "";
      this.duplicates = [];
      this.usedDuplicates = null;
    }
    function indentString(string, spaces) {
      var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
      while (position < length) {
        next = string.indexOf("\n", position);
        if (next === -1) {
          line = string.slice(position);
          position = length;
        } else {
          line = string.slice(position, next + 1);
          position = next + 1;
        }
        if (line.length && line !== "\n")
          result += ind;
        result += line;
      }
      return result;
    }
    function generateNextLine(state, level) {
      return "\n" + common.repeat(" ", state.indent * level);
    }
    function testImplicitResolving(state, str) {
      var index, length, type;
      for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
        type = state.implicitTypes[index];
        if (type.resolve(str)) {
          return true;
        }
      }
      return false;
    }
    function isWhitespace(c) {
      return c === CHAR_SPACE || c === CHAR_TAB;
    }
    function isPrintable(c) {
      return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
    }
    function isNsCharOrWhitespace(c) {
      return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
    }
    function isPlainSafe(c, prev, inblock) {
      var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
      var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
      return (
        // ns-plain-safe
        (inblock ? (
          // c = flow-in
          cIsNsCharOrWhitespace
        ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
      );
    }
    function isPlainSafeFirst(c) {
      return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
    }
    function isPlainSafeLast(c) {
      return !isWhitespace(c) && c !== CHAR_COLON;
    }
    function codePointAt(string, pos) {
      var first = string.charCodeAt(pos), second;
      if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
        second = string.charCodeAt(pos + 1);
        if (second >= 56320 && second <= 57343) {
          return (first - 55296) * 1024 + second - 56320 + 65536;
        }
      }
      return first;
    }
    function needIndentIndicator(string) {
      var leadingSpaceRe = /^\n* /;
      return leadingSpaceRe.test(string);
    }
    var STYLE_PLAIN = 1;
    var STYLE_SINGLE = 2;
    var STYLE_LITERAL = 3;
    var STYLE_FOLDED = 4;
    var STYLE_DOUBLE = 5;
    function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
      var i;
      var char = 0;
      var prevChar = null;
      var hasLineBreak = false;
      var hasFoldableLine = false;
      var shouldTrackWidth = lineWidth !== -1;
      var previousLineBreak = -1;
      var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
      if (singleLineOnly || forceQuotes) {
        for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
          char = codePointAt(string, i);
          if (!isPrintable(char)) {
            return STYLE_DOUBLE;
          }
          plain = plain && isPlainSafe(char, prevChar, inblock);
          prevChar = char;
        }
      } else {
        for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
          char = codePointAt(string, i);
          if (char === CHAR_LINE_FEED) {
            hasLineBreak = true;
            if (shouldTrackWidth) {
              hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
              i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
              previousLineBreak = i;
            }
          } else if (!isPrintable(char)) {
            return STYLE_DOUBLE;
          }
          plain = plain && isPlainSafe(char, prevChar, inblock);
          prevChar = char;
        }
        hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
      }
      if (!hasLineBreak && !hasFoldableLine) {
        if (plain && !forceQuotes && !testAmbiguousType(string)) {
          return STYLE_PLAIN;
        }
        return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
      }
      if (indentPerLevel > 9 && needIndentIndicator(string)) {
        return STYLE_DOUBLE;
      }
      if (!forceQuotes) {
        return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    function writeScalar(state, string, level, iskey, inblock) {
      state.dump = function() {
        if (string.length === 0) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
        }
        if (!state.noCompatMode) {
          if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
            return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
          }
        }
        var indent = state.indent * Math.max(1, level);
        var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
        var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
        function testAmbiguity(string2) {
          return testImplicitResolving(state, string2);
        }
        switch (chooseScalarStyle(
          string,
          singleLineOnly,
          state.indent,
          lineWidth,
          testAmbiguity,
          state.quotingType,
          state.forceQuotes && !iskey,
          inblock
        )) {
          case STYLE_PLAIN:
            return string;
          case STYLE_SINGLE:
            return "'" + string.replace(/'/g, "''") + "'";
          case STYLE_LITERAL:
            return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
          case STYLE_FOLDED:
            return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
          case STYLE_DOUBLE:
            return '"' + escapeString(string, lineWidth) + '"';
          default:
            throw new YAMLException("impossible error: invalid scalar style");
        }
      }();
    }
    function blockHeader(string, indentPerLevel) {
      var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
      var clip = string[string.length - 1] === "\n";
      var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
      var chomp = keep ? "+" : clip ? "" : "-";
      return indentIndicator + chomp + "\n";
    }
    function dropEndingNewline(string) {
      return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
    }
    function foldString(string, width) {
      var lineRe = /(\n+)([^\n]*)/g;
      var result = function() {
        var nextLF = string.indexOf("\n");
        nextLF = nextLF !== -1 ? nextLF : string.length;
        lineRe.lastIndex = nextLF;
        return foldLine(string.slice(0, nextLF), width);
      }();
      var prevMoreIndented = string[0] === "\n" || string[0] === " ";
      var moreIndented;
      var match;
      while (match = lineRe.exec(string)) {
        var prefix = match[1], line = match[2];
        moreIndented = line[0] === " ";
        result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
        prevMoreIndented = moreIndented;
      }
      return result;
    }
    function foldLine(line, width) {
      if (line === "" || line[0] === " ")
        return line;
      var breakRe = / [^ ]/g;
      var match;
      var start = 0, end, curr = 0, next = 0;
      var result = "";
      while (match = breakRe.exec(line)) {
        next = match.index;
        if (next - start > width) {
          end = curr > start ? curr : next;
          result += "\n" + line.slice(start, end);
          start = end + 1;
        }
        curr = next;
      }
      result += "\n";
      if (line.length - start > width && curr > start) {
        result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
      } else {
        result += line.slice(start);
      }
      return result.slice(1);
    }
    function escapeString(string) {
      var result = "";
      var char = 0;
      var escapeSeq;
      for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        escapeSeq = ESCAPE_SEQUENCES[char];
        if (!escapeSeq && isPrintable(char)) {
          result += string[i];
          if (char >= 65536)
            result += string[i + 1];
        } else {
          result += escapeSeq || encodeHex(char);
        }
      }
      return result;
    }
    function writeFlowSequence(state, level, object) {
      var _result = "", _tag = state.tag, index, length, value;
      for (index = 0, length = object.length; index < length; index += 1) {
        value = object[index];
        if (state.replacer) {
          value = state.replacer.call(object, String(index), value);
        }
        if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
          if (_result !== "")
            _result += "," + (!state.condenseFlow ? " " : "");
          _result += state.dump;
        }
      }
      state.tag = _tag;
      state.dump = "[" + _result + "]";
    }
    function writeBlockSequence(state, level, object, compact) {
      var _result = "", _tag = state.tag, index, length, value;
      for (index = 0, length = object.length; index < length; index += 1) {
        value = object[index];
        if (state.replacer) {
          value = state.replacer.call(object, String(index), value);
        }
        if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
          if (!compact || _result !== "") {
            _result += generateNextLine(state, level);
          }
          if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
            _result += "-";
          } else {
            _result += "- ";
          }
          _result += state.dump;
        }
      }
      state.tag = _tag;
      state.dump = _result || "[]";
    }
    function writeFlowMapping(state, level, object) {
      var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
      for (index = 0, length = objectKeyList.length; index < length; index += 1) {
        pairBuffer = "";
        if (_result !== "")
          pairBuffer += ", ";
        if (state.condenseFlow)
          pairBuffer += '"';
        objectKey = objectKeyList[index];
        objectValue = object[objectKey];
        if (state.replacer) {
          objectValue = state.replacer.call(object, objectKey, objectValue);
        }
        if (!writeNode(state, level, objectKey, false, false)) {
          continue;
        }
        if (state.dump.length > 1024)
          pairBuffer += "? ";
        pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
        if (!writeNode(state, level, objectValue, false, false)) {
          continue;
        }
        pairBuffer += state.dump;
        _result += pairBuffer;
      }
      state.tag = _tag;
      state.dump = "{" + _result + "}";
    }
    function writeBlockMapping(state, level, object, compact) {
      var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
      if (state.sortKeys === true) {
        objectKeyList.sort();
      } else if (typeof state.sortKeys === "function") {
        objectKeyList.sort(state.sortKeys);
      } else if (state.sortKeys) {
        throw new YAMLException("sortKeys must be a boolean or a function");
      }
      for (index = 0, length = objectKeyList.length; index < length; index += 1) {
        pairBuffer = "";
        if (!compact || _result !== "") {
          pairBuffer += generateNextLine(state, level);
        }
        objectKey = objectKeyList[index];
        objectValue = object[objectKey];
        if (state.replacer) {
          objectValue = state.replacer.call(object, objectKey, objectValue);
        }
        if (!writeNode(state, level + 1, objectKey, true, true, true)) {
          continue;
        }
        explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
        if (explicitPair) {
          if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
            pairBuffer += "?";
          } else {
            pairBuffer += "? ";
          }
        }
        pairBuffer += state.dump;
        if (explicitPair) {
          pairBuffer += generateNextLine(state, level);
        }
        if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
          continue;
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += ":";
        } else {
          pairBuffer += ": ";
        }
        pairBuffer += state.dump;
        _result += pairBuffer;
      }
      state.tag = _tag;
      state.dump = _result || "{}";
    }
    function detectType(state, object, explicit) {
      var _result, typeList, index, length, type, style;
      typeList = explicit ? state.explicitTypes : state.implicitTypes;
      for (index = 0, length = typeList.length; index < length; index += 1) {
        type = typeList[index];
        if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === "object" && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
          if (explicit) {
            if (type.multi && type.representName) {
              state.tag = type.representName(object);
            } else {
              state.tag = type.tag;
            }
          } else {
            state.tag = "?";
          }
          if (type.represent) {
            style = state.styleMap[type.tag] || type.defaultStyle;
            if (_toString.call(type.represent) === "[object Function]") {
              _result = type.represent(object, style);
            } else if (_hasOwnProperty.call(type.represent, style)) {
              _result = type.represent[style](object, style);
            } else {
              throw new YAMLException("!<" + type.tag + '> tag resolver accepts not "' + style + '" style');
            }
            state.dump = _result;
          }
          return true;
        }
      }
      return false;
    }
    function writeNode(state, level, object, block, compact, iskey, isblockseq) {
      state.tag = null;
      state.dump = object;
      if (!detectType(state, object, false)) {
        detectType(state, object, true);
      }
      var type = _toString.call(state.dump);
      var inblock = block;
      var tagStr;
      if (block) {
        block = state.flowLevel < 0 || state.flowLevel > level;
      }
      var objectOrArray = type === "[object Object]" || type === "[object Array]", duplicateIndex, duplicate;
      if (objectOrArray) {
        duplicateIndex = state.duplicates.indexOf(object);
        duplicate = duplicateIndex !== -1;
      }
      if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
        compact = false;
      }
      if (duplicate && state.usedDuplicates[duplicateIndex]) {
        state.dump = "*ref_" + duplicateIndex;
      } else {
        if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
          state.usedDuplicates[duplicateIndex] = true;
        }
        if (type === "[object Object]") {
          if (block && Object.keys(state.dump).length !== 0) {
            writeBlockMapping(state, level, state.dump, compact);
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + state.dump;
            }
          } else {
            writeFlowMapping(state, level, state.dump);
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + " " + state.dump;
            }
          }
        } else if (type === "[object Array]") {
          if (block && state.dump.length !== 0) {
            if (state.noArrayIndent && !isblockseq && level > 0) {
              writeBlockSequence(state, level - 1, state.dump, compact);
            } else {
              writeBlockSequence(state, level, state.dump, compact);
            }
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + state.dump;
            }
          } else {
            writeFlowSequence(state, level, state.dump);
            if (duplicate) {
              state.dump = "&ref_" + duplicateIndex + " " + state.dump;
            }
          }
        } else if (type === "[object String]") {
          if (state.tag !== "?") {
            writeScalar(state, state.dump, level, iskey, inblock);
          }
        } else if (type === "[object Undefined]") {
          return false;
        } else {
          if (state.skipInvalid)
            return false;
          throw new YAMLException("unacceptable kind of an object to dump " + type);
        }
        if (state.tag !== null && state.tag !== "?") {
          tagStr = encodeURI(
            state.tag[0] === "!" ? state.tag.slice(1) : state.tag
          ).replace(/!/g, "%21");
          if (state.tag[0] === "!") {
            tagStr = "!" + tagStr;
          } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
            tagStr = "!!" + tagStr.slice(18);
          } else {
            tagStr = "!<" + tagStr + ">";
          }
          state.dump = tagStr + " " + state.dump;
        }
      }
      return true;
    }
    function getDuplicateReferences(object, state) {
      var objects = [], duplicatesIndexes = [], index, length;
      inspectNode(object, objects, duplicatesIndexes);
      for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
        state.duplicates.push(objects[duplicatesIndexes[index]]);
      }
      state.usedDuplicates = new Array(length);
    }
    function inspectNode(object, objects, duplicatesIndexes) {
      var objectKeyList, index, length;
      if (object !== null && typeof object === "object") {
        index = objects.indexOf(object);
        if (index !== -1) {
          if (duplicatesIndexes.indexOf(index) === -1) {
            duplicatesIndexes.push(index);
          }
        } else {
          objects.push(object);
          if (Array.isArray(object)) {
            for (index = 0, length = object.length; index < length; index += 1) {
              inspectNode(object[index], objects, duplicatesIndexes);
            }
          } else {
            objectKeyList = Object.keys(object);
            for (index = 0, length = objectKeyList.length; index < length; index += 1) {
              inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
            }
          }
        }
      }
    }
    function dump(input, options) {
      options = options || {};
      var state = new State(options);
      if (!state.noRefs)
        getDuplicateReferences(input, state);
      var value = input;
      if (state.replacer) {
        value = state.replacer.call({ "": value }, "", value);
      }
      if (writeNode(state, 0, value, true, true))
        return state.dump + "\n";
      return "";
    }
    module2.exports.dump = dump;
  }
});

// ../shared/node_modules/js-yaml/index.js
var require_js_yaml = __commonJS({
  "../shared/node_modules/js-yaml/index.js"(exports2, module2) {
    "use strict";
    var loader = require_loader();
    var dumper = require_dumper();
    function renamed(from, to) {
      return function() {
        throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
      };
    }
    module2.exports.Type = require_type();
    module2.exports.Schema = require_schema();
    module2.exports.FAILSAFE_SCHEMA = require_failsafe();
    module2.exports.JSON_SCHEMA = require_json();
    module2.exports.CORE_SCHEMA = require_core();
    module2.exports.DEFAULT_SCHEMA = require_default();
    module2.exports.load = loader.load;
    module2.exports.loadAll = loader.loadAll;
    module2.exports.dump = dumper.dump;
    module2.exports.YAMLException = require_exception();
    module2.exports.types = {
      binary: require_binary(),
      float: require_float(),
      map: require_map(),
      null: require_null(),
      pairs: require_pairs(),
      set: require_set(),
      timestamp: require_timestamp(),
      bool: require_bool(),
      int: require_int(),
      merge: require_merge(),
      omap: require_omap(),
      seq: require_seq(),
      str: require_str()
    };
    module2.exports.safeLoad = renamed("safeLoad", "load");
    module2.exports.safeLoadAll = renamed("safeLoadAll", "loadAll");
    module2.exports.safeDump = renamed("safeDump", "dump");
  }
});

// ../shared/dist/parsers/standards.js
var require_standards = __commonJS({
  "../shared/dist/parsers/standards.js"(exports2) {
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
    exports2.parseStandardDefinition = parseStandardDefinition;
    exports2.readStandardDefinition = readStandardDefinition;
    exports2.findRule = findRule;
    exports2.findRuleLineRange = findRuleLineRange2;
    exports2._clearStandardsCache = _clearStandardsCache;
    var fs2 = __importStar(require("fs"));
    var yaml = __importStar(require_js_yaml());
    var conform_pending_js_1 = require_conform_pending();
    var cache = /* @__PURE__ */ new Map();
    var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
    function coerceSeverity(s) {
      if (s === "error" || s === "warn" || s === "info")
        return s;
      return null;
    }
    function coerceString(s) {
      if (typeof s === "string" && s.length > 0)
        return s;
      return null;
    }
    function coerceArray(s) {
      if (Array.isArray(s) && s.length > 0)
        return s;
      return null;
    }
    function parseRules(rawRules) {
      if (!Array.isArray(rawRules))
        return [];
      const out = [];
      for (const r of rawRules) {
        if (!r || typeof r !== "object")
          continue;
        const rec = r;
        const id = coerceString(rec.id);
        if (!id)
          continue;
        out.push({
          id,
          title: coerceString(rec.title),
          severity: coerceSeverity(rec.severity),
          description: coerceString(rec.description),
          why: coerceString(rec.why),
          fixHint: coerceString(rec.fix_hint),
          examples: coerceArray(rec.examples),
          exceptions: coerceArray(rec.exceptions)
        });
      }
      return out;
    }
    function parseStandardDefinition(content, filePath) {
      const m = content.match(FRONTMATTER_RE);
      if (!m)
        return null;
      let data;
      try {
        data = yaml.load(m[1]);
      } catch {
        return null;
      }
      if (!data || typeof data !== "object")
        return null;
      const rec = data;
      if (rec.type !== "standard")
        return null;
      const id = coerceString(rec.id);
      if (!id)
        return null;
      return {
        id,
        kind: coerceString(rec.kind),
        appScope: coerceString(rec.app_scope),
        topic: coerceString(rec.topic),
        tags: Array.isArray(rec.tags) ? rec.tags.filter((t) => typeof t === "string") : [],
        rules: parseRules(rec.rules),
        filePath
      };
    }
    function readStandardDefinition(kbRoot, standardId) {
      if (!standardId)
        return null;
      const filePath = (0, conform_pending_js_1.resolveStandardPath)(kbRoot, standardId);
      if (!filePath)
        return null;
      let stat;
      try {
        stat = fs2.statSync(filePath);
      } catch {
        return null;
      }
      const cached = cache.get(filePath);
      if (cached && cached.mtimeMs === stat.mtimeMs)
        return cached.def;
      let def;
      try {
        def = parseStandardDefinition(fs2.readFileSync(filePath, "utf8"), filePath);
      } catch {
        def = null;
      }
      cache.set(filePath, { mtimeMs: stat.mtimeMs, def });
      return def;
    }
    function findRule(def, ruleId) {
      if (!def || !ruleId)
        return null;
      return def.rules.find((r) => r.id === ruleId) ?? null;
    }
    function findRuleLineRange2(filePath, ruleId) {
      if (!ruleId)
        return null;
      let text;
      try {
        text = fs2.readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
      const lines = text.split(/\r?\n/);
      let inFrontmatter = false;
      let frontmatterEnd = -1;
      let rulesStart = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i === 0 && line.trim() === "---") {
          inFrontmatter = true;
          continue;
        }
        if (inFrontmatter && line.trim() === "---") {
          frontmatterEnd = i;
          break;
        }
        if (inFrontmatter && /^rules:\s*$/.test(line)) {
          rulesStart = i;
        }
      }
      if (rulesStart < 0)
        return null;
      const scanEnd = frontmatterEnd > 0 ? frontmatterEnd : lines.length;
      const target = new RegExp(`^\\s+-\\s+id:\\s+${escapeRegex(ruleId)}\\s*$`);
      let start = -1;
      let end = scanEnd - 1;
      for (let i = rulesStart + 1; i < scanEnd; i++) {
        if (target.test(lines[i])) {
          start = i;
          for (let j = i + 1; j < scanEnd; j++) {
            if (/^\s+-\s+id:\s+/.test(lines[j])) {
              end = j - 1;
              return { start, end };
            }
          }
          end = scanEnd - 1;
          return { start, end };
        }
      }
      return null;
    }
    function escapeRegex(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    function _clearStandardsCache() {
      cache.clear();
    }
  }
});

// ../shared/dist/parsers/drift-log.js
var require_drift_log = __commonJS({
  "../shared/dist/parsers/drift-log.js"(exports2) {
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
    exports2.parseDriftLog = parseDriftLog;
    exports2.readDriftLog = readDriftLog;
    exports2.currentAndPreviousMonth = currentAndPreviousMonth;
    var fs2 = __importStar(require("fs"));
    var baseline_js_1 = require_baseline();
    var kb_root_js_1 = require_kb_root();
    var HEADING_RE = /^##\s+(\d{4}-\d{2}-\d{2})\s+·\s+(.+)$/;
    function classifyHeading(rest) {
      const upper = rest.toUpperCase();
      if (upper.startsWith("CONFORMED")) {
        if (upper.includes("APPLIED"))
          return { type: "conformed-applied", isSystem: false };
        if (upper.includes("EXEMPTED"))
          return { type: "conformed-exempted", isSystem: false };
        if (upper.includes("PROMOTED"))
          return { type: "conformed-promoted", isSystem: false };
      }
      if (upper.startsWith("DISMISSED-CONFORM"))
        return { type: "dismissed-conform", isSystem: false };
      if (upper.startsWith("CLOSED-PROMOTION"))
        return { type: "closed-promotion", isSystem: false };
      if (upper.startsWith("AUTO-DISMISSED")) {
        return { type: "auto-dismissed-standard-removed", isSystem: true };
      }
      if (upper.startsWith("AUTO-CLOSED-PROMOTION")) {
        if (upper.includes("RULE CHANGED")) {
          return { type: "auto-closed-promotion-rule-changed", isSystem: true };
        }
        return { type: "auto-closed-promotion-standard-removed", isSystem: true };
      }
      if (upper.startsWith("RESOLVED"))
        return { type: "drift-resolved", isSystem: false };
      if (upper.startsWith("DISMISSED"))
        return { type: "drift-dismissed", isSystem: false };
      if (upper.startsWith("RE-BOOTSTRAP") || upper.includes("BOOTSTRAP")) {
        return { type: "re-bootstrap", isSystem: true };
      }
      return { type: "unknown", isSystem: false };
    }
    function extractField(block, label) {
      const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+?)(?:\\n|$)`);
      const m = block.match(re);
      return m ? m[1].trim() : void 0;
    }
    function extractFileList(block, label) {
      const raw = extractField(block, label);
      if (!raw)
        return void 0;
      const out = [];
      for (const m of raw.matchAll(/`([^`]+)`/g))
        out.push(m[1]);
      return out.length > 0 ? out : void 0;
    }
    function unquote(s) {
      if (!s)
        return s;
      return s.replace(/^`(.+)`$/, "$1");
    }
    function parseDriftLog(content) {
      const { blocks } = (0, baseline_js_1.splitHeaderAndBlocks)(content);
      const events = [];
      for (const block of blocks) {
        const headingMatch = block.match(HEADING_RE);
        if (!headingMatch)
          continue;
        const date = headingMatch[1];
        const rest = headingMatch[2];
        const { type, isSystem } = classifyHeading(rest);
        const ev = {
          date,
          eventType: type,
          rawHeading: `## ${date} \xB7 ${rest}`,
          isSystem
        };
        const queueKey = unquote(extractField(block, "Queue key"));
        if (queueKey)
          ev.queueKey = queueKey;
        const kbTarget = unquote(extractField(block, "KB target"));
        if (kbTarget)
          ev.kbTarget = kbTarget;
        const kbFile = unquote(extractField(block, "KB file"));
        if (kbFile)
          ev.kbFile = kbFile;
        const files = extractFileList(block, "Files");
        if (files)
          ev.files = files;
        const orig = extractFileList(block, "Originating files");
        if (orig)
          ev.originatingFiles = orig;
        const reason = extractField(block, "Reason");
        if (reason)
          ev.reason = reason;
        const note = extractField(block, "Note");
        if (note)
          ev.note = note;
        events.push(ev);
      }
      return events;
    }
    function readDriftLog(kbRoot, monthKeys) {
      const all = [];
      for (const month of monthKeys) {
        const file = (0, kb_root_js_1.kbSyncPath)(kbRoot, "drift-log", `${month}.md`);
        if (!fs2.existsSync(file))
          continue;
        all.push(...parseDriftLog(fs2.readFileSync(file, "utf8")));
      }
      all.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
      return all;
    }
    function currentAndPreviousMonth(now = /* @__PURE__ */ new Date()) {
      const yyyy = now.getUTCFullYear();
      const mm = now.getUTCMonth();
      const cur = `${yyyy}-${String(mm + 1).padStart(2, "0")}`;
      const prevDate = new Date(Date.UTC(yyyy, mm - 1, 1));
      const prev = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
      return [cur, prev];
    }
  }
});

// ../shared/dist/submodule-status.js
var require_submodule_status = __commonJS({
  "../shared/dist/submodule-status.js"(exports2) {
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
    exports2.getSubmoduleStatus = getSubmoduleStatus;
    exports2.buildPushPlan = buildPushPlan2;
    var fs2 = __importStar(require("fs"));
    var path4 = __importStar(require("path"));
    var node_child_process_1 = require("child_process");
    var node_util_1 = require("util");
    var execFileP = (0, node_util_1.promisify)(node_child_process_1.execFile);
    async function gitOut(cwd, args) {
      try {
        const { stdout } = await execFileP("git", args, { cwd, encoding: "utf8" });
        return stdout.trim();
      } catch {
        return null;
      }
    }
    function resolveGitdirHead(absSubPath) {
      const dotGit = path4.join(absSubPath, ".git");
      let st;
      try {
        st = fs2.statSync(dotGit);
      } catch {
        return null;
      }
      if (st.isDirectory()) {
        const head = path4.join(dotGit, "HEAD");
        return fs2.existsSync(head) ? head : null;
      }
      if (st.isFile()) {
        try {
          const content = fs2.readFileSync(dotGit, "utf8");
          const m = content.match(/^gitdir:\s*(.+)\s*$/m);
          if (!m)
            return null;
          const gitdir = path4.isAbsolute(m[1]) ? m[1] : path4.resolve(absSubPath, m[1]);
          const head = path4.join(gitdir, "HEAD");
          return fs2.existsSync(head) ? head : null;
        } catch {
          return null;
        }
      }
      return null;
    }
    function parseGitmodules(text) {
      const out = [];
      const blocks = text.split(/(?=\[submodule\s+"[^"]+"\])/).filter((b) => b.trim());
      for (const block of blocks) {
        const nameMatch = block.match(/\[submodule\s+"([^"]+)"\]/);
        const pathMatch = block.match(/^\s*path\s*=\s*(.+)\s*$/m);
        if (!nameMatch || !pathMatch)
          continue;
        out.push({
          name: nameMatch[1].trim(),
          path: pathMatch[1].trim(),
          isShared: /^\s*kb-shared\s*=\s*true\s*$/m.test(block)
        });
      }
      return out;
    }
    async function pointerChanged(repoRoot, subPath) {
      const localTree = await gitOut(repoRoot, ["ls-tree", "HEAD", subPath]);
      const localSha = localTree?.split(/\s+/)[2] ?? "";
      let upstream = await gitOut(repoRoot, ["rev-parse", "@{upstream}"]);
      if (!upstream) {
        upstream = await gitOut(repoRoot, ["rev-parse", "origin/main"]) || await gitOut(repoRoot, ["rev-parse", "origin/master"]);
      }
      if (!upstream) {
        return false;
      }
      const remoteTree = await gitOut(repoRoot, ["ls-tree", upstream, subPath]);
      const remoteSha = remoteTree?.split(/\s+/)[2] ?? "";
      return localSha !== remoteSha;
    }
    async function getSubmoduleStatus(kbRoot, opts = {}) {
      const repoRoot = opts.repoRoot ?? kbRoot;
      const gitmodulesPath = path4.join(repoRoot, ".gitmodules");
      if (!fs2.existsSync(gitmodulesPath))
        return null;
      let text;
      try {
        text = fs2.readFileSync(gitmodulesPath, "utf8");
      } catch {
        return null;
      }
      const parsed = parseGitmodules(text);
      const parentBranch = await gitOut(repoRoot, ["symbolic-ref", "--short", "HEAD"]);
      const parentGitdirHeadPath = resolveGitdirHead(repoRoot);
      const entries = [];
      for (const p of parsed) {
        const fullPath = path4.resolve(repoRoot, p.path);
        if (!fs2.existsSync(fullPath))
          continue;
        const type = p.isShared ? "shared" : "owned";
        const branch = await gitOut(fullPath, ["symbolic-ref", "--short", "HEAD"]);
        const ptr = await pointerChanged(repoRoot, p.path);
        const branchMismatch = type === "owned" && ptr && branch !== null && parentBranch !== null && branch !== parentBranch;
        entries.push({
          name: p.name,
          path: p.path,
          fullPath,
          type,
          branch,
          pointerChanged: ptr,
          branchMismatch,
          gitdirHeadPath: resolveGitdirHead(fullPath)
        });
      }
      const blockingPaths = entries.filter((e) => e.branchMismatch).map((e) => e.path);
      const sharedPointerChanged = entries.filter((e) => e.type === "shared" && e.pointerChanged).map((e) => e.path);
      return {
        parentBranch,
        parentGitdirHeadPath,
        entries,
        wouldBlock: blockingPaths.length > 0,
        blockingPaths,
        sharedPointerChanged
      };
    }
    function buildPushPlan2(repoRoot, status) {
      const plan = [];
      const owned = status.entries.filter((e) => e.type === "owned" && e.pointerChanged);
      const shared = status.entries.filter((e) => e.type === "shared" && e.pointerChanged);
      let order = 1;
      for (const e of [...owned, ...shared]) {
        const branch = e.type === "shared" ? e.branch ?? status.parentBranch : status.parentBranch;
        plan.push({
          order: order++,
          type: e.type,
          path: e.path,
          fullPath: e.fullPath,
          branch,
          action: branch ? `push -u origin ${branch}` : "push"
        });
      }
      plan.push({
        order,
        type: "parent",
        path: ".",
        fullPath: repoRoot,
        branch: status.parentBranch,
        action: "push"
      });
      return plan;
    }
  }
});

// ../shared/dist/hooks-status.js
var require_hooks_status = __commonJS({
  "../shared/dist/hooks-status.js"(exports2) {
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
    exports2.getHooksStatus = getHooksStatus;
    var fs2 = __importStar(require("fs"));
    var path4 = __importStar(require("path"));
    var node_child_process_1 = require("child_process");
    var node_util_1 = require("util");
    var execFileP = (0, node_util_1.promisify)(node_child_process_1.execFile);
    var MANAGED_HOOKS = ["pre-commit", "pre-push", "post-merge", "post-checkout"];
    var MARKER = "# kb-mcp managed";
    async function resolveHooksDir(repoRoot) {
      try {
        const { stdout } = await execFileP("git", ["rev-parse", "--git-path", "hooks"], { cwd: repoRoot, encoding: "utf8" });
        const rel = stdout.trim();
        if (!rel)
          return null;
        return path4.isAbsolute(rel) ? rel : path4.resolve(repoRoot, rel);
      } catch {
        return null;
      }
    }
    async function getHooksStatus(repoRoot) {
      const hooksDir = await resolveHooksDir(repoRoot);
      if (!hooksDir)
        return null;
      const hooks = MANAGED_HOOKS.map((name) => {
        const file = path4.join(hooksDir, name);
        let present = false;
        let managed = false;
        try {
          const content = fs2.readFileSync(file, "utf8");
          present = true;
          managed = content.includes(MARKER);
        } catch {
          present = false;
        }
        return { name, present, managed };
      });
      const allManaged = hooks.every((h) => h.managed);
      const anyManaged = hooks.some((h) => h.managed);
      const health = allManaged ? "managed" : anyManaged ? "partial" : "missing";
      return { health, hooks };
    }
  }
});

// ../shared/dist/status.js
var require_status = __commonJS({
  "../shared/dist/status.js"(exports2) {
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
    exports2.getStatus = getStatus2;
    var node_child_process_1 = require("child_process");
    var fs2 = __importStar(require("fs"));
    var path4 = __importStar(require("path"));
    var node_util_1 = require("util");
    var code_drift_js_1 = require_code_drift();
    var kb_drift_js_1 = require_kb_drift();
    var standards_drift_js_1 = require_standards_drift();
    var conform_pending_js_1 = require_conform_pending();
    var promotions_js_1 = require_promotions();
    var lint_js_1 = require_lint();
    var standards_js_1 = require_standards();
    var drift_log_js_1 = require_drift_log();
    var submodule_status_js_1 = require_submodule_status();
    var hooks_status_js_1 = require_hooks_status();
    var execFileP = (0, node_util_1.promisify)(node_child_process_1.execFile);
    function enrichWithStandards(kbRoot, drifts, promotions, conformPendings) {
      const defs = /* @__PURE__ */ new Map();
      const lookup = (id) => {
        if (!id)
          return null;
        if (defs.has(id))
          return defs.get(id);
        const def = (0, standards_js_1.readStandardDefinition)(kbRoot, id);
        defs.set(id, def);
        return def;
      };
      for (const e of drifts) {
        const def = lookup(e.standardId);
        e.resolvedRule = (0, standards_js_1.findRule)(def, e.ruleId);
        e.resolvedStandard = def ? { id: def.id, kind: def.kind, topic: def.topic, filePath: def.filePath } : null;
      }
      for (const e of promotions) {
        const def = lookup(e.standardId);
        e.resolvedRule = (0, standards_js_1.findRule)(def, e.ruleId);
        e.resolvedStandard = def ? { id: def.id, kind: def.kind, topic: def.topic, filePath: def.filePath } : null;
      }
      for (const p of conformPendings) {
        if (!p)
          continue;
        for (const r of p.requested) {
          const def = lookup(r.standard_id);
          r.resolvedStandard = def ? { id: def.id, kind: def.kind, topic: def.topic, filePath: def.filePath } : null;
          r.resolvedRules = def ? r.rule_ids.map((id) => (0, standards_js_1.findRule)(def, id)).filter((x) => !!x) : [];
        }
      }
    }
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
      const liveOverlay = opts.live ? await runLiveStatus(kbRoot, opts.bundledRunnerPath) : null;
      const [codeDrift, kbDrift, standardsDriftCurrent, standardsBacklog, currentPending, asp, promotions, driftLogEvents, lint, head, submodules, hooks] = await Promise.all([
        Promise.resolve((0, code_drift_js_1.readCodeDrift)(kbRoot)),
        Promise.resolve((0, kb_drift_js_1.readKbDrift)(kbRoot)),
        Promise.resolve((0, standards_drift_js_1.readStandardsDrift)(kbRoot)),
        Promise.resolve((0, standards_drift_js_1.readStandardsBacklog)(kbRoot)),
        Promise.resolve((0, conform_pending_js_1.readConformPending)(kbRoot, "current")),
        Promise.resolve((0, conform_pending_js_1.readConformPending)(kbRoot, "aspirational")),
        Promise.resolve((0, promotions_js_1.readPromotions)(kbRoot)),
        Promise.resolve((0, drift_log_js_1.readDriftLog)(kbRoot, (0, drift_log_js_1.currentAndPreviousMonth)())),
        opts.skipLint ? Promise.resolve({ violations: [], ran: false }) : (0, lint_js_1.runLint)(kbRoot, { commandOverride: opts.lintCommand }),
        getCurrentHeadShort(kbRoot),
        (0, submodule_status_js_1.getSubmoduleStatus)(kbRoot).catch(() => null),
        (0, hooks_status_js_1.getHooksStatus)(kbRoot).catch(() => null)
      ]);
      const codeDriftFinal = liveOverlay ? { entries: liveOverlay.codeEntries, baseline: codeDrift.baseline } : codeDrift;
      const kbDriftFinal = liveOverlay ? { entries: liveOverlay.kbEntries, baseline: kbDrift.baseline } : kbDrift;
      const standardsCurrentFinal = liveOverlay ? { entries: liveOverlay.standardsEntries, baseline: standardsDriftCurrent.baseline } : standardsDriftCurrent;
      const standardsBacklogFinal = liveOverlay ? { entries: liveOverlay.backlogEntries, baseline: standardsBacklog.baseline } : standardsBacklog;
      const standardsDrift = {
        entries: [...standardsCurrentFinal.entries, ...standardsBacklogFinal.entries],
        baseline: standardsCurrentFinal.baseline
      };
      const stale = (recorded) => head !== null && recorded.length > 0 && !head.startsWith(recorded) && !recorded.startsWith(head);
      const conformCurrent = currentPending ? { ...currentPending, staleAgainstHead: stale(currentPending.head_sha_short) } : null;
      const conformAspirational = asp ? { ...asp, staleAgainstHead: stale(asp.head_sha_short) } : null;
      enrichWithStandards(kbRoot, standardsDrift.entries, promotions, [
        currentPending,
        asp
      ]);
      const driftCount = codeDriftFinal.entries.length + kbDriftFinal.entries.length + standardsDrift.entries.length;
      const conformPendingCount = (conformCurrent?.requested.length ?? 0) + (conformAspirational?.requested.length ?? 0);
      const lintErrors = lint.violations.filter((v) => v.severity === "error").length;
      const lintWarnings = lint.violations.filter((v) => v.severity === "warn").length;
      return {
        kbRoot,
        currentHeadShort: head,
        codeDrift: codeDriftFinal,
        kbDrift: kbDriftFinal,
        standardsDrift,
        conformPending: { current: conformCurrent, aspirational: conformAspirational },
        promotions,
        driftLogEvents,
        lint,
        submodules: submodules ?? void 0,
        hooks: hooks ?? void 0,
        totals: {
          drifts: driftCount,
          conformPending: conformPendingCount,
          promotions: promotions.length,
          lintErrors,
          lintWarnings,
          grand: driftCount + conformPendingCount + promotions.length + lintErrors + lintWarnings
        },
        livePatterns: liveOverlay ? liveOverlay.codePatterns : null,
        patternAudit: liveOverlay ? liveOverlay.patternAudit : null
      };
    }
    function runLiveStatus(kbRoot, bundledRunnerPath) {
      const vendored = path4.join(kbRoot, "knowledge", "_mcp", "scripts", "live-status.js");
      let script = null;
      if (fs2.existsSync(vendored)) {
        script = vendored;
      } else if (bundledRunnerPath && fs2.existsSync(bundledRunnerPath)) {
        script = bundledRunnerPath;
      }
      if (!script)
        return Promise.resolve(null);
      return new Promise((resolve2) => {
        const child = (0, node_child_process_1.spawn)(process.execPath, [script], {
          cwd: kbRoot,
          stdio: ["ignore", "pipe", "pipe"]
        });
        let stdout = "";
        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString("utf8");
        });
        child.on("error", () => resolve2(null));
        child.on("close", () => {
          const trimmed = stdout.trim();
          if (!trimmed)
            return resolve2(null);
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.error)
              return resolve2(null);
            const tagMode = (entries, mode) => entries.map((e) => ({ ...e, mode }));
            resolve2({
              headSha: parsed.headSha ?? null,
              codeEntries: parsed.codeEntries ?? [],
              kbEntries: parsed.kbEntries ?? [],
              standardsEntries: tagMode(parsed.standardsEntries ?? [], "current"),
              backlogEntries: tagMode(parsed.backlogEntries ?? [], "aspirational"),
              codePatterns: Array.isArray(parsed.codePatterns) ? parsed.codePatterns : null,
              patternAudit: parsed.patternAudit && Array.isArray(parsed.patternAudit.findings) ? parsed.patternAudit : null
            });
          } catch {
            resolve2(null);
          }
        });
      });
    }
  }
});

// ../shared/dist/entry-id.js
var require_entry_id = __commonJS({
  "../shared/dist/entry-id.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.stableEntryId = stableEntryId3;
    function stableEntryId3(seed, fallbackIndex) {
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
      const files = entry.codeFiles.map((f) => `\`${f.path}\``).join(", ");
      const sharedSuffix = entry.hasShared ? ", shared module" : "";
      return `Resolve code drift for \`${entry.kbTarget}\` via kb_drift.
Files: ${files}${sharedSuffix}`;
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
      const areas = entry.unmapped ? "(unmapped \u2014 verify manually)" : entry.codeAreas.map((a) => `\`${a}\``).join(", ");
      const since = entry.sinceCommit ? `
Since: \`${entry.sinceCommit}\`` : "";
      return `Resolve KB drift for \`${entry.kbFile}\` via kb_drift.
Code areas: ${areas}${since}`;
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
      let filesLine;
      if (partyKeys.length === 0) {
        filesLine = "(none)";
      } else if (partyKeys.length === 1 && partyKeys[0] === "_") {
        filesLine = entry.filesByParty["_"].map((f) => `\`${f.path}\``).join(", ");
      } else {
        filesLine = partyKeys.sort().map((party) => {
          const label = party === "_" ? "files" : party;
          const paths = entry.filesByParty[party].map((f) => `\`${f.path}\``).join(", ");
          return `${label}: ${paths}`;
        }).join("; ");
      }
      const reason = entry.reason ? `
Reason: ${entry.reason}` : "";
      return `Resolve \`${entry.queueKey}\` via kb_conform.
Files: ${filesLine}${reason}`;
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
      const files = entry.files.map((f) => `\`${f.path}\` (promoted ${f.promotedAt})`).join(", ");
      return `Review promotion \`${entry.queueKey}\` via kb_conform.
Files: ${files}`;
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
      const lines = entry.requested.map((r) => `- \`${r.file}\` against \`${r.standard_id}\` (rules: ${r.rule_ids.map((x) => `\`${x}\``).join(", ")})`).join("\n");
      const body = lines.length > 0 ? lines : "- (no pending evaluations)";
      return `Submit judgments via kb_conform (mode: ${entry.mode}, baseline \`${entry.head_sha_short}\`):
${body}`;
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
      return `Fix lint ${entry.severity} in \`${entry.file}\`: ${entry.message}`;
    }
  }
});

// ../shared/dist/prompts/standard-author.js
var require_standard_author = __commonJS({
  "../shared/dist/prompts/standard-author.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.standardAuthorPrompt = standardAuthorPrompt;
    function standardAuthorPrompt(entry, mode) {
      const files = Object.values(entry.filesByParty).flat().map((f) => `\`${f.path}\``).join(", ");
      const filesLine = files.length > 0 ? files : "(no files recorded)";
      const standardId = entry.standardId ?? "?";
      const ruleId = entry.ruleId ?? "?";
      const stdPath = entry.resolvedStandard?.filePath ? ` (\`${entry.resolvedStandard.filePath}\`)` : "";
      const rule = entry.resolvedRule;
      const ruleBlock = rule ? [
        `Existing rule:`,
        `- title: ${rule.title ?? "(missing)"}`,
        `- severity: ${rule.severity ?? "(missing)"}`,
        `- description: ${rule.description ?? "(missing)"}`,
        `- why: ${rule.why ?? "(missing)"}`,
        `- fix_hint: ${rule.fixHint ?? "(missing)"}`
      ].join("\n") : "Existing rule: not resolvable from this workspace \u2014 load it from the standard file.";
      const reasonLine = entry.reason ? `
Drift reason: ${entry.reason}` : "";
      if (mode === "exception") {
        return `Author a new \`exceptions\` entry for rule \`${ruleId}\` in standard \`${standardId}\`${stdPath}.

Triggering files: ${filesLine}${reasonLine}

${ruleBlock}

Task:
1. Inspect the listed files and identify the legitimate pattern that should be exempted (do not weaken the rule for non-legitimate cases).
2. Append a structured \`exceptions\` entry under the rule with: \`pattern\` (path glob or matcher), \`reason\` (why this case is intentional), and \`reviewed\` (today's date).
3. Edit the standard YAML file in place. Keep all other rule fields untouched.`;
      }
      if (mode === "example") {
        return `Add a good/bad example pair to rule \`${ruleId}\` in standard \`${standardId}\`${stdPath}.

Triggering files: ${filesLine}${reasonLine}

${ruleBlock}

Task:
1. Read the listed files and extract a minimal \`bad\` snippet that matches the violation.
2. Author the corresponding \`good\` snippet that satisfies the rule.
3. Append both as a structured \`examples\` entry on the rule (each with \`label\`, \`code\`, and a one-line \`note\`). Edit the standard YAML in place.`;
      }
      return `Refine rule \`${ruleId}\` in standard \`${standardId}\`${stdPath} based on real violations.

Triggering files: ${filesLine}${reasonLine}

${ruleBlock}

Task:
1. Read the listed files and identify the precise pattern the rule should catch.
2. Rewrite the rule's \`description\`, \`why\`, and \`fix_hint\` so they (a) describe the violation in concrete terms, (b) explain the consequence, and (c) point at the fix shape. Keep wording terse.
3. Adjust \`severity\` only if the new evidence justifies it; otherwise leave it untouched.
4. Edit the standard YAML file in place. Do not touch other rules in the same file.`;
    }
  }
});

// ../shared/dist/prompts/index.js
var require_prompts = __commonJS({
  "../shared/dist/prompts/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.standardAuthorPrompt = exports2.lintPrompt = exports2.conformPrompt = exports2.promotionPrompt = exports2.standardsDriftPrompt = exports2.kbDriftPrompt = exports2.codeDriftPrompt = void 0;
    exports2.getActionPrompt = getActionPrompt3;
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
    var standard_author_js_1 = require_standard_author();
    Object.defineProperty(exports2, "standardAuthorPrompt", { enumerable: true, get: function() {
      return standard_author_js_1.standardAuthorPrompt;
    } });
    function getActionPrompt3(input) {
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
        case "standard-author":
          return (0, standard_author_js_1.standardAuthorPrompt)(input.entry, input.mode);
      }
    }
  }
});

// ../shared/dist/prompts/verdicts/standards-drift.js
var require_standards_drift3 = __commonJS({
  "../shared/dist/prompts/verdicts/standards-drift.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.appliedPrompt = appliedPrompt2;
    exports2.exemptedPrompt = exemptedPrompt2;
    exports2.promotedPrompt = promotedPrompt2;
    exports2.dismissedPrompt = dismissedPrompt2;
    exports2.acknowledgedPrompt = acknowledgedPrompt2;
    function appliedPrompt2(v) {
      return `The code for \`${v.queueKey}\` was fixed. Please run:

kb_conform({ applied: [{ queue_key: "${v.queueKey}" }] })`;
    }
    function exemptedPrompt2(v) {
      const files = v.filePaths.map((p) => `"${p}"`).join(", ");
      const reason = v.reason.replace(/"/g, '\\"');
      return `Exempt \`${v.queueKey}\` for the listed files. Please run:

kb_conform({
  exempted: [{
    queue_key: "${v.queueKey}",
    file_paths: [${files}],
    reason: "${reason}"
  }]
})

This appends an exception entry to the rule definition so future Phase 1 sweeps skip these files.`;
    }
    function promotedPrompt2(v) {
      const files = v.originatingFiles.map((p) => `"${p}"`).join(", ");
      const note = v.note ? `,
    note: "${v.note.replace(/"/g, '\\"')}"` : "";
      return `Promote \`${v.queueKey}\` \u2014 the code is correct; the standard should change. Please run:

kb_conform({
  promoted: [{
    queue_key: "${v.queueKey}",
    originating_files: [${files}]${note}
  }]
})

The (file, rule) pair will be suppressed from re-detection until the rule definition changes (auto-close on fingerprint mismatch) or a senior reviewer calls closed_promotion.`;
    }
    function dismissedPrompt2(v) {
      const reason = v.reason.replace(/"/g, '\\"');
      return `Dismiss \`${v.queueKey}\` as a false positive. Please run:

kb_conform({
  dismissed: [{
    queue_key: "${v.queueKey}",
    reason: "${reason}"
  }]
})`;
    }
    function acknowledgedPrompt2(v) {
      const reason = v.reason.replace(/"/g, '\\"');
      if (v.kind === "standards-drift") {
        return `Acknowledge \`${v.entryKey}\` \u2014 author-vetted, leave in queue for review. Please run:

kb_conform({
  acknowledge: [{
    queue_key: "${v.entryKey}",
    reason: "${reason}"
  }]
})`;
      }
      const keyField = v.kind === "code-drift" ? "kb_target" : "kb_file";
      return `Acknowledge \`${v.entryKey}\` \u2014 author-vetted, leave in queue for review. Please run:

kb_drift({
  acknowledge: [{
    ${keyField}: "${v.entryKey}",
    reason: "${reason}"
  }]
})`;
    }
  }
});

// ../shared/dist/prompts/verdicts/promotions.js
var require_promotions2 = __commonJS({
  "../shared/dist/prompts/verdicts/promotions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.closedPromotionPrompt = closedPromotionPrompt2;
    exports2.rerunPhase1Prompt = rerunPhase1Prompt2;
    function closedPromotionPrompt2(v) {
      const files = v.filePaths.map((p) => `"${p}"`).join(", ");
      const reason = v.reason.replace(/"/g, '\\"');
      return `Close the promotion for \`${v.queueKey}\` \u2014 the rule is correct; these files are the exception. Please run:

kb_conform({
  closed_promotion: [{
    queue_key: "${v.queueKey}",
    file_paths: [${files}],
    reason: "${reason}"
  }]
})

This removes the suppression entry from the ledger and writes an exception into the rule so the files are permanently exempt.`;
    }
    function rerunPhase1Prompt2(mode = "current") {
      if (mode === "aspirational") {
        return `The pending aspirational session is stale (the recorded baseline doesn't match HEAD). Please re-run Phase 1 detection:

kb_conform({ mode: "aspirational" })`;
      }
      return `The pending session is stale (the recorded baseline doesn't match HEAD). Please re-run Phase 1 detection:

kb_conform()`;
    }
  }
});

// ../shared/dist/section-guide.js
var require_section_guide = __commonJS({
  "../shared/dist/section-guide.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SECTION_GUIDE = void 0;
    exports2.primaryActionLabel = primaryActionLabel2;
    exports2.copyActionLabel = copyActionLabel2;
    var CODE_DRIFT_DIAGRAM = `git push / post-merge hook
        \u2502
        \u25BC
  code-drift.md entry
        \u2502
        \u25BC
  Resolve via Agent
        \u2502
   \u250C\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
   \u25BC          \u25BC         \u25BC
 Update KB  Revert   Dismiss
(summaries) (reverted) (ghost)
   \u2502          \u2502         \u2502
   \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2192 drift-log/`;
    var KB_DRIFT_DIAGRAM = `KB file edited \u2192 push hook
        \u2502
        \u25BC
  kb-drift.md entry
        \u2502
        \u25BC
  Resolve via Agent
  (reads diff, verifies code)
        \u2502
   \u250C\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2510
   \u25BC          \u25BC
 Code      Dismiss
 confirmed (ghost)
   \u2502          \u2502
   \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2192 drift-log/`;
    var STANDARDS_DRIFT_DIAGRAM = `kb_conform Phase 1 (preFilter)
        \u2502
        \u25BC
   Phase 1.5 (judge)
        \u2502
        \u25BC
  standards-drift.md entry
        \u2502
   \u250C\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
   \u25BC         \u25BC        \u25BC         \u25BC          \u25BC
 Apply    Exempt   Promote   Dismiss   Resolve via Agent
 (fix)  (rule.    (ledger    (false     (agent
        excep-     suppress) positive)  judges)
        tions[])
   \u2502         \u2502        \u2502         \u2502          \u2502
   \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2192 drift-log/`;
    var CONFORM_PENDING_DIAGRAM = `Phase 1 detect
        \u2502
        \u25BC
  .conform-pending/<mode>.json
        \u2502
        \u25BC
  Resolve via Agent
  (reads each triple,
   submits one judgment call)
        \u2502
   \u250C\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
   \u25BC         \u25BC       \u25BC
 pass     fail     n/a
 (skip)  (queues  (skip)
         drift)
        \u2502
        \u2514\u2500\u2500\u2192 standards-drift.md
             (now in normal verdict flow)`;
    var PROMOTIONS_DIAGRAM = `previously-promoted (file, rule)
        \u2502
        \u25BC
  standards-promotions.md
  (the suppression ledger)
        \u2502
        \u2502  fingerprint: sha256:abc1234
        \u2502  suppresses (file, rule) in
        \u2502  Phase 1 sweeps until either:
        \u2502
   \u250C\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
   \u25BC                  \u25BC
 rule edited?     Close promotion
 fingerprint      (writes
 mismatches       exception
 (auto-close)     into rule)
        \u2502                  \u2502
        \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                   \u25BC
              drift-log/`;
    var LINT_DIAGRAM = `KB file change
        \u2502
        \u25BC
  kb_lint scan
        \u2502
        \u25BC
  schema-level violation
  (frontmatter / structure)
        \u2502
        \u25BC
  Fix in source file
  (or pass force_lint to bypass once)`;
    var MAPPING_DIAGNOSTICS_DIAGRAM = `_rules.md code_path_patterns
        \u2502
        \u25BC
  audit (kb_drift readonly)
        \u2502
        \u25BC
  finding (orphan / ghost /
   multi-target / convention /
   unmapped folder / fanout)
        \u2502
        \u25BC
  Agent edits _rules.md
   (Tier 2 \u2014 humans/agent)`;
    exports2.SECTION_GUIDE = {
      "code-drift": {
        label: "Code Drift",
        what: "Code changed since the last KB sync.",
        todo: "Update the KB to reflect the change \u2014 or acknowledge if the change doesn't affect the KB.",
        primaryVerb: "Update",
        lifecycleDiagram: CODE_DRIFT_DIAGRAM,
        uncommittedHint: "Code edits in your working tree that would drift the KB. Publish to share with reviewers."
      },
      "kb-drift": {
        label: "KB Drift",
        what: "KB content changed but the mapped code wasn't touched.",
        todo: "Verify the code still matches, revise the KB, or acknowledge if benign.",
        primaryVerb: "Update",
        lifecycleDiagram: KB_DRIFT_DIAGRAM,
        uncommittedHint: "KB edits in your working tree without a matching code touch. Publish to share with reviewers."
      },
      "standards-drift": {
        label: "Standards Drift",
        what: "Code that broke a standard's rule.",
        todo: "Resolve via kb_conform: apply, exempt, promote, dismiss, or acknowledge.",
        primaryVerb: "Resolve",
        lifecycleDiagram: STANDARDS_DRIFT_DIAGRAM,
        uncommittedHint: "Standards violations from edits in your working tree. Publish to share with reviewers."
      },
      "conform-pending": {
        label: "Conform Pending",
        what: "Standards rules waiting for your judgment.",
        todo: "Submit your judgment for these rules.",
        primaryVerb: "Submit",
        lifecycleDiagram: CONFORM_PENDING_DIAGRAM
      },
      promotions: {
        label: "Pending Promotions",
        what: "Violations promoted on a previous run \u2014 the rule probably needs tightening.",
        todo: "Review the promotion: refine the rule, accept, or dismiss.",
        primaryVerb: "Review",
        lifecycleDiagram: PROMOTIONS_DIAGRAM
      },
      lint: {
        label: "Lint Issues",
        what: "Schema-level problems in the KB itself.",
        todo: "Fix the lint issue in the source file.",
        primaryVerb: "Fix",
        lifecycleDiagram: LINT_DIAGRAM
      },
      "mapping-diagnostics": {
        label: "Mapping Diagnostics",
        what: "code_path_patterns vs current filesystem \u2014 orphan paths, ghost targets, multi-target files, convention violations, unmapped KB folders.",
        todo: "Edit knowledge/_rules.md to fix the flagged patterns; rerun kb_drift to verify.",
        primaryVerb: "Fix",
        lifecycleDiagram: MAPPING_DIAGNOSTICS_DIAGRAM
      }
    };
    function primaryActionLabel2(section) {
      return `${exports2.SECTION_GUIDE[section].primaryVerb} via Agent`;
    }
    function copyActionLabel2(section) {
      return `Copy ${exports2.SECTION_GUIDE[section].primaryVerb} Prompt`;
    }
  }
});

// ../shared/dist/split-by-source.js
var require_split_by_source = __commonJS({
  "../shared/dist/split-by-source.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.UNCOMMITTED_HINT = exports2.WORKING_TREE_LATEST = exports2.PUBLISHED_LABEL = exports2.UNCOMMITTED_LABEL = void 0;
    exports2.splitBySource = splitBySource2;
    exports2.UNCOMMITTED_LABEL = "Uncommitted preview";
    exports2.PUBLISHED_LABEL = "Published";
    exports2.WORKING_TREE_LATEST = "working tree";
    exports2.UNCOMMITTED_HINT = "Your in-progress edits \u2014 not yet shared with reviewers.";
    function splitBySource2(entries) {
      const uncommitted = [];
      const published = [];
      for (const entry of entries) {
        if (entry.source === "working-tree")
          uncommitted.push(entry);
        else
          published.push(entry);
      }
      return { uncommitted, published };
    }
  }
});

// ../shared/dist/grouping.js
var require_grouping = __commonJS({
  "../shared/dist/grouping.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.buildEntryHandles = buildEntryHandles2;
    exports2.groupEntries = groupEntries2;
    exports2.pipelineSegments = pipelineSegments2;
    var entry_id_js_1 = require_entry_id();
    var section_guide_js_1 = require_section_guide();
    var LIFECYCLE_LABEL = {
      drift: "Drift detected",
      conform: "Conform pending",
      promotion: "Promotions to review",
      lint: "Lint to fix",
      diagnostics: "Mapping diagnostics"
    };
    var LIFECYCLE_HINT = {
      drift: "Code, KB, or standards have diverged. Reconcile to clear these.",
      conform: "Rules waiting for your judgment via kb_conform.",
      promotion: "Past judgments accepted a violation \u2014 revisit the rule before the next run.",
      lint: "Schema-level issues that will block kb_lint.",
      diagnostics: "Structural issues in code_path_patterns \u2014 fix in _rules.md to keep drift detection accurate."
    };
    function buildEntryHandles2(status) {
      const out = [];
      status.codeDrift.entries.forEach((e, i) => out.push({
        section: "code-drift",
        id: (0, entry_id_js_1.stableEntryId)(e.kbTarget, i),
        sourceFile: `knowledge/${e.kbTarget}`,
        standardId: null,
        lifecycle: "drift"
      }));
      status.kbDrift.entries.forEach((e, i) => out.push({
        section: "kb-drift",
        id: (0, entry_id_js_1.stableEntryId)(e.kbFile, i),
        sourceFile: `knowledge/${e.kbFile}`,
        standardId: null,
        lifecycle: "drift"
      }));
      status.standardsDrift.entries.forEach((e, i) => out.push({
        section: "standards-drift",
        id: (0, entry_id_js_1.stableEntryId)(e.queueKey, i),
        sourceFile: Object.values(e.filesByParty).flat()[0]?.path,
        standardId: e.standardId,
        lifecycle: "drift"
      }));
      for (const p of [status.conformPending.current, status.conformPending.aspirational]) {
        if (!p)
          continue;
        p.requested.forEach((r, i) => out.push({
          section: "conform-pending",
          id: (0, entry_id_js_1.stableEntryId)(`${p.mode}:${r.file}:${r.standard_id}`, i),
          sourceFile: r.file,
          standardId: r.standard_id,
          lifecycle: "conform"
        }));
      }
      status.promotions.forEach((e, i) => out.push({
        section: "promotions",
        id: (0, entry_id_js_1.stableEntryId)(e.queueKey, i),
        sourceFile: e.files[0]?.path,
        standardId: e.standardId,
        lifecycle: "promotion"
      }));
      status.lint.violations.forEach((v, i) => out.push({
        section: "lint",
        id: (0, entry_id_js_1.stableEntryId)(`${v.file}:${v.message.slice(0, 40)}`, i),
        sourceFile: v.file,
        standardId: null,
        lifecycle: "lint"
      }));
      return out;
    }
    var SECTION_ORDER = [
      "code-drift",
      "kb-drift",
      "standards-drift",
      "conform-pending",
      "promotions",
      "lint"
    ];
    var LIFECYCLE_ORDER = ["drift", "conform", "promotion", "lint"];
    function groupEntries2(handles, mode) {
      switch (mode) {
        case "section":
          return groupBySection(handles);
        case "file":
          return groupByFile(handles);
        case "standard":
          return groupByStandard(handles);
        case "lifecycle":
          return groupByLifecycle(handles);
      }
    }
    function groupBySection(handles) {
      const buckets = /* @__PURE__ */ new Map();
      for (const h of handles) {
        if (!buckets.has(h.section))
          buckets.set(h.section, []);
        buckets.get(h.section).push(h);
      }
      return SECTION_ORDER.map((section) => {
        const guide = section_guide_js_1.SECTION_GUIDE[section];
        return {
          key: `section:${section}`,
          label: guide.label,
          hint: guide.what,
          entries: buckets.get(section) ?? []
        };
      });
    }
    function groupByFile(handles) {
      const buckets = /* @__PURE__ */ new Map();
      for (const h of handles) {
        const key = h.sourceFile ?? "(no file)";
        if (!buckets.has(key))
          buckets.set(key, []);
        buckets.get(key).push(h);
      }
      return [...buckets.entries()].sort((a, b) => {
        if (a[0] === "(no file)")
          return 1;
        if (b[0] === "(no file)")
          return -1;
        return a[0].localeCompare(b[0]);
      }).map(([key, entries]) => ({
        key: `file:${key}`,
        label: key,
        hint: `${entries.length} entr${entries.length === 1 ? "y" : "ies"} touching this file`,
        entries
      }));
    }
    function groupByStandard(handles) {
      const buckets = /* @__PURE__ */ new Map();
      for (const h of handles) {
        const key = h.standardId || "(no standard)";
        if (!buckets.has(key))
          buckets.set(key, []);
        buckets.get(key).push(h);
      }
      return [...buckets.entries()].sort((a, b) => {
        if (a[0] === "(no standard)")
          return 1;
        if (b[0] === "(no standard)")
          return -1;
        return a[0].localeCompare(b[0]);
      }).map(([key, entries]) => ({
        key: `standard:${key}`,
        label: key === "(no standard)" ? key : key,
        hint: key === "(no standard)" ? "Drift / lint entries not tied to a standard." : `All entries tied to standard \`${key}\` \u2014 drift, conform, and promotions together.`,
        entries
      }));
    }
    function groupByLifecycle(handles) {
      const buckets = /* @__PURE__ */ new Map();
      for (const h of handles) {
        if (!buckets.has(h.lifecycle))
          buckets.set(h.lifecycle, []);
        buckets.get(h.lifecycle).push(h);
      }
      return LIFECYCLE_ORDER.map((stage) => ({
        key: `lifecycle:${stage}`,
        label: LIFECYCLE_LABEL[stage],
        hint: LIFECYCLE_HINT[stage],
        entries: buckets.get(stage) ?? []
      }));
    }
    function pipelineSegments2(status) {
      return LIFECYCLE_ORDER.map((stage) => ({
        stage,
        label: LIFECYCLE_LABEL[stage],
        count: countForStage(status, stage)
      }));
    }
    function countForStage(status, stage) {
      switch (stage) {
        case "drift":
          return status.codeDrift.entries.length + status.kbDrift.entries.length + status.standardsDrift.entries.length;
        case "conform":
          return (status.conformPending.current?.requested.length ?? 0) + (status.conformPending.aspirational?.requested.length ?? 0);
        case "promotion":
          return status.promotions.length;
        case "lint":
          return status.lint.violations.length;
        case "diagnostics":
          return status.patternAudit?.findings.length ?? 0;
      }
    }
  }
});

// ../shared/dist/submodule-actions.js
var require_submodule_actions = __commonJS({
  "../shared/dist/submodule-actions.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.syncSubmoduleBranch = syncSubmoduleBranch2;
    exports2.hasUpstream = hasUpstream2;
    exports2.listRemotes = listRemotes2;
    exports2.detectPushRemote = detectPushRemote2;
    exports2.runPushPlan = runPushPlan2;
    var node_child_process_1 = require("child_process");
    var node_util_1 = require("util");
    var execFileP = (0, node_util_1.promisify)(node_child_process_1.execFile);
    async function syncSubmoduleBranch2(repoRoot, subPath, branch) {
      try {
        const { stdout, stderr } = await execFileP("git", ["-C", subPath, "checkout", branch], { cwd: repoRoot, encoding: "utf8" });
        return { success: true, output: (stdout + stderr).trim() };
      } catch (err) {
        const out = (err?.stdout ?? "") + (err?.stderr ?? "") || err?.message || String(err);
        return { success: false, output: String(out).trim() };
      }
    }
    async function hasUpstream2(cwd) {
      try {
        await execFileP("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd, encoding: "utf8" });
        return true;
      } catch {
        return false;
      }
    }
    async function listRemotes2(cwd) {
      try {
        const { stdout } = await execFileP("git", ["remote"], {
          cwd,
          encoding: "utf8"
        });
        return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
      } catch {
        return [];
      }
    }
    async function detectPushRemote2(cwd, branch, remotes) {
      for (const key of [`branch.${branch}.pushRemote`, "remote.pushDefault"]) {
        try {
          const { stdout } = await execFileP("git", ["config", "--get", key], {
            cwd,
            encoding: "utf8"
          });
          const value = stdout.trim();
          if (value)
            return value;
        } catch {
        }
      }
      const known = remotes ?? await listRemotes2(cwd);
      if (known.length === 1)
        return known[0];
      if (known.includes("origin"))
        return "origin";
      if (known.length > 0)
        return known[0];
      return "origin";
    }
    async function runPushPlan2(plan, opts = {}) {
      const steps = [];
      let allSuccess = true;
      for (const step of plan) {
        if (!allSuccess) {
          steps.push({
            step,
            success: false,
            output: "Skipped \u2014 earlier step failed"
          });
          continue;
        }
        let args;
        if (step.type === "parent") {
          if (step.branch && !await hasUpstream2(step.fullPath)) {
            const remote = opts.parentRemote ?? await detectPushRemote2(step.fullPath, step.branch);
            args = ["push", "-u", remote, step.branch];
          } else {
            args = ["push"];
          }
        } else if (step.branch) {
          args = ["push", "-u", "origin", step.branch];
        } else {
          args = ["push"];
        }
        try {
          const { stdout, stderr } = await execFileP("git", args, {
            cwd: step.fullPath,
            encoding: "utf8"
          });
          steps.push({ step, success: true, output: (stdout + stderr).trim() });
        } catch (err) {
          const out = (err?.stdout ?? "") + (err?.stderr ?? "") || err?.message || String(err);
          steps.push({ step, success: false, output: String(out).trim() });
          allSuccess = false;
        }
      }
      return { steps, allSuccess };
    }
  }
});

// ../shared/dist/tool-catalog.generated.js
var require_tool_catalog_generated = __commonJS({
  "../shared/dist/tool-catalog.generated.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.GENERATED_TOOL_CATALOG = void 0;
    exports2.GENERATED_TOOL_CATALOG = [
      {
        "name": "kb_get",
        "category": "authoring",
        "shortDescription": "Load relevant KB files for a task. Respects token budget and app_scope filtering. When working_paths is provided, returns a separate rules_in_scope field listing standards rules that apply to those files (capped, descriptions trimmed) plus any open backlog entries as advisory items.",
        "whenToUse": "Load the right KB slices into the agent's context before it writes or reviews code \u2014 token-budgeted, scope-aware retrieval.",
        "examplePrompts": [
          "Pull the KB context relevant to the auth flow before I edit it.",
          "What standards apply to files under src/api/? (working_paths)",
          "Export everything in scope 'frontend' for an offline review."
        ],
        "keyParams": [
          {
            "name": "task_type",
            "type": "string",
            "required": false,
            "hint": "Type of task (e.g. generate, review, export)"
          },
          {
            "name": "keywords",
            "type": "union",
            "required": false,
            "hint": "Keywords to match KB files"
          },
          {
            "name": "app_scope",
            "type": "string",
            "required": false,
            "hint": "Filter by app scope (e.g. frontend, backend). When working_paths is also set, this overrides path-based app_scope inference."
          },
          {
            "name": "scope",
            "type": "string",
            "required": false,
            "hint": 'Export scope: domain name, feature id, or "all"'
          },
          {
            "name": "max_tokens",
            "type": "number",
            "required": false,
            "hint": "Override token budget (default: 8000, or token_budget from _rules.md)"
          },
          {
            "name": "task_context",
            "type": "enum(creating|fixing|reviewing)",
            "required": false,
            "hint": "Adjusts relevance scoring: creating boosts same-type files, fixing boosts code standards, reviewing includes drift targets"
          },
          {
            "name": "working_paths",
            "type": "string[]",
            "required": false,
            "hint": "File paths the agent is about to edit. Triggers rules_in_scope injection \u2014 relevant standards rules (capped at working_paths_cap, default 10) are returned in a separate field. Independent of task_context and keywords."
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_write",
        "category": "authoring",
        "shortDescription": "Write a KB file and automatically reindex. Never write _index.yaml directly.",
        "whenToUse": "Persist a new or updated KB file and let the indexer regenerate metadata in one step.",
        "examplePrompts": [
          "Save this drafted standard to knowledge/standards/code/api-errors.md.",
          "Write the new feature note we just discussed into the KB."
        ],
        "keyParams": [
          {
            "name": "file_path",
            "type": "string",
            "required": true,
            "hint": "Path to the KB file (e.g. knowledge/features/my-feature.md)"
          },
          {
            "name": "content",
            "type": "string",
            "required": true,
            "hint": "Full file content including YAML front-matter"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_drift",
        "category": "sync",
        "shortDescription": "Bidirectional drift detection. Phase 1: writes entries to sync/code-drift.md (keyed by KB target, tracks all code files + since-commit) and sync/kb-drift.md (keyed by KB file). Multiple commits accumulate automatically. The response includes `_diffs` with pre-fetched unified diffs, stats, and commit subjects for every open entry \u2014 read those directly before resolving. Phase 2: summaries=KB updated (closes code-drift.md), reverted=code file reverted (closes code-drift.md), kb_confirmed=kb\u2192code reviewed (closes kb-drift.md), dismiss=close a structurally-broken ghost entry whose kb_target/kb_file will never exist (logged separately as DISMISSED in the audit trail \u2014 use this when an upstream code_path_patterns rule produced a garbage name rather than hand-editing the queue file). Phase 2 responses include `closed` (what was actually removed) and `not_found` (inputs that matched no open entry, with a `hint` when the input matches the *other* queue \u2014 i.e. you called the wrong phase). When anything lands in `not_found`, an `error` field is set; trust `closed`, not the top-level count, to know what was written.",
        "whenToUse": "Detect code\u2194KB misalignment after recent edits and queue any findings for human review.",
        "examplePrompts": [
          "Check my KB for drift since the last release.",
          "Did the controller refactor touch anything the KB describes?",
          "Run a readonly drift scan and just tell me what would be added."
        ],
        "keyParams": [
          {
            "name": "since",
            "type": "string",
            "required": false,
            "hint": 'Commit SHA or "last-sync"'
          },
          {
            "name": "summaries",
            "type": "object[]",
            "required": false,
            "hint": "Phase 2a: code correct \u2014 write KB notes and close code-drift.md entries"
          },
          {
            "name": "reverted",
            "type": "object[]",
            "required": false,
            "hint": "Phase 2b: code reverted \u2014 close code-drift.md entries without writing KB notes"
          },
          {
            "name": "kb_confirmed",
            "type": "object[]",
            "required": false,
            "hint": "Phase 2c: kb\u2192code reviewed \u2014 close kb-drift.md entries"
          },
          {
            "name": "dismiss",
            "type": "object[]",
            "required": false,
            "hint": "Phase 2d: close a structurally-broken ghost entry (kb_target/kb_file that points at a file that will never exist, typically because an upstream code_path_patterns rule captured a versioned/timestamped basename). Use the exact entry heading as `queue_key` and a human-readable `reason`. Logged as DISMISSED separately from RESOLVED so dismissals remain visible as a signal that upstream rules need attention."
          },
          {
            "name": "acknowledge",
            "type": "object[]",
            "required": false,
            "hint": 'Phase 2e: stamp an entry as author-vetted ("real change, doesn\'t affect KB") without removing it. Renders as an `**Acknowledged**: @author at SHA \u2014 "reason"` badge on the entry block. The entry stays in the queue; a later resolving verdict (summaries / reverted / kb_confirmed / dismiss) overrides.'
          },
          {
            "name": "force_baseline",
            "type": "string",
            "required": false,
            "hint": 'Admin escape hatch: reset both queue baselines to this SHA (or "HEAD"). Use when the queue has gone stale and needs a manual reset.'
          },
          {
            "name": "purge",
            "type": "boolean",
            "required": false,
            "hint": "With force_baseline: also clear all queue entries. Default: false."
          },
          {
            "name": "include_diffs",
            "type": "boolean",
            "required": false,
            "hint": "Include `_diffs` with pre-fetched git diffs, stats, and commit subjects for every open entry. Default: true. Set false for quick status scans."
          },
          {
            "name": "readonly",
            "type": "boolean",
            "required": false,
            "hint": "Compute results in memory but skip every fs write (queue files, drift-log, baseline advance). Returned `_state` carries the would-have-written entries. Used by the live watcher in the extension and the soft-mode CI check."
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_conform",
        "category": "governance",
        "shortDescription": "Three-phase non-functional conformance check. Phase 1 (no resolution args): MCP runs cheap pre-filters and returns requested_evaluations + a prompt for the agent to evaluate. Phase 1.5 (submit_judgments): agent submits per-rule judgments \u2014 must cover every requested triple in a single call (partial submissions return gaps[] and are not persisted across calls). Phase 2 (applied/exempted/promoted/dismissed): close queue entries. Promoted (file, rule) pairs are suppressed from re-detection until the standard is updated (auto-close on rule fingerprint change) or a senior reviewer calls closed_promotion. Aspirational mode (mode: aspirational, scope: <standard-file>): retroactive sweep into a separate backlog queue; pass path_filter to chunk a large sweep by subtree.",
        "whenToUse": "Sweep code against standards rules; the LLM judge classifies each finding and the verdict step closes it out.",
        "examplePrompts": [
          "Run conform on the auth standard against src/auth/.",
          "Resolve the pending conform queue \u2014 read each triple and judge it.",
          "Conform every aspirational rule against the codebase."
        ],
        "keyParams": [
          {
            "name": "since",
            "type": "string",
            "required": false,
            "hint": "Override baseline SHA (default: read from queue header)"
          },
          {
            "name": "mode",
            "type": "enum(current|aspirational)",
            "required": false,
            "hint": "Detection mode (default: current)"
          },
          {
            "name": "scope",
            "type": "string",
            "required": false,
            "hint": "Glob filter on Phase 1 file set (current mode); or standard file path in aspirational mode"
          },
          {
            "name": "path_filter",
            "type": "string|array",
            "required": false,
            "hint": `Aspirational mode only: chunk a large sweep by intersecting with one or more path globs (e.g. "src/admin" or ["src/admin", "src/customer"]). Bare directory inputs auto-expand to "<dir>/**". Errors if used in current mode, or if the intersection with the standard's applies_to.paths is empty.`
          },
          {
            "name": "submit_judgments",
            "type": "object[]",
            "required": false,
            "hint": "Phase 1.5: per-(file, standard, rule) judgments. Must include every triple from the pending session in one call \u2014 partial submissions return gaps[] and are not persisted across calls."
          },
          {
            "name": "applied",
            "type": "object[]",
            "required": false,
            "hint": "Phase 2: code was fixed"
          },
          {
            "name": "exempted",
            "type": "object[]",
            "required": false,
            "hint": "Phase 2: justified exception, written into rule.exceptions[]"
          },
          {
            "name": "promoted",
            "type": "object[]",
            "required": false,
            "hint": "Phase 2: standard should change (logged; no automatic edit)"
          },
          {
            "name": "dismissed",
            "type": "object[]",
            "required": false,
            "hint": "Phase 2: false positive"
          },
          {
            "name": "closed_promotion",
            "type": "object[]",
            "required": false,
            "hint": "Senior reviewer close-out: removes a previously-promoted (file, rule) from the suppression ledger AND writes an exception into the rule (so the file is permanently fine). Use when reviewer decided NOT to update the standard. If the reviewer DID update the standard, no call is needed \u2014 the next sweep auto-closes via fingerprint change."
          },
          {
            "name": "acknowledge",
            "type": "object[]",
            "required": false,
            "hint": 'Non-resolving annotation: stamps the entry with `**Acknowledged**: @author at SHA \u2014 "reason"` and leaves it in the queue. CI still treats acked entries as pending; a later resolving verdict overrides.'
          },
          {
            "name": "force_baseline",
            "type": "string",
            "required": false,
            "hint": 'Admin: reset baseline to a SHA or "HEAD"'
          },
          {
            "name": "purge",
            "type": "boolean",
            "required": false,
            "hint": "Admin: with force_baseline, also clear all entries"
          },
          {
            "name": "include_diffs",
            "type": "boolean",
            "required": false,
            "hint": "Phase 1: pre-fetch diffs into result._diffs (default: true)"
          },
          {
            "name": "readonly",
            "type": "boolean",
            "required": false,
            "hint": "Compute results in memory but skip every fs write. Used by the live watcher in the extension and the soft-mode CI check."
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_inventory",
        "category": "introspection",
        "shortDescription": "Read-only signal report for senior devs. Surfaces stale_rules (standards rules matching no source files), uncovered_files (source files matching no rule), and pending_promotions (open entries from the suppression ledger awaiting senior review). Never writes. Use to inform manual kb_extract / kb_write decisions, or to close promotions via kb_conform.",
        "whenToUse": "Get a read-only health snapshot of the KB \u2014 stale rules, uncovered code paths, pending promotions \u2014 before a senior review.",
        "examplePrompts": [
          "Give me a KB inventory for the senior review tomorrow.",
          "Which rules look stale and which files are uncovered?"
        ],
        "keyParams": [
          {
            "name": "depth",
            "type": "number",
            "required": false,
            "hint": "Directory depth for source-file walk (default 6)"
          },
          {
            "name": "scope",
            "type": "string",
            "required": false,
            "hint": 'Optional glob to restrict the source-file walk (e.g. "ms-fe-web/**")'
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_scaffold",
        "category": "authoring",
        "shortDescription": "Create a new KB file from a template. With description: returns a fill prompt for the agent. With content: writes agent-filled content. Without either: writes template with placeholders.",
        "whenToUse": "Spin up a new KB file from the right template and (optionally) get a fill prompt so the agent can populate it.",
        "examplePrompts": [
          "Scaffold a new feature note for billing webhooks.",
          "Create an empty standard for testing conventions and give me the fill prompt."
        ],
        "keyParams": [
          {
            "name": "type",
            "type": "string",
            "required": true,
            "hint": "Template type: feature|flow|schema|validation|integration|decision|standard|group|component"
          },
          {
            "name": "id",
            "type": "string",
            "required": false,
            "hint": "File identifier (kebab-case)"
          },
          {
            "name": "group",
            "type": "string",
            "required": false,
            "hint": "Group/subfolder for standards: code|contracts|knowledge|process"
          },
          {
            "name": "description",
            "type": "string",
            "required": false,
            "hint": "Description \u2014 tool returns a fill prompt for the agent to process"
          },
          {
            "name": "content",
            "type": "string",
            "required": false,
            "hint": "Agent-filled content to write (use after processing the fill prompt)"
          },
          {
            "name": "app_scope",
            "type": "string",
            "required": false,
            "hint": "App scope for this standard (e.g. frontend, backend). Default: all"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_impact",
        "category": "introspection",
        "shortDescription": "Analyze impact of a change across the KB dependency graph. Returns proposals \u2014 does not write.",
        "whenToUse": "Trace which KB files (and code paths) a proposed change would ripple into \u2014 a dry-run dependency analysis with no writes.",
        "examplePrompts": [
          "What's the blast radius if I rename the order model?",
          "Show me what KB files depend on the api-errors standard."
        ],
        "keyParams": [
          {
            "name": "change_description",
            "type": "string",
            "required": true,
            "hint": "Description of the change to analyze"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_ask",
        "category": "introspection",
        "shortDescription": "Ask a question about the KB. Supports query, brainstorm, challenge, sync, onboard, and generate intents.",
        "whenToUse": "Ask free-form questions of the KB \u2014 query, brainstorm, challenge, sync-check, onboard, or generate from it.",
        "examplePrompts": [
          "Ask the KB: how do we handle idempotency keys?",
          "Onboard me to the payments domain using the KB.",
          "Challenge the assumptions in the api-errors standard."
        ],
        "keyParams": [
          {
            "name": "question",
            "type": "string",
            "required": true,
            "hint": 'Your question. Prefix with "sync [feature] [note-id]" to resolve a sync note.'
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_init",
        "category": "governance",
        "shortDescription": "Bootstrap a new KB structure in the current monorepo. Pass regenerate_agent_rules: true to (re)generate CLAUDE.md/.cursorrules/.windsurfrules/.github/copilot-instructions.md in the project root.",
        "whenToUse": "Bootstrap a fresh KB layout in a repo \u2014 templates, rules, agent-rules files (CLAUDE.md / .cursorrules / copilot-instructions).",
        "examplePrompts": [
          "Initialise a kb-mcp knowledge base in this repo.",
          "Re-generate the agent rules files from the current KB."
        ],
        "keyParams": [
          {
            "name": "interactive",
            "type": "boolean",
            "required": false,
            "hint": "Run interactive setup prompts"
          },
          {
            "name": "config",
            "type": "object",
            "required": false,
            "hint": "Config object (skips interactive prompts)"
          },
          {
            "name": "regenerate_agent_rules",
            "type": "boolean",
            "required": false,
            "hint": "Only regenerate CLAUDE.md/.cursorrules/.windsurfrules/.github/copilot-instructions.md; skip the full bootstrap."
          },
          {
            "name": "force",
            "type": "boolean",
            "required": false,
            "hint": "With regenerate_agent_rules: overwrite existing files. Default: false (preserves customizations)."
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_migrate",
        "category": "governance",
        "shortDescription": "Migrate KB files after _rules.md changes. Manual trigger only.",
        "whenToUse": "After _rules.md changes, migrate existing KB files to match the new conventions and emit review prompts for the agent.",
        "examplePrompts": [
          "Migrate the KB \u2014 I just updated _rules.md.",
          "What review prompts come out of the latest rules change?"
        ],
        "keyParams": [
          {
            "name": "since",
            "type": "string",
            "required": false,
            "hint": "Commit SHA to diff _rules.md from. Auto-detected if omitted."
          },
          {
            "name": "dry_run",
            "type": "boolean",
            "required": false,
            "hint": "Preview migration prompts without writing files"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_import",
        "category": "authoring",
        "shortDescription": "Import a document into the KB. Auto-classify mode (recommended): Phase 1 extracts and classifies in batches (multi-label). Phase 2 returns an import plan with proposed files and cross-references. Phase 3 (approve: true) writes files. Classic mode: Phase 1 returns chunks, Phase 2 writes agent-generated files.",
        "whenToUse": "Bring outside docs into the KB \u2014 classic extract+classify, or paginated auto-classify with an approval gate.",
        "examplePrompts": [
          "Import this Notion export into the KB (auto-classify mode).",
          "Extract standards from these legacy markdown docs and ask me before writing."
        ],
        "keyParams": [
          {
            "name": "source",
            "type": "string",
            "required": false,
            "hint": "Path to the source document (PDF, DOCX, MD, TXT, HTML)"
          },
          {
            "name": "dry_run",
            "type": "boolean",
            "required": false,
            "hint": "Preview without writing"
          },
          {
            "name": "auto_classify",
            "type": "boolean",
            "required": false,
            "hint": "Paginated classification mode \u2014 returns chunks in batches for agent to classify, then returns import plan for approval"
          },
          {
            "name": "approve",
            "type": "boolean",
            "required": false,
            "hint": "Execute a previously generated import plan (requires auto_classify)"
          },
          {
            "name": "classifications",
            "type": "object[]",
            "required": false,
            "hint": "Agent multi-label classification results from previous batch"
          },
          {
            "name": "cursor",
            "type": "number",
            "required": false,
            "hint": "Current position in chunk list (returned by previous auto_classify call)"
          },
          {
            "name": "files_to_write",
            "type": "object[]",
            "required": false,
            "hint": "Classic Phase 2: agent-generated files to write"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_export",
        "category": "introspection",
        "shortDescription": 'Export KB content. Supports optional purpose to guide tone/structure, type filter (e.g. "flow"), and multi-scope (array of ids/domains). Phase 1: Gathers KB content and returns an export prompt for the agent (or writes json directly). Large KBs are paginated automatically. Phase 2: Call with rendered_content to write agent-rendered output to disk.',
        "whenToUse": "Render the KB out to PDF, DOCX, Confluence, Notion, or static HTML for sharing or archive.",
        "examplePrompts": [
          "Export the security standards as a PDF for the audit.",
          "Render the full KB to static HTML for the wiki."
        ],
        "keyParams": [
          {
            "name": "scope",
            "type": "union",
            "required": false,
            "hint": 'Domain name, feature/flow id, or "all". Accepts an array for multi-scope export.'
          },
          {
            "name": "format",
            "type": "string",
            "required": false,
            "hint": "Output format: pdf|docx|markdown|confluence|notion|html|json"
          },
          {
            "name": "type",
            "type": "string",
            "required": false,
            "hint": "Filter by KB type: feature, flow, schema, validation, integration, decision, component"
          },
          {
            "name": "purpose",
            "type": "string",
            "required": false,
            "hint": 'Optional: describe the purpose and desired style of the export (e.g. "client-facing API overview", "onboarding guide for new backend engineers")'
          },
          {
            "name": "app_scope",
            "type": "string",
            "required": false,
            "hint": "Filter by app scope"
          },
          {
            "name": "page",
            "type": "number",
            "required": false,
            "hint": "Page number for paginated exports of large KBs (returned by previous call)"
          },
          {
            "name": "dry_run",
            "type": "boolean",
            "required": false,
            "hint": "Preview without writing"
          },
          {
            "name": "rendered_content",
            "type": "string",
            "required": false,
            "hint": "Phase 2: agent-rendered content to write to disk"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_analyze",
        "category": "authoring",
        "shortDescription": "Analyze project source files and generate a KB coverage inventory. Groups source files by their KB target (using code_path_patterns from _rules.md) and optionally writes draft KB files for uncovered groups. Useful for bootstrapping KB on legacy projects.",
        "whenToUse": "Scan source files and group them into KB targets using code_path_patterns \u2014 a starting point for fresh documentation runs.",
        "examplePrompts": [
          "Analyse src/payments/ and propose KB targets.",
          "Group these files by their KB target and draft KB files where missing."
        ],
        "keyParams": [
          {
            "name": "depth",
            "type": "number",
            "required": false,
            "hint": "Max directory depth to scan (default: 4)"
          },
          {
            "name": "write_drafts",
            "type": "boolean",
            "required": false,
            "hint": "Write draft KB files for uncovered groups"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_extract",
        "category": "authoring",
        "shortDescription": "Sample existing code or KB files and return a prompt to derive a standards document from observed patterns. Phase 1 (no content): returns prompt + sampled file contents. Phase 2 (content provided): writes the filled standard to disk.",
        "whenToUse": "Sample code or existing KB content and get back a prompt for deriving a standards doc from the pattern.",
        "examplePrompts": [
          "Extract a standard from how we write controllers under src/api/.",
          "Sample the test files in tests/integration and propose a testing standard."
        ],
        "keyParams": [
          {
            "name": "source",
            "type": "enum(code|knowledge)",
            "required": true,
            "hint": 'What to sample: "code" for source files, "knowledge" for KB docs'
          },
          {
            "name": "target_id",
            "type": "string",
            "required": true,
            "hint": "ID for the output standards file (kebab-case)"
          },
          {
            "name": "target_group",
            "type": "enum(code|contracts|knowledge|process)",
            "required": true,
            "hint": "Standards subfolder to write into"
          },
          {
            "name": "paths",
            "type": "union",
            "required": false,
            "hint": 'Glob patterns to filter source files (source=code), or KB subfolder name (source=knowledge, e.g. "features")'
          },
          {
            "name": "app_scope",
            "type": "string",
            "required": false,
            "hint": "App scope for the generated standard (default: all)"
          },
          {
            "name": "content",
            "type": "string",
            "required": false,
            "hint": "(Phase 2) Filled content to write to disk"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_issue",
        "category": "governance",
        "shortDescription": 'Issue \u2194 KB bridge. command: "triage" (two-phase; writes to sync/inbound/), "plan" (two-phase; writes to sync/outbound/), "consult" (single-phase; no write).',
        "whenToUse": "Bridge issue trackers and the KB \u2014 triage an issue against existing rules, plan from KB context, or consult before filing.",
        "examplePrompts": [
          "Triage this GitHub issue against the KB.",
          "Plan tasks for this Linear ticket using the KB context.",
          "Should we even file this? Consult the KB first."
        ],
        "keyParams": [
          {
            "name": "command",
            "type": "enum(triage|plan|consult)",
            "required": true,
            "hint": "triage: analyze an existing issue against the KB. plan: generate work items from KB docs. consult: advise before filing an issue."
          },
          {
            "name": "title",
            "type": "string",
            "required": false,
            "hint": "Issue title (triage, consult)"
          },
          {
            "name": "body",
            "type": "string",
            "required": false,
            "hint": "Issue description/body (triage, consult)"
          },
          {
            "name": "issue_id",
            "type": "string",
            "required": false,
            "hint": "External issue ID, e.g. PROJ-123 (triage)"
          },
          {
            "name": "source",
            "type": "string",
            "required": false,
            "hint": "PM tool name: jira, github, linear (triage)"
          },
          {
            "name": "labels",
            "type": "string[]",
            "required": false,
            "hint": "Issue labels/tags (triage)"
          },
          {
            "name": "priority",
            "type": "string",
            "required": false,
            "hint": "Issue priority (triage)"
          },
          {
            "name": "scope",
            "type": "string",
            "required": false,
            "hint": 'Scope filter \u2014 folder name or "all" (plan)'
          },
          {
            "name": "type",
            "type": "string",
            "required": false,
            "hint": "KB doc type filter: feature, flow, decision (plan)"
          },
          {
            "name": "keywords",
            "type": "union",
            "required": false,
            "hint": "Keyword filter (plan)"
          },
          {
            "name": "target",
            "type": "string",
            "required": false,
            "hint": "Target PM tool: jira, github, linear (plan)"
          },
          {
            "name": "project_key",
            "type": "string",
            "required": false,
            "hint": "PM tool project key, e.g. PROJ (plan)"
          },
          {
            "name": "app_scope",
            "type": "string",
            "required": false,
            "hint": "Filter KB search to specific app scope"
          },
          {
            "name": "content",
            "type": "string",
            "required": false,
            "hint": "Phase 2: filled triage report (triage) or task breakdown YAML (plan) to write"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_sub",
        "category": "sync",
        "shortDescription": "Submodule coordination. status: shows parent + submodule branches, pointer changes, owned/shared types. push: pushes submodules first (correct order), then parent. merge_plan: returns correct merge sequence for feature-to-main.",
        "whenToUse": "Coordinate git submodules safely \u2014 status, ordered push plan, and feature\u2192main merge planning.",
        "examplePrompts": [
          "What's the safe push order for my submodules right now?",
          "Plan the merge from feature into main across the submodules."
        ],
        "keyParams": [
          {
            "name": "command",
            "type": "enum(status|push|merge_plan)",
            "required": true,
            "hint": "Command to run"
          },
          {
            "name": "dry_run",
            "type": "boolean",
            "required": false,
            "hint": "For push: show plan without executing"
          },
          {
            "name": "target_branch",
            "type": "string",
            "required": false,
            "hint": "For merge_plan: target branch name"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_autotag",
        "category": "authoring",
        "shortDescription": 'Auto-extract and manage tags for KB files. Tags are system-owned and overwritten on each run. Modes: "fast" (regex extraction, auto-applied), "review" (returns scored candidates for LLM validation), "apply" (writes LLM-reviewed tags to frontmatter).',
        "whenToUse": "Manage tags across KB files \u2014 fast regex auto-apply, scored review candidates, or LLM-validated apply.",
        "examplePrompts": [
          "Auto-tag the KB \u2014 fast pass, just apply the obvious ones.",
          "Give me a review queue of tag candidates I should look at."
        ],
        "keyParams": [
          {
            "name": "file_path",
            "type": "string",
            "required": false,
            "hint": 'Path to a single KB file (e.g. knowledge/features/auth.md), or "all" to tag the entire KB. Default: all. Used by fast and review modes.'
          },
          {
            "name": "mode",
            "type": "enum(fast|review|apply)",
            "required": false,
            "hint": "fast: regex-extract and overwrite tags (default). review: return scored candidates grouped by confidence for LLM validation. apply: write LLM-reviewed tags from the tags parameter."
          },
          {
            "name": "tags",
            "type": "object",
            "required": false,
            "hint": 'For mode=apply only. Map of file_path to tag array, e.g. { "features/auth.md": ["auth", "session", "jwt"] }.'
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_autorelate",
        "category": "authoring",
        "shortDescription": "Discover semantic relations between KB files using keyword overlap and propose depends_on links. Use dry_run: true to preview before writing.",
        "whenToUse": "Discover related KB files via keyword overlap and propose depends_on links (dry-run by default).",
        "examplePrompts": [
          "Suggest depends_on links across the KB \u2014 don't write yet.",
          "Find KB files semantically related to the order-state standard."
        ],
        "keyParams": [
          {
            "name": "file_path",
            "type": "string",
            "required": false,
            "hint": "Analyze relations for a single file, or omit for all files."
          },
          {
            "name": "dry_run",
            "type": "boolean",
            "required": false,
            "hint": "Preview proposed relations without writing."
          },
          {
            "name": "threshold",
            "type": "number",
            "required": false,
            "hint": "Minimum overlap score to propose a relation (0\u20131). Default: 0.25"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_schema",
        "category": "introspection",
        "shortDescription": "Query database schema files (DBML format) with table-level extraction. Returns only relevant table/enum definitions.",
        "whenToUse": "Query DBML schema files in the KB \u2014 list or extract tables and enums by keyword or exact name.",
        "examplePrompts": [
          "Show me the orders table from the DBML.",
          "List every table that mentions 'invoice'."
        ],
        "keyParams": [
          {
            "name": "command",
            "type": "enum(query|list)",
            "required": true,
            "hint": "query: extract table definitions. list: list all tables and enums."
          },
          {
            "name": "file",
            "type": "string",
            "required": false,
            "hint": 'Schema file path or bare name (e.g. "postgres" or "data/schema/postgres.md")'
          },
          {
            "name": "entities",
            "type": "string[]",
            "required": false,
            "hint": "Table names to extract (exact match)"
          },
          {
            "name": "keywords",
            "type": "union",
            "required": false,
            "hint": "Keywords for relevance-scored table extraction"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_upgrade",
        "category": "governance",
        "shortDescription": "Upgrade project KB templates and config after MCP server update. Auto-updates unmodified templates, returns merge prompts for customized ones, patches _rules.md with new keys.",
        "whenToUse": "After upgrading the kb-mcp package, patch templates and _rules.md so this repo picks up the new keys safely.",
        "examplePrompts": [
          "Upgrade my KB to the latest kb-mcp conventions.",
          "Patch _rules.md with whatever new keys this version added."
        ],
        "keyParams": [
          {
            "name": "dry_run",
            "type": "boolean",
            "required": false,
            "hint": "Preview changes without writing"
          },
          {
            "name": "force",
            "type": "boolean",
            "required": false,
            "hint": "Overwrite all templates including customized ones"
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_history",
        "category": "introspection",
        "shortDescription": "Get the change history of a KB file: git commits that touched it + any drift-log entries that reference it. Call this when a decision depends on why or when something changed \u2014 not for routine reads.",
        "whenToUse": "Pull the change history of a KB file \u2014 git commits and drift-log references, optionally with patch bodies.",
        "examplePrompts": [
          "Show me the history of the api-errors standard.",
          "What drift events have touched knowledge/features/billing.md?"
        ],
        "keyParams": [
          {
            "name": "file",
            "type": "string",
            "required": true,
            "hint": "KB file path (e.g. knowledge/decisions/auth.md or decisions/auth.md)"
          },
          {
            "name": "limit",
            "type": "number",
            "required": false,
            "hint": "Max number of commits (default: 20, max 200)"
          },
          {
            "name": "since",
            "type": "string",
            "required": false,
            "hint": 'ISO date filter, e.g. "2026-01-01"'
          },
          {
            "name": "include_diff",
            "type": "boolean",
            "required": false,
            "hint": "Include patch bodies. Off by default to save tokens."
          }
        ],
        "surfaces": [
          "mcp"
        ]
      },
      {
        "name": "kb_status",
        "category": "sync",
        "shortDescription": 'Read-only sync-state aggregate. Returns counts and entries for code-drift, kb-drift, standards-drift, conform-pending (current + aspirational), pending promotions, and lint issues, plus the current git HEAD short SHA. Same data the KB Sync VSCode extension renders. Never writes. Use at session start, before opening a PR, or whenever the user asks "what is drifting?".',
        "whenToUse": "Aggregate sync state in one readonly call \u2014 drifts, conform-pending, promotions, lint, HEAD SHA. This is what the dashboards read.",
        "examplePrompts": [
          "Give me the current KB sync status.",
          "Just the totals \u2014 how many drifts and lint errors are open?"
        ],
        "keyParams": [
          {
            "name": "skip_lint",
            "type": "boolean",
            "required": false,
            "hint": "Skip the lint subprocess (faster; default false)."
          }
        ],
        "surfaces": [
          "mcp"
        ]
      }
    ];
  }
});

// ../shared/dist/tool-catalog.js
var require_tool_catalog = __commonJS({
  "../shared/dist/tool-catalog.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TOOL_CATALOG = exports2.TOOL_CATEGORIES = void 0;
    exports2.toolsByCategory = toolsByCategory2;
    exports2.findTool = findTool;
    var tool_catalog_generated_js_1 = require_tool_catalog_generated();
    exports2.TOOL_CATEGORIES = [
      {
        id: "sync",
        label: "Sync",
        blurb: "Detect code\u2194KB misalignment and coordinate the sync state surfaced in this dashboard."
      },
      {
        id: "authoring",
        label: "Authoring",
        blurb: "Write, scaffold, import, and tag KB content."
      },
      {
        id: "governance",
        label: "Governance",
        blurb: "Conform code to standards, bootstrap, migrate, and upgrade the KB."
      },
      {
        id: "introspection",
        label: "Introspection",
        blurb: "Read-only queries over the KB and its history."
      }
    ];
    exports2.TOOL_CATALOG = tool_catalog_generated_js_1.GENERATED_TOOL_CATALOG;
    function toolsByCategory2(category) {
      return exports2.TOOL_CATALOG.filter((t) => t.category === category);
    }
    function findTool(name) {
      return exports2.TOOL_CATALOG.find((t) => t.name === name);
    }
  }
});

// ../shared/dist/agent-setup.js
var require_agent_setup = __commonJS({
  "../shared/dist/agent-setup.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.AGENT_SETUP_SNIPPETS = void 0;
    exports2.renderSnippet = renderSnippet2;
    exports2.AGENT_SETUP_SNIPPETS = [
      {
        id: "claude-code",
        label: "Claude Code",
        configFile: "~/.claude.json",
        instructions: 'Add this entry under "mcpServers" in your ~/.claude.json (create the key if absent), then restart Claude Code.',
        snippet: `{
  "mcpServers": {
    "kb-mcp": {
      "command": "node",
      "args": ["\${KB_ROOT}/knowledge/_mcp/server.js"]
    }
  }
}`
      },
      {
        id: "claude-desktop",
        label: "Claude Desktop",
        configFile: "~/Library/Application Support/Claude/claude_desktop_config.json (macOS) \xB7 %APPDATA%/Claude/claude_desktop_config.json (Windows)",
        instructions: 'Add this entry under "mcpServers", then fully quit and relaunch Claude Desktop.',
        snippet: `{
  "mcpServers": {
    "kb-mcp": {
      "command": "node",
      "args": ["\${KB_ROOT}/knowledge/_mcp/server.js"]
    }
  }
}`
      },
      {
        id: "cursor",
        label: "Cursor",
        configFile: "${KB_ROOT}/.cursor/mcp.json",
        instructions: "Create .cursor/mcp.json in this project (or merge with the existing file) and reload Cursor.",
        snippet: `{
  "mcpServers": {
    "kb-mcp": {
      "command": "node",
      "args": ["\${KB_ROOT}/knowledge/_mcp/server.js"]
    }
  }
}`
      }
    ];
    function renderSnippet2(template, kbRoot) {
      return template.split("${KB_ROOT}").join(kbRoot ?? "<path-to-your-kb-root>");
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
    exports2.TOOL_CATALOG = exports2.getHooksStatus = exports2.detectPushRemote = exports2.listRemotes = exports2.hasUpstream = exports2.runPushPlan = exports2.syncSubmoduleBranch = exports2.buildPushPlan = exports2.getSubmoduleStatus = exports2.pipelineSegments = exports2.groupEntries = exports2.buildEntryHandles = exports2.UNCOMMITTED_HINT = exports2.WORKING_TREE_LATEST = exports2.PUBLISHED_LABEL = exports2.UNCOMMITTED_LABEL = exports2.splitBySource = exports2.copyActionLabel = exports2.primaryActionLabel = exports2.SECTION_GUIDE = exports2.rerunPhase1Prompt = exports2.closedPromotionPrompt = exports2.acknowledgedPrompt = exports2.dismissedPrompt = exports2.promotedPrompt = exports2.exemptedPrompt = exports2.appliedPrompt = exports2.getActionPrompt = exports2.findRuleLineRange = exports2.findRule = exports2.readStandardDefinition = exports2.parseStandardDefinition = exports2.currentAndPreviousMonth = exports2.readDriftLog = exports2.parseDriftLog = exports2.runLint = exports2.parseLintStderr = exports2.readPromotions = exports2.parsePromotions = exports2.resolveStandardPath = exports2.readConformPending = exports2.parseConformPending = exports2.readStandardsBacklog = exports2.readStandardsDrift = exports2.parseStandardsDrift = exports2.readKbDrift = exports2.parseKbDrift = exports2.readCodeDrift = exports2.parseCodeDrift = exports2.stableEntryId = void 0;
    exports2.renderSnippet = exports2.AGENT_SETUP_SNIPPETS = exports2.findTool = exports2.toolsByCategory = exports2.TOOL_CATEGORIES = void 0;
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
    Object.defineProperty(exports2, "readStandardsBacklog", { enumerable: true, get: function() {
      return standards_drift_js_1.readStandardsBacklog;
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
    var drift_log_js_1 = require_drift_log();
    Object.defineProperty(exports2, "parseDriftLog", { enumerable: true, get: function() {
      return drift_log_js_1.parseDriftLog;
    } });
    Object.defineProperty(exports2, "readDriftLog", { enumerable: true, get: function() {
      return drift_log_js_1.readDriftLog;
    } });
    Object.defineProperty(exports2, "currentAndPreviousMonth", { enumerable: true, get: function() {
      return drift_log_js_1.currentAndPreviousMonth;
    } });
    var standards_js_1 = require_standards();
    Object.defineProperty(exports2, "parseStandardDefinition", { enumerable: true, get: function() {
      return standards_js_1.parseStandardDefinition;
    } });
    Object.defineProperty(exports2, "readStandardDefinition", { enumerable: true, get: function() {
      return standards_js_1.readStandardDefinition;
    } });
    Object.defineProperty(exports2, "findRule", { enumerable: true, get: function() {
      return standards_js_1.findRule;
    } });
    Object.defineProperty(exports2, "findRuleLineRange", { enumerable: true, get: function() {
      return standards_js_1.findRuleLineRange;
    } });
    var index_js_1 = require_prompts();
    Object.defineProperty(exports2, "getActionPrompt", { enumerable: true, get: function() {
      return index_js_1.getActionPrompt;
    } });
    var standards_drift_js_2 = require_standards_drift3();
    Object.defineProperty(exports2, "appliedPrompt", { enumerable: true, get: function() {
      return standards_drift_js_2.appliedPrompt;
    } });
    Object.defineProperty(exports2, "exemptedPrompt", { enumerable: true, get: function() {
      return standards_drift_js_2.exemptedPrompt;
    } });
    Object.defineProperty(exports2, "promotedPrompt", { enumerable: true, get: function() {
      return standards_drift_js_2.promotedPrompt;
    } });
    Object.defineProperty(exports2, "dismissedPrompt", { enumerable: true, get: function() {
      return standards_drift_js_2.dismissedPrompt;
    } });
    Object.defineProperty(exports2, "acknowledgedPrompt", { enumerable: true, get: function() {
      return standards_drift_js_2.acknowledgedPrompt;
    } });
    var promotions_js_2 = require_promotions2();
    Object.defineProperty(exports2, "closedPromotionPrompt", { enumerable: true, get: function() {
      return promotions_js_2.closedPromotionPrompt;
    } });
    Object.defineProperty(exports2, "rerunPhase1Prompt", { enumerable: true, get: function() {
      return promotions_js_2.rerunPhase1Prompt;
    } });
    var section_guide_js_1 = require_section_guide();
    Object.defineProperty(exports2, "SECTION_GUIDE", { enumerable: true, get: function() {
      return section_guide_js_1.SECTION_GUIDE;
    } });
    Object.defineProperty(exports2, "primaryActionLabel", { enumerable: true, get: function() {
      return section_guide_js_1.primaryActionLabel;
    } });
    Object.defineProperty(exports2, "copyActionLabel", { enumerable: true, get: function() {
      return section_guide_js_1.copyActionLabel;
    } });
    var split_by_source_js_1 = require_split_by_source();
    Object.defineProperty(exports2, "splitBySource", { enumerable: true, get: function() {
      return split_by_source_js_1.splitBySource;
    } });
    Object.defineProperty(exports2, "UNCOMMITTED_LABEL", { enumerable: true, get: function() {
      return split_by_source_js_1.UNCOMMITTED_LABEL;
    } });
    Object.defineProperty(exports2, "PUBLISHED_LABEL", { enumerable: true, get: function() {
      return split_by_source_js_1.PUBLISHED_LABEL;
    } });
    Object.defineProperty(exports2, "WORKING_TREE_LATEST", { enumerable: true, get: function() {
      return split_by_source_js_1.WORKING_TREE_LATEST;
    } });
    Object.defineProperty(exports2, "UNCOMMITTED_HINT", { enumerable: true, get: function() {
      return split_by_source_js_1.UNCOMMITTED_HINT;
    } });
    var grouping_js_1 = require_grouping();
    Object.defineProperty(exports2, "buildEntryHandles", { enumerable: true, get: function() {
      return grouping_js_1.buildEntryHandles;
    } });
    Object.defineProperty(exports2, "groupEntries", { enumerable: true, get: function() {
      return grouping_js_1.groupEntries;
    } });
    Object.defineProperty(exports2, "pipelineSegments", { enumerable: true, get: function() {
      return grouping_js_1.pipelineSegments;
    } });
    var submodule_status_js_1 = require_submodule_status();
    Object.defineProperty(exports2, "getSubmoduleStatus", { enumerable: true, get: function() {
      return submodule_status_js_1.getSubmoduleStatus;
    } });
    Object.defineProperty(exports2, "buildPushPlan", { enumerable: true, get: function() {
      return submodule_status_js_1.buildPushPlan;
    } });
    var submodule_actions_js_1 = require_submodule_actions();
    Object.defineProperty(exports2, "syncSubmoduleBranch", { enumerable: true, get: function() {
      return submodule_actions_js_1.syncSubmoduleBranch;
    } });
    Object.defineProperty(exports2, "runPushPlan", { enumerable: true, get: function() {
      return submodule_actions_js_1.runPushPlan;
    } });
    Object.defineProperty(exports2, "hasUpstream", { enumerable: true, get: function() {
      return submodule_actions_js_1.hasUpstream;
    } });
    Object.defineProperty(exports2, "listRemotes", { enumerable: true, get: function() {
      return submodule_actions_js_1.listRemotes;
    } });
    Object.defineProperty(exports2, "detectPushRemote", { enumerable: true, get: function() {
      return submodule_actions_js_1.detectPushRemote;
    } });
    var hooks_status_js_1 = require_hooks_status();
    Object.defineProperty(exports2, "getHooksStatus", { enumerable: true, get: function() {
      return hooks_status_js_1.getHooksStatus;
    } });
    var tool_catalog_js_1 = require_tool_catalog();
    Object.defineProperty(exports2, "TOOL_CATALOG", { enumerable: true, get: function() {
      return tool_catalog_js_1.TOOL_CATALOG;
    } });
    Object.defineProperty(exports2, "TOOL_CATEGORIES", { enumerable: true, get: function() {
      return tool_catalog_js_1.TOOL_CATEGORIES;
    } });
    Object.defineProperty(exports2, "toolsByCategory", { enumerable: true, get: function() {
      return tool_catalog_js_1.toolsByCategory;
    } });
    Object.defineProperty(exports2, "findTool", { enumerable: true, get: function() {
      return tool_catalog_js_1.findTool;
    } });
    var agent_setup_js_1 = require_agent_setup();
    Object.defineProperty(exports2, "AGENT_SETUP_SNIPPETS", { enumerable: true, get: function() {
      return agent_setup_js_1.AGENT_SETUP_SNIPPETS;
    } });
    Object.defineProperty(exports2, "renderSnippet", { enumerable: true, get: function() {
      return agent_setup_js_1.renderSnippet;
    } });
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => InstrumentalityPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");
var import_shared4 = __toESM(require_dist());

// src/view.ts
var import_obsidian3 = require("obsidian");

// src/view-helpers.ts
var path = __toESM(require("path"));
var import_shared = __toESM(require_dist());
function buildEntryIndex(status) {
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
      sourceFile: path.join("knowledge", e.kbTarget)
    })
  );
  status.kbDrift.entries.forEach(
    (e, i) => push({
      section: "kb-drift",
      id: (0, import_shared.stableEntryId)(e.kbFile, i),
      promptInput: { kind: "kb-drift", entry: e },
      sourceFile: path.join("knowledge", e.kbFile)
    })
  );
  status.standardsDrift.entries.forEach(
    (e, i) => push({
      section: "standards-drift",
      id: (0, import_shared.stableEntryId)(`${e.mode}:${e.queueKey}`, i),
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
function cssEscape(s) {
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
function classifyBranch(e, parentBranch) {
  if (!e.branch)
    return "detached";
  if (parentBranch && e.branch === parentBranch)
    return "aligned";
  return e.type === "owned" ? "blocking" : "advisory";
}
function buildAuditFixPrompt(f) {
  const header = `The knowledge/_rules.md \u2192 code_path_patterns audit surfaced this finding:

`;
  let body = "";
  switch (f.type) {
    case "orphan_pattern":
      body = `Type: orphan_pattern
Pattern: intent=${f.intent ?? "(none)"}, kb_target=${f.kb_target}
Paths: ${JSON.stringify(f.paths)}
${f.is_submodule_pattern ? "Submodule pattern.\n" : ""}
The paths globs above match zero files in the current repo. Decide:
1. If the code was moved/renamed, update the paths globs in knowledge/_rules.md to match the new location.
2. If the pattern is obsolete, remove it from knowledge/_rules.md.
3. If the paths are correct but the matching files were deleted, leave the pattern and acknowledge it's currently inactive.
`;
      break;
    case "ghost_target":
      body = `Type: ghost_target
Hardcoded kb_target: ${f.resolved_target}

The pattern targets a KB file that does not exist. Either:
1. Create knowledge/${f.resolved_target} via kb_scaffold (if the concept is real but undocumented).
2. Fix the kb_target in knowledge/_rules.md (if this was a typo).
3. Remove the pattern entirely (if the concept is gone).
`;
      break;
    case "multi_target_files":
      body = `Type: multi_target_files
File: ${f.file}
Matched targets: ${JSON.stringify(f.matched_targets, null, 2)}

This code file matches multiple patterns producing distinct kb_targets.
Post-P0 fan-out: all targets receive drift entries on changes.
Decide whether this is intentional (cross-cutting concern \u2192 keep) or accidental (overbroad pattern \u2192 narrow one of them in knowledge/_rules.md).
`;
      break;
    case "convention_violation":
      body = `Type: convention_violation
Pattern: intent=${f.intent}, kb_target=${f.kb_target}
Expected folder for intent "${f.intent}": ${f.expected_folder}

The convention table expects intent "${f.intent}" to target ${f.expected_folder}* but this pattern targets a different folder.
Either fix the kb_target in knowledge/_rules.md, or change the intent label if the mapping is intentional.
`;
      break;
    case "unmapped_kb_group":
      body = `Type: unmapped_kb_group
Folder: ${f.folder}
Count: ${f.count}
Sample files: ${JSON.stringify(f.sample_files)}

These KB files are not targeted by any code_path_patterns entry \u2014 code\u2192KB drift detection is silent for them.
Add a pattern to knowledge/_rules.md \u2192 code_path_patterns. Typical shape:

  - intent: <see knowledge/_mcp/presets/ for examples>
    kb_target: "${f.folder}{name}.md"
    paths:
      - "<glob covering the related source files>"

Grep the repo for files related to these KB documents and choose paths globs that catch them.
`;
      break;
    case "fanout_with_hardcoded":
      body = `Type: fanout_with_hardcoded
Pattern kb_target (hardcoded): ${f.kb_target}
Distinct file basenames: ${f.distinct_concepts}

This hardcoded kb_target catches ${f.distinct_concepts} distinct file basenames \u2014 one KB file is documenting many concepts.
Either switch the kb_target to a {name} template (so each concept gets its own KB file), or narrow the paths glob.
`;
      break;
  }
  return header + body;
}

// src/view-modals.ts
var import_obsidian = require("obsidian");
function confirmModal(app, opts) {
  return new Promise((resolve2) => {
    const modal = new ConfirmModal(app, opts, resolve2);
    modal.open();
  });
}
var ConfirmModal = class extends import_obsidian.Modal {
  constructor(app, opts, done) {
    super(app);
    this.opts = opts;
    this.done = done;
  }
  resolved = false;
  onOpen() {
    this.titleEl.setText(this.opts.title);
    const detail = this.contentEl.createEl("pre", {
      cls: "instrumentality-modal-detail",
      text: this.opts.detail
    });
    detail.style.whiteSpace = "pre-wrap";
    const actions = this.contentEl.createDiv({
      cls: "instrumentality-modal-actions"
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
      text: this.opts.confirmLabel
    });
    ok.addEventListener("click", () => {
      this.resolved = true;
      this.done(true);
      this.close();
    });
  }
  onClose() {
    if (!this.resolved)
      this.done(false);
    this.contentEl.empty();
  }
};
function selectModal(app, opts) {
  return new Promise((resolve2) => {
    const modal = new SelectModal(app, opts, resolve2);
    modal.open();
  });
}
var SelectModal = class extends import_obsidian.Modal {
  constructor(app, opts, done) {
    super(app);
    this.opts = opts;
    this.done = done;
  }
  resolved = false;
  onOpen() {
    this.titleEl.setText(this.opts.title);
    if (this.opts.placeholder) {
      this.contentEl.createDiv({
        cls: "instrumentality-modal-placeholder",
        text: this.opts.placeholder
      });
    }
    const list = this.contentEl.createDiv({
      cls: "instrumentality-modal-select-list"
    });
    for (const opt of this.opts.options) {
      const btn = list.createEl("button", {
        cls: "instrumentality-modal-select-item"
      });
      btn.createSpan({ text: opt.label });
      if (opt.description) {
        btn.createSpan({
          cls: "instrumentality-modal-select-desc",
          text: opt.description
        });
      }
      btn.addEventListener("click", () => {
        this.resolved = true;
        this.done(opt.value);
        this.close();
      });
    }
  }
  onClose() {
    if (!this.resolved)
      this.done(null);
    this.contentEl.empty();
  }
};

// src/view.ts
var path3 = __toESM(require("path"));
var import_node_child_process = require("child_process");
var import_shared3 = __toESM(require_dist());

// src/watcher.ts
var fs = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var DEBOUNCE_MS = 500;
var POLL_FALLBACK_MS = 5e3;
var IGNORED_DIR_SEGMENTS = [".git", "node_modules", "dist", "build", ".obsidian", "out", "target"];
function patternBaseDir(pattern) {
  const idx = pattern.search(/[*?[]/);
  if (idx === -1)
    return path2.dirname(pattern) || ".";
  const head = pattern.slice(0, idx);
  const slash = head.lastIndexOf("/");
  return slash === -1 ? "." : head.slice(0, slash);
}
var SyncWatcher = class {
  constructor(kbRoot, onChange) {
    this.kbRoot = kbRoot;
    this.onChange = onChange;
  }
  fsWatcher = null;
  extraWatchers = [];
  codeRootWatchers = /* @__PURE__ */ new Map();
  // Always-on recursive watcher on kbRoot. Mirrors the VS Code __fallback__
  // approach — if _rules.md patterns don't match how this platform observes
  // a file (commonly across submodule git boundaries) saves still fire a
  // debounced refresh. Noise dirs are filtered inside the callback.
  rootFallbackWatcher = null;
  pollHandle = null;
  debounceTimer = null;
  lastMtimeSum = 0;
  /**
   * `extraPaths` is an optional list of additional files to watch — used
   * for submodule gitdir HEAD files so branch switches inside a
   * submodule refresh the UI without polling. The set is reset on every
   * call: pass the current desired set and we'll diff against existing
   * watchers, disposing any that aren't requested anymore.
   */
  start(extraPaths = []) {
    const dir = path2.join(this.kbRoot, "knowledge", "sync");
    if (fs.existsSync(dir) && !this.fsWatcher) {
      try {
        this.fsWatcher = fs.watch(
          dir,
          { recursive: true },
          () => this.scheduleFire()
        );
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
    this.reconcileExtraWatchers(extraPaths);
    this.ensureRootFallback();
  }
  /**
   * Install (or re-install) the always-on recursive watcher on kbRoot.
   * Noise paths (`.git/`, `node_modules/`, build dirs) are filtered in
   * the callback so an `npm install` doesn't fire a refresh per file.
   * On platforms where `filename` is null (some macOS versions) the
   * filter is skipped and we accept extra refresh ticks — the 300ms
   * debounce makes those harmless.
   */
  ensureRootFallback() {
    if (this.rootFallbackWatcher)
      return;
    if (!fs.existsSync(this.kbRoot))
      return;
    const handler = (_event, filename) => {
      if (filename) {
        const rel = typeof filename === "string" ? filename : filename.toString("utf8");
        const head = rel.split(path2.sep)[0];
        if (IGNORED_DIR_SEGMENTS.includes(head))
          return;
        for (const seg of IGNORED_DIR_SEGMENTS) {
          if (rel.includes(path2.sep + seg + path2.sep))
            return;
        }
      }
      this.scheduleFire();
    };
    try {
      this.rootFallbackWatcher = fs.watch(this.kbRoot, { recursive: true }, handler);
    } catch {
    }
  }
  /**
   * Refresh the set of extra (submodule HEAD) watchers. Cheaper than
   * stopping and restarting the whole watcher, which would re-arm the
   * poll loop too.
   */
  setExtraPaths(extraPaths) {
    this.reconcileExtraWatchers(extraPaths);
  }
  /**
   * Refresh the set of code-path roots being watched. Each glob from
   * `_rules.md`'s `code_path_patterns[].paths` is collapsed to its base
   * directory and that directory is watched recursively. Passing `null`
   * or an empty array tears down all source-root watchers — the
   * sync-folder watcher and poll fallback still cover queue file changes,
   * just not the rapid-fire preview path.
   */
  setCodePatterns(patterns) {
    const want = /* @__PURE__ */ new Set();
    if (Array.isArray(patterns)) {
      for (const p of patterns) {
        if (typeof p !== "string" || !p)
          continue;
        const baseRel = patternBaseDir(p);
        const abs = path2.resolve(this.kbRoot, baseRel);
        if (fs.existsSync(abs))
          want.add(abs);
      }
    }
    for (const [abs, w] of this.codeRootWatchers) {
      if (!want.has(abs)) {
        try {
          w.close();
        } catch {
        }
        this.codeRootWatchers.delete(abs);
      }
    }
    for (const abs of want) {
      if (this.codeRootWatchers.has(abs))
        continue;
      try {
        const w = fs.watch(abs, { recursive: true }, () => this.scheduleFire());
        this.codeRootWatchers.set(abs, w);
      } catch {
        try {
          const w = fs.watch(abs, () => this.scheduleFire());
          this.codeRootWatchers.set(abs, w);
        } catch {
        }
      }
    }
  }
  reconcileExtraWatchers(extraPaths) {
    for (const w of this.extraWatchers) {
      try {
        w.close();
      } catch {
      }
    }
    this.extraWatchers = [];
    for (const p of extraPaths) {
      try {
        if (!fs.existsSync(p))
          continue;
        this.extraWatchers.push(fs.watch(p, () => this.scheduleFire()));
      } catch {
      }
    }
  }
  stop() {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    if (this.rootFallbackWatcher) {
      try {
        this.rootFallbackWatcher.close();
      } catch {
      }
      this.rootFallbackWatcher = null;
    }
    for (const w of this.extraWatchers) {
      try {
        w.close();
      } catch {
      }
    }
    this.extraWatchers = [];
    for (const w of this.codeRootWatchers.values()) {
      try {
        w.close();
      } catch {
      }
    }
    this.codeRootWatchers.clear();
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
  /**
   * Expose the debounced fire path so callers (e.g. main.ts wiring
   * Vault.on('modify')) can hook into the same coalescing loop instead
   * of racing it from a parallel timer.
   */
  fire() {
    this.scheduleFire();
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
          const full = path2.join(d, entry.name);
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

// src/view-info.ts
var import_obsidian2 = require("obsidian");
var import_shared2 = __toESM(require_dist());
function renderInfoBody(parent, kbRoot) {
  const wrap = parent.createDiv({ cls: "instrumentality-info" });
  wrap.createEl("p", {
    cls: "instrumentality-info-intro",
    text: "All MCP tools the kb-mcp server exposes \u2014 and the natural-language prompts that route to each."
  });
  const note = wrap.createDiv({ cls: "instrumentality-info-note" });
  note.createEl("strong", { text: "Two surfaces, one set of tools. " });
  note.createSpan({
    text: "This plugin already invokes the read-only tools directly via subprocess for the dashboard. The MCP server (registered via the configs below) is what lets AI agents in Claude Code, Claude Desktop, and Cursor call the same tools by name."
  });
  const root = wrap.createEl("details", { cls: "instrumentality-info-root" });
  const rootSummary = root.createEl("summary");
  rootSummary.createEl("strong", { text: "Show capabilities" });
  rootSummary.createSpan({
    cls: "instrumentality-info-count",
    text: ` \u2014 ${import_shared2.TOOL_CATALOG.length} MCP tools`
  });
  const body = root.createDiv({ cls: "instrumentality-info-body" });
  for (const cat of import_shared2.TOOL_CATEGORIES) {
    renderCategory(body, cat);
  }
  renderAgentSetup(body, kbRoot);
}
function renderCategory(parent, cat) {
  const tools = (0, import_shared2.toolsByCategory)(cat.id);
  if (tools.length === 0)
    return;
  const card = parent.createEl("details", { cls: "instrumentality-info-category" });
  const summary = card.createEl("summary");
  summary.createSpan({ cls: "instrumentality-info-cat-label", text: cat.label });
  summary.createSpan({
    cls: "instrumentality-info-cat-count",
    text: ` (${tools.length})`
  });
  card.createEl("p", { cls: "instrumentality-info-cat-blurb", text: cat.blurb });
  for (const tool of tools) {
    renderTool(card, tool);
  }
}
function renderTool(parent, tool) {
  const card = parent.createEl("details", { cls: "instrumentality-info-tool" });
  const summary = card.createEl("summary");
  summary.createEl("code", {
    cls: "instrumentality-info-tool-name",
    text: tool.name
  });
  summary.createSpan({
    cls: "instrumentality-info-tool-summary",
    text: tool.whenToUse
  });
  const body = card.createDiv({ cls: "instrumentality-info-tool-body" });
  body.createEl("p", {
    cls: "instrumentality-info-tool-desc",
    text: tool.shortDescription
  });
  if (tool.examplePrompts.length > 0) {
    body.createDiv({
      cls: "instrumentality-info-section-label",
      text: "Example prompts"
    });
    const list = body.createEl("ul", { cls: "instrumentality-info-prompt-list" });
    for (const prompt of tool.examplePrompts) {
      const row = list.createEl("li", { cls: "instrumentality-info-prompt-row" });
      row.createSpan({
        cls: "instrumentality-info-prompt-text",
        text: prompt
      });
      const btn = row.createEl("button", {
        cls: "instrumentality-info-copy",
        text: "Copy"
      });
      btn.addEventListener("click", () => {
        void copyToClipboard(prompt, `prompt for ${tool.name}`);
      });
    }
  }
  const required = tool.keyParams.filter((p) => p.required);
  const optional = tool.keyParams.filter((p) => !p.required);
  if (required.length > 0) {
    body.createDiv({
      cls: "instrumentality-info-section-label",
      text: "Required params"
    });
    renderParamList(body, required);
  }
  if (optional.length > 0) {
    const opt = body.createEl("details", {
      cls: "instrumentality-info-optional"
    });
    opt.createEl("summary", { text: `Optional params (${optional.length})` });
    renderParamList(opt, optional);
  }
}
function renderParamList(parent, params) {
  const list = parent.createEl("ul", { cls: "instrumentality-info-param-list" });
  for (const p of params) {
    const li = list.createEl("li");
    li.createEl("code", { text: p.name });
    li.createSpan({ cls: "instrumentality-info-param-type", text: ` ${p.type}` });
    if (p.hint) {
      li.createDiv({ cls: "instrumentality-info-param-hint", text: p.hint });
    }
  }
}
function renderAgentSetup(parent, kbRoot) {
  const card = parent.createEl("details", {
    cls: "instrumentality-info-category instrumentality-info-agents"
  });
  const summary = card.createEl("summary");
  summary.createSpan({
    cls: "instrumentality-info-cat-label",
    text: "Connect an AI agent"
  });
  summary.createSpan({
    cls: "instrumentality-info-cat-count",
    text: ` (${import_shared2.AGENT_SETUP_SNIPPETS.length})`
  });
  card.createEl("p", {
    cls: "instrumentality-info-cat-blurb",
    text: "Register kb-mcp with your AI client so its agent can invoke these tools."
  });
  for (const s of import_shared2.AGENT_SETUP_SNIPPETS) {
    const text = (0, import_shared2.renderSnippet)(s.snippet, kbRoot);
    const block = card.createEl("details", { cls: "instrumentality-info-agent" });
    const sum = block.createEl("summary");
    sum.createSpan({ cls: "instrumentality-info-cat-label", text: s.label });
    const body = block.createDiv({ cls: "instrumentality-info-tool-body" });
    const cfg = body.createDiv({ cls: "instrumentality-info-param-hint" });
    cfg.appendText("Config: ");
    cfg.createEl("code", { text: s.configFile });
    body.createDiv({
      cls: "instrumentality-info-param-hint",
      text: s.instructions
    });
    body.createEl("pre", { cls: "instrumentality-info-snippet", text });
    const btn = body.createEl("button", {
      cls: "instrumentality-info-copy",
      text: "Copy snippet"
    });
    btn.addEventListener("click", () => {
      void copyToClipboard(text, `${s.label} config`);
    });
  }
}
async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    new import_obsidian2.Notice(`Copied ${label} to clipboard.`);
  } catch (err) {
    new import_obsidian2.Notice(`Copy failed: ${err?.message ?? err}`);
  }
}

// src/view.ts
function activityEventLabel(t) {
  switch (t) {
    case "conformed-applied":
      return "Conformed \xB7 applied";
    case "conformed-exempted":
      return "Conformed \xB7 exempted";
    case "conformed-promoted":
      return "Conformed \xB7 promoted";
    case "dismissed-conform":
      return "Dismissed (conform)";
    case "closed-promotion":
      return "Closed promotion";
    case "auto-dismissed-standard-removed":
      return "Auto-dismissed (standard removed)";
    case "auto-closed-promotion-rule-changed":
      return "Auto-closed (rule changed)";
    case "auto-closed-promotion-standard-removed":
      return "Auto-closed (standard removed)";
    case "drift-resolved":
      return "Drift resolved";
    case "drift-dismissed":
      return "Drift dismissed";
    case "re-bootstrap":
      return "Re-bootstrap";
    default:
      return "Unknown";
  }
}
function activityBadgeClass(t, isSystem) {
  if (isSystem)
    return "event-auto";
  if (t === "conformed-applied" || t === "drift-resolved")
    return "event-applied";
  if (t === "conformed-exempted" || t === "dismissed-conform" || t === "drift-dismissed")
    return "event-exempted";
  if (t === "conformed-promoted" || t === "closed-promotion")
    return "event-promoted";
  return "event-other";
}
var ACKNOWLEDGED_VERDICT = {
  verdict: "acknowledged",
  label: "Acknowledge\u2026",
  needsForm: true,
  fields: { reason: { required: true } }
};
var VERDICTS_BY_SECTION = {
  "code-drift": [ACKNOWLEDGED_VERDICT],
  "kb-drift": [ACKNOWLEDGED_VERDICT],
  "standards-drift": [
    { verdict: "applied", label: "Apply", needsForm: false, fields: {} },
    {
      verdict: "exempted",
      label: "Exempt\u2026",
      needsForm: true,
      fields: {
        filePaths: { required: true, label: "Files to exempt" },
        reason: { required: true }
      }
    },
    {
      verdict: "promoted",
      label: "Promote\u2026",
      needsForm: true,
      fields: {
        filePaths: { required: true, label: "Originating files" },
        note: { required: false }
      }
    },
    {
      verdict: "dismissed",
      label: "Dismiss\u2026",
      needsForm: true,
      fields: {
        reason: { required: true }
      }
    },
    ACKNOWLEDGED_VERDICT
  ],
  promotions: [
    {
      verdict: "closed_promotion",
      label: "Close promotion",
      needsForm: true,
      fields: {
        filePaths: { required: true, label: "Files in the exception" },
        reason: { required: true }
      }
    }
  ]
};
var VIEW_TYPE_INSTRUMENTALITY = "instrumentality-view";
var ICON_ID = "instrumentality-icon";
var InstrumentalityView = class extends import_obsidian3.ItemView {
  status = null;
  kbRoot = null;
  watcher = null;
  entryIndex = /* @__PURE__ */ new Map();
  filterSearch = "";
  hiddenSections = /* @__PURE__ */ new Set();
  severityFilter = /* @__PURE__ */ new Set();
  groupBy = "section";
  // Phase-4-equivalent state. View-mode + activity controls are kept
  // in-memory only — they reset on view reopen, which matches the rest
  // of the plugin's "no config dialog" feel.
  viewMode = "pending";
  activityGroupBy = "date";
  showSystemEvents = true;
  openSection;
  submodulesCollapsed = false;
  cb;
  getKbRoot;
  constructor(leaf, callbacks) {
    super(leaf);
    this.cb = callbacks;
    this.getKbRoot = callbacks.getKbRoot;
    this.openSection = callbacks.getOpenSection();
    this.submodulesCollapsed = callbacks.getSubmodulesCollapsed();
  }
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
  /**
   * Public entry point for plugin-level Vault events (`modify`/`create`/
   * `delete` on markdown files). Routes through the watcher's debouncer
   * so we coalesce with fs.watch events and don't double-refresh on a
   * single edit that produces both vault and fs notifications.
   */
  notifySourceChanged() {
    this.watcher?.fire();
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
      const bundledRunnerPath = path3.join(__dirname, "runner", "scripts", "live-status.js");
      this.status = await (0, import_shared3.getStatus)(root, {
        skipLint: true,
        live: true,
        bundledRunnerPath
      });
    } catch (err) {
      console.error("[instrumentality] getStatus failed:", err);
      this.status = null;
    }
    this.entryIndex = buildEntryIndex(this.status);
    if (this.watcher && this.status?.submodules) {
      const extras = [];
      if (this.status.submodules.parentGitdirHeadPath) {
        extras.push(this.status.submodules.parentGitdirHeadPath);
      }
      for (const e of this.status.submodules.entries) {
        if (e.gitdirHeadPath)
          extras.push(e.gitdirHeadPath);
      }
      this.watcher.setExtraPaths(extras);
    }
    if (this.watcher) {
      this.watcher.setCodePatterns(this.status?.livePatterns ?? null);
    }
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
    if (this.viewMode === "info") {
      renderInfoBody(root, this.kbRoot);
      return;
    }
    this.renderSubmodulesPinned(root);
    this.renderPipelineStrip(root);
    this.renderViewModeTabs(root);
    if (this.viewMode === "activity") {
      this.renderActivityFilterBar(root);
      this.renderActivityBody(root);
    } else {
      this.renderFilterBar(root);
      this.renderSections(root);
    }
  }
  renderViewModeTabs(parent) {
    const tabs = parent.createDiv({ cls: "instrumentality-view-mode-tabs" });
    const make = (mode, label) => {
      const tab = tabs.createEl("button", {
        cls: "instrumentality-view-mode-tab" + (this.viewMode === mode ? " on" : ""),
        text: label
      });
      tab.addEventListener("click", () => {
        if (this.viewMode === mode)
          return;
        this.viewMode = mode;
        this.render();
      });
    };
    make("pending", "Pending");
    make("activity", "Activity");
  }
  renderActivityFilterBar(parent) {
    const bar = parent.createDiv({
      cls: "instrumentality-filter-bar instrumentality-activity-filter-bar"
    });
    const groupBox = bar.createDiv({ cls: "instrumentality-chip-group" });
    groupBox.createSpan({ cls: "group-by-label", text: "Group:" });
    const modes = [
      { key: "date", label: "Date" },
      { key: "queueKey", label: "Queue key" },
      { key: "eventType", label: "Event type" }
    ];
    for (const m of modes) {
      const chip = groupBox.createSpan({
        cls: "instrumentality-chip group-by-chip" + (this.activityGroupBy === m.key ? " on" : ""),
        text: m.label
      });
      chip.addEventListener("click", () => {
        if (this.activityGroupBy === m.key)
          return;
        this.activityGroupBy = m.key;
        this.render();
      });
    }
    const toggleLabel = bar.createEl("label", { cls: "instrumentality-activity-toggle" });
    const cb = toggleLabel.createEl("input", { attr: { type: "checkbox" } });
    cb.checked = this.showSystemEvents;
    toggleLabel.appendText(" Show system events");
    cb.addEventListener("change", () => {
      this.showSystemEvents = cb.checked;
      this.render();
    });
  }
  /**
   * Workflow at-a-glance: drift → conform → promotion → lint with counts.
   * Replaces the older five-tile totals row; the lifecycle ordering tells
   * users where their backlog actually sits.
   */
  renderPipelineStrip(parent) {
    if (!this.status)
      return;
    const strip = parent.createDiv({ cls: "instrumentality-pipeline-strip" });
    const segs = (0, import_shared3.pipelineSegments)(this.status);
    segs.forEach((s, i) => {
      const cell = strip.createDiv({
        cls: `instrumentality-pipeline-cell ${s.count > 0 ? "active" : "dim"}`,
        attr: { "data-pipeline-stage": s.stage }
      });
      cell.createDiv({ cls: "pipeline-count", text: String(s.count) });
      cell.createDiv({ cls: "pipeline-label", text: s.label });
      if (i < segs.length - 1) {
        strip.createSpan({ cls: "pipeline-arrow", text: "\u2192" });
      }
    });
  }
  renderHeader(parent) {
    const header = parent.createDiv({ cls: "instrumentality-header" });
    const left = header.createDiv();
    left.createEl("h2", { text: "Instrumentality" });
    const meta = left.createDiv({ cls: "instrumentality-head-meta" });
    meta.createSpan({ text: "HEAD: " });
    meta.createEl("code", { text: this.status?.currentHeadShort ?? "?" });
    this.renderHooksBadge(meta);
    const tools = header.createDiv({ cls: "instrumentality-tools" });
    const publish = tools.createEl("button", { text: "Publish", cls: "mod-cta" });
    publish.title = "Run drift + conform detection and commit the queue files";
    publish.addEventListener("click", () => void this.handlePublishDrift());
    const refresh = tools.createEl("button", { text: "Refresh", cls: "mod-cta" });
    refresh.addEventListener("click", () => void this.refresh());
    const help = tools.createEl("button", {
      text: this.viewMode === "info" ? "\u2715" : "?",
      cls: "instrumentality-help-btn" + (this.viewMode === "info" ? " on" : "")
    });
    help.title = this.viewMode === "info" ? "Close capabilities" : "Show MCP capabilities \u2014 what the server exposes and how to invoke it";
    help.addEventListener("click", () => {
      this.viewMode = this.viewMode === "info" ? "pending" : "info";
      this.render();
    });
  }
  renderHooksBadge(parent) {
    const h = this.status?.hooks;
    if (!h)
      return;
    const labels = {
      managed: "Hooks: \u2713 managed",
      partial: "Hooks: \u26A0 partial",
      missing: "Hooks: \u2717 missing"
    };
    const sevClass = h.health === "managed" ? "sev-info" : h.health === "partial" ? "sev-warn" : "sev-error";
    const tip = h.hooks.map(
      (f) => `${f.name}: ${f.managed ? "managed" : f.present ? "present (not managed)" : "missing"}`
    ).join("\n");
    parent.appendText(" ");
    parent.createSpan({
      cls: `badge ${sevClass} hooks-badge`,
      text: labels[h.health],
      attr: { title: tip }
    });
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
    const groupBox = bar.createDiv({ cls: "instrumentality-chip-group" });
    groupBox.createSpan({ cls: "group-by-label", text: "Group:" });
    const modes = [
      { key: "section", label: "Section" },
      { key: "file", label: "File" },
      { key: "standard", label: "Standard" },
      { key: "lifecycle", label: "Lifecycle" }
    ];
    for (const m of modes) {
      const chip = groupBox.createSpan({
        cls: "instrumentality-chip group-by-chip" + (this.groupBy === m.key ? " on" : ""),
        text: m.label
      });
      chip.addEventListener("click", () => {
        if (this.groupBy === m.key)
          return;
        this.groupBy = m.key;
        this.render();
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
    if (this.groupBy === "section") {
      this.renderAccordionSections(grid);
    } else {
      this.renderGenericGroups(grid);
    }
    this.applyFilterDom();
  }
  /**
   * Render the section cards in accordion mode: only one card body is
   * visible at a time, sections re-ordered so non-empty ones float to
   * the top, canonical order as stable tiebreak. Mirrors VSCode's
   * sidebar accordion (buildSectionsForOrder + orderSections +
   * pickOpenSection in webview-render.ts).
   */
  renderAccordionSections(grid) {
    const s = this.status;
    const conformCount = (s.conformPending.current?.requested.length ?? 0) + (s.conformPending.aspirational?.requested.length ?? 0);
    const sections = [
      {
        key: "code-drift",
        count: s.codeDrift.entries.length,
        build: (p) => this.renderCodeDriftCard(p)
      },
      {
        key: "kb-drift",
        count: s.kbDrift.entries.length,
        build: (p) => this.renderKbDriftCard(p)
      },
      {
        key: "standards-drift",
        count: s.standardsDrift.entries.length,
        build: (p) => this.renderStandardsDriftCard(p)
      },
      {
        key: "conform-pending",
        count: conformCount,
        build: (p) => this.renderConformCard(p)
      },
      {
        key: "promotions",
        count: s.promotions.length,
        build: (p) => this.renderPromotionsCard(p)
      },
      {
        key: "lint",
        count: s.lint.violations.length,
        build: (p) => this.renderLintCard(p)
      },
      {
        key: "mapping-diagnostics",
        count: s.patternAudit?.findings.length ?? 0,
        build: (p) => this.renderMappingDiagnosticsCard(p)
      }
    ];
    const canonical = new Map(sections.map((sec, i) => [sec.key, i]));
    const ordered = [...sections].sort((a, b) => {
      const aHas = a.count > 0;
      const bHas = b.count > 0;
      if (aHas !== bHas)
        return aHas ? -1 : 1;
      return (canonical.get(a.key) ?? 0) - (canonical.get(b.key) ?? 0);
    });
    let openKey = null;
    if (this.openSection && ordered.some((sec) => sec.key === this.openSection)) {
      openKey = this.openSection;
    } else {
      openKey = (ordered.find((sec) => sec.count > 0) ?? ordered[0])?.key ?? null;
    }
    for (const sec of ordered) {
      sec.build(grid);
    }
    if (openKey) {
      const card = grid.querySelector(
        `.instrumentality-section-card[data-section="${cssEscape(openKey)}"]`
      );
      card?.setAttribute("data-open", "true");
    }
    grid.addEventListener("click", (ev) => {
      const target = ev.target;
      const headerEl = target.closest(
        ".instrumentality-section-card > header"
      );
      if (!headerEl)
        return;
      const card = headerEl.closest(".instrumentality-section-card");
      if (!card)
        return;
      const key = card.getAttribute("data-section");
      if (!key)
        return;
      if (target.closest("button, a, input"))
        return;
      if (card.getAttribute("data-open") === "true")
        return;
      grid.querySelectorAll('.instrumentality-section-card[data-open="true"]').forEach((el) => el.removeAttribute("data-open"));
      card.setAttribute("data-open", "true");
      this.openSection = key;
      this.cb.setOpenSection(key);
    });
  }
  /**
   * Render top-level groups for non-section group-by modes via the shared
   * `groupEntries` projection. Entries are rebuilt by handle so each
   * surface keeps its own row formatting.
   */
  renderGenericGroups(parent) {
    const handles = (0, import_shared3.buildEntryHandles)(this.status);
    const groups = (0, import_shared3.groupEntries)(handles, this.groupBy);
    for (const g of groups) {
      const card = parent.createDiv({
        cls: "instrumentality-section-card",
        attr: { "data-section": g.key }
      });
      const header = card.createEl("header");
      const h2 = header.createEl("h2");
      h2.createSpan({ text: g.label });
      h2.createSpan({ cls: "count", text: String(g.entries.length) });
      if (g.hint) {
        header.createDiv({ cls: "group-hint", text: g.hint });
      }
      const body = card.createDiv({ cls: "body" });
      if (g.entries.length === 0) {
        this.placeholder(body, "No entries");
        continue;
      }
      for (const h of g.entries) {
        this.renderEntryByHandle(body, h);
      }
    }
  }
  renderEntryByHandle(parent, h) {
    const s = this.status;
    switch (h.section) {
      case "code-drift": {
        const i = s.codeDrift.entries.findIndex((e, idx) => (0, import_shared3.stableEntryId)(e.kbTarget, idx) === h.id);
        if (i >= 0) {
          const e = s.codeDrift.entries[i];
          this.renderCodeDriftRow(parent, e, i, e.source === "working-tree");
        }
        return;
      }
      case "kb-drift": {
        const i = s.kbDrift.entries.findIndex((e, idx) => (0, import_shared3.stableEntryId)(e.kbFile, idx) === h.id);
        if (i >= 0) {
          const e = s.kbDrift.entries[i];
          this.renderKbDriftRow(parent, e, i, e.source === "working-tree");
        }
        return;
      }
      case "standards-drift": {
        const i = s.standardsDrift.entries.findIndex(
          (e, idx) => (0, import_shared3.stableEntryId)(`${e.mode}:${e.queueKey}`, idx) === h.id
        );
        if (i >= 0) {
          const e = s.standardsDrift.entries[i];
          this.renderStandardsDriftRow(parent, e, i, e.source === "working-tree");
        }
        return;
      }
      case "conform-pending": {
        for (const p of [s.conformPending.current, s.conformPending.aspirational]) {
          if (!p)
            continue;
          const idx = p.requested.findIndex((r, j) => (0, import_shared3.stableEntryId)(`${p.mode}:${r.file}:${r.standard_id}`, j) === h.id);
          if (idx >= 0) {
            this.renderConformRow(parent, p, p.requested[idx], idx);
            return;
          }
        }
        return;
      }
      case "promotions": {
        const i = s.promotions.findIndex((e, idx) => (0, import_shared3.stableEntryId)(e.queueKey, idx) === h.id);
        if (i >= 0)
          this.renderPromotionRow(parent, s.promotions[i], i);
        return;
      }
      case "lint": {
        const i = s.lint.violations.findIndex(
          (v, idx) => (0, import_shared3.stableEntryId)(`${v.file}:${v.message.slice(0, 40)}`, idx) === h.id
        );
        if (i >= 0)
          this.renderLintRow(parent, s.lint.violations[i], i);
        return;
      }
    }
  }
  sectionShell(parent, kind, title, count, badgeText, hint, extraBanner) {
    const card = parent.createDiv({ cls: "instrumentality-section-card", attr: { "data-section": kind } });
    const header = card.createEl("header");
    const h2 = header.createEl("h2");
    h2.createSpan({ text: title });
    h2.createSpan({ cls: "count", text: String(count) });
    if (badgeText)
      h2.createSpan({ cls: "badge", text: badgeText });
    if (hint)
      header.createDiv({ cls: "group-hint", text: hint });
    const dismissed = this.cb.getDismissedBanners().has(kind);
    if (dismissed) {
      const help = h2.createEl("button", {
        cls: "instrumentality-banner-question",
        text: "?",
        attr: { title: `Show ${import_shared3.SECTION_GUIDE[kind].label} lifecycle` }
      });
      help.addEventListener("click", (e) => {
        e.stopPropagation();
        const banner = card.querySelector(
          ".instrumentality-banner.education"
        );
        if (banner)
          banner.removeClass("hidden");
        help.remove();
      });
    }
    this.renderEducationBanner(card, kind, dismissed);
    if (extraBanner)
      extraBanner(card);
    return card.createDiv({ cls: "body" });
  }
  renderEducationBanner(parent, kind, dismissed) {
    const guide = import_shared3.SECTION_GUIDE[kind];
    const banner = parent.createDiv({
      cls: "instrumentality-banner education" + (dismissed ? " hidden" : ""),
      attr: { "data-banner-kind": kind }
    });
    const content = banner.createDiv({ cls: "banner-content" });
    const explainer = content.createDiv({ cls: "banner-explainer" });
    explainer.createEl("strong", { text: guide.label });
    explainer.appendText(" \u2014 " + guide.what + " ");
    explainer.createEl("em", { text: guide.todo });
    content.createEl("pre", { cls: "banner-diagram", text: guide.lifecycleDiagram });
    const dismissBtn = banner.createEl("button", { text: "Got it" });
    dismissBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      banner.addClass("hidden");
      this.cb.dismissBanner(kind);
      const h2 = parent.querySelector("header h2");
      if (h2 && !h2.querySelector(".instrumentality-banner-question")) {
        const help = h2.createEl("button", {
          cls: "instrumentality-banner-question",
          text: "?",
          attr: { title: `Show ${guide.label} lifecycle` }
        });
        help.addEventListener("click", (ev) => {
          ev.stopPropagation();
          banner.removeClass("hidden");
          help.remove();
        });
      }
    });
  }
  placeholder(parent, text) {
    parent.createDiv({ cls: "instrumentality-placeholder", text });
  }
  /**
   * Render a section body split into "Uncommitted preview" and "Published"
   * sub-groups. When only one bucket has entries the header is omitted so
   * the section looks like it always did. Mirrors the VS Code renderer
   * exactly — keeping both UIs in lockstep.
   */
  renderBucketedBody(parent, entries, rowFn, emptyMessage, sectionKind) {
    if (entries.length === 0) {
      this.placeholder(parent, emptyMessage);
      return;
    }
    const { uncommitted, published } = (0, import_shared3.splitBySource)(entries);
    if (uncommitted.length === 0) {
      published.forEach((e, i) => rowFn(parent, e, i, false));
      return;
    }
    if (published.length === 0) {
      this.renderBucketHeader(
        parent,
        import_shared3.UNCOMMITTED_LABEL,
        uncommitted.length,
        import_shared3.SECTION_GUIDE[sectionKind].uncommittedHint
      );
      uncommitted.forEach((e, i) => rowFn(parent, e, i, true));
      return;
    }
    this.renderBucketHeader(
      parent,
      import_shared3.UNCOMMITTED_LABEL,
      uncommitted.length,
      import_shared3.SECTION_GUIDE[sectionKind].uncommittedHint
    );
    uncommitted.forEach((e, i) => rowFn(parent, e, i, true));
    this.renderBucketHeader(parent, import_shared3.PUBLISHED_LABEL, published.length);
    published.forEach((e, i) => rowFn(parent, e, i, false));
  }
  renderBucketHeader(parent, label, count, hint) {
    const wrap = parent.createDiv({ cls: "instrumentality-bucket-header" });
    wrap.createEl("strong", { text: label });
    wrap.createSpan({ cls: "count", text: ` ${count}` });
    if (hint)
      wrap.createDiv({ cls: "group-hint", text: hint });
  }
  renderCodeDriftCard(parent) {
    const entries = this.status.codeDrift.entries;
    const baseline = this.status.codeDrift.baseline.sha;
    const body = this.sectionShell(
      parent,
      "code-drift",
      import_shared3.SECTION_GUIDE["code-drift"].label + "s",
      entries.length,
      baseline ? baseline.slice(0, 7) : void 0,
      import_shared3.SECTION_GUIDE["code-drift"].what
    );
    this.renderBucketedBody(
      body,
      entries,
      (p, e, i, isUncommitted) => this.renderCodeDriftRow(p, e, i, isUncommitted),
      "No code drift",
      "code-drift"
    );
  }
  renderCodeDriftRow(parent, e, i, isUncommitted = false) {
    const id = (0, import_shared3.stableEntryId)(e.kbTarget, i);
    const sev = e.hasShared ? "warn" : "info";
    const text = e.kbTarget + " " + e.codeFiles.map((f) => f.path).join(" ");
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: e.kbTarget });
      if (e.hasShared)
        h2.createSpan({ cls: "badge shared", text: "shared" });
      if (isUncommitted) {
        h2.createSpan({
          cls: "badge preview-mode",
          text: "preview",
          attr: { title: "Uncommitted preview \u2014 not yet published" }
        });
      }
    };
    const meta = `${e.codeFiles.length} file(s) \xB7 ${e.codeFiles.slice(0, 3).map((f) => path3.basename(f.path)).join(", ")}${e.codeFiles.length > 3 ? ` (+${e.codeFiles.length - 3})` : ""}`;
    const detail = (d) => {
      const div = d.createDiv({ cls: "detail-meta" });
      const row = div.createDiv();
      row.createSpan({ text: "KB target: " });
      row.createEl("code", { text: e.kbTarget });
      this.renderAcknowledgement(div, e.acknowledgement);
      const filesBlock = div.createDiv();
      filesBlock.createEl("strong", { text: "Changed files:" });
      const ul = filesBlock.createEl("ul");
      for (const f of e.codeFiles) {
        const li = ul.createEl("li");
        li.createEl("code", { text: f.path });
        if (f.author)
          this.renderAuthorBadge(li, f.author);
      }
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
      sourceFile: path3.join("knowledge", e.kbTarget),
      diffableFiles: e.codeFiles.filter((f) => !!f.sinceCommit).map((f) => ({ relPath: f.path, sinceCommit: f.sinceCommit, latestCommit: f.latestCommit })),
      verdictQueueKey: e.kbTarget,
      driftKind: "code-drift",
      isUncommitted
    });
  }
  renderKbDriftCard(parent) {
    const entries = this.status.kbDrift.entries;
    const body = this.sectionShell(
      parent,
      "kb-drift",
      import_shared3.SECTION_GUIDE["kb-drift"].label + "s",
      entries.length,
      void 0,
      import_shared3.SECTION_GUIDE["kb-drift"].what
    );
    this.renderBucketedBody(
      body,
      entries,
      (p, e, i, isUncommitted) => this.renderKbDriftRow(p, e, i, isUncommitted),
      "No KB drift",
      "kb-drift"
    );
  }
  renderKbDriftRow(parent, e, i, isUncommitted = false) {
    const id = (0, import_shared3.stableEntryId)(e.kbFile, i);
    const sev = e.unmapped ? "warn" : "info";
    const text = e.kbFile + " " + e.codeAreas.join(" ");
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: e.kbFile });
      if (e.unmapped)
        h2.createSpan({ cls: "badge sev-warn", text: "unmapped" });
      if (isUncommitted) {
        h2.createSpan({
          cls: "badge preview-mode",
          text: "preview",
          attr: { title: "Uncommitted preview \u2014 not yet published" }
        });
      }
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
        if (e.author)
          this.renderAuthorBadge(row, e.author);
      }
      this.renderAcknowledgement(div, e.acknowledgement);
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
      sourceFile: path3.join("knowledge", e.kbFile),
      diffableFiles: e.sinceCommit ? [{ relPath: path3.join("knowledge", e.kbFile), sinceCommit: e.sinceCommit, latestCommit: e.latestCommit }] : [],
      verdictQueueKey: e.kbFile,
      driftKind: "kb-drift",
      isUncommitted
    });
  }
  renderStandardsDriftCard(parent) {
    const entries = this.status.standardsDrift.entries;
    const body = this.sectionShell(
      parent,
      "standards-drift",
      import_shared3.SECTION_GUIDE["standards-drift"].label,
      entries.length,
      void 0,
      import_shared3.SECTION_GUIDE["standards-drift"].what
    );
    this.renderBucketedBody(
      body,
      entries,
      (p, e, i, isUncommitted) => this.renderStandardsDriftRow(p, e, i, isUncommitted),
      "No standards drift",
      "standards-drift"
    );
  }
  renderStandardsDriftRow(parent, e, i, isUncommitted = false) {
    const id = (0, import_shared3.stableEntryId)(`${e.mode}:${e.queueKey}`, i);
    const sev = e.severity ?? null;
    const fileCount = Object.values(e.filesByParty).reduce((s, fs2) => s + fs2.length, 0);
    const firstFile = Object.values(e.filesByParty).flat()[0]?.path;
    const ruleHint = e.resolvedRule?.title ? ` \xB7 ${e.resolvedRule.title}` : "";
    const text = e.queueKey + " " + (e.standardId ?? "") + " " + (e.reason ?? "") + " " + (e.resolvedRule?.title ?? "");
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: e.queueKey });
      if (sev)
        h2.createSpan({ cls: `badge sev-${sev}`, text: sev });
      if (e.mode === "aspirational") {
        h2.createSpan({
          cls: "badge advisory-mode",
          text: "advisory",
          attr: { title: "Advisory backlog \u2014 not PR-blocking" }
        });
      }
      if (isUncommitted) {
        h2.createSpan({
          cls: "badge preview-mode",
          text: "preview",
          attr: { title: "Uncommitted preview \u2014 not yet published" }
        });
      }
    };
    const meta = `${e.standardId ?? "?"}${e.standardKind ? ` (${e.standardKind})` : ""} \xB7 ${fileCount} file(s)${ruleHint}`;
    const detail = (d) => {
      const div = d.createDiv({ cls: "detail-meta" });
      if (e.standardId) {
        const row = div.createDiv();
        row.createSpan({ text: "Standard: " });
        row.createEl("code", { text: e.standardId });
        if (e.standardKind)
          row.appendText(` (${e.standardKind})`);
      }
      if (e.ruleId) {
        const row = div.createDiv();
        row.createSpan({ text: "Rule id: " });
        row.createEl("code", { text: e.ruleId });
      }
      this.appendRuleBlock(div, e.resolvedRule);
      if (e.reason) {
        const row = div.createDiv();
        row.createEl("strong", { text: "Drift reason: " });
        row.appendText(e.reason);
      }
      this.renderAcknowledgement(div, e.acknowledgement);
      for (const [party, files] of Object.entries(e.filesByParty)) {
        const block = div.createDiv();
        block.createEl("strong", {
          text: party === "_" ? "Files:" : `Files (party: ${party}):`
        });
        const ul = block.createEl("ul");
        for (const f of files) {
          const li = ul.createEl("li");
          li.createEl("code", { text: f.path });
          if (f.author)
            this.renderAuthorBadge(li, f.author);
        }
      }
    };
    const diffableFiles = [];
    for (const files of Object.values(e.filesByParty)) {
      for (const f of files) {
        if (!f.sinceCommit)
          continue;
        diffableFiles.push({ relPath: f.path, sinceCommit: f.sinceCommit, latestCommit: f.latestCommit });
      }
    }
    const verdictFiles = [];
    for (const arr of Object.values(e.filesByParty)) {
      for (const f of arr)
        verdictFiles.push(f.path);
    }
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
      standardId: e.standardId,
      ruleId: e.ruleId,
      authorEntry: e,
      diffableFiles,
      modeAttr: e.mode,
      verdictQueueKey: e.queueKey,
      verdictFiles,
      driftKind: "standards-drift",
      isUncommitted
    });
  }
  renderAuthorBadge(parent, author) {
    parent.createSpan({
      cls: "instrumentality-author-badge",
      text: ` @${author}`,
      attr: { title: "Commit author" }
    });
  }
  renderAcknowledgement(parent, ack) {
    if (!ack)
      return;
    const box = parent.createDiv({
      cls: "instrumentality-ack-badge",
      attr: {
        title: `Acknowledged by ${ack.by} at ${ack.atCommit} (${ack.atDate})`
      }
    });
    box.appendText("\u2713 Acknowledged by ");
    box.createEl("strong", { text: `@${ack.by}` });
    box.appendText(" at ");
    box.createEl("code", { text: ack.atCommit });
    box.appendText(` \u2014 "${ack.reason}"`);
  }
  appendRuleBlock(parent, rule) {
    if (!rule)
      return;
    const block = parent.createDiv({ cls: "rule-block" });
    if (rule.title) {
      const row = block.createDiv({ cls: "rule-row" });
      row.createSpan({ cls: "rule-label", text: "Rule:" });
      row.createSpan({ cls: "rule-title", text: ` ${rule.title}` });
    }
    if (rule.severity) {
      const row = block.createDiv({ cls: "rule-row" });
      row.createSpan({ cls: "rule-label", text: "Severity:" });
      row.appendText(" ");
      row.createSpan({ cls: `badge sev-${rule.severity}`, text: rule.severity });
    }
    if (rule.description) {
      const row = block.createDiv({ cls: "rule-row" });
      row.createSpan({ cls: "rule-label", text: "What:" });
      row.appendText(` ${rule.description}`);
    }
    if (rule.why) {
      const row = block.createDiv({ cls: "rule-row" });
      row.createSpan({ cls: "rule-label", text: "Why:" });
      row.appendText(` ${rule.why}`);
    }
    if (rule.fixHint) {
      const row = block.createDiv({ cls: "rule-row" });
      row.createSpan({ cls: "rule-label", text: "Fix:" });
      row.appendText(` ${rule.fixHint}`);
    }
    if (rule.examples?.length) {
      const row = block.createDiv({ cls: "rule-row rule-aside" });
      row.createSpan({ cls: "rule-label", text: "Examples:" });
      row.appendText(` ${rule.examples.length} attached (open the standard to view)`);
    }
    if (rule.exceptions?.length) {
      const row = block.createDiv({ cls: "rule-row rule-aside" });
      row.createSpan({ cls: "rule-label", text: "Exceptions:" });
      row.appendText(` ${rule.exceptions.length} recorded`);
    }
  }
  renderConformCard(parent) {
    const c = this.status.conformPending.current;
    const a = this.status.conformPending.aspirational;
    const total = (c?.requested.length ?? 0) + (a?.requested.length ?? 0);
    const stale = c?.staleAgainstHead || a?.staleAgainstHead;
    const renderStaleBanner = stale ? (card) => {
      const staleMode = c?.staleAgainstHead ? "current" : "aspirational";
      const staleSha = c?.staleAgainstHead ? c.head_sha_short : a?.head_sha_short ?? "";
      const headSha = this.status?.currentHeadShort ?? "(unknown)";
      const banner = card.createDiv({ cls: "instrumentality-banner stale" });
      const txt = banner.createDiv({ cls: "banner-text" });
      txt.createEl("strong", { text: "Pending session is stale." });
      txt.appendText(" Baseline ");
      txt.createEl("code", { text: staleSha });
      txt.appendText(" \xB7 HEAD ");
      txt.createEl("code", { text: headSha });
      txt.appendText(". Re-run Phase 1 before submitting judgments.");
      const btn = banner.createEl("button", { text: "Re-run Phase 1" });
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText((0, import_shared3.rerunPhase1Prompt)(staleMode));
        new import_obsidian3.Notice("Instrumentality: Re-run Phase 1 prompt copied.");
      });
    } : void 0;
    const body = this.sectionShell(
      parent,
      "conform-pending",
      import_shared3.SECTION_GUIDE["conform-pending"].label,
      total,
      stale ? "baseline stale" : void 0,
      import_shared3.SECTION_GUIDE["conform-pending"].what,
      renderStaleBanner
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
    const id = (0, import_shared3.stableEntryId)(`${p.mode}:${r.file}:${r.standard_id}`, i);
    const sev = p.staleAgainstHead ? "warn" : "info";
    const ruleHint = r.resolvedRules && r.resolvedRules.length > 0 ? ` \xB7 ${r.resolvedRules.map((rr) => rr.title ?? rr.id).join(", ")}` : "";
    const text = r.file + " " + r.standard_id + " " + r.rule_ids.join(" ") + " " + (r.resolvedRules?.map((rr) => rr.title ?? "").join(" ") ?? "");
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: r.file });
      if (p.staleAgainstHead)
        h2.createSpan({ cls: "badge sev-warn", text: "stale" });
    };
    const meta = `${r.standard_id} \xB7 ${r.rule_ids.join(", ")} (${p.mode} @ ${p.head_sha_short})${ruleHint}`;
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
      if (r.resolvedRules) {
        for (const rr of r.resolvedRules)
          this.appendRuleBlock(div, rr);
      }
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
      standardId: r.standard_id,
      ruleId: r.rule_ids[0] ?? null
    });
  }
  renderPromotionsCard(parent) {
    const entries = this.status.promotions;
    const body = this.sectionShell(
      parent,
      "promotions",
      import_shared3.SECTION_GUIDE.promotions.label,
      entries.length,
      void 0,
      import_shared3.SECTION_GUIDE.promotions.what
    );
    if (entries.length === 0)
      return this.placeholder(body, "No pending promotions");
    entries.forEach((e, i) => this.renderPromotionRow(body, e, i));
  }
  renderPromotionRow(parent, e, i) {
    const id = (0, import_shared3.stableEntryId)(e.queueKey, i);
    const sev = e.severity ?? "info";
    const ruleHint = e.resolvedRule?.title ? ` \xB7 ${e.resolvedRule.title}` : "";
    const text = e.queueKey + " " + (e.standardId ?? "") + " " + e.files.map((f) => f.path).join(" ") + " " + (e.resolvedRule?.title ?? "");
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: e.queueKey });
      if (e.severity)
        h2.createSpan({ cls: `badge sev-${e.severity}`, text: e.severity });
    };
    const meta = `${e.files.length} file(s) \xB7 ${e.standardId ?? "?"}${ruleHint}`;
    const detail = (d) => {
      const div = d.createDiv({ cls: "detail-meta" });
      const rule = div.createDiv();
      rule.createSpan({ text: "Rule: " });
      rule.createEl("code", { text: e.ruleId ?? "?" });
      this.appendRuleBlock(div, e.resolvedRule);
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
      this.renderSuppressionContract(div, e);
    };
    const verdictFiles = e.files.map((f) => f.path);
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
      standardId: e.standardId,
      ruleId: e.ruleId,
      verdictQueueKey: e.queueKey,
      verdictFiles
    });
  }
  // Suppression contract panel: surfaces the ledger semantics inline so
  // a user staring at a promoted entry knows *why* it isn't re-firing
  // and *when* it will auto-clear. Fingerprint shown as stored at
  // promote time — no live recompute.
  renderSuppressionContract(parent, e) {
    const panel = parent.createDiv({ cls: "instrumentality-suppression-contract" });
    panel.createDiv({ cls: "sc-title", text: "Suppression contract" });
    const earliest = e.files.map((f) => f.promotedAt).sort()[0] ?? null;
    const fingerprintShort = e.ruleFingerprint ? e.ruleFingerprint.length > 22 ? e.ruleFingerprint.slice(0, 22) + "\u2026" : e.ruleFingerprint : "(none recorded)";
    const fingerprintTooltip = "Hash inputs: rule.description, rule.severity, canonicalized rule.detect, canonicalized rule.applies_to, plus parties[].applies_to.paths for contracts. Mismatch on next sweep \u2192 auto-close.";
    const row1 = panel.createDiv({ cls: "sc-row" });
    row1.createSpan({ cls: "sc-label", text: "Suppressed since:" });
    row1.appendText(" ");
    if (earliest)
      row1.createEl("code", { text: earliest });
    else
      row1.createEl("em", { text: "(no files)" });
    const row2 = panel.createDiv({ cls: "sc-row" });
    row2.createSpan({ cls: "sc-label", text: "Rule fingerprint:" });
    row2.appendText(" ");
    row2.createEl("code", { text: fingerprintShort, attr: { title: fingerprintTooltip } });
    const row3 = panel.createDiv({ cls: "sc-row" });
    row3.createSpan({ cls: "sc-label", text: "Auto-closes if:" });
    row3.appendText(" rule definition changes (fingerprint mismatch on next Phase 1 sweep) or the standard/rule is removed.");
    const row4 = panel.createDiv({ cls: "sc-row" });
    row4.createSpan({ cls: "sc-label", text: "Or close manually:" });
    row4.appendText(" use the ");
    row4.createEl("em", { text: "Close promotion" });
    row4.appendText(" verdict to write an exception into the rule.");
    const actions = panel.createDiv({ cls: "sc-row sc-actions" });
    const openLedger = actions.createEl("button", { text: "Open ledger" });
    openLedger.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!this.kbRoot) {
        new import_obsidian3.Notice("Instrumentality: knowledge base not detected.");
        return;
      }
      const abs = path3.join(
        this.kbRoot,
        "knowledge",
        "sync",
        "standards-promotions.md"
      );
      await this.openPath(abs);
    });
  }
  renderLintCard(parent) {
    const v = this.status.lint.violations;
    const ran = this.status.lint.ran;
    const body = this.sectionShell(
      parent,
      "lint",
      import_shared3.SECTION_GUIDE.lint.label,
      v.length,
      ran ? void 0 : "unavailable",
      import_shared3.SECTION_GUIDE.lint.what
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
    const id = (0, import_shared3.stableEntryId)(`${v.file}:${v.message.slice(0, 40)}`, i);
    const text = v.file + " " + v.message;
    const summary = (h2) => {
      h2.createSpan({ cls: "title", text: path3.basename(v.file) });
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
  // ── Mapping diagnostics card ───────────────────────────────────────────
  //
  // Panel-level audit findings from knowledge/_mcp/lib/pattern-audit.js —
  // surfaces structural problems with code_path_patterns in _rules.md. The
  // data arrives via the live-status runner; the card is empty when no
  // findings are present.
  renderMappingDiagnosticsCard(parent) {
    const audit = this.status.patternAudit;
    const findings = audit?.findings ?? [];
    const body = this.sectionShell(
      parent,
      "mapping-diagnostics",
      import_shared3.SECTION_GUIDE["mapping-diagnostics"].label,
      findings.length,
      void 0,
      import_shared3.SECTION_GUIDE["mapping-diagnostics"].what
    );
    if (findings.length === 0) {
      return this.placeholder(body, "No mapping diagnostics \u2014 patterns are consistent with the current filesystem.");
    }
    findings.forEach((f, i) => this.renderMappingDiagnosticsRow(body, f, i));
  }
  renderMappingDiagnosticsRow(parent, f, i) {
    const id = (0, import_shared3.stableEntryId)(`audit:${f.type}`, i);
    const text = JSON.stringify(f);
    const summary = (h2) => {
      switch (f.type) {
        case "orphan_pattern":
          h2.createSpan({ cls: "title", text: "Orphan pattern: " });
          h2.createEl("code", { text: f.kb_target });
          if (f.is_submodule_pattern)
            h2.createSpan({ cls: "badge sev-info", text: "submodule" });
          break;
        case "ghost_target":
          h2.createSpan({ cls: "title", text: "Ghost target: " });
          h2.createEl("code", { text: f.resolved_target });
          break;
        case "multi_target_files":
          h2.createSpan({ cls: "title", text: "Multi-target file: " });
          h2.createEl("code", { text: f.file });
          h2.createSpan({ cls: "badge sev-info", text: `${f.matched_targets.length} targets` });
          break;
        case "convention_violation":
          h2.createSpan({ cls: "title", text: "Convention violation: " });
          h2.createEl("code", { text: f.kb_target });
          break;
        case "unmapped_kb_group":
          h2.createSpan({ cls: "title", text: "Unmapped KB folder: " });
          h2.createEl("code", { text: f.folder });
          h2.createSpan({ cls: "badge sev-info", text: `${f.count} file(s)` });
          break;
        case "fanout_with_hardcoded":
          h2.createSpan({ cls: "title", text: "Overbroad hardcoded pattern: " });
          h2.createEl("code", { text: f.kb_target });
          break;
      }
    };
    const detail = (d) => {
      const div = d.createDiv({ cls: "detail-meta" });
      switch (f.type) {
        case "orphan_pattern": {
          if (f.intent)
            div.createDiv({ text: `Intent: ${f.intent}` });
          div.createDiv({ text: "Paths match no source files:" });
          const ul = div.createEl("ul");
          for (const p of f.paths)
            ul.createEl("li").createEl("code", { text: p });
          break;
        }
        case "ghost_target":
          div.createDiv({
            text: "kb_target points at a KB file that does not exist. Either create the KB file or fix the pattern in _rules.md."
          });
          break;
        case "multi_target_files": {
          div.createDiv({ text: `Matches ${f.matched_targets.length} patterns \u2014 fan-out drift entries:` });
          const ul = div.createEl("ul");
          for (const t of f.matched_targets)
            ul.createEl("li").createEl("code", { text: t.kb_target });
          div.createDiv({
            text: "If unintentional, narrow one of the patterns. Post-P0 all matching targets get entries."
          });
          break;
        }
        case "convention_violation":
          div.createDiv({
            text: `intent "${f.intent}" conventionally targets ${f.expected_folder} but this pattern points elsewhere.`
          });
          break;
        case "unmapped_kb_group": {
          div.createDiv({
            text: "No code_path_patterns entry targets these KB files. Code\u2192KB drift detection is silent for them."
          });
          const ul = div.createEl("ul");
          for (const s of f.sample_files)
            ul.createEl("li").createEl("code", { text: s });
          break;
        }
        case "fanout_with_hardcoded":
          div.createDiv({
            text: `${f.distinct_concepts} distinct file basenames map to this single KB file. Consider a {name} template or narrower paths.`
          });
          break;
      }
    };
    this.entryShell({
      parent,
      section: "mapping-diagnostics",
      id,
      sev: "info",
      text,
      summary,
      meta: f.type,
      detail: (d) => {
        detail(d);
        const actions = d.createDiv({ cls: "instrumentality-entry-actions" });
        const btn = actions.createEl("button", {
          cls: "instrumentality-btn instrumentality-btn-tiny",
          text: "Copy fix prompt"
        });
        btn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const prompt = buildAuditFixPrompt(f);
          try {
            await navigator.clipboard.writeText(prompt);
            new import_obsidian3.Notice("Audit fix prompt copied to clipboard.");
          } catch {
            const ta = document.createElement("textarea");
            ta.value = prompt;
            document.body.appendChild(ta);
            ta.select();
            try {
              document.execCommand("copy");
              new import_obsidian3.Notice("Audit fix prompt copied to clipboard.");
            } catch {
              new import_obsidian3.Notice("Could not copy \u2014 clipboard API unavailable.");
            } finally {
              document.body.removeChild(ta);
            }
          }
        });
      }
    });
  }
  // ── Submodules pinned card ─────────────────────────────────────────────
  //
  // Structurally distinct from accordion cards — git state is an
  // orient-yourself glance, not a work queue. Header dots stay visible
  // even when the body is collapsed so health is always readable.
  renderSubmodulesPinned(parent) {
    const sub = this.status?.submodules;
    if (!sub || sub.entries.length === 0)
      return;
    const collapsed = this.submodulesCollapsed;
    const card = parent.createDiv({
      cls: "instrumentality-submodules-pinned",
      attr: { "data-collapsed": String(collapsed) }
    });
    const header = card.createDiv({ cls: "submodules-pinned-header" });
    header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const chevron = header.createSpan({
      cls: "submodules-pinned-chevron",
      text: collapsed ? "\u25B8" : "\u25BE"
    });
    header.createSpan({ cls: "submodules-pinned-title", text: "Submodules" });
    header.createSpan({ cls: "count", text: String(sub.entries.length) });
    const dots = header.createSpan({ cls: "submodules-pinned-dots" });
    for (const e of sub.entries) {
      const align = classifyBranch(e, sub.parentBranch);
      dots.createSpan({
        cls: `submodule-dot-summary submodule-dot-${align}`,
        text: "\u25CF",
        attr: { title: `${e.path} \xB7 ${e.branch ?? "detached"}` }
      });
    }
    const metaSpan = header.createSpan({ cls: "submodules-pinned-meta" });
    if (sub.parentBranch) {
      metaSpan.appendText("parent on ");
      metaSpan.createEl("code", { text: sub.parentBranch });
    } else {
      metaSpan.createSpan({ cls: "sev-warn", text: "parent HEAD detached" });
    }
    if (sub.wouldBlock) {
      header.createSpan({
        cls: "badge sev-error",
        text: "would block push",
        attr: {
          title: "Pre-push hook will block. Submodules need to match the parent branch."
        }
      });
    }
    header.addEventListener("click", (ev) => {
      const target = ev.target;
      if (target.closest("button, a, input"))
        return;
      const next = !this.submodulesCollapsed;
      this.submodulesCollapsed = next;
      this.cb.setSubmodulesCollapsed(next);
      card.setAttribute("data-collapsed", String(next));
      chevron.setText(next ? "\u25B8" : "\u25BE");
      header.setAttribute("aria-expanded", next ? "false" : "true");
      body.style.display = next ? "none" : "";
    });
    const body = card.createDiv({ cls: "submodule-pinned-body" });
    if (collapsed)
      body.style.display = "none";
    if (sub.sharedPointerChanged.length > 0) {
      const warn = body.createDiv({ cls: "submodule-shared-warn" });
      warn.appendText("\u26A0 Shared submodule pointer changed: ");
      sub.sharedPointerChanged.forEach((p, i) => {
        if (i > 0)
          warn.appendText(", ");
        warn.createEl("code", { text: p });
      });
      warn.appendText(" \u2014 affects all consumers.");
    }
    const list = body.createDiv({ cls: "submodule-list" });
    for (const e of sub.entries) {
      this.renderSubmoduleRow(list, e, sub.parentBranch);
    }
    const actions = body.createDiv({ cls: "submodule-actions" });
    const pushBtn = actions.createEl("button", {
      cls: sub.wouldBlock ? "instrumentality-submodule-push-btn danger" : "instrumentality-submodule-push-btn mod-cta",
      text: sub.wouldBlock ? "Run push (will block)" : "Run push"
    });
    pushBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void this.handleSubmodulePush();
    });
  }
  renderSubmoduleRow(parent, e, parentBranch) {
    const align = classifyBranch(e, parentBranch);
    const row = parent.createDiv({
      cls: `submodule-row submodule-row-${align}`
    });
    const main = row.createDiv({ cls: "submodule-main" });
    const title = main.createDiv({ cls: "submodule-title" });
    title.createEl("code", { text: e.path });
    title.appendText(" ");
    if (e.type === "shared") {
      title.createSpan({
        cls: "badge sev-info",
        text: "shared",
        attr: { title: "kb-shared = true in .gitmodules" }
      });
    } else {
      title.createSpan({
        cls: "badge",
        text: "owned",
        attr: { title: "owned by this superproject" }
      });
    }
    if (e.pointerChanged) {
      title.appendText(" ");
      title.createSpan({
        cls: "submodule-dot pointer",
        text: "\u25CF",
        attr: { title: "Pointer changed vs upstream" }
      });
    }
    const meta = main.createDiv({ cls: "submodule-meta" });
    meta.appendText("on ");
    const branchChipTitle = align === "aligned" ? "Same branch as parent \u2014 push will sail through." : align === "blocking" ? "Owned submodule on a different branch than parent \u2014 the pre-push hook will block this combination." : align === "advisory" ? "Shared submodule on its own branch \u2014 informational, not blocking." : "Detached HEAD \u2014 no branch to compare.";
    if (e.branch) {
      meta.createEl("code", {
        cls: `branch-chip branch-${align}`,
        text: e.branch,
        attr: { title: branchChipTitle }
      });
    } else {
      const chip = meta.createSpan({
        cls: `branch-chip branch-detached`,
        attr: { title: branchChipTitle }
      });
      chip.createEl("em", { text: "detached" });
    }
    meta.appendText(" ");
    if (e.branchMismatch && parentBranch) {
      meta.createSpan({
        cls: "badge sev-error",
        text: "mismatch",
        attr: {
          title: "Submodule branch differs from parent \u2014 the pre-push hook will block this combination."
        }
      });
    } else if (e.pointerChanged) {
      meta.createSpan({
        cls: "badge sev-info",
        text: "to push",
        attr: {
          title: "Pointer changed since upstream \u2014 will be included in the next push."
        }
      });
    } else {
      meta.createSpan({
        cls: "badge",
        text: "clean",
        attr: { title: "In sync with upstream." }
      });
    }
    const rowActions = row.createDiv({ cls: "submodule-row-actions" });
    if (e.branchMismatch && parentBranch) {
      const btn = rowActions.createEl("button", {
        cls: "instrumentality-submodule-sync-btn danger"
      });
      btn.appendText("Sync to ");
      btn.createEl("code", { text: parentBranch });
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void this.handleSubmoduleSync(e.path, parentBranch);
      });
    }
  }
  // ── Submodule actions ──────────────────────────────────────────────────
  async handleSubmoduleSync(subPath, parentBranch) {
    if (!this.kbRoot) {
      new import_obsidian3.Notice("Instrumentality: knowledge base not detected.");
      return;
    }
    const ok = await confirmModal(this.app, {
      title: `Sync submodule '${subPath}' \u2192 ${parentBranch}?`,
      detail: `Runs \`git -C ${subPath} checkout ${parentBranch}\`. Uncommitted changes in the submodule will block the checkout.`,
      confirmLabel: "Sync"
    });
    if (!ok)
      return;
    const result = await (0, import_shared3.syncSubmoduleBranch)(this.kbRoot, subPath, parentBranch);
    if (result.success) {
      new import_obsidian3.Notice(
        `Instrumentality: synced ${subPath} \u2192 ${parentBranch}.`
      );
      void this.refresh();
    } else {
      new import_obsidian3.Notice(
        `Instrumentality: sync failed: ${result.output || "unknown error"}`
      );
    }
  }
  async handleSubmodulePush() {
    if (!this.kbRoot) {
      new import_obsidian3.Notice("Instrumentality: knowledge base not detected.");
      return;
    }
    const sub = this.status?.submodules;
    if (!sub) {
      new import_obsidian3.Notice("Instrumentality: no submodule data \u2014 refresh first.");
      return;
    }
    if (sub.wouldBlock) {
      const detail = [
        `Pre-push hook will reject this push.`,
        ``,
        `Submodules on a different branch than the parent (${sub.parentBranch ?? "?"}):`,
        ...sub.blockingPaths.map((p) => `  \u2022 ${p}`),
        ``,
        `Fix: sync each submodule to '${sub.parentBranch ?? "<parent>"}' (use the Sync button on each row),`,
        `or unstage the submodule pointer change if it isn't part of this feature.`
      ].join("\n");
      await confirmModal(this.app, {
        title: "Push blocked by submodule branch mismatch",
        detail,
        confirmLabel: "Dismiss",
        hideCancel: true
      });
      return;
    }
    const plan = (0, import_shared3.buildPushPlan)(this.kbRoot, sub);
    let parentRemote;
    const parentStep = plan.find((s) => s.type === "parent");
    if (parentStep?.branch && !await (0, import_shared3.hasUpstream)(parentStep.fullPath)) {
      const remotes = await (0, import_shared3.listRemotes)(parentStep.fullPath);
      if (remotes.length === 0) {
        new import_obsidian3.Notice(
          "Instrumentality: parent repo has no git remote configured."
        );
        return;
      }
      const defaultRemote = await (0, import_shared3.detectPushRemote)(
        parentStep.fullPath,
        parentStep.branch,
        remotes
      );
      if (remotes.length === 1) {
        parentRemote = remotes[0];
      } else {
        const pick = await selectModal(this.app, {
          title: `Set upstream for '${parentStep.branch}' \u2014 pick a remote`,
          placeholder: `Default: ${defaultRemote}`,
          options: [
            defaultRemote,
            ...remotes.filter((r) => r !== defaultRemote)
          ].map((r) => ({
            value: r,
            label: r,
            description: r === defaultRemote ? "default" : void 0
          }))
        });
        if (!pick)
          return;
        parentRemote = pick;
      }
    }
    const planLines = plan.map((s) => {
      if (s.type === "parent" && parentRemote && s.branch) {
        return `${s.order}. parent \u2014 git push -u ${parentRemote} ${s.branch}`;
      }
      return `${s.order}. ${s.type === "parent" ? "parent" : s.path} \u2014 git ${s.action}`;
    });
    const sharedWarn = sub.sharedPointerChanged.length > 0 ? `

\u26A0 Shared submodule pointer changed:
${sub.sharedPointerChanged.map((p) => `  \u2022 ${p}`).join(
      "\n"
    )}
These affect all projects consuming the module.` : "";
    const ok = await confirmModal(this.app, {
      title: "Push submodules and parent in order?",
      detail: planLines.join("\n") + sharedWarn,
      confirmLabel: "Push"
    });
    if (!ok)
      return;
    const result = await (0, import_shared3.runPushPlan)(plan, { parentRemote });
    void this.refresh();
    if (result.allSuccess) {
      new import_obsidian3.Notice(
        `Instrumentality: pushed ${result.steps.length} step(s) successfully.`
      );
      return;
    }
    const failed = result.steps.find((s) => !s.success);
    new import_obsidian3.Notice(
      `Instrumentality: push failed at ${failed?.step.path}: ${failed?.output?.slice(0, 200) ?? "unknown error"}`
    );
  }
  // ── Publish drift ──────────────────────────────────────────────────────
  //
  // Runs drift.runTool() + conform.runTool() in write mode, then stages and
  // commits any changes to knowledge/sync/*.md as a single
  // `chore(kb): publish drift queue` commit. Mirrors the VSCode extension's
  // handlePublishDrift exactly.
  async handlePublishDrift() {
    if (!this.kbRoot) {
      new import_obsidian3.Notice("Instrumentality: knowledge base not detected.");
      return;
    }
    const scriptDrift = path3.join(this.kbRoot, "knowledge", "_mcp", "tools", "drift.js");
    const scriptConform = path3.join(this.kbRoot, "knowledge", "_mcp", "tools", "conform.js");
    const fs2 = await import("fs");
    if (!fs2.existsSync(scriptDrift)) {
      new import_obsidian3.Notice(
        "Instrumentality: publish requires knowledge/_mcp/tools/drift.js (missing in this workspace)."
      );
      return;
    }
    const ok = await confirmModal(this.app, {
      title: "Publish drift queue?",
      detail: "Runs drift + conform detection in write mode, then commits any changes to knowledge/sync/*.md as `chore(kb): publish drift queue`. Does not push.",
      confirmLabel: "Publish"
    });
    if (!ok)
      return;
    try {
      await this.runNodeTool(scriptDrift, this.kbRoot);
      if (fs2.existsSync(scriptConform)) {
        await this.runNodeTool(scriptConform, this.kbRoot);
      }
    } catch (err) {
      new import_obsidian3.Notice(
        `Instrumentality: drift detection failed: ${err?.message ?? err}`
      );
      return;
    }
    const queueFiles = [
      "knowledge/sync/code-drift.md",
      "knowledge/sync/kb-drift.md",
      "knowledge/sync/standards-drift.md",
      "knowledge/sync/standards-backlog.md"
    ].filter((f) => fs2.existsSync(path3.join(this.kbRoot, f)));
    if (queueFiles.length === 0) {
      new import_obsidian3.Notice(
        "Instrumentality: nothing to publish \u2014 no queue files present."
      );
      return;
    }
    try {
      await this.runGit(["add", "--", ...queueFiles], this.kbRoot);
    } catch (err) {
      new import_obsidian3.Notice(`Instrumentality: git add failed: ${err?.message ?? err}`);
      return;
    }
    let stagedNames = "";
    try {
      stagedNames = (await this.runGit(
        ["diff", "--cached", "--name-only", "--", ...queueFiles],
        this.kbRoot
      )).trim();
    } catch {
    }
    if (!stagedNames) {
      new import_obsidian3.Notice(
        "Instrumentality: nothing to publish \u2014 drift queue is already up to date."
      );
      void this.refresh();
      return;
    }
    try {
      await this.runGit(
        ["commit", "-m", "chore(kb): publish drift queue"],
        this.kbRoot
      );
    } catch (err) {
      new import_obsidian3.Notice(`Instrumentality: git commit failed: ${err?.message ?? err}`);
      return;
    }
    new import_obsidian3.Notice(
      `Instrumentality: published drift queue (${stagedNames.split("\n").length} file(s)). Push when ready.`
    );
    void this.refresh();
  }
  runNodeTool(scriptPath, cwd) {
    return new Promise((resolve2, reject) => {
      (0, import_node_child_process.execFile)(
        process.execPath,
        [
          "-e",
          `require(${JSON.stringify(scriptPath)}).runTool({}).then(() => {}).catch((e) => { process.stderr.write(String(e && e.message || e)); process.exit(1); })`
        ],
        { cwd, maxBuffer: 16 * 1024 * 1024 },
        (err) => err ? reject(err) : resolve2()
      );
    });
  }
  runGit(args, cwd) {
    return new Promise((resolve2, reject) => {
      (0, import_node_child_process.execFile)("git", args, { cwd, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (err)
          reject(err);
        else
          resolve2(stdout);
      });
    });
  }
  // ── Entry shell + actions ──────────────────────────────────────────────
  entryShell(opts) {
    const attr = {
      "data-entry-section": opts.section,
      "data-entry-id": opts.id,
      "data-entry-sev": opts.sev,
      "data-entry-text": opts.text.toLowerCase()
    };
    if (opts.modeAttr)
      attr["data-entry-mode"] = opts.modeAttr;
    if (opts.isUncommitted)
      attr["data-entry-bucket"] = "uncommitted";
    const row = opts.parent.createDiv({
      cls: "instrumentality-entry",
      attr
    });
    const summary = row.createDiv({ cls: "entry-summary" });
    const titleRow = summary.createDiv({ cls: "entry-title-row" });
    opts.summary(titleRow);
    summary.createDiv({ cls: "entry-meta", text: opts.meta });
    const detail = row.createDiv({ cls: "entry-detail" });
    opts.detail(detail);
    const skipDefaultActions = opts.section === "mapping-diagnostics";
    if (!skipDefaultActions) {
      const actions = detail.createDiv({ cls: "entry-actions" });
      const sendBtn = actions.createEl("button", { text: (0, import_shared3.copyActionLabel)(opts.section), cls: "mod-cta" });
      sendBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const indexed2 = this.entryIndex.get(`${opts.section}:${opts.id}`);
        if (!indexed2)
          return;
        await navigator.clipboard.writeText(indexed2.prompt);
        new import_obsidian3.Notice(`Instrumentality: ${(0, import_shared3.primaryActionLabel)(opts.section).toLowerCase()} prompt copied.`);
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
        if (opts.ruleId) {
          const editBtn = actions.createEl("button", { text: "Edit Rule" });
          editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            void this.editRule(opts.standardId, opts.ruleId);
          });
        }
        if (opts.authorEntry) {
          const refineBtn = actions.createEl("button", { text: "Refine with Agent" });
          refineBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const prompt = (0, import_shared3.getActionPrompt)({
              kind: "standard-author",
              entry: opts.authorEntry,
              mode: "refine"
            });
            await navigator.clipboard.writeText(prompt);
            new import_obsidian3.Notice("Instrumentality: refine prompt copied to clipboard.");
          });
        }
      }
    }
    const verdictDefs = opts.isUncommitted ? void 0 : VERDICTS_BY_SECTION[opts.section];
    if (verdictDefs && opts.verdictQueueKey) {
      this.appendVerdictPicker(detail, {
        section: opts.section,
        verdictDefs,
        queueKey: opts.verdictQueueKey,
        files: opts.verdictFiles ?? [],
        driftKind: opts.driftKind
      });
    }
    if (opts.diffableFiles && opts.diffableFiles.length > 0) {
      this.appendDiffDisclosure(detail, opts.diffableFiles);
    }
    const disclosure = detail.createEl("details", { cls: "prompt-disclosure" });
    disclosure.createEl("summary", { text: "Show prompt" });
    const promptPre = disclosure.createEl("pre", { cls: "entry-prompt" });
    const indexed = this.entryIndex.get(`${opts.section}:${opts.id}`);
    promptPre.appendText(indexed?.prompt ?? "(no prompt available)");
    summary.addEventListener("click", () => row.toggleClass("open", !row.hasClass("open")));
  }
  appendVerdictPicker(parent, opts) {
    const row = parent.createDiv({ cls: "instrumentality-verdict-actions-row" });
    for (const def of opts.verdictDefs) {
      const btn = row.createEl("button", {
        cls: "instrumentality-verdict-btn",
        text: def.label
      });
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!def.needsForm) {
          await this.submitVerdict(opts.section, def, opts.queueKey, {}, opts.driftKind);
          return;
        }
        const entry = parent.closest(".instrumentality-entry");
        if (!entry)
          return;
        let form = entry.querySelector(
          ".instrumentality-verdict-form"
        );
        if (!form) {
          form = this.buildVerdictForm(opts);
          parent.appendChild(form);
        }
        this.activateVerdictForm(form, def, opts);
      });
    }
  }
  buildVerdictForm(opts) {
    const form = createDiv({
      cls: "instrumentality-verdict-form hidden",
      attr: { "data-active-verdict": "" }
    });
    form.createDiv({ cls: "verdict-form-title" });
    const filesField = form.createDiv({
      cls: "verdict-field",
      attr: { "data-for-field": "filePaths" }
    });
    filesField.createEl("label", { cls: "verdict-field-label" });
    const ul = filesField.createEl("ul", { cls: "verdict-file-list" });
    for (const p of opts.files) {
      const li = ul.createEl("li");
      const lbl = li.createEl("label");
      const cb = lbl.createEl("input", { attr: { type: "checkbox", value: p } });
      cb.setAttribute("name", "vfile");
      lbl.appendText(" ");
      lbl.createEl("code", { text: p });
    }
    const reasonField = form.createDiv({
      cls: "verdict-field",
      attr: { "data-for-field": "reason" }
    });
    const reasonLbl = reasonField.createEl("label");
    reasonLbl.appendText("Reason ");
    reasonLbl.createSpan({ cls: "verdict-required-marker", text: "(required)" });
    const reason = reasonField.createEl("textarea", {
      cls: "verdict-reason",
      attr: { rows: "3", placeholder: "Why?" }
    });
    const noteField = form.createDiv({
      cls: "verdict-field",
      attr: { "data-for-field": "note" }
    });
    const noteLbl = noteField.createEl("label");
    noteLbl.appendText("Note ");
    noteLbl.createSpan({ cls: "verdict-optional-marker", text: "(optional)" });
    noteField.createEl("textarea", {
      cls: "verdict-note",
      attr: { rows: "2", placeholder: "Optional context for the senior reviewer" }
    });
    const actions = form.createDiv({ cls: "verdict-form-actions" });
    const submit = actions.createEl("button", {
      cls: "instrumentality-verdict-submit mod-cta",
      text: "Send to agent"
    });
    submit.setAttribute("disabled", "");
    const cancel = actions.createEl("button", { text: "Cancel" });
    const revalidate = () => {
      const active = form.getAttribute("data-active-verdict");
      if (!active) {
        submit.setAttribute("disabled", "");
        return;
      }
      const def = opts.verdictDefs.find((d) => d.verdict === active);
      if (!def) {
        submit.setAttribute("disabled", "");
        return;
      }
      let valid = true;
      if (def.fields.filePaths?.required) {
        const checked = form.querySelectorAll('input[name="vfile"]:checked');
        if (checked.length === 0)
          valid = false;
      }
      if (def.fields.reason?.required) {
        if (!reason.value.trim())
          valid = false;
      }
      if (valid)
        submit.removeAttribute("disabled");
      else
        submit.setAttribute("disabled", "");
    };
    form.addEventListener("input", revalidate);
    form.addEventListener("change", revalidate);
    submit.addEventListener("click", async (e) => {
      e.stopPropagation();
      const active = form.getAttribute("data-active-verdict");
      if (!active)
        return;
      const def = opts.verdictDefs.find((d) => d.verdict === active);
      if (!def)
        return;
      const draft = {};
      const checked = Array.from(
        form.querySelectorAll('input[name="vfile"]:checked')
      ).map((i) => i.value);
      if (checked.length > 0)
        draft.filePaths = checked;
      const rEl = form.querySelector(".verdict-reason");
      if (rEl && rEl.value.trim())
        draft.reason = rEl.value.trim();
      const nEl = form.querySelector(".verdict-note");
      if (nEl && nEl.value.trim())
        draft.note = nEl.value.trim();
      await this.submitVerdict(opts.section, def, opts.queueKey, draft, opts.driftKind);
      this.resetVerdictForm(form);
    });
    cancel.addEventListener("click", (e) => {
      e.stopPropagation();
      this.resetVerdictForm(form);
    });
    return form;
  }
  activateVerdictForm(form, def, opts) {
    form.setAttribute("data-active-verdict", def.verdict);
    const title = form.querySelector(".verdict-form-title");
    if (title)
      title.setText("Resolve as: " + def.label.replace(/…$/, ""));
    form.querySelectorAll("[data-for-field]").forEach((el) => {
      const key = el.getAttribute("data-for-field");
      if (!key)
        return;
      const cfg = def.fields[key];
      el.toggleClass("hidden", !cfg);
      if (key === "filePaths" && cfg) {
        const lbl = el.querySelector(".verdict-field-label");
        if (lbl)
          lbl.setText(cfg.label);
      }
    });
    form.removeClass("hidden");
    form.dispatchEvent(new Event("input"));
  }
  resetVerdictForm(form) {
    form.setAttribute("data-active-verdict", "");
    form.addClass("hidden");
    form.querySelectorAll('input[name="vfile"]').forEach((i) => i.checked = false);
    const r = form.querySelector(".verdict-reason");
    if (r)
      r.value = "";
    const n = form.querySelector(".verdict-note");
    if (n)
      n.value = "";
    const submit = form.querySelector(
      ".instrumentality-verdict-submit"
    );
    if (submit)
      submit.setAttribute("disabled", "");
  }
  async submitVerdict(section, def, queueKey, draft, driftKind) {
    let prompt;
    try {
      switch (def.verdict) {
        case "acknowledged": {
          if (!driftKind)
            throw new Error("Acknowledge requires a drift kind.");
          if (!draft.reason || !draft.reason.trim())
            throw new Error("Acknowledge requires a reason.");
          prompt = (0, import_shared3.acknowledgedPrompt)({
            verdict: "acknowledged",
            kind: driftKind,
            entryKey: queueKey,
            reason: draft.reason.trim()
          });
          break;
        }
        case "applied":
          prompt = (0, import_shared3.appliedPrompt)({ verdict: "applied", queueKey });
          break;
        case "exempted":
          if (!draft.filePaths || draft.filePaths.length === 0)
            throw new Error("Exempt requires at least one file.");
          if (!draft.reason || !draft.reason.trim())
            throw new Error("Exempt requires a reason.");
          prompt = (0, import_shared3.exemptedPrompt)({
            verdict: "exempted",
            queueKey,
            filePaths: draft.filePaths,
            reason: draft.reason.trim()
          });
          break;
        case "promoted":
          if (!draft.filePaths || draft.filePaths.length === 0)
            throw new Error("Promote requires at least one originating file.");
          prompt = (0, import_shared3.promotedPrompt)({
            verdict: "promoted",
            queueKey,
            originatingFiles: draft.filePaths,
            note: draft.note?.trim() || void 0
          });
          break;
        case "dismissed":
          if (!draft.reason || !draft.reason.trim())
            throw new Error("Dismiss requires a reason.");
          prompt = (0, import_shared3.dismissedPrompt)({
            verdict: "dismissed",
            queueKey,
            reason: draft.reason.trim()
          });
          break;
        case "closed_promotion":
          if (!draft.filePaths || draft.filePaths.length === 0)
            throw new Error("Close promotion requires at least one file.");
          if (!draft.reason || !draft.reason.trim())
            throw new Error("Close promotion requires a reason.");
          prompt = (0, import_shared3.closedPromotionPrompt)({
            verdict: "closed_promotion",
            queueKey,
            filePaths: draft.filePaths,
            reason: draft.reason.trim()
          });
          break;
        default:
          throw new Error(`Unknown verdict: ${def.verdict}`);
      }
    } catch (err) {
      new import_obsidian3.Notice(`Instrumentality: ${err?.message ?? err}`);
      return;
    }
    await navigator.clipboard.writeText(prompt);
    new import_obsidian3.Notice(`Instrumentality: ${def.verdict.replace(/_/g, " ")} prompt copied.`);
  }
  /**
   * Lazy git-diff disclosure. We don't run git on render — only when the
   * user expands a file's `<details>` block. Cache the resolved text on
   * the disclosure element so re-toggling doesn't re-shell.
   */
  appendDiffDisclosure(parent, files) {
    const wrap = parent.createDiv({ cls: "diff-actions" });
    const top = wrap.createEl("details", { cls: "diff-disclosure" });
    top.createEl("summary", {
      text: `Show diffs (${files.length} file${files.length === 1 ? "" : "s"})`
    });
    const list = top.createEl("ul", { cls: "diff-list" });
    for (const f of files) {
      const li = list.createEl("li");
      const fileDetail = li.createEl("details", { cls: "diff-file" });
      const summary = fileDetail.createEl("summary");
      summary.createEl("code", { text: f.relPath });
      summary.appendText(
        ` (${f.sinceCommit.slice(0, 7)}${f.latestCommit ? ` \u2192 ${f.latestCommit.slice(0, 7)}` : " \u2192 working tree"})`
      );
      const out = fileDetail.createEl("pre", { cls: "diff-block" });
      let loaded = false;
      fileDetail.addEventListener("toggle", async () => {
        if (!fileDetail.open || loaded)
          return;
        loaded = true;
        try {
          const text = await this.gitDiffFor(f);
          out.empty();
          this.renderDiffText(out, text);
        } catch (err) {
          out.empty();
          out.appendText(`error: ${err?.message ?? err}`);
        }
      });
    }
  }
  async gitDiffFor(f) {
    if (!this.kbRoot)
      return "(kb root not detected)";
    const range = f.latestCommit ? `${f.sinceCommit}^..${f.latestCommit}` : `${f.sinceCommit}^`;
    const absPath = path3.isAbsolute(f.relPath) ? f.relPath : path3.join(this.kbRoot, f.relPath);
    const repoRoot = await this.resolveRepoRoot(absPath);
    const relInRepo = path3.relative(repoRoot, absPath);
    return new Promise((resolve2, reject) => {
      (0, import_node_child_process.execFile)(
        "git",
        ["diff", "--no-color", range, "--", relInRepo],
        { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            reject(err);
            return;
          }
          resolve2(stdout || "(no changes)");
        }
      );
    });
  }
  resolveRepoRoot(absPath) {
    return new Promise((resolve2, reject) => {
      (0, import_node_child_process.execFile)(
        "git",
        ["rev-parse", "--show-toplevel"],
        { cwd: path3.dirname(absPath) },
        (err, stdout) => {
          if (err) {
            reject(err);
            return;
          }
          resolve2(stdout.trim());
        }
      );
    });
  }
  renderDiffText(parent, text) {
    const lines = text.split("\n");
    for (const line of lines) {
      const cls = line.startsWith("+++") || line.startsWith("---") ? "diff-meta" : line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-del" : line.startsWith("@@") ? "diff-hunk" : "diff-ctx";
      parent.createDiv({ cls, text: line });
    }
  }
  async openSource(sourceFile) {
    if (!sourceFile || !this.kbRoot) {
      new import_obsidian3.Notice("Instrumentality: no source file for this entry.");
      return;
    }
    const abs = path3.isAbsolute(sourceFile) ? sourceFile : path3.join(this.kbRoot, sourceFile);
    await this.openPath(abs);
  }
  async openStandard(standardId) {
    if (!this.kbRoot)
      return;
    const filePath = (0, import_shared3.resolveStandardPath)(this.kbRoot, standardId);
    if (!filePath) {
      new import_obsidian3.Notice(`Instrumentality: standard '${standardId}' not found.`);
      return;
    }
    await this.openPath(filePath);
  }
  async editRule(standardId, ruleId) {
    if (!this.kbRoot)
      return;
    const filePath = (0, import_shared3.resolveStandardPath)(this.kbRoot, standardId);
    if (!filePath) {
      new import_obsidian3.Notice(`Instrumentality: standard '${standardId}' not found.`);
      return;
    }
    const range = (0, import_shared3.findRuleLineRange)(filePath, ruleId);
    await this.openPath(filePath, range?.start);
  }
  /**
   * Open via Obsidian when the file lives inside the vault (preferred — keeps
   * navigation, backlinks, and tabs working). Fall back to Electron's shell
   * for code files outside the vault.
   *
   * If `line` is given and the file opens inside the vault, position the
   * editor cursor on that line (0-indexed). Used by Edit Rule.
   */
  async openPath(absPath, line) {
    const vault = this.app.vault;
    const adapter = vault.adapter;
    const basePath = adapter.basePath ?? adapter.getBasePath?.();
    if (basePath && absPath.startsWith(basePath + path3.sep)) {
      const rel = absPath.slice(basePath.length + 1);
      const file = vault.getAbstractFileByPath(rel);
      if (file instanceof import_obsidian3.TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
        if (typeof line === "number" && line >= 0) {
          const view = leaf.view;
          if (view.editor) {
            const pos = { line, ch: 0 };
            view.editor.setCursor(pos);
            view.editor.scrollIntoView({ from: pos, to: pos }, true);
          }
        }
        return;
      }
    }
    try {
      const electron = window.require?.("electron");
      if (electron?.shell?.openPath) {
        const result = await electron.shell.openPath(absPath);
        if (result)
          new import_obsidian3.Notice(`Instrumentality: cannot open ${absPath}: ${result}`);
        return;
      }
    } catch {
    }
    new import_obsidian3.Notice(`Instrumentality: cannot open ${absPath} (not inside vault).`);
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
  // ── Activity (drift-log timeline) ──────────────────────────────────────
  renderActivityBody(parent) {
    const grid = parent.createDiv({ cls: "instrumentality-section-grid" });
    let events = this.status?.driftLogEvents ?? [];
    if (!this.showSystemEvents) {
      events = events.filter((e) => !e.isSystem);
    }
    if (events.length === 0) {
      const card = grid.createDiv({
        cls: "instrumentality-section-card",
        attr: { "data-section": "activity" }
      });
      const header = card.createEl("header");
      const h2 = header.createEl("h2");
      h2.createSpan({ text: "Activity" });
      h2.createSpan({ cls: "count", text: "0" });
      const body = card.createDiv({ cls: "body" });
      this.placeholder(
        body,
        "No drift-log events in the current + previous month."
      );
      return;
    }
    const groups = /* @__PURE__ */ new Map();
    for (const e of events) {
      let key;
      if (this.activityGroupBy === "queueKey")
        key = e.queueKey || e.kbTarget || e.kbFile || "(unattributed)";
      else if (this.activityGroupBy === "eventType")
        key = activityEventLabel(e.eventType);
      else
        key = e.date;
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    const sortedKeys = [...groups.keys()].sort(
      (a, b) => this.activityGroupBy === "date" ? a < b ? 1 : a > b ? -1 : 0 : a.localeCompare(b)
    );
    for (const k of sortedKeys) {
      const arr = groups.get(k);
      const card = grid.createDiv({
        cls: "instrumentality-section-card activity-group",
        attr: { "data-activity-group": k }
      });
      const header = card.createEl("header");
      const h2 = header.createEl("h2");
      h2.createSpan({ text: k });
      h2.createSpan({ cls: "count", text: String(arr.length) });
      const body = card.createDiv({ cls: "body" });
      for (const e of arr)
        this.renderActivityRow(body, e);
    }
  }
  renderActivityRow(parent, e) {
    const id = `${e.date}:${e.queueKey ?? e.kbTarget ?? e.kbFile ?? ""}:${e.eventType}`;
    const subject = e.queueKey ?? e.kbTarget ?? e.kbFile ?? "(unattributed)";
    const row = parent.createDiv({
      cls: "instrumentality-entry activity-entry",
      attr: {
        "data-entry-section": "activity",
        "data-entry-id": id,
        "data-entry-sev": "",
        "data-entry-text": `${subject} ${e.eventType} ${e.reason ?? ""}`.toLowerCase()
      }
    });
    const summary = row.createDiv({ cls: "entry-summary" });
    const summaryRow = summary.createDiv({ cls: "activity-summary" });
    summaryRow.createSpan({
      cls: `badge ${activityBadgeClass(e.eventType, e.isSystem)}`,
      text: activityEventLabel(e.eventType)
    });
    summaryRow.createSpan({ cls: "activity-subject", text: subject });
    summaryRow.createSpan({ cls: "activity-date", text: e.date });
    const line = summary.createDiv({ cls: "activity-line" });
    if (e.reason) {
      line.appendText(
        " \u2014 " + (e.reason.length > 100 ? e.reason.slice(0, 100) + "\u2026" : e.reason)
      );
    } else {
      line.createEl("em", { text: "(no reason recorded)" });
    }
    const detail = row.createDiv({ cls: "entry-detail" });
    const meta = detail.createDiv({ cls: "detail-meta" });
    const eventRow = meta.createDiv();
    eventRow.createEl("strong", { text: "Event: " });
    eventRow.createEl("code", { text: e.eventType });
    meta.createDiv({ text: `Date: ${e.date}` });
    if (e.queueKey) {
      const r = meta.createDiv();
      r.createEl("strong", { text: "Queue key: " });
      r.createEl("code", { text: e.queueKey });
    }
    if (e.kbTarget) {
      const r = meta.createDiv();
      r.createEl("strong", { text: "KB target: " });
      r.createEl("code", { text: e.kbTarget });
    }
    if (e.kbFile) {
      const r = meta.createDiv();
      r.createEl("strong", { text: "KB file: " });
      r.createEl("code", { text: e.kbFile });
    }
    if (e.files?.length) {
      const block = meta.createDiv();
      block.createEl("strong", { text: "Files:" });
      const ul = block.createEl("ul");
      for (const f of e.files)
        ul.createEl("li").createEl("code", { text: f });
    }
    if (e.originatingFiles?.length) {
      const block = meta.createDiv();
      block.createEl("strong", { text: "Originating files:" });
      const ul = block.createEl("ul");
      for (const f of e.originatingFiles)
        ul.createEl("li").createEl("code", { text: f });
    }
    if (e.reason) {
      const r = meta.createDiv();
      r.createEl("strong", { text: "Reason: " });
      r.appendText(e.reason);
    }
    if (e.note) {
      const r = meta.createDiv();
      r.createEl("strong", { text: "Note: " });
      r.appendText(e.note);
    }
    summary.addEventListener("click", () => row.toggleClass("open", !row.hasClass("open")));
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
var InstrumentalityPlugin = class extends import_obsidian4.Plugin {
  dismissedBanners = /* @__PURE__ */ new Set();
  openSection = void 0;
  submodulesCollapsed = false;
  async onload() {
    (0, import_obsidian4.addIcon)(ICON_ID, ICON_SVG);
    const data = await this.loadData();
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
      (leaf) => new InstrumentalityView(leaf, {
        getKbRoot: () => this.detectKbRoot(),
        getDismissedBanners: () => this.dismissedBanners,
        dismissBanner: (kind) => void this.persistDismissedBanner(kind),
        getOpenSection: () => this.openSection,
        setOpenSection: (key) => void this.persistOpenSection(key),
        getSubmodulesCollapsed: () => this.submodulesCollapsed,
        setSubmodulesCollapsed: (flag) => void this.persistSubmodulesCollapsed(flag)
      })
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
    const handleVaultEvent = (file) => {
      if (!(file instanceof import_obsidian4.TFile))
        return;
      if (file.extension !== "md")
        return;
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_INSTRUMENTALITY)) {
        leaf.view.notifySourceChanged();
      }
    };
    this.registerEvent(this.app.vault.on("modify", handleVaultEvent));
    this.registerEvent(this.app.vault.on("create", handleVaultEvent));
    this.registerEvent(this.app.vault.on("delete", handleVaultEvent));
  }
  async persistDismissedBanner(kind) {
    if (this.dismissedBanners.has(kind))
      return;
    this.dismissedBanners.add(kind);
    await this.persistAll();
  }
  async persistOpenSection(key) {
    if (this.openSection === key)
      return;
    this.openSection = key;
    await this.persistAll();
  }
  async persistSubmodulesCollapsed(flag) {
    if (this.submodulesCollapsed === flag)
      return;
    this.submodulesCollapsed = flag;
    await this.persistAll();
  }
  async persistAll() {
    await this.saveData({
      dismissedBanners: [...this.dismissedBanners],
      openSection: this.openSection,
      submodulesCollapsed: this.submodulesCollapsed
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
    return (0, import_shared4.findKbRoot)([basePath]);
  }
};
//# sourceMappingURL=main.js.map
