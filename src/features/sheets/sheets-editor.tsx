/**
 * SheetsEditor — Univer-Wrapper fuer eine einzelne Tabelle.
 *
 * Echtzeit-Collab via Y.js-Bridge (sheets-collab.ts):
 *   - Y.Map-Snapshot synchronisiert ueber WebSocket /sheets-collab/:id/ws
 *   - Lokale Mutationen werden 800ms-debounced als Snapshot in Y.Map geschrieben
 *   - Entfernte Y.Map-Updates → applyRemoteWorkbook → diff & apply
 *   - Backend-Persistenz: 30s-debounced auf S3 (Document.storageKey)
 *   - Awareness: Username/Farbe pro Peer im Header sichtbar
 *
 * Univer-Plugins:
 *   - UniverSheetsCorePreset, Sort, Filter, Find/Replace
 */

import { type JSX, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { ownProfileStore } from '@/core/session/own-profile-store';
import { env } from '@/core/config/env';
import { sheetsApi, type SheetRole } from './use-sheets';
import { workbookToCsv, parseCsv, rowsToCellData, downloadCsv } from './csv-helpers';
import { createSheetCollab, colorForUser, type SheetCollabHandle, type CollabPresence } from './sheets-collab';
import { ShareSheetModal } from './share-sheet-modal';
import { SheetCommentsPanel } from './sheet-comments-panel';
import { ColumnConfigModal } from './column-config-modal';
import { sheetColumnsApi, type SheetColumn } from './use-sheet-columns';
import { applyAllColumnsToUniver, applyColumnToUniver, type KnownPerson } from './apply-column-types';
import { useContacts } from '@/features/contacts/use-contacts';
import { FilePickerDialog } from '@/features/flows/file-picker-dialog';
import { SheetHistoryPanel } from './sheet-history-panel';
import { RowTaskModal } from './row-task-modal';
import { useSheetRowTasks, sheetRowTasksApi } from './use-sheet-row-tasks';
import { Loader2, Save } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';

// Univer-CSS muss am top-level importiert werden — wenn es nur in den
// lazy-importierten Preset-Modulen referenziert wird, zieht Vite es
// nicht zuverlaessig ins Bundle, und der Editor erscheint dann ohne
// Layout (vertikale Knoepfe ohne Toolbar/Grid-Styling).
import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/docs-ui/lib/index.css';
import '@univerjs/sheets-ui/lib/index.css';
import '@univerjs/sheets-formula-ui/lib/index.css';
import '@univerjs/sheets-numfmt-ui/lib/index.css';
import '@univerjs/sheets-filter-ui/lib/index.css';
import '@univerjs/sheets-sort-ui/lib/index.css';
import '@univerjs/find-replace/lib/index.css';
import '@univerjs/sheets-data-validation-ui/lib/index.css';
import '@univerjs/sheets-conditional-formatting-ui/lib/index.css';
import '@univerjs/sheets-hyper-link-ui/lib/index.css';
import '@univerjs/sheets-note-ui/lib/index.css';
import '@univerjs/sheets-table-ui/lib/index.css';
import './sheets-editor.css';
import { useT } from "@/lib/i18n/use-t";

export function SheetsEditor(): JSX.Element {
    const t = useT();
    const { id } = useParams<{ id: string }>();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);
    const univerRef = useRef<{ univer: { dispose: () => void }; api: unknown } | null>(null);
    const apiRef = useRef<unknown>(null);
    const collabRef = useRef<SheetCollabHandle | null>(null);
    /** Re-Entry-Schutz beim Anwenden eines entfernten Snapshots — verhindert
     * Loopback in unseren Mutation-Listener. */
    const applyingRemoteRef = useRef(false);
    const [title, setTitle] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
    const [peers, setPeers] = useState<CollabPresence[]>([]);
    const [collabConnected, setCollabConnected] = useState(false);
    const [myRole, setMyRole] = useState<SheetRole>('VIEWER');
    const [shareOpen, setShareOpen] = useState(false);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [activeCellRef, setActiveCellRef] = useState<string | null>(null);
    const [activeWorksheetId, setActiveWorksheetId] = useState<string>('');
    const [activeColumnIndex, setActiveColumnIndex] = useState<number>(0);
    const [activeRowIndex, setActiveRowIndex] = useState<number>(0);
    const [columnConfigOpen, setColumnConfigOpen] = useState(false);
    const [filePickerOpen, setFilePickerOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [sheetColumns, setSheetColumns] = useState<SheetColumn[]>([]);
    const [sheetScope, setSheetScope] = useState<'PERSONAL' | 'SPACE' | null>(null);
    const [sheetMode, setSheetMode] = useState<'protocol' | null>(null);
    const [rowTaskModalOpen, setRowTaskModalOpen] = useState(false);
    const [rowTaskPrefill, setRowTaskPrefill] = useState<{
        title: string;
        dueDate?: string;
        assignedDisplayName?: string;
        status?: string;
    } | null>(null);
    const lastSavedJsonRef = useRef<string>('');
    const dirtyRef = useRef(false);
    const canWrite = myRole === 'OWNER' || myRole === 'EDITOR';

    const ownProfile = useSyncExternalStore(ownProfileStore.subscribe, ownProfileStore.getSnapshot);
    const myUserId = session.bootstrap?.user.matrixUserId ?? '';
    const { contacts } = useContacts();
    const { rowTasks, refresh: refreshRowTasks } = useSheetRowTasks(id ?? null);
    const persons: KnownPerson[] = useMemo(
        () => contacts.map(c => ({ matrixUserId: c.id, displayName: c.displayName })),
        [contacts],
    );

    /** Aktive-Zell-Spalte ist als File-Spalte konfiguriert? */
    const activeColumnDef = useMemo(
        () => sheetColumns.find(c => c.worksheetId === activeWorksheetId && c.columnIndex === activeColumnIndex),
        [sheetColumns, activeWorksheetId, activeColumnIndex],
    );
    const isActiveFileColumn = activeColumnDef?.type === 'file';

    /** Schreibt Datei-Link als Univer-Rich-Text in die aktive Zelle. */
    const insertFileLink = (prilogLink: string, meta: { fileName: string }) => {
        if (!apiRef.current) return;
        const api = apiRef.current as {
            newRichText?: () => { insertLink: (label: string, url: string) => unknown };
            getActiveWorkbook?: () => {
                getActiveSheet?: () => {
                    getActiveRange?: () => {
                        setRichTextValueForCell?: (rt: unknown) => unknown;
                        setValue?: (v: string) => unknown;
                    } | null;
                } | null;
            } | null;
        };
        const wb = api.getActiveWorkbook?.();
        const sheet = wb?.getActiveSheet?.();
        const range = sheet?.getActiveRange?.();
        if (!range) return;
        try {
            const rich = api.newRichText?.()?.insertLink(meta.fileName, prilogLink);
            if (rich && range.setRichTextValueForCell) {
                range.setRichTextValueForCell(rich);
            } else if (range.setValue) {
                range.setValue(meta.fileName);
            }
        } catch (e) {
            console.warn('insertFileLink failed', e);
            range.setValue?.(meta.fileName);
        }
    };

    // ── Init Univer + Workbook laden ────────────────────────────────────────
    useEffect(() => {
        if (!jwt || !id || !containerRef.current) return;
        let cancelled = false;
        let disposeFn: (() => void) | undefined;

        (async () => {
            try {
                // Univer hat noch kein DE-Locale-Bundle — wir nehmen EN-US als
                // Fallback (Englisch-UI, Formel-Namen wie SUM/AVERAGE statt
                // SUMME/MITTELWERT). Das ist Industrie-Standard fuer Excel-
                // Formeln und passt besser zu Daten-Austausch via xlsx.
                const [
                    presets,
                    { UniverSheetsCorePreset },
                    { UniverSheetsSortPreset },
                    { UniverSheetsFilterPreset },
                    { UniverSheetsFindReplacePreset },
                    { UniverSheetsDataValidationPreset },
                    { UniverSheetsConditionalFormattingPreset },
                    { UniverSheetsHyperLinkPreset },
                    { UniverSheetsNotePreset },
                    { UniverSheetsTablePreset },
                    themes,
                    enUSMod,
                    sortLocaleMod,
                    filterLocaleMod,
                    findReplaceLocaleMod,
                    dataValLocaleMod,
                    condFmtLocaleMod,
                    hyperLinkLocaleMod,
                    noteLocaleMod,
                    tableLocaleMod,
                ] = await Promise.all([
                    import('@univerjs/presets'),
                    import('@univerjs/preset-sheets-core'),
                    import('@univerjs/preset-sheets-sort'),
                    import('@univerjs/preset-sheets-filter'),
                    import('@univerjs/preset-sheets-find-replace'),
                    import('@univerjs/preset-sheets-data-validation'),
                    import('@univerjs/preset-sheets-conditional-formatting'),
                    import('@univerjs/preset-sheets-hyper-link'),
                    import('@univerjs/preset-sheets-note'),
                    import('@univerjs/preset-sheets-table'),
                    import('@univerjs/themes'),
                    import('@univerjs/preset-sheets-core/locales/en-US'),
                    import('@univerjs/preset-sheets-sort/locales/en-US'),
                    import('@univerjs/preset-sheets-filter/locales/en-US'),
                    import('@univerjs/preset-sheets-find-replace/locales/en-US'),
                    import('@univerjs/preset-sheets-data-validation/locales/en-US'),
                    import('@univerjs/preset-sheets-conditional-formatting/locales/en-US'),
                    import('@univerjs/preset-sheets-hyper-link/locales/en-US'),
                    import('@univerjs/preset-sheets-note/locales/en-US'),
                    import('@univerjs/preset-sheets-table/locales/en-US'),
                ]);
                const { createUniver, LocaleType, mergeLocales } = presets as unknown as {
                    createUniver: (typeof presets)['createUniver'];
                    LocaleType: (typeof presets)['LocaleType'];
                    mergeLocales?: (...locales: unknown[]) => unknown;
                };
                // Prilog-Theme statt defaultTheme — gleiche Struktur, aber
                // primary auf Prilog-Indigo gemappt. Plus CSS-Overrides in
                // sheets-editor.css fuer Toolbar-Backgrounds, Borders, etc.
                const { prilogUniverTheme } = await import('./prilog-univer-theme');
                const theme = prilogUniverTheme;
                void themes; // defaultTheme nicht mehr verwendet
                // locale-Datei: default-export oder ggf. der ganze Modul-Body
                const pickLocale = (m: unknown) => (m as { default?: unknown }).default ?? m;
                const enUS = pickLocale(enUSMod);
                const sortL = pickLocale(sortLocaleMod);
                const filterL = pickLocale(filterLocaleMod);
                const findReplaceL = pickLocale(findReplaceLocaleMod);
                const dataValL = pickLocale(dataValLocaleMod);
                const condFmtL = pickLocale(condFmtLocaleMod);
                const hyperLinkL = pickLocale(hyperLinkLocaleMod);
                const noteL = pickLocale(noteLocaleMod);
                const tableL = pickLocale(tableLocaleMod);
                // Mehrere locale-bundles zusammenfuehren — Univer's mergeLocales
                // (kommt aus @univerjs/core, von presets re-exportiert)
                const merge = mergeLocales as ((...l: unknown[]) => unknown) | undefined;
                // EN-US als Fallback + DE-Overrides on top — Untranslated-Keys
                // bleiben Englisch (Formelnamen wie SUM/AVERAGE sowieso).
                const { prilogDeLocale } = await import('./prilog-de-locale');
                const finalLocale = merge
                    ? merge(enUS, sortL, filterL, findReplaceL, dataValL, condFmtL, hyperLinkL, noteL, tableL, prilogDeLocale)
                    : enUS;
                if (cancelled) return;

                // 1) REST-Fetch fuer Metadaten (Title, Scope, role) + Fallback-Snapshot
                const data = await sheetsApi.get(jwt, id);
                if (cancelled) return;
                setTitle(data.sheet.title.replace(/\.prilog-sheet$/, ''));
                setMyRole(data.sheet.role);
                setSheetScope(data.sheet.scope);
                setSheetMode(data.sheet.mode);
                const writable = data.sheet.role === 'OWNER' || data.sheet.role === 'EDITOR';

                // 2) Collab-Bridge aufbauen — sie liefert ggf. den aktuelleren
                //    Snapshot aus dem laufenden Y.Doc-Room. Bei Erst-Connect ist
                //    der Y.Doc leer und wir nutzen den REST-Snapshot.
                const wsBase = (() => {
                    let b = env.platformBaseUrl;
                    if (b.startsWith('/')) {
                        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                        b = `${proto}//${window.location.host}${b}`;
                    } else {
                        b = b.replace(/^http/, 'ws');
                    }
                    return `${b}/platform/v1`;
                })();
                const displayName = ownProfile.displayName || session.bootstrap?.user.displayName || myUserId.split(':')[0].replace('@', '');
                const collab = createSheetCollab({
                    sheetId: id,
                    jwt,
                    user: { matrixUserId: myUserId, displayName, color: colorForUser(myUserId) },
                    wsBaseUrl: wsBase,
                });
                collabRef.current = collab;
                collab.onConnectionChange((c) => setCollabConnected(c));
                collab.onPeersChange(() => setPeers(collab.getPeers()));

                // 3) Univer initialisieren
                const { univer, univerAPI } = createUniver({
                    locale: LocaleType.EN_US,
                    locales: { [LocaleType.EN_US]: finalLocale as never },
                    theme,
                    presets: [
                        UniverSheetsCorePreset({
                            container: containerRef.current!,
                        }),
                        UniverSheetsSortPreset(),
                        UniverSheetsFilterPreset(),
                        UniverSheetsFindReplacePreset(),
                        // Phase 2.1 — Airtable-Style Spaltentyp-Features:
                        UniverSheetsDataValidationPreset({
                            // Dropdown-Suche aktiv damit lange Listen bedienbar bleiben
                            showSearchOnDropdown: true,
                        }),
                        UniverSheetsConditionalFormattingPreset(),
                        UniverSheetsHyperLinkPreset(),
                        UniverSheetsNotePreset(),
                        UniverSheetsTablePreset(),
                    ],
                });

                // 4) Initial-Workbook: bevorzugt der Collab-Snapshot (live state),
                //    Fallback ist REST-Daten (frisch oder offline).
                const initialSnapshot = collab.getInitialSnapshot() ?? data.workbook;
                univerAPI.createWorkbook(initialSnapshot as never);
                lastSavedJsonRef.current = JSON.stringify(initialSnapshot);

                // 4b) Read-only-Modus wenn nur lesen/kommentieren erlaubt.
                //     Univer's getWorkbookPermission().setReadOnly() blockt
                //     dann saemtliche Cell-Mutationen im UI.
                if (!writable) {
                    const wbFacade = (univerAPI as unknown as { getActiveWorkbook?: () => { getWorkbookPermission?: () => { setReadOnly: () => Promise<void> } } | null }).getActiveWorkbook?.();
                    try { await wbFacade?.getWorkbookPermission?.()?.setReadOnly(); } catch { /* noop */ }
                }

                // 5) Bridge-Callbacks anhaengen
                collab.attach({
                    getWorkbook: () => {
                        const wb = (univerAPI as unknown as { getActiveWorkbook?: () => { save: () => Record<string, unknown> } | null }).getActiveWorkbook?.();
                        return wb?.save() ?? null;
                    },
                    applyRemoteWorkbook: (snapshot) => {
                        // Ersetzt das aktive Workbook komplett. V1-Limitierung:
                        // Cursor und aktive Zell-Auswahl gehen verloren wenn
                        // ein Remote-Update waehrend der eigenen Bearbeitung
                        // ankommt. Mitigation: das Backend persisted alle 30s,
                        // und der lokale Push ist 800ms-debounced — Kollisionen
                        // sind also selten und beschraenken sich auf parallele
                        // Edits in unterschiedlichen Bereichen.
                        applyingRemoteRef.current = true;
                        try {
                            const facade = univerAPI as unknown as {
                                getActiveWorkbook?: () => { getId: () => string } | null;
                                disposeUnit?: (id: string) => boolean;
                                createWorkbook: (data: unknown) => unknown;
                            };
                            const oldWb = facade.getActiveWorkbook?.();
                            if (oldWb && facade.disposeUnit) {
                                try { facade.disposeUnit(oldWb.getId()); }
                                catch { /* fallback: createWorkbook ueberschreibt notfalls */ }
                            }
                            facade.createWorkbook(snapshot);
                        } finally {
                            // Im naechsten Tick freischalten — sonst feuert
                            // die Init-Mutation noch in unserem Listener
                            setTimeout(() => { applyingRemoteRef.current = false; }, 50);
                        }
                    },
                });

                // 6) Listener: bei jeder Aenderung dirty markieren + Collab-Push
                univerAPI.addEvent(univerAPI.Event.SheetEditEnded, () => {
                    if (applyingRemoteRef.current) return;
                    dirtyRef.current = true;
                    setSaveState('dirty');
                    collabRef.current?.markDirty();
                });

                // 6b) Selektion verfolgen — Cell-Comments referenzieren das.
                //     SelectionChanged feuert oft (jede Cursor-Bewegung) — ist OK
                //     weil wir nur State updaten, kein Re-Render des Editors.
                try {
                    univerAPI.addEvent(univerAPI.Event.SelectionChanged, () => {
                        try {
                            const wbFacade = (univerAPI as unknown as {
                                getActiveWorkbook?: () => {
                                    getActiveSheet?: () => {
                                        getName: () => string;
                                        getSheetId?: () => string;
                                        getActiveRange: () => {
                                            getA1Notation: () => string;
                                            getColumn?: () => number;
                                            getRow?: () => number;
                                        } | null;
                                    } | null;
                                } | null;
                            }).getActiveWorkbook?.();
                            const sh = wbFacade?.getActiveSheet?.();
                            const r = sh?.getActiveRange?.();
                            if (sh && r) {
                                const ref = `${sh.getName()}!${r.getA1Notation()}`;
                                setActiveCellRef(ref);
                                if (sh.getSheetId) setActiveWorksheetId(sh.getSheetId());
                                if (r.getColumn) setActiveColumnIndex(r.getColumn());
                                if (r.getRow) setActiveRowIndex(r.getRow());
                            }
                        } catch { /* noop */ }
                    });
                } catch { /* noop */ }

                univerRef.current = { univer, api: univerAPI };
                apiRef.current = univerAPI;
                setLoading(false);

                // 7) P2.2 Spalten-Configs laden + auf Univer anwenden.
                //    Best-effort: Fehler fallen still aus (Spalten-Validation
                //    ist Komfort-Feature, kein Block).
                //    Hinweis Person-Spalten: Kontakte sind ggf. noch nicht
                //    geladen — der useEffect weiter unten re-applied dann.
                try {
                    const r = await sheetColumnsApi.list(jwt, id);
                    setSheetColumns(r.columns);
                    if (r.columns.length > 0) {
                        applyAllColumnsToUniver(univerAPI as never, r.columns, { persons });
                    }
                } catch (err) {
                    console.warn('sheets-editor: column-configs load failed', err);
                }

                disposeFn = () => {
                    try { collabRef.current?.dispose(); } catch { /* noop */ }
                    collabRef.current = null;
                    univer.dispose();
                };
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e));
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
            try { disposeFn?.(); } catch { /* noop */ }
            univerRef.current = null;
            apiRef.current = null;
        };
    }, [jwt, id]);

    // ── Save-Funktion ───────────────────────────────────────────────────────
    const save = async () => {
        if (!jwt || !id || !apiRef.current) return;
        if (!canWrite) return;
        const api = apiRef.current as { getActiveWorkbook?: () => { save: () => Record<string, unknown> } | null };
        const wb = api.getActiveWorkbook?.();
        if (!wb) return;
        const snapshot = wb.save();
        const json = JSON.stringify(snapshot);
        if (json === lastSavedJsonRef.current) {
            setSaveState('saved');
            return;
        }
        setSaveState('saving');
        try {
            await sheetsApi.save(jwt, id, snapshot);
            lastSavedJsonRef.current = json;
            dirtyRef.current = false;
            setSaveState('saved');
            setTimeout(() => setSaveState((s) => s === 'saved' ? 'idle' : s), 2000);
        } catch (e) {
            setSaveState('dirty');
            alert('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    // ── CSV-Export ──────────────────────────────────────────────────────────
    const exportCsv = () => {
        if (!apiRef.current) return;
        const api = apiRef.current as { getActiveWorkbook?: () => { save: () => Record<string, unknown> } | null };
        const wb = api.getActiveWorkbook?.();
        if (!wb) return;
        const snapshot = wb.save();
        const csv = workbookToCsv(snapshot as never);
        downloadCsv(title || 'tabelle', csv);
    };

    // ── CSV-Import (ueberschreibt aktives Sheet ab A1) ──────────────────────
    const importCsv = async (file: File) => {
        if (!apiRef.current) return;
        if (!confirm('CSV-Inhalte werden ab A1 in das aktive Sheet eingefuegt — bestehende Zellen werden ueberschrieben. Fortfahren?')) return;
        const text = await file.text();
        const rows = parseCsv(text);
        if (rows.length === 0) { alert('CSV ist leer.'); return; }

        // Auf rechteckige Matrix paddedn (Univer.setValues braucht gleiche Spaltenzahl pro Zeile)
        const cols = Math.max(...rows.map(r => r.length));
        const matrix = rows.map(r => {
            const out: (string | number | null)[] = [];
            for (let c = 0; c < cols; c++) {
                const raw = r[c] ?? '';
                if (raw === '') { out.push(null); continue; }
                const num = Number(raw.trim());
                const isNumber = raw.trim() !== '' && Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(raw.trim());
                out.push(isNumber ? num : raw);
            }
            return out;
        });

        const api = apiRef.current as {
            getActiveWorkbook?: () => {
                getActiveSheet?: () => {
                    getRange: (r: number, c: number, nr: number, nc: number) => { setValues: (m: unknown) => unknown };
                } | null;
            } | null;
        };
        const wb = api.getActiveWorkbook?.();
        const sheet = wb?.getActiveSheet?.();
        if (!sheet) { alert('Kein aktives Sheet'); return; }
        const range = sheet.getRange(0, 0, matrix.length, cols);
        range.setValues(matrix);

        dirtyRef.current = true;
        setSaveState('dirty');
    };

    // ── Auto-Save 30s nach letzter Aenderung ────────────────────────────────
    useEffect(() => {
        if (saveState !== 'dirty') return;
        const t = setTimeout(() => { void save(); }, 30_000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saveState]);

    // ── Person-Spalten re-applien wenn Kontakte (spaet) geladen wurden ──────
    useEffect(() => {
        if (!apiRef.current || persons.length === 0) return;
        const personCols = sheetColumns.filter(c => c.type === 'person');
        if (personCols.length === 0) return;
        for (const c of personCols) applyColumnToUniver(apiRef.current as never, c, { persons });
    }, [persons, sheetColumns]);

    // ── Ctrl+S ──────────────────────────────────────────────────────────────
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                void save();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Beim Navigations-Wechsel speichern ──────────────────────────────────
    useEffect(() => {
        return () => {
            if (dirtyRef.current) { void save(); }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── P3.14 Prefill aus aktiver Zeile berechnen ───────────────────────────
    /** Liest die Zellen-Werte der aktiven Zeile und mappt sie auf die
     *  WorkItem-Felder (title/dueDate/assignee/status). Walks die konfigurierten
     *  Spalten-Typen — falls keine konfiguriert sind, faellt der Titel auf
     *  Spalte A zurueck. */
    const computeRowPrefill = (rowIndex: number, worksheetId: string) => {
        const api = apiRef.current as {
            getActiveWorkbook?: () => {
                getActiveSheet?: () => {
                    getRange: (r: number, c: number) => {
                        getValue?: () => unknown;
                        getDisplayValue?: () => string | undefined;
                    } | null;
                } | null;
            } | null;
        } | null;
        const sheet = api?.getActiveWorkbook?.()?.getActiveSheet?.();
        if (!sheet) return { title: '' };

        const readCell = (col: number): string => {
            const range = sheet.getRange(rowIndex, col);
            if (!range) return '';
            const disp = range.getDisplayValue?.();
            if (typeof disp === 'string' && disp.trim()) return disp.trim();
            const v = range.getValue?.();
            if (v === null || v === undefined) return '';
            return String(v).trim();
        };

        const colsForSheet = sheetColumns.filter(c => c.worksheetId === worksheetId);

        let title = '';
        let dueDate: string | undefined;
        let assignedDisplayName: string | undefined;
        let status: string | undefined;

        // Erste Text/Select-Spalte als Titel
        for (const col of colsForSheet) {
            if (col.type === 'text' || col.type === 'select') {
                const v = readCell(col.columnIndex);
                if (v) { title = v; break; }
            }
        }
        // Fallback: Spalte A
        if (!title) title = readCell(0) || `Zeile ${rowIndex + 1}`;

        for (const col of colsForSheet) {
            const v = readCell(col.columnIndex);
            if (!v) continue;
            if (col.type === 'date' && !dueDate) {
                // ISO yyyy-mm-dd erwartet vom <input type=date>
                const d = new Date(v);
                if (!isNaN(d.getTime())) {
                    dueDate = d.toISOString().slice(0, 10);
                }
            } else if (col.type === 'person' && !assignedDisplayName) {
                assignedDisplayName = v;
            } else if (col.type === 'status' && !status) {
                status = v;
            }
        }

        return { title, dueDate, assignedDisplayName, status };
    };

    /** Welche Zeilen sind in dieser Worksheet bereits als Aufgabe markiert? */
    const rowTasksByRow = useMemo(() => {
        const m = new Map<number, typeof rowTasks[number]>();
        for (const t of rowTasks) {
            if (t.worksheetId === activeWorksheetId) m.set(t.row, t);
        }
        return m;
    }, [rowTasks, activeWorksheetId]);

    const activeRowTask = rowTasksByRow.get(activeRowIndex) ?? null;

    const openRowTaskModal = () => {
        if (!activeWorksheetId) return;
        const prefill = computeRowPrefill(activeRowIndex, activeWorksheetId);
        setRowTaskPrefill(prefill);
        setRowTaskModalOpen(true);
    };

    const removeRowTask = async () => {
        if (!jwt || !id || !activeRowTask) return;
        if (!confirm('Aufgabe-Verknuepfung von dieser Zeile entfernen? Die Aufgabe selbst bleibt bestehen.')) return;
        try {
            await sheetRowTasksApi.delete(jwt, id, activeRowTask.worksheetId, activeRowTask.row);
            refreshRowTasks();
        } catch (e) {
            alert('Entfernen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 border-b px-4 py-2">
                <button
                    onClick={() => navigate('/sheets')}
                    className="rounded p-1.5 hover:bg-muted"
                    title={t('sheets.sheets_editor.zurueck_zur_liste')}
                >
                    <MaterialIcon name="arrow_back" size={16} className="size-4" />
                </button>
                <h1 className="flex-1 truncate text-sm font-medium">{title || 'Tabelle'}</h1>
                {sheetMode === 'protocol' && (
                    <span
                        className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300"
                        title={t('sheets.sheets_editor.protokoll-modus_zeilen_mit_aufgabe_veran')}
                    >
                        <MaterialIcon name="checklist" size={16} className="size-3" /> {t('sheets.sheets_editor.protokoll-modus')}
                    </span>
                )}
                <RoleBadge role={myRole} />
                <PeerPresence peers={peers} connected={collabConnected} />
                {canWrite && <SaveIndicator state={saveState} />}
                <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void importCsv(f);
                        if (csvInputRef.current) csvInputRef.current.value = '';
                    }}
                />
                {canWrite && (
                    <button
                        onClick={() => csvInputRef.current?.click()}
                        title={t('sheets.sheets_editor.csv_importieren_ueberschreibt_das_aktive')}
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                    >
                        <MaterialIcon name="upload" size={16} className="size-3" /> CSV
                    </button>
                )}
                <button
                    onClick={exportCsv}
                    title={t('sheets.sheets_editor.csv_herunterladen')}
                    className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                >
                    <MaterialIcon name="download" size={16} className="size-3" /> CSV
                </button>
                <button
                    onClick={() => setCommentsOpen(v => !v)}
                    title={t('sheets.sheets_editor.kommentare_anzeigen_ausblenden')}
                    className={cn(
                        'inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted',
                        commentsOpen && 'bg-primary/10 border-primary/40',
                    )}
                >
                    <MaterialIcon name="chat" size={16} className="size-3" /> {t('sheets.sheets_editor.kommentare')}
                </button>
                <button
                    onClick={() => setHistoryOpen(v => !v)}
                    title={t('sheets.sheets_editor.aenderungs-verlauf')}
                    className={cn(
                        'inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted',
                        historyOpen && 'bg-primary/10 border-primary/40',
                    )}
                >
                    <MaterialIcon name="history" size={16} className="size-3" /> {t('sheets.sheets_editor.verlauf')}
                </button>
                {canWrite && sheetScope === 'SPACE' && (
                    activeRowTask ? (
                        <button
                            onClick={removeRowTask}
                            title={t('sheets.sheets_editor.aufgaben-verknuepfung_dieser_zeile_entfe')}
                            className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                        >
                            <MaterialIcon name="check_box" size={16} className="size-3" /> {t('sheets.sheets_editor.aufgabe')}
                        </button>
                    ) : (
                        <button
                            onClick={openRowTaskModal}
                            title={t('sheets.sheets_editor.aktive_zeile_als_aufgabe_in_einem_board_')}
                            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                        >
                            <MaterialIcon name="check_box" size={16} className="size-3" /> {t('sheets.sheets_editor.aufgabe')}
                        </button>
                    )
                )}
                {canWrite && (
                    <button
                        onClick={() => setColumnConfigOpen(true)}
                        title={t('sheets.sheets_editor.spaltentyp_fuer_aktive_spalte_festlegen_')}
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                    >
                        <MaterialIcon name="view_column" size={16} className="size-3" /> {t('sheets.sheets_editor.spalte')}
                    </button>
                )}
                {canWrite && isActiveFileColumn && (
                    <button
                        onClick={() => setFilePickerOpen(true)}
                        title={t('sheets.sheets_editor.datei_aus_dms_in_die_aktive_zelle_einfue')}
                        className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10"
                    >
                        <MaterialIcon name="attach_file" size={16} className="size-3" /> {t('sheets.sheets_editor.datei')}
                    </button>
                )}
                {myRole === 'OWNER' && (
                    <button
                        onClick={() => setShareOpen(true)}
                        title={t('sheets.sheets_editor.tabelle_teilen')}
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                    >
                        <MaterialIcon name="share" size={16} className="size-3" /> {t('sheets.sheets_editor.teilen')}
                    </button>
                )}
                {canWrite && (
                    <button
                        onClick={save}
                        disabled={saveState === 'saving'}
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    >
                        {saveState === 'saving' ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="save" size={16} className="size-3" />}
                        {t('sheets.sheets_editor.speichern')}
                    </button>
                )}
            </div>

            {shareOpen && id && <ShareSheetModal sheetId={id} onClose={() => setShareOpen(false)} />}

            {filePickerOpen && (
                <FilePickerDialog
                    onClose={() => setFilePickerOpen(false)}
                    onSelect={(prilogLink, meta) => {
                        insertFileLink(prilogLink, meta);
                        setFilePickerOpen(false);
                    }}
                />
            )}

            {rowTaskModalOpen && id && rowTaskPrefill && (
                <RowTaskModal
                    sheetId={id}
                    worksheetId={activeWorksheetId}
                    row={activeRowIndex}
                    prefill={rowTaskPrefill}
                    onClose={() => setRowTaskModalOpen(false)}
                    onCreated={() => {
                        setRowTaskModalOpen(false);
                        refreshRowTasks();
                    }}
                />
            )}

            {columnConfigOpen && id && (
                <ColumnConfigModal
                    sheetId={id}
                    worksheetId={activeWorksheetId}
                    columnIndex={activeColumnIndex}
                    existing={sheetColumns.find(c => c.worksheetId === activeWorksheetId && c.columnIndex === activeColumnIndex) ?? null}
                    onClose={() => setColumnConfigOpen(false)}
                    onSaved={(col) => {
                        // Lokale Liste updaten + Univer-Validation neu anwenden
                        setSheetColumns(prev => {
                            const idx = prev.findIndex(c => c.id === col.id || (c.worksheetId === col.worksheetId && c.columnIndex === col.columnIndex));
                            if (idx >= 0) {
                                const next = [...prev];
                                next[idx] = col;
                                return next;
                            }
                            return [...prev, col];
                        });
                        if (apiRef.current) applyColumnToUniver(apiRef.current as never, col, { persons });
                        setColumnConfigOpen(false);
                    }}
                    onDeleted={() => {
                        setSheetColumns(prev => prev.filter(c => !(c.worksheetId === activeWorksheetId && c.columnIndex === activeColumnIndex)));
                        // Univer-Validation entfernen koennen wir spaeter — fuer V1
                        // bleibt sie bis Reload bestehen; nicht kritisch.
                        setColumnConfigOpen(false);
                    }}
                />
            )}

            {/* Editor + optional Side-Panel */}
            <div className="flex flex-1 min-h-0">
                <div className="relative flex-1 min-h-0">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background p-6 text-center">
                            <MaterialIcon name="error" size={16} className="mb-3 size-8 text-red-500" />
                            <p className="text-sm font-medium">{t('sheets.sheets_editor.fehler_beim_laden')}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                        </div>
                    )}
                    <div ref={containerRef} className="prilog-sheets-host h-full w-full" />
                </div>
                {commentsOpen && id && (
                    <SheetCommentsPanel
                        sheetId={id}
                        activeCellRef={activeCellRef}
                        myRole={myRole}
                        onClose={() => setCommentsOpen(false)}
                    />
                )}
                {historyOpen && id && (
                    <SheetHistoryPanel
                        sheetId={id}
                        onClose={() => setHistoryOpen(false)}
                    />
                )}
            </div>
        </div>
    );
}

function SaveIndicator({ state }: { state: 'idle' | 'dirty' | 'saving' | 'saved' }): JSX.Element {
    const t = useT();
    if (state === 'idle') return <span className="text-[10px] text-muted-foreground">{t('sheets.sheets_editor.gespeichert')}</span>;
    if (state === 'dirty') return <span className="text-[10px] text-amber-600">{t('sheets.sheets_editor.nicht_gespeichert')}</span>;
    if (state === 'saving') return <span className={cn('text-[10px] text-muted-foreground inline-flex items-center gap-1')}><Loader2 className="size-3 animate-spin" /> {t('sheets.sheets_editor.speichere')}</span>;
    return <span className="text-[10px] text-emerald-600 inline-flex items-center gap-1"><MaterialIcon name="check" size={16} className="size-3" /> {t('sheets.sheets_editor.gespeichert')}</span>;
}

function PeerPresence({ peers, connected }: { peers: CollabPresence[]; connected: boolean }): JSX.Element {
    const t = useT();
    if (!connected) {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600" title={t('sheets.sheets_editor.verbindung_zum_live-sync_verloren_aender')}>
                <MaterialIcon name="wifi_off" size={16} className="size-3" /> {t('sheets.sheets_editor.offline')}
            </span>
        );
    }
    if (peers.length === 0) {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title={t('sheets.sheets_editor.du_bist_allein_in_dieser_tabelle')}>
                <MaterialIcon name="groups" size={16} className="size-3" /> {t('sheets.sheets_editor.nur_du')}
            </span>
        );
    }
    return (
        <div className="inline-flex items-center gap-1" title={peers.map(p => p.user.displayName).join(', ')}>
            <MaterialIcon name="groups" size={16} className="size-3 text-muted-foreground" />
            <div className="flex -space-x-1">
                {peers.slice(0, 4).map(p => (
                    <span
                        key={p.clientId}
                        className="inline-flex size-5 items-center justify-center rounded-full border-2 border-background text-[9px] font-semibold text-white"
                        style={{ backgroundColor: p.user.color }}
                    >
                        {p.user.displayName.slice(0, 1).toUpperCase()}
                    </span>
                ))}
                {peers.length > 4 && (
                    <span className="inline-flex size-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-semibold">
                        +{peers.length - 4}
                    </span>
                )}
            </div>
        </div>
    );
}

function RoleBadge({ role }: { role: SheetRole }): JSX.Element | null {
    const t = useT();
    if (role === 'OWNER' || role === 'EDITOR') return null;  // Default-Modus, kein Badge
    if (role === 'COMMENTER') {
        return (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300" title={t('sheets.sheets_editor.du_kannst_kommentieren_aber_keine_zellin')}>
                <MaterialIcon name="chat" size={16} className="size-3" /> {t('sheets.sheets_editor.kommentator')}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded bg-zinc-500/10 px-2 py-0.5 text-[10px] text-zinc-700 dark:text-zinc-300" title={t('sheets.sheets_editor.du_kannst_nur_lesen')}>
            <MaterialIcon name="visibility" size={16} className="size-3" /> {t('sheets.sheets_editor.nur_lesen')}
        </span>
    );
}
