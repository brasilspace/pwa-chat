/**
 * LettersPanel — Elternbriefe, Umfragen, Formulare.
 *
 * Zeigt alle SpacePosts in einer chronologischen Liste.
 * Mitarbeiter koennen neue Briefe/Umfragen/Formulare erstellen.
 * Eltern koennen darauf antworten.
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

interface SpacePost {
    id: string;
    type: 'letter' | 'poll' | 'form';
    title: string;
    body: string | null;
    config: Record<string, unknown>;
    authorId: string;
    visibility: string;
    responseType: string;
    responseDeadline: string | null;
    pinned: boolean;
    closed: boolean;
    createdAt: string;
    responseCount: number;
    targetCount: number;
    myResponseExists?: boolean;
    responses?: SpacePostResponse[];
}

interface SpacePostResponse {
    id: string;
    userId: string;
    response: Record<string, unknown>;
    comment: string | null;
    createdAt: string;
}

// ─── API ────────────────────────────────────────────────────────────────────

const API_BASE = '/api/platform/v1';

async function fetchPosts(jwt: string, spaceId: string): Promise<SpacePost[]> {
    const res = await fetch(`${API_BASE}/spaces/${spaceId}/posts`, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    const data = await res.json();
    return data.posts ?? [];
}

async function fetchPost(jwt: string, spaceId: string, postId: string): Promise<SpacePost | null> {
    const res = await fetch(`${API_BASE}/spaces/${spaceId}/posts/${postId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    const data = await res.json();
    return data.post ?? null;
}

async function createPost(jwt: string, spaceId: string, body: Record<string, unknown>) {
    const res = await fetch(`${API_BASE}/spaces/${spaceId}/posts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function archivePost(jwt: string, spaceId: string, postId: string) {
    const res = await fetch(`${API_BASE}/spaces/${spaceId}/posts/${postId}/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: '{}',
    });
    return res.json();
}

async function respondToPost(jwt: string, spaceId: string, postId: string, response: Record<string, unknown>, comment?: string) {
    const res = await fetch(`${API_BASE}/spaces/${spaceId}/posts/${postId}/respond`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, comment }),
    });
    return res.json();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return 'Heute';
    if (days === 1) return 'Gestern';
    if (days < 7) return `vor ${days} Tagen`;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}

const TYPE_ICONS: Record<string, string> = { letter: 'mail', poll: 'bar_chart', form: 'description' };
const TYPE_LABELS = { letter: 'Brief', poll: 'Umfrage', form: 'Formular' };

// ─── Component ──────────────────────────────────────────────────────────────

export function LettersPanel({ space }: { space: SpaceItem }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    // Nur Mitarbeiter duerfen Briefe/Umfragen/Formulare erstellen.
    // Mitarbeiter = UserType mit hub_contacts Zugang (tenant-wide Sichtbarkeit).
    // Ohne Matrix/UserType: alles erlaubt (Fallback fuer Admins ohne UserType).
    const perms = session.permissions;
    const utKey = perms?.userTypeKey;
    const vtMatrix = perms?.visibilityMatrix;
    const canCreate = !utKey || !vtMatrix || !vtMatrix[utKey] || vtMatrix[utKey].hub_contacts !== false;
    const [posts, setPosts] = useState<SpacePost[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const mountedRef = useRef(true);
    const myUserId = session.matrix?.userId;

    const load = useCallback(async () => {
        if (!jwt) return;
        try {
            const data = await fetchPosts(jwt, space.id);
            if (mountedRef.current) setPosts(data);
        } catch { /* ignore */ }
        finally { if (mountedRef.current) setLoading(false); }
    }, [jwt, space.id]);

    useEffect(() => { mountedRef.current = true; load(); return () => { mountedRef.current = false; }; }, [load]);

    useWorkflowEvents((event, data) => {
        if (event === 'post.changed' && (data as { spaceId?: string }).spaceId === space.id) load();
    });

    const selectedPost = posts.find(p => p.id === selectedId);

    if (loading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-2.5">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{t('letters.letters.briefe_formulare')}</span>
                    <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
                        <button onClick={() => setShowAll(false)}
                            className={cn('rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                                !showAll ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
                            {t('letters.letters.offen')}
                        </button>
                        <button onClick={() => setShowAll(true)}
                            className={cn('rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                                showAll ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>
                            {t('letters.letters.alle')}
                        </button>
                    </div>
                </div>
                {canCreate && (
                    <button
                        onClick={() => setShowCreate(!showCreate)}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <MaterialIcon name="add" size={16} />{t('letters.letters.neu')}
                    </button>
                )}
            </div>

            {/* Create Form */}
            {showCreate && <CreatePostForm spaceId={space.id} jwt={jwt!} onDone={() => { setShowCreate(false); load(); }} onCancel={() => setShowCreate(false)} />}

            {/* Post Detail */}
            {selectedPost && (
                <PostDetail post={selectedPost} spaceId={space.id} jwt={jwt!} onClose={() => setSelectedId(null)} onRefresh={load} />
            )}

            {/* Post List */}
            {!selectedPost && (() => {
                const filteredPosts = showAll
                    ? posts
                    : posts.filter(p => !p.myResponseExists && !p.closed && p.responseType !== 'none');
                return (
                    <div className="flex-1 overflow-y-auto">
                        {filteredPosts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-8 text-center">
                                <MaterialIcon name="mail" size={40} className="text-muted-foreground/30 mb-3" />
                                <p className="text-sm text-muted-foreground">
                                    {showAll ? 'Noch keine Briefe oder Umfragen.' : 'Keine offenen Briefe oder Umfragen.'}
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-1">
                                    {showAll ? 'Erstellen Sie den ersten Elternbrief oder eine Umfrage.' : 'Alle Beitraege wurden beantwortet.'}
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {filteredPosts.map(post => {
                                    const iconName = TYPE_ICONS[post.type];
                                    const pct = post.targetCount > 0 ? Math.round((post.responseCount / post.targetCount) * 100) : 0;
                                    return (
                                        <button key={post.id} onClick={() => setSelectedId(post.id)}
                                            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                                            <MaterialIcon name={iconName} size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium truncate">{post.title}</span>
                                                    {post.pinned && <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded px-1.5 py-0.5 font-medium">{t('letters.letters.angepinnt')}</span>}
                                                    {post.closed && <span className="text-[9px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">{t('letters.letters.geschlossen')}</span>}
                                                    {post.responseDeadline && new Date(post.responseDeadline) < new Date() && !post.closed && (
                                                        <span className="text-[9px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded px-1.5 py-0.5 font-medium">{t('letters.letters.frist_abgelaufen')}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-[10px] text-muted-foreground">{TYPE_LABELS[post.type]}</span>
                                                    <span className="text-[10px] text-muted-foreground">{relativeDate(post.createdAt)}</span>
                                                    {post.responseType !== 'none' && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {post.responseCount}/{post.targetCount} ({pct}%)
                                                        </span>
                                                    )}
                                                </div>
                                                {post.responseType !== 'none' && post.targetCount > 0 && (
                                                    <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                                                        <div className={cn('h-full rounded-full transition-all',
                                                            pct === 100 ? 'bg-emerald-500' : 'bg-primary')}
                                                            style={{ width: `${pct}%` }} />
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}

// ─── Post erstellen ─────────────────────────────────────────────────────────

function CreatePostForm({ spaceId, jwt, onDone, onCancel }: {
    spaceId: string; jwt: string; onDone: () => void; onCancel: () => void;
}): JSX.Element {
    const t = useT();
    const [type, setType] = useState<'letter' | 'poll' | 'form'>('letter');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [responseType, setResponseType] = useState<string>('acknowledge');
    const [pollOptions, setPollOptions] = useState(['', '']);
    const [formFields, setFormFields] = useState<{ key: string; type: string; label: string; required: boolean; options?: string[] }[]>([]);
    const [requireSignature, setRequireSignature] = useState(true);
    const [templates, setTemplates] = useState<{ id: string; title: string; type: string; body: string | null; config: Record<string, unknown> }[]>([]);
    const [deadline, setDeadline] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Vorlagen laden wenn Formular-Typ gewaehlt
    useEffect(() => {
        if (type !== 'form' || templates.length > 0) return;
        fetch(`${API_BASE}/post-templates?type=form`, { headers: { Authorization: `Bearer ${jwt}` } })
            .then(r => r.json())
            .then(d => setTemplates(d.templates ?? []))
            .catch(() => { });
    }, [type, jwt, templates.length]);

    const handleSubmit = async () => {
        if (!title.trim()) return;
        setSubmitting(true);
        try {
            const config: Record<string, unknown> = {};
            if (type === 'poll') {
                config.options = pollOptions.filter(o => o.trim());
                config.multiSelect = false;
            }
            if (type === 'form') {
                config.fields = formFields.filter(f => f.label.trim());
                config.requireSignature = requireSignature;
            }
            await createPost(jwt, spaceId, {
                type,
                title: title.trim(),
                body: body.trim() || null,
                config,
                responseType: type === 'form' ? 'form_fields' : (type === 'poll' ? 'choice' : responseType),
                responseDeadline: deadline || null,
                pinned: true,
            });
            onDone();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="border-b bg-muted/30 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('letters.letters.neuer_beitrag')}</span>
                <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><MaterialIcon name="close" size={16} /></button>
            </div>

            {/* Typ-Auswahl */}
            <div className="flex gap-2">
                {([['letter', 'Brief', 'mail'], ['poll', 'Umfrage', 'bar_chart'], ['form', 'Formular', 'description']] as const).map(([k, label, iconName]) => (
                    <button key={k} onClick={() => setType(k)}
                        className={cn('flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-colors',
                            type === k ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30')}>
                        <MaterialIcon name={iconName} size={16} />{label}
                    </button>
                ))}
            </div>

            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('letters.letters.titel')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" autoFocus />

            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={t('letters.letters.inhalt_optional')} rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none resize-none focus:border-primary" />

            {/* Umfrage-Optionen */}
            {type === 'poll' && (
                <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('letters.letters.optionen')}</label>
                    {pollOptions.map((opt, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <input type="text" value={opt} onChange={e => { const o = [...pollOptions]; o[i] = e.target.value; setPollOptions(o); }}
                                placeholder={`Option ${i + 1}`}
                                className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
                            {pollOptions.length > 2 && (
                                <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                                    className="text-muted-foreground hover:text-destructive"><MaterialIcon name="close" size={14} /></button>
                            )}
                        </div>
                    ))}
                    <button onClick={() => setPollOptions([...pollOptions, ''])}
                        className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80">
                        <MaterialIcon name="add" size={14} />{t('letters.letters.option_hinzufuegen')}
                    </button>
                </div>
            )}

            {/* Formular: Vorlage waehlen + Feld-Builder */}
            {type === 'form' && (
                <>
                    {templates.length > 0 && formFields.length === 0 && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('letters.letters.vorlage_waehlen')}</label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {templates.map(tpl => (
                                    <button key={tpl.id} onClick={() => {
                                        setTitle(tpl.title);
                                        setBody(tpl.body ?? '');
                                        const cfg = tpl.config as any;
                                        setFormFields(cfg.fields ?? []);
                                        setRequireSignature(cfg.requireSignature ?? true);
                                    }}
                                        className="rounded-lg border border-border px-2.5 py-2 text-left text-[11px] hover:bg-muted transition-colors">
                                        <span className="font-medium">{tpl.title}</span>
                                    </button>
                                ))}
                                <button onClick={() => setFormFields([{ key: `field_${Date.now()}`, type: 'text', label: '', required: true }])}
                                    className="rounded-lg border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground hover:border-primary/30">
                                    {t('letters.letters.leeres_formular')}
                                </button>
                            </div>
                        </div>
                    )}
                    {(formFields.length > 0 || templates.length === 0) && (
                        <FormFieldBuilder fields={formFields} onChange={setFormFields} requireSignature={requireSignature} onSignatureChange={setRequireSignature} />
                    )}
                </>
            )}

            {/* Rueckmeldungstyp (nur Brief) */}
            {type === 'letter' && (
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('letters.letters.rueckmeldung')}</label>
                    <div className="mt-1 flex gap-2">
                        {([['none', 'Keine'], ['acknowledge', 'Kenntnisnahme'], ['yes_no', 'Ja / Nein']] as const).map(([k, label]) => (
                            <button key={k} onClick={() => setResponseType(k)}
                                className={cn('rounded-md border px-2.5 py-1 text-[10px] font-medium transition-colors',
                                    responseType === k ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30')}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Frist */}
            <div className="flex items-center gap-2">
                <label className="text-[10px] text-muted-foreground">{t('letters.letters.frist')}</label>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                    className="h-7 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
            </div>

            <button onClick={handleSubmit} disabled={!title.trim() || submitting}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <MaterialIcon name="send" size={16} />{submitting ? 'Wird gesendet...' : 'Senden'}
            </button>
        </div>
    );
}

// ─── Post Detail ────────────────────────────────────────────────────────────

function PostDetail({ post: initialPost, spaceId, jwt, onClose, onRefresh }: {
    post: SpacePost; spaceId: string; jwt: string; onClose: () => void; onRefresh: () => void;
}): JSX.Element {
    const t = useT();
    const [post, setPost] = useState(initialPost);
    const [loading, setLoading] = useState(true);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const myUserId = session.matrix?.userId;

    useEffect(() => {
        fetchPost(jwt, spaceId, initialPost.id).then(p => {
            if (p) setPost(p);
            setLoading(false);
        });
    }, [jwt, spaceId, initialPost.id]);

    const myResponse = post.responses?.find(r => r.userId === myUserId);
    const iconName = TYPE_ICONS[post.type];
    const pct = post.targetCount > 0 ? Math.round((post.responseCount / post.targetCount) * 100) : 0;

    const handleRespond = async (response: Record<string, unknown>) => {
        await respondToPost(jwt, spaceId, post.id, response);
        const updated = await fetchPost(jwt, spaceId, post.id);
        if (updated) setPost(updated);
        onRefresh();
    };

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-3 border-b">
                <div className="flex items-start gap-2">
                    <button onClick={onClose} className="mt-0.5 text-muted-foreground hover:text-foreground">
                        <MaterialIcon name="chevron_right" size={16} className="rotate-180" />
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <MaterialIcon name={iconName} size={16} className="text-muted-foreground" />
                            <h2 className="text-sm font-semibold">{post.title}</h2>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{TYPE_LABELS[post.type]} — {relativeDate(post.createdAt)}</p>
                    </div>
                </div>
            </div>

            {/* Body */}
            {post.body && (
                <div className="px-4 py-3 border-b">
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{post.body}</p>
                </div>
            )}

            {/* Fortschritt */}
            {post.responseType !== 'none' && (
                <div className="px-4 py-3 border-b">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium">{t('letters.letters.rueckmeldungen')}</span>
                        <span className="text-xs text-muted-foreground">{post.responseCount} von {post.targetCount} ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all',
                            pct === 100 ? 'bg-emerald-500' : 'bg-primary')}
                            style={{ width: `${pct}%` }} />
                    </div>

                    {/* Umfrage-Ergebnis */}
                    {post.type === 'poll' && post.responses && (
                        <PollResults post={post} />
                    )}

                    {/* Ja/Nein Ergebnis */}
                    {post.responseType === 'yes_no' && post.responses && (
                        <div className="mt-3 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-emerald-600">{t('letters.letters.ja')}</span>
                                <span>{post.responses.filter(r => (r.response as any).choice === 'yes').length}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-red-500">{t('letters.letters.nein')}</span>
                                <span>{post.responses.filter(r => (r.response as any).choice === 'no').length}</span>
                            </div>
                        </div>
                    )}

                    {/* Formular-Ergebnisse */}
                    {post.responseType === 'form_fields' && post.responses && post.responses.length > 0 && (
                        <div className="mt-3 space-y-2">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase">{t('letters.letters.eingereichte_formulare')}</p>
                            {post.responses.map(r => {
                                const sig = (r.response as any)._signature;
                                return (
                                    <div key={r.id} className="rounded border border-border p-2 text-[11px] space-y-1">
                                        <span className="font-medium">{r.userId.replace(/@(.+?):.*/, '$1')}</span>
                                        {Object.entries(r.response as Record<string, unknown>).filter(([k]) => k !== '_signature').map(([k, v]) => {
                                            const field = ((post.config as any).fields ?? []).find((f: any) => f.key === k);
                                            return (
                                                <div key={k} className="flex justify-between">
                                                    <span className="text-muted-foreground">{field?.label ?? k}</span>
                                                    <span className="font-medium">{v === true ? t('common.yes') : v === false ? t('common.no') : String(v)}</span>
                                                </div>
                                            );
                                        })}
                                        {sig && <div className="text-[9px] text-muted-foreground pt-1 border-t">{t('letters.letters.unterschrift')} {sig.name} ({sig.date})</div>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Antwort-Bereich */}
            {!post.closed && !myResponse && post.responseType !== 'none' && (
                <div className="px-4 py-3 border-b">
                    <ResponseForm post={post} onRespond={handleRespond} />
                </div>
            )}

            {myResponse && (
                <div className="px-4 py-3 border-b bg-emerald-50 dark:bg-emerald-950/20">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                        <MaterialIcon name="check" size={16} />{t('letters.letters.ihre_rueckmeldung_wurde_gespeichert')}
                    </div>
                </div>
            )}

            {/* Archivieren-Button (nur Mitarbeiter) */}
            {(() => {
                const p = sessionStore.getSnapshot().permissions;
                const ut = p?.userTypeKey;
                const vm = p?.visibilityMatrix;
                const staffUser = !ut || !vm || !vm[ut] || vm[ut].hub_contacts !== false;
                if (!staffUser) return null;
                return (
                    <div className="px-4 py-3">
                        <button
                            onClick={async () => {
                                if (!confirm(`"${post.title}" archivieren?\n\nEine Zusammenfassung aller Rueckmeldungen wird erstellt. Der Beitrag verschwindet aus der aktiven Liste.`)) return;
                                await archivePost(jwt, spaceId, post.id);
                                onClose();
                                onRefresh();
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
                        >
                            <MaterialIcon name="description" size={16} />{t('letters.letters.archivieren')}
                        </button>
                        {post.responseDeadline && new Date(post.responseDeadline) < new Date() && (
                            <p className="mt-1.5 text-[10px] text-red-500">{t('letters.letters.frist_abgelaufen_am')} {new Date(post.responseDeadline).toLocaleDateString('de-DE')}</p>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}

// ─── Umfrage-Ergebnis ───────────────────────────────────────────────────────

function PollResults({ post }: { post: SpacePost }): JSX.Element {
    const options = ((post.config as any).options ?? []) as string[];
    const responses = post.responses ?? [];
    const total = responses.length;

    return (
        <div className="mt-3 space-y-2">
            {options.map(opt => {
                const count = responses.filter(r => (r.response as any).choice === opt).length;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                    <div key={opt}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                            <span>{opt}</span>
                            <span className="text-muted-foreground">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Antwort-Formular ───────────────────────────────────────────────────────

function ResponseForm({ post, onRespond }: { post: SpacePost; onRespond: (r: Record<string, unknown>) => void }): JSX.Element {
    const t = useT();
    const [comment, setComment] = useState('');

    if (post.responseType === 'acknowledge') {
        return (
            <button onClick={() => onRespond({ acknowledged: true })}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                <MaterialIcon name="check" size={16} />{t('letters.letters.zur_kenntnis_genommen')}
            </button>
        );
    }

    if (post.responseType === 'yes_no') {
        return (
            <div className="space-y-2">
                <div className="flex gap-2">
                    <button onClick={() => onRespond({ choice: 'yes' })}
                        className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-medium text-white hover:bg-emerald-600">{t('letters.letters.ja')}</button>
                    <button onClick={() => onRespond({ choice: 'no' })}
                        className="flex-1 rounded-lg bg-red-500 py-2 text-xs font-medium text-white hover:bg-red-600">{t('letters.letters.nein')}</button>
                </div>
            </div>
        );
    }

    if (post.responseType === 'choice') {
        const options = ((post.config as any).options ?? []) as string[];
        return (
            <div className="space-y-1.5">
                {options.map(opt => (
                    <button key={opt} onClick={() => onRespond({ choice: opt })}
                        className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-left hover:bg-muted transition-colors">
                        <div className="size-3 rounded-full border-2 border-muted-foreground/30" />
                        {opt}
                    </button>
                ))}
            </div>
        );
    }

    if (post.responseType === 'form_fields') {
        return <FormFiller post={post} onRespond={onRespond} />;
    }

    return <></>;
}

// ─── Formular-Feld-Builder (Lehrer) ─────────────────────────────────────────

const FIELD_TYPES = [
    { key: 'text', label: 'Textfeld' },
    { key: 'textarea', label: 'Mehrzeiliger Text' },
    { key: 'yes_no', label: 'Ja / Nein' },
    { key: 'checkbox', label: 'Checkbox' },
    { key: 'choice', label: 'Auswahl' },
    { key: 'date', label: 'Datum' },
    { key: 'number', label: 'Zahl' },
] as const;

interface FormField {
    key: string;
    type: string;
    label: string;
    required: boolean;
    options?: string[];
}

function FormFieldBuilder({ fields, onChange, requireSignature, onSignatureChange }: {
    fields: FormField[];
    onChange: (fields: FormField[]) => void;
    requireSignature: boolean;
    onSignatureChange: (v: boolean) => void;
}): JSX.Element {
    const t = useT();
    const addField = (type: string) => {
        const key = `field_${Date.now()}`;
        const newField: FormField = { key, type, label: '', required: true };
        if (type === 'choice') newField.options = ['', ''];
        onChange([...fields, newField]);
    };

    const updateField = (index: number, patch: Partial<FormField>) => {
        const updated = [...fields];
        updated[index] = { ...updated[index], ...patch };
        onChange(updated);
    };

    const removeField = (index: number) => {
        onChange(fields.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-2">
            <label className="text-[10px] font-medium text-muted-foreground uppercase">{t('letters.letters.formular-felder')}</label>

            {fields.map((field, i) => (
                <div key={field.key} className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                            {FIELD_TYPES.find(_t => _t.key === field.type)?.label ?? field.type}
                        </span>
                        <input
                            type="text"
                            value={field.label}
                            onChange={e => updateField(i, { label: e.target.value })}
                            placeholder={t('letters.letters.feldname_zb_kann_ihr_kind_schwimmen')}
                            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                        />
                        <button onClick={() => updateField(i, { required: !field.required })}
                            className={cn('text-[9px] rounded px-1.5 py-0.5 font-medium', field.required ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                            {field.required ? 'Pflicht' : 'Optional'}
                        </button>
                        <button onClick={() => removeField(i)} className="text-muted-foreground hover:text-destructive">
                            <MaterialIcon name="delete" size={14} />
                        </button>
                    </div>

                    {field.type === 'choice' && field.options && (
                        <div className="pl-2 space-y-1">
                            {field.options.map((opt, j) => (
                                <div key={j} className="flex items-center gap-1">
                                    <input type="text" value={opt}
                                        onChange={e => {
                                            const opts = [...(field.options ?? [])];
                                            opts[j] = e.target.value;
                                            updateField(i, { options: opts });
                                        }}
                                        placeholder={`Option ${j + 1}`}
                                        className="flex-1 rounded border border-border bg-background px-2 py-1 text-[10px] outline-none focus:border-primary" />
                                    {(field.options?.length ?? 0) > 2 && (
                                        <button onClick={() => updateField(i, { options: field.options?.filter((_, k) => k !== j) })}
                                            className="text-muted-foreground hover:text-destructive"><MaterialIcon name="close" size={12} /></button>
                                    )}
                                </div>
                            ))}
                            <button onClick={() => updateField(i, { options: [...(field.options ?? []), ''] })}
                                className="text-[9px] text-primary hover:text-primary/80">{t('letters.letters.option')}</button>
                        </div>
                    )}
                </div>
            ))}

            {/* Feld hinzufuegen */}
            <div className="flex flex-wrap gap-1">
                {FIELD_TYPES.map(ft => (
                    <button key={ft.key} onClick={() => addField(ft.key)}
                        className="flex items-center gap-1 rounded border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground hover:border-primary/30 hover:text-foreground">
                        <MaterialIcon name="add" size={12} />{ft.label}
                    </button>
                ))}
            </div>

            {/* Digitale Unterschrift */}
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-xs">{t('letters.letters.digitale_unterschrift_erforderlich')}</span>
                <button onClick={() => onSignatureChange(!requireSignature)}
                    className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                        requireSignature ? 'bg-primary' : 'bg-muted')}>
                    <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                        requireSignature ? 'translate-x-4' : 'translate-x-0.5')} />
                </button>
            </div>

            {fields.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic">{t('letters.letters.fuegen_sie_felder_hinzu_um_das_formular_')}</p>
            )}
        </div>
    );
}

// ─── Formular ausfuellen (Eltern) ──────────────────────────────────────────

function FormFiller({ post, onRespond }: { post: SpacePost; onRespond: (r: Record<string, unknown>) => void }): JSX.Element {
    const t = useT();
    const config = post.config as { fields?: FormField[]; requireSignature?: boolean };
    const fields = config.fields ?? [];
    const needsSig = config.requireSignature ?? false;

    const [values, setValues] = useState<Record<string, unknown>>({});
    const [sigName, setSigName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const setValue = (key: string, val: unknown) => setValues(prev => ({ ...prev, [key]: val }));

    const canSubmit = fields.every(f => {
        if (!f.required) return true;
        const v = values[f.key];
        if (v === undefined || v === null || v === '') return false;
        if (f.type === 'checkbox') return v === true;
        return true;
    }) && (!needsSig || sigName.trim().length > 0);

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        const response: Record<string, unknown> = { ...values };
        if (needsSig) {
            response._signature = { name: sigName.trim(), date: new Date().toISOString().split('T')[0] };
        }
        onRespond(response);
        setSubmitting(false);
    };

    return (
        <div className="space-y-3">
            {fields.map(field => (
                <div key={field.key}>
                    <label className="text-xs font-medium">
                        {field.label}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </label>

                    {field.type === 'text' && (
                        <input type="text" value={(values[field.key] as string) ?? ''}
                            onChange={e => setValue(field.key, e.target.value)}
                            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary" />
                    )}

                    {field.type === 'textarea' && (
                        <textarea value={(values[field.key] as string) ?? ''}
                            onChange={e => setValue(field.key, e.target.value)} rows={3}
                            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none resize-none focus:border-primary" />
                    )}

                    {field.type === 'yes_no' && (
                        <div className="mt-1 flex gap-2">
                            <button onClick={() => setValue(field.key, 'yes')}
                                className={cn('flex-1 rounded-lg border-2 py-1.5 text-xs font-medium transition-colors',
                                    values[field.key] === 'yes' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 'border-border text-muted-foreground')}>
                                {t('letters.letters.ja')}
                            </button>
                            <button onClick={() => setValue(field.key, 'no')}
                                className={cn('flex-1 rounded-lg border-2 py-1.5 text-xs font-medium transition-colors',
                                    values[field.key] === 'no' ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/20' : 'border-border text-muted-foreground')}>
                                {t('letters.letters.nein')}
                            </button>
                        </div>
                    )}

                    {field.type === 'checkbox' && (
                        <div className="mt-1 flex items-center gap-2">
                            <button onClick={() => setValue(field.key, !values[field.key])}
                                className={cn('flex size-5 items-center justify-center rounded border-2 transition-colors',
                                    values[field.key] ? 'border-primary bg-primary text-white' : 'border-border')}>
                                {!!values[field.key] && <MaterialIcon name="check" size={14} />}
                            </button>
                            <span className="text-xs text-muted-foreground">{t('letters.letters.bestaetigen')}</span>
                        </div>
                    )}

                    {field.type === 'choice' && (
                        <div className="mt-1 space-y-1">
                            {(field.options ?? []).map(opt => (
                                <button key={opt} onClick={() => setValue(field.key, opt)}
                                    className={cn('flex w-full items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-xs text-left transition-colors',
                                        values[field.key] === opt ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30')}>
                                    <div className={cn('size-3 rounded-full border-2', values[field.key] === opt ? 'border-primary bg-primary' : 'border-muted-foreground/30')} />
                                    {opt}
                                </button>
                            ))}
                        </div>
                    )}

                    {field.type === 'date' && (
                        <input type="date" value={(values[field.key] as string) ?? ''}
                            onChange={e => setValue(field.key, e.target.value)}
                            className="mt-1 h-8 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary" />
                    )}

                    {field.type === 'number' && (
                        <input type="number" value={(values[field.key] as string) ?? ''}
                            onChange={e => setValue(field.key, e.target.value)}
                            className="mt-1 w-32 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary" />
                    )}
                </div>
            ))}

            {/* Digitale Unterschrift */}
            {needsSig && (
                <div className="rounded-lg border border-border p-3 bg-muted/20">
                    <label className="text-xs font-medium">{t('letters.letters.digitale_unterschrift')} <span className="text-destructive">*</span></label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t('letters.letters.mit_der_eingabe_ihres_namens_bestaetigen')}</p>
                    <div className="mt-2 flex items-center gap-2">
                        <input type="text" value={sigName} onChange={e => setSigName(e.target.value)}
                            placeholder={t('letters.letters.vor-_und_nachname')}
                            className="flex-1 rounded border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary" />
                        <span className="text-[10px] text-muted-foreground">{new Date().toLocaleDateString('de-DE')}</span>
                    </div>
                </div>
            )}

            <button onClick={handleSubmit} disabled={!canSubmit || submitting}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <MaterialIcon name="send" size={16} />{submitting ? 'Wird gesendet...' : 'Formular absenden'}
            </button>
        </div>
    );
}
