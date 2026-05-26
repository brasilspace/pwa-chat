/**
 * ShareLinkModal — Erstellung + Verwaltung der Public-Share-Links eines Docs.
 *
 * Liste bestehender Links + "Neu erstellen"-Form (Expiry, Passwort, Max-Views,
 * Watermark, Empfaenger-Notiz). Pro Link: Copy + Revoke + Audit-Log-View.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useShareLinks, shareLinksApi, buildPublicShareUrl, type ShareLink } from './use-share-links';
import { Copy, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    documentId: string;
    documentTitle: string;
    onClose: () => void;
}

export function ShareLinkModal({ documentId, documentTitle, onClose }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { shares, loading, refresh } = useShareLinks(documentId);
    const [creating, setCreating] = useState(false);
    const [showAuditFor, setShowAuditFor] = useState<string | null>(null);

    const revoke = async (id: string) => {
        if (!jwt) return;
        if (!confirm('Diesen Link sofort deaktivieren? Externe koennen ihn dann nicht mehr aufrufen.')) return;
        await shareLinksApi.revoke(jwt, id).catch(() => { });
        refresh();
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg bg-background shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-3">
                    <div>
                        <h2 className="flex items-center gap-1.5 text-base font-semibold"><MaterialIcon name="link" size={16} className="size-4" /> {t('dms.share_link_modal.teilen')}</h2>
                        <p className="text-[11px] text-muted-foreground truncate max-w-md">{documentTitle}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {!creating && (
                        <button onClick={() => setCreating(true)} className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center gap-1.5">
                            <MaterialIcon name="link" size={16} className="size-4" /> {t('dms.share_link_modal.neuen_link_erstellen')}
                        </button>
                    )}

                    {creating && jwt && (
                        <CreateForm
                            jwt={jwt}
                            documentId={documentId}
                            onCancel={() => setCreating(false)}
                            onDone={() => { setCreating(false); refresh(); }}
                        />
                    )}

                    {loading && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}

                    {!loading && shares.length === 0 && !creating && (
                        <p className="text-center text-xs text-muted-foreground italic py-6">
                            {t('dms.share_link_modal.noch_keine_share-links_klick_neuen_link_')}
                        </p>
                    )}

                    <ul className="space-y-2">
                        {shares.map(s => (
                            <li key={s.id}>
                                <ShareRow share={s} onRevoke={() => revoke(s.id)} onShowAudit={() => setShowAuditFor(s.id)} />
                            </li>
                        ))}
                    </ul>
                </div>

                {showAuditFor && jwt && (
                    <AuditModal jwt={jwt} shareId={showAuditFor} onClose={() => setShowAuditFor(null)} />
                )}
            </div>
        </div>
    );
}

function ShareRow({ share, onRevoke, onShowAudit }: { share: ShareLink; onRevoke: () => void; onShowAudit: () => void }): JSX.Element {
    const t = useT();
    const url = buildPublicShareUrl(share.slug);
    const [copied, setCopied] = useState(false);
    const isRevoked = !!share.revokedAt;
    const isExpired = share.expiresAt ? new Date(share.expiresAt) <= new Date() : false;
    const isMaxedOut = share.maxViews !== null && share.views >= share.maxViews;
    const inactive = isRevoked || isExpired || isMaxedOut;

    const copy = async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className={cn('rounded border border-border bg-card p-2.5', inactive && 'opacity-60')}>
            <div className="flex items-center gap-2">
                <input
                    readOnly
                    value={url}
                    className="flex-1 rounded border border-border bg-muted/30 px-2 py-1 text-[11px] font-mono cursor-text"
                    onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button onClick={copy} disabled={inactive} className="rounded border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1">
                    {copied ? <><MaterialIcon name="check" size={16} className="size-3 text-emerald-600" /> {t('dms.share_link_modal.kopiert')}</> : <><MaterialIcon name="content_copy" size={16} className="size-3" /> {t('dms.share_link_modal.kopieren')}</>}
                </button>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {share.hasPassword && <Badge icon={<MaterialIcon name="lock" size={16} className="size-2.5" />}>{t('dms.share_link_modal.passwort')}</Badge>}
                {share.expiresAt && <Badge icon={<MaterialIcon name="schedule" size={16} className="size-2.5" />} variant={isExpired ? 'red' : 'neutral'}>
                    {isExpired ? 'abgelaufen' : `bis ${new Date(share.expiresAt).toLocaleDateString('de-DE')}`}
                </Badge>}
                {share.maxViews && <Badge icon={<MaterialIcon name="tag" size={16} className="size-2.5" />} variant={isMaxedOut ? 'red' : 'neutral'}>
                    {share.views} / {share.maxViews}
                </Badge>}
                {share.maxViews === null && share.views > 0 && <Badge icon={<MaterialIcon name="visibility" size={16} className="size-2.5" />}>{share.views} {t('dms.share_link_modal.aufrufe')}</Badge>}
                {share.watermark && <Badge icon={<MaterialIcon name="gpp_maybe" size={16} className="size-2.5" />} variant="amber">{t('dms.share_link_modal.watermark')}</Badge>}
                {isRevoked && <Badge variant="red">deaktiviert</Badge>}
                {share.recipientNote && <span className="italic">"{share.recipientNote}"</span>}
            </div>

            <div className="mt-1.5 flex items-center gap-1">
                <button onClick={onShowAudit} className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-muted inline-flex items-center gap-1">
                    <MaterialIcon name="visibility" size={16} className="size-2.5" /> {t('dms.share_link_modal.aufrufe_ansehen')}
                </button>
                {!isRevoked && (
                    <button onClick={onRevoke} className="rounded border border-red-500/40 px-2 py-0.5 text-[10px] text-red-600 hover:bg-red-500/10 inline-flex items-center gap-1">
                        <MaterialIcon name="gpp_bad" size={16} className="size-2.5" /> {t('dms.share_link_modal.deaktivieren')}
                    </button>
                )}
            </div>
        </div>
    );
}

function Badge({ icon, children, variant = 'neutral' }: { icon?: React.ReactNode; children: React.ReactNode; variant?: 'neutral' | 'red' | 'amber' | 'green' }): JSX.Element {
    const cls = variant === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300'
        : variant === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
            : variant === 'green' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                : 'bg-muted text-muted-foreground';
    return <span className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-0.5', cls)}>{icon}{children}</span>;
}

function CreateForm({ jwt, documentId, onCancel, onDone }: { jwt: string; documentId: string; onCancel: () => void; onDone: () => void }): JSX.Element {
    const t = useT();
    const [expiryDays, setExpiryDays] = useState<string>('7');
    const [passwordEnabled, setPasswordEnabled] = useState(false);
    const [password, setPassword] = useState('');
    const [maxViewsEnabled, setMaxViewsEnabled] = useState(false);
    const [maxViews, setMaxViews] = useState('1');
    const [watermark, setWatermark] = useState(false);
    const [recipientNote, setRecipientNote] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        setSaving(true);
        try {
            const expiresAt = expiryDays === '0'
                ? null
                : new Date(Date.now() + parseInt(expiryDays, 10) * 24 * 60 * 60 * 1000).toISOString();

            await shareLinksApi.create(jwt, documentId, {
                expiresAt,
                password: passwordEnabled && password ? password : null,
                maxViews: maxViewsEnabled ? parseInt(maxViews, 10) : null,
                watermark,
                recipientNote: recipientNote.trim() || undefined,
            });
            onDone();
        } catch (e) {
            alert('Erstellen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded border border-primary/40 bg-card p-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.share_link_modal.ablauf')}</label>
                    <select value={expiryDays} onChange={e => setExpiryDays(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-xs">
                        <option value="1">{t('dms.share_link_modal.1_tag')}</option>
                        <option value="7">{t('dms.share_link_modal.7_tage')}</option>
                        <option value="30">{t('dms.share_link_modal.30_tage')}</option>
                        <option value="90">{t('dms.share_link_modal.90_tage')}</option>
                        <option value="0">{t('dms.share_link_modal.nie_ablaufen')}</option>
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.share_link_modal.empfaenger-notiz_intern')}</label>
                    <input value={recipientNote} onChange={e => setRecipientNote(e.target.value)} placeholder={t('dms.share_link_modal.zb_frau_mueller_eltern')} className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
                </div>
            </div>

            <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={passwordEnabled} onChange={e => setPasswordEnabled(e.target.checked)} className="size-3.5" />
                    <MaterialIcon name="lock" size={16} className="size-3" /> {t('dms.share_link_modal.passwort-schutz')}
                </label>
                {passwordEnabled && (
                    <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('dms.share_link_modal.min_4_zeichen')} className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
                )}
            </div>

            <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={maxViewsEnabled} onChange={e => setMaxViewsEnabled(e.target.checked)} className="size-3.5" />
                    <MaterialIcon name="tag" size={16} className="size-3" /> {t('dms.share_link_modal.max-aufrufe')}
                </label>
                {maxViewsEnabled && (
                    <input type="number" min="1" value={maxViews} onChange={e => setMaxViews(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
                )}
            </div>

            <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={watermark} onChange={e => setWatermark(e.target.checked)} className="size-3.5" />
                <MaterialIcon name="gpp_maybe" size={16} className="size-3" /> {t('dms.share_link_modal.vertraulich-hinweis_watermark_anzeigen')}
            </label>

            <div className="flex items-center gap-2">
                <button onClick={submit} disabled={saving || (passwordEnabled && password.length < 4)} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50 inline-flex items-center gap-1">
                    {saving ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="link" size={16} className="size-3" />} {t('dms.share_link_modal.link_erstellen')}
                </button>
                <button onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-xs">{t('dms.share_link_modal.abbrechen')}</button>
            </div>
        </div>
    );
}

function AuditModal({ jwt, shareId, onClose }: { jwt: string; shareId: string; onClose: () => void }): JSX.Element {
    const t = useT();
    const [views, setViews] = useState<Array<{ id: string; result: string; ipAddress: string | null; userAgent: string | null; recipientEmail: string | null; createdAt: string }> | null>(null);

    if (views === null) {
        shareLinksApi.views(jwt, shareId).then(r => setViews(r.views)).catch(() => setViews([]));
    }

    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div className="w-full max-w-xl max-h-[70vh] flex flex-col rounded-lg bg-background shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-3">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MaterialIcon name="visibility" size={16} className="size-4" /> {t('dms.share_link_modal.aufrufe')}</h3>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                    {!views && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
                    {views && views.length === 0 && <p className="text-center text-xs text-muted-foreground italic py-6">{t('dms.share_link_modal.noch_keine_aufrufe')}</p>}
                    {views && views.length > 0 && (
                        <ul className="divide-y divide-border">
                            {views.map(v => (
                                <li key={v.id} className="py-2 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className={cn('font-medium', v.result === 'granted' ? 'text-emerald-600' : 'text-red-600')}>
                                            {v.result === 'granted' ? '✓ Zugriff erlaubt' :
                                                v.result === 'denied_password' ? '✗ Passwort falsch' :
                                                    v.result === 'denied_expired' ? '✗ Abgelaufen' :
                                                        v.result === 'denied_revoked' ? '✗ Deaktiviert' :
                                                            v.result === 'denied_max_views' ? '✗ Max Aufrufe erreicht' :
                                                                v.result}
                                        </span>
                                        <span className="text-muted-foreground text-[10px]">{new Date(v.createdAt).toLocaleString('de-DE')}</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        {v.ipAddress && <>IP {v.ipAddress} · </>}
                                        {v.recipientEmail && <>{v.recipientEmail} · </>}
                                        {v.userAgent && <span className="truncate">{v.userAgent.slice(0, 80)}</span>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
