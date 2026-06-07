'use client'
import { use, Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { PromptTree, Prompt, TestInput } from '../../../types'
import type { VersionSnapshot } from '../../../lib/store'

interface LocalUser { id: string; name: string; color: string }

// ── Diff helper ────────────────────────────────────────────────────────────

function applyTextDiff(ytext: Y.Text, ydoc: Y.Doc, oldText: string, newText: string) {
  let start = 0
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start++
  let oldEnd = oldText.length
  let newEnd = newText.length
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) { oldEnd--; newEnd-- }
  ydoc.transact(() => {
    if (oldEnd > start) ytext.delete(start, oldEnd - start)
    if (newEnd > start) ytext.insert(start, newText.slice(start, newEnd))
  })
}

// ── Yjs hook ───────────────────────────────────────────────────────────────

function useYjsEditor(
  promptId: string | null,
  initialBody: string,
  user: LocalUser | null,
  onSnapshot?: (body: string) => void,
) {
  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)
  const ytextRef = useRef<Y.Text | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isLocalChange = useRef(false)
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [presence, setPresence] = useState<{ id: string; name: string; color: string; cursor: number }[]>([])

  useEffect(() => {
    if (!promptId || !user || typeof window === 'undefined') return

    const ydoc = new Y.Doc()
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsBase = `${wsProtocol}//${window.location.host}/ws`
    const provider = new WebsocketProvider(wsBase, `prompt:${promptId}`, ydoc)
    const ytext = ydoc.getText('body')

    ydocRef.current = ydoc
    providerRef.current = provider
    ytextRef.current = ytext

    provider.awareness.setLocalStateField('user', { id: user.id, name: user.name, color: user.color, cursor: 0 })

    const handleObserve = () => {
      const newBody = ytext.toString()

      // Update textarea on remote changes
      if (!isLocalChange.current) {
        const textarea = textareaRef.current
        if (textarea) {
          const start = textarea.selectionStart
          const end = textarea.selectionEnd
          textarea.value = newBody
          textarea.selectionStart = Math.min(start, newBody.length)
          textarea.selectionEnd = Math.min(end, newBody.length)
        }
      }

      // Debounced snapshot: schedule a save 90s after last edit
      if (onSnapshot) {
        if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
        snapshotTimer.current = setTimeout(() => { onSnapshot(newBody) }, 90_000)
      }
    }
    ytext.observe(handleObserve)

    provider.awareness.on('change', () => {
      const states: typeof presence = []
      provider.awareness.getStates().forEach((state: { user?: typeof presence[0] }, clientId: number) => {
        if (clientId !== provider.awareness.clientID && state.user) states.push(state.user)
      })
      setPresence(states)
    })

    provider.on('sync', (synced: boolean) => {
      if (!synced) return
      if (ytext.length === 0 && initialBody) {
        ydoc.transact(() => { ytext.insert(0, initialBody) })
      } else if (textareaRef.current) {
        textareaRef.current.value = ytext.toString()
      }
    })

    return () => {
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
      ytext.unobserve(handleObserve)
      provider.destroy()
      ydoc.destroy()
      ydocRef.current = null
      providerRef.current = null
      ytextRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId, user?.id])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!ytextRef.current || !ydocRef.current) return
    isLocalChange.current = true
    applyTextDiff(ytextRef.current, ydocRef.current, ytextRef.current.toString(), e.target.value)
    isLocalChange.current = false
    providerRef.current?.awareness.setLocalStateField('user', {
      ...providerRef.current.awareness.getLocalState()?.user,
      cursor: e.target.selectionStart,
    })
  }, [])

  const getCurrentBody = useCallback(() => ytextRef.current?.toString() ?? '', [])

  return { textareaRef, presence, handleChange, getCurrentBody, ytextRef }
}

// ── CopyBtn ────────────────────────────────────────────────────────────────

function CopyBtn({ text, label = 'Copy', style: s }: { text: string; label?: string; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button className="btn btn-ghost btn-sm" onClick={copy} style={{ fontSize: 12, ...s }}>
      {copied ? '✓' : label}
    </button>
  )
}

// ── VariantSidebar ─────────────────────────────────────────────────────────

function VariantSidebar({
  tree, currentId, onNavigate, onFork, getCurrentBody,
}: {
  tree: PromptTree
  currentId: string
  onNavigate: (id: string) => void
  onFork: () => void
  getCurrentBody: () => string
}) {
  function renderNode(id: string, depth: number): React.ReactNode {
    const v = tree.variants.find((x) => x.id === id)
    if (!v) return null
    const isActive = id === currentId
    const isMain = id === tree.mainId
    const children = tree.variants.filter((x) => x.parentId === id)
    // For the active variant, get live body from Yjs; for others use stored body
    const bodyToCopy = isActive ? getCurrentBody() || v.body : v.body
    return (
      <div key={id}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingRight: 4 }}>
          <button
            onClick={() => onNavigate(id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left',
              padding: `5px 4px 5px ${8 + depth * 14}px`, borderRadius: 4, fontSize: 13,
              background: isActive ? 'var(--blue-light)' : 'transparent',
              color: isActive ? 'var(--blue)' : 'var(--grey-900)', fontWeight: isActive ? 600 : 400, minWidth: 0,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: isMain ? 'var(--green)' : 'var(--grey-400)' }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</span>
            {isMain && <span className="badge badge-main" style={{ fontSize: 10, flexShrink: 0 }}>main</span>}
          </button>
          <CopyBtn text={bodyToCopy} label="⎘" style={{ padding: '3px 5px', flexShrink: 0, opacity: 0.6 }} />
        </div>
        {children.map((c) => renderNode(c.id, depth + 1))}
      </div>
    )
  }
  return (
    <div style={{ width: 230, flexShrink: 0, borderRight: '1px solid var(--grey-300)', padding: '12px 6px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--grey-500)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 8px', marginBottom: 4 }}>
        Variants
      </div>
      {renderNode(tree.root.id, 0)}
      <button className="btn btn-ghost btn-sm" onClick={onFork} style={{ marginTop: 10, justifyContent: 'center', fontSize: 12 }}>
        + Fork current
      </button>
    </div>
  )
}

// ── RunPanel ───────────────────────────────────────────────────────────────

function RunPanel({
  tree, user, testInputs, onPromote, onClose,
}: {
  tree: PromptTree
  user: LocalUser
  testInputs: TestInput[]
  onPromote: (variantId: string) => void
  onClose: () => void
}) {
  const [selectedInput, setSelectedInput] = useState(testInputs[0]?.id ?? '')
  const [runResults, setRunResults] = useState<Record<string, { output: string; status: string; durationMs?: number; error?: string }>>({})
  const [running, setRunning] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  const handleRun = async () => {
    if (!selectedInput || running) return
    setRunning(true)
    setRunResults({})
    esRef.current?.close()

    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: JSON.stringify({ promptTreeRootId: tree.root.id, inputId: selectedInput }),
    })
    if (!res.ok) { setRunning(false); return }
    const { sessionId } = await res.json()

    const es = new EventSource(`/api/run/stream?sessionId=${sessionId}`)
    esRef.current = es
    es.onmessage = (e) => {
      const evt = JSON.parse(e.data)
      if (evt.type === 'chunk') {
        setRunResults((prev) => ({
          ...prev,
          [evt.variantId]: { ...prev[evt.variantId], output: (prev[evt.variantId]?.output ?? '') + evt.text, status: 'streaming' },
        }))
      } else if (evt.type === 'complete') {
        setRunResults((prev) => ({ ...prev, [evt.variantId]: { ...prev[evt.variantId], status: 'complete', durationMs: evt.durationMs } }))
      } else if (evt.type === 'error') {
        setRunResults((prev) => ({ ...prev, [evt.variantId]: { ...prev[evt.variantId], status: 'error', error: evt.error } }))
      } else if (evt.type === 'all_complete') {
        setRunning(false); es.close()
      }
    }
    es.onerror = () => { setRunning(false); es.close() }
  }

  useEffect(() => () => esRef.current?.close(), [])

  const allDone = !running && tree.variants.every((v) => runResults[v.id]?.status === 'complete' || runResults[v.id]?.status === 'error')

  return (
    <div style={{ borderTop: '2px solid var(--blue)', background: 'var(--grey-100)', display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 400, flexShrink: 0 }}>
      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--white)', borderBottom: '1px solid var(--grey-300)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Run variants</span>
        <select className="form-input" value={selectedInput} onChange={(e) => setSelectedInput(e.target.value)} style={{ width: 240, padding: '4px 8px', fontSize: 13 }}>
          {testInputs.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleRun}
          disabled={running || !selectedInput}
          style={{ minWidth: 90 }}
        >
          {running ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Running…
            </span>
          ) : 'Run all'}
        </button>
        {allDone && Object.keys(runResults).length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ All complete</span>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
      </div>

      {/* Output columns */}
      <div style={{ display: 'flex', gap: 0, flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
        {tree.variants.map((v, idx) => {
          const result = runResults[v.id]
          const isStreaming = result?.status === 'streaming'
          const isDone = result?.status === 'complete'
          const isError = result?.status === 'error'
          return (
            <div
              key={v.id}
              style={{
                flex: '1 1 0', minWidth: 220, display: 'flex', flexDirection: 'column',
                borderRight: idx < tree.variants.length - 1 ? '1px solid var(--grey-300)' : 'none',
              }}
            >
              {/* Column header */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--grey-300)', background: isStreaming ? '#fff8e1' : isDone ? '#e6f4ea' : 'var(--white)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{v.title}</span>
                {tree.mainId === v.id && <span className="badge badge-main" style={{ fontSize: 10 }}>main</span>}
                {isStreaming && <span style={{ fontSize: 11, color: '#f57c00' }}>streaming…</span>}
                {isDone && result.durationMs && <span style={{ fontSize: 11, color: 'var(--grey-500)' }}>{(result.durationMs / 1000).toFixed(1)}s</span>}
              </div>

              {/* Output body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', fontSize: 13, lineHeight: 1.6, color: 'var(--grey-900)' }}>
                {isError ? (
                  <span style={{ color: 'var(--red)' }}>⚠ {result.error}</span>
                ) : result?.output ? (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{result.output}{isStreaming ? '▌' : ''}</span>
                ) : (
                  <span style={{ color: 'var(--grey-400)' }}>{running ? 'Waiting…' : 'Not run yet'}</span>
                )}
              </div>

              {/* Column actions */}
              {isDone && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--grey-300)', display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => onPromote(v.id)}
                    style={{ background: '#e6f4ea', color: 'var(--green)', fontSize: 12, flex: 1, justifyContent: 'center' }}
                  >
                    Promote as winner
                  </button>
                  <CopyBtn text={v.body} label="⎘ Prompt" style={{ fontSize: 12 }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── HistoryDrawer ──────────────────────────────────────────────────────────

function HistoryDrawer({ promptId, onClose, onRestore }: { promptId: string; onClose: () => void; onRestore: (body: string) => void }) {
  const [versions, setVersions] = useState<VersionSnapshot[]>([])
  const [selected, setSelected] = useState<VersionSnapshot | null>(null)

  useEffect(() => {
    fetch(`/api/versions/${promptId}`).then((r) => r.json()).then(setVersions)
  }, [promptId])

  const reasonLabel: Record<string, string> = { 'auto-save': 'Auto-saved', run: 'Before run', fork: 'Before fork', promote: 'Promoted' }

  return (
    <div style={{ position: 'fixed', inset: '0 0 0 auto', width: 340, background: 'var(--white)', borderLeft: '1px solid var(--grey-300)', zIndex: 50, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 16px rgba(0,0,0,.1)' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--grey-300)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Version history</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
        {versions.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--grey-500)', fontSize: 13 }}>No versions saved yet</div>
        )}
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => setSelected(selected?.id === v.id ? null : v)}
            style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 6, background: selected?.id === v.id ? 'var(--blue-light)' : 'transparent', marginBottom: 2 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{reasonLabel[v.reason] ?? v.reason}</span>
              <span style={{ fontSize: 11, color: 'var(--grey-500)' }}>{new Date(v.createdAt).toLocaleTimeString()}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--grey-500)', marginTop: 2 }}>
              {v.userName} · {new Date(v.createdAt).toLocaleDateString()}
            </div>
            {selected?.id === v.id && (
              <div style={{ marginTop: 8, fontSize: 12, background: 'var(--grey-100)', padding: '8px 10px', borderRadius: 4, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto', color: 'var(--grey-700)' }}>
                {v.body.slice(0, 280)}{v.body.length > 280 ? '…' : ''}
              </div>
            )}
          </button>
        ))}
      </div>
      {selected && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--grey-300)', display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { onRestore(selected.body); onClose() }}>
            Restore this version
          </button>
          <CopyBtn text={selected.body} label="Copy" />
        </div>
      )}
    </div>
  )
}

// ── ForkPane ───────────────────────────────────────────────────────────────

function ForkPane({ variant, user, onClose, onNavigate }: { variant: Prompt; user: LocalUser; onClose: () => void; onNavigate: (id: string) => void }) {
  const { textareaRef, presence, handleChange, getCurrentBody } = useYjsEditor(variant.id, variant.body, user)
  return (
    <div style={{ width: 380, flexShrink: 0, borderLeft: '1px solid var(--grey-300)', display: 'flex', flexDirection: 'column', background: 'var(--grey-100)' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--grey-300)', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--white)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{variant.title}</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {presence.map((p) => (
            <div key={p.id} title={p.name} style={{ width: 22, height: 22, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 600 }}>
              {p.name[0]?.toUpperCase()}
            </div>
          ))}
        </div>
        <CopyBtn text={getCurrentBody() || variant.body} label="⎘" style={{ padding: '3px 7px' }} />
        <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={() => onNavigate(variant.id)}>Open full</button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>
      <textarea
        ref={textareaRef}
        defaultValue={variant.body}
        onChange={handleChange}
        style={{ flex: 1, padding: 16, border: 'none', resize: 'none', fontSize: 14, lineHeight: 1.7, outline: 'none', background: 'transparent', fontFamily: 'var(--font)' }}
      />
    </div>
  )
}

// ── Main editor ────────────────────────────────────────────────────────────

function EditorContent({ id }: { id: string }) {
  const router = useRouter()
  const [user, setUser] = useState<LocalUser | null>(null)
  const [tree, setTree] = useState<PromptTree | null>(null)
  const [currentVariant, setCurrentVariant] = useState<Prompt | null>(null)
  const [forkVariant, setForkVariant] = useState<Prompt | null>(null)
  const [testInputs, setTestInputs] = useState<TestInput[]>([])
  const [showRunPanel, setShowRunPanel] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const sseRef = useRef<EventSource | null>(null)
  const userRef = useRef<LocalUser | null>(null)
  const variantRef = useRef<Prompt | null>(null)

  // Called by Yjs debounce — saves body to store + creates snapshot
  const handleSnapshot = useCallback(async (body: string) => {
    const u = userRef.current
    const v = variantRef.current
    if (!u || !v || !body) return
    await Promise.all([
      fetch(`/api/prompts/${v.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': u.id },
        body: JSON.stringify({ body }),
      }),
      fetch('/api/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': u.id },
        body: JSON.stringify({ promptId: v.id, body, reason: 'auto-save' }),
      }),
    ])
  }, [])

  const { textareaRef, presence, handleChange, getCurrentBody } = useYjsEditor(
    currentVariant?.id ?? null,
    currentVariant?.body ?? '',
    user,
    handleSnapshot,
  )

  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { variantRef.current = currentVariant }, [currentVariant])

  useEffect(() => {
    const raw = localStorage.getItem('workshop_user')
    if (!raw) { router.push('/login'); return }
    setUser(JSON.parse(raw))
  }, [router])

  const loadTree = useCallback(async () => {
    const res = await fetch(`/api/prompts/${id}`)
    if (!res.ok) { router.push('/dashboard'); return }
    const { tree: t } = await res.json()
    setTree(t)
    const variant = t.variants.find((v: Prompt) => v.id === id) ?? t.root
    setCurrentVariant(variant)
    setTitleValue(variant.title)
  }, [id, router])

  useEffect(() => {
    loadTree()
    fetch('/api/inputs').then((r) => r.json()).then(setTestInputs)
  }, [loadTree])

  useEffect(() => {
    const es = new EventSource('/api/events/stream')
    sseRef.current = es
    es.onmessage = (e) => {
      const evt = JSON.parse(e.data)
      if (evt.type === 'variant_promoted' || evt.type === 'variant_forked' || evt.type === 'tree_updated') loadTree()
    }
    return () => es.close()
  }, [loadTree])

  // Save body before page unload
  useEffect(() => {
    const saveBeforeLeave = () => {
      const body = getCurrentBody()
      const u = userRef.current
      const v = variantRef.current
      if (!body || !u || !v) return
      // Best-effort sync save (sendBeacon is fire-and-forget)
      navigator.sendBeacon?.(`/api/prompts/${v.id}`, new Blob([JSON.stringify({ body })], { type: 'application/json' }))
    }
    window.addEventListener('beforeunload', saveBeforeLeave)
    return () => window.removeEventListener('beforeunload', saveBeforeLeave)
  }, [getCurrentBody])

  const saveSnapshot = useCallback(async (reason: 'run' | 'fork' | 'promote') => {
    const body = getCurrentBody()
    const u = userRef.current
    const v = variantRef.current
    if (!u || !v || !body) return
    await Promise.all([
      fetch(`/api/prompts/${v.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': u.id },
        body: JSON.stringify({ body }),
      }),
      fetch('/api/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': u.id },
        body: JSON.stringify({ promptId: v.id, body, reason }),
      }),
    ])
  }, [getCurrentBody])

  const handleFork = async () => {
    if (!user || !currentVariant) return
    await saveSnapshot('fork')
    const res = await fetch(`/api/prompts/${currentVariant.id}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
    })
    const data = await res.json()
    await loadTree()
    setForkVariant(data.variant)
  }

  const handlePromote = async (variantId?: string) => {
    if (!user || !currentVariant) return
    const targetId = variantId ?? currentVariant.id
    const body = getCurrentBody()
    const firstWords = body.split(/\s+/).slice(0, 6).join(' ')
    const aiTitle = `${firstWords}… (promoted ${new Date().toLocaleDateString()})`
    await saveSnapshot('promote')
    await fetch(`/api/prompts/${targetId}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: JSON.stringify({ aiTitle }),
    })
    loadTree()
  }

  const handleTitleSave = async () => {
    if (!user || !currentVariant || !titleValue.trim()) { setEditingTitle(false); return }
    setEditingTitle(false)
    await fetch(`/api/prompts/${currentVariant.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: JSON.stringify({ title: titleValue }),
    })
    loadTree()
  }

  const handleRestore = (body: string) => {
    const ta = textareaRef.current
    if (!ta) return
    ta.value = body
    handleChange({ target: { value: body, selectionStart: body.length } } as React.ChangeEvent<HTMLTextAreaElement>)
  }

  // Save body then navigate (client-side routing doesn't fire beforeunload)
  const saveAndGo = useCallback(async (path: string) => {
    const body = getCurrentBody()
    const u = userRef.current
    const v = variantRef.current
    if (body && u && v) {
      await fetch(`/api/prompts/${v.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': u.id },
        body: JSON.stringify({ body }),
      })
    }
    router.push(path)
  }, [getCurrentBody, router])

  if (!tree || !currentVariant || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--grey-500)', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--grey-300)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        Loading…
      </div>
    )
  }

  const isMain = tree.mainId === currentVariant.id

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--white)' }}>
      {/* ── Toolbar ── */}
      <div style={{ height: 52, borderBottom: '1px solid var(--grey-300)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => saveAndGo('/dashboard')} style={{ fontSize: 18, padding: '4px 8px' }}>←</button>

        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') setEditingTitle(false) }}
            style={{ fontSize: 15, fontWeight: 600, border: 'none', borderBottom: '2px solid var(--blue)', outline: 'none', padding: '2px 4px', minWidth: 180 }}
            autoFocus
          />
        ) : (
          <button onClick={() => setEditingTitle(true)} className="btn btn-ghost" style={{ fontSize: 15, fontWeight: 600, padding: '2px 6px' }}>
            {currentVariant.title}
          </button>
        )}

        {isMain && <span className="badge badge-main">main</span>}

        <div style={{ flex: 1 }} />

        {/* Presence */}
        {presence.map((p) => (
          <div key={p.id} title={`${p.name} · cursor ${p.cursor}`} style={{ width: 26, height: 26, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 700, border: '2px solid var(--white)', boxShadow: '0 0 0 1px ' + p.color }}>
            {p.name[0]?.toUpperCase()}
          </div>
        ))}

        {presence.length > 0 && <div style={{ width: 1, height: 20, background: 'var(--grey-300)' }} />}

        <button className="btn btn-ghost btn-sm" onClick={handleFork}>Fork</button>
        <button className="btn btn-ghost btn-sm" onClick={() => handlePromote()} disabled={isMain} title={isMain ? 'Already main' : 'Promote to main'}>
          {isMain ? '✓ Main' : 'Promote'}
        </button>
        <button
          className={`btn btn-sm ${showRunPanel ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setShowRunPanel((v) => !v)}
        >
          Run
        </button>
        <CopyBtn text={getCurrentBody() || currentVariant.body} label="⎘ Copy" />
        <button className={`btn btn-sm ${showHistory ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowHistory((v) => !v)}>
          History
        </button>

        <div title={user.name} style={{ width: 26, height: 26, borderRadius: '50%', background: user.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 700 }}>
          {user.name[0]?.toUpperCase()}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <VariantSidebar
          tree={tree}
          currentId={currentVariant.id}
          onNavigate={(newId) => saveAndGo(`/editor/${newId}`)}
          onFork={handleFork}
          getCurrentBody={getCurrentBody}
        />

        {/* Main textarea */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <textarea
            ref={textareaRef}
            defaultValue={currentVariant.body}
            onChange={handleChange}
            placeholder="Write your prompt here…"
            style={{ flex: 1, padding: '28px 56px', border: 'none', resize: 'none', fontSize: 15, lineHeight: 1.75, outline: 'none', fontFamily: 'var(--font)', background: 'var(--white)' }}
          />
        </div>

        {/* Fork side panel */}
        {forkVariant && (
          <ForkPane
            variant={forkVariant}
            user={user}
            onClose={() => setForkVariant(null)}
            onNavigate={(forkId) => router.push(`/editor/${forkId}`)}
          />
        )}
      </div>

      {/* ── Run panel ── */}
      {showRunPanel && (
        <RunPanel
          tree={tree}
          user={user}
          testInputs={testInputs}
          onPromote={handlePromote}
          onClose={() => setShowRunPanel(false)}
        />
      )}

      {/* ── History drawer ── */}
      {showHistory && (
        <HistoryDrawer
          promptId={currentVariant.id}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestore}
        />
      )}
    </div>
  )
}

// ── Next.js page wrapper ───────────────────────────────────────────────────

function EditorWithParams({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <EditorContent id={id} />
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--grey-500)' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: 32, height: 32, border: '3px solid var(--grey-300)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    }>
      <EditorWithParams params={params} />
    </Suspense>
  )
}
