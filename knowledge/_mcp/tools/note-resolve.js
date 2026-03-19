const { loadGraph, saveGraph } = require('../lib/graph')
const { runTool: reindex } = require('./reindex')

const KB_ROOT = 'knowledge'

// Only tool allowed to delete notes. Maintains "kb_reindex only writes _index.yaml" rule
// by calling reindex after modifying the in-memory graph.
async function runTool({ file_path, note_id } = {}) {
  if (!file_path) return { error: 'file_path is required' }
  if (!note_id) return { error: 'note_id is required' }

  const graph = loadGraph(KB_ROOT)

  const relPath = file_path.replace(/^knowledge\//, '')
  const fileEntry = (graph.files || {})[relPath]

  if (!fileEntry) {
    return { error: `File not found in index: ${file_path}` }
  }

  const notes = fileEntry.notes || []
  const noteIndex = notes.findIndex(n => n.id === note_id)

  if (noteIndex === -1) {
    return { error: `Note not found: ${note_id}` }
  }

  // Remove the note
  notes.splice(noteIndex, 1)
  fileEntry.notes = notes

  // If no notes remain, mark as synced
  if (notes.length === 0) {
    fileEntry.sync_state = 'synced'
    delete fileEntry.notes
  }

  // Write updated graph
  saveGraph(graph, KB_ROOT)

  // Run reindex to finalize
  const reindexResult = await reindex({ silent: true })

  return {
    resolved: true,
    remaining_notes: notes.length,
    sync_state: fileEntry.sync_state,
    reindex_result: reindexResult
  }
}

module.exports = { runTool }
