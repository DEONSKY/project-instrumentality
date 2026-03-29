const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

async function runTool({ command, dry_run = false, target_branch = 'main' } = {}) {
  if (!command) return { error: 'command is required. Valid: status, push, merge_plan' }

  switch (command) {
    case 'status': return handleStatus()
    case 'push': return handlePush(dry_run)
    case 'merge_plan': return handleMergePlan(target_branch)
    default: return { error: `Unknown command: ${command}. Valid: status, push, merge_plan` }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function gitExec(cmd, cwd = process.cwd()) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (e) {
    const stderr = e.stderr ? e.stderr.trim() : e.message
    throw new Error(stderr)
  }
}

function detectSubmodules() {
  const gitmodulesPath = path.join(process.cwd(), '.gitmodules')
  if (!fs.existsSync(gitmodulesPath)) return []

  const content = fs.readFileSync(gitmodulesPath, 'utf8')
  const submodules = []
  const blocks = content.split(/(?=\[submodule\s+"[^"]+"\])/).filter(b => b.trim())

  for (const block of blocks) {
    const nameMatch = block.match(/\[submodule\s+"([^"]+)"\]/)
    const pathMatch = block.match(/path\s*=\s*(.+)/)
    if (!nameMatch || !pathMatch) continue

    const name = nameMatch[1].trim()
    const subPath = pathMatch[1].trim()
    const fullPath = path.join(process.cwd(), subPath)
    const isShared = /kb-shared\s*=\s*true/.test(block)

    if (fs.existsSync(fullPath)) {
      submodules.push({ name, path: subPath, fullPath, isShared })
    }
  }
  return submodules
}

function getParentBranch() {
  try {
    const branch = gitExec('git symbolic-ref --short HEAD')
    return { branch, detached: false }
  } catch {
    return { branch: null, detached: true }
  }
}

function getSubmoduleBranch(fullPath) {
  try {
    return gitExec('git symbolic-ref --short HEAD', fullPath)
  } catch {
    return null
  }
}

function pointerChanged(subPath) {
  try {
    const upstreamRef = gitExec('git rev-parse @{upstream}')
    const localSha = gitExec(`git ls-tree HEAD "${subPath}"`)
      .split(/\s+/)[2] || ''
    const remoteSha = gitExec(`git ls-tree ${upstreamRef} "${subPath}"`)
      .split(/\s+/)[2] || ''
    return localSha !== remoteSha
  } catch {
    // No upstream or ls-tree failed — treat as changed
    return true
  }
}

// ── Commands ─────────────────────────────────────────────────────────────────

function handleStatus() {
  const parent = getParentBranch()
  const submodules = detectSubmodules()

  if (submodules.length === 0) {
    return { parent, submodules: [], message: 'No submodules detected' }
  }

  const entries = submodules.map(sub => ({
    name: sub.name,
    path: sub.path,
    branch: getSubmoduleBranch(sub.fullPath),
    type: sub.isShared ? 'shared' : 'owned',
    pointer_changed: pointerChanged(sub.path)
  }))

  return { parent, submodules: entries }
}

function handlePush(dryRun) {
  const parent = getParentBranch()
  if (parent.detached) {
    return { error: 'HEAD is detached — cannot determine branch for push' }
  }

  const submodules = detectSubmodules()
  const pushPlan = []
  const skipped = []
  let order = 1

  // Owned submodules first, then shared
  const owned = submodules.filter(s => !s.isShared)
  const shared = submodules.filter(s => s.isShared)

  for (const sub of [...owned, ...shared]) {
    if (!pointerChanged(sub.path)) {
      skipped.push({ path: sub.path, reason: 'pointer unchanged' })
      continue
    }

    const subBranch = sub.isShared
      ? getSubmoduleBranch(sub.fullPath) || parent.branch
      : parent.branch
    const type = sub.isShared ? 'shared' : 'owned'

    pushPlan.push({
      order: order++,
      path: sub.path,
      type,
      branch: subBranch,
      action: `push -u origin ${subBranch}`,
      fullPath: sub.fullPath
    })
  }

  // Parent is always last
  pushPlan.push({
    order: order,
    path: '.',
    type: 'parent',
    branch: parent.branch,
    action: 'push'
  })

  if (dryRun) {
    // Strip internal fields from dry-run output
    const plan = pushPlan.map(({ fullPath, ...rest }) => rest)
    return { dry_run: true, push_plan: plan, skipped }
  }

  // Execute pushes
  const results = []
  let allSuccess = true

  for (const entry of pushPlan) {
    if (entry.type === 'parent') {
      if (!allSuccess) {
        results.push({ order: entry.order, path: '.', type: 'parent', success: false, error: 'Skipped — submodule push failed' })
        break
      }
      try {
        gitExec('git push')
        results.push({ order: entry.order, path: '.', type: 'parent', success: true })
      } catch (e) {
        results.push({ order: entry.order, path: '.', type: 'parent', success: false, error: e.message })
        allSuccess = false
      }
    } else {
      try {
        gitExec(`git push -u origin ${entry.branch}`, entry.fullPath)
        results.push({ order: entry.order, path: entry.path, type: entry.type, branch: entry.branch, success: true })
      } catch (e) {
        results.push({ order: entry.order, path: entry.path, type: entry.type, branch: entry.branch, success: false, error: e.message })
        allSuccess = false
      }
    }
  }

  return { results, all_success: allSuccess }
}

function handleMergePlan(targetBranch) {
  const parent = getParentBranch()
  if (parent.detached) {
    return { error: 'HEAD is detached — cannot determine current branch' }
  }
  if (parent.branch === targetBranch) {
    return { error: `Already on ${targetBranch} — no merge needed` }
  }

  const submodules = detectSubmodules()
  const steps = []
  let order = 1
  const sharedNames = []

  for (const sub of submodules) {
    if (!pointerChanged(sub.path)) continue

    if (sub.isShared) {
      sharedNames.push(sub.name)
      continue
    }

    // Owned submodule: merge + push
    steps.push({ order: order++, action: 'merge', where: sub.path, from: parent.branch, to: targetBranch })
    steps.push({ order: order++, action: 'push', where: sub.path })
  }

  // Parent: submodule update, then merge + push
  if (steps.length > 0) {
    steps.push({ order: order++, action: 'submodule_update', where: 'parent' })
  }
  steps.push({ order: order++, action: 'merge', where: 'parent', from: parent.branch, to: targetBranch })
  steps.push({ order: order++, action: 'push', where: 'parent' })

  const result = {
    current_branch: parent.branch,
    target_branch: targetBranch,
    steps
  }

  if (sharedNames.length > 0) {
    result.shared_note = `Shared submodules (${sharedNames.join(', ')}) merge on their own schedule`
  }

  return result
}

module.exports = { runTool }
