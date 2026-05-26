/**
 * PostCard — Brief/Umfrage/Formular als Karte im Messenger-Chat-Strom.
 *
 * Zeigt den Post-Inhalt + Antwort-Moeglichkeit direkt inline,
 * ohne in einen separaten Tab navigieren zu muessen.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import { Mail, BarChart3, FileText } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface SpacePost {
    id: string;
    type: 'letter' | 'poll' | 'form';
    title: string;
    body: string | null;
    config: Record<string, unknown>;
    responseType: string;
    responseDeadline: string | null;
    responseCount: number;
    targetCount: number;
    myResponseExists?: boolean;
    pinned: boolean;
    closed: boolean;
    createdAt: string;
}

const TYPE_ICONS = { letter: Mail, poll: BarChart3, form: FileText };
const TYPE_LABELS = { letter: 'Brief', poll: 'Umfrage', form: 'Formular' };

const API_BASE = '/api/platform/v1';

interface PostCardProps {
    post: SpacePost;
    spaceId: string;
    onRefresh: () => void;
}

export function PostCard({ post, spaceId, onRefresh }: PostCardProps): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [responded, setResponded] = useState(post.myResponseExists ?? false);
    const [submitting, setSubmitting] = useState(false);
    const Icon = TYPE_ICONS[post.type];

    const handleRespond = async (response: Record<string, unknown>) => {
        if (!jwt) return;
        setSubmitting(true);
        try {
            await fetch(`${API_BASE}/spaces/${spaceId}/posts/${post.id}/respond`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ response }),
            });
            setResponded(true);
            onRefresh();
        } finally { setSubmitting(false); }
    };

    const isExpired = post.responseDeadline && new Date(post.responseDeadline) < new Date();

    return (
        <div className="mx-4 my-2 rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <Icon className="size-4 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{TYPE_LABELS[post.type]}</span>
                {post.pinned && <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded px-1.5 py-0.5">{t('messenger.post_card.angepinnt')}</span>}
                {isExpired && !post.closed && <span className="text-[9px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded px-1.5 py-0.5">{t('messenger.post_card.frist_abgelaufen')}</span>}
            </div>

            {/* Titel + Body */}
            <h3 className="text-sm font-semibold">{post.title}</h3>
            {post.body && <p className="mt-1 text-xs text-foreground/80 whitespace-pre-wrap">{post.body}</p>}

            {/* Frist */}
            {post.responseDeadline && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {t('messenger.post_card.frist')} {new Date(post.responseDeadline).toLocaleDateString('de-DE')}
                </p>
            )}

            {/* Bereits beantwortet */}
            {responded && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
                    <MaterialIcon name="check" size={16} className="size-3.5" />{t('messenger.post_card.ihre_rueckmeldung_wurde_gespeichert')}
                </div>
            )}

            {/* Antwort-Bereich */}
            {!responded && !post.closed && post.responseType !== 'none' && (
                <div className="mt-3">
                    {post.responseType === 'acknowledge' && (
                        <button onClick={() => handleRespond({ acknowledged: true })} disabled={submitting}
                            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            <MaterialIcon name="check" size={16} className="size-3.5" />{submitting ? 'Wird gesendet...' : 'Zur Kenntnis genommen'}
                        </button>
                    )}

                    {post.responseType === 'yes_no' && (
                        <div className="flex gap-2">
                            <button onClick={() => handleRespond({ choice: 'yes' })} disabled={submitting}
                                className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50">{t('messenger.post_card.ja')}</button>
                            <button onClick={() => handleRespond({ choice: 'no' })} disabled={submitting}
                                className="flex-1 rounded-lg bg-red-500 py-2 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50">{t('messenger.post_card.nein')}</button>
                        </div>
                    )}

                    {post.responseType === 'choice' && (
                        <div className="space-y-1.5">
                            {(((post.config as any).options ?? []) as string[]).map(opt => (
                                <button key={opt} onClick={() => handleRespond({ choice: opt })} disabled={submitting}
                                    className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-left hover:bg-muted transition-colors disabled:opacity-50">
                                    <div className="size-3 rounded-full border-2 border-muted-foreground/30" />
                                    {opt}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
