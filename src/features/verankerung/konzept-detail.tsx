/**
 * Konzept-Detailseite — zentrale Arbeitsfläche im Verankerungs-Hub.
 * 8 Tabs, Dialoge statt window.prompt, i18n via useT, saubere
 * Sprache. Nur live Endpoints — gegatete Module nur als Status.
 */
import { type JSX, type ReactNode, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useEnabledModules } from '@/core/permissions';
import { useT } from '@/lib/i18n/use-t';
import {
    conceptCockpitGateway, type ConceptCockpit, type SchutzkonzeptView,
} from '@/gateways/platform/concept-cockpit-gateway';
import { MaterialIcon } from '@/components/ui/material-icon';
import { spaceGovernanceGateway } from '@/gateways/platform/space-governance-gateway';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { useSpaces } from '@/features/spaces/use-spaces';
import { FieldDialog, type FieldDef } from './field-dialog';

const platformGateway = createPlatformGateway();
const projectGateway = createProjectGateway();
interface Pickers {
    userTypes: { value: string; label: string }[];
    users: { value: string; label: string }[];
    spaces: { value: string; label: string }[];
    practice: { value: string; label: string }[];
    documents: { value: string; label: string }[];
}

type Tab = 'overview' | 'practice' | 'targets' | 'evaluation' | 'score' | 'schutz' | 'agencies' | 'report' | 'gates' | 'help';
type FuncTab = Exclude<Tab, 'help'>;
const DOCS = 'https://github.com/brasilspace/prilog_docs/blob/main/umsetzung';
const GATED = [
    { label: 'Personalnachweis (L6b)', doc: `${DOCS}/datenschutz/dsfa-schwellwertanalyse-l6b-g4-personalnachweis-status-v2.md` },
    { label: 'Meldekanal / Fallakte / Risikoanalyse (L7)', doc: `${DOCS}/konzept-verankerung/l7-schutzkonzept-hochrisikofunktionen-konzept-v2.md` },
    { label: 'Konzept-Verstehen (L8)', doc: `${DOCS}/datenschutz/l8-microlearning-schwellwertanalyse.md` },
    { label: 'Kollektive Verankerungs-Motivation (L9)', doc: `${DOCS}/datenschutz/l9-kollektive-motivation-schwellwertanalyse.md` },
    { label: 'Best-Practice-Bibliothek (L10)', doc: `${DOCS}/datenschutz/l10-cross-school-schwellwertanalyse.md` },
];

type Dlg =
    | { kind: 'practice' } | { kind: 'target' } | { kind: 'resp' } | { kind: 'nudge' }
    | { kind: 'reqcheck'; checkId: string; label: string; status: string }
    | { kind: 'adoption' } | { kind: 'agency' }
    | { kind: 'materialize'; practiceId: string; title: string }
    | { kind: 'linkref'; practiceId: string; title: string }
    | { kind: 'editnudge'; nudgeId: string; message: string; dueDate: string | null };

export function KonzeptDetail({ flowId, isNew = false, fullscreen = false, onToggleFullscreen, showHelpTab = true, onTabChange }: {
    flowId: string;
    isNew?: boolean;
    fullscreen?: boolean;
    onToggleFullscreen?: () => void;
    /** Hilfe als interner Tab (true) oder ausgelagert ins Detailfenster (false). */
    showHelpTab?: boolean;
    /** Meldet den aktuell geöffneten Fach-Tab nach außen (für externes Hilfe-Panel). */
    onTabChange?: (tab: FuncTab) => void;
}): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const enabledModules = useEnabledModules();
    const hasSchutz = enabledModules.has('schutzkonzept' as never);

    const [tab, setTabRaw] = useState<Tab>('overview');
    // Hilfe/Kontext bezieht sich immer auf den zuletzt geöffneten Fach-Tab.
    const [lastFunc, setLastFunc] = useState<FuncTab>('overview');
    const setTab = useCallback((nx: Tab) => {
        if (nx !== 'help') { setLastFunc(nx as FuncTab); onTabChange?.(nx as FuncTab); }
        setTabRaw(nx);
    }, [onTabChange]);
    const [help, setHelp] = useState<{ items: Record<string, { body: string; updatedAt: string; updatedBy: string | null }>; canEdit: boolean } | null>(null);
    const [data, setData] = useState<ConceptCockpit | null>(null);
    const [sk, setSk] = useState<SchutzkonzeptView | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [dlg, setDlg] = useState<Dlg | null>(null);
    const { spaces } = useSpaces();
    const [userTypes, setUserTypes] = useState<{ value: string; label: string }[]>([]);
    const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
    const [documents, setDocuments] = useState<{ value: string; label: string }[]>([]);
    const [openP, setOpenP] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!jwt || !flowId) return;
        try {
            setData(await conceptCockpitGateway.cockpit(jwt, flowId));
            if (hasSchutz) { try { setSk(await conceptCockpitGateway.schutzkonzept(jwt, flowId)); } catch { /* Modul evtl. nicht erreichbar */ } }
            try {
                const ut = await spaceGovernanceGateway.listUserTypes(jwt);
                setUserTypes(ut.userTypes.map(u => ({ value: u.key, label: u.label })));
            } catch { /* Benutzertypen optional */ }
            try {
                const us = await platformGateway.getUsers(jwt);
                setUsers(us.users.map(u => ({ value: u.id, label: u.displayName || u.username })));
            } catch { /* Personen optional */ }
            try {
                const dl = await projectGateway.listAllDocuments(jwt, { limit: 100, sort: 'date', order: 'desc' });
                setDocuments(dl.documents.map((d: { id: string; title: string; spaceName?: string }) => ({ value: d.id, label: d.spaceName ? `${d.title} (${d.spaceName})` : d.title })));
            } catch { /* Dokumente optional */ }
            setErr(null);
        } catch (e) { setErr(e instanceof Error ? e.message : t('verankerung.loadFailed', { defaultValue: 'Laden fehlgeschlagen' })); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt, flowId, hasSchutz]);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        if (!jwt) return;
        conceptCockpitGateway.listHelp(jwt).then(setHelp).catch(() => { /* Hilfe optional */ });
    }, [jwt]);

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true); setErr(null);
        try { await fn(); await load(); }
        catch (e) { setErr(e instanceof Error ? e.message : t('verankerung.actionFailed', { defaultValue: 'Aktion fehlgeschlagen' })); }
        finally { setBusy(false); }
    };

    const TABS: { key: Tab; label: string; icon: string }[] = [
        { key: 'overview', label: t('verankerung.tab.overview', { defaultValue: 'Übersicht' }), icon: 'dashboard' },
        { key: 'practice', label: t('verankerung.tab.practice', { defaultValue: 'Praxisbausteine' }), icon: 'widgets' },
        { key: 'targets', label: t('verankerung.tab.targets', { defaultValue: 'Zielgruppen' }), icon: 'groups' },
        { key: 'evaluation', label: t('verankerung.tab.evaluation', { defaultValue: 'Evaluation / Pulse' }), icon: 'event_repeat' },
        { key: 'score', label: t('verankerung.tab.score', { defaultValue: 'Score' }), icon: 'insights' },
        { key: 'schutz', label: t('verankerung.tab.schutz', { defaultValue: 'Schutzkonzept' }), icon: 'verified_user' },
        { key: 'agencies', label: t('verankerung.tab.agencies', { defaultValue: 'Fachstellen' }), icon: 'contacts' },
        { key: 'report', label: t('verankerung.tab.report', { defaultValue: 'Nachweisbericht' }), icon: 'description' },
        { key: 'gates', label: t('verankerung.tab.gates', { defaultValue: 'Freigaben & Gates' }), icon: 'lock' },
        ...(showHelpTab ? [{ key: 'help' as Tab, label: t('verankerung.tab.help', { defaultValue: 'Hilfe & Kontext' }), icon: 'help' }] : []),
    ];
    const labelOf = (k: Tab) => TABS.find(x => x.key === k)?.label ?? k;

    if (!flowId) return <div className="p-6 text-sm text-muted-foreground">{t('verankerung.noConcept', { defaultValue: 'Kein Konzept angegeben.' })}</div>;
    if (err && !data) return <div className="p-6 text-sm text-destructive">{err}</div>;
    if (!data) return <div className="p-6 text-sm text-muted-foreground">{t('verankerung.loading', { defaultValue: 'Laden…' })}</div>;

    // Saubere Score-Sprache: vier klar getrennte Zustände.
    const dim = (v: number | null | undefined, kind: 'measured' | 'p1null' | 'phase' = 'measured'): string => {
        if (kind === 'p1null') return t('verankerung.score.p1NotCollected', { defaultValue: 'noch nicht erhoben' });
        if (kind === 'phase') return t('verankerung.score.laterPhase', { defaultValue: 'spätere Phase' });
        if (v === null || v === undefined) {
            return data.score
                ? (data.score.suppressed && data.score.suppressionReason === 'cohort_too_small'
                    ? t('verankerung.score.tooFewData', { defaultValue: 'zu wenig Daten' })
                    : t('verankerung.score.notMeasurable', { defaultValue: 'nicht messbar' }))
                : t('verankerung.score.notComputed', { defaultValue: 'noch nicht berechnet' });
        }
        return `${v} %`;
    };

    const STATUS_LABEL: Record<string, string> = {
        entwurf: t('verankerung.st.entwurf', { defaultValue: 'Entwurf' }),
        in_bearbeitung: t('verankerung.st.bearbeitung', { defaultValue: 'in Bearbeitung' }),
        bereit_zur_beschlussfassung: t('verankerung.st.bereit', { defaultValue: 'bereit zur Beschlussfassung' }),
        beschlossen: t('verankerung.st.beschlossen', { defaultValue: 'beschlossen' }),
        in_umsetzung: t('verankerung.st.umsetzung', { defaultValue: 'in Umsetzung' }),
        review_faellig: t('verankerung.st.review', { defaultValue: 'Review fällig' }),
        archiviert: t('verankerung.st.archiviert', { defaultValue: 'archiviert' }),
    };
    const statusClass = (s: string): string =>
        s === 'review_faellig' ? 'border-amber-300/50 bg-amber-50/60 text-amber-800'
            : s === 'beschlossen' || s === 'in_umsetzung' ? 'border-primary/30 bg-primary/10 text-primary'
            : s === 'archiviert' ? 'border-border bg-muted text-muted-foreground'
            : 'border-border bg-muted/50 text-foreground';
    const dec = data.decision;
    const setOverride = (v: string) =>
        void run(() => conceptCockpitGateway.patchConcept(jwt, flowId, { statusOverride: (v || 'auto') as never }));
    const goAction = () => {
        if (!dec.nextAction) return;
        if (dec.nextAction.key === 'reactivate') { void run(() => conceptCockpitGateway.patchConcept(jwt, flowId, { status: 'active' })); return; }
        setTab(dec.nextAction.tab as Tab);
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-0.5 border-b px-1.5">
                <div className="flex flex-1 items-center gap-0.5 overflow-x-auto">
                    {TABS.map(x => (
                        <button key={x.key} onClick={() => setTab(x.key)} title={x.label}
                            className={`relative flex size-8 shrink-0 items-center justify-center rounded-md transition-colors ${tab === x.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                            <MaterialIcon name={x.icon} size={18} />
                        </button>
                    ))}
                </div>
                {onToggleFullscreen && (
                    <button onClick={onToggleFullscreen} title={fullscreen ? t('verankerung.columnView', { defaultValue: 'Spaltenansicht' }) : t('verankerung.fullscreen', { defaultValue: 'Vollbild' })}
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <MaterialIcon name={fullscreen ? 'close_fullscreen' : 'open_in_full'} size={18} />
                    </button>
                )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl p-4 sm:p-6">
                    <div className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
                        <MaterialIcon name="account_tree" size={16} />
                        <span className="font-medium text-foreground">{data.name || t('verankerung.conceptHeading', { defaultValue: 'Konzept' })}</span>
                        <code className="truncate">{data.anchor.conceptFlowId}</code>
                    </div>
                    {err && <div className="mb-3 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive">{err}</div>}

            {tab === 'overview' && (
                <>
                {isNew && (
                    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-[13px]">
                        {t('verankerung.created', { defaultValue: 'Konzept angelegt. Hier sind deine nächsten sinnvollen Schritte:' })}
                    </div>
                )}
                {/* Cockpit: Status + nächste Handlung + offene Punkte + Review */}
                <div className="mb-3 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${statusClass(dec.status)}`}>
                            {STATUS_LABEL[dec.status] ?? dec.status}
                        </span>
                        <select disabled={busy} value={dec.statusOverridden ? dec.status : ''}
                            onChange={e => setOverride(e.target.value)}
                            className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            <option value="">{t('verankerung.st.auto', { defaultValue: 'automatisch' })}</option>
                            {['entwurf', 'in_bearbeitung', 'bereit_zur_beschlussfassung', 'beschlossen', 'in_umsetzung', 'review_faellig'].map(s => (
                                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                            ))}
                        </select>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{dec.statusReason}</p>
                    {dec.reviewDue.due && (
                        <div className={`mt-2 flex items-center gap-1.5 rounded px-2 py-1 text-[12px] ${dec.reviewDue.overdue ? 'bg-amber-50/60 text-amber-800' : 'bg-muted/50 text-muted-foreground'}`}>
                            <MaterialIcon name={dec.reviewDue.overdue ? 'warning' : 'event'} size={14} />
                            {dec.reviewDue.overdue
                                ? t('verankerung.reviewOverdue', { defaultValue: 'Überprüfung überfällig — bitte Evaluation/Wiedervorlage durchführen.' })
                                : t('verankerung.reviewMissing', { defaultValue: 'Noch keine nächste Überprüfung terminiert.' })}
                        </div>
                    )}
                    {(() => {
                        const dated = data.nudges.filter(n => n.dueDate);
                        if (dated.length === 0) return null;
                        const next = dated.map(n => new Date(n.dueDate!).getTime()).sort((a, b) => a - b)[0];
                        const od = next < Date.now();
                        return (
                            <button onClick={() => setTab('evaluation')}
                                className="mt-2 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-muted/50">
                                <MaterialIcon name="event_repeat" size={14} />
                                {t('verankerung.wvNextLabel', { defaultValue: 'Nächste Wiedervorlage' })}: <b className={od ? 'text-amber-800' : ''}>{new Date(next).toLocaleDateString()}</b>
                                <span className="text-[11px] text-primary">{t('verankerung.editAction', { defaultValue: 'bearbeiten →' })}</span>
                            </button>
                        );
                    })()}
                    {dec.nextAction && (
                        <button disabled={busy} onClick={goAction}
                            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-left text-[13px] hover:bg-primary/10 disabled:opacity-50">
                            <MaterialIcon name="play_circle" size={18} className="text-primary" />
                            <span className="flex-1">
                                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{t('verankerung.nextAction', { defaultValue: 'Nächste sinnvolle Handlung' })}</span>
                                <b>{dec.nextAction.label}</b>
                            </span>
                            <MaterialIcon name="arrow_forward" size={16} className="text-primary" />
                        </button>
                    )}
                    {dec.openPoints.length > 0 && (
                        <div className="mt-2">
                            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{t('verankerung.openPoints', { defaultValue: 'Offene Punkte' })}</div>
                            <ul className="space-y-0.5 text-[12px] text-muted-foreground">
                                {dec.openPoints.map(p => (
                                    <li key={p} className="flex items-start gap-1.5">
                                        <MaterialIcon name="radio_button_unchecked" size={13} className="mt-0.5" /><span>{p}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
                <div className="mb-3 rounded-lg border border-border p-3 text-[13px]">
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('verankerung.progress', { defaultValue: 'Nächste Schritte — was als Nächstes zu tun ist' })}
                    </div>
                    {([
                        { done: data.responsibilities.length > 0, label: t('verankerung.step.resp', { defaultValue: 'Verantwortliche bestätigen' }), go: 'targets' as Tab },
                        { done: data.targetGroups.length > 0, label: t('verankerung.step.targets', { defaultValue: 'Zielgruppen prüfen' }), go: 'targets' as Tab },
                        { done: data.practice.length > 0, label: t('verankerung.step.practice', { defaultValue: 'Erste Praxisbausteine bearbeiten' }), go: 'practice' as Tab },
                        { done: !!sk && (sk.summary.fulfilled > 0 || sk.summary.not_applicable > 0), label: t('verankerung.step.check', { defaultValue: 'Pflichtcheck starten' }), go: 'schutz' as Tab },
                        { done: !!sk?.adoption && sk.adoption.status === 'adopted', label: t('verankerung.step.adopt', { defaultValue: 'Beschluss vorbereiten' }), go: 'schutz' as Tab },
                        { done: data.surveys.length > 0 || data.nudges.length > 0, label: t('verankerung.step.eval', { defaultValue: 'Erste Evaluation / Wiedervorlage terminieren' }), go: 'evaluation' as Tab },
                    ]).map(s => (
                        <button key={s.label} onClick={() => setTab(s.go)}
                            className="flex w-full items-center gap-2 rounded py-0.5 text-left hover:bg-muted/50">
                            <MaterialIcon name={s.done ? 'check_circle' : 'radio_button_unchecked'} size={16}
                                className={s.done ? 'text-primary' : 'text-muted-foreground'} />
                            <span className={`flex-1 ${s.done ? '' : 'text-muted-foreground'}`}>{s.label}</span>
                            {!s.done && <span className="text-[11px] text-primary">{t('verankerung.openAction', { defaultValue: 'öffnen →' })}</span>}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
                    <div className="rounded border border-border p-2">{t('verankerung.tab.score', { defaultValue: 'Score' })}: <b>{dim(data.score?.gesamtValue)}</b></div>
                    <div className="rounded border border-border p-2">{t('verankerung.tile.requirement', { defaultValue: 'Pflichtcheck' })}: {sk ? `${sk.summary.fulfilled}/${sk.summary.total}` : (hasSchutz ? '–' : t('verankerung.moduleOff', { defaultValue: 'Modul nicht aktiviert' }))}</div>
                    <div className="rounded border border-border p-2">{t('verankerung.tile.adoption', { defaultValue: 'Beschluss' })}: {sk?.adoption ? sk.adoption.status : t('verankerung.noAdoption', { defaultValue: 'kein Beschluss' })}</div>
                    <div className="rounded border border-border p-2">{t('verankerung.tab.practice', { defaultValue: 'Praxisbausteine' })}: {data.practice.length}</div>
                    <div className="rounded border border-border p-2">{t('verankerung.tab.targets', { defaultValue: 'Zielgruppen' })}: {data.targetGroups.length}</div>
                    <div className="rounded border border-border p-2">{t('verankerung.tile.agencies', { defaultValue: 'Fachstellen' })}: {sk?.agencyLinks.length ?? 0}</div>
                </div>
                </>
            )}

            {tab === 'practice' && (
                <div className="space-y-2 text-[13px]">
                    <p className="text-[12px] text-muted-foreground">{t('verankerung.help.practice', { defaultValue: 'Jeder Baustein hat drei Ebenen: Erklärung (worum geht es), Arbeitsschritte (was ist zu tun) und Aktionen (Aufgabe, Nachweis, Pulse). Erledigte, verknüpfte Bausteine fließen in die Dimension „Anwendung" des Scores ein.' })}</p>
                    {data.practice.map(p => {
                        const open = openP === p.id;
                        const expl = (p.body?.description ?? '').trim()
                            || t('verankerung.practice.genericExpl', { defaultValue: 'Dieser Baustein beschreibt eine konkrete Maßnahme des Konzepts. Inhalt und Umfang sind je nach Schule fachlich zu prüfen und lokal anzupassen.' });
                        const schritte = [
                            t('verankerung.practice.s1', { defaultValue: 'Verantwortliche und Geltungsbereich klären' }),
                            t('verankerung.practice.s2', { defaultValue: 'Maßnahme konkretisieren (lokal anzupassen, fachlich zu prüfen)' }),
                            t('verankerung.practice.s3', { defaultValue: 'Im Schulalltag umsetzen und verankern' }),
                            t('verankerung.practice.s4', { defaultValue: 'Nachweis/Dokument ablegen und mit dem Baustein verknüpfen' }),
                            t('verankerung.practice.s5', { defaultValue: 'Wiedervorlage / nächste Überprüfung terminieren' }),
                        ];
                        return (
                            <div key={p.id} className="rounded border border-border">
                                <button onClick={() => setOpenP(open ? null : p.id)}
                                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/40">
                                    <MaterialIcon name={open ? 'expand_more' : 'chevron_right'} size={16} className="text-muted-foreground" />
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{p.kind}</span>
                                    <span className="flex-1 truncate font-medium">{p.title}</span>
                                    {p.refType
                                        ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{t('verankerung.linked', { defaultValue: 'verknüpft' })}: {p.refType}</span>
                                        : <span className="text-[11px] text-muted-foreground">{t('verankerung.openState', { defaultValue: 'offen' })}</span>}
                                </button>
                                {open && (
                                    <div className="space-y-2.5 border-t border-border px-3 py-2.5">
                                        <div>
                                            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('verankerung.practice.lvl1', { defaultValue: '1 · Erklärung — Worum geht es?' })}</div>
                                            <p>{expl}</p>
                                        </div>
                                        <div>
                                            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('verankerung.practice.lvl2', { defaultValue: '2 · Arbeitsschritte — Was ist zu tun?' })}</div>
                                            <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground">
                                                {schritte.map(s => <li key={s}>{s}</li>)}
                                            </ol>
                                            <p className="mt-1 text-[11px] italic text-muted-foreground">{t('verankerung.practice.genericHint', { defaultValue: 'Generische Struktur — keine verbindliche Landes-/Rechtsvorgabe. Fachlich zu prüfen, lokal anzupassen.' })}</p>
                                        </div>
                                        <div>
                                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('verankerung.practice.lvl3', { defaultValue: '3 · Aktionen' })}</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                <button disabled={busy || !!p.refType} onClick={() => setDlg({ kind: 'materialize', practiceId: p.id, title: p.title })}
                                                    className="rounded-lg border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">{t('verankerung.asTask', { defaultValue: 'Als Aufgabe anlegen' })}</button>
                                                <button disabled={busy} onClick={() => setDlg({ kind: 'linkref', practiceId: p.id, title: p.title })}
                                                    className="rounded-lg border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">{t('verankerung.linkDoc', { defaultValue: 'Dokument / Nachweis verknüpfen' })}</button>
                                                <button disabled={busy} onClick={() => void run(() => conceptCockpitGateway.addSurvey(jwt, flowId, { anonymous: true }))}
                                                    className="rounded-lg border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">{t('verankerung.preparePulse', { defaultValue: 'Pulse vorbereiten (anonym)' })}</button>
                                                <button disabled title={t('verankerung.notWired', { defaultValue: 'Noch nicht verbunden' })}
                                                    className="rounded-lg border px-2 py-1 text-[11px] opacity-50">{t('verankerung.makeAppointment', { defaultValue: 'Termin erstellen' })} · {t('verankerung.notWired', { defaultValue: 'noch nicht verbunden' })}</button>
                                                {p.refType && (
                                                    <button disabled={busy} onClick={() => void run(() => conceptCockpitGateway.setPracticeRef(jwt, p.id, { refType: null, refId: null }))}
                                                        className="rounded-lg border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">{t('verankerung.unlink', { defaultValue: 'Verknüpfung lösen' })}</button>
                                                )}
                                                <button disabled={busy} onClick={() => { if (window.confirm(t('verankerung.confirmDelete', { defaultValue: 'Wirklich entfernen?' }))) void run(() => conceptCockpitGateway.deletePractice(jwt, p.id)); }}
                                                    className="rounded-lg border px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50">{t('verankerung.remove', { defaultValue: 'Baustein entfernen' })}</button>
                                            </div>
                                            {p.refType && <p className="mt-1 text-[11px] text-muted-foreground">{t('verankerung.currentlyLinked', { defaultValue: 'Aktuell verknüpft' })}: {p.refType} <code>{p.refId}</code></p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {data.practice.length === 0 && <div className="text-muted-foreground">{t('verankerung.noPractice', { defaultValue: 'Noch keine Praxisbausteine.' })}</div>}
                    <button disabled={busy} onClick={() => setDlg({ kind: 'practice' })}
                        className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ {t('verankerung.tab.practice', { defaultValue: 'Praxisbaustein' })}</button>
                </div>
            )}

            {tab === 'targets' && (
                <div className="space-y-2 text-[13px]">
                    <p className="text-[12px] text-muted-foreground">{t('verankerung.help.targets', { defaultValue: 'Für wen gilt das Konzept? Zielgruppen steuern, wessen Rückmeldungen zählen. Verantwortliche sind die „Paten", die das Konzept pflegen.' })}</p>
                    {data.targetGroups.map(g => <div key={g.id} className="rounded border border-border px-2.5 py-1.5">{g.scopeType}{g.userTypeKey ? ` · ${g.userTypeKey}` : ''}{g.spaceId ? ` · Space: ${spaces.find(s => s.id === g.spaceId)?.name ?? g.spaceId}` : ''}{g.responseRequired ? ` · ${t('verankerung.responseRequired', { defaultValue: 'Rückmeldung erforderlich' })}` : ''}</div>)}
                    {data.targetGroups.length === 0 && <div className="text-muted-foreground">{t('verankerung.noTargets', { defaultValue: 'Keine Zielgruppen.' })}</div>}
                    <button disabled={busy} onClick={() => setDlg({ kind: 'target' })} className="rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ {t('verankerung.tab.targets', { defaultValue: 'Zielgruppe' })}</button>
                    <div className="mt-2">
                        <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{t('verankerung.responsibles', { defaultValue: 'Verantwortliche' })}</div>
                        {data.responsibilities.map(r => <div key={r.id} className="rounded border border-border px-2.5 py-1.5">{r.userId} · {r.role}</div>)}
                        <button disabled={busy} onClick={() => setDlg({ kind: 'resp' })} className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ {t('verankerung.owner', { defaultValue: 'Verantwortliche:r' })}</button>
                    </div>
                </div>
            )}

            {tab === 'evaluation' && (
                <div className="space-y-2 text-[13px]">
                    <p className="text-[12px] text-muted-foreground">{t('verankerung.help.evaluation', { defaultValue: 'Erinnerungen halten Termine im Blick. Pulse-Evaluationen sind kurze, anonyme Rückmelderunden — es werden keine Einzelpersonen ausgewertet.' })}</p>
                    <div>
                        <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{t('verankerung.reminders', { defaultValue: 'Erinnerungen' })}</div>
                        {data.nudges.map(n => {
                            const overdue = !!n.dueDate && new Date(n.dueDate).getTime() < Date.now();
                            return (
                            <div key={n.id} className="group flex items-center gap-2 rounded border border-border px-2.5 py-1.5">
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{n.triggerType}</span>
                                <span className="flex-1 truncate">{n.message}
                                    {n.dueDate && (
                                        <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] ${overdue ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}`}>
                                            {overdue ? t('verankerung.wvOverdue', { defaultValue: 'überfällig seit' }) : t('verankerung.wvNext', { defaultValue: 'nächste Vorlage' })} {new Date(n.dueDate).toLocaleDateString()}
                                        </span>
                                    )}
                                </span>
                                <button disabled={busy} onClick={() => setDlg({ kind: 'editnudge', nudgeId: n.id, message: n.message, dueDate: n.dueDate })}
                                    className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary"><MaterialIcon name="edit" size={14} /></button>
                                <button disabled={busy} onClick={() => { if (window.confirm(t('verankerung.confirmDelete', { defaultValue: 'Wirklich entfernen?' }))) void run(() => conceptCockpitGateway.deleteNudge(jwt, n.id)); }}
                                    className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"><MaterialIcon name="delete" size={14} /></button>
                            </div>
                            );
                        })}
                        <button disabled={busy} onClick={() => setDlg({ kind: 'nudge' })} className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ {t('verankerung.reminderCalendar', { defaultValue: 'Wiedervorlage / Erinnerung' })}</button>
                        <p className="mt-1 text-[11px] text-muted-foreground">{t('verankerung.noChatScan', { defaultValue: 'Chat-/Inhaltsauswertung ist aus Datenschutzgründen nicht möglich.' })}</p>
                    </div>
                    <div>
                        <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{t('verankerung.pulse', { defaultValue: 'Pulse-Evaluationen' })}</div>
                        {data.surveys.map(s => <div key={s.id} className="rounded border border-border px-2.5 py-1.5">{s.formRef ? `Formular ${s.formRef}` : t('verankerung.notLinked', { defaultValue: 'noch nicht verknüpft' })} · {s.anonymous ? t('verankerung.anon', { defaultValue: 'anonym' }) : t('verankerung.notAnon', { defaultValue: 'nicht anonym' })}</div>)}
                        <button disabled={busy} onClick={() => void run(() => conceptCockpitGateway.addSurvey(jwt, flowId, { anonymous: true }))}
                            className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ {t('verankerung.pulseAnon', { defaultValue: 'Pulse-Evaluation (anonym)' })}</button>
                    </div>
                </div>
            )}

            {tab === 'score' && (
                <div className="space-y-2 text-[13px]">
                    <p className="text-[12px] text-muted-foreground">{t('verankerung.help.score', { defaultValue: 'Der Score ist eine Orientierung, kein Gütesiegel. Es wird nichts geschätzt — fehlt ein belegbares Signal, steht das ehrlich dort.' })}</p>
                    <button disabled={busy} onClick={() => void run(() => conceptCockpitGateway.recomputeScore(jwt, flowId))}
                        className="rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">{t('verankerung.recompute', { defaultValue: 'Score neu berechnen' })}</button>
                    <div className="rounded border border-border p-3">
                        <div className="text-2xl font-semibold">{dim(data.score?.gesamtValue)}</div>
                        <div className="text-[11px] text-muted-foreground">{t('verankerung.score.overall', { defaultValue: 'Gesamt — Mittel der messbaren Dimensionen' })}{data.score?.trend ? ` · ${data.score.trend}` : ''}</div>
                    </div>
                    {[
                        { l: t('verankerung.dim.bekanntheit', { defaultValue: 'Bekanntheit' }), v: dim(data.score?.bekanntheitValue), h: t('verankerung.dim.bekanntheitHelp', { defaultValue: 'Anteil, der das Konzept nachweislich zur Kenntnis genommen hat (nur belegbares Signal).' }) },
                        { l: t('verankerung.dim.anwendung', { defaultValue: 'Anwendung' }), v: dim(data.score?.anwendungValue), h: t('verankerung.dim.anwendungHelp', { defaultValue: 'Anteil erledigter, relevanter Praxis-Aufgaben.' }) },
                        { l: t('verankerung.dim.beteiligung', { defaultValue: 'Beteiligung' }), v: dim(data.score?.beteiligungValue), h: t('verankerung.dim.beteiligungHelp', { defaultValue: 'Pulse-Rücklauf gemessen an der Zielgruppen-Kohorte (k-anonym).' }) },
                        { l: t('verankerung.dim.verstaendnis', { defaultValue: 'Verständnis' }), v: dim(null, 'p1null'), h: t('verankerung.dim.verstaendnisHelp', { defaultValue: 'Wird erst mit Konzept-Verstehen (L8) erhoben — derzeit bewusst nicht erhoben.' }) },
                        { l: t('verankerung.dim.nachhaltig', { defaultValue: 'Nachhaltigkeit' }), v: dim(null, 'phase'), h: t('verankerung.dim.nachhaltigHelp', { defaultValue: 'Spätere Phase — keine Scheinmessung.' }) },
                    ].map(d => (
                        <div key={d.l} className="rounded border border-border p-2">
                            <div className="flex justify-between"><span>{d.l}</span><b>{d.v}</b></div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{d.h}</p>
                        </div>
                    ))}
                    {data.score?.suppressed && (
                        <div className="rounded border border-amber-300/40 bg-amber-50/40 px-2 py-1.5 text-[12px] text-amber-800">
                            {data.score.suppressionReason === 'cohort_too_small'
                                ? t('verankerung.score.suppressSmall', { defaultValue: 'Zu kleine Gruppe — aus Datenschutzgründen keine Auswertung (nie „0 %").' })
                                : t('verankerung.score.suppressNone', { defaultValue: 'Noch keine belegbaren Signale — es wird nichts geschätzt.' })}
                        </div>
                    )}
                </div>
            )}

            {tab === 'schutz' && (
                !hasSchutz ? (
                    <div className="rounded border border-amber-300/40 bg-amber-50/40 px-3 py-3 text-[13px] text-amber-800">
                        {t('verankerung.schutzOff', { defaultValue: 'Schutzkonzept-Modul ist für diesen Bereich nicht aktiviert. Aktivierung über Settings → Apps.' })}
                    </div>
                ) : !sk ? <div className="text-[13px] text-muted-foreground">{t('verankerung.loading', { defaultValue: 'Laden…' })}</div> : (
                    <div className="space-y-2 text-[13px]">
                        <p className="text-[12px] text-muted-foreground">{t('verankerung.help.schutz', { defaultValue: 'Pflichtbausteine intern als erfüllt/nicht zutreffend markieren (mit Begründung) und Nachweise verknüpfen. Beschlussstatus dokumentiert den Gremienbeschluss. Organisatorischer Stand, kein Rechtstestat.' })}</p>
                        <div className="rounded border border-amber-300/40 bg-amber-50/40 px-2 py-1.5 text-[12px] text-amber-800">{sk.disclaimer}</div>
                        <div className="text-[12px] text-muted-foreground">Katalog {sk.catalog.scope} v{sk.catalog.version} · {sk.summary.fulfilled} erfüllt / {sk.summary.open} offen / {sk.summary.not_applicable} n.z. von {sk.summary.total}</div>
                        {sk.items.map(it => (
                            <div key={it.checkId} className="rounded border border-border px-2.5 py-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="flex-1">{it.label}</span>
                                    <button disabled={busy} onClick={() => setDlg({ kind: 'reqcheck', checkId: it.checkId, label: it.label, status: it.status })}
                                        className={`rounded px-2 py-0.5 text-[11px] ${it.status === 'fulfilled' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                        {it.status === 'fulfilled' ? t('verankerung.fulfilled', { defaultValue: 'erfüllt' }) : it.status === 'not_applicable' ? t('verankerung.na', { defaultValue: 'n.z.' }) : t('verankerung.openState', { defaultValue: 'offen' })}
                                    </button>
                                </div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                    {it.evidenceRefType
                                        ? `${t('verankerung.evidence', { defaultValue: 'Nachweis' })}: ${it.evidenceRefType} ${it.evidenceRefId ?? ''}`
                                        : t('verankerung.evidenceMissing', { defaultValue: 'Nachweis fehlt' })}
                                    {it.notApplicableReason ? ` · ${it.notApplicableReason}` : ''}
                                </div>
                            </div>
                        ))}
                        <div className="rounded border border-border px-2.5 py-2">
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('verankerung.tile.adoption', { defaultValue: 'Beschlussstatus' })}</div>
                            {sk.adoption ? <div>{sk.adoption.status}{sk.adoption.isExpired ? ` · ${t('verankerung.expired', { defaultValue: 'abgelaufen' })}` : ''}{sk.adoption.gremium ? ` · ${sk.adoption.gremium}` : ''}</div> : <div className="text-muted-foreground">{t('verankerung.noAdoption', { defaultValue: 'kein Beschluss erfasst' })}</div>}
                            <button disabled={busy} onClick={() => setDlg({ kind: 'adoption' })} className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">{t('verankerung.setAdoption', { defaultValue: 'Beschlussstatus setzen' })}</button>
                        </div>
                    </div>
                )
            )}

            {tab === 'agencies' && (
                !hasSchutz ? (
                    <div className="rounded border border-amber-300/40 bg-amber-50/40 px-3 py-3 text-[13px] text-amber-800">{t('verankerung.schutzOff', { defaultValue: 'Schutzkonzept-Modul ist nicht aktiviert.' })}</div>
                ) : (
                    <div className="space-y-1.5 text-[13px]">
                        <p className="text-[12px] text-muted-foreground">{t('verankerung.help.agencies', { defaultValue: 'Externe Fachstellen organisatorisch als Ansprechpartner benennen. Über Prilog findet keine Fallkommunikation mit diesen Stellen statt.' })}</p>
                        {(sk?.agencyLinks ?? []).map(l => (
                            <div key={l.id} className="group flex items-center gap-2 rounded border border-border px-2.5 py-1.5">
                                <span className="flex-1">{l.agency.name} · {l.agency.kind} · {l.role}{l.agency.scope === 'global' ? ' · kuratiert' : ''}</span>
                                <button disabled={busy} onClick={() => { if (window.confirm(t('verankerung.confirmUnlink', { defaultValue: 'Fachstellen-Verknüpfung entfernen?' }))) void run(() => conceptCockpitGateway.unlinkAgency(jwt, l.id)); }}
                                    className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"><MaterialIcon name="delete" size={14} /></button>
                            </div>
                        ))}
                        {(sk?.agencyLinks.length ?? 0) === 0 && <div className="text-muted-foreground">{t('verankerung.noAgencies', { defaultValue: 'Keine Fachstelle benannt.' })}</div>}
                        <button disabled={busy} onClick={() => setDlg({ kind: 'agency' })} className="rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ {t('verankerung.addAgency', { defaultValue: 'Fachstelle anlegen & benennen' })}</button>
                        <p className="text-[11px] text-muted-foreground">{t('verankerung.agencyNote', { defaultValue: 'Nur organisatorische Benennung — keine Fallkommunikation, kein externer Zugriff.' })}</p>
                    </div>
                )
            )}

            {tab === 'report' && (() => {
                const userName = (id: string) => users.find(u => u.value === id)?.label ?? id;
                const tgLabel = (g: typeof data.targetGroups[number]) =>
                    g.scopeType + (g.userTypeKey ? ` · ${g.userTypeKey}` : '') + (g.spaceId ? ` · ${spaces.find(s => s.id === g.spaceId)?.name ?? g.spaceId}` : '');
                const asOf = new Date().toLocaleDateString();
                const Sec = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
                    <section className="kv-page mt-4 border-t border-border pt-3 first:mt-0 first:border-0 first:pt-0">
                        <h4 className="mb-1.5 text-[13px] font-semibold">{n}. {title}</h4>
                        <div className="text-[12px]">{children}</div>
                    </section>
                );
                return (
                <div className="space-y-3 text-[13px]">
                    <style>{`@media print{body *{visibility:hidden!important}#kv-report,#kv-report *{visibility:visible!important}#kv-report{position:absolute;left:0;top:0;width:100%;padding:24px;font-size:12px}.kv-no-print{display:none!important}#kv-report .kv-page{page-break-inside:avoid}#kv-report h3{font-size:18px}#kv-report h4{font-size:13px}}`}</style>
                    <div className="kv-no-print flex items-center gap-2">
                        <p className="flex-1 text-[12px] text-muted-foreground">
                            {t('verankerung.report.intro', { defaultValue: 'Konsolidierter Nachweis für Schulleitung / Steuergruppe / Schulaufsicht. Organisatorischer Stand — keine Rechtsprüfung.' })}
                        </p>
                        <button onClick={() => window.print()}
                            className="rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted">
                            {t('verankerung.report.print', { defaultValue: 'Drucken / PDF' })}
                        </button>
                    </div>
                    <div id="kv-report" className="rounded-lg border border-border p-5">
                        {/* 1 Deckblatt */}
                        <h3 className="text-lg font-semibold">{t('verankerung.report.title', { defaultValue: 'Nachweisbericht Konzept-Verankerung' })}</h3>
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px]">
                            <div><dt className="inline text-muted-foreground">{t('verankerung.report.conceptName', { defaultValue: 'Konzept' })}: </dt><dd className="inline font-medium">{data.name || data.anchor.conceptFlowId}</dd></div>
                            <div><dt className="inline text-muted-foreground">{t('verankerung.report.school', { defaultValue: 'Schule / Mandant' })}: </dt><dd className="inline italic text-muted-foreground">{t('verankerung.report.schoolPlaceholder', { defaultValue: 'lokal zu ergänzen' })}</dd></div>
                            <div><dt className="inline text-muted-foreground">{t('verankerung.report.asOf', { defaultValue: 'Stand' })}: </dt><dd className="inline">{asOf}</dd></div>
                            <div><dt className="inline text-muted-foreground">{t('verankerung.statusLabel', { defaultValue: 'Status' })}: </dt><dd className="inline font-medium">{STATUS_LABEL[dec.status] ?? dec.status}</dd></div>
                        </dl>
                        <p className="mt-2 rounded bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
                            {t('verankerung.report.coverDisclaimer', { defaultValue: 'Organisatorischer Arbeitsstand. Kein Rechtstestat, keine Schulaufsichtsentscheidung, keine Kinderschutzgarantie.' })}
                        </p>

                        <Sec n={2} title={t('verankerung.report.s2', { defaultValue: 'Zusammenfassung' })}>
                            <ul className="space-y-0.5">
                                <li>{t('verankerung.statusLabel', { defaultValue: 'Status' })}: <b>{STATUS_LABEL[dec.status] ?? dec.status}</b> — {dec.statusReason}</li>
                                <li>{t('verankerung.tab.score', { defaultValue: 'Score' })}: {dim(data.score?.gesamtValue)}{data.score?.trend ? ` · ${data.score.trend}` : ''}</li>
                                <li>{t('verankerung.nextAction', { defaultValue: 'Nächste Handlung' })}: {dec.nextAction ? dec.nextAction.label : t('verankerung.allCurrent', { defaultValue: 'alles aktuell' })}</li>
                                <li>{t('verankerung.openPoints', { defaultValue: 'Offene Punkte' })}: {dec.openPoints.length ? dec.openPoints.join(' · ') : '–'}</li>
                                <li>{t('verankerung.report.reviewState', { defaultValue: 'Review-Fälligkeit' })}: {dec.reviewDue.overdue ? t('verankerung.wvOverdue', { defaultValue: 'überfällig' }) : dec.reviewDue.due ? t('verankerung.reviewMissing', { defaultValue: 'nicht terminiert' }) : t('verankerung.report.ok', { defaultValue: 'aktuell' })}</li>
                            </ul>
                        </Sec>

                        <Sec n={3} title={t('verankerung.report.s3', { defaultValue: 'Verantwortliche & Zielgruppen' })}>
                            <div className="font-medium">{t('verankerung.responsibles', { defaultValue: 'Verantwortliche' })}</div>
                            {data.responsibilities.length
                                ? <ul className="ml-4 list-disc">{data.responsibilities.map(r => <li key={r.id}>{userName(r.userId)} — {r.role}</li>)}</ul>
                                : <div className="text-amber-700">{t('verankerung.report.missingResp', { defaultValue: '⚠ Keine Verantwortlichen benannt.' })}</div>}
                            <div className="mt-1 font-medium">{t('verankerung.tab.targets', { defaultValue: 'Zielgruppen' })}</div>
                            {data.targetGroups.length
                                ? <ul className="ml-4 list-disc">{data.targetGroups.map(g => <li key={g.id}>{tgLabel(g)}{g.responseRequired ? ` · ${t('verankerung.responseRequired', { defaultValue: 'Rückmeldung erforderlich' })}` : ''}</li>)}</ul>
                                : <div className="text-amber-700">{t('verankerung.report.missingTg', { defaultValue: '⚠ Keine Zielgruppen festgelegt.' })}</div>}
                        </Sec>

                        <Sec n={4} title={`${t('verankerung.tab.practice', { defaultValue: 'Praxisbausteine' })} (${data.practice.length})`}>
                            {data.practice.length
                                ? <table className="w-full border-collapse text-[11px]">
                                    <thead><tr className="border-b border-border text-left text-muted-foreground">
                                        <th className="py-0.5 pr-2">{t('verankerung.fieldTitle', { defaultValue: 'Baustein' })}</th>
                                        <th className="py-0.5 pr-2">{t('verankerung.fieldKind', { defaultValue: 'Art' })}</th>
                                        <th className="py-0.5">{t('verankerung.linked', { defaultValue: 'verknüpft' })}</th>
                                    </tr></thead>
                                    <tbody>{data.practice.map(p => (
                                        <tr key={p.id} className="border-b border-border/50">
                                            <td className="py-0.5 pr-2">{p.title}</td>
                                            <td className="py-0.5 pr-2">{p.kind}</td>
                                            <td className="py-0.5">{p.refType ? `${p.refType}` : t('verankerung.report.noLink', { defaultValue: 'offen' })}</td>
                                        </tr>))}</tbody>
                                </table>
                                : <div className="text-muted-foreground">–</div>}
                        </Sec>

                        <Sec n={5} title={t('verankerung.report.s5', { defaultValue: 'Pflichtcheck / Schutzkonzept' })}>
                            {!hasSchutz ? <div className="text-muted-foreground">{t('verankerung.moduleOff', { defaultValue: 'Modul nicht aktiviert' })}</div>
                                : sk ? <>
                                    <div>{sk.summary.fulfilled} erfüllt · {sk.summary.open} offen · {sk.summary.not_applicable} n.z. {t('verankerung.report.of', { defaultValue: 'von' })} {sk.summary.total}</div>
                                    <ul className="ml-4 mt-1 list-disc">{sk.items.map(it => (
                                        <li key={it.checkId}>{it.label} — <b>{it.status}</b>{it.notApplicableReason ? ` (${it.notApplicableReason})` : ''}{it.evidenceRefType ? ` · ${t('verankerung.evidence', { defaultValue: 'Nachweis' })}: ${it.evidenceRefType}` : ` · ${t('verankerung.evidenceMissing', { defaultValue: 'Nachweis fehlt' })}`}</li>
                                    ))}</ul>
                                    <p className="mt-1 text-[11px] italic text-muted-foreground">{t('verankerung.report.checkNote', { defaultValue: 'Organisatorische Markierung, kein Rechtstestat.' })}</p>
                                </> : <div className="text-muted-foreground">–</div>}
                        </Sec>

                        <Sec n={6} title={t('verankerung.report.s6', { defaultValue: 'Beschluss & Gültigkeit' })}>
                            {sk?.adoption ? <ul className="ml-4 list-disc">
                                <li>{t('verankerung.statusLabel', { defaultValue: 'Status' })}: {sk.adoption.status}{sk.adoption.isExpired ? ` · ${t('verankerung.expired', { defaultValue: 'abgelaufen' })}` : ''}</li>
                                <li>{t('verankerung.gremium', { defaultValue: 'Gremium' })}: {sk.adoption.gremium ?? '–'}</li>
                                <li>{t('verankerung.report.decidedAt', { defaultValue: 'Beschlossen am' })}: {sk.adoption.decidedAt ? new Date(sk.adoption.decidedAt).toLocaleDateString() : '–'}</li>
                                <li>{t('verankerung.report.validUntil', { defaultValue: 'Gültig bis' })}: {sk.adoption.validUntil ? new Date(sk.adoption.validUntil).toLocaleDateString() : '–'}</li>
                                <li>{t('verankerung.report.resolutionRef', { defaultValue: 'Beschlussbeleg' })}: {sk.adoption.resolutionRef ?? <span className="text-amber-700">{t('verankerung.report.missingBeleg', { defaultValue: '⚠ fehlt' })}</span>}</li>
                            </ul> : <div className="text-amber-700">{t('verankerung.report.noAdoptionWarn', { defaultValue: '⚠ Kein Beschluss erfasst — Beschlussdokument fehlt.' })}</div>}
                        </Sec>

                        <Sec n={7} title={t('verankerung.tile.agencies', { defaultValue: 'Fachstellen' })}>
                            {(sk?.agencyLinks?.length ?? 0)
                                ? <ul className="ml-4 list-disc">{sk!.agencyLinks.map(l => <li key={l.id}>{l.agency.name} · {l.agency.kind} · {l.role}{l.agency.contact ? ` · ${l.agency.contact}` : ''}</li>)}</ul>
                                : <div className="text-muted-foreground">{t('verankerung.noAgencies', { defaultValue: 'Keine Fachstelle benannt.' })}</div>}
                            <p className="mt-1 text-[11px] italic text-muted-foreground">{t('verankerung.report.agencyNote', { defaultValue: 'Nur organisatorische Benennung — keine Fallkommunikation.' })}</p>
                        </Sec>

                        <Sec n={8} title={t('verankerung.report.s8', { defaultValue: 'Evaluation / Pulse / Wiedervorlage' })}>
                            <div className="font-medium">{t('verankerung.reminders', { defaultValue: 'Wiedervorlagen / Erinnerungen' })}</div>
                            {data.nudges.length
                                ? <ul className="ml-4 list-disc">{data.nudges.map(n => {
                                    const od = !!n.dueDate && new Date(n.dueDate).getTime() < Date.now();
                                    return <li key={n.id}>{n.message}{n.dueDate ? ` — ${od ? '⚠ ' : ''}${new Date(n.dueDate).toLocaleDateString()}${od ? ` (${t('verankerung.wvOverdue', { defaultValue: 'überfällig' })})` : ''}` : ''}</li>;
                                })}</ul>
                                : <div className="text-muted-foreground">–</div>}
                            <div className="mt-1 font-medium">{t('verankerung.pulse', { defaultValue: 'Pulse-Evaluationen' })}</div>
                            <div className="text-muted-foreground">{data.surveys.length ? `${data.surveys.length} ${t('verankerung.report.pulseCount', { defaultValue: 'Runde(n) angelegt' })}` : '–'}</div>
                        </Sec>

                        <Sec n={9} title={t('verankerung.openPoints', { defaultValue: 'Offene Punkte' })}>
                            {dec.openPoints.length
                                ? <ul className="ml-4 list-disc">{dec.openPoints.map(p => <li key={p}>{p}</li>)}</ul>
                                : <div className="text-muted-foreground">{t('verankerung.report.nothingOpen', { defaultValue: 'Keine offenen Punkte erfasst.' })}</div>}
                        </Sec>

                        <Sec n={10} title={t('verankerung.report.s10', { defaultValue: 'Hinweis / Disclaimer' })}>
                            <p className="text-[11px] text-muted-foreground">
                                {t('verankerung.report.disclaimerFull', { defaultValue: 'Dieser Bericht dokumentiert einen organisatorischen Arbeitsstand. Er ist kein Rechtstestat, keine Schulaufsichtsentscheidung und keine Kinderschutzgarantie. Fachlich/rechtlich verbindliche Inhalte sind je nach Bundesland gesondert zu prüfen und lokal anzupassen. Beschlussbelege ggf. eIDAS-signiert im DMS.' })}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{t('verankerung.report.asOf', { defaultValue: 'Stand' })}: {asOf}</p>
                        </Sec>
                    </div>
                </div>
                );
            })()}

            {tab === 'gates' && (
                <div className="space-y-2 text-[13px]">
                    <div className="rounded border border-border px-2.5 py-2">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('verankerung.activeModules', { defaultValue: 'Aktive Module' })}</div>
                        <div>Core-Verankerung · {t('verankerung.active', { defaultValue: 'aktiv' })}</div>
                        <div>Schutzkonzept (Pflichtcheck / Beschluss / Fachstellen) · {hasSchutz ? t('verankerung.active', { defaultValue: 'aktiv' }) : t('verankerung.moduleOff', { defaultValue: 'Modul nicht aktiviert' })}</div>
                    </div>
                    <div className="rounded border border-amber-300/40 bg-amber-50/40 px-2.5 py-2">
                        <div className="text-[11px] uppercase tracking-wider text-amber-800">{t('verankerung.lockedTillRelease', { defaultValue: 'Gesperrt bis Freigabe (DSB)' })}</div>
                        {GATED.map(m => (
                            <div key={m.label} className="flex items-center justify-between gap-2 py-0.5">
                                <span>{m.label}</span>
                                <a href={m.doc} target="_blank" rel="noreferrer" className="text-[12px] text-primary hover:underline">DSFA-Dok</a>
                            </div>
                        ))}
                        <p className="mt-1 text-[11px] text-amber-800">{t('verankerung.gateNote', { defaultValue: 'Bau erst nach dokumentiertem DSB-Freigabevermerk — bewusst gesperrt, kein „kommt bald".' })}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t('verankerung.orgStatusOnly', { defaultValue: 'Alle Anzeigen sind organisatorischer Status — keine Rechtsprüfung, keine Kinderschutzgarantie, keine automatische Bewertung.' })}</p>
                </div>
            )}

            {tab === 'help' && (
                <HelpPanel
                    t={t} jwt={jwt}
                    topic={lastFunc}
                    topicLabel={labelOf(lastFunc)}
                    help={help}
                    onSaved={(items) => setHelp(h => h ? { ...h, items } : h)}
                />
            )}

            {dlg && <DetailDialog dlg={dlg} t={t} busy={busy} onClose={() => setDlg(null)}
                onDone={async (fn) => { setDlg(null); await run(fn); }} jwt={jwt} flowId={flowId}
                pickers={{
                    userTypes,
                    users,
                    spaces: spaces.map(s => ({ value: s.id, label: s.name })),
                    practice: data.practice.map(p => ({ value: p.id, label: p.title })),
                    documents,
                }} />}
                </div>
            </div>
        </div>
    );
}

// ─── Hilfe & Kontext: themenbezogen, Operator editiert, sonst read-only ─────
export function HelpPanel({ t, jwt, topic, topicLabel, help, onSaved }: {
    t: (k: string, o?: Record<string, unknown>) => string;
    jwt: string;
    topic: string;
    topicLabel: string;
    help: { items: Record<string, { body: string; updatedAt: string; updatedBy: string | null }>; canEdit: boolean } | null;
    onSaved: (items: Record<string, { body: string; updatedAt: string; updatedBy: string | null }>) => void;
}): JSX.Element {
    const topicKey = `verankerung.${topic}`;
    const entry = help?.items[topicKey];
    const [draft, setDraft] = useState(entry?.body ?? '');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    useEffect(() => { setDraft(entry?.body ?? ''); setEditing(false); setMsg(null); }, [topicKey, entry?.body]);

    const canEdit = !!help?.canEdit;
    const save = async () => {
        setSaving(true); setMsg(null);
        try {
            await conceptCockpitGateway.setHelp(jwt, topicKey, draft);
            onSaved({ ...(help?.items ?? {}), [topicKey]: { body: draft, updatedAt: new Date().toISOString(), updatedBy: null } });
            setEditing(false);
            setMsg(t('verankerung.help.saved', { defaultValue: 'Gespeichert.' }));
        } catch (e) {
            setMsg(e instanceof Error ? e.message : t('verankerung.help.saveFailed', { defaultValue: 'Speichern fehlgeschlagen' }));
        } finally { setSaving(false); }
    };

    return (
        <div className="space-y-3 text-[13px]">
            <div className="flex items-center gap-2">
                <MaterialIcon name="help" size={18} className="text-primary" />
                <h3 className="text-base font-semibold">{t('verankerung.help.heading', { defaultValue: 'Hilfe & Kontext' })}</h3>
                <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">{topicLabel}</span>
            </div>
            <p className="text-[12px] text-muted-foreground">
                {t('verankerung.help.intro', { defaultValue: 'Kontext zum gerade geöffneten Bereich. Wird zentral vom Prilog-Betreiber gepflegt und ist für alle Schulen sichtbar — kein personenbezogener Inhalt, kein Rechtstestat.' })}
            </p>

            {!canEdit && !editing && (
                entry?.body
                    ? <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3">{entry.body}</div>
                    : <div className="rounded-lg border border-dashed border-border p-3 text-muted-foreground">{t('verankerung.help.empty', { defaultValue: 'Für diesen Bereich ist noch kein Hilfetext hinterlegt.' })}</div>
            )}

            {canEdit && !editing && (
                <>
                    {entry?.body
                        ? <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3">{entry.body}</div>
                        : <div className="rounded-lg border border-dashed border-border p-3 text-muted-foreground">{t('verankerung.help.emptyAdmin', { defaultValue: 'Noch kein Hilfetext — als Betreiber kannst du hier Kontext hinterlegen.' })}</div>}
                    <button onClick={() => setEditing(true)}
                        className="rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted">
                        {entry?.body ? t('verankerung.help.edit', { defaultValue: 'Hilfetext bearbeiten' }) : t('verankerung.help.add', { defaultValue: 'Hilfetext hinzufügen' })}
                    </button>
                </>
            )}

            {canEdit && editing && (
                <div className="space-y-2">
                    <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={12}
                        className="w-full rounded-lg border border-border bg-background p-2 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                        placeholder={t('verankerung.help.placeholder', { defaultValue: 'Hilfe-/Kontexttext zu diesem Bereich (für alle Schulen sichtbar). Keine verbindlichen Rechts-/Landesvorgaben erfinden.' })} />
                    <div className="flex items-center gap-2">
                        <button disabled={saving} onClick={save}
                            className="rounded-lg bg-primary px-3 py-1.5 text-[12px] text-primary-foreground hover:opacity-90 disabled:opacity-50">
                            {t('verankerung.help.save', { defaultValue: 'Speichern' })}
                        </button>
                        <button disabled={saving} onClick={() => { setDraft(entry?.body ?? ''); setEditing(false); }}
                            className="rounded-lg border px-3 py-1.5 text-[12px] hover:bg-muted disabled:opacity-50">
                            {t('verankerung.help.cancel', { defaultValue: 'Abbrechen' })}
                        </button>
                    </div>
                </div>
            )}

            {msg && <div className="text-[12px] text-muted-foreground">{msg}</div>}
            {entry?.updatedAt && (
                <p className="text-[11px] text-muted-foreground">
                    {t('verankerung.help.lastChanged', { defaultValue: 'Zuletzt geändert' })}: {new Date(entry.updatedAt).toLocaleString()}
                </p>
            )}
        </div>
    );
}

function DetailDialog({ dlg, t, busy, onClose, onDone, jwt, flowId, pickers }: {
    dlg: Dlg; t: (k: string, o?: Record<string, unknown>) => string; busy: boolean;
    onClose: () => void; onDone: (fn: () => Promise<unknown>) => Promise<void>; jwt: string; flowId: string;
    pickers: Pickers;
}): JSX.Element {
    const g = conceptCockpitGateway;
    let title = ''; let fields: FieldDef[] = []; let submit: (v: Record<string, string>) => Promise<unknown> = async () => undefined;

    if (dlg.kind === 'practice') {
        title = t('verankerung.tab.practice', { defaultValue: 'Praxisbaustein' });
        fields = [
            { name: 'title', label: t('verankerung.fieldTitle', { defaultValue: 'Titel' }), required: true },
            { name: 'kind', label: t('verankerung.fieldKind', { defaultValue: 'Art' }), type: 'select', options: [
                { value: 'checklist', label: t('verankerung.kind.checklist', { defaultValue: 'Checkliste' }) },
                { value: 'task', label: t('verankerung.kind.task', { defaultValue: 'Aufgabe' }) },
                { value: 'routine', label: t('verankerung.kind.routine', { defaultValue: 'Routine' }) },
                { value: 'appointment', label: t('verankerung.kind.appointment', { defaultValue: 'Termin' }) },
                { value: 'info', label: t('verankerung.kind.info', { defaultValue: 'Information / Material' }) },
                { value: 'rule', label: t('verankerung.kind.rule', { defaultValue: 'Regel' }) }] },
        ];
        submit = (v) => g.addPractice(jwt, flowId, { kind: v.kind, title: v.title.trim() });
    } else if (dlg.kind === 'target') {
        title = t('verankerung.tab.targets', { defaultValue: 'Zielgruppe' });
        fields = [
            { name: 'scopeType', label: t('verankerung.scope', { defaultValue: 'Gilt für' }), type: 'select', options: [
                { value: 'userType', label: t('verankerung.scopeUserType', { defaultValue: 'Eine Benutzergruppe' }) },
                { value: 'space', label: t('verankerung.scopeSpace', { defaultValue: 'Einen Space' }) },
                { value: 'tenant', label: t('verankerung.scopeTenant', { defaultValue: 'Die ganze Schule' }) }] },
            { name: 'userTypeKey', label: t('verankerung.userType', { defaultValue: 'Benutzergruppe' }), type: 'select',
                options: pickers.userTypes, required: true, visibleIf: (v) => v.scopeType === 'userType',
                help: pickers.userTypes.length === 0 ? t('verankerung.noUserTypes', { defaultValue: 'Keine Benutzergruppen konfiguriert — in den Einstellungen anlegen.' }) : undefined },
            { name: 'spaceId', label: t('verankerung.space', { defaultValue: 'Space' }), type: 'select',
                options: pickers.spaces, required: true, visibleIf: (v) => v.scopeType === 'space' },
        ];
        submit = (v) => g.addTargetGroup(jwt, flowId, {
            scopeType: v.scopeType,
            userTypeKey: v.scopeType === 'userType' ? v.userTypeKey : null,
            spaceId: v.scopeType === 'space' ? v.spaceId : null,
        });
    } else if (dlg.kind === 'resp') {
        title = t('verankerung.owner', { defaultValue: 'Verantwortliche:r' });
        fields = [
            { name: 'userId', label: t('verankerung.person', { defaultValue: 'Person' }), type: 'select',
                options: pickers.users, required: true,
                help: pickers.users.length === 0 ? t('verankerung.noUsers', { defaultValue: 'Keine Personen gefunden.' }) : undefined },
            { name: 'role', label: t('verankerung.schoolRole', { defaultValue: 'Rolle in der Schule' }), type: 'select', options: [
                { value: 'owner', label: t('verankerung.role.owner', { defaultValue: 'Konzept-Pate / Verantwortung' }) },
                { value: 'team', label: t('verankerung.role.team', { defaultValue: 'Steuergruppe' }) },
                { value: 'approver', label: t('verankerung.role.approver', { defaultValue: 'Schulleitung (Beschluss)' }) },
                { value: 'reviewer', label: t('verankerung.role.reviewer', { defaultValue: 'Kollegium (Kenntnisnahme)' }) },
                { value: 'dataProtectionReviewer', label: t('verankerung.role.dpo', { defaultValue: 'Datenschutz' }) }] },
        ];
        submit = (v) => g.addResponsibility(jwt, flowId, { userId: v.userId, role: v.role || 'owner' });
    } else if (dlg.kind === 'nudge') {
        title = t('verankerung.reminderCalendar', { defaultValue: 'Erinnerung (Kalender)' });
        fields = [{ name: 'message', label: t('verankerung.message', { defaultValue: 'Nachricht' }), type: 'textarea', required: true }];
        submit = (v) => g.addNudge(jwt, flowId, { triggerType: 'calendar', channel: 'notification', message: v.message.trim() });
    } else if (dlg.kind === 'reqcheck') {
        title = dlg.label;
        fields = [
            { name: 'status', label: t('verankerung.statusLabel', { defaultValue: 'Status' }), type: 'select', options: [
                { value: 'open', label: t('verankerung.openState', { defaultValue: 'offen' }) },
                { value: 'fulfilled', label: t('verankerung.fulfilled', { defaultValue: 'erfüllt' }) },
                { value: 'not_applicable', label: t('verankerung.na', { defaultValue: 'nicht zutreffend' }) }] },
            { name: 'notApplicableReason', label: t('verankerung.naReason', { defaultValue: 'Begründung „nicht zutreffend"' }), type: 'textarea',
                required: true, visibleIf: (v) => v.status === 'not_applicable' },
            { name: 'evidenceRefType', label: t('verankerung.evidenceType', { defaultValue: 'Nachweis' }), type: 'select', options: [
                { value: '', label: t('verankerung.none', { defaultValue: 'kein Nachweis' }) },
                { value: 'practiceComponent', label: t('verankerung.evPractice', { defaultValue: 'Praxisbaustein dieses Konzepts' }) },
                { value: 'document', label: t('verankerung.evDoc', { defaultValue: 'Dokument' }) },
                { value: 'form', label: t('verankerung.evForm', { defaultValue: 'Formular (ID)' }) }] },
            { name: 'evidencePractice', label: t('verankerung.evPracticePick', { defaultValue: 'Praxisbaustein auswählen' }), type: 'select',
                options: pickers.practice, required: true, visibleIf: (v) => v.evidenceRefType === 'practiceComponent',
                help: pickers.practice.length === 0 ? t('verankerung.noPracticeYet', { defaultValue: 'Noch keine Praxisbausteine — zuerst im Tab „Praxisbausteine" anlegen.' }) : undefined },
            { name: 'evidenceDoc', label: t('verankerung.evDocPick', { defaultValue: 'Dokument auswählen' }), type: 'select',
                options: pickers.documents, required: true, visibleIf: (v) => v.evidenceRefType === 'document',
                help: pickers.documents.length === 0 ? t('verankerung.noDocs', { defaultValue: 'Keine Dokumente gefunden — zuerst im DMS hochladen.' }) : undefined },
            { name: 'evidenceRefId', label: t('verankerung.evidenceId', { defaultValue: 'Formular-ID' }),
                required: true, visibleIf: (v) => v.evidenceRefType === 'form',
                help: t('verankerung.evidenceIdHelp', { defaultValue: 'ID des Formulars (aus Briefe & Formulare).' }) },
            { name: 'adminNote', label: t('verankerung.adminNote', { defaultValue: 'Organisatorische Notiz' }), type: 'textarea',
                help: t('verankerung.adminNoteHelp', { defaultValue: 'Nur organisatorisch — keine personenbezogenen oder sensiblen Inhalte.' }) },
        ];
        submit = (v) => {
            const refId = v.evidenceRefType === 'practiceComponent' ? v.evidencePractice
                : v.evidenceRefType === 'document' ? v.evidenceDoc
                : v.evidenceRefId;
            return g.setRequirementCheck(jwt, dlg.checkId, {
                status: v.status,
                notApplicableReason: v.status === 'not_applicable' ? v.notApplicableReason : null,
                adminNote: v.adminNote || null,
                evidenceRefType: v.evidenceRefType || null,
                evidenceRefId: v.evidenceRefType ? refId : null,
            });
        };
    } else if (dlg.kind === 'adoption') {
        title = t('verankerung.setAdoption', { defaultValue: 'Beschlussstatus setzen' });
        fields = [
            { name: 'status', label: t('verankerung.statusLabel', { defaultValue: 'Status' }), type: 'select', options: [
                { value: 'adopted', label: 'beschlossen' }, { value: 'draft', label: 'Entwurf' },
                { value: 'expired', label: 'abgelaufen' }, { value: 'revoked', label: 'widerrufen' }] },
            { name: 'resolutionRef', label: t('verankerung.resolutionRef', { defaultValue: 'DMS-Referenz Beschlussdokument' }),
                required: true, visibleIf: (v) => v.status === 'adopted',
                help: t('verankerung.resolutionHelp', { defaultValue: 'Pflicht für „beschlossen". eIDAS empfohlen, nicht zwingend.' }) },
            { name: 'gremium', label: t('verankerung.gremium', { defaultValue: 'Gremium' }) },
        ];
        submit = (v) => g.setAdoption(jwt, flowId, {
            status: v.status, resolutionRef: v.resolutionRef || null, gremium: v.gremium || null,
        });
    } else if (dlg.kind === 'materialize') {
        title = t('verankerung.asTaskTitle', { defaultValue: 'Baustein als Aufgabe anlegen' });
        fields = [
            { name: 'spaceId', label: t('verankerung.space', { defaultValue: 'Space' }), type: 'select',
                options: pickers.spaces, required: true,
                help: t('verankerung.asTaskHelp', { defaultValue: 'Es entsteht eine echte Aufgabe im Aufgaben-Board dieses Space. Erledigung zählt in den „Anwendung"-Score.' }) },
            { name: 'responsibleUserId', label: t('verankerung.responsible', { defaultValue: 'Zuständige Person (optional)' }), type: 'select',
                options: [{ value: '', label: '—' }, ...pickers.users] },
            { name: 'dueDate', label: t('verankerung.dueDate', { defaultValue: 'Frist (optional)' }), type: 'date' },
        ];
        submit = (v) => g.materializePractice(jwt, dlg.practiceId, {
            spaceId: v.spaceId,
            responsibleUserId: v.responsibleUserId || null,
            dueDate: v.dueDate || null,
        });
    } else if (dlg.kind === 'linkref') {
        title = t('verankerung.linkDoc', { defaultValue: 'Dokument / Nachweis verknüpfen' });
        fields = [
            { name: 'docId', label: t('verankerung.evDocPick', { defaultValue: 'Dokument auswählen' }), type: 'select',
                options: pickers.documents, required: true,
                help: pickers.documents.length === 0 ? t('verankerung.noDocs', { defaultValue: 'Keine Dokumente gefunden — zuerst im DMS hochladen.' }) : t('verankerung.linkDocHelp', { defaultValue: 'Verknüpft ein vorhandenes DMS-Dokument als Nachweis für diesen Baustein.' }) },
        ];
        submit = (v) => g.setPracticeRef(jwt, dlg.practiceId, { refType: 'document', refId: v.docId });
    } else if (dlg.kind === 'editnudge') {
        title = t('verankerung.editReminder', { defaultValue: 'Wiedervorlage bearbeiten' });
        fields = [
            { name: 'message', label: t('verankerung.message', { defaultValue: 'Nachricht' }), type: 'textarea', required: true, defaultValue: dlg.message },
            { name: 'dueDate', label: t('verankerung.nextReviewDate', { defaultValue: 'Nächstes Review-Datum' }), type: 'date',
                defaultValue: dlg.dueDate ? dlg.dueDate.slice(0, 10) : '',
                help: t('verankerung.nextReviewHelp', { defaultValue: 'Leer lassen entfernt das Datum. Überfällige Wiedervorlagen werden im Cockpit markiert.' }) },
        ];
        submit = (v) => g.updateNudge(jwt, dlg.nudgeId, { message: v.message.trim(), dueDate: v.dueDate || null });
    } else { // agency
        title = t('verankerung.addAgency', { defaultValue: 'Fachstelle anlegen & benennen' });
        fields = [
            { name: 'name', label: t('verankerung.agencyName', { defaultValue: 'Name der Fachstelle' }), required: true },
            { name: 'kind', label: t('verankerung.fieldKind', { defaultValue: 'Art' }), type: 'select', options: [
                'beratungsstelle', 'schulamt', 'fachberatung', 'jugendhilfe', 'traeger', 'sonstige'].map(k => ({ value: k, label: k })) },
            { name: 'role', label: t('verankerung.agencyRole', { defaultValue: 'Rolle im Konzept' }), type: 'select', options: [
                'ansprechpartner', 'beschwerdeweg', 'fachberatung', 'schulaufsicht', 'praevention', 'fortbildung', 'notfallkontakt', 'sonstige'].map(k => ({ value: k, label: k })) },
            { name: 'contact', label: t('verankerung.agencyContact', { defaultValue: 'Organisations-Kontakt (optional)' }) },
        ];
        submit = async (v) => {
            const a = await g.createAgency(jwt, { name: v.name.trim(), kind: v.kind, contact: v.contact || null });
            return g.linkAgency(jwt, flowId, { agencyId: a.id, role: v.role });
        };
    }

    return (
        <FieldDialog open busy={busy} title={title} fields={fields}
            onClose={onClose}
            onSubmit={(v) => onDone(() => submit(v))} />
    );
}
