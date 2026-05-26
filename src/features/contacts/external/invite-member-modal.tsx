/**
 * InviteMemberModal — schickt Einladungs-Link statt Direktanlage.
 * Empfaenger setzt selbst Passwort, erscheint danach als Mitglied im Hub.
 */

import { type JSX, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { sessionStore } from '@/core/session/session-store';
import { useT } from "@/lib/i18n/use-t";

interface InvitationResult {
    inviteUrl: string;
    email: string;
    expiresAt: string;
}

export function InviteMemberModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): JSX.Element {
    const t = useT();
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<InvitationResult | null>(null);

    const submit = async () => {
        if (!email.trim()) {
            toast.error('E-Mail erforderlich');
            return;
        }
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) return;
        setSaving(true);
        try {
            const r = await fetch('/api/platform/v1/workspace/users/invite', {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim(),
                    fullName: fullName.trim() || undefined,
                    message: message.trim() || undefined,
                }),
            });
            if (!r.ok) throw new Error(await r.text());
            const data = await r.json() as { invitation: InvitationResult };
            setResult(data.invitation);
        } catch (e) {
            toast.error('Einladung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-lg rounded-lg bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <MaterialIcon name="forward_to_inbox" size={18} className="text-primary" />
                        {t('contacts.external.invite_member_modal.mitglied_einladen')}
                    </h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={18} /></button>
                </div>

                {!result ? (
                    <>
                        <div className="space-y-3 p-4">
                            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                {t('contacts.external.invite_member_modal.der_empfaenger_bekommt_einen_einladungs-')}
                            </p>

                            <label className="block">
                                <span className="text-[11px] text-muted-foreground">{t('contacts.external.invite_member_modal.e-mail-adresse')}</span>
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                    autoFocus
                                    placeholder={t('contacts.external.invite_member_modal.empfaengerschulede')}
                                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                            </label>

                            <label className="block">
                                <span className="text-[11px] text-muted-foreground">{t('contacts.external.invite_member_modal.voller_name_optional')}</span>
                                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                                    placeholder={t('contacts.external.invite_member_modal.maria_meyer')}
                                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                            </label>

                            <label className="block">
                                <span className="text-[11px] text-muted-foreground">{t('contacts.external.invite_member_modal.persoenliche_notiz_optional')}</span>
                                <textarea value={message} onChange={e => setMessage(e.target.value)}
                                    placeholder={t('contacts.external.invite_member_modal.hallo_maria_willkommen_bei_uns')}
                                    rows={3}
                                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                            </label>
                        </div>

                        <div className="flex justify-end gap-2 border-t px-4 py-3">
                            <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">{t('contacts.external.invite_member_modal.abbrechen')}</button>
                            <button onClick={submit} disabled={saving || !email.trim()}
                                className="flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                                {saving && <Loader2 className="size-3 animate-spin" />}
                                {t('contacts.external.invite_member_modal.einladung_erstellen')}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="space-y-3 p-4">
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                                <MaterialIcon name="check_circle" size={14} className="mr-1.5 inline-block size-3.5 align-text-bottom" />
                                {t('contacts.external.invite_member_modal.einladung_fuer')} <strong>{result.email}</strong> {t('contacts.external.invite_member_modal.erstellt_gueltig_bis')} {new Date(result.expiresAt).toLocaleDateString('de-DE')}.
                            </div>

                            <div>
                                <div className="mb-1 text-[11px] text-muted-foreground">{t('contacts.external.invite_member_modal.einladungs-link_auch_direkt_kopierbar')}</div>
                                <div className="flex items-center gap-2 rounded border bg-muted p-3">
                                    <code className="flex-1 select-all overflow-x-auto whitespace-nowrap font-mono text-[11px]">{result.inviteUrl}</code>
                                    <button onClick={() => { navigator.clipboard.writeText(result.inviteUrl); toast.success('Kopiert'); }}
                                        className="rounded border bg-background px-2 py-1 text-xs hover:bg-muted">
                                        <MaterialIcon name="content_copy" size={12} />
                                    </button>
                                </div>
                            </div>

                            <p className="text-[10px] text-muted-foreground">
                                {t('contacts.external.invite_member_modal.hinweis_der_versand_der_einladungs-e-mai')}
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 border-t px-4 py-3">
                            <button onClick={() => { onCreated(); onClose(); }}
                                className="rounded-md bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                                {t('contacts.external.invite_member_modal.fertig')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
