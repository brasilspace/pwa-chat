/**
 * PublicSharePage — oeffentliche Anzeige fuer /s/:slug.
 * Kein Login. Holt Status vom Backend. Falls Passwort nötig: Form.
 * Wenn ok: Datei-Info + Download-Button + (falls watermark) Hinweis.
 */

import { type JSX, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';
import { Download, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

type Status = 'loading' | 'ok' | 'needs_password' | 'wrong_password' | 'expired' | 'revoked' | 'max_views' | 'not_found' | 'storage_unavailable' | 'granted';

interface ShareInfo {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    watermark: boolean;
    recipientNote: string | null;
}

interface AccessResult extends ShareInfo {
    downloadUrl: string;
    expiresAt: string;
}

export function PublicSharePage(): JSX.Element {
    const t = useT();
    const { slug } = useParams<{ slug: string }>();
    const [status, setStatus] = useState<Status>('loading');
    const [info, setInfo] = useState<ShareInfo | null>(null);
    const [access, setAccess] = useState<AccessResult | null>(null);
    const [password, setPassword] = useState('');
    const [recipientEmail, setRecipientEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Initial: Status holen
    useEffect(() => {
        if (!slug) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await requestJson<{ status: Status; fileName?: string; mimeType?: string; sizeBytes?: number; watermark?: boolean; recipientNote?: string | null }>({
                    target: 'platform', baseUrl: env.platformBaseUrl,
                    path: `/api/public/shares/${encodeURIComponent(slug)}`,
                    method: 'GET',
                });
                if (cancelled) return;
                setStatus(res.status);
                if (res.fileName) {
                    setInfo({
                        fileName: res.fileName, mimeType: res.mimeType ?? '', sizeBytes: res.sizeBytes ?? 0,
                        watermark: res.watermark ?? false, recipientNote: res.recipientNote ?? null,
                    });
                }
                // Wenn ok ohne Passwort, sofort access auch holen (für direkten Download-Link)
                if (res.status === 'ok') void doAccess('');
            } catch {
                if (!cancelled) setStatus('not_found');
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    const doAccess = async (pw: string) => {
        if (!slug) return;
        setSubmitting(true);
        try {
            const res = await requestJson<{ status: Status; fileName?: string; mimeType?: string; sizeBytes?: number; downloadUrl?: string; expiresAt?: string; watermark?: boolean; recipientNote?: string | null }>({
                target: 'platform', baseUrl: env.platformBaseUrl,
                path: `/api/public/shares/${encodeURIComponent(slug)}/access`,
                method: 'POST',
                body: JSON.stringify({
                    password: pw || undefined,
                    recipientEmail: recipientEmail.trim() || undefined,
                }),
            });
            setStatus(res.status);
            if (res.status === 'granted' && res.downloadUrl) {
                setAccess({
                    fileName: res.fileName ?? '', mimeType: res.mimeType ?? '', sizeBytes: res.sizeBytes ?? 0,
                    downloadUrl: res.downloadUrl, expiresAt: res.expiresAt ?? '',
                    watermark: res.watermark ?? false, recipientNote: res.recipientNote ?? null,
                });
            }
        } catch (err: unknown) {
            const e = err as { status?: number; body?: { status?: Status } };
            if (e?.status === 401) setStatus('wrong_password');
            else if (e?.status === 410) setStatus(e.body?.status ?? 'expired');
            else if (e?.status === 404) setStatus('not_found');
            else setStatus('storage_unavailable');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-4">
            <div className="w-full max-w-md">
                <div className="rounded-lg bg-background shadow-xl p-6 space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MaterialIcon name="description" size={16} className="size-4" />
                        {t('dms.public_share_page.datei-freigabe')}
                    </div>

                    {status === 'loading' && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {status === 'not_found' && (
                        <ErrorBox icon={<MaterialIcon name="warning" size={16} className="size-8 text-red-500" />} title={t('dms.public_share_page.link_nicht_gefunden')} body="Der Link ist ungültig oder wurde bereits gelöscht." />
                    )}
                    {status === 'expired' && (
                        <ErrorBox icon={<MaterialIcon name="warning" size={16} className="size-8 text-red-500" />} title={t('dms.public_share_page.link_abgelaufen')} body="Diese Freigabe ist nicht mehr gültig." />
                    )}
                    {status === 'revoked' && (
                        <ErrorBox icon={<MaterialIcon name="warning" size={16} className="size-8 text-red-500" />} title={t('dms.public_share_page.link_deaktiviert')} body="Der Absender hat den Zugriff zurückgezogen." />
                    )}
                    {status === 'max_views' && (
                        <ErrorBox icon={<MaterialIcon name="warning" size={16} className="size-8 text-red-500" />} title={t('dms.public_share_page.maximale_aufrufe_erreicht')} body="Diese Freigabe ist nicht mehr aufrufbar." />
                    )}
                    {status === 'storage_unavailable' && (
                        <ErrorBox icon={<MaterialIcon name="warning" size={16} className="size-8 text-red-500" />} title={t('dms.public_share_page.speicher_nicht_erreichbar')} body="Bitte später nochmal versuchen oder den Absender kontaktieren." />
                    )}

                    {(status === 'needs_password' || status === 'wrong_password') && info && (
                        <div className="space-y-3">
                            <div>
                                <div className="font-semibold text-sm">{info.fileName}</div>
                                <div className="text-[11px] text-muted-foreground">{info.mimeType} · {formatBytes(info.sizeBytes)}</div>
                            </div>
                            {info.recipientNote && <p className="text-xs italic text-muted-foreground">"{info.recipientNote}"</p>}
                            <div className="rounded border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-2 flex items-start gap-2">
                                <MaterialIcon name="lock" size={16} className="size-4 text-amber-600 mt-0.5 shrink-0" />
                                <p className="text-xs">{t('dms.public_share_page.diese_freigabe_ist_passwortgeschuetzt')}</p>
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder={t('dms.public_share_page.passwort')}
                                className={cn('w-full rounded border bg-background px-3 py-2 text-sm', status === 'wrong_password' ? 'border-red-500' : 'border-border')}
                                onKeyDown={e => { if (e.key === 'Enter') void doAccess(password); }}
                            />
                            {status === 'wrong_password' && <p className="text-xs text-red-600">{t('dms.public_share_page.falsches_passwort')}</p>}
                            <input
                                type="email"
                                value={recipientEmail}
                                onChange={e => setRecipientEmail(e.target.value)}
                                placeholder={t('dms.public_share_page.deine_email_optional_wird_im_audit_gespe')}
                                className="w-full rounded border border-border bg-background px-3 py-2 text-xs"
                            />
                            <button
                                onClick={() => doAccess(password)}
                                disabled={submitting || password.length < 4}
                                className="w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                            >
                                {submitting ? <Loader2 className="size-4 animate-spin" /> : <MaterialIcon name="download" size={16} className="size-4" />}
                                {t('dms.public_share_page.datei_aufrufen')}
                            </button>
                        </div>
                    )}

                    {status === 'granted' && access && (
                        <div className="space-y-3">
                            {access.watermark && (
                                <div className="rounded border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-2 flex items-start gap-2">
                                    <MaterialIcon name="gpp_maybe" size={16} className="size-4 text-amber-600 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs font-medium">VERTRAULICH</p>
                                        <p className="text-[11px] text-muted-foreground">{t('dms.public_share_page.diese_datei_ist_fuer_dich_persoenlich_fr')}</p>
                                    </div>
                                </div>
                            )}
                            <div>
                                <div className="font-semibold text-sm">{access.fileName}</div>
                                <div className="text-[11px] text-muted-foreground">{access.mimeType} · {formatBytes(access.sizeBytes)}</div>
                                {access.recipientNote && <p className="mt-1 text-xs italic text-muted-foreground">"{access.recipientNote}"</p>}
                            </div>
                            <a
                                href={access.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full rounded bg-primary px-3 py-2 text-center text-sm text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center gap-1.5"
                                download={access.fileName}
                            >
                                <MaterialIcon name="download" size={16} className="size-4" /> {t('dms.public_share_page.herunterladen')}
                            </a>
                            <p className="text-[10px] text-muted-foreground text-center">{t('dms.public_share_page.der_download-link_gilt_15_minuten')}</p>
                        </div>
                    )}

                    {status === 'ok' && info && !access && (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                    )}
                </div>

                <p className="mt-4 text-center text-[10px] text-muted-foreground">
                    {t('dms.public_share_page.sicher_geteilt_mit_prilog')}
                </p>
            </div>
        </div>
    );
}

function ErrorBox({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }): JSX.Element {
    return (
        <div className="text-center space-y-2 py-4">
            <div className="flex justify-center">{icon}</div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{body}</p>
        </div>
    );
}

function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
