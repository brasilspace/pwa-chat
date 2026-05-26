/**
 * ShareDialog — Nachricht in andere Hubs teilen.
 *
 * Phase 1: Chat-Ziele (Space-Chats + 1:1 DMs) voll funktional.
 * Phase 2 (angekuendigt): Aufgabe, Kalender, Dokument — als Placeholder-Tiles.
 *
 * Weiterleitung erfolgt als neuer m.text im Ziel-Raum mit Zitat-Block:
 *   > Sender, 13.04. 14:30:
 *   > Original-Text ...
 *   (Weitergeleitet)
 *
 * Kein Link zum Quell-Raum — Privacy-First. Siehe Design-Entscheidung
 * in der Konversation vom 2026-04-13.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ListTodo, CalendarPlus, FileUp, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { chatStore } from '@/features/chat/chat-store';
import { useSpaces } from '@/features/spaces/use-spaces';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { createCalendarGateway } from '@/gateways/platform/calendar-gateway';
import { createMatrixGateway } from '@/gateways/matrix/matrix-gateway';
import type { CalendarLayer } from '@/features/calendar/calendar-types';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

const matrixGateway = createMatrixGateway();
const projectGateway = createProjectGateway();
const calendarGateway = createCalendarGateway();

const platformGateway = createPlatformGateway();

interface Props {
    messageBody: string;
    senderDisplayName: string;
    timestamp: number;
    /** Matrix-Event-ID der Quell-Nachricht — wird beim Aufgaben-Erstellen
     *  als sourceMatrixEventId gespeichert, sodass die Chat-Bubble spaeter
     *  den Spalten-Status der Aufgabe als Border-Farbe rendern kann. */
    sourceEventId?: string;
    /** Initial aktiver Tab (Default: 'chat'). */
    initialTab?: 'chat' | 'task' | 'calendar' | 'document';
    contextSpaceId?: string;
    onClose: () => void;
}

type TargetTab = 'chat' | 'task' | 'calendar' | 'document';

interface ShareTarget {
    kind: 'space' | 'user';
    id: string;
    label: string;
    subtitle?: string;
}

function formatQuoteTime(ts: number): string {
    const d = new Date(ts);
    const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(d);
    const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(d);
    return `${date} ${time}`;
}

function buildForwardBody(originalBody: string, sender: string, timestamp: number): string {
    const when = formatQuoteTime(timestamp);
    const quoted = originalBody
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    return `> ${sender}, ${when}:\n${quoted}\n\n_Weitergeleitet_`;
}

export function ShareDialog({ messageBody, senderDisplayName, timestamp, sourceEventId, initialTab, contextSpaceId, onClose }: Props) {
    const t = useT();
    const [activeTab, setActiveTab] = useState<TargetTab>(initialTab ?? 'chat');
    const [query, setQuery] = useState('');
    const [sending, setSending] = useState<string | null>(null);
    const [sentIds, setSentIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? null;
    const accessToken = session.matrix?.accessToken ?? null;
    const myUserId = session.matrix?.userId ?? null;

    const { spaces } = useSpaces();
    const [users, setUsers] = useState<Array<{ id: string; displayName: string; username: string }>>([]);

    useEffect(() => {
        if (!jwt) return;
        platformGateway.getUsers(jwt).then((res) => {
            setUsers(res.users.map((u) => ({ id: u.id, displayName: u.displayName || u.username, username: u.username })));
        }).catch(() => { /* non-critical */ });
    }, [jwt]);

    // ESC zum Schliessen + Body-Scroll sperren
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [onClose]);

    const targets: ShareTarget[] = useMemo(() => {
        const list: ShareTarget[] = [];
        // Spaces mit Chat-Room
        for (const s of spaces) {
            if (!s.matrixChatRoomId) continue;
            list.push({ kind: 'space', id: s.matrixChatRoomId, label: s.name, subtitle: 'Space' });
        }
        // Andere Nutzer (ohne einen selbst)
        for (const u of users) {
            const matrixId = `@${u.username}:${(myUserId ?? '').split(':')[1] ?? ''}`;
            if (matrixId === myUserId) continue;
            list.push({ kind: 'user', id: matrixId, label: u.displayName, subtitle: 'Direktchat' });
        }
        return list;
    }, [spaces, users, myUserId]);

    const filteredTargets = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return targets;
        return targets.filter((_t) => _t.label.toLowerCase().includes(q));
    }, [targets, query]);

    const handleShare = async (target: ShareTarget) => {
        if (!accessToken) return;
        setSending(target.id);
        setError(null);
        try {
            let roomId: string;
            if (target.kind === 'space') {
                roomId = target.id;
            } else {
                const existing = chatStore.getDirectRoomId(target.id);
                if (existing) {
                    roomId = existing;
                } else if (myUserId) {
                    // Autoritativ — verhindert Duplikat-DM-Räume, wenn der
                    // lokale Cache nach Login noch nicht hydrated ist.
                    const res = await matrixGateway.getOrCreateDirectChat(accessToken, myUserId, target.id);
                    roomId = res.room_id;
                    chatStore.setDirectRoom(target.id, roomId);
                } else {
                    const res = await matrixGateway.createDirectChat(accessToken, target.id);
                    roomId = res.room_id;
                    chatStore.setDirectRoom(target.id, roomId);
                }
            }
            const body = buildForwardBody(messageBody, senderDisplayName, timestamp);
            const txnId = `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await matrixGateway.sendMessage(accessToken, roomId, txnId, body);
            setSentIds((prev) => new Set(prev).add(target.id));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Teilen fehlgeschlagen');
        } finally {
            setSending(null);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 animate-in fade-in"
            onClick={onClose}
        >
            <div
                className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl bg-background shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b px-5 py-3.5">
                    <div>
                        <h3 className="text-base font-semibold">{t('app.misc.teilen')}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t('app.misc.nachricht_an_andere_ziele_weiterleiten')}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={t('app.misc.schliessen')}
                    >
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="grid grid-cols-4 gap-1 border-b bg-muted/30 p-1.5">
                    <TabButton active={activeTab === 'chat'} disabled={false} onClick={() => setActiveTab('chat')} icon={<MaterialIcon name="chat_bubble" size={16} className="size-4" />} label={t('app.misc.chat')} />
                    <TabButton active={activeTab === 'task'} disabled={false} onClick={() => setActiveTab('task')} icon={<ListTodo className="size-4" />} label={t('app.misc.aufgabe')} />
                    <TabButton active={activeTab === 'calendar'} disabled={false} onClick={() => setActiveTab('calendar')} icon={<CalendarPlus className="size-4" />} label={t('app.misc.kalender')} />
                    <TabButton active={activeTab === 'document'} disabled={false} onClick={() => setActiveTab('document')} icon={<FileUp className="size-4" />} label={t('app.misc.dokument')} />
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'chat' ? (
                        <div className="p-3">
                            {/* Suchfeld */}
                            <div className="relative mb-3">
                                <MaterialIcon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={t('app.misc.space_oder_person_suchen')}
                                    className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
                                    autoFocus
                                />
                            </div>

                            {/* Vorschau der geteilten Nachricht */}
                            <div className="mb-3 rounded-md border-l-2 border-primary/40 bg-muted/30 px-3 py-2">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t('app.misc.wird_geteilt')}</p>
                                <p className="mt-0.5 line-clamp-3 text-xs">{messageBody || '(ohne Text)'}</p>
                            </div>

                            {filteredTargets.length === 0 ? (
                                <p className="p-4 text-center text-xs text-muted-foreground">{t('app.misc.keine_treffer')}</p>
                            ) : (
                                <div className="flex flex-col">
                                    {filteredTargets.map((_t) => {
                                        const isSent = sentIds.has(_t.id);
                                        const isSending = sending === _t.id;
                                        return (
                                            <button
                                                key={`${_t.kind}-${_t.id}`}
                                                type="button"
                                                onClick={() => !isSent && !isSending && handleShare(_t)}
                                                disabled={isSent || isSending}
                                                className={cn(
                                                    'flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                                                    isSent ? 'bg-emerald-500/10' : 'hover:bg-muted',
                                                )}
                                            >
                                                <div className={cn(
                                                    'flex size-9 items-center justify-center rounded-full text-muted-foreground',
                                                    _t.kind === 'space' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
                                                )}>
                                                    {_t.kind === 'space' ? <MaterialIcon name="groups" size={16} className="size-4" /> : <MaterialIcon name="chat_bubble" size={16} className="size-4" />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium">{_t.label}</p>
                                                    <p className="text-[10px] text-muted-foreground">{_t.subtitle}</p>
                                                </div>
                                                {isSending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                                                {isSent && <MaterialIcon name="check" size={16} className="size-4 text-emerald-500" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {error && <p className="mt-3 px-1 text-xs text-destructive">{error}</p>}
                        </div>
                    ) : activeTab === 'task' ? (
                        <TaskPanel messageBody={messageBody} sourceEventId={sourceEventId} contextSpaceId={contextSpaceId} jwt={jwt} onClose={onClose} />
                    ) : activeTab === 'calendar' ? (
                        <CalendarPanel messageBody={messageBody} jwt={jwt} onClose={onClose} />
                    ) : (
                        <DocumentPanel messageBody={messageBody} jwt={jwt} onClose={onClose} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Task Panel ───────────────────────────────────────────────────────

function TaskPanel({ messageBody, sourceEventId, contextSpaceId, jwt, onClose }: { messageBody: string; sourceEventId?: string; contextSpaceId?: string; jwt: string | null; onClose: () => void }) {
    const t = useT();
    const { spaces } = useSpaces();
    const eligibleSpaces = useMemo(() => spaces.filter((s) => s.type !== 'concept'), [spaces]);
    const [spaceId, setSpaceId] = useState<string>('');
    const [title, setTitle] = useState(() => messageBody.slice(0, 80) || 'Aus Chat-Nachricht');
    const [description, setDescription] = useState(messageBody);
    const [responsibleUserId, setResponsibleUserId] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const myUserId = sessionStore.getSnapshot().matrix?.userId ?? null;

    // Default-Space: der aktuell offene Chat-Space (contextSpaceId), sonst erster
    // verfuegbarer eligible-Space. So landet die Aufgabe automatisch im richtigen
    // Space wenn ich aus einem Space-Chat heraus eine Aufgabe erstelle.
    useEffect(() => {
        if (spaceId) return;
        if (contextSpaceId && eligibleSpaces.some(s => s.id === contextSpaceId)) {
            setSpaceId(contextSpaceId);
        } else if (eligibleSpaces.length > 0) {
            setSpaceId(eligibleSpaces[0].id);
        }
    }, [eligibleSpaces, spaceId, contextSpaceId]);

    // Mitglieder des gewaehlten Spaces laden — fuer Verantwortlich-Dropdown.
    const [members, setMembers] = useState<{ userId: string; displayName: string }[]>([]);
    useEffect(() => {
        if (!jwt || !spaceId) { setMembers([]); return; }
        platformGateway.getSpaceMembers(jwt, spaceId)
            .then(r => setMembers(r.items.map(m => ({
                userId: m.userId,
                displayName: m.user.displayName || m.userId.split(':')[0].replace('@', ''),
            }))))
            .catch(() => setMembers([]));
    }, [jwt, spaceId]);

    // Default-Verantwortlicher: aktueller User (= "wer es macht ist potenziell der Verantwortliche").
    useEffect(() => {
        if (!responsibleUserId && myUserId && members.some(m => m.userId === myUserId)) {
            setResponsibleUserId(myUserId);
        }
    }, [myUserId, members, responsibleUserId]);

    // Sortierung: aktueller User zuerst.
    const sortedMembers = useMemo(() => {
        const list = [...members];
        list.sort((a, b) => {
            if (a.userId === myUserId) return -1;
            if (b.userId === myUserId) return 1;
            return a.displayName.localeCompare(b.displayName);
        });
        return list;
    }, [members, myUserId]);

    const handleSubmit = async () => {
        if (!jwt || !spaceId) return;
        setBusy(true);
        setError(null);
        try {
            await projectGateway.createItemFromMessage(jwt, spaceId, {
                title,
                body: description,
                sourceMatrixEventId: sourceEventId,
                responsibleUserId: responsibleUserId || null,
            });
            setDone(true);
            setTimeout(onClose, 1200);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Aufgabe konnte nicht erstellt werden. Moeglicherweise hat der Space noch kein Board.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 p-4">
            <Field label={t('app.misc.space')}>
                <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                    {eligibleSpaces.length === 0 && <option value="">{t('app.misc.keine_verfuegbar')}</option>}
                    {eligibleSpaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </Field>
            <Field label={t('app.misc.titel')}>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
            <Field label={t('app.misc.beschreibung')}>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
            <Field label={t('app.misc.verantwortlich')}>
                <select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                    <option value="">{t('app.misc.niemand')}</option>
                    {sortedMembers.map((m) => (
                        <option key={m.userId} value={m.userId}>
                            {m.displayName}{m.userId === myUserId ? ' (du)' : ''}
                        </option>
                    ))}
                </select>
            </Field>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button type="button" onClick={handleSubmit} disabled={busy || done || !spaceId || !title.trim()} className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {done ? <><MaterialIcon name="check" size={16} className="size-4" /> {t('app.misc.aufgabe_erstellt')}</> : 'Aufgabe erstellen'}
            </button>
        </div>
    );
}

// ─── Calendar Panel ───────────────────────────────────────────────────

function CalendarPanel({ messageBody, jwt, onClose }: { messageBody: string; jwt: string | null; onClose: () => void }) {
    const t = useT();
    const [layers, setLayers] = useState<CalendarLayer[]>([]);
    const [layerId, setLayerId] = useState<string>('');
    const [title, setTitle] = useState(() => messageBody.slice(0, 80) || 'Aus Chat-Nachricht');
    const [description, setDescription] = useState(messageBody);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const defaultTime = `${pad(now.getHours() + 1)}:00`;
    const [date, setDate] = useState(defaultDate);
    const [time, setTime] = useState(defaultTime);
    const [durationMin, setDurationMin] = useState(60);
    const [allDay, setAllDay] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (!jwt) return;
        calendarGateway.getLayers(jwt).then((res) => {
            setLayers(res.layers);
            if (res.layers.length > 0) setLayerId(res.layers[0].id);
        }).catch(() => { /* ignore */ });
    }, [jwt]);

    const handleSubmit = async () => {
        if (!jwt || !layerId) return;
        setBusy(true);
        setError(null);
        try {
            const dtstart = allDay ? `${date}T00:00:00` : `${date}T${time}:00`;
            const startMs = new Date(dtstart).getTime();
            const dtend = allDay ? `${date}T23:59:59` : new Date(startMs + durationMin * 60_000).toISOString();
            await calendarGateway.createEvent(jwt, { layerId, title, description, dtstart, dtend, allDay });
            setDone(true);
            setTimeout(onClose, 1200);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Termin konnte nicht erstellt werden.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 p-4">
            <Field label={t('app.misc.kalender')}>
                <select value={layerId} onChange={(e) => setLayerId(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                    {layers.length === 0 && <option value="">{t('app.misc.kein_kalender')}</option>}
                    {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
            </Field>
            <Field label={t('app.misc.titel')}>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
            <Field label={t('app.misc.beschreibung')}>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
                <Field label={t('app.misc.datum')}>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </Field>
                {!allDay && (
                    <Field label={t('app.misc.uhrzeit')}>
                        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                    </Field>
                )}
            </div>
            <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                    {t('app.misc.ganztaegig')}<span>{t('app.misc.ganztaegig')}</span>
                </label>
                {!allDay && (
                    <Field label={t('app.misc.dauer')} inline>
                        <select value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:border-primary">
                            <option value={30}>{t('app.misc.30_min')}</option>
                            <option value={60}>{t('app.misc.1_std')}</option>
                            <option value={90}>{t('app.misc.15_std')}</option>
                            <option value={120}>{t('app.misc.2_std')}</option>
                        </select>
                    </Field>
                )}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button type="button" onClick={handleSubmit} disabled={busy || done || !layerId || !title.trim()} className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {done ? <><MaterialIcon name="check" size={16} className="size-4" /> {t('app.misc.termin_erstellt')}</> : t('common.appointment_create')}
            </button>
        </div>
    );
}

// ─── Document Panel ───────────────────────────────────────────────────

function DocumentPanel({ messageBody, jwt, onClose }: { messageBody: string; jwt: string | null; onClose: () => void }) {
    const t = useT();
    const { spaces } = useSpaces();
    const eligibleSpaces = useMemo(() => spaces.filter((s) => s.type !== 'concept'), [spaces]);
    const [spaceId, setSpaceId] = useState<string>('');
    const defaultName = (messageBody.slice(0, 40).replace(/[\\/:*?"<>|\n\r]/g, ' ').trim() || 'Notiz') + '.txt';
    const [fileName, setFileName] = useState(defaultName);
    const [content, setContent] = useState(messageBody);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (!spaceId && eligibleSpaces.length > 0) setSpaceId(eligibleSpaces[0].id);
    }, [eligibleSpaces, spaceId]);

    const handleSubmit = async () => {
        if (!jwt || !spaceId) return;
        setBusy(true);
        setError(null);
        try {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const sizeBytes = blob.size;
            const mimeType = 'text/plain';
            const { uploadUrl, storageKey } = await projectGateway.requestDocumentUpload(jwt, spaceId, { fileName, mimeType, sizeBytes });
            const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': mimeType } });
            if (!uploadRes.ok) throw new Error(`Upload fehlgeschlagen (${uploadRes.status})`);
            await projectGateway.confirmDocumentUpload(jwt, spaceId, { storageKey, fileName, mimeType, sizeBytes });
            setDone(true);
            setTimeout(onClose, 1200);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Dokument konnte nicht erstellt werden.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 p-4">
            <Field label={t('app.misc.space')}>
                <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                    {eligibleSpaces.length === 0 && <option value="">{t('app.misc.keine_verfuegbar')}</option>}
                    {eligibleSpaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </Field>
            <Field label={t('app.misc.dateiname')}>
                <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
            <Field label={t('app.misc.inhalt')}>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button type="button" onClick={handleSubmit} disabled={busy || done || !spaceId || !fileName.trim()} className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {done ? <><MaterialIcon name="check" size={16} className="size-4" /> {t('app.misc.dokument_erstellt')}</> : 'Dokument erstellen'}
            </button>
        </div>
    );
}

function Field({ label, inline = false, children }: { label: string; inline?: boolean; children: React.ReactNode }) {
    return (
        <label className={cn('block', inline && 'flex items-center gap-2')}>
            <span className={cn('text-[10px] font-medium uppercase tracking-wider text-muted-foreground', !inline && 'mb-1 block')}>{label}</span>
            {children}
        </label>
    );
}

function TabButton({ active, disabled, onClick, icon, label }: {
    active: boolean;
    disabled: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'flex flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] font-medium transition-colors',
                active && !disabled && 'bg-background text-foreground shadow-sm',
                !active && !disabled && 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                disabled && 'cursor-not-allowed text-muted-foreground/50',
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
