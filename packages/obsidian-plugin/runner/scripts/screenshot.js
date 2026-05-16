#!/usr/bin/env node
'use strict'

/**
 * Standalone CI screenshot script.
 * Reads _index.yaml, finds files with screenshot: true,
 * navigates to screenshot_selector URL, saves PNG to screenshot_path.
 *
 * Requires: playwright (npm install -g playwright or local install)
 * Usage: node knowledge/_mcp/scripts/screenshot.js
 */

const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const KB_ROOT = 'knowledge'
const INDEX_PATH = path.join(KB_ROOT, '_index.yaml')

async function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('[screenshot] No _index.yaml found. Run kb_reindex first.')
    process.exit(1)
  }

  let graph
  try {
    const raw = fs.readFileSync(INDEX_PATH, 'utf8')
    graph = yaml.load(raw) || {}
  } catch (e) {
    console.error('[screenshot] Failed to parse _index.yaml:', e.message)
    process.exit(1)
  }

  const files = graph.files || {}
  const targets = []

  Object.entries(files).forEach(([relPath, entry]) => {
    if (entry && entry.screenshot === true && entry.screenshot_selector && entry.screenshot_path) {
      targets.push({
        kb_path: relPath,
        url: entry.screenshot_selector,
        output: entry.screenshot_path
      })
    }
  })

  if (targets.length === 0) {
    console.log('[screenshot] No files with screenshot: true found.')
    process.exit(0)
  }

  console.log(`[screenshot] Found ${targets.length} screenshot target(s).`)

  let playwright
  try {
    playwright = require('playwright')
  } catch {
    console.error('[screenshot] playwright not installed. Run: npm install playwright')
    process.exit(1)
  }

  const browser = await playwright.chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  let succeeded = 0
  let failed = 0

  for (const target of targets) {
    try {
      console.log(`[screenshot] Capturing ${target.kb_path} → ${target.output}`)

      // Ensure output directory exists
      const outputDir = path.dirname(target.output)
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 })
      await page.screenshot({ path: target.output, fullPage: false })

      console.log(`[screenshot] ✓ Saved to ${target.output}`)
      succeeded++
    } catch (e) {
      console.error(`[screenshot] ✗ Failed ${target.kb_path}: ${e.message}`)
      failed++
    }
  }

  await browser.close()

  console.log(`\n[screenshot] Done. ${succeeded} succeeded, ${failed} failed.`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('[screenshot] Fatal:', e.message)
  process.exit(1)
})
