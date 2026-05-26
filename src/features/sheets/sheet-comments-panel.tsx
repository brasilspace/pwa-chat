/**
 * SheetCommentsPanel — Side-Panel mit Cell-Kommentaren fuer ein Sheet.
 *
 * Liest alle DocumentAnnotations des Sheets, gruppiert nach cellRef
 * (Top-Level + Replies). Anzeige als Liste rechts neben dem Editor.
 *
 * Aktionen:
 *   - Neuen Comment auf aktuelle Selektion setzen (sheets-editor liefert
 *     die aktive Cell-Ref via prop)
 *   - Reply, Resolve/Reopen, Delete (Author/Admin)
 *   - Klick auf Comment scrollt im Editor zur Zelle (sheets-editor reagiert
 *     via onJumpToCell-Callback)
 *
 * @-Mentions: Wenn der Body ein @username enthaelt, wird das beim Rendern
 *   farbig hervorgehoben. Die Notification-Pipeline (Matrix-Ping) folgt
 *   in Phase 2 — fuer V1 reicht visuelle Markierung.
 */

import { type JSX, useState, useMemo, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useDocumentAnnotations, documentAnnotationsApi, type DocumentAnnotation } from '@/features/dms/use-document-annotations';
import type { SheetRole } from './use-sheets';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    sheetId: string;
    /** Aktuelle Selektion fuer "Neuer Comment auf dieser Zelle". */
    activeCellRef: string | null;
    myRole: SheetRole;
    onClose: () => void;
    onJumpToCell?: (cellRef: string) => void;
}

function formatUser(uid: string): string {
    return uid.replace(/^@/, '').split(':')[0];
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Hebt @username im Text farbig hervor. Sicher gegen XSS — wir splitten vor jedem Match. */
function renderBody(body: string): JSX.Element {
    const parts = body.split(/(@[\w.-]+)/g);
    return (
        <>
            {parts.map((p, i) => (
                p.startsWith('@')
                    ? <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">{p}</span>
                    : <span key={i}>{p}</span>
            ))}
        </>
    );
}

export function SheetCommentsPanel({ sheetId, activeCellRef, myRole, onClose, onJumpToCell }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const meId = session.bootstrap?.user.matrixUserId ?? '';
    const { annotations, loading, refresh } = useDocumentAnnotations(sheetId);
    const [newBody, setNewBody] = useState('');
    const [posting, setPosting] = useState(false);

    const canComment = myRole === 'OWNER' || myRole === 'EDITOR' || myRole === 'COMMENTER';

    // Gruppiere: Top-Level Comments + Replies
    const { topLevel, repliesByParent } = useMemo(() => {
        const top: DocumentAnnotation[] = [];
        const byParent = new Map<string, DocumentAnnotation[]>();
        for (const a of annotations) {
            if (!a.parentId) top.push(a);
            else {
                const arr = byParent.get(a.parentId) ?? [];
                arr.push(a);
                byParent.set(a.parentId, arr);
            }
        }
        // Sortierung: zuerst offene (nach updatedAt desc), dann geloeste (auch desc)
        top.sort((a, b) => {
            const aOpen = !a.resolvedAt;
            const bOpen = !b.resolvedAt;
            if (aOpen !== bOpen) return aOpen ? -1 : 1;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        return { topLevel: top, repliesByParent: byParent };
    }, [annotations]);

    const post = async () => {
        if (!jwt || !newBody.trim() || !canComment) return;
        setPosting(true);
        try {
            await documentAnnotationsApi.create(jwt, sheetId, {
                body: newBody.trim(),
                cellRef: activeCellRef ?? undefined,
            });
            setNewBody('');
            refresh();
        } catch (e) {
            alert('Posten fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setPosting(false);
        }
    };

    const openCount = topLevel.filter(_t => !_t.resolvedAt).length;

    return (
        <div className="flex h-full w-80 flex-col border-l border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                    <MaterialIcon name="chat" size={16} className="size-4" />
                    <span className="text-sm font-medium">{t('sheets.sheet_comments.kommentare')}</span>
                    {openCount > 0 && <span className="rounded bg-amber-500/20 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">{openCount} offen</span>}
                </div>
                <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loading && <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>}

                {!loading && topLevel.length === 0 && (
                    <p className="text-xs text-muted-foreground italic text-center py-4">
                        {t('sheets.sheet_comments.noch_keine_kommentare')}
                    </p>
                )}

                {topLevel.map(top => (
                    <CommentThread
                        key={top.id}
                        comment={top}
                        replies={repliesByParent.get(top.id) ?? []}
                        sheetId={sheetId}
                        meId={meId}
                        jwt={jwt ?? null}
                        canComment={canComment}
                        onChange={refresh}
                        onJumpToCell={onJumpToCell}
                    />
                ))}
            </div>

            {/* Neuer Comment */}
            {canComment && (
                <div className="border-t border-border p-3 space-y-2">
                    {activeCellRef && (
                        <div className="flex items-center gap-1 text-[10px] text-primary">
                            <MaterialIcon name="place" size={16} className="size-3" /> {t('sheets.sheet_comments.bezogen_auf')} <code className="rounded bg-primary/10 px-1">{activeCellRef}</code>
                        </div>
                    )}
                    <textarea
                        value={newBody}
                        onChange={e => setNewBody(e.target.value)}
                        rows={3}
                        placeholder={canComment ? 'Kommentar… (@name fuer Erwaehnung)' : 'Du darfst nicht kommentieren'}
                        className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-xs"
                    />
                    <button
                        onClick={post}
                        disabled={posting || !newBody.trim()}
                        className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {posting ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="send" size={16} className="size-3" />}
                        {t('sheets.sheet_comments.posten')}
                    </button>
                </div>
            )}
        </div>
    );
}

function CommentThread({ comment, replies, sheetId, meId, jwt, canComment, onChange, onJumpToCell }: {
    comment: DocumentAnnotation;
    replies: DocumentAnnotation[];
    sheetId: string;
    meId: string;
    jwt: string | null;
    canComment: boolean;
    onChange: () => void;
    onJumpToCell?: (cellRef: string) => void;
}): JSX.Element {
    const t = useT();
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyBody, setReplyBody] = useState('');
    const [busy, setBusy] = useState(false);
    const isMine = comment.authorId === meId;
    const resolved = !!comment.resolvedAt;

    const reply = async () => {
        if (!jwt || !replyBody.trim()) return;
        setBusy(true);
        try {
            await documentAnnotationsApi.create(jwt, sheetId, {
                body: replyBody.trim(),
                parentId: comment.id,
                cellRef: comment.cellRef ?? undefined,
            });
            setReplyBody('');
            setReplyOpen(false);
            onChange();
        } catch (e) {
            alert('Antworten fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    const toggleResolve = async () => {
        if (!jwt) return;
        setBusy(true);
        try {
            if (resolved) await documentAnnotationsApi.reopen(jwt, comment.id);
            else await documentAnnotationsApi.resolve(jwt, comment.id);
            onChange();
        } finally { setBusy(false); }
    };

    const remove = async () => {
        if (!jwt) return;
        if (!confirm('Kommentar wirklich loeschen?')) return;
        setBusy(true);
        try {
            await documentAnnotationsApi.delete(jwt, comment.id);
            onChange();
        } catch (e) {
            alert('Loeschen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    return (
        <div className={cn('rounded border p-2 space-y-1 text-xs', resolved ? 'border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/10' : 'border-border bg-card')}>
            {comment.cellRef && (
                <button
                    onClick={() => onJumpToCell?.(comment.cellRef!)}
                    className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary hover:bg-primary/20"
                    title={t('sheets.sheet_comments.zur_zelle_springen')}
                >
                    <MaterialIcon name="place" size={16} className="size-2.5" /> {comment.cellRef}
                </button>
            )}

            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground">{formatUser(comment.authorId)}</span>
                        <span>·</span>
                        <span>{formatTime(comment.createdAt)}</span>
                        {resolved && <span className="rounded bg-emerald-500/20 px-1 text-emerald-700 dark:text-emerald-300">geloest</span>}
                    </div>
                    <p className="whitespace-pre-wrap break-words">{renderBody(comment.body)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                    <button onClick={toggleResolve} disabled={busy} title={resolved ? 'Wieder oeffnen' : 'Als geloest markieren'} className="rounded p-1 hover:bg-muted disabled:opacity-50">
                        {resolved ? <MaterialIcon name="restart_alt" size={16} className="size-3" /> : <MaterialIcon name="check" size={16} className="size-3" />}
                    </button>
                    {isMine && (
                        <button onClick={remove} disabled={busy} title={t('common.delete')} className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50">
                            <MaterialIcon name="delete" size={16} className="size-3" />
                        </button>
                    )}
                </div>
            </div>

            {replies.length > 0 && (
                <div className="ml-3 space-y-1 border-l border-border pl-2">
                    {replies.map(r => (
                        <div key={r.id} className="text-[11px]">
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span className="font-medium text-foreground">{formatUser(r.authorId)}</span>
                                <span>·</span>
                                <span>{formatTime(r.createdAt)}</span>
                            </div>
                            <p className="whitespace-pre-wrap break-words">{renderBody(r.body)}</p>
                        </div>
                    ))}
                </div>
            )}

            {!resolved && canComment && (
                <div className="pt-1">
                    {!replyOpen ? (
                        <button onClick={() => setReplyOpen(true)} className="text-[10px] text-muted-foreground hover:text-foreground">{t('sheets.sheet_comments.antworten')}</button>
                    ) : (
                        <div className="space-y-1">
                            <textarea
                                value={replyBody}
                                onChange={e => setReplyBody(e.target.value)}
                                rows={2}
                                placeholder={t('sheets.sheet_comments.antwort')}
                                className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-[11px]"
                                autoFocus
                            />
                            <div className="flex gap-1">
                                <button onClick={reply} disabled={busy || !replyBody.trim()} className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground disabled:opacity-50">
                                    {t('sheets.sheet_comments.senden')}
                                </button>
                                <button onClick={() => { setReplyOpen(false); setReplyBody(''); }} className="rounded border border-border px-2 py-0.5 text-[10px]">{t('common.cancel')}</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
