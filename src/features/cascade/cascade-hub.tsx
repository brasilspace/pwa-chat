/**
 * cascade-hub.tsx — Kaskaden-Hub (eigenstaendige Welt)
 *
 * Zeigt alle Kaskaden-Boards des Tenants. Erstellt neue. Oeffnet Boards
 * in voller Breite mit dem Spalten-Layout.
 */

import { type JSX, useState, useEffect, useCallback, useSyncExternalStore, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { useSpaces } from '@/features/spaces/use-spaces';
import { CascadePanel } from './cascade-panel';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { env } from '@/core/config/env';
import { useT } from "@/lib/i18n/use-t";

const API = `${env.platformBaseUrl}/platform/v1`;

interface BoardSummary {
    id: string;
    name: string;
    spaceId: string;
    description: string | null;
    columns: Array<{ id: string; title: string; spaces: Array<{ spaceId: string }> }>;
    createdAt: string;
}

async function fetchJson<T>(path: string, jwt: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

export function CascadeHub(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { spaces } = useSpaces();
    const { boardId: urlBoardId } = useParams<{ boardId?: string }>();
    const navigate = useNavigate();

    const [boards, setBoards] = useState<BoardSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedBoard, setSelectedBoard] = useState<BoardSummary | null>(null);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newSpaceId, setNewSpaceId] = useState('');
    const [newTemplateKey, setNewTemplateKey] = useState('custom');
    const [templates, setTemplates] = useState<Array<{ key: string; name: string; description: string; columnCount: number }>>([]);

    // Load all boards from all spaces
    const loadBoards = useCallback(async () => {
        if (!jwt || spaces.length === 0) return;
        setLoading(true);
        const allBoards: BoardSummary[] = [];
        for (const space of spaces) {
            try {
                const data = await fetchJson<{ boards: BoardSummary[] }>(`/spaces/${space.id}/cascade-boards`, jwt);
                allBoards.push(...data.boards);
            } catch { /* ignore */ }
        }
        setBoards(allBoards);
        setLoading(false);
    }, [jwt, spaces]);

    useEffect(() => { loadBoards(); }, [loadBoards]);

    // URL-Parameter: Board per URL oeffnen (/kaskaden/:boardId)
    const urlHandledRef = useRef(false);
    useEffect(() => {
        if (urlBoardId && boards.length > 0 && !urlHandledRef.current) {
            urlHandledRef.current = true;
            const found = boards.find(b => b.id === urlBoardId);
            if (found) setSelectedBoard(found);
            else setSelectedBoard({ id: urlBoardId, name: '...', spaceId: '', description: null, columns: [], createdAt: '' });
        }
    }, [urlBoardId, boards]);

    // Load templates
    useEffect(() => {
        if (!jwt) return;
        fetchJson<{ templates: typeof templates }>('/cascade-templates', jwt)
            .then(d => setTemplates(d.templates))
            .catch(() => { });
    }, [jwt]);

    const handleCreate = async () => {
        if (!jwt || !newName.trim() || !newSpaceId) return;
        if (newTemplateKey && newTemplateKey !== 'custom') {
            await fetchJson(`/spaces/${newSpaceId}/cascade-boards/from-template`, jwt, {
                method: 'POST',
                body: JSON.stringify({ name: newName.trim(), templateKey: newTemplateKey }),
            });
        } else {
            await fetchJson(`/spaces/${newSpaceId}/cascade-boards`, jwt, {
                method: 'POST',
                body: JSON.stringify({ name: newName.trim() }),
            });
        }
        setNewName('');
        setNewSpaceId('');
        setNewTemplateKey('custom');
        setCreating(false);
        loadBoards();
    };

    const handleDelete = async (board: BoardSummary) => {
        if (!jwt || !confirm(`"${board.name}" loeschen?`)) return;
        await fetchJson(`/cascade-boards/${board.id}`, jwt, { method: 'DELETE' });
        if (selectedBoard?.id === board.id) setSelectedBoard(null);
        loadBoards();
    };

    // Wenn ein Board ausgewaehlt ist: volle Breite mit dem Board
    if (selectedBoard) {
        const ownerSpace = spaces.find(s => s.id === selectedBoard.spaceId)
            ?? { id: selectedBoard.spaceId, name: selectedBoard.spaceId } as SpaceItem;
        return (
            <div className="flex h-full flex-col">
                {/* Back button */}
                <div className="flex items-center gap-2 border-b px-4 h-[var(--toolbar-height)] shrink-0">
                    <button
                        onClick={() => { setSelectedBoard(null); navigate('/kaskaden', { replace: true }); }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                        {t('cascade.cascade_hub.zurueck')}
                    </button>
                    <div className="h-4 w-px bg-border" />
                    <MaterialIcon name="schema" size={16} className="size-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{selectedBoard.name}</span>
                </div>
                <div className="flex-1 min-h-0">
                    <CascadePanel key={selectedBoard.id} space={ownerSpace} boardId={selectedBoard.id} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-4 h-[var(--toolbar-height)] shrink-0">
                <MaterialIcon name="schema" size={16} className="size-4 text-muted-foreground" />
                <span className="text-lg font-semibold">{t('cascade.cascade_hub.flow-designer')}</span>
                <span className="text-xs text-muted-foreground ml-1">{boards.length}</span>
                <div className="flex-1" />
                {!creating && (
                    <button
                        onClick={() => setCreating(true)}
                        title={t('cascade.cascade_hub.neu')}
                        aria-label={t('cascade.cascade_hub.neu')}
                        className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        <MaterialIcon name="add" size={18} />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {/* Create form */}
                {creating && (
                    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                        <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder={t('cascade.cascade_hub.name_des_flows_zb_krisenprotokoll_feuer')}
                            className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                        />
                        <select
                            value={newTemplateKey}
                            onChange={(e) => setNewTemplateKey(e.target.value)}
                            className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                        >
                            {templates.map(_t => (
                                <option key={_t.key} value={_t.key}>
                                    {_t.name}{_t.columnCount > 0 ? ` (${_t.columnCount} Spalten)` : ' (leer)'}
                                </option>
                            ))}
                        </select>
                        {newTemplateKey && newTemplateKey !== 'custom' && (
                            <p className="text-[11px] text-muted-foreground">
                                {templates.find(_t => _t.key === newTemplateKey)?.description}
                            </p>
                        )}
                        <select
                            value={newSpaceId}
                            onChange={(e) => setNewSpaceId(e.target.value)}
                            className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                        >
                            <option value="">{t('cascade.cascade_hub.space_waehlen_besitzer')}</option>
                            {spaces.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <button onClick={handleCreate} disabled={!newName.trim() || !newSpaceId}
                                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50">
                                {t('cascade.cascade_hub.erstellen')}
                            </button>
                            <button onClick={() => { setCreating(false); setNewName(''); setNewSpaceId(''); }}
                                className="rounded-lg px-4 py-2 text-xs text-muted-foreground hover:bg-muted">
                                {t('cascade.cascade_hub.abbrechen')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                )}

                {/* Board List */}
                {!loading && boards.length === 0 && !creating && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <MaterialIcon name="schema" size={16} className="size-12 text-muted-foreground/20 mb-4" />
                        <p className="text-sm font-medium text-foreground">{t('cascade.cascade_hub.noch_keine_flows')}</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                            {t('cascade.cascade_hub.erstelle_deinen_ersten_flow_um_kommunika')}
                        </p>
                        <button
                            onClick={() => setCreating(true)}
                            className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                        >
                            <MaterialIcon name="add" size={16} className="size-4" /> {t('cascade.cascade_hub.ersten_flow_erstellen')}
                        </button>
                    </div>
                )}

                {!loading && boards.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {boards.map((board) => {
                            const ownerSpace = spaces.find(s => s.id === board.spaceId);
                            const totalSpaces = board.columns.reduce((n, c) => n + c.spaces.length, 0);
                            return (
                                <button
                                    key={board.id}
                                    onClick={() => { setSelectedBoard(board); navigate(`/kaskaden/${board.id}`, { replace: true }); }}
                                    className="group flex flex-col items-start rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:shadow-sm"
                                >
                                    <div className="flex w-full items-start gap-2">
                                        <MaterialIcon name="schema" size={16} className="size-4 text-primary mt-0.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-semibold truncate">{board.name}</p>
                                                {(board as any).status === 'active' && (
                                                    <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[8px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">{t('common.active')}</span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                                {ownerSpace?.name ?? board.spaceId}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const url = `${window.location.origin}/kaskaden/${board.id}`;
                                                navigator.clipboard.writeText(url).then(() => {
                                                    const btn = e.currentTarget;
                                                    btn.classList.add('text-emerald-500');
                                                    setTimeout(() => btn.classList.remove('text-emerald-500'), 1500);
                                                });
                                            }}
                                            title={t('cascade.cascade_hub.link_kopieren')}
                                            className="hidden group-hover:block rounded p-1 text-muted-foreground/40 hover:text-primary hover:bg-primary/10"
                                        >
                                            <MaterialIcon name="share" size={16} className="size-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(board); }}
                                            className="hidden group-hover:block rounded p-1 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <MaterialIcon name="delete" size={16} className="size-3.5" />
                                        </button>
                                    </div>
                                    <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                                        <span>{board.columns.length} {t('cascade.cascade_hub.spalten')}</span>
                                        <span>{totalSpaces} {t('cascade.cascade_hub.spaces')}</span>
                                    </div>
                                    {board.columns.length > 0 && (
                                        <div className="mt-2 flex items-center gap-1 flex-wrap">
                                            {board.columns.map((col, i) => (
                                                <span key={col.id} className="flex items-center gap-0.5">
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{col.title}</span>
                                                    {i < board.columns.length - 1 && <MaterialIcon name="chevron_right" size={16} className="size-2.5 text-muted-foreground/40" />}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
