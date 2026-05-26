import { type JSX, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { externalContactsApi } from '@/gateways/platform/external-contacts-gateway';
import { toast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';
import { useT } from "@/lib/i18n/use-t";

export function CreateExternalContactModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }): JSX.Element {
    const t = useT();
    const [kind, setKind] = useState<'person' | 'organization'>('person');
    const [salutation, setSalutation] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [visibility, setVisibility] = useState<'tenant' | 'private'>('tenant');
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (kind === 'person' && !firstName && !lastName) {
            toast.error('Vorname oder Nachname erforderlich');
            return;
        }
        if (kind === 'organization' && !fullName) {
            toast.error('Name erforderlich');
            return;
        }
        setSaving(true);
        try {
            const res = await externalContactsApi.create({
                kind,
                salutation: salutation || null,
                firstName: kind === 'person' ? (firstName || null) : null,
                lastName: kind === 'person' ? (lastName || null) : null,
                fullName: kind === 'organization' ? fullName : null,
                emails: email ? [{ value: email, primary: true, label: 'geschäftlich' }] : [],
                phones: phone ? [{ value: phone, primary: true, label: 'geschäftlich' }] : [],
                notes: notes || null,
                visibility,
            });
            toast.success('Kontakt erstellt');
            onCreated(res.contact.id);
        } catch (e) {
            toast.error('Erstellen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-lg rounded-lg bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                    <h2 className="text-sm font-semibold">{t('contacts.external.create_external_contact_modal.neuer_kontakt')}</h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={18} /></button>
                </div>

                <div className="space-y-3 p-4">
                    {/* Kind toggle */}
                    <div className="flex gap-1 rounded-md bg-muted p-1">
                        {([['person', 'Person', 'person'], ['organization', 'Organisation', 'apartment']] as const).map(([k, label, icon]) => (
                            <button
                                key={k}
                                onClick={() => setKind(k)}
                                className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors ${kind === k ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                            >
                                <MaterialIcon name={icon} size={16} className="size-3.5" />
                                {label}
                            </button>
                        ))}
                    </div>

                    {kind === 'person' ? (
                        <>
                            <div className="grid gap-2 md:grid-cols-2">
                                <Input placeholder={t('contacts.external.create_external_contact_modal.anrede_optional')} value={salutation} onChange={setSalutation} />
                                <div />
                                <Input placeholder={t('contacts.external.create_external_contact_modal.vorname')} value={firstName} onChange={setFirstName} />
                                <Input placeholder={t('contacts.external.create_external_contact_modal.nachname')} value={lastName} onChange={setLastName} />
                            </div>
                        </>
                    ) : (
                        <Input placeholder={t('contacts.external.create_external_contact_modal.name_der_organisation')} value={fullName} onChange={setFullName} autoFocus />
                    )}

                    <Input type="email" placeholder={t('contacts.external.create_external_contact_modal.e-mail_optional')} value={email} onChange={setEmail} />
                    <Input type="tel" placeholder={t('contacts.external.create_external_contact_modal.telefon_optional')} value={phone} onChange={setPhone} />
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder={t('contacts.external.create_external_contact_modal.notizen_optional')} rows={3}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />

                    <div>
                        <label className="text-[11px] text-muted-foreground">{t('contacts.external.create_external_contact_modal.sichtbarkeit')}</label>
                        <select value={visibility} onChange={e => setVisibility(e.target.value as 'tenant' | 'private')}
                            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                            <option value="tenant">{t('contacts.external.create_external_contact_modal.alle_im_tenant')}</option>
                            <option value="private">{t('contacts.external.create_external_contact_modal.nur_ich')}</option>
                        </select>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t px-4 py-3">
                    <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">{t('contacts.external.create_external_contact_modal.abbrechen')}</button>
                    <button onClick={submit} disabled={saving}
                        className="flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {saving && <Loader2 className="size-3 animate-spin" />}
                        {t('contacts.external.create_external_contact_modal.erstellen')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Input({ value, onChange, autoFocus, type = 'text', placeholder }: {
    value: string; onChange: (v: string) => void; autoFocus?: boolean; type?: string; placeholder: string;
}): JSX.Element {
    return (
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
            autoFocus={autoFocus}
            placeholder={placeholder}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    );
}
