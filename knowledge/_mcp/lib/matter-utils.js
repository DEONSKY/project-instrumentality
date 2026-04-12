const matter = require('gray-matter')
const yaml = require('js-yaml')

/**
 * Wrapper around matter.stringify that preserves flow/inline style for arrays
 * and other scalar values (flowLevel: 1 → block keys, flow values).
 *
 * Default matter.stringify expands arrays to block style, e.g.:
 *   tags:
 *     - a
 *     - b
 * This wrapper keeps them inline:
 *   tags: [a, b]
 */
function matterStringify(content, data) {
  return matter.stringify(content, data, {
    engines: {
      yaml: {
        stringify: (obj) => yaml.dump(obj, { flowLevel: 1, lineWidth: -1 })
      }
    }
  })
}

module.exports = { matterStringify }
