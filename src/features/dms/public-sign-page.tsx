/**
 * PublicSignPage — oeffentliche Sign-Seite fuer /sign/:slug.
 *
 * Workflow: Status holen → Doc-Vorschau zeigen → Bestaetigen-Form.
 * Optional: ablehnen mit Grund.
 */

import { type JSX, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

type Status = 'loading' | 'pending' | 'already_signed' | 'already_declined' | 'expired' | 'cancelled' | 'not_found' | 'signed' | 'declined';

interface SignInfo {
    doc: { title: string; mimeType: string; sizeBytes: number; previewUrl: string | null };
    signer: { email: string; name: string | null };
    request: { title: string | null; note: string | null; expiresAt: string | null };
}

export function PublicSignPage(): JSX.Element {
    const t = useT();
    const { slug } = useParams<{ slug: string }>();
    const [status, setStatus] = useState<Status>('loading');
    const [info, setInfo] = useState<SignInfo | null>(null);
    const [signerName, setSignerName] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [showDecline, setShowDecline] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
    const [signing, setSigning] = useState(false);
    const [signedAt, setSignedAt] = useState<string | null>(null);
    const [signatureHash, setSignatureHash] = useState<string | null>(null);

    useEffect(() => {
        if (!slug) return;
        void (async () => {
            try {
                const res = await requestJson<{ status: Status; doc?: SignInfo['doc']; signer?: SignInfo['signer']; request?: SignInfo['request']; signedAt?: string; signerName?: string; declineReason?: string }>({
                    target: 'platform', baseUrl: env.platformBaseUrl,
                    path: `/api/public/sign/${encodeURIComponent(slug)}`,
                    method: 'GET',
                });
                setStatus(res.status);
                if (res.doc && res.signer && res.request) {
                    setInfo({ doc: res.doc, signer: res.signer, request: res.request });
                    setSignerName(res.signer.name ?? '');
                }
                if (res.signedAt) setSignedAt(res.signedAt);
            } catch {
                setStatus('not_found');
            }
        })();
    }, [slug]);

    const submit = async (decline: boolean) => {
        if (!slug) return;
        setSigning(true);
        try {
            const res = await requestJson<{ status: Status; signedAt?: string; signatureHash?: string }>({
                target: 'platform', baseUrl: env.platformBaseUrl,
                path: `/api/public/sign/${encodeURIComponent(slug)}/confirm`,
                method: 'POST',
                body: JSON.stringify(decline
                    ? { decline: true, declineReason: declineReason.trim() || undefined }
                    : { signerName: signerName.trim() || undefined }),
            });
            setStatus(res.status);
            if (res.signedAt) setSignedAt(res.signedAt);
            if (res.signatureHash) setSignatureHash(res.signatureHash);
        } catch (err: unknown) {
            const e = err as { status?: number };
            if (e?.status === 410) setStatus('expired');
            else if (e?.status === 409) setStatus('already_signed');
            else setStatus('not_found');
        } finally {
            setSigning(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-4">
            <div className="w-full max-w-lg">
                <div className="rounded-lg bg-background shadow-xl p-6 space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MaterialIcon name="draw" size={16} className="size-4" /> {t('dms.public_sign_page.elektronische_signatur')}
                    </div>

                    {status === 'loading' && <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}

                    {status === 'not_found' && <ErrorBox icon={<MaterialIcon name="warning" size={16} className="size-8 text-red-500" />} title={t('dms.public_sign_page.link_nicht_gefunden')} body="Der Link ist ungültig oder wurde nie ausgestellt." />}
                    {status === 'expired' && <ErrorBox icon={<MaterialIcon name="warning" size={16} className="size-8 text-red-500" />} title={t('dms.public_sign_page.link_abgelaufen')} body="Diese Signatur-Anfrage ist nicht mehr gueltig." />}
                    {status === 'cancelled' && <ErrorBox icon={<MaterialIcon name="warning" size={16} className="size-8 text-red-500" />} title={t('dms.public_sign_page.anfrage_storniert')} body="Der Absender hat die Anfrage zurueckgezogen." />}
                    {status === 'already_signed' && <ErrorBox icon={<MaterialIcon name="check" size={16} className="size-8 text-emerald-500" />} title={t('dms.public_sign_page.bereits_signiert')} body={signedAt ? `Du hast am ${new Date(signedAt).toLocaleString('de-DE')} signiert.` : 'Du hast bereits signiert.'} />}
                    {status === 'already_declined' && <ErrorBox icon={<MaterialIcon name="close" size={16} className="size-8 text-red-500" />} title={t('dms.public_sign_page.bereits_abgelehnt')} body="Du hast diese Anfrage bereits abgelehnt." />}

                    {status === 'signed' && (
                        <div className="space-y-3 py-2">
                            <div className="flex justify-center"><MaterialIcon name="check" size={16} className="size-12 text-emerald-500" /></div>
                            <h2 className="text-center font-semibold text-lg">{t('dms.public_sign_page.erfolgreich_unterschrieben')}</h2>
                            {signedAt && <p className="text-center text-xs text-muted-foreground">{new Date(signedAt).toLocaleString('de-DE')}</p>}
                            {signatureHash && (
                                <div className="rounded bg-muted/30 p-2 text-[10px] font-mono break-all text-center">
                                    {t('dms.public_sign_page.signatur-hash')} {signatureHash}
                                </div>
                            )}
                            <p className="text-center text-xs text-muted-foreground">{t('dms.public_sign_page.die_bestaetigung_ist_gespeichert_du_kann')}</p>
                        </div>
                    )}

                    {status === 'declined' && (
                        <div className="space-y-3 py-2">
                            <div className="flex justify-center"><MaterialIcon name="close" size={16} className="size-12 text-red-500" /></div>
                            <h2 className="text-center font-semibold">{t('dms.public_sign_page.abgelehnt')}</h2>
                            <p className="text-center text-xs text-muted-foreground">{t('dms.public_sign_page.der_absender_wurde_benachrichtigt')}</p>
                        </div>
                    )}

                    {status === 'pending' && info && (
                        <div className="space-y-3">
                            <div className="rounded border border-border bg-muted/20 p-3 space-y-1">
                                <div className="font-semibold">{info.doc.title}</div>
                                <div className="text-[11px] text-muted-foreground">{info.doc.mimeType} · {formatBytes(info.doc.sizeBytes)}</div>
                                {info.doc.previewUrl && (
                                    <a href={info.doc.previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                        <MaterialIcon name="open_in_new" size={16} className="size-3" /> {t('dms.public_sign_page.dokument_ansehen')}
                                    </a>
                                )}
                            </div>

                            {info.request.note && (
                                <div className="rounded border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-2">
                                    <p className="text-xs font-medium">{t('dms.public_sign_page.notiz_vom_absender')}</p>
                                    <p className="text-xs italic">"{info.request.note}"</p>
                                </div>
                            )}

                            <div>
                                <label className="text-[10px] font-medium text-muted-foreground">{t('dms.public_sign_page.eingeladen_als')}</label>
                                <p className="text-sm">{info.signer.email}</p>
                            </div>

                            {!showDecline && (
                                <>
                                    <div>
                                        <label className="text-[10px] font-medium text-muted-foreground">{t('dms.public_sign_page.dein_voller_name_fuer_signatur-block')}</label>
                                        <input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder={t('dms.public_sign_page.vor-_und_nachname')} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
                                    </div>

                                    <label className="flex items-start gap-2 text-xs">
                                        <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} className="mt-0.5 size-3.5" />
                                        <span>
                                            {t('dms.public_sign_page.ich_bestaetige_dass_ich_das_dokument_gel')} <strong>{t('dms.public_sign_page.eidas_art_26')}</strong>.
                                        </span>
                                    </label>

                                    <button
                                        onClick={() => submit(false)}
                                        disabled={signing || !acceptedTerms || !signerName.trim()}
                                        className="w-full rounded bg-primary px-3 py-2.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                                    >
                                        {signing ? <Loader2 className="size-4 animate-spin" /> : <MaterialIcon name="edit" size={16} className="size-4" />}
                                        {t('dms.public_sign_page.jetzt_unterschreiben')}
                                    </button>
                                    <button
                                        onClick={() => setShowDecline(true)}
                                        className="w-full text-center text-xs text-muted-foreground hover:underline"
                                    >
                                        {t('dms.public_sign_page.ablehnen')}
                                    </button>
                                </>
                            )}

                            {showDecline && (
                                <div className="rounded border border-red-500/40 bg-red-50 dark:bg-red-950/20 p-3 space-y-2">
                                    <p className="text-xs font-medium">{t('dms.public_sign_page.anfrage_ablehnen')}</p>
                                    <textarea
                                        value={declineReason}
                                        onChange={e => setDeclineReason(e.target.value)}
                                        rows={3}
                                        placeholder={t('dms.public_sign_page.grund_optional_wird_dem_absender_mitgete')}
                                        className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowDecline(false)} className="flex-1 rounded border border-border py-1.5 text-xs">{t('dms.public_sign_page.doch_zurueck')}</button>
                                        <button onClick={() => submit(true)} disabled={signing} className="flex-1 rounded bg-red-600 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                                            {signing ? '...' : 'Bestaetigen'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <p className="mt-4 text-center text-[10px] text-muted-foreground">
                    {t('dms.public_sign_page.sicher_signiert_mit_prilog_dms_eidas_art')}
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

// Unused import suppression
void cn;
