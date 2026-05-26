/**
 * ExternalContactDetailPanel — Detail rechts mit 3 Tabs
 *   • Stammdaten — bearbeitbar inline
 *   • Verlauf    — Activity-Timeline mit Quick-Add Note
 *   • Verknüpfungen — Phase 2 (Documents/Tasks)
 */

import { type JSX, useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { externalContactsApi, type ExternalContactDetail, type ContactActivity } from '@/gateways/platform/external-contacts-gateway';
import { toast } from '@/components/ui/toast';
import { useT } from "@/lib/i18n/use-t";

const ACTIVITY_ICONS: Record<ContactActivity['kind'], { icon: string; color: string; label: string }> = {
    call: { icon: 'phone', color: 'text-blue-500', label: 'Telefonat' },
    email: { icon: 'mail', color: 'text-emerald-500', label: 'E-Mail' },
    meeting: { icon: 'event', color: 'text-violet-500', label: 'Treffen' },
    note: { icon: 'sticky_note_2', color: 'text-amber-500', label: 'Notiz' },
    document: { icon: 'description', color: 'text-slate-500', label: 'Dokument' },
    task: { icon: 'check_box', color: 'text-orange-500', label: 'Aufgabe' },
};

function formatActivityTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function ExternalContactDetailPanel({
    contactId, onClose, onChange, onDelete,
}: {
    contactId: string;
    onClose: () => void;
    onChange: () => void;
    onDelete: () => void;
}): JSX.Element {
    const t = useT();
    const [tab, setTab] = useState<'data' | 'history' | 'links'>('data');
    const [contact, setContact] = useState<ExternalContactDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await externalContactsApi.get(contactId);
            setContact(res.contact);
        } catch (e) {
            toast.error('Kontakt konnte nicht geladen werden');
        } finally {
            setLoading(false);
        }
    }, [contactId]);

    useEffect(() => { load(); }, [load]);

    if (loading || !contact) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const primaryEmail = contact.emails.find(e => e.primary)?.value ?? contact.emails[0]?.value;
    const primaryPhone = contact.phones.find(p => p.primary)?.value ?? contact.phones[0]?.value;

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-start gap-3 border-b px-4 py-3">
                <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden">
                    <MaterialIcon name="chevron_left" size={20} />
                </button>
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {contact.kind === 'organization'
                        ? <MaterialIcon name="apartment" size={20} />
                        : `${(contact.firstName?.[0] ?? '').toUpperCase()}${(contact.lastName?.[0] ?? '').toUpperCase()}` || '?'}
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold">{contact.displayName}</h2>
                    {contact.title && contact.kind === 'person' && (
                        <p className="text-[11px] text-muted-foreground">{contact.title}</p>
                    )}
                    {contact.organization && contact.kind === 'person' && (
                        <p className="text-[11px] text-muted-foreground">{contact.organization.name}</p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {primaryPhone && (
                        <a href={`tel:${primaryPhone}`}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={`Anrufen: ${primaryPhone}`}>
                            <MaterialIcon name="phone" size={16} />
                        </a>
                    )}
                    {primaryEmail && (
                        <a href={`mailto:${primaryEmail}`}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={`Mailen: ${primaryEmail}`}>
                            <MaterialIcon name="mail" size={16} />
                        </a>
                    )}
                    <a href={externalContactsApi.vcardUrl(contactId)} download
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={t('contacts.external.external_contact_detail.als_vcard_exportieren')}>
                        <MaterialIcon name="contact_page" size={16} />
                    </a>
                    <button onClick={() => setEditing(e => !e)}
                        className={cn('flex size-8 items-center justify-center rounded-md hover:bg-muted',
                            editing ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
                        title={t('contacts.external.external_contact_detail.bearbeiten')}>
                        <MaterialIcon name="edit" size={16} />
                    </button>
                    <button onClick={onDelete}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title={t('contacts.external.external_contact_detail.loeschen')}>
                        <MaterialIcon name="delete" size={16} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex shrink-0 border-b">
                <TabBtn active={tab === 'data'} onClick={() => setTab('data')}>{t('contacts.external.external_contact_detail.stammdaten')}</TabBtn>
                <TabBtn active={tab === 'history'} onClick={() => setTab('history')}>
                    {t('contacts.external.external_contact_detail.verlauf')} {contact.activities.length > 0 && <span className="ml-1 rounded-full bg-muted px-1.5 text-[9px]">{contact.activities.length}</span>}
                </TabBtn>
                <TabBtn active={tab === 'links'} onClick={() => setTab('links')}>{t('contacts.external.external_contact_detail.verknuepfungen')}</TabBtn>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
                {tab === 'data' && (
                    editing
                        ? <EditPane contact={contact} onSaved={() => { setEditing(false); load(); onChange(); }} onCancel={() => setEditing(false)} />
                        : <ReadPane contact={contact} />
                )}
                {tab === 'history' && (
                    <HistoryPane contact={contact} onChange={() => { load(); onChange(); }} />
                )}
                {tab === 'links' && (
                    <LinksPane contact={contact} />
                )}
            </ScrollArea>
        </div>
    );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex-1 px-3 py-2.5 text-xs font-medium transition-colors',
                active ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}

// ─── Read-Only Pane ────────────────────────────────────────────────

function ReadPane({ contact }: { contact: ExternalContactDetail }): JSX.Element {
    const t = useT();
    return (
        <div className="space-y-4 p-4 text-[13px]">
            {contact.emails.length > 0 && (
                <Section icon="mail" label={t('contacts.external.external_contact_detail.e-mail')}>
                    {contact.emails.map((e, i) => (
                        <div key={i} className="flex items-center gap-2">
                            {e.label && <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{e.label}</span>}
                            <a href={`mailto:${e.value}`} className="text-primary hover:underline">{e.value}</a>
                            {e.primary && <span className="rounded bg-primary/10 px-1 text-[9px] text-primary">{t('contacts.external.external_contact_detail.primaer')}</span>}
                        </div>
                    ))}
                </Section>
            )}
            {contact.phones.length > 0 && (
                <Section icon="phone" label={t('contacts.external.external_contact_detail.telefon')}>
                    {contact.phones.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                            {p.label && <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{p.label}</span>}
                            <a href={`tel:${p.value}`} className="text-primary hover:underline">{p.value}</a>
                            {p.primary && <span className="rounded bg-primary/10 px-1 text-[9px] text-primary">{t('contacts.external.external_contact_detail.primaer')}</span>}
                        </div>
                    ))}
                </Section>
            )}
            {contact.addresses.length > 0 && (
                <Section icon="home" label={t('contacts.external.external_contact_detail.adresse')}>
                    {contact.addresses.map((a, i) => (
                        <div key={i}>
                            {a.label && <div className="text-[11px] text-muted-foreground">{a.label}</div>}
                            <div>{a.street}</div>
                            <div>{[a.postalCode, a.city].filter(Boolean).join(' ')}</div>
                            {a.country && a.country !== 'DE' && <div>{a.country}</div>}
                        </div>
                    ))}
                </Section>
            )}
            {contact.websites.length > 0 && (
                <Section icon="link" label={t('contacts.external.external_contact_detail.website')}>
                    {contact.websites.map((w, i) => (
                        <div key={i}>
                            <a href={w.value} target="_blank" rel="noreferrer" className="text-primary hover:underline">{w.value}</a>
                        </div>
                    ))}
                </Section>
            )}
            {contact.birthDate && (
                <Section icon="cake" label={t('contacts.external.external_contact_detail.geburtstag')}>
                    {new Date(contact.birthDate).toLocaleDateString('de-DE')}
                </Section>
            )}
            {contact.notes && (
                <Section icon="sticky_note_2" label={t('contacts.external.external_contact_detail.notizen')}>
                    <p className="whitespace-pre-wrap">{contact.notes}</p>
                </Section>
            )}
            {contact.tags.length > 0 && (
                <Section icon="sell" label={t('contacts.external.external_contact_detail.tags')}>
                    <div className="flex flex-wrap gap-1">
                        {contact.tags.map(_t => (
                            <span
                                key={_t.id}
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{ backgroundColor: (_t.color ?? '#94a3b8') + '20', color: _t.color ?? '#475569' }}
                            >
                                {_t.label}
                            </span>
                        ))}
                    </div>
                </Section>
            )}
            {contact.members && contact.members.length > 0 && (
                <Section icon="groups" label={t('common.members')}>
                    {contact.members.map(m => <div key={m.id}>{m.name}</div>)}
                </Section>
            )}
        </div>
    );
}

function Section({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MaterialIcon name={icon} size={14} className="size-3" />
                {label}
            </div>
            <div className="space-y-1">{children}</div>
        </div>
    );
}

// ─── Edit Pane ────────────────────────────────────────────────

function EditPane({ contact, onSaved, onCancel }: { contact: ExternalContactDetail; onSaved: () => void; onCancel: () => void }): JSX.Element {
    const t = useT();
    const [data, setData] = useState({ ...contact });
    const [saving, setSaving] = useState(false);

    const set = <K extends keyof typeof data>(k: K, v: typeof data[K]) => setData(prev => ({ ...prev, [k]: v }));

    const save = async () => {
        setSaving(true);
        try {
            await externalContactsApi.update(contact.id, {
                kind: data.kind, firstName: data.firstName, lastName: data.lastName,
                fullName: data.fullName, salutation: data.salutation, title: data.title,
                emails: data.emails, phones: data.phones, addresses: data.addresses,
                websites: data.websites, socials: data.socials,
                notes: data.notes, birthDate: data.birthDate,
                visibility: data.visibility, tagIds: data.tags.map(_t => _t.id),
            });
            toast.success('Gespeichert');
            onSaved();
        } catch (e) {
            toast.error('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4 p-4 text-[13px]">
            {data.kind === 'person' && (
                <div className="grid gap-2 md:grid-cols-2">
                    <FieldInline label={t('contacts.external.external_contact_detail.anrede')} value={data.salutation ?? ''} onChange={v => set('salutation', v || null)} />
                    <FieldInline label={t('contacts.external.external_contact_detail.titel')} value={data.title ?? ''} onChange={v => set('title', v || null)} />
                    <FieldInline label={t('contacts.external.external_contact_detail.vorname')} value={data.firstName ?? ''} onChange={v => set('firstName', v || null)} />
                    <FieldInline label={t('contacts.external.external_contact_detail.nachname')} value={data.lastName ?? ''} onChange={v => set('lastName', v || null)} />
                </div>
            )}
            {data.kind === 'organization' && (
                <FieldInline label={t('contacts.external.external_contact_detail.name')} value={data.fullName ?? ''} onChange={v => set('fullName', v || null)} />
            )}

            <MultiValueEditor label={t('contacts.external.external_contact_detail.e-mail')} type="email" items={data.emails} onChange={items => set('emails', items)} />
            <MultiValueEditor label={t('contacts.external.external_contact_detail.telefon')} type="tel" items={data.phones} onChange={items => set('phones', items)} />

            <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('contacts.external.external_contact_detail.notizen')}</div>
                <textarea
                    value={data.notes ?? ''}
                    onChange={e => set('notes', e.target.value || null)}
                    rows={4}
                    className="w-full rounded-md border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
                />
            </div>

            <FieldInline
                label={t('contacts.external.external_contact_detail.geburtstag_optional')}
                value={data.birthDate ? new Date(data.birthDate).toISOString().slice(0, 10) : ''}
                onChange={v => set('birthDate', v || null)}
                type="date"
            />

            <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('contacts.external.external_contact_detail.sichtbarkeit')}</div>
                <select value={data.visibility} onChange={e => set('visibility', e.target.value as 'private' | 'tenant' | 'space')}
                    className="rounded-md border bg-background px-3 py-2 text-[13px]">
                    <option value="tenant">{t('contacts.external.external_contact_detail.alle_im_tenant_sehen_es')}</option>
                    <option value="private">{t('contacts.external.external_contact_detail.nur_ich')}</option>
                </select>
            </div>

            <div className="flex gap-2 border-t pt-3">
                <button onClick={save} disabled={saving}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? 'Speichere…' : t('common.save')}
                </button>
                <button onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
                    {t('contacts.external.external_contact_detail.abbrechen')}
                </button>
            </div>
        </div>
    );
}

function FieldInline({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }): JSX.Element {
    return (
        <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
            <input type={type} value={value} onChange={e => onChange(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary" />
        </label>
    );
}

interface MV { label?: string; value: string; primary?: boolean }
function MultiValueEditor({ label, type, items, onChange }: {
    label: string; type: 'email' | 'tel'; items: MV[]; onChange: (items: MV[]) => void;
}): JSX.Element {
    const t = useT();
    const update = (i: number, patch: Partial<MV>) => {
        onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
    };
    return (
        <div>
            <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                <button type="button" onClick={() => onChange([...items, { label: '', value: '' }])}
                    className="text-[11px] text-primary hover:underline">{t('contacts.external.external_contact_detail.hinzufuegen')}</button>
            </div>
            <div className="space-y-1">
                {items.map((it, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <input
                            type="text"
                            value={it.label ?? ''}
                            onChange={e => update(i, { label: e.target.value })}
                            placeholder={t('contacts.external.external_contact_detail.label')}
                            className="w-24 rounded border bg-background px-2 py-1 text-[12px] outline-none focus:border-primary"
                        />
                        <input
                            type={type}
                            value={it.value}
                            onChange={e => update(i, { value: e.target.value })}
                            className="flex-1 rounded border bg-background px-2 py-1 text-[12px] outline-none focus:border-primary"
                        />
                        <button type="button" onClick={() => update(i, { primary: !it.primary })}
                            className={cn('flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted',
                                it.primary && 'text-primary bg-primary/10')}
                            title={t('common.primary')}>
                            <MaterialIcon name="star" size={14} fill={it.primary ? 1 : 0} />
                        </button>
                        <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                            className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <MaterialIcon name="close" size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── History Pane ────────────────────────────────────────────────

function HistoryPane({ contact, onChange }: { contact: ExternalContactDetail; onChange: () => void }): JSX.Element {
    const t = useT();
    const [kind, setKind] = useState<ContactActivity['kind']>('note');
    const [summary, setSummary] = useState('');
    const [adding, setAdding] = useState(false);

    const submit = async () => {
        if (!summary.trim() && kind === 'note') {
            toast.error('Notiz darf nicht leer sein');
            return;
        }
        setAdding(true);
        try {
            await externalContactsApi.addActivity(contact.id, { kind, summary: summary.trim() || undefined });
            setSummary('');
            onChange();
        } catch {
            toast.error('Speichern fehlgeschlagen');
        } finally {
            setAdding(false);
        }
    };

    const remove = async (activityId: string) => {
        if (!window.confirm(t('common.confirm_delete_entry'))) return;
        await externalContactsApi.deleteActivity(contact.id, activityId);
        onChange();
    };

    return (
        <div className="space-y-3 p-4 text-[13px]">
            {/* Quick-Add */}
            <div className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center gap-1">
                    {(Object.keys(ACTIVITY_ICONS) as ContactActivity['kind'][]).map(k => {
                        const cfg = ACTIVITY_ICONS[k];
                        return (
                            <button
                                key={k}
                                type="button"
                                onClick={() => setKind(k)}
                                className={cn(
                                    'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                                    kind === k ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted',
                                )}
                            >
                                <MaterialIcon name={cfg.icon} size={14} className={cn('size-3.5', kind === k ? 'text-primary' : cfg.color)} />
                                {cfg.label}
                            </button>
                        );
                    })}
                </div>
                <textarea
                    value={summary}
                    onChange={e => setSummary(e.target.value)}
                    placeholder={`${ACTIVITY_ICONS[kind].label} hinzufügen...`}
                    rows={2}
                    className="w-full rounded border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-primary"
                />
                <div className="mt-2 flex justify-end">
                    <button onClick={submit} disabled={adding}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {adding ? '…' : t('common.add')}
                    </button>
                </div>
            </div>

            {/* Timeline */}
            {contact.activities.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12px] italic text-muted-foreground">{t('contacts.external.external_contact_detail.noch_keine_eintraege')}</p>
            ) : (
                <div className="space-y-1">
                    {contact.activities.map(a => {
                        const cfg = ACTIVITY_ICONS[a.kind];
                        return (
                            <div key={a.id} className="group flex items-start gap-2 rounded-md p-2 hover:bg-muted/50">
                                <MaterialIcon name={cfg.icon} size={16} className={cn('mt-0.5 size-3.5 shrink-0', cfg.color)} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                        <span className="font-medium text-foreground">{cfg.label}</span>
                                        <span>{formatActivityTime(a.occurredAt)}</span>
                                    </div>
                                    {a.summary && <p className="mt-0.5 whitespace-pre-wrap text-[12px]">{a.summary}</p>}
                                </div>
                                <button onClick={() => remove(a.id)}
                                    className="opacity-0 group-hover:opacity-100 flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                    <MaterialIcon name="close" size={12} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Links Pane (Phase 2) ────────────────────────────────────────────────

function LinksPane({ contact }: { contact: ExternalContactDetail }): JSX.Element {
    const t = useT();
    const refs = contact.activities.filter(a => a.referenceType && a.referenceId);
    return (
        <div className="space-y-3 p-4 text-[13px]">
            <div>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('contacts.external.external_contact_detail.verknuepfte_eintraege')}
                </h3>
                {refs.length === 0 ? (
                    <p className="text-[12px] italic text-muted-foreground">{t('contacts.external.external_contact_detail.noch_keine_verknuepfungen')}</p>
                ) : (
                    <div className="space-y-1">
                        {refs.map(a => (
                            <div key={a.id} className="rounded border p-2 text-[12px]">
                                <div className="font-medium">{a.referenceType}</div>
                                <div className="text-[11px] text-muted-foreground">{a.referenceId}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <p className="text-[10px] text-muted-foreground">
                {t('contacts.external.external_contact_detail.verknuepfungen_mit_dokumenten_und_aufgab')}
            </p>
        </div>
    );
}
