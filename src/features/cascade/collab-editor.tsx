/**
 * collab-editor.tsx — Gemeinsamer Text
 *
 * Zwei Modi:
 *   1. Listen-Ansicht: gespeicherte Dokumente + "Neu"-Button
 *   2. Editor-Ansicht: Tiptap + Y.js Echtzeit-Collaboration
 *
 * "Senden" zeigt die Kaskaden-Ziele als Checkboxen.
 */

import { type JSX, useEffect, useState, useRef, useCallback } from 'react';
import { EditorContent } from '@tiptap/react';
import { FormattingToolbar } from '@/components/editor/formatting-toolbar';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { FontSize } from '@/components/editor/font-size-extension';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { env } from '@/core/config/env';
import { cn } from '@/lib/utils';
import { Send, Wifi } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import '../documents/tiptap-styles.css';
import { useT } from "@/lib/i18n/use-t";

const CURSOR_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

function getUserColor(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
    return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CollabPanelProps {
    jwt: string;
    userId: string;
    displayName: string;
    spaceId: string;
    /** Wenn gesetzt, wird dieser CollabDoc direkt im Editor geoeffnet */
    initialDocId?: string;
    onClose: () => void;
}

interface SavedDoc {
    id: string;
    title: string;
    status: string;
    createdAt: string;
}

interface SendTarget {
    edgeId: string;
    targetTitle: string;
    boardName: string;
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

const api = (path: string, jwt: string, init?: RequestInit) =>
    fetch(`${env.platformBaseUrl}/platform/v1${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...init?.headers },
    });

// ─── Panel (List + Editor) ────────────────────────────────────────────────────

export function CollabPanel({ jwt, userId, displayName, spaceId, initialDocId, onClose }: CollabPanelProps): JSX.Element {
    const t = useT();
    const [docs, setDocs] = useState<SavedDoc[]>([]);
    const [activeDocId, setActiveDocId] = useState<string | null>(initialDocId ?? null);
    const [loading, setLoading] = useState(true);

    const loadDocs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api(`/spaces/${spaceId}/collab-docs`, jwt);
            if (res.ok) {
                const data = await res.json();
                setDocs(data.docs ?? []);
            }
        } finally {
            setLoading(false);
        }
    }, [spaceId, jwt]);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    const handleNew = async () => {
        const res = await api(`/spaces/${spaceId}/collab-doc`, jwt, { method: 'POST', body: JSON.stringify({}) });
        if (res.ok) {
            const data = await res.json();
            if (data?.doc?.id) {
                setActiveDocId(data.doc.id);
                loadDocs();
            }
        }
    };

    const handleDelete = async (docId: string) => {
        if (!confirm('Entwurf löschen?')) return;
        await api(`/collab-docs/${docId}`, jwt, { method: 'DELETE' });
        if (activeDocId === docId) setActiveDocId(null);
        loadDocs();
    };

    // ── Editor-Ansicht ──
    if (activeDocId) {
        return (
            <CollabEditorView
                documentId={activeDocId}
                jwt={jwt}
                userId={userId}
                displayName={displayName}
                spaceId={spaceId}
                onClose={() => { setActiveDocId(null); loadDocs(); }}
                onDelete={() => { handleDelete(activeDocId); }}
            />
        );
    }

    // ── Listen-Ansicht ──
    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
                <span className="text-xs font-semibold">{t('cascade.collab_editor.gemeinsamer_text')}</span>
                <div className="flex items-center gap-1">
                    <button onClick={handleNew} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90">
                        <MaterialIcon name="add" size={16} className="size-3" /> {t('cascade.collab_editor.neu')}
                    </button>
                    <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-3.5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                {loading && <div className="p-4 text-sm text-muted-foreground">{t('cascade.collab_editor.laden')}</div>}
                {!loading && docs.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                        <MaterialIcon name="description" size={16} className="size-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">{t('cascade.collab_editor.noch_keine_texte_erstellt')}</p>
                        <button onClick={handleNew} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                            <MaterialIcon name="add" size={16} className="size-3" /> {t('cascade.collab_editor.neuen_text_erstellen')}
                        </button>
                    </div>
                )}
                {!loading && docs.map(doc => (
                    <div key={doc.id} className="group flex items-center gap-2 border-b px-4 py-2.5 hover:bg-muted/30 cursor-pointer" onClick={() => setActiveDocId(doc.id)}>
                        <MaterialIcon name="description" size={16} className="size-4 text-primary/60 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{doc.title}</div>
                            <div className="text-[10px] text-muted-foreground">
                                {doc.status === 'draft' ? 'Entwurf' : doc.status === 'sent' ? 'Gesendet' : doc.status}
                                {' · '}{new Date(doc.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                        {doc.status === 'draft' && (
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                                className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10">
                                <MaterialIcon name="close" size={16} className="size-3" />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Editor Component ─────────────────────────────────────────────────────────

export function CollabEditorView({
    documentId, jwt, userId, displayName, spaceId, onClose, onDelete, hasSource = false,
}: {
    documentId: string;
    jwt: string;
    userId: string;
    displayName: string;
    spaceId: string;
    onClose: () => void;
    onDelete: () => void;
    /** Wenn true: CollabDoc ist mit einer DMS-Quelle verbunden — Speichern ueberschreibt diese (kein Prompt). */
    hasSource?: boolean;
}): JSX.Element {
    const t = useT();
    const [connected, setConnected] = useState(false);
    const [peerCount, setPeerCount] = useState(0);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [sendDialog, setSendDialog] = useState(false);
    const [sendTargets, setSendTargets] = useState<SendTarget[]>([]);
    const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
    const [sending, setSending] = useState(false);

    // Auto-Save Status: 'clean' nach erfolgreichem Save, 'dirty' nach Aenderung,
    // 'saving' waehrend des Calls. Zeitpunkt fuer "vor Xs"-Anzeige.
    const [saveStatus, setSaveStatus] = useState<'clean' | 'dirty' | 'saving'>('clean');
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const [, forceTick] = useState(0);

    const editorRef = useRef<Editor | null>(null);
    const ydocRef = useRef<Y.Doc | null>(null);
    const idleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savingRef = useRef(false);

    useEffect(() => {
        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        let base = env.platformBaseUrl;
        if (base.startsWith('/')) {
            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            base = `${proto}//${window.location.host}${base}`;
        } else {
            base = base.replace(/^http/, 'ws');
        }

        const provider = new WebsocketProvider(base + '/platform/v1/collab', `${documentId}/ws?token=${encodeURIComponent(jwt)}`, ydoc);

        provider.awareness.setLocalStateField('user', { name: displayName, color: getUserColor(userId) });
        provider.on('status', ({ status }: { status: string }) => setConnected(status === 'connected'));
        provider.awareness.on('change', () => setPeerCount(provider.awareness.getStates().size));

        const tiptapEditor = new Editor({
            extensions: [
                StarterKit.configure({ undoRedo: false }),
                Highlight.configure({ multicolor: true }),
                Typography, TaskList, TaskItem.configure({ nested: true }),
                TextAlign.configure({ types: ['heading', 'paragraph'] }),
                TextStyle, Color, FontFamily, FontSize,
                Subscript, Superscript,
                Image.configure({ inline: true, allowBase64: true }),
                Table.configure({ resizable: true }), TableRow, TableCell, TableHeader,
                Collaboration.configure({ document: ydoc }),
                CollaborationCursor.configure({ provider, user: { name: displayName, color: getUserColor(userId) } }),
            ],
            editorProps: {
                attributes: { class: 'tiptap-content prose prose-sm dark:prose-invert max-w-none focus:outline-none px-6 py-4 min-h-[200px]' },
            },
        });

        editorRef.current = tiptapEditor;
        setEditor(tiptapEditor);

        return () => {
            tiptapEditor.destroy();
            provider.disconnect();
            provider.destroy();
            ydoc.destroy();
            editorRef.current = null;
        };
    }, [documentId, jwt, userId, displayName]);

    // ── Speichern (manuell oder auto) ──
    const handleSave = useCallback(async () => {
        if (savingRef.current) return;
        const text = editorRef.current?.getText()?.trim();
        if (!text) return;

        let body: Record<string, string> = {};
        if (!hasSource) {
            // Neuer Text ohne Quell-Dokument → Dateiname abfragen
            const now = new Date();
            const defaultName = `Gemeinsamer Text ${now.toLocaleDateString('de-DE')} ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
            const fileName = prompt('Dateiname:', defaultName);
            if (!fileName?.trim()) return;
            body = { title: fileName.trim() };
        }

        savingRef.current = true;
        setSaving(true);
        setSaveStatus('saving');
        try {
            const res = await api(`/collab-docs/${documentId}/save`, jwt, { method: 'POST', body: JSON.stringify(body) });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
            }
            setSaved(true);
            setSaveStatus('clean');
            setLastSavedAt(Date.now());
            if (hasSource) {
                setTimeout(() => setSaved(false), 2000);
            } else {
                onClose();
            }
        } catch (e) {
            setSaveStatus('dirty');
            if (!hasSource) alert(`Speichern fehlgeschlagen${e instanceof Error ? `: ${e.message}` : ''}`);
        } finally {
            setSaving(false);
            savingRef.current = false;
        }
    }, [documentId, jwt, hasSource, onClose]);

    // ── Auto-Save Triggers (nur bei hasSource = DocumentEditPage-Flow) ──
    // Strategie: Y.Doc-Update markiert dirty + plant Idle-Save in 30s. Blur und
    // beforeunload triggern sofort. Wir umgehen damit "Speichern alle 5s" und
    // halten die Document-Version-Bumps low (eine pro Editier-Session-Pause).
    useEffect(() => {
        if (!hasSource) return;
        const ydoc = ydocRef.current;
        if (!ydoc) return;

        const onUpdate = () => {
            setSaveStatus(prev => prev === 'saving' ? prev : 'dirty');
            if (idleSaveTimer.current) clearTimeout(idleSaveTimer.current);
            idleSaveTimer.current = setTimeout(() => {
                handleSave();
            }, 30_000);
        };
        ydoc.on('update', onUpdate);

        const onBlur = () => {
            if (saveStatus === 'dirty' && !savingRef.current) handleSave();
        };
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (saveStatus === 'dirty' && !savingRef.current) {
                // sendBeacon-style synchroner Save geht nicht — wir koennen nur warnen
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('blur', onBlur);
        window.addEventListener('beforeunload', onBeforeUnload);

        // Status-Tick alle 10s damit "vor Xs" sich aktualisiert
        const tickInterval = setInterval(() => forceTick((n) => n + 1), 10_000);

        return () => {
            ydoc.off('update', onUpdate);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('beforeunload', onBeforeUnload);
            clearInterval(tickInterval);
            if (idleSaveTimer.current) {
                clearTimeout(idleSaveTimer.current);
                // Beim Unmount nochmal speichern wenn dirty
                if (saveStatus === 'dirty' && !savingRef.current) handleSave();
            }
        };
    }, [hasSource, handleSave, saveStatus]);

    // ── Senden vorbereiten — Kaskaden-Ziele laden ──
    const handleSendOpen = useCallback(async () => {
        const text = editorRef.current?.getText()?.trim();
        if (!text) { alert('Text ist leer'); return; }

        const res = await api(`/spaces/${spaceId}/cascade-targets`, jwt);
        if (res.ok) {
            const data = await res.json();
            setSendTargets(data.targets ?? []);
            // Wenn keine Kaskaden-Ziele → direkt in den Space senden
            if (!data.targets?.length) {
                setSendTargets([{ edgeId: '__space__', targetTitle: 'Diesen Space', boardName: '' }]);
            }
            setSelectedTargets(new Set((data.targets ?? []).map((_t: SendTarget) => _t.edgeId)));
        } else {
            setSendTargets([{ edgeId: '__space__', targetTitle: 'Diesen Space', boardName: '' }]);
            setSelectedTargets(new Set(['__space__']));
        }
        setSendDialog(true);
    }, [spaceId, jwt]);

    // ── Senden ausfuehren ──
    const handleSendConfirm = useCallback(async () => {
        if (sending || selectedTargets.size === 0) return;
        setSending(true);
        try {
            const res = await api(`/collab-docs/${documentId}/send-to-targets`, jwt, {
                method: 'POST',
                body: JSON.stringify({ targets: Array.from(selectedTargets) }),
            });
            if (res.ok) {
                setSendDialog(false);
                onClose();
            }
        } finally {
            setSending(false);
        }
    }, [sending, selectedTargets, documentId, jwt, onClose]);

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
                <div className="flex items-center gap-2">
                    <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                        <MaterialIcon name="chevron_left" size={16} className="size-4" />
                    </button>
                    <span className="text-xs font-semibold">{t('cascade.collab_editor.editor')}</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {connected ? <Wifi className="size-3 text-emerald-500" /> : <MaterialIcon name="wifi_off" size={16} className="size-3 text-destructive" />}
                        <span>{connected ? 'Verbunden' : 'Verbinde...'}</span>
                    </div>
                    {peerCount > 1 && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <MaterialIcon name="groups" size={16} className="size-3" /><span>{peerCount}</span>
                        </div>
                    )}
                </div>
                {/* Auto-Save-Status: nur im Source-Flow (DocumentEditPage). */}
                {hasSource && (
                    <button
                        type="button"
                        onClick={() => { if (saveStatus === 'dirty') handleSave(); }}
                        className={cn(
                            'text-[11px] tabular-nums transition-colors',
                            saveStatus === 'saving' ? 'text-muted-foreground' :
                                saveStatus === 'dirty' ? 'text-amber-600 dark:text-amber-500 hover:underline cursor-pointer' :
                                    'text-emerald-600 dark:text-emerald-500',
                        )}
                        title={saveStatus === 'dirty' ? 'Jetzt speichern' : undefined}
                    >
                        {formatSaveStatus(saveStatus, lastSavedAt)}
                    </button>
                )}
                <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted" title={t('common.close')}>
                    <MaterialIcon name="close" size={16} className="size-3.5" />
                </button>
            </div>

            {/* Formatting Toolbar */}
            {editor && <FormattingToolbar editor={editor} />}

            {/* Editor */}
            <div className="flex-1 overflow-auto">
                {editor ? <EditorContent editor={editor} className="h-full" /> : <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">{t('cascade.collab_editor.lade_editor')}</div>}
            </div>

            {/* Send Dialog Overlay */}
            {sendDialog && (
                <div className="border-t bg-card px-4 py-3 space-y-2 shrink-0">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{t('cascade.collab_editor.wohin_senden')}</span>
                        <button onClick={() => setSendDialog(false)} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><MaterialIcon name="close" size={16} className="size-3.5" /></button>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-auto">
                        {sendTargets.map(_t => {
                            const checked = selectedTargets.has(_t.edgeId);
                            return (
                                <label key={_t.edgeId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                                    <div className={cn("size-4 rounded border flex items-center justify-center transition-colors", checked ? "bg-primary border-primary" : "border-border")}>
                                        {checked && <MaterialIcon name="check" size={16} className="size-2.5 text-primary-foreground" />}
                                    </div>
                                    <input type="checkbox" className="sr-only" checked={checked}
                                        onChange={() => { const next = new Set(selectedTargets); if (checked) next.delete(_t.edgeId); else next.add(_t.edgeId); setSelectedTargets(next); }} />
                                    <span className="flex-1">{_t.targetTitle}</span>
                                    {_t.boardName && <span className="text-[10px] text-muted-foreground">{_t.boardName}</span>}
                                </label>
                            );
                        })}
                    </div>
                    <button onClick={handleSendConfirm} disabled={sending || selectedTargets.size === 0}
                        className={cn("flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors", "bg-primary text-primary-foreground hover:bg-primary/90", (sending || selectedTargets.size === 0) && "opacity-50 cursor-not-allowed")}>
                        <MaterialIcon name="send" size={16} className="size-3.5" />{sending ? 'Sende...' : `An ${selectedTargets.size} Ziel${selectedTargets.size !== 1 ? 'e' : ''} senden`}
                    </button>
                </div>
            )}

            {/* Footer Actions — nur im Cascade-Flow (kein Source-Document).
          Bei DocumentEditPage (hasSource) gibt's stattdessen Auto-Save +
          Status-Anzeige im Header (siehe oben). */}
            {!sendDialog && !hasSource && (
                <div className="flex items-center justify-between border-t px-4 py-2.5 shrink-0 bg-muted/20">
                    <button onClick={onDelete} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <MaterialIcon name="close" size={16} className="size-3.5" /> {t('cascade.collab_editor.verwerfen')}
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                            saved ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "border border-border text-foreground hover:bg-muted",
                            saving && "opacity-50 cursor-not-allowed")}>
                        <MaterialIcon name="save" size={16} className="size-3.5" />{saved ? 'Gespeichert' : saving ? 'Speichere...' : t('common.save')}
                    </button>
                    <button onClick={handleSendOpen} className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                        <MaterialIcon name="send" size={16} className="size-3.5" /> {t('common.send')}
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Renderer fuer "Alle Aenderungen gespeichert vor Xs" / "Speichere…" / "Ungespeichert".
 * Wird nur im DocumentEditPage-Flow (hasSource) im Header gezeigt.
 */
function formatSaveStatus(status: 'clean' | 'dirty' | 'saving', lastSavedAt: number | null): string {
    if (status === 'saving') return 'Speichere…';
    if (status === 'dirty') return 'Ungespeicherte Änderungen';
    if (status === 'clean' && lastSavedAt) {
        const ago = Math.floor((Date.now() - lastSavedAt) / 1000);
        if (ago < 5) return '✓ Alle Änderungen gespeichert';
        if (ago < 60) return `✓ Gespeichert vor ${ago}s`;
        const m = Math.floor(ago / 60);
        return `✓ Gespeichert vor ${m} Min`;
    }
    return '';
}

// Keep old export name for backward compatibility (cascade-panel still uses it)
export { CollabPanel as CollabEditor };
