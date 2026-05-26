import { type JSX, useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { useContacts, type Contact } from './use-contacts';
import { userTypeFilterStore } from './user-type-filter-store';
import { sourceFilterStore, officeFilterStore, tagFilterStore } from './contacts-filters';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResizablePanels } from '@/components/ui/resizable-panels';
import { UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { SendDropDialog } from '@/features/mein-fach/send-drop-dialog';
import { useEnabledModules } from '@/core/permissions';
import { externalContactsApi, type ExternalContactSummary } from '@/gateways/platform/external-contacts-gateway';
import { CreateExternalContactModal } from './external/create-external-contact-modal';
import { CsvImportModal } from './external/csv-import-modal';
import { InviteMemberModal } from './external/invite-member-modal';
import { UnifiedContactRow } from './unified/unified-contact-row';
import { ViewBar } from './views/view-bar';
import { applyView, getFieldValue, extraColumns, type ViewDef } from '@/lib/view-engine';
import { viewDefinitionsGateway, evalViewBlock } from '@/gateways/platform/view-definitions-gateway';
import { UnifiedContactDetail } from './unified/unified-contact-detail';
import { memberToView, externalToView, applyOfficeFilter, type ContactView, type OfficeFilter, hasBirthdayWithin, isExpiringSoon, isExpiredActive, isOrphan } from './unified/contact-view';
import { BulkActionsBar } from './bulk/bulk-actions-bar';
import { HistoryPanel } from './bulk/history-panel';
import { bulkSelectionStore } from './bulk/bulk-selection-store';
import { useT } from "@/lib/i18n/use-t";

const gateway = createProjectGateway();

interface TagInfo {
    id: string;
    label: string;
    slug: string;
    color: string | null;
    contactCount?: number;
}

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

// ═══════════════════════════════════════════════════════════════════════════

export function ContactsHub(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const hubNavigate = useNavigate();
    // Doppelklick auf einen Kontakt → 1:1-DM. Nur Mitglieder (refId =
    // echte Matrix-ID, nicht die prefixte view-id), nicht man selbst.
    const openDm = (v: ContactView) => {
        if (v.source === 'member' && v.refId && v.refId !== session.matrix?.userId) {
            hubNavigate(`/dm/${encodeURIComponent(v.refId)}`);
        }
    };
    const { contacts, loading: contactsLoading } = useContacts();
    const [searchParams, setSearchParams] = useSearchParams();

    // Filter via Stores (Sidebar steuert sie, Hauptbereich zeigt nur Liste)
    const sourceFilter = useSyncExternalStore(sourceFilterStore.subscribe, sourceFilterStore.getSnapshot);
    const officeFilter = useSyncExternalStore(officeFilterStore.subscribe, officeFilterStore.getSnapshot);
    const tagSlugFromStore = useSyncExternalStore(tagFilterStore.subscribe, tagFilterStore.getSnapshot);
    const tagSlugFromUrl = searchParams.get('tag');
    // URL-Param hat Vorrang (Bookmarks), Store als Fallback
    const activeTagSlug = tagSlugFromUrl ?? tagSlugFromStore;

    // URL-Param in Store spiegeln, damit Sidebar konsistent ist
    useEffect(() => {
        if (tagSlugFromUrl !== tagSlugFromStore) {
            tagFilterStore.setFromUrl(tagSlugFromUrl);
        }
    }, [tagSlugFromUrl, tagSlugFromStore]);

    const [searchInput, setSearchInput] = useState('');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [fullscreen, setFullscreen] = useState(false);
    const [showTagManager, setShowTagManager] = useState(false);
    // Multi-Select + Verlauf
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
    const [showHistory, setShowHistory] = useState(false);
    const [historyRefresh, setHistoryRefresh] = useState(0);
    const onActionComplete = useCallback(() => {
        loadTags();
        setHistoryRefresh(n => n + 1);
        setBulkSelected(new Set());
        bulkSelectionStore.clear();
    }, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadTags ist in scope, ESLint sieht es spaeter
    const toggleBulk = useCallback((id: string) => {
        setBulkSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);
    // CRM-Foundation C: aktive gespeicherte Ansicht (additiv zu Quick-Filtern)
    const [activeView, setActiveView] = useState<ViewDef | null>(null);
    // P1.4: Wenn der P1-Pfad für den Tenant scharf ist (Rollout-Gate) und
    // die aktive gespeicherte Ansicht serverseitig nicht auflösbar ist,
    // zeigen wir eine klare Meldung statt einer falschen/leeren Liste.
    const [viewBlock, setViewBlock] = useState<{ reason: string } | null>(null);
    useEffect(() => {
        let cancelled = false;
        setViewBlock(null);
        if (!jwt || !activeView) return;
        (async () => {
            try {
                const gate = await viewDefinitionsGateway.rolloutGate(jwt);
                if (cancelled || !gate.eligible) return;
                const compat = await viewDefinitionsGateway.viewCompat(jwt, activeView.id);
                if (cancelled) return;
                setViewBlock(evalViewBlock(gate, compat));
            } catch {
                // Gate/Compat nicht ermittelbar → kein Block, kein stilles 0:
                // bestehendes (Client-)Verhalten bleibt unverändert.
            }
        })();
        return () => { cancelled = true; };
    }, [jwt, activeView]);
    const [initialViewId] = useState<string | null>(() => {
        try { return window.localStorage.getItem('prilog:contacts:activeView'); } catch { return null; }
    });
    const selectView = (v: ViewDef | null) => {
        setActiveView(v);
        try {
            if (v) window.localStorage.setItem('prilog:contacts:activeView', v.id);
            else window.localStorage.removeItem('prilog:contacts:activeView');
        } catch { /* localStorage blocked */ }
    };
    // Density-Toggle: compact | default | expanded. Persistiert in localStorage.
    const [density, setDensity] = useState<'compact' | 'default' | 'expanded'>(() => {
        if (typeof window === 'undefined') return 'default';
        const stored = window.localStorage.getItem('prilog:contacts:density');
        return stored === 'compact' || stored === 'expanded' ? stored : 'default';
    });
    const setDensityPersisted = (d: 'compact' | 'default' | 'expanded') => {
        setDensity(d);
        try { window.localStorage.setItem('prilog:contacts:density', d); } catch { /* localStorage blocked */ }
    };

    const enabledModules = useEnabledModules();
    const hasCrmApp = enabledModules.has('contacts_crm' as never);

    // Externe Kontakte laden (nur wenn CRM aktiv)
    const [externals, setExternals] = useState<ExternalContactSummary[]>([]);
    const loadExternals = useCallback(async () => {
        if (!hasCrmApp || !jwt) return;
        try {
            const res = await externalContactsApi.list({ limit: 500 });
            setExternals(res.items);
        } catch { /* silent */ }
    }, [hasCrmApp, jwt]);
    useEffect(() => { loadExternals(); }, [loadExternals]);

    // Modals
    const [showCreateExternal, setShowCreateExternal] = useState(false);
    const [showCsvImport, setShowCsvImport] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [newMenuOpen, setNewMenuOpen] = useState(false);

    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';

    // Tags mit Counts laden
    const [tags, setTags] = useState<TagInfo[]>([]);
    const [userTagMap, setUserTagMap] = useState<Map<string, TagInfo[]>>(new Map());

    const loadTags = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await gateway.listContactTags(jwt);
            setTags((res.tags as TagInfo[]) ?? []);
        } catch { /* ignore */ }
    }, [jwt]);

    useEffect(() => { loadTags(); }, [loadTags]);

    // Wenn Tag-Filter aktiv: lade Tags für alle Kontakte um zu filtern
    useEffect(() => {
        if (!jwt || !activeTagSlug || contacts.length === 0) return;
        (async () => {
            const map = new Map<string, TagInfo[]>();
            for (const c of contacts) {
                try {
                    const res = await gateway.getContactTags(jwt, c.id);
                    map.set(c.id, res.tags as TagInfo[]);
                } catch { /* ignore */ }
            }
            setUserTagMap(map);
        })();
    }, [jwt, activeTagSlug, contacts]);

    // Gefilterte Kontakte
    const activeUserTypeFilter = useSyncExternalStore(userTypeFilterStore.subscribe, userTypeFilterStore.getSnapshot, () => null);

    const filteredContacts = useMemo(() => {
        let list = contacts;
        // Sidebar UserType Filter
        if (activeUserTypeFilter) {
            list = list.filter(c => c.userType === activeUserTypeFilter);
        }
        if (activeTagSlug) {
            list = list.filter(c => {
                const userTags = userTagMap.get(c.id);
                return userTags?.some(_t => _t.slug === activeTagSlug);
            });
        }
        if (searchInput.trim()) {
            const q = searchInput.toLowerCase();
            list = list.filter(c =>
                c.displayName.toLowerCase().includes(q) ||
                c.username.toLowerCase().includes(q) ||
                (c.email?.toLowerCase().includes(q) ?? false),
            );
        }
        return list;
    }, [contacts, activeUserTypeFilter, activeTagSlug, userTagMap, searchInput]);

    // ── Vereinheitlichte Liste: Mitglieder + Externe via ContactView ──
    const allViews: ContactView[] = useMemo(() => {
        const memberViews = filteredContacts.map(memberToView);
        const externalViews = hasCrmApp ? externals.map(externalToView) : [];
        const combined: ContactView[] = [];
        if (sourceFilter === 'all' || sourceFilter === 'members') combined.push(...memberViews);
        if (sourceFilter === 'all' || sourceFilter === 'external') combined.push(...externalViews);
        // Office-Filter
        const officed = officeFilter ? combined.filter(c => applyOfficeFilter(c, officeFilter)) : combined;
        // Externe Suche: filter nach searchInput auch bei externen
        const q = searchInput.trim().toLowerCase();
        const filtered = q ? officed.filter(c =>
            c.displayName.toLowerCase().includes(q) ||
            c.emails.some(e => e.value.toLowerCase().includes(q)) ||
            c.phones.some(p => p.value.toLowerCase().includes(q)) ||
            (c.organization?.name?.toLowerCase().includes(q) ?? false)
        ) : officed;
        // Sortierung: lastTouchAt desc, dann Name
        filtered.sort((a, b) => {
            if (a.lastTouchAt && b.lastTouchAt) return new Date(b.lastTouchAt).getTime() - new Date(a.lastTouchAt).getTime();
            if (a.lastTouchAt) return -1;
            if (b.lastTouchAt) return 1;
            return a.displayName.localeCompare(b.displayName);
        });
        return filtered;
    }, [filteredContacts, externals, hasCrmApp, sourceFilter, searchInput, officeFilter]);

    // CRM-Foundation C: aktive Ansicht ÜBER die Quick-Filter legen
    const applied = useMemo(
        () => activeView ? applyView(allViews, activeView) : { rows: allViews, groups: null },
        [allViews, activeView],
    );
    const displayed = applied.rows;
    const viewCols = activeView ? extraColumns(activeView) : [];

    // Office-Counts (auf alle members + externals, nicht gefiltert)
    const officeCounts = useMemo(() => {
        const all: ContactView[] = [
            ...filteredContacts.map(memberToView),
            ...(hasCrmApp ? externals.map(externalToView) : []),
        ];
        return {
            birthdays: all.filter(c => hasBirthdayWithin(c, 7)).length,
            expiring: all.filter(c => isExpiringSoon(c, 30)).length,
            expiredActive: all.filter(c => isExpiredActive(c)).length,
            noSpace: all.filter(c => isOrphan(c)).length,
        };
    }, [filteredContacts, externals, hasCrmApp]);

    // Mirror der Selektion in den globalen Store, damit Sidebar + andere
    // Komponenten (z.B. Hover-+ in Sidebar-Gruppen/Tags) ohne Prop-Drilling
    // dranbleiben.
    useEffect(() => {
        const entries = allViews
            .filter(v => bulkSelected.has(v.id))
            .map(v => ({ id: v.id, refId: v.refId, source: v.source }));
        bulkSelectionStore.set(entries);
    }, [bulkSelected, allViews]);
    useEffect(() => () => bulkSelectionStore.clear(), []);

    const selectedView: ContactView | null = useMemo(() => {
        if (!selectedUserId) return null;
        return allViews.find(v => v.id === selectedUserId) ?? null;
    }, [allViews, selectedUserId]);

    // ── Left Panel: Liste ──
    const leftPanel = (
        <div className="flex h-full flex-col">
            {/* 2. Balken (Master-Seite): Suche + Aktionen */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
                <button onClick={() => setShowTagManager(true)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title={t('contacts.contacts_hub.tags_verwalten')}>
                    <MaterialIcon name="sell" size={16} />
                </button>
                <button onClick={() => setShowHistory(true)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Verlauf der Bulk-Aktionen">
                    <MaterialIcon name="history" size={16} />
                </button>

                <div className="relative flex-1">
                    <MaterialIcon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        placeholder={t('contacts.contacts_hub.kontakte_durchsuchen')}
                        className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                    />
                    {searchInput && (
                        <button onClick={() => setSearchInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-muted">
                            <MaterialIcon name="close" size={14} />
                        </button>
                    )}
                </div>
                {jwt && (
                    <ViewBar
                        jwt={jwt}
                        activeViewId={activeView?.id ?? initialViewId}
                        onSelect={selectView}
                        isAdmin={isAdmin}
                    />
                )}
                {/* Density-Toggle: compact / default / expanded */}
                <div className="flex shrink-0 items-center gap-0.5 rounded-md border bg-background p-0.5">
                    <button type="button" onClick={() => setDensityPersisted('compact')}
                        className={cn(
                            'flex size-7 items-center justify-center rounded transition-colors',
                            density === 'compact' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                        )}
                        title={t('contacts.contacts_hub.kompakt_eine_zeile_pro_kontakt')}
                        aria-label={t('contacts.contacts_hub.kompakte_ansicht')}
                        aria-pressed={density === 'compact'}>
                        <MaterialIcon name="view_headline" size={16} />
                    </button>
                    <button type="button" onClick={() => setDensityPersisted('default')}
                        className={cn(
                            'flex size-7 items-center justify-center rounded transition-colors',
                            density === 'default' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                        )}
                        title={t('contacts.contacts_hub.standard_email_tags')}
                        aria-label={t('contacts.contacts_hub.standard-ansicht')}
                        aria-pressed={density === 'default'}>
                        <MaterialIcon name="view_list" size={16} />
                    </button>
                    <button type="button" onClick={() => setDensityPersisted('expanded')}
                        className={cn(
                            'flex size-7 items-center justify-center rounded transition-colors',
                            density === 'expanded' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                        )}
                        title={t('contacts.contacts_hub.erweitert_standard_telefon_adresse')}
                        aria-label={t('contacts.contacts_hub.erweiterte_ansicht')}
                        aria-pressed={density === 'expanded'}>
                        <MaterialIcon name="view_agenda" size={16} />
                    </button>
                </div>
                {hasCrmApp && (
                    <div className="relative">
                        <button type="button" onClick={() => setNewMenuOpen(o => !o)}
                            title={t('contacts.contacts_hub.neu')}
                            aria-label={t('contacts.contacts_hub.neu')}
                            aria-haspopup="menu"
                            aria-expanded={newMenuOpen}
                            className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                            <MaterialIcon name="add" size={18} />
                        </button>
                        {newMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setNewMenuOpen(false)} />
                                <div className="absolute right-0 top-full z-50 mt-0.5 w-56 rounded border bg-background py-1 shadow-md">
                                    {isAdmin && (
                                        <button onClick={() => { setShowInvite(true); setNewMenuOpen(false); }}
                                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted">
                                            <MaterialIcon name="forward_to_inbox" size={14} className="size-3.5 text-emerald-500" />
                                            <span className="flex-1">{t('contacts.contacts_hub.mitglied_einladen')}</span>
                                            <span className="text-[9px] text-muted-foreground">{t('contacts.contacts_hub.login-konto')}</span>
                                        </button>
                                    )}
                                    <button onClick={() => { setShowCreateExternal(true); setNewMenuOpen(false); }}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted">
                                        <MaterialIcon name="contacts" size={14} className="size-3.5 text-primary" />
                                        <span className="flex-1">{t('contacts.contacts_hub.externer_kontakt')}</span>
                                        <span className="text-[9px] text-muted-foreground">{t('contacts.contacts_hub.personorg')}</span>
                                    </button>
                                    <div className="my-1 border-t" />
                                    <button onClick={() => { setShowCsvImport(true); setNewMenuOpen(false); }}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted">
                                        <MaterialIcon name="upload_file" size={14} className="size-3.5 text-amber-500" />
                                        <span className="flex-1">{t('contacts.contacts_hub.csv-bulk-import')}</span>
                                        <span className="text-[9px] text-muted-foreground">{t('contacts.contacts_hub.mitglieder_externe')}</span>
                                    </button>
                                    <a href={externalContactsApi.bulkVcardUrl()} download="prilog-contacts.vcf"
                                        onClick={() => setNewMenuOpen(false)}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted">
                                        <MaterialIcon name="download" size={14} className="size-3.5 text-sky-500" />
                                        <span className="flex-1">vCard-Export</span>
                                        <span className="text-[9px] text-muted-foreground">{t('contacts.contacts_hub.alle_externe')}</span>
                                    </a>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Bulk-Aktions-Bar (nur wenn etwas markiert) */}
            {jwt && bulkSelected.size > 0 && (
                <BulkActionsBar
                    jwt={jwt}
                    selected={displayed.filter(v => bulkSelected.has(v.id))}
                    filteredCount={displayed.length}
                    onSelectAll={() => setBulkSelected(new Set(displayed.map(v => v.id)))}
                    onClear={() => setBulkSelected(new Set())}
                    onActionComplete={onActionComplete}
                />
            )}

            {/* Selektions-+ Aktive-Filter-Bar: Master-Checkbox links + Filter-Chips */}
            <ActiveFiltersBar
                sourceFilter={sourceFilter}
                officeFilter={officeFilter}
                activeTagSlug={activeTagSlug}
                tags={tags}
                onClearTag={() => {
                    tagFilterStore.set(null);
                    setSearchParams({});
                }}
                selectAllState={
                    bulkSelected.size === 0 ? 'none' :
                        displayed.length > 0 && displayed.every(v => bulkSelected.has(v.id)) ? 'all' :
                            'some'
                }
                filteredCount={displayed.length}
                selectedCount={bulkSelected.size}
                onToggleSelectAll={() => {
                    const allMarked = displayed.length > 0 && displayed.every(v => bulkSelected.has(v.id));
                    setBulkSelected(allMarked ? new Set() : new Set(displayed.map(v => v.id)));
                }}
            />

            {/* List */}
            <ScrollArea className="flex-1">
                {viewBlock ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
                        <MaterialIcon name="error_outline" size={32} className="text-amber-500/70" />
                        <p className="max-w-md text-sm text-muted-foreground">
                            {t('contacts.contacts_hub.view_unresolvable', { reason: viewBlock.reason })}
                        </p>
                    </div>
                ) : contactsLoading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : displayed.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
                        <MaterialIcon name="groups" size={32} className="text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">{t('contacts.contacts_hub.keine_kontakte_gefunden')}</p>
                    </div>
                ) : applied.groups ? (
                    <div className="flex gap-3 overflow-x-auto p-3">
                        {applied.groups.map(g => (
                            <div key={g.key} className="w-64 shrink-0 rounded-lg border bg-muted/20">
                                <div className="flex items-center justify-between border-b px-3 py-2 text-[12px] font-semibold">
                                    <span className="truncate">{g.label}</span>
                                    <span className="text-muted-foreground">{g.rows.length}</span>
                                </div>
                                <div className="divide-y">
                                    {g.rows.map(view => (
                                        <UnifiedContactRow
                                            key={view.id}
                                            contact={view}
                                            selected={selectedUserId === view.id}
                                            onClick={() => setSelectedUserId(view.id)}
                                            onDoubleClick={() => openDm(view)}
                                            density="compact"
                                            checked={bulkSelected.has(view.id)}
                                            onCheckedChange={() => toggleBulk(view.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="divide-y">
                        {displayed.map(view => (
                            <div key={view.id}>
                                <UnifiedContactRow
                                    contact={view}
                                    selected={selectedUserId === view.id}
                                    onClick={() => setSelectedUserId(view.id)}
                                    onDoubleClick={() => openDm(view)}
                                    density={density}
                                    checked={bulkSelected.has(view.id)}
                                    onCheckedChange={() => toggleBulk(view.id)}
                                />
                                {viewCols.length > 0 && (
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pb-1.5 text-[11px] text-muted-foreground">
                                        {viewCols.map(col => {
                                            const raw = getFieldValue(view, col.key);
                                            if (raw == null || raw === '') return null;
                                            return (
                                                <span key={col.key}>
                                                    <span className="opacity-60">{col.key.replace(/^cf:/, '')}:</span>{' '}
                                                    {String(raw)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );

    // ── Right Panel: Detail (UnifiedContactDetail) ──
    const handleDeleteExternal = async () => {
        if (!selectedView || selectedView.source === 'member') return;
        if (!confirm('Kontakt löschen?')) return;
        await externalContactsApi.remove(selectedView.refId);
        setSelectedUserId(null);
        loadExternals();
    };

    const rightPanel = selectedView ? (
        <UnifiedContactDetail
            contact={selectedView}
            onClose={() => setSelectedUserId(null)}
            onChange={() => { loadExternals(); loadTags(); }}
            onDelete={selectedView.source !== 'member' ? handleDeleteExternal : undefined}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen(f => !f)}
        />
    ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <MaterialIcon name="groups" size={40} className="text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">{t('contacts.contacts_hub.kontakt_auswaehlen_fuer_details')}</p>
        </div>
    );

    return (
        <div className="flex h-full flex-col">
            {/* Content — Liste + Detail (Title + Favoriten leben im AppHeader,
                Vollbild-Toggle sitzt in der Detail-Toolbar wie bei Spaces) */}
            <div className="min-h-0 flex-1">
                {fullscreen ? (
                    <div className="h-full">{rightPanel}</div>
                ) : (
                    <ResizablePanels
                        left={leftPanel}
                        right={rightPanel}
                        defaultLeftRatio={0.55}
                        minLeftRatio={0.35}
                        maxLeftRatio={0.8}
                    />
                )}
            </div>

            {/* CRM Modals */}
            {showCreateExternal && (
                <CreateExternalContactModal
                    onClose={() => setShowCreateExternal(false)}
                    onCreated={(id) => { setShowCreateExternal(false); setSelectedUserId(`x:${id}`); loadExternals(); }}
                />
            )}
            {showCsvImport && (
                <CsvImportModal
                    onClose={() => setShowCsvImport(false)}
                    onDone={() => { setShowCsvImport(false); loadExternals(); }}
                />
            )}
            {showInvite && (
                <InviteMemberModal
                    onClose={() => setShowInvite(false)}
                    onCreated={() => { setShowInvite(false); }}
                />
            )}

            {/* Tag Manager Dialog */}
            {showTagManager && (
                <ContactTagManager
                    onClose={() => setShowTagManager(false)}
                    onTagsChange={loadTags}
                />
            )}

            {/* Verlauf der Bulk-Aktionen */}
            {showHistory && jwt && (
                <HistoryPanel
                    jwt={jwt}
                    onClose={() => setShowHistory(false)}
                    refreshSignal={historyRefresh}
                />
            )}

        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Contact Tag Manager Dialog
// ═══════════════════════════════════════════════════════════════════════════

// ─── ActiveFiltersBar ────────────────────────────────────────────────
// Zeigt aktive Filter mit X-Buttons zum schnellen Entfernen. Nur sichtbar
// wenn mindestens ein Filter gesetzt ist. Die Auswahl der Filter passiert
// in der Sidebar — diese Bar dient nur dem Reset.

function ActiveFiltersBar({ sourceFilter, officeFilter, activeTagSlug, tags, onClearTag, selectAllState, filteredCount, selectedCount, onToggleSelectAll }: {
    sourceFilter: 'all' | 'members' | 'external';
    officeFilter: OfficeFilter | null;
    activeTagSlug: string | null;
    tags: TagInfo[];
    onClearTag: () => void;
    selectAllState: 'none' | 'some' | 'all';
    filteredCount: number;
    selectedCount: number;
    onToggleSelectAll: () => void;
}): JSX.Element | null {
    const t = useT();
    const OFFICE_LABEL: Record<string, string> = {
        'birthdays': '🎂 Geburtstage', 'expiring': '⏰ Laeuft ab',
        'expired-active': '💀 Karteileichen', 'no-space': '📭 Ohne Space',
    };
    const items: { label: string; onRemove: () => void }[] = [];
    if (sourceFilter !== 'all') {
        items.push({
            label: sourceFilter === 'members' ? t('common.members') : t('common.external'),
            onRemove: () => sourceFilterStore.set('all'),
        });
    }
    if (officeFilter) {
        items.push({
            label: OFFICE_LABEL[officeFilter] ?? officeFilter,
            onRemove: () => officeFilterStore.set(null),
        });
    }
    if (activeTagSlug) {
        const tag = tags.find(_t => _t.slug === activeTagSlug);
        items.push({
            label: tag?.label ? `Tag: ${tag.label}` : `Tag: ${activeTagSlug}`,
            onRemove: onClearTag,
        });
    }
    // Immer rendern, damit die Master-Checkbox „alle in der Liste markieren"
    // jederzeit erreichbar ist — auch ohne aktive Filter.
    return (
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-3 py-1.5 text-[11px]">
            <button
                type="button"
                role="checkbox"
                aria-checked={selectAllState === 'all' ? true : selectAllState === 'some' ? 'mixed' : false}
                aria-label={t('contacts.bulk.select_all_aria')}
                onClick={onToggleSelectAll}
                disabled={filteredCount === 0}
                title={selectAllState === 'all'
                    ? t('contacts.bulk.clear_all_visible', { count: filteredCount })
                    : t('contacts.bulk.select_all_visible', { count: filteredCount })}
                className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                    selectAllState === 'all' && 'border-primary bg-primary text-primary-foreground',
                    selectAllState === 'some' && 'border-primary bg-primary/30 text-primary-foreground',
                    selectAllState === 'none' && 'border-muted-foreground/40 bg-background hover:border-primary/60',
                    filteredCount === 0 && 'cursor-not-allowed opacity-40',
                )}
            >
                {selectAllState === 'all' && <MaterialIcon name="check" size={12} />}
                {selectAllState === 'some' && <MaterialIcon name="remove" size={12} />}
            </button>
            <span className="text-muted-foreground">
                {selectedCount > 0
                    ? t('contacts.bulk.selected_of_total', { count: selectedCount, total: filteredCount })
                    : t('contacts.bulk.total_count', { count: filteredCount })}
            </span>
            {items.length > 0 && <span className="ml-2 text-muted-foreground">{t('contacts.contacts_hub.aktive_filter')}</span>}
            {items.map((it, i) => (
                <button key={i} onClick={it.onRemove}
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 hover:bg-muted">
                    {it.label}
                    <MaterialIcon name="close" size={10} className="opacity-60" />
                </button>
            ))}
        </div>
    );
}

function SourceChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: string; children: React.ReactNode }): JSX.Element {
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

function ContactTagManager({ onClose, onTagsChange }: { onClose: () => void; onTagsChange: () => void }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const gw = useMemo(() => createProjectGateway(), []);

    const [tags, setTags] = useState<TagInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [newLabel, setNewLabel] = useState('');
    const [newColor, setNewColor] = useState('#6366f1');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [editColor, setEditColor] = useState('');

    const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await gw.listContactTags(jwt);
            setTags(res.tags as TagInfo[]);
        } finally {
            setLoading(false);
        }
    }, [jwt, gw]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = useCallback(async () => {
        if (!jwt || !newLabel.trim()) return;
        await gw.createContactTag(jwt, { label: newLabel.trim(), color: newColor });
        setNewLabel('');
        await load();
        onTagsChange();
    }, [jwt, newLabel, newColor, gw, load, onTagsChange]);

    const handleUpdate = useCallback(async (tagId: string) => {
        if (!jwt || !editLabel.trim()) return;
        await gw.updateContactTag(jwt, tagId, { label: editLabel.trim(), color: editColor || undefined });
        setEditingId(null);
        await load();
        onTagsChange();
    }, [jwt, editLabel, editColor, gw, load, onTagsChange]);

    const handleDelete = useCallback(async (tagId: string) => {
        if (!jwt) return;
        if (!window.confirm('Tag endgueltig loeschen? Alle Zuordnungen werden entfernt.')) return;
        await gw.deleteContactTag(jwt, tagId);
        await load();
        onTagsChange();
    }, [jwt, gw, load, onTagsChange]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div className="w-full max-w-xl rounded-xl bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 border-b px-4 py-3">
                    <MaterialIcon name="sell" size={16} className="text-muted-foreground" />
                    <h3 className="text-sm font-semibold">{t('contacts.contacts_hub.kontakt-tags_verwalten')}</h3>
                    <div className="flex-1" />
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={18} />
                    </button>
                </div>

                {/* Create new */}
                <div className="border-b px-4 py-3">
                    <p className="mb-2 text-[11px] font-medium">{t('contacts.contacts_hub.neuen_tag_erstellen')}</p>
                    <div className="flex items-center gap-2">
                        <input
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            placeholder={t('contacts.contacts_hub.zb_klasse_5a_fachschaft_mathe')}
                            className="h-8 flex-1 rounded-md border bg-background px-2 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="flex items-center gap-0.5">
                            {COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setNewColor(c)}
                                    className={cn('size-5 rounded-full', newColor === c && 'ring-2 ring-primary ring-offset-1')}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                        <button
                            onClick={handleCreate}
                            disabled={!newLabel.trim()}
                            className="h-8 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                        >
                            <MaterialIcon name="add" size={14} className="inline align-middle" /> {t('contacts.contacts_hub.erstellen')}
                        </button>
                    </div>
                </div>

                {/* List */}
                <div className="max-h-96 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center p-8"><Loader2 className="size-4 animate-spin" /></div>
                    ) : tags.length === 0 ? (
                        <p className="p-6 text-center text-[12px] text-muted-foreground">{t('contacts.contacts_hub.noch_keine_kontakt-tags_erstellt')}</p>
                    ) : (
                        <div className="divide-y">
                            {tags.map(tag => (
                                <div key={tag.id} className="flex items-center gap-3 px-4 py-2">
                                    {editingId === tag.id ? (
                                        <>
                                            <div className="flex items-center gap-0.5">
                                                {COLORS.map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => setEditColor(c)}
                                                        className={cn('size-4 rounded-full', editColor === c && 'ring-2 ring-primary ring-offset-1')}
                                                        style={{ backgroundColor: c }}
                                                    />
                                                ))}
                                            </div>
                                            <input
                                                value={editLabel}
                                                onChange={e => setEditLabel(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleUpdate(tag.id); if (e.key === 'Escape') setEditingId(null); }}
                                                className="h-7 flex-1 rounded border bg-background px-2 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                                                autoFocus
                                            />
                                            <button onClick={() => handleUpdate(tag.id)} className="rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground">OK</button>
                                            <button onClick={() => setEditingId(null)} className="rounded border px-2 py-1 text-[11px] hover:bg-muted">{t('common.cancel')}</button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color ?? '#94a3b8' }} />
                                            <span
                                                className="min-w-0 flex-1 cursor-pointer truncate text-[13px] font-medium hover:underline"
                                                onClick={() => { setEditingId(tag.id); setEditLabel(tag.label); setEditColor(tag.color ?? '#6366f1'); }}
                                            >
                                                {tag.label}
                                            </span>
                                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                                {tag.contactCount ?? 0} {t('contacts.contacts_hub.kontakte')}
                                            </span>
                                            <button
                                                onClick={() => handleDelete(tag.id)}
                                                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            >
                                                <MaterialIcon name="delete" size={14} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Contact Row
// ═══════════════════════════════════════════════════════════════════════════

function ContactRow({ contact, selected, onClick }: { contact: Contact; selected: boolean; onClick: () => void }) {
    return (
        <div
            onClick={onClick}
            className={cn(
                'flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50',
                selected && 'bg-primary/5',
            )}
        >
            <UserAvatar displayName={contact.displayName} size="sm" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{contact.displayName}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                    {contact.userType ?? '@' + contact.username}
                </p>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Contact Detail Panel
// ═══════════════════════════════════════════════════════════════════════════

function ContactDetailPanel({
    contact,
    allTags,
    onTagsChange,
    onClose,
}: {
    contact: Contact;
    allTags: TagInfo[];
    onTagsChange: () => void;
    onClose: () => void;
}) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const gw = useMemo(() => createProjectGateway(), []);

    const [userTags, setUserTags] = useState<TagInfo[]>([]);
    const [family, setFamily] = useState<{ contacts: FamilyRelation[]; responsibleFor: FamilyRelation[] }>({ contacts: [], responsibleFor: [] });
    const [loading, setLoading] = useState(true);
    const [showAddFamily, setShowAddFamily] = useState<'contact' | 'child' | null>(null);
    const [dropDialogOpen, setDropDialogOpen] = useState(false);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [tagsRes, familyRes] = await Promise.all([
                gw.getContactTags(jwt, contact.id),
                gw.getUserFamily(jwt, contact.id),
            ]);
            setUserTags(tagsRes.tags as TagInfo[]);
            setFamily(familyRes);
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    }, [jwt, contact.id, gw]);

    useEffect(() => { load(); }, [load]);

    // Schueler/Kinder brauchen keinen "Verantwortlich fuer"-Bereich
    const isChildType = contact.audience === 'minor';

    const handleRemoveRelation = useCallback(async (relationId: string) => {
        if (!jwt) return;
        if (!window.confirm('Beziehung entfernen?')) return;
        await gw.deleteFamilyRelation(jwt, relationId);
        load();
    }, [jwt, gw, load]);

    const handleTagToggle = useCallback(async (tag: TagInfo) => {
        if (!jwt) return;
        const hasTag = userTags.some(_t => _t.id === tag.id);
        if (hasTag) {
            await gw.removeContactTag(jwt, contact.id, tag.id);
        } else {
            await gw.addContactTag(jwt, contact.id, tag.id);
        }
        load();
        onTagsChange();
    }, [jwt, userTags, contact.id, gw, load, onTagsChange]);

    return (
        <div className="flex h-full flex-col border-l">
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-4 py-3">
                <span className="text-sm font-medium">{t('contacts.contacts_hub.kontakt-details')}</span>
                <div className="flex-1" />
                <button onClick={onClose} className="rounded p-1 hover:bg-muted">
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <ScrollArea className="flex-1">
                {/* Profile */}
                <div className="flex flex-col items-center px-6 py-6 border-b">
                    <UserAvatar displayName={contact.displayName} size="lg" />
                    <h3 className="mt-3 text-lg font-semibold">{contact.displayName}</h3>
                    <p className="text-sm text-muted-foreground">@{contact.username}</p>
                    {contact.userType && (
                        <span className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                            {contact.userType}
                        </span>
                    )}

                    {/* Quick Actions */}
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <button
                            onClick={() => navigate(`/dm/${encodeURIComponent(contact.id)}`)}
                            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted"
                        >
                            <MaterialIcon name="chat" size={14} />
                            {t('contacts.contacts_hub.nachricht')}
                        </button>
                        <button
                            onClick={() => setDropDialogOpen(true)}
                            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted"
                            title={t('contacts.contacts_hub.datei_in_das_persoenliche_fach_legen')}
                        >
                            <MaterialIcon name="inbox" size={14} />
                            {t('contacts.contacts_hub.ins_fach')}
                        </button>
                        {contact.email && (
                            <a
                                href={`mailto:${contact.email}`}
                                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] hover:bg-muted"
                            >
                                <MaterialIcon name="mail" size={14} />
                                {t('contacts.contacts_hub.e-mail')}
                            </a>
                        )}
                    </div>
                </div>

                {/* Metadata */}
                <div className="space-y-2 border-b px-4 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('common.details')}</p>
                    <div className="space-y-1.5 text-[12px]">
                        {contact.userType && (
                            <div className="flex gap-2">
                                <span className="w-24 text-muted-foreground">{t('common.role')}</span>
                                <span>{contact.userType}</span>
                            </div>
                        )}
                        {contact.email && (
                            <div className="flex gap-2">
                                <span className="w-24 text-muted-foreground">{t('common.email')}</span>
                                <span className="truncate">{contact.email}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tags */}
                <div className="space-y-2 border-b px-4 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <MaterialIcon name="sell" size={12} className="mr-1 inline align-middle" />{t('contacts.contacts_hub.tags')}
                    </p>
                    {loading ? (
                        <Loader2 className="size-3 animate-spin text-muted-foreground" />
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {allTags.map(tag => {
                                const active = userTags.some(_t => _t.id === tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        onClick={() => handleTagToggle(tag)}
                                        className={cn(
                                            'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                                            active ? 'border-transparent font-medium' : 'border-dashed opacity-50 hover:opacity-100',
                                        )}
                                        style={active ? {
                                            backgroundColor: (tag.color ?? '#94a3b8') + '20',
                                            color: tag.color ?? '#94a3b8',
                                        } : undefined}
                                    >
                                        <div className="size-2 rounded-full" style={{ backgroundColor: tag.color ?? '#94a3b8' }} />
                                        {tag.label}
                                    </button>
                                );
                            })}
                            {allTags.length === 0 && (
                                <p className="text-[11px] text-muted-foreground">{t('contacts.contacts_hub.noch_keine_tags_vorhanden_im_dms_erstell')}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Family Relations - Contacts (Eltern, Geschwister etc.) */}
                <div className="space-y-2 border-b px-4 py-4">
                    <p className="flex items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <MaterialIcon name="groups" size={12} className="mr-1 inline align-middle" />{isChildType ? 'Kind von' : 'Familie / Kontakte'}
                        <button
                            onClick={() => setShowAddFamily('contact')}
                            className="ml-auto rounded p-0.5 hover:bg-muted"
                            title={t('contacts.contacts_hub.kontakt_hinzufuegen')}
                        >
                            <MaterialIcon name="add" size={14} />
                        </button>
                    </p>
                    <div className="space-y-1">
                        {family.contacts.map(rel => (
                            <FamilyRow key={rel.id} relation={rel} onRemove={() => handleRemoveRelation(rel.id)} />
                        ))}
                        {family.contacts.length === 0 && (
                            <p className="text-[11px] text-muted-foreground">{t('contacts.contacts_hub.keine_eintraege')}</p>
                        )}
                    </div>
                </div>

                {/* Family Relations - Responsible For (Kinder) — nur bei Erwachsenen sinnvoll */}
                {!isChildType && (
                    <div className="space-y-2 border-b px-4 py-4">
                        <p className="flex items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <MaterialIcon name="child_care" size={12} className="mr-1 inline align-middle" />{t('common.responsible_for')}
                            <button
                                onClick={() => setShowAddFamily('child')}
                                className="ml-auto rounded p-0.5 hover:bg-muted"
                                title={t('contacts.contacts_hub.kind_hinzufuegen')}
                            >
                                <MaterialIcon name="add" size={14} />
                            </button>
                        </p>
                        <div className="space-y-1">
                            {family.responsibleFor.map(rel => (
                                <FamilyRow key={rel.id} relation={rel} onRemove={() => handleRemoveRelation(rel.id)} />
                            ))}
                            {family.responsibleFor.length === 0 && (
                                <p className="text-[11px] text-muted-foreground">{t('contacts.contacts_hub.keine_eintraege')}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Add Family Dialog */}
                {showAddFamily && (
                    <AddFamilyDialog
                        mode={showAddFamily}
                        personUserId={contact.id}
                        onClose={() => setShowAddFamily(null)}
                        onSaved={() => { setShowAddFamily(null); load(); }}
                    />
                )}
            </ScrollArea>

            <SendDropDialog
                open={dropDialogOpen}
                onOpenChange={setDropDialogOpen}
                recipientUserId={contact.id}
                recipientDisplayName={contact.displayName}
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Family Row
// ═══════════════════════════════════════════════════════════════════════════

function FamilyRow({ relation, onRemove }: { relation: FamilyRelation; onRemove?: () => void }) {
    const t = useT();
    const navigate = useNavigate();
    return (
        <div className="group flex items-center gap-2">
            <button
                onClick={() => navigate(`/contacts?user=${encodeURIComponent(relation.userId)}`)}
                className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
            >
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">{relation.userId.replace(/^@/, '').split(':')[0]}</p>
                    <p className="text-[10px] text-muted-foreground">
                        {RELATION_LABELS[relation.relationType] ?? relation.relationType}
                        {relation.isPrimaryContact && ' · Haupt'}
                        {relation.canPickUp && ' · Abholberechtigt'}
                    </p>
                </div>
            </button>
            {onRemove && (
                <button
                    onClick={onRemove}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title={t('contacts.contacts_hub.entfernen')}
                >
                    <MaterialIcon name="delete" size={14} />
                </button>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Add Family Dialog
// ═══════════════════════════════════════════════════════════════════════════

function AddFamilyDialog({
    mode,
    personUserId,
    onClose,
    onSaved,
}: {
    mode: 'contact' | 'child';
    personUserId: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { contacts } = useContacts();
    const gw = useMemo(() => createProjectGateway(), []);

    // Detect if the person we're adding a contact FOR is a child
    const person = contacts.find(c => c.id === personUserId);
    const personIsChild = person?.audience === 'minor';

    // Extract last name from the person for smart pre-filtering
    const personLastName = (person?.displayName ?? '').trim().split(/\s+/).pop()?.toLowerCase() ?? '';

    const [searchInput, setSearchInput] = useState('');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [relationType, setRelationType] = useState<string>(mode === 'contact' ? 'parent' : 'parent');
    const [isPrimaryContact, setIsPrimaryContact] = useState(false);
    const [canPickUp, setCanPickUp] = useState(false);
    const [receivesReports, setReceivesReports] = useState(false);
    const [saving, setSaving] = useState(false);

    const filtered = useMemo(() => {
        const q = searchInput.toLowerCase().trim();
        let list = contacts.filter(c => c.id !== personUserId);

        // When adding a contact to a child (mode 'contact' + person is child):
        // only show adults (exclude other children)
        if (mode === 'contact' && personIsChild) {
            list = list.filter(c => c.audience !== 'minor');
        }
        // When adding a child (mode 'child'): only show children
        if (mode === 'child') {
            list = list.filter(c => c.audience === 'minor');
        }

        // Filter by search input
        if (q) {
            list = list.filter(c =>
                c.displayName.toLowerCase().includes(q) ||
                c.username.toLowerCase().includes(q),
            );
        }

        // Sort: same last name first (likely family members), then alphabetical
        list.sort((a, b) => {
            const aLast = a.displayName.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
            const bLast = b.displayName.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
            const aMatch = personLastName && aLast === personLastName ? 0 : 1;
            const bMatch = personLastName && bLast === personLastName ? 0 : 1;
            if (aMatch !== bMatch) return aMatch - bMatch;
            return a.displayName.localeCompare(b.displayName, 'de');
        });

        return list.slice(0, 20);
    }, [contacts, searchInput, personUserId, personIsChild, personLastName, mode]);

    const handleSave = useCallback(async () => {
        if (!jwt || !selectedUserId) return;
        setSaving(true);
        try {
            // mode 'contact': personUserId ist der Kern, selectedUserId der Kontakt
            // mode 'child': selectedUserId ist der Kern (das Kind), personUserId ist der Elternteil
            const body = mode === 'contact'
                ? { personUserId, contactUserId: selectedUserId, relationType, isPrimaryContact, canPickUp, receivesReports }
                : { personUserId: selectedUserId, contactUserId: personUserId, relationType, isPrimaryContact, canPickUp, receivesReports };

            await gw.createFamilyRelation(jwt, body);
            onSaved();
        } catch (err) {
            console.error('Create family relation failed', err);
            setSaving(false);
        }
    }, [jwt, selectedUserId, mode, personUserId, relationType, isPrimaryContact, canPickUp, receivesReports, gw, onSaved]);

    const title = mode === 'contact' ? 'Kontakt / Familienmitglied hinzufuegen' : 'Kind hinzufuegen';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div className="w-full max-w-lg rounded-xl bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 border-b px-4 py-3">
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <div className="flex-1" />
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={18} />
                    </button>
                </div>

                {/* Person Search */}
                <div className="border-b px-4 py-3">
                    <p className="mb-1.5 text-[11px] font-medium">{t('contacts.contacts_hub.person_suchen')}</p>
                    <input
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        placeholder={t('contacts.contacts_hub.name_oder_benutzername')}
                        className="h-8 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="mt-2 max-h-40 overflow-y-auto rounded border">
                        {filtered.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setSelectedUserId(c.id)}
                                className={cn(
                                    'flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-muted/50',
                                    selectedUserId === c.id && 'bg-primary/10',
                                )}
                            >
                                <UserAvatar displayName={c.displayName} size="sm" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">{c.displayName}</p>
                                    <p className="truncate text-[10px] text-muted-foreground">{c.userType ?? '@' + c.username}</p>
                                </div>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="p-3 text-center text-[11px] text-muted-foreground">{t('contacts.contacts_hub.keine_treffer')}</p>
                        )}
                    </div>
                </div>

                {/* Relation Type + Flags */}
                <div className="space-y-3 border-b px-4 py-3">
                    <div>
                        <p className="mb-1.5 text-[11px] font-medium">{t('contacts.contacts_hub.beziehung')}</p>
                        <select
                            value={relationType}
                            onChange={e => setRelationType(e.target.value)}
                            className="h-8 w-full rounded-md border bg-background px-2 text-[13px]"
                        >
                            {Object.entries(RELATION_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5 text-[12px]">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={isPrimaryContact} onChange={e => setIsPrimaryContact(e.target.checked)} />
                            {t('contacts.contacts_hub.hauptkontakt')}
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={canPickUp} onChange={e => setCanPickUp(e.target.checked)} />
                            {t('contacts.contacts_hub.abholberechtigt')}
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={receivesReports} onChange={e => setReceivesReports(e.target.checked)} />
                            {t('contacts.contacts_hub.empfaengt_zeugnisse_elternbriefe')}
                        </label>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 px-4 py-3">
                    <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-[12px] hover:bg-muted">
                        {t('contacts.contacts_hub.abbrechen')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!selectedUserId || saving}
                        className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                        {saving ? t('common.saving') : t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    );
}
