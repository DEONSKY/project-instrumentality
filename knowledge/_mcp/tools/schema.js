const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

const KB_ROOT = 'knowledge'

// ── DBML Parser ─────────────────────────────────────────────────────────────

/**
 * Parse DBML content from a markdown file (strips frontmatter first).
 * Returns { tables, enums, refs } where tables/enums are { name, content } arrays
 * and refs is an array of standalone Ref: strings.
 */
function parseDbml(fileContent) {
  const { content } = matter(fileContent)
  const lines = content.split('\n')

  const tables = []
  const enums = []
  const refs = []

  let current = null       // { type, name, lines }
  let braceDepth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    if (braceDepth === 0) {
      // Check for block start: Table, Enum, TableGroup
      const blockMatch = trimmed.match(/^(Table|Enum|TableGroup)\s+(\S+)/i)
      if (blockMatch && trimmed.includes('{')) {
        const blockType = blockMatch[1].toLowerCase()
        const name = blockMatch[2]
        current = { type: blockType, name, lines: [line] }
        braceDepth = countBraces(line)
        if (braceDepth === 0) {
          // Single-line block (unlikely but handle it)
          pushBlock(current, tables, enums)
          current = null
        }
        continue
      }

      // Standalone Ref: line
      if (/^Ref\s*:/i.test(trimmed)) {
        refs.push(trimmed)
        continue
      }
    } else {
      // Inside a block — accumulate lines
      current.lines.push(line)
      braceDepth += countBraces(line)

      if (braceDepth === 0) {
        pushBlock(current, tables, enums)
        current = null
      }
    }
  }

  return { tables, enums, refs }
}

function countBraces(line) {
  let depth = 0
  for (const ch of line) {
    if (ch === '{') depth++
    else if (ch === '}') depth--
  }
  return depth
}

function pushBlock(block, tables, enums) {
  const entry = { name: block.name, content: block.lines.join('\n') }
  if (block.type === 'table' || block.type === 'tablegroup') {
    tables.push(entry)
  } else if (block.type === 'enum') {
    enums.push(entry)
  }
}

// ── Filter functions ────────────────────────────────────────────────────────

/**
 * Filter tables by exact name match (case-insensitive).
 * Returns matching tables + refs that mention any matched table.
 */
function filterTablesByNames(parsed, names) {
  const lower = names.map(n => n.toLowerCase())
  const matched = parsed.tables.filter(t => lower.includes(t.name.toLowerCase()))
  const matchedNames = matched.map(t => t.name.toLowerCase())

  const relatedRefs = parsed.refs.filter(r => {
    const rl = r.toLowerCase()
    return matchedNames.some(n => rl.includes(n))
  })

  const relatedEnums = parsed.enums.filter(e => {
    const el = e.content.toLowerCase()
    return matchedNames.some(n => el.includes(n))
  })

  return { tables: matched, enums: relatedEnums, refs: relatedRefs }
}

/**
 * Filter tables by keyword scoring.
 * Returns tables sorted by relevance, plus related enums and refs.
 */
function filterTablesByKeywords(parsed, keywords) {
  const kwList = Array.isArray(keywords) ? keywords : [keywords]
  const kwLower = kwList.map(k => k.toLowerCase())

  const scored = parsed.tables.map(t => {
    const searchText = (t.name + ' ' + t.content).toLowerCase()
    const score = kwLower.reduce((s, kw) => s + (searchText.includes(kw) ? 1 : 0), 0)
    return { ...t, score }
  }).filter(t => t.score > 0)

  scored.sort((a, b) => b.score - a.score)

  const matchedNames = scored.map(t => t.name.toLowerCase())

  const relatedRefs = parsed.refs.filter(r => {
    const rl = r.toLowerCase()
    return matchedNames.some(n => rl.includes(n))
  })

  const relatedEnums = parsed.enums.filter(e => {
    const el = (e.name + ' ' + e.content).toLowerCase()
    return kwLower.some(kw => el.includes(kw)) ||
      matchedNames.some(n => el.includes(n))
  })

  // Strip score from output
  const tables = scored.map(({ score, ...rest }) => rest)
  return { tables, enums: relatedEnums, refs: relatedRefs }
}

// ── File resolution ─────────────────────────────────────────────────────────

function resolveSchemaPath(file) {
  if (!file) return null

  // Full path: knowledge/data/schema/postgres.md
  if (file.startsWith('knowledge/')) {
    return fs.existsSync(file) ? file : null
  }

  // Relative path: data/schema/postgres.md
  const asRelative = path.join(KB_ROOT, file)
  if (fs.existsSync(asRelative)) return asRelative

  // Bare name: postgres → knowledge/data/schema/postgres.md
  const asBare = path.join(KB_ROOT, 'data/schema', `${file}.md`)
  if (fs.existsSync(asBare)) return asBare

  return null
}

// ── Tool commands ───────────────────────────────────────────────────────────

async function runTool({ command, file, entities, keywords } = {}) {
  if (!command) return { error: 'command is required. Valid: query, list' }

  switch (command) {
    case 'query': return handleQuery(file, entities, keywords)
    case 'list': return handleList(file)
    default: return { error: `Unknown command: ${command}. Valid: query, list` }
  }
}

function handleList(file) {
  const resolved = resolveSchemaPath(file)
  if (!resolved) return { error: `Schema file not found: ${file}` }

  const content = fs.readFileSync(resolved, 'utf8')
  const parsed = parseDbml(content)

  return {
    file: resolved,
    tables: parsed.tables.map(t => t.name),
    enums: parsed.enums.map(e => e.name),
    refs_count: parsed.refs.length
  }
}

function handleQuery(file, entities, keywords) {
  const resolved = resolveSchemaPath(file)
  if (!resolved) return { error: `Schema file not found: ${file}` }

  const content = fs.readFileSync(resolved, 'utf8')
  const parsed = parseDbml(content)

  if (parsed.tables.length === 0) {
    // Old per-entity format or non-DBML content — return full body
    const { content: body } = matter(content)
    return { file: resolved, tables: [], enums: [], refs: [], raw: body.trim() }
  }

  let result
  if (entities && entities.length > 0) {
    result = filterTablesByNames(parsed, entities)
  } else if (keywords) {
    result = filterTablesByKeywords(parsed, keywords)
  } else {
    result = parsed
  }

  return {
    file: resolved,
    tables: result.tables.map(t => ({ name: t.name, content: t.content })),
    enums: result.enums.map(e => ({ name: e.name, content: e.content })),
    refs: result.refs
  }
}

module.exports = {
  runTool,
  parseDbml,
  filterTablesByNames,
  filterTablesByKeywords,
  definition: {
    name: 'kb_schema',
    description: 'Query database schema files (DBML format) with table-level extraction. Returns only relevant table/enum definitions.',
    inputSchema: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', enum: ['query', 'list'], description: 'query: extract table definitions. list: list all tables and enums.' },
        file: { type: 'string', description: 'Schema file path or bare name (e.g. "postgres" or "data/schema/postgres.md")' },
        entities: { type: 'array', items: { type: 'string' }, description: 'Table names to extract (exact match)' },
        keywords: { description: 'Keywords for relevance-scored table extraction', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }
      }
    }
  }
}
