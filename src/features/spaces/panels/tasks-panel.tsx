import { type JSX, useState, useCallback, useMemo, useEffect, useSyncExternalStore } from 'react';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { useBoard } from '@/features/project/use-boards';
import { TaskDetailPanel } from '@/features/project/task-detail-panel';
import type { WorkItem, WorkItemStatus, WorkItemPriority, BoardColumn, BoardGroup } from '@/features/project/project-types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { useT } from "@/lib/i18n/use-t";

const projectGateway = createProjectGateway();

// ═══════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════

type ViewMode = 'list' | 'kanban' | 'gantt' | 'mindmap' | 'reede' | 'trash';

const VIEW_MODES: { key: ViewMode; icon: string; label: string }[] = [
    { key: 'list', icon: 'format_list_bulleted', label: 'Liste' },
    { key: 'kanban', icon: 'view_column', label: 'Kanban' },
    { key: 'gantt', icon: 'view_timeline', label: 'Gantt' },
    { key: 'mindmap', icon: 'account_tree', label: 'Mindmap' },
    { key: 'reede', icon: 'anchor', label: 'Reede' },
    { key: 'trash', icon: 'delete_outline', label: 'Papierkorb' },
];

// Reede-Heuristik: Aufgabe gilt als "schlafend", wenn seit X Tagen keine
// Aenderung passiert ist, oder wenn der Termin verstrichen ist.
// X kommt aus tenantSettings['tasks.reede_stale_days'], Fallback 14.
function getReedeStaleDays(): number {
    const session = sessionStore.getSnapshot();
    const tenantSettings = (session.bootstrap as { tenantSettings?: Record<string, string> } | undefined)?.tenantSettings ?? {};
    const v = parseInt(tenantSettings['tasks.reede_stale_days'] ?? '14', 10);
    return Number.isFinite(v) && v > 0 ? v : 14;
}

function getTrashRetentionDays(): number {
    const session = sessionStore.getSnapshot();
    const tenantSettings = (session.bootstrap as { tenantSettings?: Record<string, string> } | undefined)?.tenantSettings ?? {};
    const v = parseInt(tenantSettings['tasks.trash_retention_days'] ?? '30', 10);
    return Number.isFinite(v) && v > 0 ? v : 30;
}

function isInReede(item: WorkItem): { reason: 'stale' | 'overdue' | 'parked'; days: number } | null {
    if (item.parkedAt) {
        const days = Math.floor((Date.now() - new Date(item.parkedAt).getTime()) / 86400000);
        return { reason: 'parked', days };
    }
    if (item.status === 'done') return null;
    if (item.dueDate) {
        const overdue = Math.floor((Date.now() - new Date(item.dueDate).getTime()) / 86400000);
        if (overdue > 0) return { reason: 'overdue', days: overdue };
    }
    const stale = Math.floor((Date.now() - new Date(item.updatedAt).getTime()) / 86400000);
    if (stale >= getReedeStaleDays()) return { reason: 'stale', days: stale };
    return null;
}

const STATUS_CONFIG: Record<WorkItemStatus, { icon: string; color: string; labelKey: string }> = {
    todo: { icon: 'radio_button_unchecked', color: 'text-muted-foreground', labelKey: 'common.open' },
    in_progress: { icon: 'schedule', color: 'text-amber-500', labelKey: 'app.misc.in_arbeit' },
    review: { icon: 'error', color: 'text-blue-500', labelKey: 'common.review' },
    done: { icon: 'check_circle', color: 'text-emerald-500', labelKey: 'common.done' },
};

const PRIORITY_CONFIG: Record<WorkItemPriority, { dot: string; label: string }> = {
    critical: { dot: 'bg-red-500', label: 'Kritisch' },
    high: { dot: 'bg-orange-500', label: 'Hoch' },
    medium: { dot: 'bg-amber-400', label: 'Mittel' },
    low: { dot: 'bg-slate-300', label: 'Niedrig' },
};

const STATUS_CYCLE: WorkItemStatus[] = ['todo', 'in_progress', 'review', 'done'];
const PRIORITIES: WorkItemPriority[] = ['critical', 'high', 'medium', 'low'];

const GROUP_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8'];

const STATUS_BAR_COLORS: Record<WorkItemStatus, string> = {
    todo: 'bg-slate-400',
    in_progress: 'bg-amber-400',
    review: 'bg-blue-400',
    done: 'bg-emerald-400',
};

function formatDueDate(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.ceil(diff / 86400000);
    if (days < 0) return `${Math.abs(days)}d ueberfaellig`;
    if (days === 0) return 'Heute';
    if (days === 1) return 'Morgen';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function toDateInputValue(iso: string | null): string {
    if (!iso) return '';
    return iso.slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════
//  Task Detail Inline Editor
// ═══════════════════════════════════════════════════════════════════

// TaskDetail wurde nach features/project/task-detail-panel.tsx ausgelagert
// und enthaelt jetzt Kommentare + Checklisten.

// ═══════════════════════════════════════════════════════════════════
//  View Switcher Bar
// ═══════════════════════════════════════════════════════════════════

function ViewSwitcher({ viewMode, setViewMode, openCount, refresh }: {
    viewMode: ViewMode; setViewMode: (v: ViewMode) => void; openCount: number; refresh: () => void;
}) {
    return (
        <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
            {VIEW_MODES.map(vm => (
                <button key={vm.key} onClick={() => setViewMode(vm.key)} title={vm.label}
                    className={cn('flex size-7 items-center justify-center rounded-md transition-colors',
                        viewMode === vm.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                    <MaterialIcon name={vm.icon} size={16} />
                </button>
            ))}
            <div className="flex-1" />
            <span className="text-[10px] text-muted-foreground">{openCount} offen</span>
            <button onClick={refresh} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <MaterialIcon name="refresh" size={16} />
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  List View
// ═══════════════════════════════════════════════════════════════════

function shortUserLabel(userId: string | null | undefined): string {
    if (!userId) return '';
    return userId.replace(/^@/, '').split(':')[0];
}

function TaskRow({ item, selectedId, setSelectedId, moveItem }: {
    item: WorkItem; selectedId: string | null; setSelectedId: (id: string | null) => void; moveItem: (id: string, s: WorkItemStatus) => Promise<void>;
}) {
    const cfg = STATUS_CONFIG[item.status];
    const prioCfg = PRIORITY_CONFIG[item.priority];
    const due = formatDueDate(item.dueDate);
    return (
        <div onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
            draggable onDragStart={e => e.dataTransfer.setData('text/plain', item.id)}
            className={cn('group flex w-full items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors',
                selectedId === item.id ? 'bg-muted' : 'hover:bg-muted')}>
            <button onClick={e => { e.stopPropagation(); const idx = STATUS_CYCLE.indexOf(item.status); moveItem(item.id, STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]); }}>
                <MaterialIcon name={cfg.icon} size={16} className={cn("mt-0.5 shrink-0", cfg.color)} />
            </button>
            <div className="min-w-0 flex-1">
                <div className={cn('text-xs font-medium', item.status === 'done' && 'line-through text-muted-foreground')}>{item.title}</div>
                <div className="mt-0.5 flex items-center gap-2">
                    <div className={cn('size-1.5 rounded-full', prioCfg.dot)} title={prioCfg.label} />
                    {due && <span className={cn('text-[10px]', due.includes('ueberfaellig') ? 'text-destructive font-medium' : 'text-muted-foreground')}>{due}</span>}
                </div>
                {item.responsibleUserId && (
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MaterialIcon name="person" size={12} />
                        <span className="truncate">{shortUserLabel(item.responsibleUserId)}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function ListView({ items, groups, spaceId, createItem, updateItem, moveItem, deleteItem, createGroup, updateGroup, deleteGroup }: {
    items: WorkItem[];
    groups: BoardGroup[];
    spaceId: string;
    createItem: (d: { title: string; parentId?: string; groupId?: string }) => Promise<void>;
    updateItem: (id: string, patch: Record<string, unknown>) => Promise<void>;
    moveItem: (id: string, s: WorkItemStatus) => Promise<void>;
    deleteItem: (id: string, reason: string) => Promise<void>;
    createGroup: (title: string) => Promise<void>;
    updateGroup: (id: string, patch: any) => Promise<void>;
    deleteGroup: (id: string) => Promise<void>;
}) {
    const t = useT();
    const [newTitle, setNewTitle] = useState('');
    const [creating, setCreating] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [addingGroupTitle, setAddingGroupTitle] = useState('');
    const [showGroupAdd, setShowGroupAdd] = useState(false);
    const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
    const selectedItem = items.find(i => i.id === selectedId);

    const handleCreate = useCallback(async (groupId?: string) => {
        if (!newTitle.trim()) return;
        setCreating(true);
        try {
            await createItem({ title: newTitle.trim(), groupId });
            setNewTitle('');
        } finally { setCreating(false); }
    }, [newTitle, createItem]);

    // Items nach Gruppe sortieren
    const ungrouped = items.filter(i => !i.groupId);
    const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);

    return (
        <>
            <div className="flex items-center gap-2 border-b px-3 py-2">
                <MaterialIcon name="add" size={16} className="text-muted-foreground" />
                <input type="text" placeholder={t('spaces.panels.tasks.neue_aufgabe')} value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                    disabled={creating}
                    className="h-6 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
                {creating && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </div>
            {selectedItem && <TaskDetailPanel item={selectedItem} allItems={items} groups={groups} spaceId={spaceId} onUpdate={updateItem} onDelete={async (id, reason) => { await deleteItem(id, reason); setSelectedId(null); }} onClose={() => setSelectedId(null)} />}
            <ScrollArea className="flex-1">
                <div className="p-1.5">
                    {/* Gruppen */}
                    {sortedGroups.map(group => {
                        const groupItems = items.filter(i => i.groupId === group.id);
                        return (
                            <div key={group.id} className="mb-2">
                                <button onClick={() => updateGroup(group.id, { collapsed: !group.collapsed })}
                                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/10'); }}
                                    onDragLeave={e => e.currentTarget.classList.remove('bg-primary/10')}
                                    onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('bg-primary/10'); const id = e.dataTransfer.getData('text/plain'); if (id) updateItem(id, { groupId: group.id }); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
                                    <MaterialIcon name={group.collapsed ? "chevron_right" : "expand_more"} size={14} className="text-muted-foreground" />
                                    <div className="relative">
                                        <div className="size-2.5 rounded-full cursor-pointer hover:ring-2 hover:ring-primary/40"
                                            style={{ backgroundColor: group.color }}
                                            onClick={(e) => { e.stopPropagation(); setColorPickerFor(colorPickerFor === group.id ? null : group.id); }} />
                                        {colorPickerFor === group.id && (
                                            <div className="absolute top-full left-0 mt-1 flex gap-1 bg-card border rounded-lg p-1.5 z-20 shadow-lg" onClick={e => e.stopPropagation()}>
                                                {GROUP_COLORS.map(c => (
                                                    <button key={c} onClick={() => { updateGroup(group.id, { color: c }); setColorPickerFor(null); }}
                                                        className="size-5 rounded-full border-2 border-border/40 hover:scale-125 transition-transform" style={{ backgroundColor: c }} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-xs font-semibold flex-1 text-left">{group.title}</span>
                                    <span className="text-[10px] text-muted-foreground">{groupItems.length}</span>
                                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Gruppe "${group.title}" löschen?`)) deleteGroup(group.id); }}
                                        className="rounded p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100">
                                        <MaterialIcon name="close" size={14} />
                                    </button>
                                </button>
                                {!group.collapsed && (
                                    <div className="ml-3 border-l-2 pl-1" style={{ borderColor: group.color + '40' }}>
                                        {groupItems.map(item => (
                                            <TaskRow key={item.id} item={item} selectedId={selectedId} setSelectedId={setSelectedId} moveItem={moveItem} />
                                        ))}
                                        {groupItems.length === 0 && (
                                            <div className="py-1 px-2 text-[10px] text-muted-foreground/50 italic">{t('spaces.panels.tasks.keine_aufgaben')}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Ungroupierte Aufgaben */}
                    {groups.length > 0 && (
                        <div className="mb-2"
                            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/5'); }}
                            onDragLeave={e => e.currentTarget.classList.remove('bg-primary/5')}
                            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('bg-primary/5'); const id = e.dataTransfer.getData('text/plain'); if (id) updateItem(id, { groupId: null }); }}>
                            <div className="flex items-center gap-2 px-2 py-1">
                                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{t('spaces.panels.tasks.ohne_gruppe')} {ungrouped.length > 0 ? `(${ungrouped.length})` : ''}</span>
                            </div>
                        </div>
                    )}
                    {ungrouped.map(item => (
                        <TaskRow key={item.id} item={item} selectedId={selectedId} setSelectedId={setSelectedId} moveItem={moveItem} />
                    ))}

                    {items.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground">
                            <MaterialIcon name="check_circle" size={32} className="mb-2 opacity-30" /><p>{t('spaces.panels.tasks.noch_keine_aufgaben')}</p>
                        </div>
                    )}

                    {/* Gruppe hinzufügen */}
                    <div className="mt-2 px-2">
                        {showGroupAdd ? (
                            <div className="flex items-center gap-1">
                                <input autoFocus value={addingGroupTitle} onChange={e => setAddingGroupTitle(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && addingGroupTitle.trim()) { createGroup(addingGroupTitle.trim()); setAddingGroupTitle(''); setShowGroupAdd(false); }
                                        if (e.key === 'Escape') { setShowGroupAdd(false); setAddingGroupTitle(''); }
                                    }}
                                    placeholder={t('spaces.panels.tasks.gruppenname')}
                                    className="h-6 flex-1 rounded border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary" />
                            </div>
                        ) : (
                            <button onClick={() => setShowGroupAdd(true)}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors">
                                <MaterialIcon name="create_new_folder" size={14} /> {t('spaces.panels.tasks.neue_gruppe')}
                            </button>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Kanban View
// ═══════════════════════════════════════════════════════════════════

function KanbanView({ items, columns, groups, spaceId, moveItem, createItem, deleteItem, updateItem }: {
    items: WorkItem[]; columns: BoardColumn[]; groups: BoardGroup[]; spaceId: string;
    moveItem: (id: string, s: WorkItemStatus) => Promise<void>;
    createItem: (d: { title: string; status?: WorkItemStatus; parentId?: string }) => Promise<void>;
    deleteItem: (id: string, reason: string) => Promise<void>;
    updateItem: (id: string, patch: Record<string, unknown>) => Promise<void>;
}) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Phase F: Signal an TaskDetailPanel, dass beim Oeffnen direkt das
    // Inline-Done-Form aufspringen soll (Drop in 'Erledigt'-Spalte). Jeder
    // Drop bekommt ein frisches Date.now(), damit ein erneuter Drop auf
    // dieselbe Karte das Form wieder oeffnet.
    const [openDoneFlowAt, setOpenDoneFlowAt] = useState<number | undefined>(undefined);
    const selectedItem = items.find(i => i.id === selectedId);

    return (
        <div className="flex h-full flex-col">
            {selectedItem && <TaskDetailPanel item={selectedItem} allItems={items} spaceId={spaceId} onUpdate={updateItem} onDelete={async (id, reason) => { await deleteItem(id, reason); setSelectedId(null); }} onClose={() => setSelectedId(null)} openDoneFlowAt={openDoneFlowAt} />}
            <div className="flex flex-1 gap-3 overflow-x-auto p-3">
                {columns.map(col => {
                    const colItems = items.filter(i => i.status === col.key);
                    return (
                        <div key={col.key} className="flex w-64 shrink-0 flex-col rounded-lg bg-muted/50"
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                                e.preventDefault();
                                const id = e.dataTransfer.getData('text/plain');
                                if (!id) return;
                                // Phase F: Drop in 'done'-Spalte erfordert Resultat-
                                // Dokumentation. Statt direkt status='done' zu senden
                                // (was 400 zurueckgibt) selektieren wir die Aufgabe
                                // und triggern das Inline-Done-Form im Detail-Panel.
                                if (col.key === 'done') {
                                    setSelectedId(id);
                                    setOpenDoneFlowAt(Date.now());
                                    return;
                                }
                                moveItem(id, col.key as WorkItemStatus);
                            }}>
                            <div className="flex items-center gap-2 px-3 py-2.5">
                                <div className="size-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                                <span className="text-xs font-semibold">{col.label}</span>
                                <span className="text-[10px] text-muted-foreground">{colItems.length}</span>
                            </div>
                            <ScrollArea className="flex-1 px-2 pb-2">
                                <div className="space-y-1.5">
                                    {colItems.map(item => (
                                        <div key={item.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', item.id)}
                                            onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                                            className={cn('group cursor-grab rounded-lg border p-2.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing',
                                                selectedId === item.id ? 'border-primary bg-primary/5' : 'bg-background')}>
                                            <div className="text-xs font-medium leading-snug">{item.title}</div>
                                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                                <div className={cn('size-1.5 rounded-full', PRIORITY_CONFIG[item.priority].dot)} />
                                                {item.groupId && (() => { const g = groups.find(gr => gr.id === item.groupId); return g ? <span className="text-[9px] rounded px-1 py-0.5 font-medium" style={{ backgroundColor: g.color + '20', color: g.color }}>{g.title}</span> : null; })()}
                                                {item.dueDate && <span className="text-[10px] text-muted-foreground">{formatDueDate(item.dueDate)}</span>}
                                                {(item.commentCount ?? 0) > 0 && (
                                                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                                        <MaterialIcon name="chat" size={12} />{item.commentCount}
                                                    </span>
                                                )}
                                                {(item.checklistTotal ?? 0) > 0 && (
                                                    <span className={cn('flex items-center gap-0.5 text-[10px]',
                                                        item.checklistDone === item.checklistTotal ? 'text-emerald-500' : 'text-muted-foreground')}>
                                                        <MaterialIcon name="checklist" size={12} />{item.checklistDone}/{item.checklistTotal}
                                                    </span>
                                                )}
                                            </div>
                                            {item.responsibleUserId && (
                                                <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                                                    <MaterialIcon name="person" size={12} />
                                                    <span className="truncate">{shortUserLabel(item.responsibleUserId)}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                            <KanbanQuickAdd onAdd={title => createItem({ title, status: col.key as WorkItemStatus })} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function KanbanQuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
    const t = useT();
    const [adding, setAdding] = useState(false);
    const [title, setTitle] = useState('');
    return (
        <div className="px-2 pb-2">
            {adding ? (
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder={t('spaces.panels.tasks.titel')}
                    onKeyDown={e => { if (e.key === 'Enter' && title.trim()) { onAdd(title.trim()); setTitle(''); setAdding(false); } if (e.key === 'Escape') { setAdding(false); setTitle(''); } }}
                    className="h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
            ) : (
                <button onClick={() => setAdding(true)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">
                    <MaterialIcon name="add" size={16} /> {t('spaces.panels.tasks.hinzufuegen')}
                </button>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Gantt View
// ═══════════════════════════════════════════════════════════════════

function GanttView({ items, spaceId, updateItem, deleteItem }: {
    items: WorkItem[]; spaceId: string;
    updateItem: (id: string, patch: Record<string, unknown>) => Promise<void>;
    deleteItem: (id: string, reason: string) => Promise<void>;
}) {
    const t = useT();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedItem = items.find(i => i.id === selectedId);

    // Calculate date range: earliest start to latest due, min 14 days
    const { startDate, endDate, totalDays } = useMemo(() => {
        const now = new Date();
        let min = now;
        let max = new Date(now.getTime() + 14 * 86400000);
        for (const item of items) {
            if (item.startDate) { const d = new Date(item.startDate); if (d < min) min = d; }
            if (item.dueDate) { const d = new Date(item.dueDate); if (d > max) max = d; }
        }
        // Add padding
        min = new Date(min.getTime() - 2 * 86400000);
        max = new Date(max.getTime() + 2 * 86400000);
        const total = Math.max(14, Math.ceil((max.getTime() - min.getTime()) / 86400000));
        return { startDate: min, endDate: max, totalDays: total };
    }, [items]);

    const dayWidth = 36;
    const todayOffset = Math.floor((Date.now() - startDate.getTime()) / 86400000);

    // Generate day labels
    const days = useMemo(() => {
        const result: { date: Date; label: string; isToday: boolean; isWeekend: boolean }[] = [];
        for (let i = 0; i < totalDays; i++) {
            const d = new Date(startDate.getTime() + i * 86400000);
            const dow = d.getDay();
            result.push({
                date: d,
                label: d.getDate().toString(),
                isToday: d.toDateString() === new Date().toDateString(),
                isWeekend: dow === 0 || dow === 6,
            });
        }
        return result;
    }, [startDate, totalDays]);

    // Month labels
    const months = useMemo(() => {
        const result: { label: string; offset: number; span: number }[] = [];
        let currentMonth = -1;
        for (let i = 0; i < days.length; i++) {
            const m = days[i].date.getMonth();
            if (m !== currentMonth) {
                if (result.length > 0) result[result.length - 1].span = i - result[result.length - 1].offset;
                result.push({ label: days[i].date.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }), offset: i, span: 0 });
                currentMonth = m;
            }
        }
        if (result.length > 0) result[result.length - 1].span = days.length - result[result.length - 1].offset;
        return result;
    }, [days]);

    return (
        <div className="flex h-full flex-col">
            {selectedItem && <TaskDetailPanel item={selectedItem} allItems={items} spaceId={spaceId} onUpdate={updateItem} onDelete={async (id, reason) => { await deleteItem(id, reason); setSelectedId(null); }} onClose={() => setSelectedId(null)} />}
            {/* Task labels (sticky left) + scrollable timeline */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <div className="flex flex-1">
                    {/* Sticky labels column */}
                    <div className="sticky left-0 z-10 w-[200px] shrink-0 bg-background">
                        {/* Month header spacer */}
                        <div className="h-[25px] border-b" />
                        {/* Day header spacer */}
                        <div className="h-[24px] border-b" />
                        {/* Task labels */}
                        {items.map(item => {
                            const cfg = STATUS_CONFIG[item.status];
                            return (
                                <div key={item.id} onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                                    className={cn('flex items-center gap-2 border-b border-r px-3 cursor-pointer transition-colors',
                                        selectedId === item.id ? 'bg-primary/5' : 'hover:bg-muted/50')}
                                    style={{ height: 32 }}>
                                    <MaterialIcon name={cfg.icon} size={14} className={cn("shrink-0", cfg.color)} />
                                    <span className={cn('truncate text-[11px]', item.status === 'done' && 'line-through text-muted-foreground')}>{item.title}</span>
                                </div>
                            );
                        })}
                    </div>
                    {/* Scrollable timeline */}
                    <div className="min-w-0 flex-1 overflow-x-auto">
                        <div style={{ minWidth: totalDays * dayWidth }}>
                            {/* Month header */}
                            <div className="flex border-b">
                                {months.map((m, i) => (
                                    <div key={i} className="border-r px-1 py-1 text-[10px] font-medium text-muted-foreground" style={{ width: m.span * dayWidth }}>
                                        {m.label}
                                    </div>
                                ))}
                            </div>
                            {/* Day header */}
                            <div className="flex border-b">
                                {days.map((d, i) => (
                                    <div key={i} className={cn('flex items-center justify-center border-r text-[9px]',
                                        d.isToday ? 'bg-primary/10 font-bold text-primary' : d.isWeekend ? 'bg-muted/50 text-muted-foreground' : 'text-muted-foreground')}
                                        style={{ width: dayWidth, height: 24 }}>
                                        {d.label}
                                    </div>
                                ))}
                            </div>
                            {/* Task bars */}
                            <div className="relative">
                                {/* Today line */}
                                <div className="absolute top-0 bottom-0 w-px bg-primary/40 z-[1]" style={{ left: todayOffset * dayWidth + dayWidth / 2 }} />

                                {items.map(item => {
                                    const barColor = STATUS_BAR_COLORS[item.status];
                                    const itemStart = item.startDate ? new Date(item.startDate) : item.dueDate ? new Date(new Date(item.dueDate).getTime() - 86400000) : new Date();
                                    const itemEnd = item.dueDate ? new Date(item.dueDate) : new Date(itemStart.getTime() + 86400000);
                                    const leftDays = Math.max(0, (itemStart.getTime() - startDate.getTime()) / 86400000);
                                    const duration = Math.max(1, (itemEnd.getTime() - itemStart.getTime()) / 86400000);

                                    return (
                                        <div key={item.id} onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                                            className={cn('border-b cursor-pointer transition-colors',
                                                selectedId === item.id ? 'bg-primary/5' : 'hover:bg-muted/50')}
                                            style={{ height: 32 }}>
                                            <div className={cn('absolute h-3 rounded-full', barColor)}
                                                style={{ left: leftDays * dayWidth, width: Math.max(duration * dayWidth, dayWidth / 2), marginTop: 10 }} />
                                        </div>
                                    );
                                })}
                            </div>
                            {items.length === 0 && (
                                <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                                    {t('spaces.panels.tasks.erstelle_aufgaben_mit_start-_und_enddatu')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Mindmap View
// ═══════════════════════════════════════════════════════════════════

interface TreeNode {
    item: WorkItem;
    children: TreeNode[];
}

function buildTree(items: WorkItem[]): TreeNode[] {
    const byId = new Map(items.map(i => [i.id, i]));
    const childMap = new Map<string | null, WorkItem[]>();
    for (const item of items) {
        const parentKey = item.parentId;
        if (!childMap.has(parentKey)) childMap.set(parentKey, []);
        childMap.get(parentKey)!.push(item);
    }
    function build(parentId: string | null): TreeNode[] {
        return (childMap.get(parentId) ?? []).map(item => ({
            item,
            children: build(item.id),
        }));
    }
    return build(null);
}

function MindmapView({ items, spaceId, updateItem, deleteItem, moveItem, createItem }: {
    items: WorkItem[]; spaceId: string;
    updateItem: (id: string, patch: Record<string, unknown>) => Promise<void>;
    deleteItem: (id: string, reason: string) => Promise<void>;
    moveItem: (id: string, s: WorkItemStatus) => Promise<void>;
    createItem: (d: { title: string; parentId?: string }) => Promise<void>;
}) {
    const t = useT();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedItem = items.find(i => i.id === selectedId);
    const tree = useMemo(() => buildTree(items), [items]);

    const rootNodes = tree.length > 0 ? tree : items.map(i => ({ item: i, children: [] }));

    const handleAddChild = useCallback(async (parentId: string | null, title: string) => {
        await createItem({ title, parentId: parentId ?? undefined });
    }, [createItem]);

    return (
        <div className="flex h-full flex-col">
            {selectedItem && <TaskDetailPanel item={selectedItem} allItems={items} spaceId={spaceId} onUpdate={updateItem} onDelete={async (id, reason) => { await deleteItem(id, reason); setSelectedId(null); }} onClose={() => setSelectedId(null)} />}
            <ScrollArea className="flex-1">
                <div className="p-4">
                    {rootNodes.map(node => (
                        <MindmapNode key={node.item.id} node={node} depth={0} selectedId={selectedId} onSelect={setSelectedId}
                            onAddChild={handleAddChild}
                            onCycleStatus={id => {
                                const item = items.find(i => i.id === id);
                                if (item) { const idx = STATUS_CYCLE.indexOf(item.status); moveItem(id, STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]); }
                            }} />
                    ))}
                    {/* Root-level add */}
                    <MindmapQuickAdd onAdd={title => handleAddChild(null, title)} placeholder={t('spaces.panels.tasks.neue_root-aufgabe')} />
                    {items.length === 0 && (
                        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                            {t('spaces.panels.tasks.klicke_um_die_erste_aufgabe_zu_erstellen')}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

function MindmapQuickAdd({ onAdd, placeholder }: { onAdd: (title: string) => void; placeholder?: string }) {
    const t = useT();
    const [adding, setAdding] = useState(false);
    const [title, setTitle] = useState('');

    if (!adding) {
        return (
            <button onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <MaterialIcon name="add" size={14} />{placeholder ?? 'Hinzufuegen'}
            </button>
        );
    }

    return (
        <div className="flex items-center gap-1.5 px-2.5 py-1">
            <MaterialIcon name="add" size={14} className="text-primary" />
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus
                placeholder={t('spaces.panels.tasks.titel_enter')}
                onKeyDown={e => {
                    if (e.key === 'Enter' && title.trim()) { onAdd(title.trim()); setTitle(''); setAdding(false); }
                    if (e.key === 'Escape') { setAdding(false); setTitle(''); }
                }}
                onBlur={() => { if (!title.trim()) setAdding(false); }}
                className="h-6 flex-1 rounded border border-primary/30 bg-background px-2 text-xs outline-none focus:border-primary" />
        </div>
    );
}

function MindmapNode({ node, depth, selectedId, onSelect, onCycleStatus, onAddChild }: {
    node: TreeNode; depth: number; selectedId: string | null;
    onSelect: (id: string | null) => void;
    onCycleStatus: (id: string) => void;
    onAddChild: (parentId: string | null, title: string) => void;
}) {
    const t = useT();
    const [expanded, setExpanded] = useState(true);
    const item = node.item;
    const cfg = STATUS_CONFIG[item.status];
    const prioCfg = PRIORITY_CONFIG[item.priority];
    const hasChildren = node.children.length > 0;

    return (
        <div style={{ marginLeft: depth * 24 }}>
            <div onClick={() => onSelect(selectedId === item.id ? null : item.id)}
                className={cn('group flex items-center gap-2 rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors',
                    selectedId === item.id ? 'bg-primary/10' : 'hover:bg-muted')}>
                {/* Expand/collapse */}
                {hasChildren ? (
                    <button onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
                        className="flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                        <span className={cn('text-[10px] transition-transform', expanded && 'rotate-90')}>▶</span>
                    </button>
                ) : <div className="size-4" />}

                {/* Status icon */}
                <button onClick={e => { e.stopPropagation(); onCycleStatus(item.id); }}>
                    <MaterialIcon name={cfg.icon} size={16} className={cfg.color} />
                </button>

                {/* Title */}
                <span className={cn('flex-1 text-xs font-medium', item.status === 'done' && 'line-through text-muted-foreground')}>{item.title}</span>

                {/* Priority dot */}
                <div className={cn('size-1.5 rounded-full', prioCfg.dot)} />

                {/* Due date */}
                {item.dueDate && <span className="text-[10px] text-muted-foreground">{formatDueDate(item.dueDate)}</span>}

                {/* Children count */}
                {hasChildren && <span className="text-[10px] text-muted-foreground">({node.children.length})</span>}

                {/* + Add child — appears on hover */}
                <button onClick={e => { e.stopPropagation(); setExpanded(true); }}
                    className="hidden size-5 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 group-hover:flex"
                    title={t('spaces.panels.tasks.unteraufgabe_hinzufuegen')}>
                    <MaterialIcon name="add" size={14} />
                </button>
            </div>

            {/* Connection line + children + quick add */}
            {expanded && (
                <div className="relative ml-2 border-l border-border/50 pl-1">
                    {node.children.map(child => (
                        <MindmapNode key={child.item.id} node={child} depth={0} selectedId={selectedId} onSelect={onSelect} onCycleStatus={onCycleStatus} onAddChild={onAddChild} />
                    ))}
                    <MindmapQuickAdd onAdd={title => onAddChild(item.id, title)} placeholder={t('spaces.panels.tasks.unteraufgabe')} />
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Main Export
// ═══════════════════════════════════════════════════════════════════

export function TasksPanel({ space, fullscreen }: { space: SpaceItem; fullscreen?: boolean }): JSX.Element {
    const t = useT();
    const { boards, activeBoard, items, groups, loading, createItem, updateItem, moveItem, deleteItem, createGroup, updateGroup, deleteGroup, refresh } = useBoard(space.id);
    const [viewMode, setViewMode] = useState<ViewMode>(fullscreen ? 'kanban' : 'list');

    const columns: BoardColumn[] = activeBoard?.config?.columns ?? [
        { key: 'todo', label: t('app.misc.zu_erledigen'), color: '#fecaca' },
        { key: 'in_progress', label: t('app.misc.in_arbeit'), color: '#fde68a' },
        { key: 'review', label: t('common.review'), color: '#bfdbfe' },
        { key: 'done', label: t('common.done'), color: '#a7f3d0' },
    ];

    const openCount = items.filter(i => i.status !== 'done').length;

    if (loading) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }

    if (!activeBoard) {
        return (
            <div className="flex h-full flex-col items-center justify-center p-6 text-xs text-muted-foreground">
                <p>{t('spaces.panels.tasks.kein_board_vorhanden')}</p>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} openCount={openCount} refresh={refresh} />
            <div className="min-h-0 flex-1">
                {viewMode === 'list' && <ListView items={items} groups={groups} spaceId={space.id} createItem={createItem} updateItem={updateItem} moveItem={moveItem} deleteItem={deleteItem} createGroup={createGroup} updateGroup={updateGroup} deleteGroup={deleteGroup} />}
                {viewMode === 'kanban' && <KanbanView items={items} columns={columns} groups={groups} spaceId={space.id} moveItem={moveItem} createItem={createItem} deleteItem={deleteItem} updateItem={updateItem} />}
                {viewMode === 'gantt' && <GanttView items={items} spaceId={space.id} updateItem={updateItem} deleteItem={deleteItem} />}
                {viewMode === 'mindmap' && <MindmapView items={items} spaceId={space.id} updateItem={updateItem} deleteItem={deleteItem} moveItem={moveItem} createItem={createItem} />}
                {viewMode === 'reede' && <ReedeView items={items} spaceId={space.id} refresh={refresh} />}
                {viewMode === 'trash' && <TrashView spaceId={space.id} refresh={refresh} />}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Phase 14: Reede View — Aufgaben die einschlafen oder Termin verstrichen
// ═══════════════════════════════════════════════════════════════════

function ReedeView({ items, spaceId, refresh }: { items: WorkItem[]; spaceId: string; refresh: () => void }): JSX.Element {
    const t = useT();
    const reedeItems = useMemo(() => {
        return items
            .map(it => ({ item: it, reede: isInReede(it) }))
            .filter((x): x is { item: WorkItem; reede: NonNullable<ReturnType<typeof isInReede>> } => x.reede !== null)
            .sort((a, b) => b.reede.days - a.reede.days);
    }, [items]);

    const jwt = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot).platform?.token ?? '';
    const gateway = projectGateway;

    const [busyId, setBusyId] = useState<string | null>(null);

    async function reviveItem(itemId: string) {
        if (!jwt) return;
        setBusyId(itemId);
        try { await gateway.reviveItem(jwt, spaceId, itemId); refresh(); }
        finally { setBusyId(null); }
    }
    async function parkItem(itemId: string) {
        if (!jwt) return;
        const note = window.prompt('Kurzer Vermerk (optional):') ?? undefined;
        setBusyId(itemId);
        try { await gateway.parkItem(jwt, spaceId, itemId, note ? { note } : undefined); refresh(); }
        finally { setBusyId(null); }
    }
    async function softDelete(itemId: string) {
        if (!jwt) return;
        // Phase F: Begruendungs-Pflicht — fragen wir per prompt(), weil der
        // Reede-Kontext eine schnelle Erfassung braucht. Im Detail-Panel
        // kommt die strukturierte Inline-Form zum Einsatz.
        const reason = window.prompt('Bitte Begruendung fuer das Loeschen eingeben (DSGVO):');
        if (!reason || reason.trim().length < 3) return;
        setBusyId(itemId);
        try { await gateway.deleteItem(jwt, spaceId, itemId, reason.trim()); refresh(); }
        finally { setBusyId(null); }
    }
    /**
     * Phase G.4: "Einschlafen lassen" — die Aufgabe wird als erledigt
     * markiert mit completionType='snoozed' + Begruendung. Backend erzeugt
     * automatisch eine Akte im DMS (Phase G.2). Damit gibt es keinen Verlust
     * von Vorgaengen — sie sind endgueltig dokumentiert, bleiben aber nicht
     * in der aktiven Liste haengen.
     */
    async function snooze(itemId: string) {
        if (!jwt) return;
        const note = window.prompt('Warum wird diese Aufgabe ohne Erledigung beendet? (Pflichtbegruendung)');
        if (!note || note.trim().length < 3) return;
        setBusyId(itemId);
        try {
            await gateway.updateItem(jwt, spaceId, itemId, {
                status: 'done',
                completionType: 'snoozed',
                completionNote: note.trim(),
            });
            refresh();
        } finally { setBusyId(null); }
    }

    if (reedeItems.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground">
                <MaterialIcon name="anchor" size={48} className="mb-3 opacity-30" />
                <p className="font-medium">{t('spaces.panels.tasks.reede_ist_leer')}</p>
                <p className="mt-1 text-[11px]">{t('spaces.panels.tasks.keine_aufgaben_schlafen_oder_haben_verst')}</p>
            </div>
        );
    }

    return (
        <ScrollArea className="h-full">
            <div className="space-y-1.5 p-3">
                <div className="mb-2 text-[11px] text-muted-foreground">
                    {reedeItems.length} {t('spaces.panels.tasks.aufgabe')}{reedeItems.length === 1 ? '' : 'n'} {t('spaces.panels.tasks.in_der_reede_schlaeft_seit')} {getReedeStaleDays()}{t('spaces.panels.tasks.tagen_oder_termin_verstrichen')}
                </div>
                {reedeItems.map(({ item, reede }) => (
                    <div key={item.id} className="rounded-lg border bg-background p-3">
                        <div className="flex items-start gap-2">
                            <MaterialIcon name="anchor" size={16} className="mt-0.5 shrink-0 text-slate-400" />
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium">{item.title}</div>
                                <div className="mt-0.5 text-[10px] text-muted-foreground">
                                    {reede.reason === 'overdue' && `Termin überschritten um ${reede.days} Tag${reede.days === 1 ? '' : 'en'}`}
                                    {reede.reason === 'stale' && `Schläft seit ${reede.days} Tagen`}
                                    {reede.reason === 'parked' && `Vertagt seit ${reede.days} Tag${reede.days === 1 ? '' : 'en'}${item.parkedNote ? ` — "${item.parkedNote}"` : ''}`}
                                </div>
                                {item.responsibleUserId && (
                                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <MaterialIcon name="person" size={12} />
                                        <span className="truncate">{shortUserLabel(item.responsibleUserId)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <button onClick={() => reviveItem(item.id)} disabled={busyId === item.id}
                                className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50">
                                <MaterialIcon name="autorenew" size={12} /> {t('spaces.panels.tasks.wiederbeleben')}
                            </button>
                            {reede.reason !== 'parked' && (
                                <button onClick={() => parkItem(item.id)} disabled={busyId === item.id}
                                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/80 disabled:opacity-50">
                                    <MaterialIcon name="bedtime" size={12} /> {t('spaces.panels.tasks.vertagen')}
                                </button>
                            )}
                            <button onClick={() => snooze(item.id)} disabled={busyId === item.id}
                                title={t('spaces.panels.tasks.aufgabe_als_erledigt_markieren_mit_begru')}
                                className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-400">
                                <MaterialIcon name="check_circle" size={12} /> {t('spaces.panels.tasks.einschlafen_lassen')}
                            </button>
                            <button onClick={() => softDelete(item.id)} disabled={busyId === item.id}
                                className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950 dark:text-red-400">
                                <MaterialIcon name="delete" size={12} /> {t('spaces.panels.tasks.loeschen')}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </ScrollArea>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Phase 14: Trash View — Papierkorb (30 Tage Aufbewahrung)
// ═══════════════════════════════════════════════════════════════════

type TrashItem = {
    id: string; title: string; status: string; boardId: string;
    deletedAt: string; deletedBy: string | null; responsibleUserId: string | null;
};

function TrashView({ spaceId, refresh }: { spaceId: string; refresh: () => void }): JSX.Element {
    const t = useT();
    const jwt = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot).platform?.token ?? '';
    const gateway = projectGateway;

    const [items, setItems] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await gateway.listTrash(jwt, spaceId);
            setItems(res.items);
        } finally { setLoading(false); }
    }, [jwt, spaceId, gateway]);

    useEffect(() => { load(); }, [load]);

    async function restore(itemId: string) {
        if (!jwt) return;
        setBusyId(itemId);
        try { await gateway.restoreItem(jwt, spaceId, itemId); await load(); refresh(); }
        finally { setBusyId(null); }
    }
    async function purge(itemId: string) {
        if (!jwt) return;
        if (!window.confirm('Endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return;
        setBusyId(itemId);
        try { await gateway.purgeItem(jwt, spaceId, itemId); await load(); }
        finally { setBusyId(null); }
    }

    if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;

    if (items.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground">
                <MaterialIcon name="delete_outline" size={48} className="mb-3 opacity-30" />
                <p className="font-medium">{t('spaces.panels.tasks.papierkorb_ist_leer')}</p>
            </div>
        );
    }

    return (
        <ScrollArea className="h-full">
            <div className="space-y-1.5 p-3">
                <div className="mb-2 text-[11px] text-muted-foreground">
                    {items.length} {t('spaces.panels.tasks.aufgabe')}{items.length === 1 ? '' : 'n'} {t('spaces.panels.tasks.im_papierkorb_wird_nach')} {getTrashRetentionDays()} {t('spaces.panels.tasks.tagen_automatisch_endgueltig_geloescht')}
                </div>
                {items.map(item => {
                    const deletedDays = Math.floor((Date.now() - new Date(item.deletedAt).getTime()) / 86400000);
                    const remaining = Math.max(0, getTrashRetentionDays() - deletedDays);
                    return (
                        <div key={item.id} className="rounded-lg border bg-background p-3">
                            <div className="flex items-start gap-2">
                                <MaterialIcon name="delete" size={16} className="mt-0.5 shrink-0 text-red-400" />
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium">{item.title}</div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                                        {t('spaces.panels.tasks.geloescht_von')} {item.deletedBy ? shortUserLabel(item.deletedBy) : '?'} {t('spaces.panels.tasks.noch')} {remaining} {t('spaces.panels.tasks.tag')}{remaining === 1 ? '' : 'e'} {t('spaces.panels.tasks.bis_endgueltig')}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 flex gap-1.5">
                                <button onClick={() => restore(item.id)} disabled={busyId === item.id}
                                    className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50">
                                    <MaterialIcon name="restore" size={12} /> {t('spaces.panels.tasks.wiederherstellen')}
                                </button>
                                <button onClick={() => purge(item.id)} disabled={busyId === item.id}
                                    className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950 dark:text-red-400">
                                    <MaterialIcon name="delete_forever" size={12} /> {t('spaces.panels.tasks.sofort_endgueltig_loeschen')}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ScrollArea>
    );
}
