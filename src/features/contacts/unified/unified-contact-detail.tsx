/**
 * UnifiedContactDetail — gleicher Look fuer Mitglieder + Externe.
 *
 * Mitglieder: Stammdaten read-only (Edit ueber Settings → Mitglieder),
 * Verlauf-Tab leer (mit Hinweis fuer Phase 2), Verknuepfungs-Tab leer.
 * Externe: voller Funktionsumfang inkl. Inline-Edit, Activities, vCard.
 */

import { type JSX, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MaterialIcon } from '@/components/ui/material-icon';
import { UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';
import { externalContactsApi, type ExternalContactDetail, type ContactActivity } from '@/gateways/platform/external-contacts-gateway';
import { toast } from '@/components/ui/toast';
import type { ContactView } from './contact-view';
import { sessionStore } from '@/core/session/session-store';
import { useSyncExternalStore } from 'react';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { useContacts, type Contact } from '../use-contacts';
import { useEnabledModules } from '@/core/permissions';
import { RelationshipGraphPanel, createContactsAdapter } from '@/features/relationship-graph';
import { useT } from "@/lib/i18n/use-t";

interface FamilyRelation {
    id: string;
    userId: string;
    relationType: string;
    isPrimaryContact: boolean;
    canPickUp: boolean;
    receivesReports: boolean;
    receivesEmergency: boolean;
    notes: string | null;
}

const RELATION_LABELS: Record<string, string> = {
    parent: 'Elternteil',
    guardian: 'Sorgeberechtigt',
    emergency_contact: 'Notfallkontakt',
    sibling: 'Geschwister',
    partner: 'Partner',
    other: 'Sonstige',
};

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

export function UnifiedContactDetail({
    contact, onClose, onChange, onDelete, fullscreen, onToggleFullscreen,
}: {
    contact: ContactView;
    onClose: () => void;
    onChange: () => void;
    onDelete?: () => void;
    fullscreen?: boolean;
    onToggleFullscreen?: () => void;
}): JSX.Element {
    const t = useT();
    const [tab, setTab] = useState<'data' | 'history' | 'links' | 'graph'>('data');
    const [externalDetail, setExternalDetail] = useState<ExternalContactDetail | null>(null);
    const [memberActivities, setMemberActivities] = useState<ContactActivity[]>([]);
    const [loading, setLoading] = useState(contact.source !== 'member');
    const [editing, setEditing] = useState(false);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';

    const isExternal = contact.source !== 'member';
    const isMember = contact.source === 'member';
    const navigate = useNavigate();
    // refId eines Mitglieds = echte Matrix-User-ID (@user:domain); contact.id
    // ist die prefixte View-ID ("m:…") und als DM-Ziel ungültig.
    const myUserId = session.matrix?.userId;
    const canDm = isMember && !!contact.refId && contact.refId !== myUserId;

    const enabledModules = useEnabledModules();
    const hasGraphApp = enabledModules.has('relationship-graph');
    const showGraphTab = hasGraphApp && isMember;
    const { contacts: allContactsForGraph } = useContacts();
    const graphAdapter = useMemo(() => createContactsAdapter(allContactsForGraph), [allContactsForGraph]);

    const load = useCallback(async () => {
        if (isExternal) {
            setLoading(true);
            try {
                const res = await externalContactsApi.get(contact.refId);
                setExternalDetail(res.contact);
            } catch (e) {
                toast.error('Kontakt konnte nicht geladen werden');
            } finally {
                setLoading(false);
            }
        }
        if (isMember && contact.directoryId && jwt) {
            // Activities fuer Mitglieder
            try {
                const r = await fetch(`/api/platform/v1/workspace/users/${contact.directoryId}/activities`, {
                    headers: { Authorization: `Bearer ${jwt}` },
                });
                if (r.ok) {
                    const data = await r.json() as { activities: ContactActivity[] };
                    setMemberActivities(data.activities ?? []);
                }
            } catch { /* silent */ }
        }
    }, [contact.refId, contact.directoryId, isExternal, isMember, jwt]);

    useEffect(() => { load(); }, [load]);

    if (isExternal && (loading || !externalDetail)) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Header-Daten und Aktionen
    const display = externalDetail ?? contact;
    const primaryEmail = display.emails.find(e => e.primary)?.value ?? display.emails[0]?.value;
    const primaryPhone = display.phones.find(p => p.primary)?.value ?? display.phones[0]?.value;

    const historyCount = externalDetail?.activities.length ?? memberActivities.length;

    return (
        <div className="flex h-full flex-col">
            {/* 2. Balken (Detail-Seite): Tabs als Icons + Aktionen */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-0.5 border-b px-1.5">
                <button onClick={onClose} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                    title={t('contacts.unified.unified_contact_detail.zurueck')}>
                    <MaterialIcon name="chevron_left" size={20} />
                </button>

                {/* Tabs */}
                <div className="flex flex-1 items-center gap-0.5">
                    <DetailTabIcon active={tab === 'data'} onClick={() => setTab('data')}
                        icon="badge" label={t('contacts.unified.unified_contact_detail.stammdaten')} />
                    <DetailTabIcon active={tab === 'history'} onClick={() => setTab('history')}
                        icon="history" label={t('contacts.unified.unified_contact_detail.verlauf')} badge={historyCount > 0 ? historyCount : undefined} />
                    <DetailTabIcon active={tab === 'links'} onClick={() => setTab('links')}
                        icon="family_restroom" label={t('contacts.unified.unified_contact_detail.verknuepfungen')} />
                    {showGraphTab && (
                        <DetailTabIcon active={tab === 'graph'} onClick={() => setTab('graph')}
                            icon="account_tree" label={t('contacts.unified.unified_contact_detail.beziehungs-graph')} />
                    )}
                </div>

                {/* Aktions-Icons */}
                <div className="flex shrink-0 items-center gap-0.5">
                    {canDm && (
                        <button onClick={() => navigate(`/dm/${encodeURIComponent(contact.refId)}`)}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('contacts.contacts_hub.nachricht')}>
                            <MaterialIcon name="chat" size={18} />
                        </button>
                    )}
                    {primaryPhone && (
                        <a href={`tel:${primaryPhone}`}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={`Anrufen: ${primaryPhone}`}>
                            <MaterialIcon name="phone" size={18} />
                        </a>
                    )}
                    {primaryEmail && (
                        <a href={`mailto:${primaryEmail}`}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={`Mailen: ${primaryEmail}`}>
                            <MaterialIcon name="mail" size={18} />
                        </a>
                    )}
                    {isExternal && (
                        <a href={externalContactsApi.vcardUrl(contact.refId)} download
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('contacts.unified.unified_contact_detail.als_vcard_exportieren')}>
                            <MaterialIcon name="contact_page" size={18} />
                        </a>
                    )}
                    {(isExternal || (isMember && isAdmin)) && (
                        <button onClick={() => setEditing(e => !e)}
                            className={cn('flex size-8 items-center justify-center rounded-md hover:bg-muted',
                                editing ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
                            title={t('contacts.unified.unified_contact_detail.bearbeiten')}>
                            <MaterialIcon name="edit" size={18} />
                        </button>
                    )}
                    {isExternal && onDelete && (
                        <button onClick={onDelete}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title={t('contacts.unified.unified_contact_detail.loeschen')}>
                            <MaterialIcon name="delete" size={18} />
                        </button>
                    )}
                    {onToggleFullscreen && (
                        <button onClick={onToggleFullscreen}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title={fullscreen ? 'Spaltenansicht' : 'Vollbild'}>
                            <MaterialIcon name={fullscreen ? 'close_fullscreen' : 'open_in_full'} size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Profil-Header (fixiert) — Identitaets-Anker, scrollt nicht mit weg */}
            <ProfileHeader contact={contact} />

            {/* 3. Bereich: Tab-Content. Graph-Tab fuellt die Hoehe direkt
                (ECharts braucht determinate Hoehe), andere Tabs scrollen. */}
            {tab === 'graph' ? (
                <div className="min-h-0 flex-1">
                    <RelationshipGraphPanel
                        adapter={graphAdapter}
                        rootId={contact.refId}
                        rootName={contact.displayName}
                    />
                </div>
            ) : (
                <ScrollArea className="flex-1">
                    {tab === 'data' && (
                        <>
                            {isExternal && editing && externalDetail && (
                                <EditPane contact={externalDetail} onSaved={() => { setEditing(false); load(); onChange(); }} onCancel={() => setEditing(false)} />
                            )}
                            {isMember && editing && isAdmin && contact.directoryId && jwt && (
                                <MemberEditPane contact={contact} jwt={jwt}
                                    onSaved={() => { setEditing(false); onChange(); }}
                                    onCancel={() => setEditing(false)} />
                            )}
                            {!editing && <ReadPane contact={display} />}
                            {isMember && isAdmin && contact.directoryId && !editing && (
                                <MemberAdminActions
                                    contact={contact}
                                    jwt={jwt!}
                                    onChanged={() => { load(); onChange(); }}
                                />
                            )}
                            {isMember && isAdmin && contact.directoryId && jwt && !editing && (
                                <CustomFieldsPane directoryId={contact.directoryId} jwt={jwt} />
                            )}
                            {isMember && isAdmin && contact.directoryId && jwt && !editing && (
                                <DsarPane
                                    directoryId={contact.directoryId}
                                    displayName={contact.displayName}
                                    jwt={jwt}
                                    onErased={() => { onClose(); onChange(); }}
                                />
                            )}
                        </>
                    )}
                    {tab === 'history' && (
                        isExternal && externalDetail
                            ? <HistoryPane contact={externalDetail} onChange={() => { load(); onChange(); }} />
                            : isMember && contact.directoryId
                                ? <MemberHistoryPane
                                    contactId={contact.refId}
                                    directoryId={contact.directoryId}
                                    activities={memberActivities}
                                    jwt={jwt!}
                                    onChange={() => { load(); onChange(); }} />
                                : <div className="p-6 text-center text-[12px] italic text-muted-foreground">
                                    {t('contacts.unified.unified_contact_detail.verlauf_erst_sichtbar_wenn_eintraege_vor')}
                                </div>
                    )}
                    {tab === 'links' && (
                        isMember && contact.directoryId && jwt
                            ? <MemberFamilyPane contact={contact} jwt={jwt} />
                            : <LinksPane externalDetail={externalDetail} />
                    )}
                </ScrollArea>
            )}
        </div>
    );
}

function DetailTabIcon({ active, onClick, icon, label, badge }: {
    active: boolean; onClick: () => void; icon: string; label: string; badge?: number;
}): JSX.Element {
    return (
        <button
            onClick={onClick}
            title={label}
            className={cn(
                'relative flex size-8 items-center justify-center rounded-md transition-colors',
                active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
        >
            <MaterialIcon name={icon} size={20} />
            {badge !== undefined && (
                <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {badge > 9 ? '9+' : badge}
                </span>
            )}
        </button>
    );
}

// Kompakter Profil-Header — sitzt oben in jedem Tab-Inhalt, statt einer
// dicken Header-Zeile zwischen Toolbar und Tabs (war alt). So bleibt der
// Detail-Pane konsistent zum Spaces-Side-Panel: Toolbar mit Tabs ganz oben,
// dann Inhalt darunter.
function ProfileHeader({ contact }: { contact: ContactView }): JSX.Element {
    const t = useT();
    return (
        <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b">
            {contact.source === 'member' ? (
                <UserAvatar displayName={contact.displayName} size="lg" />
            ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {contact.source === 'organization'
                        ? <MaterialIcon name="apartment" size={20} />
                        : `${(contact.firstName?.[0] ?? '').toUpperCase()}${(contact.lastName?.[0] ?? '').toUpperCase()}` || '?'}
                </div>
            )}
            <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold">{contact.displayName}</h2>
                {contact.badge && (
                    <p className="text-[11px] text-muted-foreground">{contact.badge}</p>
                )}
                {contact.organization && contact.source === 'person' && (
                    <p className="text-[11px] text-muted-foreground">{contact.organization.name}</p>
                )}
                {contact.source === 'member' && (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <MaterialIcon name="verified_user" size={10} className="size-2.5" />
                        {t('contacts.unified.unified_contact_detail.mitglied')}
                    </span>
                )}
            </div>
        </div>
    );
}

function ReadPane({ contact }: { contact: ContactView | ExternalContactDetail }): JSX.Element {
    const t = useT();
    const c = contact as ContactView;
    return (
        <div className="space-y-4 p-4 text-[13px]">
            {c.emails.length > 0 && (
                <Section icon="mail" label={t('contacts.unified.unified_contact_detail.e-mail')}>
                    {c.emails.map((e, i) => (
                        <div key={i} className="flex items-center gap-2">
                            {e.label && <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{e.label}</span>}
                            <a href={`mailto:${e.value}`} className="text-primary hover:underline">{e.value}</a>
                            {e.primary && c.emails.length > 1 && <span className="rounded bg-primary/10 px-1 text-[9px] text-primary">{t('contacts.unified.unified_contact_detail.primaer')}</span>}
                        </div>
                    ))}
                </Section>
            )}
            {c.phones.length > 0 && (
                <Section icon="phone" label={t('contacts.unified.unified_contact_detail.telefon')}>
                    {c.phones.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                            {p.label && <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{p.label}</span>}
                            <a href={`tel:${p.value}`} className="text-primary hover:underline">{p.value}</a>
                            {p.primary && c.phones.length > 1 && <span className="rounded bg-primary/10 px-1 text-[9px] text-primary">{t('contacts.unified.unified_contact_detail.primaer')}</span>}
                        </div>
                    ))}
                </Section>
            )}
            {c.addresses.length > 0 && (
                <Section icon="home" label={t('contacts.unified.unified_contact_detail.adresse')}>
                    {c.addresses.map((a, i) => (
                        <div key={i}>
                            {a.label && <div className="text-[11px] text-muted-foreground">{a.label}</div>}
                            {a.street && <div>{a.street}</div>}
                            <div>{[a.postalCode, a.city].filter(Boolean).join(' ')}</div>
                            {a.country && a.country !== 'DE' && <div>{a.country}</div>}
                        </div>
                    ))}
                </Section>
            )}
            {c.websites.length > 0 && (
                <Section icon="link" label={t('contacts.unified.unified_contact_detail.website')}>
                    {c.websites.map((w, i) => (
                        <div key={i}>
                            <a href={w.value} target="_blank" rel="noreferrer" className="text-primary hover:underline">{w.value}</a>
                        </div>
                    ))}
                </Section>
            )}
            {c.birthDate && (
                <Section icon="cake" label={t('contacts.unified.unified_contact_detail.geburtstag')}>
                    {new Date(c.birthDate).toLocaleDateString('de-DE')}
                </Section>
            )}
            {c.notes && (
                <Section icon="sticky_note_2" label={t('contacts.unified.unified_contact_detail.notizen')}>
                    <p className="whitespace-pre-wrap">{c.notes}</p>
                </Section>
            )}
            {c.tags.length > 0 && (
                <Section icon="sell" label={t('contacts.unified.unified_contact_detail.tags')}>
                    <div className="flex flex-wrap gap-1">
                        {c.tags.map(_t => (
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
            {c.members && c.members.length > 0 && (
                <Section icon="groups" label={t('common.members')}>
                    {c.members.map(m => <div key={m.id}>{m.name}</div>)}
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

// ─── Edit Pane (extern only) ─────────────────────────────

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
                    <FieldInline label={t('contacts.unified.unified_contact_detail.anrede')} value={data.salutation ?? ''} onChange={v => set('salutation', v || null)} />
                    <FieldInline label={t('contacts.unified.unified_contact_detail.titel')} value={data.title ?? ''} onChange={v => set('title', v || null)} />
                    <FieldInline label={t('contacts.unified.unified_contact_detail.vorname')} value={data.firstName ?? ''} onChange={v => set('firstName', v || null)} />
                    <FieldInline label={t('contacts.unified.unified_contact_detail.nachname')} value={data.lastName ?? ''} onChange={v => set('lastName', v || null)} />
                </div>
            )}
            {data.kind === 'organization' && (
                <FieldInline label={t('contacts.unified.unified_contact_detail.name')} value={data.fullName ?? ''} onChange={v => set('fullName', v || null)} />
            )}

            <MultiValueEditor label={t('contacts.unified.unified_contact_detail.e-mail')} type="email" items={data.emails as never} onChange={items => set('emails', items as never)} />
            <MultiValueEditor label={t('contacts.unified.unified_contact_detail.telefon')} type="tel" items={data.phones as never} onChange={items => set('phones', items as never)} />

            <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('contacts.unified.unified_contact_detail.notizen')}</div>
                <textarea
                    value={data.notes ?? ''}
                    onChange={e => set('notes', e.target.value || null)}
                    rows={4}
                    className="w-full rounded-md border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
                />
            </div>

            <FieldInline
                label={t('contacts.unified.unified_contact_detail.geburtstag_optional')}
                value={data.birthDate ? new Date(data.birthDate).toISOString().slice(0, 10) : ''}
                onChange={v => set('birthDate', v || null)}
                type="date"
            />

            <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('contacts.unified.unified_contact_detail.sichtbarkeit')}</div>
                <select value={data.visibility} onChange={e => set('visibility', e.target.value as 'private' | 'tenant' | 'space')}
                    className="rounded-md border bg-background px-3 py-2 text-[13px]">
                    <option value="tenant">{t('contacts.unified.unified_contact_detail.alle_im_tenant_sehen_es')}</option>
                    <option value="private">{t('contacts.unified.unified_contact_detail.nur_ich')}</option>
                </select>
            </div>

            <div className="flex gap-2 border-t pt-3">
                <button onClick={save} disabled={saving}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? 'Speichere…' : t('common.save')}
                </button>
                <button onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
                    {t('contacts.unified.unified_contact_detail.abbrechen')}
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
                    className="text-[11px] text-primary hover:underline">{t('contacts.unified.unified_contact_detail.hinzufuegen')}</button>
            </div>
            <div className="space-y-1">
                {items.map((it, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <input
                            type="text"
                            value={it.label ?? ''}
                            onChange={e => update(i, { label: e.target.value })}
                            placeholder={t('contacts.unified.unified_contact_detail.label')}
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

// ─── History (extern only) ─────────────────────────────

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

            {contact.activities.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12px] italic text-muted-foreground">{t('contacts.unified.unified_contact_detail.noch_keine_eintraege')}</p>
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

function LinksPane({ externalDetail }: { externalDetail: ExternalContactDetail | null }): JSX.Element {
    const t = useT();
    const refs = externalDetail?.activities.filter(a => a.referenceType && a.referenceId) ?? [];
    return (
        <div className="space-y-3 p-4 text-[13px]">
            <div>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('contacts.unified.unified_contact_detail.verknuepfte_eintraege')}
                </h3>
                {refs.length === 0 ? (
                    <p className="text-[12px] italic text-muted-foreground">
                        {t('contacts.unified.unified_contact_detail.verknuepfungen_mit_dokumenten_und_aufgab')}
                    </p>
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
        </div>
    );
}

// ─── Member Admin Actions ──────────────────────────────────────────

function MemberAdminActions({ contact, jwt, onChanged }: { contact: ContactView; jwt: string; onChanged: () => void }): JSX.Element {
    const t = useT();
    const [busy, setBusy] = useState(false);
    const [tempPwModal, setTempPwModal] = useState<string | null>(null);

    const call = async (method: string, path: string, body?: unknown): Promise<Response> => {
        return fetch(`/api/platform/v1/workspace/users/${contact.directoryId}${path}`, {
            method,
            headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
    };

    const extend = async (months: number) => {
        setBusy(true);
        try {
            const r = await call('POST', '/extend', { months });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            toast.success(`Verlängert bis ${new Date(data.expiresAt).toLocaleDateString('de-DE')}`);
            onChanged();
        } catch (e) {
            toast.error(t('common.extend_failed'));
        } finally { setBusy(false); }
    };

    const extendUntilJuly = async () => {
        const now = new Date();
        const target = new Date(now.getFullYear() + (now.getMonth() >= 7 ? 1 : 0), 6, 31);
        setBusy(true);
        try {
            const r = await call('POST', '/extend', { until: target.toISOString() });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            toast.success(`Verlängert bis ${target.toLocaleDateString('de-DE')}`);
            onChanged();
        } catch { toast.error(t('common.extend_failed')); }
        finally { setBusy(false); }
    };

    const togglePermanent = async () => {
        const target = !contact.isPermanent;
        if (target && !confirm('Konto auf unbefristet setzen? Ablaufdatum wird entfernt.')) return;
        if (!target && !confirm('Befristung wieder einschalten? Bitte danach ein neues Ablaufdatum verlaengern.')) return;
        setBusy(true);
        try {
            const r = await call('PATCH', '', target ? { isPermanent: true, expiresAt: null } : { isPermanent: false });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            toast.success(target ? 'Auf unbefristet gesetzt' : 'Befristung reaktiviert');
            onChanged();
        } catch { toast.error('Aktualisierung fehlgeschlagen'); }
        finally { setBusy(false); }
    };

    const toggleActive = async () => {
        if (!confirm(contact.active ? 'Konto wirklich deaktivieren?' : 'Konto reaktivieren?')) return;
        setBusy(true);
        try {
            const r = await call('PATCH', '', { active: !contact.active });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            toast.success(contact.active ? 'Deaktiviert' : 'Reaktiviert');
            onChanged();
        } catch { toast.error('Aktualisierung fehlgeschlagen'); }
        finally { setBusy(false); }
    };

    const toggleAdmin = async () => {
        if (!confirm(contact.admin ? 'Admin-Status entziehen?' : 'Zum Admin ernennen?')) return;
        setBusy(true);
        try {
            const r = await call('PATCH', '', { admin: !contact.admin });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            toast.success(contact.admin ? 'Admin-Status entzogen' : 'Zum Admin ernannt');
            onChanged();
        } catch { toast.error('Aktualisierung fehlgeschlagen'); }
        finally { setBusy(false); }
    };

    const resetPassword = async () => {
        if (!confirm(t('common.confirm_password_reset'))) return;
        setBusy(true);
        try {
            const r = await call('POST', '/reset-password');
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            setTempPwModal(data.tempPassword);
            onChanged();
        } catch { toast.error('Passwort-Reset fehlgeschlagen'); }
        finally { setBusy(false); }
    };

    return (
        <>
            <div className="border-t bg-muted/20 p-4">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <MaterialIcon name="admin_panel_settings" size={14} className="size-3" />
                    {t('contacts.unified.unified_contact_detail.admin-aktionen')}
                </div>

                {/* Ablauf-Verlängerung */}
                <div className="mb-2">
                    <div className="mb-1 text-[11px] text-muted-foreground">
                        {contact.isPermanent ? 'Unbefristet' :
                            contact.expiresAt ? `Läuft ab am ${new Date(contact.expiresAt).toLocaleDateString('de-DE')}` :
                                'Kein Ablaufdatum'}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <button onClick={() => extend(3)} disabled={busy || contact.isPermanent} className="rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">{t('contacts.unified.unified_contact_detail.3_mon')}</button>
                        <button onClick={() => extend(6)} disabled={busy || contact.isPermanent} className="rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">{t('contacts.unified.unified_contact_detail.6_mon')}</button>
                        <button onClick={() => extend(12)} disabled={busy || contact.isPermanent} className="rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">{t('contacts.unified.unified_contact_detail.1_jahr')}</button>
                        <button onClick={extendUntilJuly} disabled={busy || contact.isPermanent} className="rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50" title={t('contacts.unified.unified_contact_detail.schuljahres-ende')}>→ 31.07.</button>
                        <button onClick={togglePermanent} disabled={busy}
                            className={cn('rounded-md border px-2 py-1 text-[11px]',
                                contact.isPermanent
                                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100')}
                            title={contact.isPermanent ? 'Befristung wieder einschalten' : 'Konto unbefristet machen (kein Ablaufdatum)'}>
                            {contact.isPermanent ? 'Befristen' : 'Unbefristet'}
                        </button>
                    </div>
                </div>

                {/* Konto-Status */}
                <div className="flex flex-wrap gap-1">
                    <button onClick={toggleActive} disabled={busy}
                        className={cn('rounded-md border px-2 py-1 text-[11px]',
                            contact.active === false ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'border-red-200 text-red-700 hover:bg-red-50')}>
                        {contact.active === false ? 'Reaktivieren' : 'Deaktivieren'}
                    </button>
                    <button onClick={toggleAdmin} disabled={busy}
                        className={cn('rounded-md border px-2 py-1 text-[11px]',
                            contact.admin ? 'border-amber-300 bg-amber-50 text-amber-700' : 'bg-background hover:bg-muted')}>
                        {contact.admin ? 'Admin entziehen' : 'Zum Admin'}
                    </button>
                    <button onClick={resetPassword} disabled={busy}
                        className="rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted">
                        {t('contacts.unified.unified_contact_detail.passwort_zuruecksetzen')}
                    </button>
                </div>
            </div>

            {/* Temp-Password-Modal */}
            {tempPwModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTempPwModal(null)}>
                    <div className="w-full max-w-md rounded-lg bg-background p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                            <MaterialIcon name="key" size={16} className="text-primary" />
                            {t('contacts.unified.unified_contact_detail.temporaeres_passwort')}
                        </h3>
                        <p className="mb-3 text-xs text-muted-foreground">
                            {t('contacts.unified.unified_contact_detail.uebermittle_dieses_passwort_dem_nutzer_b')}
                        </p>
                        <div className="mb-3 flex items-center gap-2 rounded border bg-muted p-3">
                            <code className="flex-1 select-all font-mono text-base">{tempPwModal}</code>
                            <button onClick={() => { navigator.clipboard.writeText(tempPwModal); toast.success('Kopiert'); }}
                                className="rounded border bg-background px-2 py-1 text-xs hover:bg-muted">
                                {t('contacts.unified.unified_contact_detail.kopieren')}
                            </button>
                        </div>
                        <button onClick={() => setTempPwModal(null)}
                            className="w-full rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground hover:bg-primary/90">
                            {t('contacts.unified.unified_contact_detail.verstanden_schliessen')}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Member History Pane ─────────────────────────────────────────

function MemberHistoryPane({ contactId, directoryId, activities, jwt, onChange }: {
    contactId: string; directoryId: string; activities: ContactActivity[]; jwt: string; onChange: () => void;
}): JSX.Element {
    const t = useT();
    void contactId;
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
            const r = await fetch(`/api/platform/v1/workspace/users/${directoryId}/activities`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, summary: summary.trim() || undefined }),
            });
            if (!r.ok) throw new Error();
            setSummary('');
            onChange();
        } catch {
            toast.error('Speichern fehlgeschlagen');
        } finally {
            setAdding(false);
        }
    };

    const remove = async (activityId: string) => {
        if (!confirm(t('common.confirm_delete_entry'))) return;
        await fetch(`/api/platform/v1/workspace/users/${directoryId}/activities/${activityId}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${jwt}` },
        });
        onChange();
    };

    const ICONS: Record<string, { icon: string; color: string; label: string }> = {
        ...ACTIVITY_ICONS,
        account: { icon: 'admin_panel_settings', color: 'text-purple-500', label: 'Konto-Aktion' },
    };

    return (
        <div className="space-y-3 p-4 text-[13px]">
            <div className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center gap-1">
                    {(['call', 'email', 'meeting', 'note', 'task'] as ContactActivity['kind'][]).map(k => {
                        const cfg = ICONS[k];
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
                    placeholder={`${ICONS[kind].label} hinzufügen...`}
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

            {activities.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12px] italic text-muted-foreground">{t('contacts.unified.unified_contact_detail.noch_keine_eintraege')}</p>
            ) : (
                <div className="space-y-1">
                    {activities.map(a => {
                        const cfg = ICONS[a.kind] ?? { icon: 'circle', color: 'text-muted-foreground', label: a.kind };
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


// ─── Member Edit Pane ────────────────────────────────────────────────
// Stammdaten-Edit fuer Mitglieder (Admin-only). Speichert via PATCH /workspace/users/:id.

function MemberEditPane({ contact, jwt, onSaved, onCancel }: {
    contact: ContactView; jwt: string; onSaved: () => void; onCancel: () => void;
}): JSX.Element {
    const t = useT();
    const initialAddr = contact.addresses[0] ?? {};
    const [data, setData] = useState({
        fullName: contact.displayName,
        email: contact.emails[0]?.value ?? '',
        phone: contact.phones[0]?.value ?? '',
        street: initialAddr.street ?? '',
        postalCode: initialAddr.postalCode ?? '',
        city: initialAddr.city ?? '',
        country: initialAddr.country ?? '',
        birthDate: contact.birthDate ? new Date(contact.birthDate).toISOString().slice(0, 10) : '',
    });
    const [saving, setSaving] = useState(false);

    const set = <K extends keyof typeof data>(k: K, v: string) => setData(prev => ({ ...prev, [k]: v }));

    const save = async () => {
        if (!contact.directoryId) return;
        setSaving(true);
        try {
            const r = await fetch(`/api/platform/v1/workspace/users/${contact.directoryId}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: data.fullName.trim() || null,
                    email: data.email.trim() || null,
                    phone: data.phone.trim() || null,
                    street: data.street.trim() || null,
                    postalCode: data.postalCode.trim() || null,
                    city: data.city.trim() || null,
                    country: data.country.trim() || null,
                    birthDate: data.birthDate || null,
                }),
            });
            if (!r.ok) throw new Error(await r.text());
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
            <FieldInline label={t('contacts.unified.unified_contact_detail.voller_name')} value={data.fullName} onChange={v => set('fullName', v)} />
            <FieldInline label={t('contacts.unified.unified_contact_detail.e-mail')} value={data.email} onChange={v => set('email', v)} type="email" />
            <FieldInline label={t('contacts.unified.unified_contact_detail.telefon')} value={data.phone} onChange={v => set('phone', v)} type="tel" />
            <div className="grid gap-2 md:grid-cols-2">
                <FieldInline label={t('contacts.unified.unified_contact_detail.strasse_nr')} value={data.street} onChange={v => set('street', v)} />
                <FieldInline label="PLZ" value={data.postalCode} onChange={v => set('postalCode', v)} />
                <FieldInline label={t('contacts.unified.unified_contact_detail.ort')} value={data.city} onChange={v => set('city', v)} />
                <FieldInline label={t('contacts.unified.unified_contact_detail.land')} value={data.country} onChange={v => set('country', v)} />
            </div>
            <FieldInline label={t('contacts.unified.unified_contact_detail.geburtstag')} value={data.birthDate} onChange={v => set('birthDate', v)} type="date" />

            <div className="flex gap-2 border-t pt-3">
                <button onClick={save} disabled={saving}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? 'Speichere…' : t('common.save')}
                </button>
                <button onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
                    {t('contacts.unified.unified_contact_detail.abbrechen')}
                </button>
            </div>
        </div>
    );
}

// ─── Member Family Pane ─────────────────────────────────────────────
// Familien-Verknuepfungen mit Graph-Button.

function MemberFamilyPane({ contact, jwt }: { contact: ContactView; jwt: string }): JSX.Element {
    const t = useT();
    const gw = useMemo(() => createProjectGateway(), []);
    const { contacts: allContacts } = useContacts();
    const [family, setFamily] = useState<{ contacts: FamilyRelation[]; responsibleFor: FamilyRelation[] }>({ contacts: [], responsibleFor: [] });
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState<'contact' | 'child' | null>(null);
    const [view, setView] = useState<'list' | 'graph'>(() => {
        if (typeof window === 'undefined') return 'list';
        return window.localStorage.getItem('prilog:contacts:familyView') === 'graph' ? 'graph' : 'list';
    });
    const setViewPersisted = (v: 'list' | 'graph') => {
        setView(v);
        try { window.localStorage.setItem('prilog:contacts:familyView', v); } catch { /* ignore */ }
    };

    const me = allContacts.find(c => c.id === contact.refId);
    const isChildType = me?.audience === 'minor';

    const familyGraphAdapter = useMemo(
        () => createContactsAdapter(allContacts),
        [allContacts],
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await gw.getUserFamily(jwt, contact.refId);
            setFamily(res);
        } finally { setLoading(false); }
    }, [gw, jwt, contact.refId]);

    useEffect(() => { load(); }, [load]);

    const remove = async (relId: string) => {
        if (!confirm('Beziehung entfernen?')) return;
        await gw.deleteFamilyRelation(jwt, relId);
        load();
    };

    return (
        <div className="flex h-full flex-col p-4 text-[13px]">
            <div className="mb-3 flex shrink-0 items-center justify-between">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('contacts.unified.unified_contact_detail.familienverhaeltnisse')}</h3>
                <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
                    <button
                        type="button"
                        onClick={() => setViewPersisted('list')}
                        className={cn(
                            'flex size-6 items-center justify-center rounded transition-colors',
                            view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                        )}
                        title={t('contacts.unified.unified_contact_detail.listen-ansicht')}
                        aria-pressed={view === 'list'}>
                        <MaterialIcon name="view_list" size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewPersisted('graph')}
                        className={cn(
                            'flex size-6 items-center justify-center rounded transition-colors',
                            view === 'graph' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                        )}
                        title={t('contacts.unified.unified_contact_detail.graph-ansicht')}
                        aria-pressed={view === 'graph'}>
                        <MaterialIcon name="hub" size={14} />
                    </button>
                </div>
            </div>

            {view === 'graph' ? (
                <div className="min-h-[400px] flex-1">
                    {/* Kompakter Familien-Graph: ohne Spaces, Hop 2 fuer Geschwister+Enkel,
                        keine Tasks/Files. Pivot ist erlaubt — Klick auf Person aendert
                        den Mittelpunkt der Familien-Sicht. */}
                    <RelationshipGraphPanel
                        adapter={familyGraphAdapter}
                        rootId={contact.refId}
                        rootName={contact.displayName}
                        options={{ showFamily: true, showSpaces: false, hopLimit: 2 }}
                    />
                </div>
            ) : loading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
                <div className="space-y-3">
                    <FamilySection
                        label={isChildType ? 'Kind von' : 'Familie / Kontakte'}
                        icon="groups"
                        relations={family.contacts}
                        contacts={allContacts}
                        onAdd={() => setShowAdd('contact')}
                        onRemove={remove}
                    />
                    {!isChildType && (
                        <FamilySection
                            label={t('common.responsible_for')}
                            icon="child_care"
                            relations={family.responsibleFor}
                            contacts={allContacts}
                            onAdd={() => setShowAdd('child')}
                            onRemove={remove}
                        />
                    )}
                </div>
            )}

            {showAdd && (
                <AddFamilyDialogInline
                    mode={showAdd}
                    personUserId={contact.refId}
                    contacts={allContacts}
                    jwt={jwt}
                    onClose={() => setShowAdd(null)}
                    onSaved={() => { setShowAdd(null); load(); }}
                />
            )}
        </div>
    );
}

function FamilySection({ label, icon, relations, contacts, onAdd, onRemove }: {
    label: string; icon: string; relations: FamilyRelation[]; contacts: Contact[];
    onAdd: () => void; onRemove: (id: string) => void;
}): JSX.Element {
    const t = useT();
    return (
        <div className="space-y-1.5">
            <div className="flex items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MaterialIcon name={icon} size={12} className="mr-1 inline align-middle" />
                {label}
                <button onClick={onAdd} className="ml-auto rounded p-0.5 hover:bg-muted">
                    <MaterialIcon name="add" size={14} />
                </button>
            </div>
            {relations.length === 0 ? (
                <p className="text-[11px] italic text-muted-foreground">{t('contacts.unified.unified_contact_detail.keine_eintraege')}</p>
            ) : (
                <div className="space-y-1">
                    {relations.map(rel => {
                        const c = contacts.find(x => x.id === rel.userId);
                        return (
                            <div key={rel.id} className="group flex items-center gap-2 rounded-md p-1.5 hover:bg-muted/50">
                                <UserAvatar displayName={c?.displayName ?? rel.userId} size="sm" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[12px] font-medium">{c?.displayName ?? rel.userId}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {RELATION_LABELS[rel.relationType] ?? rel.relationType}
                                        {rel.isPrimaryContact && ' · Haupt'}
                                        {rel.canPickUp && ' · Abholberechtigt'}
                                        {rel.receivesReports && ' · Zeugnisse'}
                                    </p>
                                </div>
                                <button onClick={() => onRemove(rel.id)}
                                    className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
                                    <MaterialIcon name="delete" size={14} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Add Family Dialog (inline, compact) ─────────────────────────

function AddFamilyDialogInline({ mode, personUserId, contacts, jwt, onClose, onSaved }: {
    mode: 'contact' | 'child'; personUserId: string; contacts: Contact[]; jwt: string;
    onClose: () => void; onSaved: () => void;
}): JSX.Element {
    const t = useT();
    const gw = useMemo(() => createProjectGateway(), []);
    const me = contacts.find(c => c.id === personUserId);
    const meIsChild = me?.audience === 'minor';
    const meLastName = (me?.displayName ?? '').trim().split(/\s+/).pop()?.toLowerCase() ?? '';

    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [relationType, setRelationType] = useState<string>('parent');
    const [isPrimary, setIsPrimary] = useState(false);
    const [canPickUp, setCanPickUp] = useState(false);
    const [reports, setReports] = useState(false);
    const [saving, setSaving] = useState(false);

    const filtered = useMemo(() => {
        let list = contacts.filter(c => c.id !== personUserId);
        if (mode === 'contact' && meIsChild) list = list.filter(c => c.audience !== 'minor');
        if (mode === 'child') list = list.filter(c => c.audience === 'minor');
        const q = search.toLowerCase().trim();
        if (q) list = list.filter(c => c.displayName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q));
        list.sort((a, b) => {
            const aLast = a.displayName.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
            const bLast = b.displayName.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
            const aMatch = meLastName && aLast === meLastName ? 0 : 1;
            const bMatch = meLastName && bLast === meLastName ? 0 : 1;
            if (aMatch !== bMatch) return aMatch - bMatch;
            return a.displayName.localeCompare(b.displayName, 'de');
        });
        return list.slice(0, 30);
    }, [contacts, search, personUserId, meIsChild, meLastName, mode]);

    const save = async () => {
        if (!selectedId) return;
        setSaving(true);
        try {
            const body = mode === 'contact'
                ? { personUserId, contactUserId: selectedId, relationType, isPrimaryContact: isPrimary, canPickUp, receivesReports: reports }
                : { personUserId: selectedId, contactUserId: personUserId, relationType, isPrimaryContact: isPrimary, canPickUp, receivesReports: reports };
            await gw.createFamilyRelation(jwt, body);
            onSaved();
        } catch (e) {
            toast.error('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-lg rounded-xl bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 border-b px-4 py-2.5">
                    <MaterialIcon name={mode === 'contact' ? 'groups' : 'child_care'} size={18} className="text-primary" />
                    <h3 className="text-sm font-semibold">{mode === 'contact' ? 'Kontakt / Familienmitglied hinzufuegen' : 'Kind hinzufuegen'}</h3>
                    <div className="flex-1" />
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={18} />
                    </button>
                </div>

                <div className="space-y-3 p-4">
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder={t('contacts.unified.unified_contact_detail.person_suchen')}
                        className="h-8 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
                    <div className="max-h-48 overflow-y-auto rounded border">
                        {filtered.map(c => (
                            <button key={c.id} onClick={() => setSelectedId(c.id)}
                                className={cn('flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] hover:bg-muted/50',
                                    selectedId === c.id && 'bg-primary/10')}>
                                <UserAvatar displayName={c.displayName} size="sm" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">{c.displayName}</p>
                                    <p className="truncate text-[10px] text-muted-foreground">{c.userType ?? '@' + c.username}</p>
                                </div>
                            </button>
                        ))}
                        {filtered.length === 0 && <p className="p-3 text-center text-[11px] text-muted-foreground">{t('contacts.unified.unified_contact_detail.keine_treffer')}</p>}
                    </div>

                    <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('contacts.unified.unified_contact_detail.beziehung')}</p>
                        <select value={relationType} onChange={e => setRelationType(e.target.value)}
                            className="h-8 w-full rounded-md border bg-background px-2 text-[13px]">
                            {Object.entries(RELATION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </div>

                    <div className="space-y-1.5 text-[12px]">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} />
                            {t('contacts.unified.unified_contact_detail.hauptkontakt')}
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={canPickUp} onChange={e => setCanPickUp(e.target.checked)} />
                            {t('contacts.unified.unified_contact_detail.abholberechtigt')}
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={reports} onChange={e => setReports(e.target.checked)} />
                            {t('contacts.unified.unified_contact_detail.empfaengt_zeugnisse_elternbriefe')}
                        </label>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t px-4 py-3">
                    <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">{t('common.cancel')}</button>
                    <button onClick={save} disabled={!selectedId || saving}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                        {saving ? 'Speichere…' : t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── CRM-Foundation B.5b: Custom-Felder-Editor pro Person ───────────────────

function CustomFieldsPane({ directoryId, jwt }: { directoryId: string; jwt: string }): JSX.Element | null {
    const t = useT();
    const [fields, setFields] = useState<import('@/gateways/platform/field-definitions-gateway').FieldDef[]>([]);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [crmV2, setCrmV2] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        let alive = true;
        import('@/gateways/platform/field-definitions-gateway')
            .then(({ fieldDefinitionsGateway }) => fieldDefinitionsGateway.getPersonFields(jwt, directoryId))
            .then(r => { if (!alive) return; setCrmV2(r.crmV2); setFields(r.fields); setValues(r.customFields ?? {}); })
            .catch(e => { if (alive) setErr(e instanceof Error ? e.message : String(e)); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [directoryId, jwt]);

    if (loading || crmV2 === false) return null;
    if (fields.length === 0) return null;

    const set = (k: string, v: unknown) => { setValues(p => ({ ...p, [k]: v })); setDirty(true); };

    const save = async () => {
        setSaving(true); setErr(null);
        try {
            const { fieldDefinitionsGateway } = await import('@/gateways/platform/field-definitions-gateway');
            await fieldDefinitionsGateway.setPersonFields(jwt, directoryId, values);
            setDirty(false);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally { setSaving(false); }
    };

    return (
        <div className="mt-4 border-t border-border p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('settings.custom_fields.title')}
            </div>
            {err && <div className="mb-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive">{err}</div>}
            <div className="space-y-2.5">
                {fields.map(f => {
                    const label = f.label.de ?? f.key;
                    const v = values[f.key];
                    return (
                        <div key={f.id} className="flex items-center gap-2">
                            <label className="w-40 shrink-0 text-[12px] text-muted-foreground">
                                {label}{f.required ? ' *' : ''}
                            </label>
                            {f.type === 'BOOLEAN' ? (
                                <input type="checkbox" checked={v === true} onChange={e => set(f.key, e.target.checked)} />
                            ) : f.type === 'SELECT' ? (
                                <select value={(v as string) ?? ''} onChange={e => set(f.key, e.target.value || null)}
                                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-[12px]">
                                    <option value="">—</option>
                                    {(f.options.choices ?? []).map(c => (
                                        <option key={c.value} value={c.value}>{c.label?.de ?? c.value}</option>
                                    ))}
                                </select>
                            ) : f.type === 'LONGTEXT' ? (
                                <textarea value={(v as string) ?? ''} rows={2} onChange={e => set(f.key, e.target.value)}
                                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-[12px] resize-none" />
                            ) : f.type === 'DATE' ? (
                                <input type="date" value={(v as string)?.slice(0, 10) ?? ''} onChange={e => set(f.key, e.target.value || null)}
                                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-[12px]" />
                            ) : f.type === 'NUMBER' || f.type === 'CURRENCY' ? (
                                <input type="number" value={(v as number) ?? ''} onChange={e => set(f.key, e.target.value === '' ? null : Number(e.target.value))}
                                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-[12px]" />
                            ) : (
                                <input type="text" value={(v as string) ?? ''} onChange={e => set(f.key, e.target.value)}
                                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-[12px]" />
                            )}
                        </div>
                    );
                })}
            </div>
            {dirty && (
                <button onClick={save} disabled={saving}
                    className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? t('common.saving') : t('common.save')}
                </button>
            )}
        </div>
    );
}

// ─── Datenschutz / DSAR (Auskunft Art.15/20 + Löschung Art.17) ──────────────
// Macht das DSAR-Backend (export/erase) für Workspace-Admins bedienbar.
// SPoC + Identitätsprüfung externer Antragsteller bleiben organisatorisch.

function DsarPane({ directoryId, displayName, jwt, onErased }: {
    directoryId: string; displayName: string; jwt: string; onErased: () => void;
}): JSX.Element {
    const [busy, setBusy] = useState(false);
    const [restricted, setRestricted] = useState<boolean | null>(null);

    useEffect(() => {
        let alive = true;
        fetch(`/api/platform/v1/workspace/users/${directoryId}/restriction`, {
            headers: { Authorization: `Bearer ${jwt}` },
        })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (alive && d) setRestricted(d.restricted === true); })
            .catch(e => console.error('[dsar] restriction load failed:', e));
        return () => { alive = false; };
    }, [directoryId, jwt]);

    const toggleRestriction = async () => {
        const next = !(restricted ?? false);
        let reason: string | null = null;
        if (next) {
            reason = window.prompt(`Verarbeitung für "${displayName}" einschränken (Art. 18 DSGVO).\nGrund (optional):`, '');
            if (reason === null) return;
        }
        setBusy(true);
        try {
            const r = await fetch(`/api/platform/v1/workspace/users/${directoryId}/restriction`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ restricted: next, reason }),
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            setRestricted(d.restricted === true);
            toast.success(next ? 'Verarbeitung eingeschränkt (Art. 18)' : 'Einschränkung aufgehoben');
        } catch (e) {
            toast.error('Fehlgeschlagen: ' + (e instanceof Error ? e.message : ''));
        } finally { setBusy(false); }
    };

    const exportData = async () => {
        setBusy(true);
        try {
            const r = await fetch(`/api/platform/v1/workspace/users/${directoryId}/export`, {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dsar-${directoryId}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Datenexport erstellt');
        } catch (e) {
            toast.error('Export fehlgeschlagen: ' + (e instanceof Error ? e.message : ''));
        } finally { setBusy(false); }
    };

    const erase = async () => {
        const typed = window.prompt(
            `Person "${displayName}" UNWIDERRUFLICH löschen (Art. 17 DSGVO)?\n` +
            `Es werden alle personenbezogenen Daten gelöscht.\n\n` +
            `Zum Bestätigen "ERASE" eingeben:`,
        );
        if (typed !== 'ERASE') {
            if (typed !== null) toast.error('Abgebrochen — "ERASE" nicht exakt eingegeben');
            return;
        }
        setBusy(true);
        try {
            const r = await fetch(`/api/platform/v1/workspace/users/${directoryId}/erase`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: 'ERASE' }),
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            toast.success('Person gelöscht (Art. 17)');
            onErased();
        } catch (e) {
            toast.error('Löschung fehlgeschlagen: ' + (e instanceof Error ? e.message : ''));
        } finally { setBusy(false); }
    };

    return (
        <div className="mt-4 border-t border-border p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Datenschutz (DSGVO)
            </div>
            <div className="flex flex-wrap gap-2">
                <button onClick={exportData} disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] hover:bg-muted disabled:opacity-50">
                    <MaterialIcon name="download" size={14} /> Daten exportieren (Art. 15/20)
                </button>
                <button onClick={toggleRestriction} disabled={busy || restricted === null}
                    className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] disabled:opacity-50',
                        restricted ? 'border-amber-500/50 bg-amber-500/10 text-amber-600' : 'border-border hover:bg-muted')}>
                    <MaterialIcon name={restricted ? 'lock' : 'lock_open'} size={14} />
                    {restricted ? 'Einschränkung aufheben' : 'Verarbeitung einschränken (Art. 18)'}
                </button>
                <button onClick={erase} disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-[12px] text-destructive hover:bg-destructive/10 disabled:opacity-50">
                    <MaterialIcon name="delete_forever" size={14} /> Person löschen (Art. 17)
                </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
                Identität des Antragstellers vorher prüfen. Löschung ist endgültig.
            </p>
        </div>
    );
}
