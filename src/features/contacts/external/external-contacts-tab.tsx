/**
 * ExternalContactsTab — Externe-Kontakte-Tab im Kontakte-Hub.
 *
 * Layout:
 *   Linker Pane: Suche + Filter + Liste
 *   Rechter Pane: Detail (Stammdaten / Verlauf / Verknuepfungen) ODER Empty.
 */

import { type JSX, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResizablePanels } from '@/components/ui/resizable-panels';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { externalContactsApi, type ExternalContactSummary, type ListParams } from '@/gateways/platform/external-contacts-gateway';
import { ExternalContactDetailPanel } from './external-contact-detail';
import { CreateExternalContactModal } from './create-external-contact-modal';
import { CsvImportModal } from './csv-import-modal';
import { toast } from '@/components/ui/toast';
import { useT } from "@/lib/i18n/use-t";

function formatLastTouch(iso: string | null): string | null {
    if (!iso) return null;
    const ago = Date.now() - new Date(iso).getTime();
    const d = Math.floor(ago / 86400000);
    if (d < 1) return 'heute';
    if (d < 2) return 'gestern';
    if (d < 7) return `vor ${d} Tagen`;
    if (d < 30) return `vor ${Math.floor(d / 7)} Wo`;
    return `vor ${Math.floor(d / 30)} Mon`;
}

function getInitials(c: ExternalContactSummary): string {
    if (c.kind === 'organization') {
        const n = c.fullName ?? c.lastName ?? '?';
        return n.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
    }
    const f = (c.firstName ?? '').trim();
    const l = (c.lastName ?? '').trim();
    return ((f[0] ?? '') + (l[0] ?? '')).toUpperCase() || '?';
}

function avatarColor(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h) + seed.charCodeAt(i);
    return `hsl(${Math.abs(h) % 360}, 70%, 60%)`;
}

export function ExternalContactsTab({ activeTagSlug }: { activeTagSlug: string | null }): JSX.Element {
    const t = useT();
    const [query, setQuery] = useState('');
    const [kindFilter, setKindFilter] = useState<'all' | 'person' | 'organization'>('all');
    const [contacts, setContacts] = useState<ExternalContactSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [showImport, setShowImport] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params: ListParams = {};
            if (query.trim()) params.q = query.trim();
            if (kindFilter !== 'all') params.kind = kindFilter;
            if (activeTagSlug) params.tags = activeTagSlug;
            const res = await externalContactsApi.list(params);
            setContacts(res.items);
        } catch (e) {
            toast.error('Kontakte konnten nicht geladen werden');
        } finally {
            setLoading(false);
        }
    }, [query, kindFilter, activeTagSlug]);

    useEffect(() => {
        const t = setTimeout(load, query ? 200 : 0);
        return () => clearTimeout(t);
    }, [load, query]);

    const handleDelete = useCallback(async (id: string) => {
        if (!window.confirm('Kontakt löschen?')) return;
        try {
            await externalContactsApi.remove(id);
            toast.success('Kontakt gelöscht');
            if (selectedId === id) setSelectedId(null);
            load();
        } catch {
            toast.error('Löschen fehlgeschlagen');
        }
    }, [selectedId, load]);

    const sortedContacts = useMemo(() => {
        return [...contacts];
    }, [contacts]);

    const leftPanel = (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
                <div className="relative flex-1">
                    <MaterialIcon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t('contacts.external.external_contacts_tab.kontakte_durchsuchen')}
                        className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => setShowImport(true)}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('contacts.external.external_contacts_tab.csv_importieren')}
                >
                    <MaterialIcon name="upload_file" size={16} />
                </button>
                <a
                    href={externalContactsApi.bulkVcardUrl()}
                    download="prilog-contacts.vcf"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('contacts.external.external_contacts_tab.alle_als_vcard_exportieren')}
                >
                    <MaterialIcon name="download" size={16} />
                </a>
                <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                    <MaterialIcon name="add" size={16} />
                    {t('contacts.external.external_contacts_tab.neu')}
                </button>
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1 border-b bg-background px-3 py-1.5">
                <FilterChip active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
                    {t('contacts.external.external_contacts_tab.alle')}{contacts.length})
                </FilterChip>
                <FilterChip active={kindFilter === 'person'} onClick={() => setKindFilter('person')} icon="person">
                    {t('contacts.external.external_contacts_tab.personen')}
                </FilterChip>
                <FilterChip active={kindFilter === 'organization'} onClick={() => setKindFilter('organization')} icon="apartment">
                    {t('contacts.external.external_contacts_tab.organisationen')}
                </FilterChip>
            </div>

            {/* List */}
            <ScrollArea className="flex-1">
                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : sortedContacts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
                        <MaterialIcon name="contacts" size={48} className="text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">{t('contacts.external.external_contacts_tab.keine_kontakte_gefunden')}</p>
                        <button onClick={() => setShowCreate(true)}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                            {t('contacts.external.external_contacts_tab.ersten_kontakt_anlegen')}
                        </button>
                    </div>
                ) : (
                    <div className="divide-y">
                        {sortedContacts.map(c => (
                            <ContactRow
                                key={c.id}
                                contact={c}
                                selected={selectedId === c.id}
                                onClick={() => setSelectedId(c.id)}
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );

    const rightPanel = selectedId ? (
        <ExternalContactDetailPanel
            contactId={selectedId}
            onClose={() => setSelectedId(null)}
            onChange={load}
            onDelete={() => handleDelete(selectedId)}
        />
    ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <MaterialIcon name="contacts" size={48} className="text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">{t('contacts.external.external_contacts_tab.kontakt_auswaehlen_fuer_details')}</p>
        </div>
    );

    return (
        <>
            <ResizablePanels left={leftPanel} right={rightPanel} defaultLeftRatio={0.5} minLeftRatio={0.35} maxLeftRatio={0.7} />
            {showCreate && <CreateExternalContactModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setSelectedId(id); load(); }} />}
            {showImport && <CsvImportModal onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} />}
        </>
    );
}

function FilterChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: string; children: React.ReactNode }): JSX.Element {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted',
            )}
        >
            {icon && <MaterialIcon name={icon} size={14} className="size-3" />}
            {children}
        </button>
    );
}

function ContactRow({ contact, selected, onClick }: { contact: ExternalContactSummary; selected: boolean; onClick: () => void }): JSX.Element {
    const initials = getInitials(contact);
    const color = avatarColor(contact.id);
    const lt = formatLastTouch(contact.lastTouchAt);
    const primaryEmail = contact.emails.find(e => e.primary)?.value ?? contact.emails[0]?.value;
    const primaryPhone = contact.phones.find(p => p.primary)?.value ?? contact.phones[0]?.value;

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                selected && 'bg-primary/5',
            )}
        >
            <div
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ backgroundColor: color }}
            >
                {contact.kind === 'organization' ? <MaterialIcon name="apartment" size={16} /> : initials}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{contact.displayName}</span>
                    {contact.organization && contact.kind === 'person' && (
                        <span className="shrink-0 truncate text-[10px] text-muted-foreground">· {contact.organization.name}</span>
                    )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {primaryEmail && <span className="truncate">{primaryEmail}</span>}
                    {primaryPhone && !primaryEmail && <span className="truncate">{primaryPhone}</span>}
                </div>
                {contact.tags.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 overflow-hidden">
                        {contact.tags.slice(0, 3).map(_t => (
                            <span
                                key={_t.id}
                                className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                style={{ backgroundColor: (_t.color ?? '#94a3b8') + '20', color: _t.color ?? '#475569' }}
                            >
                                {_t.label}
                            </span>
                        ))}
                        {contact.tags.length > 3 && <span className="text-[9px] text-muted-foreground">+{contact.tags.length - 3}</span>}
                    </div>
                )}
            </div>
            {lt && <span className="shrink-0 text-[10px] text-muted-foreground">{lt}</span>}
        </button>
    );
}
