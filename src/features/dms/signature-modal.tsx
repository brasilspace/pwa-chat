/**
 * SignatureModal — DMS Phase 9: Sign-Request anlegen + bestehende verwalten.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useSignatureRequests, signatureRequestsApi, type SignatureRequest } from './use-signature-requests';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    documentId: string;
    documentTitle: string;
    onClose: () => void;
}

export function SignatureModal({ documentId, documentTitle, onClose }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { requests, loading, refresh } = useSignatureRequests(documentId);
    const [creating, setCreating] = useState(false);

    const cancel = async (id: string) => {
        if (!jwt) return;
        if (!confirm('Anfrage stornieren? Bereits gegebene Signaturen bleiben gueltig, aber neue werden nicht mehr akzeptiert.')) return;
        await signatureRequestsApi.cancel(jwt, id).catch(() => { });
        refresh();
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg bg-background shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-3">
                    <div>
                        <h2 className="flex items-center gap-1.5 text-base font-semibold"><MaterialIcon name="edit" size={16} className="size-4" /> {t('dms.signature_modal.e-signatur')}</h2>
                        <p className="text-[11px] text-muted-foreground truncate max-w-md">{documentTitle}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {!creating && (
                        <button onClick={() => setCreating(true)} className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center gap-1.5">
                            <MaterialIcon name="add" size={16} className="size-4" /> {t('dms.signature_modal.neue_signatur-anfrage')}
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

                    {!loading && requests.length === 0 && !creating && (
                        <p className="text-center text-xs text-muted-foreground italic py-6">
                            {t('dms.signature_modal.noch_keine_signatur-anfragen')}
                        </p>
                    )}

                    <ul className="space-y-3">
                        {requests.map(r => (
                            <li key={r.id}>
                                <RequestRow request={r} onCancel={() => cancel(r.id)} jwt={jwt ?? ''} />
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

function RequestRow({ request, onCancel, jwt }: { request: SignatureRequest; onCancel: () => void; jwt: string }): JSX.Element {
    const t = useT();
    const isActive = request.status === 'pending' || request.status === 'partially_signed';
    const isFullySigned = request.status === 'fully_signed';

    return (
        <div className="rounded border border-border bg-card p-3 space-y-2">
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <MaterialIcon name="draw" size={16} className="size-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">{request.title ?? 'Signatur-Anfrage'}</span>
                        <StatusBadge status={request.status} />
                    </div>
                    {request.note && <p className="mt-0.5 text-[11px] italic text-muted-foreground">"{request.note}"</p>}
                    <p className="text-[10px] text-muted-foreground">
                        {new Date(request.createdAt).toLocaleString('de-DE')}
                        {request.expiresAt && ` · läuft am ${new Date(request.expiresAt).toLocaleDateString('de-DE')} ab`}
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    <a
                        href={signatureRequestsApi.certificateUrl(request.id, jwt)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-border px-2 py-1 text-[10px] hover:bg-muted inline-flex items-center gap-1"
                        title={t('dms.signature_modal.signatur-zertifikat_als_pdf')}
                    >
                        <MaterialIcon name="download" size={16} className="size-2.5" /> {t('dms.signature_modal.zertifikat')}
                    </a>
                    {isActive && (
                        <button onClick={onCancel} className="rounded border border-red-500/40 px-2 py-1 text-[10px] text-red-600 hover:bg-red-500/10">
                            {t('dms.signature_modal.stornieren')}
                        </button>
                    )}
                </div>
            </div>

            <ul className="divide-y divide-border">
                {request.signatures.map(sig => (
                    <li key={sig.id} className="flex items-center gap-2 py-1.5 text-xs">
                        {sig.status === 'signed' ? <MaterialIcon name="check" size={16} className="size-3 text-emerald-600 shrink-0" />
                            : sig.status === 'declined' ? <MaterialIcon name="close" size={16} className="size-3 text-red-600 shrink-0" />
                                : <MaterialIcon name="error" size={16} className="size-3 text-amber-500 shrink-0" />}
                        <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{sig.signerName ?? sig.signerEmail}</div>
                            <div className="text-[10px] text-muted-foreground">{sig.signerEmail}</div>
                            {sig.signedAt && (
                                <div className="text-[10px] text-muted-foreground">
                                    {sig.status === 'signed' ? 'Unterschrieben' : 'Abgelehnt'} am {new Date(sig.signedAt).toLocaleString('de-DE')}
                                    {sig.declineReason && ` · "${sig.declineReason}"`}
                                </div>
                            )}
                        </div>
                        {sig.inviteUrl && sig.status === 'pending' && (
                            <button
                                onClick={async () => {
                                    if (sig.inviteUrl) await navigator.clipboard.writeText(sig.inviteUrl);
                                }}
                                className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted"
                                title={t('dms.signature_modal.invite-link_kopieren')}
                            >
                                {t('dms.signature_modal.link')}
                            </button>
                        )}
                    </li>
                ))}
            </ul>

            {isFullySigned && (
                <div className="rounded bg-emerald-50 dark:bg-emerald-950/20 p-2 text-[11px] text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                    <MaterialIcon name="check" size={16} className="size-3" /> {t('dms.signature_modal.vollstaendig_unterschrieben')}
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: SignatureRequest['status'] }): JSX.Element {
    const cls = status === 'fully_signed' ? 'bg-emerald-100 text-emerald-700'
        : status === 'cancelled' || status === 'expired' ? 'bg-red-100 text-red-700'
            : status === 'partially_signed' ? 'bg-amber-100 text-amber-700'
                : 'bg-muted text-muted-foreground';
    const label = ({
        pending: 'Ausstehend',
        partially_signed: 'Teilweise',
        fully_signed: 'Vollstaendig',
        cancelled: 'Storniert',
        expired: 'Abgelaufen',
    } as const)[status];
    return <span className={cn('rounded px-1.5 py-0.5 text-[10px]', cls)}>{label}</span>;
}

function CreateForm({ jwt, documentId, onCancel, onDone }: { jwt: string; documentId: string; onCancel: () => void; onDone: () => void }): JSX.Element {
    const t = useT();
    const [title, setTitle] = useState('');
    const [note, setNote] = useState('');
    const [expiryDays, setExpiryDays] = useState('14');
    const [signers, setSigners] = useState<Array<{ email: string; name: string }>>([{ email: '', name: '' }]);
    const [saving, setSaving] = useState(false);

    const addSigner = () => setSigners([...signers, { email: '', name: '' }]);
    const removeSigner = (i: number) => setSigners(signers.filter((_, idx) => idx !== i));
    const updateSigner = (i: number, patch: Partial<{ email: string; name: string }>) =>
        setSigners(signers.map((s, idx) => idx === i ? { ...s, ...patch } : s));

    const submit = async () => {
        const validSigners = signers.filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email));
        if (validSigners.length === 0) {
            alert('Mindestens ein Signer mit gueltiger Email noetig');
            return;
        }
        setSaving(true);
        try {
            await signatureRequestsApi.create(jwt, documentId, {
                signers: validSigners.map(s => ({ email: s.email, name: s.name || undefined })),
                title: title.trim() || undefined,
                note: note.trim() || undefined,
                expiryDays: parseInt(expiryDays, 10) || undefined,
            });
            onDone();
        } catch (e) {
            alert('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded border border-primary/40 bg-card p-3 space-y-2.5">
            <div>
                <label className="text-[10px] font-medium text-muted-foreground">{t('dms.signature_modal.titel_der_anfrage_optional')}</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('dms.signature_modal.zb_vertrag-acme-2026_bitte_unterschreibe')} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
            </div>
            <div>
                <label className="text-[10px] font-medium text-muted-foreground">{t('dms.signature_modal.notiz_an_die_signer_mit-gemailt')}</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
            </div>
            <div>
                <label className="text-[10px] font-medium text-muted-foreground">{t('dms.signature_modal.ablauf')}</label>
                <select value={expiryDays} onChange={e => setExpiryDays(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-sm">
                    <option value="7">{t('dms.signature_modal.7_tage')}</option>
                    <option value="14">{t('dms.signature_modal.14_tage')}</option>
                    <option value="30">{t('dms.signature_modal.30_tage')}</option>
                    <option value="90">{t('dms.signature_modal.90_tage')}</option>
                </select>
            </div>
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-muted-foreground">{t('dms.signature_modal.signer')}{signers.length})</label>
                    <button onClick={addSigner} className="rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted inline-flex items-center gap-1">
                        <MaterialIcon name="add" size={16} className="size-2.5" /> {t('dms.signature_modal.signer')}
                    </button>
                </div>
                <ul className="space-y-1">
                    {signers.map((s, idx) => (
                        <li key={idx} className="flex gap-1">
                            <input value={s.name} onChange={e => updateSigner(idx, { name: e.target.value })} placeholder={t('dms.signature_modal.name_optional')} className="w-1/3 rounded border border-border bg-background px-1.5 py-1 text-xs" />
                            <input value={s.email} onChange={e => updateSigner(idx, { email: e.target.value })} placeholder={t('dms.signature_modal.email')} type="email" className="flex-1 rounded border border-border bg-background px-1.5 py-1 text-xs" />
                            {signers.length > 1 && (
                                <button onClick={() => removeSigner(idx)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                                    <MaterialIcon name="delete" size={16} className="size-3" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={submit} disabled={saving} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1">
                    {saving ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="mail" size={16} className="size-3" />} {t('dms.signature_modal.einladungen_versenden')}
                </button>
                <button onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-xs">{t('dms.signature_modal.abbrechen')}</button>
            </div>
        </div>
    );
}
