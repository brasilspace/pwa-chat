/**
 * import-export-hub.tsx — Hub-Page der Import/Export-App.
 *
 * 3-Spalten-Layout (siehe reference_layout_logic.md):
 *   - Sidebar (AppSidebar → ImportExportWorld): Entity-Liste — heute nur
 *     "Aufgaben", spaeter Kontakte/Dokumente/...
 *   - Hauptfenster (linkes Panel): Erklaerungs-Box mit Anleitung
 *   - Detail-Page (rechtes Panel): Tabs Export / Import / Verlauf
 *
 * Phase 1: Aufgaben-Export (JSON+CSV) + Aufgaben-Import (JSON+CSV).
 *
 * Konzept: prilog_docs/docs/umsetzung/import-export-konzept.md
 */

import { type JSX, useMemo, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useSpaces } from '@/features/spaces/use-spaces';
import { env } from '@/core/config/env';
import { ResizablePanels } from '@/components/ui/resizable-panels';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { MaterialIcon } from '@/components/ui/material-icon';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

type DetailTab = 'export' | 'import';

interface ImportResult {
    schema_version: number;
    entity_type: string;
    imported: number;
    failed: number;
    warnings: { _import_id: string | null; field?: string; message: string }[];
    errors: { _import_id: string | null; message: string; index: number }[];
    items: { _import_id: string | null; id: string; status: string }[];
}

export function ImportExportHub(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { spaces, loading: spacesLoading } = useSpaces();

    // Default-Space: erster vorhandener.
    const [selectedSpaceId, setSelectedSpaceId] = useState<string>('');
    const effectiveSpaceId = selectedSpaceId || spaces[0]?.id || '';

    const [tab, setTab] = useState<DetailTab>(() => {
        try {
            const saved = localStorage.getItem('prilog.importExport.tab');
            if (saved === 'export' || saved === 'import') return saved;
        } catch { /* ignore */ }
        return 'export';
    });
    const setActiveTab = (next: DetailTab) => {
        setTab(next);
        try { localStorage.setItem('prilog.importExport.tab', next); } catch { /* ignore */ }
    };

    if (spacesLoading) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
            </div>
        );
    }

    if (spaces.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <MaterialIcon name="import_export" size={40} className="text-muted-foreground/30" />
                <p className="text-sm">{t('import-export.import_export_hub.noch_keine_spaces_vorhanden_importexport')}</p>
            </div>
        );
    }

    const selectedSpace = spaces.find(s => s.id === effectiveSpaceId);

    const leftPanel = (
        <div className="flex h-full flex-col">
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
                <MaterialIcon name="import_export" size={20} className="text-primary" />
                <h1 className="text-sm font-semibold">{t('import-export.import_export_hub.import_export')}</h1>
            </div>
            <ScrollArea className="flex-1">
                <div className="space-y-4 p-4">
                    <section>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('import-export.import_export_hub.entity')}</h2>
                        <ul className="mt-1.5 space-y-0.5">
                            <li>
                                <button type="button"
                                    className="flex w-full items-center gap-2 rounded-md bg-primary/10 px-2.5 py-2 text-sm font-medium text-primary">
                                    <MaterialIcon name="check_box" size={16} />
                                    {t('import-export.import_export_hub.aufgaben')}
                                </button>
                            </li>
                            <li>
                                <div className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground/60">
                                    <MaterialIcon name="contacts" size={16} />
                                    {t('import-export.import_export_hub.kontakte')} <span className="text-[10px]">{t('import-export.import_export_hub.geplant')}</span>
                                </div>
                            </li>
                            <li>
                                <div className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground/60">
                                    <MaterialIcon name="folder" size={16} />
                                    {t('import-export.import_export_hub.dokumente')} <span className="text-[10px]">{t('import-export.import_export_hub.geplant')}</span>
                                </div>
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('import-export.import_export_hub.space')}</h2>
                        <p className="mt-1 text-[11px] text-muted-foreground/80">
                            {t('import-export.import_export_hub.quelle_export_bzw_ziel_import')}
                        </p>
                        <select
                            value={effectiveSpaceId}
                            onChange={(e) => setSelectedSpaceId(e.target.value)}
                            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-primary"
                        >
                            {spaces.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </section>

                    <section className="rounded-md border bg-muted/30 p-3">
                        <h2 className="text-xs font-semibold">{t('import-export.import_export_hub.was_kann_ich_hier')}</h2>
                        <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                            <li>📥 <strong>{t('import-export.import_export_hub.export')}</strong>{t('import-export.import_export_hub.aufgaben_als_json_oder_csv_herunterladen')}</li>
                            <li>📤 <strong>{t('import-export.import_export_hub.import')}</strong>{t('import-export.import_export_hub.aufgaben_aus_einer_json-_oder_csv-datei_')}</li>
                            <li>📋 <strong>DSGVO</strong>{t('import-export.import_export_hub.jeder_import_wird_im_aktivitaeten-stream')}</li>
                        </ul>
                        <a href="https://docs.prilog.chat/handbuch/import-export"
                            target="_blank" rel="noopener"
                            className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                            {t('import-export.import_export_hub.handbuch')} <MaterialIcon name="open_in_new" size={12} />
                        </a>
                    </section>
                </div>
            </ScrollArea>
        </div>
    );

    const rightPanel = (
        <div className="flex h-full flex-col">
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-0.5 border-b px-1.5">
                <div className="flex flex-1 items-center gap-0.5">
                    {([
                        { key: 'export' as const, icon: 'download', label: 'Export' },
                        { key: 'import' as const, icon: 'upload', label: 'Import' },
                    ]).map(_t => (
                        <Tooltip key={_t.key}>
                            <TooltipTrigger asChild>
                                <button type="button"
                                    onClick={() => setActiveTab(_t.key)}
                                    className={cn(
                                        'flex size-8 items-center justify-center rounded-md transition-colors',
                                        tab === _t.key
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                    )}>
                                    <MaterialIcon name={_t.icon} size={20} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">{_t.label}</TooltipContent>
                        </Tooltip>
                    ))}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {tab === 'export' ? (
                    <ExportPanel jwt={jwt ?? ''} space={selectedSpace} />
                ) : (
                    <ImportPanel jwt={jwt ?? ''} space={selectedSpace} />
                )}
            </div>
        </div>
    );

    return (
        <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1">
                <ResizablePanels
                    left={leftPanel}
                    right={rightPanel}
                    defaultLeftRatio={0.35}
                    minLeftRatio={0.25}
                    maxLeftRatio={0.55}
                />
            </div>
        </div>
    );
}

// ─── Export Panel ────────────────────────────────────────────────────────

function ExportPanel({ jwt, space }: { jwt: string; space: { id: string; name: string } | undefined }): JSX.Element {
    const t = useT();
    const [includeDone, setIncludeDone] = useState(true);
    const [includeDeleted, setIncludeDeleted] = useState(false);

    if (!space) return <div className="p-6 text-sm text-muted-foreground">{t('import-export.import_export_hub.bitte_einen_space_waehlen')}</div>;

    const buildUrl = (format: 'json' | 'csv') => {
        const params = new URLSearchParams({ format, includeDone: String(includeDone), includeDeleted: String(includeDeleted) });
        return `${env.platformBaseUrl}/platform/v1/spaces/${encodeURIComponent(space.id)}/import-export/tasks/export?${params.toString()}`;
    };

    const downloadFile = async (format: 'json' | 'csv') => {
        const res = await fetch(buildUrl(format), {
            method: 'GET',
            headers: { Authorization: `Bearer ${jwt}` },
        });
        if (!res.ok) {
            alert(`Export fehlgeschlagen (HTTP ${res.status}). Bitte erneut versuchen.`);
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prilog-tasks-${space.id}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4 p-6">
            <header>
                <h2 className="text-base font-semibold">{t('import-export.import_export_hub.aufgaben_exportieren')}</h2>
                <p className="mt-1 text-[12px] text-muted-foreground">
                    {t('import-export.import_export_hub.lade_alle_aufgaben_des_spaces')} <strong>{space.name}</strong> {t('import-export.import_export_hub.als_datei_herunter')}
                </p>
            </header>

            <fieldset className="rounded-md border bg-muted/20 p-3 space-y-2">
                <legend className="px-2 text-xs font-medium text-muted-foreground">{t('import-export.import_export_hub.optionen')}</legend>
                <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={includeDone} onChange={e => setIncludeDone(e.target.checked)} />
                    {t('import-export.import_export_hub.erledigte_aufgaben_mit_exportieren')}
                </label>
                <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} />
                    {t('import-export.import_export_hub.geloeschte_aufgaben_papierkorb_mit_expor')}
                </label>
            </fieldset>

            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadFile('json')}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    <MaterialIcon name="data_object" size={16} />
                    {t('import-export.import_export_hub.json_herunterladen')}
                </button>
                <button type="button" onClick={() => downloadFile('csv')}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
                    <MaterialIcon name="grid_on" size={16} />
                    {t('import-export.import_export_hub.csv_herunterladen_excel')}
                </button>
            </div>

            <div className="rounded-md border-l-4 border-primary/60 bg-primary/5 p-3 text-[11px] text-muted-foreground">
                <strong>JSON</strong> {t('import-export.import_export_hub.enthaelt_alles_inkl_checklisten_kommenta')}
                <br />
                <strong>CSV</strong> {t('import-export.import_export_hub.ist_excel-kompatibel_komma-getrennt_spal')}
            </div>
        </div>
    );
}

// ─── Import Panel ────────────────────────────────────────────────────────

function ImportPanel({ jwt, space }: { jwt: string; space: { id: string; name: string } | undefined }): JSX.Element {
    const t = useT();
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (!space) return <div className="p-6 text-sm text-muted-foreground">{t('import-export.import_export_hub.bitte_einen_space_waehlen')}</div>;

    const fileFormat: 'json' | 'csv' | 'unknown' = useMemo(() => {
        if (!file) return 'unknown';
        const name = file.name.toLowerCase();
        if (name.endsWith('.json')) return 'json';
        if (name.endsWith('.csv')) return 'csv';
        return 'unknown';
    }, [file]);

    const submitImport = async () => {
        if (!file || fileFormat === 'unknown') {
            setError('Bitte eine .json- oder .csv-Datei waehlen.');
            return;
        }
        setBusy(true);
        setError(null);
        setResult(null);
        try {
            const text = await file.text();
            const url = `${env.platformBaseUrl}/platform/v1/spaces/${encodeURIComponent(space.id)}/import-export/tasks/import`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    'Content-Type': fileFormat === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
                },
                body: fileFormat === 'csv' ? text : text,  // beide als Text-Body
            });
            if (!res.ok) {
                const errText = await res.text();
                setError(`Import fehlgeschlagen (HTTP ${res.status}): ${errText.slice(0, 500)}`);
                return;
            }
            const data = await res.json();
            setResult(data);
        } catch (err) {
            setError(`Import fehlgeschlagen: ${(err as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4 p-6">
            <header>
                <h2 className="text-base font-semibold">{t('import-export.import_export_hub.aufgaben_importieren')}</h2>
                <p className="mt-1 text-[12px] text-muted-foreground">
                    {t('import-export.import_export_hub.lade_eine_json-_oder_csv-datei_hoch_die_')} <strong>{space.name}</strong>.
                </p>
            </header>

            {!result && (
                <>
                    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-input bg-muted/20 p-6 text-center transition-colors hover:bg-muted/40">
                        <MaterialIcon name="upload_file" size={32} className="text-muted-foreground/60" />
                        <span className="text-sm font-medium">
                            {file ? file.name : 'Datei waehlen oder hierher ziehen'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                            {t('import-export.import_export_hub.json_oder_csv_excel-export')}
                        </span>
                        <input type="file" className="hidden" accept=".json,.csv,application/json,text/csv"
                            onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null); }}
                        />
                    </label>

                    {file && (
                        <div className="rounded-md border bg-muted/20 p-3 text-[12px]">
                            <div><strong>{t('import-export.import_export_hub.datei')}</strong> {file.name}</div>
                            <div><strong>{t('import-export.import_export_hub.groesse')}</strong> {(file.size / 1024).toFixed(1)} KB</div>
                            <div><strong>{t('import-export.import_export_hub.format')}</strong> {fileFormat === 'unknown' ? <span className="text-destructive">{t('import-export.import_export_hub.unbekannt_bitte_json_oder_csv')}</span> : fileFormat.toUpperCase()}</div>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive">
                            {error}
                        </div>
                    )}

                    <button type="button" onClick={submitImport}
                        disabled={!file || fileFormat === 'unknown' || busy}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <MaterialIcon name="upload" size={16} />}
                        {busy ? 'Importiere…' : 'Import starten'}
                    </button>
                </>
            )}

            {result && (
                <ResultReport result={result} onReset={() => { setResult(null); setFile(null); }} />
            )}
        </div>
    );
}

// ─── Result Report ────────────────────────────────────────────────────────

function ResultReport({ result, onReset }: { result: ImportResult; onReset: () => void }): JSX.Element {
    const t = useT();
    const success = result.failed === 0;
    return (
        <div className="space-y-3">
            <div className={cn(
                'rounded-md border p-3',
                success ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
                    : 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40',
            )}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <MaterialIcon name={success ? 'check_circle' : 'warning'} size={18} />
                    {result.imported} von {result.imported + result.failed} {t('import-export.import_export_hub.aufgaben_importiert')}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                    {result.warnings.length > 0 && `${result.warnings.length} Warnungen · `}
                    {result.failed > 0 && `${result.failed} Fehler · `}
                    {t('import-export.import_export_hub.schema_v')}{result.schema_version}
                </div>
            </div>

            {result.errors.length > 0 && (
                <details className="rounded-md border border-destructive/40 bg-destructive/5">
                    <summary className="cursor-pointer p-3 text-sm font-medium text-destructive">
                        {result.errors.length} {t('import-export.import_export_hub.fehler_details_anzeigen')}
                    </summary>
                    <ul className="space-y-1 px-3 pb-3 text-[11px]">
                        {result.errors.slice(0, 50).map((e, i) => (
                            <li key={i}>
                                {e._import_id && <code className="text-muted-foreground">{e._import_id}: </code>}
                                {e.message}
                            </li>
                        ))}
                        {result.errors.length > 50 && <li className="text-muted-foreground">{t('import-export.import_export_hub.und')} {result.errors.length - 50} weitere</li>}
                    </ul>
                </details>
            )}

            {result.warnings.length > 0 && (
                <details className="rounded-md border border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/20">
                    <summary className="cursor-pointer p-3 text-sm font-medium text-amber-700 dark:text-amber-400">
                        {result.warnings.length} {t('import-export.import_export_hub.warnungen_details_anzeigen')}
                    </summary>
                    <ul className="space-y-1 px-3 pb-3 text-[11px]">
                        {result.warnings.slice(0, 50).map((w, i) => (
                            <li key={i}>
                                {w._import_id && <code className="text-muted-foreground">{w._import_id}: </code>}
                                {w.field && <span className="font-medium">{w.field} — </span>}
                                {w.message}
                            </li>
                        ))}
                        {result.warnings.length > 50 && <li className="text-muted-foreground">{t('import-export.import_export_hub.und')} {result.warnings.length - 50} weitere</li>}
                    </ul>
                </details>
            )}

            <button type="button" onClick={onReset}
                className="rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted">
                {t('import-export.import_export_hub.weitere_datei_importieren')}
            </button>
        </div>
    );
}
