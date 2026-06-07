import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { Prompt, PromptTree } from '../types'

export interface UserRecord {
  id: string
  name: string
  email: string
  passwordHash: string
  salt: string
  color: string
}

export interface VersionSnapshot {
  id: string
  promptId: string
  body: string
  userId: string
  userName: string
  reason: 'auto-save' | 'run' | 'fork' | 'promote'
  createdAt: string
}

export interface ArchivedTree {
  tree: PromptTree
  archivedAt: string
  archivedBy: string
  permanentDeleteAt: string
}

interface AppState {
  users: UserRecord[]
  promptTrees: PromptTree[]
  archivedTrees: ArchivedTree[]
  versions: Record<string, VersionSnapshot[]>
}

declare global {
  // eslint-disable-next-line no-var
  var __appState: AppState | undefined
}

const STATE_FILE = path.join(process.cwd(), 'state.json')
const SEEDS_FILE = path.join(process.cwd(), 'data', 'seed_prompts.json')

function loadState(): AppState {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as AppState
    } catch {
      // fall through to seed
    }
  }

  const seedData = JSON.parse(fs.readFileSync(SEEDS_FILE, 'utf-8'))
  const now = new Date().toISOString()
  const promptTrees: PromptTree[] = seedData.prompts.map((p: Prompt) => ({
    root: { ...p, createdAt: now, createdBy: 'system' },
    variants: [{ ...p, createdAt: now, createdBy: 'system' }],
    mainId: p.id,
  }))

  return { users: [], promptTrees, archivedTrees: [], versions: {} }
}

function getState(): AppState {
  if (!global.__appState) {
    global.__appState = loadState()
  }
  return global.__appState!
}

function saveState(): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(global.__appState!, null, 2))
  } catch (err) {
    console.error('Failed to save state:', err)
  }
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`
}

// ── Users ──────────────────────────────────────────────────────────────────

const USER_COLORS = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#9c27b0', '#ff9800', '#00bcd4', '#e91e63']

export function createUser(name: string, email: string, password: string): UserRecord {
  const state = getState()
  if (state.users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Email already in use')
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = crypto.createHash('sha256').update(password + salt).digest('hex')

  const user: UserRecord = {
    id: randomId('u'),
    name,
    email: email.toLowerCase(),
    passwordHash,
    salt,
    color: USER_COLORS[state.users.length % USER_COLORS.length],
  }

  state.users.push(user)
  saveState()
  return user
}

export function verifyUser(email: string, password: string): UserRecord | null {
  const state = getState()
  const user = state.users.find((u) => u.email === email.toLowerCase())
  if (!user) return null
  const hash = crypto.createHash('sha256').update(password + user.salt).digest('hex')
  return hash === user.passwordHash ? user : null
}

export function getUserById(id: string): UserRecord | null {
  return getState().users.find((u) => u.id === id) ?? null
}

// ── Prompt trees ───────────────────────────────────────────────────────────

export function getAllTrees(): PromptTree[] {
  return getState().promptTrees
}

export function getTreeByVariantId(variantId: string): PromptTree | null {
  return (
    getState().promptTrees.find((t) => t.variants.some((v) => v.id === variantId)) ?? null
  )
}

export function createTree(title: string, body: string, userId: string): PromptTree {
  const state = getState()
  const id = randomId('p')
  const now = new Date().toISOString()
  const root: Prompt = { id, title, body, parentId: null, createdAt: now, createdBy: userId }
  const tree: PromptTree = { root, variants: [root], mainId: id }
  state.promptTrees.push(tree)
  saveState()
  return tree
}

export function updatePrompt(
  promptId: string,
  patch: Partial<Pick<Prompt, 'body' | 'title'>>,
): PromptTree | null {
  const state = getState()
  const tree = state.promptTrees.find((t) => t.variants.some((v) => v.id === promptId))
  if (!tree) return null

  const variant = tree.variants.find((v) => v.id === promptId)!
  Object.assign(variant, patch)
  if (tree.root.id === promptId) Object.assign(tree.root, patch)
  saveState()
  return tree
}

export function forkPrompt(parentId: string, userId: string): { variant: Prompt; tree: PromptTree } | null {
  const state = getState()
  const tree = state.promptTrees.find((t) => t.variants.some((v) => v.id === parentId))
  if (!tree) return null

  const parent = tree.variants.find((v) => v.id === parentId)!
  const id = randomId('p')
  const now = new Date().toISOString()

  const fork: Prompt = {
    id,
    title: `${parent.title} (fork)`,
    body: parent.body,
    parentId,
    createdAt: now,
    createdBy: userId,
  }

  tree.variants.push(fork)
  saveState()
  return { variant: fork, tree }
}

export function promoteVariant(variantId: string): PromptTree | null {
  const state = getState()
  const tree = state.promptTrees.find((t) => t.variants.some((v) => v.id === variantId))
  if (!tree) return null
  tree.mainId = variantId
  saveState()
  return tree
}

export function archiveTree(rootId: string, userId: string): PromptTree | null {
  const state = getState()
  const idx = state.promptTrees.findIndex((t) => t.root.id === rootId)
  if (idx === -1) return null

  const [tree] = state.promptTrees.splice(idx, 1)
  const now = new Date()
  state.archivedTrees.push({
    tree,
    archivedAt: now.toISOString(),
    archivedBy: userId,
    permanentDeleteAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })
  saveState()
  return tree
}

export function restoreTree(rootId: string): PromptTree | null {
  const state = getState()
  const idx = state.archivedTrees.findIndex((a) => a.tree.root.id === rootId)
  if (idx === -1) return null

  const [{ tree }] = state.archivedTrees.splice(idx, 1)
  state.promptTrees.push(tree)
  saveState()
  return tree
}

export function getArchivedTrees(): ArchivedTree[] {
  const state = getState()
  const now = new Date()
  const before = state.archivedTrees.length
  state.archivedTrees = state.archivedTrees.filter(
    (a) => new Date(a.permanentDeleteAt) > now,
  )
  if (state.archivedTrees.length !== before) saveState()
  return state.archivedTrees
}

// ── Version snapshots ──────────────────────────────────────────────────────

export function addVersion(snapshot: Omit<VersionSnapshot, 'id'>): VersionSnapshot {
  const state = getState()
  const version: VersionSnapshot = { id: randomId('v'), ...snapshot }
  if (!state.versions[snapshot.promptId]) state.versions[snapshot.promptId] = []
  state.versions[snapshot.promptId].unshift(version)
  if (state.versions[snapshot.promptId].length > 50) {
    state.versions[snapshot.promptId] = state.versions[snapshot.promptId].slice(0, 50)
  }
  saveState()
  return version
}

export function getVersions(promptId: string): VersionSnapshot[] {
  return getState().versions[promptId] ?? []
}
