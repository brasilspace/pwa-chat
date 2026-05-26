/**
 * DocumentAnnotationsPanel — Thread-Kommentare am Dokument (DMS Phase 10).
 *
 * Top-Level: Liste aller Top-Comments. Pro Comment: Replies + Reply-Form.
 * Resolve/Reopen pro Top-Comment. Loeschen nur fuer Author/Admin.
 */

import { type JSX, useState, useSyncExternalStore, useMemo } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useDocumentAnnotations, documentAnnotationsApi, type DocumentAnnotation } from './use-document-annotations';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/ui/section-header';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    documentId: string;
}

function formatUser(uid: string): string {
    return uid.replace(/^@/, '').split(':')[0];
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function DocumentAnnotationsPanel({ documentId }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const meId = session.bootstrap?.user.matrixUserId ?? '';
    const { annotations, loading, refresh } = useDocumentAnnotations(documentId);
    const [newBody, setNewBody] = useState('');
    const [posting, setPosting] = useState(false);

    // Group: top-level + replies
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
        return { topLevel: top, repliesByParent: byParent };
    }, [annotations]);

    const post = async () => {
        if (!jwt || !newBody.trim()) return;
        setPosting(true);
        try {
            await documentAnnotationsApi.create(jwt, documentId, { body: newBody.trim() });
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
        <div className="space-y-2">
            <SectionHeader action={<MaterialIcon name="chat" size={16} className="size-3 text-muted-foreground" />}>
                {t('dms.document_annotations.kommentare')} {openCount > 0 && <span className="ml-1 rounded bg-amber-500/20 px-1 normal-case text-amber-700 dark:text-amber-300">{openCount} offen</span>}
            </SectionHeader>

            {loading && <div className="flex justify-center py-2"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>}

            {!loading && topLevel.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">{t('dms.document_annotations.noch_keine_kommentare')}</p>
            )}

            <div className="space-y-2">
                {topLevel.map(top => (
                    <CommentThread
                        key={top.id}
                        comment={top}
                        replies={repliesByParent.get(top.id) ?? []}
                        documentId={documentId}
                        meId={meId}
                        jwt={jwt ?? null}
                        onChange={refresh}
                    />
                ))}
            </div>

            {/* Neuer Kommentar */}
            <div className="rounded border border-border bg-muted/20 p-2 space-y-2">
                <textarea
                    value={newBody}
                    onChange={e => setNewBody(e.target.value)}
                    rows={2}
                    placeholder={t('dms.document_annotations.kommentar_hinzufuegen')}
                    className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-xs"
                />
                <button
                    onClick={post}
                    disabled={posting || !newBody.trim()}
                    className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {posting ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="send" size={16} className="size-3" />}
                    {t('dms.document_annotations.posten')}
                </button>
            </div>
        </div>
    );
}

function CommentThread({ comment, replies, documentId, meId, jwt, onChange }: {
    comment: DocumentAnnotation;
    replies: DocumentAnnotation[];
    documentId: string;
    meId: string;
    jwt: string | null;
    onChange: () => void;
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
            await documentAnnotationsApi.create(jwt, documentId, { body: replyBody.trim(), parentId: comment.id });
            setReplyBody('');
            setReplyOpen(false);
            onChange();
        } catch (e) {
            alert('Antworten fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
        }
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
        <div className={cn('rounded border p-2 space-y-1', resolved ? 'border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/10' : 'border-border bg-background')}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground">{formatUser(comment.authorId)}</span>
                        <span>·</span>
                        <span>{formatTime(comment.createdAt)}</span>
                        {resolved && <span className="rounded bg-emerald-500/20 px-1 text-emerald-700 dark:text-emerald-300">geloest</span>}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-xs">{comment.body}</p>
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
                            <p className="whitespace-pre-wrap break-words">{r.body}</p>
                        </div>
                    ))}
                </div>
            )}

            {!resolved && (
                <div className="pt-1">
                    {!replyOpen ? (
                        <button onClick={() => setReplyOpen(true)} className="text-[10px] text-muted-foreground hover:text-foreground">{t('dms.document_annotations.antworten')}</button>
                    ) : (
                        <div className="space-y-1">
                            <textarea
                                value={replyBody}
                                onChange={e => setReplyBody(e.target.value)}
                                rows={2}
                                placeholder={t('dms.document_annotations.antwort')}
                                className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-[11px]"
                                autoFocus
                            />
                            <div className="flex gap-1">
                                <button onClick={reply} disabled={busy || !replyBody.trim()} className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground disabled:opacity-50">
                                    {t('dms.document_annotations.senden')}
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
