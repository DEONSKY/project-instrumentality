const matter = require('gray-matter')
const yaml = require('js-yaml')

function isScalarArray(arr) {
  return arr.every((item) => item === null || typeof item !== 'object')
}

// Replace scalar-only arrays with placeholder strings so yaml.dump renders the
// rest of the tree in block style. After dumping, substitute placeholders back
// with inline flow notation.  Object arrays (e.g. rules) stay as plain Arrays
// and get block sequences automatically.
function encodePlaceholders(val, map, counter) {
  if (Array.isArray(val)) {
    if (isScalarArray(val)) {
      const key = `SaPlaceholder${counter.n++}End`
      map.set(key, yaml.dump(val, { flowLevel: 0, lineWidth: -1 }).trim())
      return key
    }
    return val.map((item) => encodePlaceholders(item, map, counter))
  }
  if (val && typeof val === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(val)) {
      out[k] = encodePlaceholders(v, map, counter)
    }
    return out
  }
  return val
}

function matterStringify(content, data) {
  const map = new Map()
  const counter = { n: 0 }
  const encoded = encodePlaceholders(data, map, counter)

  return matter.stringify(content, encoded, {
    engines: {
      yaml: {
        stringify: (obj) => {
          let str = yaml.dump(obj, { lineWidth: -1 })
          for (const [key, flow] of map) {
            str = str.replace(key, flow)
          }
          return str
        }
      }
    }
  })
}

module.exports = { matterStringify }
