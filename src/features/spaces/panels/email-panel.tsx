/**
 * EmailPanel — E-Mails eines Spaces (eingehend via Stalwart-Webhook).
 *
 * Zeigt die Liste und ermoeglicht Reply. Wenn der Space noch keine
 * Mail-Adresse hat, bietet Panel einen Toggle an (nur Space-Admin).
 */

import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';
import { cn } from '@/lib/utils';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface SpaceEmailListItem {
    id: string;
    fromAddress: string;
    fromName: string | null;
    toAddress: string;
    subject: string;
    status: string;
    receivedAt: string;
}
interface SpaceEmailDetail {
    id: string;
    messageId: string | null;
    fromAddress: string;
    fromName: string | null;
    toAddress: string;
    ccAddresses: string[];
    subject: string;
    bodyText: string | null;
    bodyHtml: string | null;
    attachments: Array<{ blobId?: string; name: string; type: string; size: number }>;
    status: string;
    receivedAt: string;
    replies: Array<{ id: string; fromAddress: string; toAddress: string; subject: string; bodyText: string; sentAt: string; sentBy: string }>;
}

const B = env.platformBaseUrl;

export function EmailPanel({ space, fullscreen }: { space: SpaceItem; fullscreen?: boolean }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const [spaceState, setSpaceState] = useState({
        emailEnabled: space.emailEnabled ?? false,
        emailAddress: space.emailAddress ?? null,
    });
    useEffect(() => {
        setSpaceState({
            emailEnabled: space.emailEnabled ?? false,
            emailAddress: space.emailAddress ?? null,
        });
    }, [space.emailEnabled, space.emailAddress]);

    const [items, setItems] = useState<SpaceEmailListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<SpaceEmailDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        if (!jwt || !spaceState.emailEnabled) return;
        setLoading(true);
        try {
            const res = await requestJson<{ items: SpaceEmailListItem[]; unread: number }>({
                target: 'platform', baseUrl: B,
                path: `/platform/v1/spaces/${space.id}/emails`,
                method: 'GET', bearerToken: jwt,
            });
            setItems(res.items);
        } finally { setLoading(false); }
    }, [jwt, space.id, spaceState.emailEnabled]);
    useEffect(() => { load(); }, [load]);

    useWorkflowEvents((evt, data) => {
        if (evt === 'space-email.received' && (data as { spaceId?: string }).spaceId === space.id) {
            load();
        }
    });

    async function toggleOn() {
        setToggling(true);
        try {
            const res = await requestJson<{ id: string; emailEnabled: boolean; emailAddress: string | null }>({
                target: 'platform', baseUrl: B,
                path: `/platform/v1/spaces/${space.id}/email/enable`,
                method: 'POST', bearerToken: jwt, body: '{}',
            });
            setSpaceState({ emailEnabled: res.emailEnabled, emailAddress: res.emailAddress });
        } finally { setToggling(false); }
    }
    async function rotate() {
        setToggling(true);
        try {
            const res = await requestJson<{ id: string; emailAddress: string }>({
                target: 'platform', baseUrl: B,
                path: `/platform/v1/spaces/${space.id}/email/rotate`,
                method: 'POST', bearerToken: jwt, body: '{}',
            });
            setSpaceState((s) => ({ ...s, emailAddress: res.emailAddress }));
        } finally { setToggling(false); }
    }

    async function openDetail(id: string) {
        setLoadingDetail(true);
        setSelected(null);
        setReplyText('');
        try {
            const d = await requestJson<SpaceEmailDetail>({
                target: 'platform', baseUrl: B,
                path: `/platform/v1/spaces/${space.id}/emails/${id}`,
                method: 'GET', bearerToken: jwt,
            });
            setSelected(d);
            if (d.status === 'new') {
                await requestJson({
                    target: 'platform', baseUrl: B,
                    path: `/platform/v1/spaces/${space.id}/emails/${id}`,
                    method: 'PATCH', bearerToken: jwt, body: JSON.stringify({ status: 'read' }),
                });
                setItems((curr) => curr.map((x) => x.id === id ? { ...x, status: 'read' } : x));
            }
        } finally { setLoadingDetail(false); }
    }

    async function sendReply() {
        if (!selected || !replyText.trim()) return;
        setSending(true);
        try {
            await requestJson({
                target: 'platform', baseUrl: B,
                path: `/platform/v1/spaces/${space.id}/emails/${selected.id}/reply`,
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({ bodyText: replyText }),
            });
            setReplyText('');
            await openDetail(selected.id);
        } catch (e) {
            alert('Antwort konnte nicht gesendet werden.');
            console.error(e);
        } finally { setSending(false); }
    }

    // ─── Render ───────────────────────────────────────────────────────
    if (!spaceState.emailEnabled) {
        const perms = sessionStore.getSnapshot().permissions;
        const canActivate = perms?.effectiveInstanceRole === 'ADMIN' || perms?.effectiveInstanceRole === 'SUPERADMIN';

        return (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <MaterialIcon name="mail" size={40} className="mb-3 text-muted-foreground" />
                <h3 className="text-base font-semibold">
                    {canActivate ? 'E-Mail aktivieren' : 'E-Mail nicht aktiv'}
                </h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    {canActivate
                        ? <>{t('spaces.panels.email.dieser_space_bekommt_eine_anonymisierte_')} <code className="rounded bg-muted px-1">{t('spaces.panels.email.blauer-falter-k3mailprilogchat')}</code>{t('spaces.panels.email.ueber_die_externe_personen_per_e-mail_in')}</>
                        : 'Die E-Mail-Funktion wurde fuer diesen Space noch nicht eingerichtet.'}
                </p>
                {canActivate && (
                    <button
                        type="button"
                        onClick={toggleOn}
                        disabled={toggling}
                        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                        {toggling ? <Loader2 className="size-4 animate-spin" /> : <MaterialIcon name="mark_email_unread" size={18} />}
                        {t('spaces.panels.email.e-mail_fuer_diesen_space_einrichten')}
                    </button>
                )}
            </div>
        );
    }

    if (selected) {
        return <EmailDetail detail={selected} loading={loadingDetail} spaceAddress={spaceState.emailAddress} replyText={replyText} setReplyText={setReplyText} sending={sending} sendReply={sendReply} onBack={() => setSelected(null)} />;
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="shrink-0 border-b p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MaterialIcon name="mail" size={16} />
                    <span className="font-mono text-[11px] text-foreground">{spaceState.emailAddress}</span>
                    <button
                        onClick={() => spaceState.emailAddress && navigator.clipboard.writeText(spaceState.emailAddress)}
                        title={t('spaces.panels.email.adresse_kopieren')}
                        className="ml-auto rounded p-1 hover:bg-muted"
                    ><MaterialIcon name="content_copy" size={14} /></button>
                    <button
                        onClick={rotate}
                        disabled={toggling}
                        title={t('spaces.panels.email.neue_adresse_generieren')}
                        className="rounded p-1 hover:bg-muted"
                    ><MaterialIcon name="refresh" size={14} /></button>
                </div>
            </div>

            {/* Liste */}
            <div className={cn('flex-1 min-h-0 overflow-y-auto', fullscreen ? 'mx-auto w-full max-w-3xl' : '')}>
                {loading ? (
                    <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                ) : items.length === 0 ? (
                    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                        {t('spaces.panels.email.noch_keine_e-mails')}<br />{t('spaces.panels.email.schick_eine_test-mail_an_die_adresse_obe')}
                    </div>
                ) : (
                    <ul className="divide-y divide-border">
                        {items.map((m) => (
                            <li
                                key={m.id}
                                onClick={() => openDetail(m.id)}
                                className="cursor-pointer px-4 py-3 transition-colors hover:bg-muted/50"
                            >
                                <div className="flex items-start gap-2">
                                    {m.status === 'new' && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" />}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <p className={cn('truncate text-sm', m.status === 'new' && 'font-semibold')}>
                                                {m.fromName || m.fromAddress}
                                            </p>
                                            <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(m.receivedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <p className="truncate text-xs text-muted-foreground">{m.subject}</p>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function EmailDetail({
    detail, loading, spaceAddress, replyText, setReplyText, sending, sendReply, onBack,
}: {
    detail: SpaceEmailDetail;
    loading: boolean;
    spaceAddress: string | null;
    replyText: string;
    setReplyText: (v: string) => void;
    sending: boolean;
    sendReply: () => void;
    onBack: () => void;
}) {
    const t = useT();
    if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    return (
        <div className="flex h-full flex-col">
            <div className="shrink-0 border-b p-3">
                <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <MaterialIcon name="arrow_back" size={14} /> {t('spaces.panels.email.zurueck_zur_liste')}
                </button>
                <h3 className="mt-2 text-base font-semibold">{detail.subject}</h3>
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    <p><strong className="text-foreground">{t('spaces.panels.email.von')}</strong> {detail.fromName ? `${detail.fromName} <${detail.fromAddress}>` : detail.fromAddress}</p>
                    <p><strong className="text-foreground">{t('spaces.panels.email.an')}</strong> {detail.toAddress}</p>
                    {detail.ccAddresses.length > 0 && <p><strong className="text-foreground">{t('spaces.panels.email.cc')}</strong> {detail.ccAddresses.join(', ')}</p>}
                    <p>{new Date(detail.receivedAt).toLocaleString('de-DE')}</p>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                {detail.bodyHtml ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitize(detail.bodyHtml) }} />
                ) : detail.bodyText ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm">{detail.bodyText}</pre>
                ) : (
                    <p className="text-sm italic text-muted-foreground">{t('spaces.panels.email.inhalt_wird_geladen')}</p>
                )}
                {detail.attachments.length > 0 && (
                    <div className="mt-4 border-t pt-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('spaces.panels.email.anhaenge')}</p>
                        <ul className="space-y-1">
                            {detail.attachments.map((a, i) => (
                                <li key={i} className="text-sm">
                                    📎 {a.name} <span className="text-xs text-muted-foreground">({Math.round(a.size / 1024)} {t('spaces.panels.email.kb')}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {detail.replies.length > 0 && (
                    <div className="mt-6 border-t pt-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('spaces.panels.email.antworten')}</p>
                        <ul className="space-y-3">
                            {detail.replies.map((r) => (
                                <li key={r.id} className="rounded border border-border p-3">
                                    <p className="mb-1 text-xs text-muted-foreground">
                                        <strong>{r.fromAddress}</strong> → {r.toAddress} · {new Date(r.sentAt).toLocaleString('de-DE')}
                                    </p>
                                    <pre className="whitespace-pre-wrap font-sans text-sm">{r.bodyText}</pre>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Antworten */}
                <div className="mt-6 border-t pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('spaces.panels.email.antworten')}</p>
                    <p className="text-xs text-muted-foreground">
                        {t('spaces.panels.email.von')} <strong className="text-foreground">{spaceAddress}</strong> {t('spaces.panels.email.an')} <strong className="text-foreground">{detail.fromAddress}</strong>
                    </p>
                    <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={5}
                        placeholder={t('spaces.panels.email.antwort_eingeben')}
                        className="mt-2 w-full rounded-md border bg-background p-3 text-sm"
                    />
                    <button
                        onClick={sendReply}
                        disabled={sending || !replyText.trim()}
                        className="mt-2 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                        {sending && <Loader2 className="size-4 animate-spin" />}
                        {t('spaces.panels.email.antwort_senden')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function sanitize(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
}
