'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { PromptTree, Prompt } from '../../types'
import type { ArchivedTree } from '../../lib/store'

interface LocalUser { id: string; name: string; color: string }

// ── Variant tree mini-view ─────────────────────────────────────────────────

function VariantTreeMini({ tree, onNavigate }: { tree: PromptTree; onNavigate: (id: string) => void }) {
  function renderNode(id: string, depth: number): React.ReactNode {
    const variant = tree.variants.find((v) => v.id === id)
    if (!variant) return null
    const isMain = id === tree.mainId
    const children = tree.variants.filter((v) => v.parentId === id)
    return (
      <div key={id}>
        <button
          onClick={() => onNavigate(id)}
          title={`Open ${variant.title}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 8 + depth * 12,
            paddingTop: 3, paddingBottom: 3, paddingRight: 8, borderRadius: 4,
            background: 'transparent', fontSize: 12, color: isMain ? 'var(--grey-900)' : 'var(--grey-700)',
            fontWeight: isMain ? 600 : 400, width: '100%', textAlign: 'left',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: isMain ? 'var(--green)' : 'var(--grey-400)' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{variant.title}</span>
          {isMain && <span className="badge badge-main" style={{ fontSize: 10, flexShrink: 0 }}>main</span>}
        </button>
        {children.map((c) => renderNode(c.id, depth + 1))}
      </div>
    )
  }
  return <div>{renderNode(tree.root.id, 0)}</div>
}

// ── Copy button ────────────────────────────────────────────────────────────

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button className="btn btn-ghost btn-sm" onClick={copy} style={{ fontSize: 12 }}>
      {copied ? '✓ Copied' : label}
    </button>
  )
}

// ── Promoted variant card ──────────────────────────────────────────────────

function PromotedCard({
  variant, tree, onNavigate,
}: { variant: Prompt; tree: PromptTree; onNavigate: (id: string) => void }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderLeft: '3px solid var(--green)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{variant.title}</div>
          <div style={{ fontSize: 12, color: 'var(--grey-500)' }}>
            From <strong>{tree.root.title}</strong> · {new Date(variant.createdAt).toLocaleDateString()}
          </div>
        </div>
        <span className="badge badge-main">winner</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--grey-700)', lineHeight: 1.5 }} className="truncate">
        {variant.body.slice(0, 160)}{variant.body.length > 160 ? '…' : ''}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate(variant.id)}>Open</button>
        <CopyBtn text={variant.body} label="Copy prompt" />
      </div>
    </div>
  )
}

// ── Prompt card ────────────────────────────────────────────────────────────

function PromptCard({
  tree, user, onNavigate, onArchive,
}: { tree: PromptTree; user: LocalUser; onNavigate: (id: string) => void; onArchive: (rootId: string) => void }) {
  const mainVariant = tree.variants.find((v) => v.id === tree.mainId)
  return (
    <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* Tree mini */}
      <div style={{ minWidth: 190, borderRight: '1px solid var(--grey-300)', paddingRight: 12 }}>
        <VariantTreeMini tree={tree} onNavigate={onNavigate} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{tree.root.title}</span>
          <span className="badge badge-variant">{tree.variants.length} variant{tree.variants.length !== 1 ? 's' : ''}</span>
        </div>
        {mainVariant && (
          <div style={{ fontSize: 13, color: 'var(--grey-700)', marginBottom: 10, lineHeight: 1.5 }} className="truncate">
            {mainVariant.body.slice(0, 140)}{mainVariant.body.length > 140 ? '…' : ''}
          </div>
        )}

        {/* Variant copy list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {tree.variants.map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: v.id === tree.mainId ? 'var(--grey-900)' : 'var(--grey-500)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.title}
              </span>
              <CopyBtn text={v.body} label="Copy" />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate(tree.root.id)}>Open</button>
          <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onArchive(tree.root.id)}>
            Archive
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard page ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<LocalUser | null>(null)
  const [trees, setTrees] = useState<PromptTree[]>([])
  const [archived, setArchived] = useState<ArchivedTree[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [creating, setCreating] = useState(false)
  const sseRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('workshop_user')
    if (!raw) { router.push('/login'); return }
    setUser(JSON.parse(raw))
  }, [router])

  const loadData = useCallback(async () => {
    const [treesRes, archRes] = await Promise.all([
      fetch('/api/prompts'),
      fetch('/api/prompts/archived'),
    ])
    if (treesRes.ok) setTrees(await treesRes.json())
    if (archRes.ok) setArchived(await archRes.json())
  }, [])

  useEffect(() => {
    loadData()
    const es = new EventSource('/api/events/stream')
    sseRef.current = es
    es.onmessage = () => loadData()
    return () => es.close()
  }, [loadData])

  const handleCreate = async () => {
    if (!newTitle.trim() || !user) return
    setCreating(true)
    await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: JSON.stringify({ title: newTitle, body: newBody }),
    })
    setNewTitle(''); setNewBody(''); setShowNew(false); setCreating(false)
    loadData()
  }

  const handleArchive = async (rootId: string) => {
    if (!user || !confirm('Archive this prompt? It can be restored within 7 days.')) return
    await fetch(`/api/prompts/${rootId}/archive`, {
      method: 'POST', headers: { 'X-User-Id': user.id },
    })
    loadData()
  }

  const handleRestore = async (rootId: string) => {
    if (!user) return
    await fetch(`/api/prompts/${rootId}/restore`, {
      method: 'POST', headers: { 'X-User-Id': user.id },
    })
    loadData()
  }

  const handleLogout = () => {
    localStorage.removeItem('workshop_user')
    router.push('/login')
  }

  // Promoted variants: mainId !== root.id (explicitly promoted forks)
  const promotedVariants = trees
    .filter((tree) => tree.mainId !== tree.root.id)
    .map((tree) => ({ tree, variant: tree.variants.find((v) => v.id === tree.mainId)! }))
    .filter((x) => x.variant)
    .sort((a, b) => new Date(b.variant.createdAt).getTime() - new Date(a.variant.createdAt).getTime())

  return (
    <div style={{ minHeight: '100vh', background: 'var(--grey-100)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--white)', borderBottom: '1px solid var(--grey-300)',
        padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)', letterSpacing: -0.5 }}>Workshop</div>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: user.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                {user.name[0].toUpperCase()}
              </div>
              <span style={{ fontSize: 14 }}>{user.name}</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Sign out</button>
          </div>
        )}
      </header>

      <main style={{ maxWidth: 940, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Promoted Variants ─────────────────────────────────────── */}
        {promotedVariants.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>Promoted Variants</span>
              <span className="badge badge-main">{promotedVariants.length}</span>
              <span style={{ fontSize: 12, color: 'var(--grey-500)' }}>Winning prompts, sorted by promotion date</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
              {promotedVariants.map(({ tree, variant }) => (
                <PromotedCard
                  key={variant.id}
                  variant={variant}
                  tree={tree}
                  onNavigate={(id) => router.push(`/editor/${id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Prompts ──────────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>Prompts</span>
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Prompt</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {trees.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--grey-500)' }}>
                No prompts yet. Create your first one!
              </div>
            )}
            {trees.map((tree) => (
              <PromptCard
                key={tree.root.id}
                tree={tree}
                user={user!}
                onNavigate={(id) => router.push(`/editor/${id}`)}
                onArchive={handleArchive}
              />
            ))}
          </div>
        </section>

        {/* ── Archived ─────────────────────────────────────────────── */}
        {archived.length > 0 && (
          <section style={{ marginTop: 36 }}>
            <button
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--grey-700)', marginBottom: 12 }}
              onClick={() => setShowArchived((v) => !v)}
            >
              <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: showArchived ? 'rotate(90deg)' : 'none' }}>▶</span>
              Archived ({archived.length})
            </button>
            {showArchived && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {archived.map((a) => {
                  const daysLeft = Math.max(0, Math.ceil((new Date(a.permanentDeleteAt).getTime() - Date.now()) / 86400000))
                  return (
                    <div key={a.tree.root.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.75 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{a.tree.root.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--grey-500)' }}>
                          Archived {new Date(a.archivedAt).toLocaleDateString()} · {daysLeft > 0 ? `Deletes in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : 'Deletes today'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <CopyBtn text={a.tree.root.body} label="Copy" />
                        <button className="btn btn-ghost btn-sm" onClick={() => handleRestore(a.tree.root.id)}>Restore</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* New prompt modal */}
      {showNew && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowNew(false) }}>
          <div className="modal">
            <h2>New Prompt</h2>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Code Reviewer" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Body (optional)</label>
              <textarea className="form-input" value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={4} placeholder="You are a…" style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!newTitle.trim() || creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
