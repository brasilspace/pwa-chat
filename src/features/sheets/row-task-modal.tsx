/**
 * RowTaskModal — Zeile als Aufgabe anlegen.
 *
 * Pre-filled aus den Spalten-Werten der aktiven Zeile:
 *   - title: erste Text/Auswahl-Spalte mit Wert
 *   - assignees: Person-Spalte → matrixUserId aus Kontakten resolvedy
 *   - dueDate: Datum-Spalte
 *   - status: Status-Spalte
 */

import { type JSX, useState, useEffect, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { sheetRowTasksApi, type BoardOption } from './use-sheet-row-tasks';
import { useContacts } from '@/features/contacts/use-contacts';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    sheetId: string;
    worksheetId: string;
    row: number;
    /** Werte aus den Spalten der aktiven Zeile, bereits ausgelesen. */
    prefill: {
        title: string;
        dueDate?: string;
        assignedDisplayName?: string;
        status?: string;
    };
    onClose: () => void;
    onCreated: () => void;
}

const STATUS_OPTIONS = [
    { value: 'todo', labelKey: 'common.open' },
    { value: 'in_progress', labelKey: 'app.misc.in_arbeit' },
    { value: 'done', labelKey: 'common.done' },
    { value: 'blocked', labelKey: 'app.misc.blockiert' },
];

const PRIORITY_OPTIONS = [
    { value: 'low', labelKey: 'app.misc.niedrig' },
    { value: 'medium', labelKey: 'app.misc.mittel' },
    { value: 'high', labelKey: 'app.misc.hoch' },
];

export function RowTaskModal({ sheetId, worksheetId, row, prefill, onClose, onCreated }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { contacts } = useContacts();

    const [title, setTitle] = useState(prefill.title);
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState(mapStatus(prefill.status));
    const [priority, setPriority] = useState('medium');
    const [dueDate, setDueDate] = useState(prefill.dueDate ?? '');
    const [assigneeId, setAssigneeId] = useState<string>(() =>
        contacts.find(c => c.displayName === prefill.assignedDisplayName)?.id ?? '',
    );
    const [boards, setBoards] = useState<BoardOption[]>([]);
    const [boardId, setBoardId] = useState('');
    const [busy, setBusy] = useState(false);
    const [boardsError, setBoardsError] = useState<string | null>(null);

    useEffect(() => {
        if (!jwt) return;
        sheetRowTasksApi.listBoards(jwt, sheetId)
            .then(r => {
                setBoards(r.boards);
                if (r.boards.length === 1) setBoardId(r.boards[0].id);
                else if (r.boards.length === 0) setBoardsError('In diesem Space gibt es noch kein Board fuer Aufgaben. Bitte zuerst eines anlegen.');
            })
            .catch(() => setBoardsError('Boards konnten nicht geladen werden'));
    }, [jwt, sheetId]);

    // Wenn die Kontakte erst spaet kommen, mappe assignedDisplayName → ID nach
    useEffect(() => {
        if (!assigneeId && prefill.assignedDisplayName) {
            const c = contacts.find(c => c.displayName === prefill.assignedDisplayName);
            if (c) setAssigneeId(c.id);
        }
    }, [contacts, prefill.assignedDisplayName, assigneeId]);

    const create = async () => {
        if (!jwt || !title.trim() || !boardId) return;
        setBusy(true);
        try {
            await sheetRowTasksApi.create(jwt, sheetId, {
                worksheetId,
                row,
                boardId,
                title: title.trim(),
                description: description.trim() || null,
                status,
                priority,
                assignees: assigneeId ? [assigneeId] : [],
                dueDate: dueDate ? new Date(dueDate).toISOString() : null,
            });
            onCreated();
        } catch (e) {
            alert('Aufgabe anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-lg bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="font-semibold inline-flex items-center gap-2">
                        <MaterialIcon name="check_box" size={16} className="size-4" /> {t('sheets.row_task_modal.zeile_als_aufgabe_anlegen')}
                    </h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {boardsError && (
                        <p className="rounded bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                            {boardsError}
                        </p>
                    )}

                    <div>
                        <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.row_task_modal.titel')}</label>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            autoFocus
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.row_task_modal.beschreibung_optional')}</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={2}
                            className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-sm"
                        />
                    </div>

                    {boards.length > 1 && (
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.row_task_modal.board')}</label>
                            <select
                                value={boardId}
                                onChange={e => setBoardId(e.target.value)}
                                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            >
                                <option value="">{t('sheets.row_task_modal.board_waehlen')}</option>
                                {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.row_task_modal.status')}</label>
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value)}
                                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            >
                                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.row_task_modal.prioritaet')}</label>
                            <select
                                value={priority}
                                onChange={e => setPriority(e.target.value)}
                                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            >
                                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{t(p.labelKey)}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.row_task_modal.faellig_am')}</label>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={e => setDueDate(e.target.value)}
                                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.row_task_modal.verantwortlich')}</label>
                            <select
                                value={assigneeId}
                                onChange={e => setAssigneeId(e.target.value)}
                                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            >
                                <option value="">{t('sheets.row_task_modal.niemand')}</option>
                                {contacts.map(c => (
                                    <option key={c.id} value={c.id}>{c.displayName}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-border p-3">
                    <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs">{t('sheets.row_task_modal.abbrechen')}</button>
                    <button
                        onClick={create}
                        disabled={busy || !title.trim() || !boardId}
                        className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="size-3 animate-spin inline" /> : 'Aufgabe anlegen'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Mappt Status-Strings aus Sheet-Spalten auf project-Module-Status-Codes. */
function mapStatus(s?: string): string {
    if (!s) return 'todo';
    const lower = s.toLowerCase();
    if (lower.includes('arbeit') || lower.includes('progress')) return 'in_progress';
    if (lower.includes('erledigt') || lower.includes('done') || lower.includes('fertig')) return 'done';
    if (lower.includes('block')) return 'blocked';
    return 'todo';
}
