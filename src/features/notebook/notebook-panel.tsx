/**
 * NotebookPanel — Digitales Mitteilungsheft.
 *
 * Lehrer: Schueler-Liste mit Badges, klick → Eintraege fuer diesen Schueler.
 * Eltern: Sehen direkt die Eintraege ihres Kindes.
 */

import { type JSX, useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { sessionStore } from '@/core/session/session-store';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StudentSummary {
    userId: string;
    name: string;
    entryCount: number;
    unacknowledgedCount: number;
}

interface NotebookEntry {
    id: string;
    studentUserId: string;
    authorId: string;
    direction: 'school_to_home' | 'home_to_school';
    content: string;
    category: 'info' | 'request' | 'praise' | 'concern';
    acknowledgedAt: string | null;
    acknowledgedBy: string | null;
    createdAt: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
    info: { label: 'Hinweis', icon: 'info', color: 'text-blue-500' },
    request: { label: 'Bitte', icon: 'help', color: 'text-amber-500' },
    praise: { label: 'Lob', icon: 'star', color: 'text-emerald-500' },
    concern: { label: 'Sorge', icon: 'warning', color: 'text-red-500' },
};

// ─── API ────────────────────────────────────────────────────────────────────

const API_BASE = '/api/platform/v1';

async function fetchStudents(jwt: string, spaceId: string): Promise<StudentSummary[]> {
    const res = await fetch(`${API_BASE}/spaces/${spaceId}/notebook/students`, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    const data = await res.json();
    return data.students ?? [];
}

async function fetchEntries(jwt: string, spaceId: string, studentUserId: string): Promise<NotebookEntry[]> {
    const res = await fetch(`${API_BASE}/spaces/${spaceId}/notebook/${encodeURIComponent(studentUserId)}`, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    const data = await res.json();
    return data.entries ?? [];
}

async function createEntry(jwt: string, spaceId: string, body: Record<string, unknown>) {
    const res = await fetch(`${API_BASE}/spaces/${spaceId}/notebook`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function acknowledgeEntry(jwt: string, spaceId: string, entryId: string) {
    const res = await fetch(`${API_BASE}/spaces/${spaceId}/notebook/${entryId}/acknowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    });
    return res.json();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NotebookPanel({ space }: { space: SpaceItem }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [students, setStudents] = useState<StudentSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null);
    const mountedRef = useRef(true);

    const loadStudents = useCallback(async () => {
        if (!jwt) return;
        try {
            const data = await fetchStudents(jwt, space.id);
            if (mountedRef.current) setStudents(data);
        } catch { /* ignore */ }
        finally { if (mountedRef.current) setLoading(false); }
    }, [jwt, space.id]);

    useEffect(() => { mountedRef.current = true; loadStudents(); return () => { mountedRef.current = false; }; }, [loadStudents]);

    useWorkflowEvents((event, data) => {
        if (event === 'note.changed' && (data as { spaceId?: string }).spaceId === space.id) loadStudents();
    });

    if (loading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }

    if (selectedStudent) {
        return (
            <StudentNotebook
                student={selectedStudent}
                spaceId={space.id}
                jwt={jwt!}
                onBack={() => { setSelectedStudent(null); loadStudents(); }}
            />
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
                <span className="text-sm font-semibold">{t('notebook.notebook.mitteilungsheft')}</span>
            </div>

            {students.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                    <MaterialIcon name="menu_book" size={40} className="text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">{t('notebook.notebook.noch_keine_eintraege')}</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                        {t('notebook.notebook.waehlen_sie_ein_space-mitglied_um_eine_m')}
                    </p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto divide-y">
                    {students.map(s => (
                        <button key={s.userId} onClick={() => setSelectedStudent(s)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                                {s.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">{s.name}</span>
                                <div className="text-[10px] text-muted-foreground">
                                    {s.entryCount} {s.entryCount === 1 ? 'Eintrag' : 'Eintraege'}
                                </div>
                            </div>
                            {s.unacknowledgedCount > 0 && (
                                <span className="flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                                    {s.unacknowledgedCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Eintraege fuer einen Schueler ──────────────────────────────────────────

function StudentNotebook({ student, spaceId, jwt, onBack }: {
    student: StudentSummary; spaceId: string; jwt: string; onBack: () => void;
}): JSX.Element {
    const t = useT();
    const [entries, setEntries] = useState<NotebookEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [newContent, setNewContent] = useState('');
    const [category, setCategory] = useState<string>('info');
    const [submitting, setSubmitting] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const myUserId = session.matrix?.userId;

    const load = useCallback(async () => {
        const data = await fetchEntries(jwt, spaceId, student.userId);
        setEntries(data);
        setLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, [jwt, spaceId, student.userId]);

    useEffect(() => { load(); }, [load]);

    useWorkflowEvents((event, data) => {
        if (event === 'note.changed' && (data as { studentUserId?: string }).studentUserId === student.userId) load();
    });

    const handleSend = async () => {
        if (!newContent.trim() || submitting) return;
        setSubmitting(true);
        try {
            await createEntry(jwt, spaceId, {
                studentUserId: student.userId,
                content: newContent.trim(),
                category,
            });
            setNewContent('');
            await load();
        } finally { setSubmitting(false); }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
                    <MaterialIcon name="chevron_left" size={18} />
                </button>
                <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                    {student.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <span className="text-sm font-semibold">{student.name}</span>
                    <p className="text-[10px] text-muted-foreground">{t('notebook.notebook.mitteilungsheft')}</p>
                </div>
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {loading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
                ) : entries.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-8">{t('notebook.notebook.noch_keine_eintraege')}</p>
                ) : (
                    entries.map(entry => {
                        const isFromSchool = entry.direction === 'school_to_home';
                        const cat = CATEGORY_CONFIG[entry.category] ?? CATEGORY_CONFIG.info;
                        const isOwn = entry.authorId === myUserId;

                        return (
                            <div key={entry.id} className={cn('rounded-lg border p-3', isFromSchool ? 'bg-blue-50/50 dark:bg-blue-950/10 border-blue-200/50 dark:border-blue-800/30' : 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/50 dark:border-amber-800/30')}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                                        {isFromSchool ? 'Schule → Eltern' : 'Eltern → Schule'}
                                    </span>
                                    <MaterialIcon name={cat.icon} size={14} className={cat.color} />
                                    <span className={cn('text-[9px]', cat.color)}>{cat.label}</span>
                                    <span className="flex-1" />
                                    <span className="text-[9px] text-muted-foreground">{formatDate(entry.createdAt)} {formatTime(entry.createdAt)}</span>
                                </div>
                                <p className="text-xs text-foreground/90 whitespace-pre-wrap">{entry.content}</p>
                                {entry.acknowledgedAt ? (
                                    <div className="mt-2 flex items-center gap-1 text-[9px] text-emerald-600">
                                        <MaterialIcon name="check" size={14} />{t('notebook.notebook.gelesen_am')} {formatDate(entry.acknowledgedAt)}
                                    </div>
                                ) : !isOwn ? (
                                    <button
                                        onClick={() => acknowledgeEntry(jwt, spaceId, entry.id).then(() => load())}
                                        className="mt-2 flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
                                    >
                                        <MaterialIcon name="check" size={14} />{t('notebook.notebook.gelesen')}
                                    </button>
                                ) : null}
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t px-4 py-3 space-y-2">
                <div className="flex gap-1">
                    {Object.entries(CATEGORY_CONFIG).map(([k, cfg]) => (
                        <button key={k} onClick={() => setCategory(k)}
                            className={cn('flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                                category === k ? `bg-primary/10 text-primary` : 'text-muted-foreground hover:bg-muted')}>
                            <MaterialIcon name={cfg.icon} size={14} />{cfg.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-end gap-2">
                    <textarea
                        value={newContent}
                        onChange={e => setNewContent(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder={t('notebook.notebook.mitteilung_schreiben')}
                        rows={2}
                        className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                    />
                    <button onClick={handleSend} disabled={!newContent.trim() || submitting}
                        className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                        <MaterialIcon name="send" size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
