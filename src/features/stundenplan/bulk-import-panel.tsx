/**
 * BulkImportPanel (MUST-4) — CSV-Importer + Vorjahres-Kopie.
 *
 * Slide-Over rechts, no-modal. Zwei Tabs:
 *  1. CSV-Import: User paste-en CSV-Text mit Kopfzeile, wir parsen lokal,
 *     POSTen an /bulk-import. Backend liefert imported[] + skipped[] zurueck.
 *  2. Szenarien-Kopie: Source-Scenario + Target + neues validFrom.
 */
import { type JSX, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import {
    createStundenplanGateway,
    type TimetableScenario,
} from '@/gateways/platform/stundenplan-gateway';

const gateway = createStundenplanGateway();

type Tab = 'csv' | 'copy';

const CSV_TEMPLATE = `subjectKey,groupKey,weekday,periodSlotKey,roomLabel,weekParity,spansSlots,teacherIds,validFrom
MA,7a-voll,1,p1,R12,,1,@lehrer1:tenant,2026-09-01
DE,7a-voll,1,p2,R12,,1,@lehrer2:tenant,2026-09-01
EN,7a-half-1,2,p1,R14,,2,@lehrer3:tenant,2026-09-01`;

interface CsvRow {
    subjectKey: string;
    groupKey: string;
    weekday: number;
    periodSlotKey: string;
    roomLabel?: string;
    weekParity?: 'even' | 'odd';
    spansSlots?: number;
    teacherIds?: string[];
    validFrom?: string;
}

function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { rows: [], errors: ['Kopfzeile + mindestens 1 Datenzeile erforderlich.'] };
    const headers = lines[0]!.split(',').map((h) => h.trim());
    const required = ['subjectKey', 'groupKey', 'weekday', 'periodSlotKey'];
    const missing = required.filter((r) => !headers.includes(r));
    if (missing.length > 0) {
        return { rows: [], errors: [`Pflicht-Spalten fehlen: ${missing.join(', ')}`] };
    }
    const errors: string[] = [];
    const rows: CsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i]!.split(',').map((c) => c.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => (obj[h] = cells[idx] ?? ''));
        const weekday = parseInt(obj.weekday ?? '');
        if (isNaN(weekday)) {
            errors.push(`Zeile ${i + 1}: ungueltiger Wochentag`);
            continue;
        }
        const row: CsvRow = {
            subjectKey: obj.subjectKey!,
            groupKey: obj.groupKey!,
            weekday,
            periodSlotKey: obj.periodSlotKey!,
        };
        if (obj.roomLabel) row.roomLabel = obj.roomLabel;
        if (obj.weekParity === 'even' || obj.weekParity === 'odd') row.weekParity = obj.weekParity;
        if (obj.spansSlots) {
            const s = parseInt(obj.spansSlots);
            if (!isNaN(s)) row.spansSlots = s;
        }
        if (obj.teacherIds) row.teacherIds = obj.teacherIds.split(';').map((t) => t.trim()).filter(Boolean);
        if (obj.validFrom) row.validFrom = new Date(obj.validFrom).toISOString();
        rows.push(row);
    }
    return { rows, errors };
}

export function BulkImportPanel({
    open,
    jwt,
    scenarios,
    currentScenarioId,
    onClose,
    onImported,
}: {
    open: boolean;
    jwt: string;
    scenarios: TimetableScenario[];
    currentScenarioId: string | undefined;
    onClose: () => void;
    onImported: () => void;
}): JSX.Element {
    const t = useT();
    const [tab, setTab] = useState<Tab>('csv');
    const [csvText, setCsvText] = useState('');
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ imported: number; skipped: Array<{ row: number; reason: string }> } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Copy-Tab State
    const [sourceId, setSourceId] = useState('');
    const [targetId, setTargetId] = useState('');
    const [newValidFrom, setNewValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
    const [copying, setCopying] = useState(false);
    const [copyResult, setCopyResult] = useState<{ copied: number } | null>(null);

    useEffect(() => {
        if (!open) {
            setCsvText('');
            setResult(null);
            setError(null);
            setCopyResult(null);
        }
    }, [open]);

    async function doImport() {
        setImporting(true);
        setError(null);
        setResult(null);
        try {
            const parsed = parseCsv(csvText);
            if (parsed.errors.length > 0) {
                setError(parsed.errors.join(' · '));
                return;
            }
            const res = await gateway.bulkImport(jwt, {
                scenarioId: currentScenarioId,
                rows: parsed.rows,
            });
            setResult({ imported: res.imported.length, skipped: res.skipped });
            onImported();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setImporting(false);
        }
    }

    async function doCopy() {
        setCopying(true);
        setError(null);
        setCopyResult(null);
        try {
            const res = await gateway.copyScenarioEntries(jwt, {
                sourceScenarioId: sourceId,
                targetScenarioId: targetId,
                newValidFrom: new Date(newValidFrom).toISOString(),
            });
            setCopyResult({ copied: res.copied });
            onImported();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setCopying(false);
        }
    }

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[600px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="upload_file" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.bulk_import_title')}</span>
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex shrink-0 border-b">
                <button
                    onClick={() => setTab('csv')}
                    className={cn(
                        'flex-1 px-3 py-2 text-xs font-medium border-b-2',
                        tab === 'csv' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                >
                    {t('stundenplan.bulk_tab_csv')}
                </button>
                <button
                    onClick={() => setTab('copy')}
                    className={cn(
                        'flex-1 px-3 py-2 text-xs font-medium border-b-2',
                        tab === 'copy' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                >
                    {t('stundenplan.bulk_tab_copy')}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
                {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>}

                {tab === 'csv' && (
                    <>
                        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                            <p>{t('stundenplan.bulk_csv_hint')}</p>
                            <details className="mt-2">
                                <summary className="cursor-pointer font-medium">{t('stundenplan.bulk_csv_template_show')}</summary>
                                <pre className="mt-2 overflow-x-auto rounded bg-background p-2 text-[10px] font-mono">{CSV_TEMPLATE}</pre>
                                <button
                                    onClick={() => setCsvText(CSV_TEMPLATE)}
                                    className="mt-1 text-[11px] text-primary hover:underline"
                                >
                                    {t('stundenplan.bulk_csv_template_use')}
                                </button>
                            </details>
                        </div>

                        <label className="block">
                            <span className="text-xs text-muted-foreground">{t('stundenplan.bulk_csv_paste_label')}</span>
                            <textarea
                                value={csvText}
                                onChange={(e) => setCsvText(e.target.value)}
                                rows={12}
                                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono"
                                placeholder="subjectKey,groupKey,weekday,..."
                            />
                        </label>

                        {result && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
                                <p className="font-medium text-emerald-900 dark:text-emerald-200">
                                    ✓ {result.imported} {t('stundenplan.bulk_imported')}
                                </p>
                                {result.skipped.length > 0 && (
                                    <details className="mt-1">
                                        <summary className="cursor-pointer text-amber-900 dark:text-amber-200">
                                            {result.skipped.length} {t('stundenplan.bulk_skipped')}
                                        </summary>
                                        <ul className="mt-1 list-disc pl-4 space-y-0.5">
                                            {result.skipped.map((s, i) => (
                                                <li key={i}>Zeile {s.row}: {s.reason}</li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                            </div>
                        )}
                    </>
                )}

                {tab === 'copy' && (
                    <>
                        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                            {t('stundenplan.bulk_copy_hint')}
                        </div>

                        <label className="block">
                            <span className="text-xs text-muted-foreground">{t('stundenplan.bulk_copy_source')}</span>
                            <select
                                value={sourceId}
                                onChange={(e) => setSourceId(e.target.value)}
                                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                            >
                                <option value="">— {t('stundenplan.entry_create_choose')} —</option>
                                {scenarios.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-xs text-muted-foreground">{t('stundenplan.bulk_copy_target')}</span>
                            <select
                                value={targetId}
                                onChange={(e) => setTargetId(e.target.value)}
                                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                            >
                                <option value="">— {t('stundenplan.entry_create_choose')} —</option>
                                {scenarios.filter((s) => s.id !== sourceId).map((s) => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-xs text-muted-foreground">{t('stundenplan.bulk_copy_new_valid_from')}</span>
                            <input
                                type="date"
                                value={newValidFrom}
                                onChange={(e) => setNewValidFrom(e.target.value)}
                                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                            />
                        </label>

                        {copyResult && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
                                <p className="font-medium text-emerald-900 dark:text-emerald-200">
                                    ✓ {copyResult.copied} {t('stundenplan.bulk_copied')}
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
                <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">
                    {t('common.cancel', { defaultValue: 'Schliessen' })}
                </button>
                {tab === 'csv' && (
                    <button
                        onClick={doImport}
                        disabled={importing || !csvText.trim()}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        <MaterialIcon name="upload" size={14} />
                        {importing ? '…' : t('stundenplan.bulk_csv_button')}
                    </button>
                )}
                {tab === 'copy' && (
                    <button
                        onClick={doCopy}
                        disabled={copying || !sourceId || !targetId}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        <MaterialIcon name="content_copy" size={14} />
                        {copying ? '…' : t('stundenplan.bulk_copy_button')}
                    </button>
                )}
            </div>
        </div>
    );
}
