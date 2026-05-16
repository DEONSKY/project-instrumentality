const STOP = new Set(['the','a','an','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should','may','might',
  'shall','can','need','to','of','in','for','on','with','at','by','from','as','into',
  'through','during','before','after','above','below','between','out','off','over',
  'under','again','further','then','once','when','where','why','how','all','each',
  'every','both','few','more','most','other','some','such','no','nor','not','only',
  'own','same','so','than','too','very','just','because','but','and','or','if','that',
  'this','it','its','i','we','you','they','he','she','what','which','who','whom'])

function extractKeywords(title, body) {
  const text = `${title || ''} ${body || ''}`.toLowerCase()
  const words = text.match(/[a-z0-9_-]{3,}/g) || []
  const freq = {}
  for (const w of words) {
    if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w)
}

module.exports = { extractKeywords }
