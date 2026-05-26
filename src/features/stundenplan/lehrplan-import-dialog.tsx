/**
 * Lehrplan-Import-Dialog — wendet eine Lehrplan-Vorlage auf gewählte Klassen an.
 *
 * Drei-Schritt-Flow:
 *   1. Vorlage wählen (Liste mit Bundesland-Filter)
 *   2. Klassen ↔ Stufen zuordnen (auto-map + manuelle Korrektur)
 *   3. Preview anzeigen (welche Fächer + Stunden würden angelegt)
 *
 * Erst nach explizitem Bestätigen wird `apply` aufgerufen.
 *
 * UX-Anker: keine Modals (Slide-Over-Pattern), Inputs „flutschig", Audit
 * über Backend-Apply implizit (Subject-Auto-Anlage + Audit-Log).
 */
import { type JSX, useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import {
    createStundenplanGateway,
    type LehrplanSummary,
    type LehrplanTemplate,
    type LehrplanPreview,
    type LehrplanApplyResult,
} from '@/gateways/platform/stundenplan-gateway';

const gateway = createStundenplanGateway();

type Step = 'choose' | 'map' | 'preview' | 'done';

interface ClassRow {
    classSpaceId: string;
    name: string;
}

export function LehrplanImportDialog({
    jwt,
    classes,
    onClose,
    onApplied,
}: {
    jwt: string;
    classes: ClassRow[];
    onClose: () => void;
    onApplied: () => void;
}): JSX.Element {
    const t = useT();
    const [step, setStep] = useState<Step>('choose');
    const [summaries, setSummaries] = useState<LehrplanSummary[]>([]);
    const [bundeslandFilter, setBundeslandFilter] = useState<string>('');
    const [selectedKey, setSelectedKey] = useState<string>('');
    const [template, setTemplate] = useState<LehrplanTemplate | null>(null);
    const [mappings, setMappings] = useState<Map<string, string>>(new Map());
    const [unmapped, setUnmapped] = useState<Array<{ classSpaceId: string; name: string; guessedStage: string | null }>>([]);
    const [overwrite, setOverwrite] = useState(false);
    const [preview, setPreview] = useState<LehrplanPreview | null>(null);
    const [applyResult, setApplyResult] = useState<LehrplanApplyResult | null>(null);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Vorlagen-Liste laden
    useEffect(() => {
        (async () => {
            try {
                const r = await gateway.listLehrplaene(jwt);
                setSummaries(r.templates);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
        })();
    }, [jwt]);

    const filteredSummaries = useMemo(() => {
        if (!bundeslandFilter) return summaries;
        return summaries.filter((s) => s.bundesland === bundeslandFilter);
    }, [summaries, bundeslandFilter]);

    async function chooseTemplate(key: string) {
        setWorking(true);
        setError(null);
        try {
            const r = await gateway.getLehrplan(jwt, key);
            setTemplate(r.template);
            setSelectedKey(key);
            // Auto-Mapping basierend auf Klassen-Namen
            const automap = await gateway.autoMapLehrplan(jwt, key, { classes });
            const m = new Map<string, string>();
            for (const a of automap.mapped) m.set(a.classSpaceId, a.gradeStageKey);
            setMappings(m);
            setUnmapped(automap.unmapped);
            setStep('map');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setWorking(false);
        }
    }

    function setMappingFor(classId: string, stage: string) {
        const next = new Map(mappings);
        if (stage) next.set(classId, stage);
        else next.delete(classId);
        setMappings(next);
    }

    async function runPreview() {
        if (!template) return;
        const classMappings = Array.from(mappings.entries()).map(([classSpaceId, gradeStageKey]) => ({
            classSpaceId, gradeStageKey,
        }));
        if (classMappings.length === 0) {
            setError(t('stundenplan.lehrplan_err_no_mappings'));
            return;
        }
        setWorking(true);
        setError(null);
        try {
            const p = await gateway.previewLehrplan(jwt, selectedKey, { classMappings, overwrite });
            setPreview(p);
            setStep('preview');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setWorking(false);
        }
    }

    async function runApply() {
        const classMappings = Array.from(mappings.entries()).map(([classSpaceId, gradeStageKey]) => ({
            classSpaceId, gradeStageKey,
        }));
        setWorking(true);
        setError(null);
        try {
            const r = await gateway.applyLehrplan(jwt, selectedKey, { classMappings, overwrite });
            setApplyResult(r);
            setStep('done');
            onApplied();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setWorking(false);
        }
    }

    return (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[640px] flex-col border-l bg-background shadow-2xl print:hidden">
            <header className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="library_books" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.lehrplan_dialog_title')}</span>
                <StepIndicator step={step} />
                <button onClick={onClose} className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                    <MaterialIcon name="close" size={18} />
                </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>
                )}

                {step === 'choose' && (
                    <ChooseStep
                        summaries={filteredSummaries}
                        bundeslandFilter={bundeslandFilter}
                        onBundeslandChange={setBundeslandFilter}
                        onChoose={chooseTemplate}
                        working={working}
                    />
                )}

                {step === 'map' && template && (
                    <MapStep
                        template={template}
                        classes={classes}
                        mappings={mappings}
                        unmapped={unmapped}
                        onSetMapping={setMappingFor}
                        overwrite={overwrite}
                        onOverwriteChange={setOverwrite}
                    />
                )}

                {step === 'preview' && preview && template && (
                    <PreviewStep preview={preview} template={template} classes={classes} mappings={mappings} />
                )}

                {step === 'done' && applyResult && (
                    <DoneStep result={applyResult} />
                )}
            </div>

            <footer className="flex shrink-0 justify-between gap-2 border-t border-border px-4 py-3">
                <div>
                    {step === 'map' && (
                        <button onClick={() => setStep('choose')} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">
                            ← {t('common.back', { defaultValue: 'Zurueck' })}
                        </button>
                    )}
                    {step === 'preview' && (
                        <button onClick={() => setStep('map')} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">
                            ← {t('common.back', { defaultValue: 'Zurueck' })}
                        </button>
                    )}
                </div>
                <div className="flex gap-2">
                    {step === 'done' ? (
                        <button onClick={onClose} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                            {t('common.close', { defaultValue: 'Schliessen' })}
                        </button>
                    ) : (
                        <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">
                            {t('common.cancel', { defaultValue: 'Abbrechen' })}
                        </button>
                    )}
                    {step === 'map' && (
                        <button
                            onClick={runPreview}
                            disabled={working || mappings.size === 0}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            <MaterialIcon name="preview" size={14} />
                            {t('stundenplan.lehrplan_next_preview')}
                        </button>
                    )}
                    {step === 'preview' && (
                        <button
                            onClick={runApply}
                            disabled={working}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            <MaterialIcon name="check_circle" size={14} />
                            {t('stundenplan.lehrplan_apply')}
                        </button>
                    )}
                </div>
            </footer>
        </div>
    );
}

// ─── Schritt-Anzeige ─────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
    const t = useT();
    const items: Array<{ key: Step; label: string }> = [
        { key: 'choose', label: t('stundenplan.lehrplan_step_choose') },
        { key: 'map', label: t('stundenplan.lehrplan_step_map') },
        { key: 'preview', label: t('stundenplan.lehrplan_step_preview') },
        { key: 'done', label: t('stundenplan.lehrplan_step_done') },
    ];
    const activeIdx = items.findIndex((i) => i.key === step);
    return (
        <div className="ml-3 flex items-center gap-1 text-[10px] text-muted-foreground">
            {items.map((it, i) => (
                <span key={it.key} className={cn('rounded px-1.5 py-0.5', i === activeIdx && 'bg-primary/10 text-primary font-medium', i < activeIdx && 'text-emerald-600')}>
                    {i + 1}. {it.label}
                </span>
            ))}
        </div>
    );
}

// ─── Schritt 1: Vorlage wählen ───────────────────────────────────

function ChooseStep({
    summaries, bundeslandFilter, onBundeslandChange, onChoose, working,
}: {
    summaries: LehrplanSummary[];
    bundeslandFilter: string;
    onBundeslandChange: (v: string) => void;
    onChoose: (key: string) => void;
    working: boolean;
}) {
    const t = useT();
    const bundeslaender = useMemo(() => {
        const s = new Set<string>();
        summaries.forEach((tt) => s.add(tt.bundesland));
        return Array.from(s).sort();
    }, [summaries]);

    return (
        <div className="space-y-3">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <MaterialIcon name="info" size={14} className="-mt-0.5 mr-1 inline" />
                {t('stundenplan.lehrplan_choose_hint')}
            </div>

            <label className="block text-xs">
                <span className="text-muted-foreground">{t('stundenplan.lehrplan_filter_bundesland')}</span>
                <select
                    value={bundeslandFilter}
                    onChange={(e) => onBundeslandChange(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                    <option value="">— {t('stundenplan.lehrplan_all_bundeslaender')} —</option>
                    {bundeslaender.map((b) => (
                        <option key={b} value={b}>{b}</option>
                    ))}
                </select>
            </label>

            <ul className="space-y-2">
                {summaries.length === 0 && (
                    <li className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">…</li>
                )}
                {summaries.map((s) => (
                    <li key={s.key} className="rounded-md border border-border p-3 hover:border-primary/40 hover:bg-muted/30 cursor-pointer" onClick={() => onChoose(s.key)}>
                        <div className="flex items-center gap-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">{s.bundesland}</span>
                            <h4 className="font-semibold">{s.name}</h4>
                            {s.trackVariant && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{s.trackVariant}</span>
                            )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{s.schulform} · {t('stundenplan.lehrplan_stages')}: {s.stageKeys.join(', ')}</p>
                        {s.notes && <p className="mt-1 text-[11px] text-muted-foreground italic">{s.notes}</p>}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                            {t('stundenplan.lehrplan_source')}: <a href={s.source.url} target="_blank" rel="noreferrer" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{s.source.publisher}</a>
                            {' · '}{t('stundenplan.lehrplan_checked')} {s.source.lastChecked}
                        </p>
                    </li>
                ))}
            </ul>
            {working && <p className="text-xs text-muted-foreground">…</p>}
        </div>
    );
}

// ─── Schritt 2: Klassen ↔ Stufen ─────────────────────────────────

function MapStep({
    template, classes, mappings, unmapped, onSetMapping, overwrite, onOverwriteChange,
}: {
    template: LehrplanTemplate;
    classes: ClassRow[];
    mappings: Map<string, string>;
    unmapped: Array<{ classSpaceId: string; name: string; guessedStage: string | null }>;
    onSetMapping: (classId: string, stage: string) => void;
    overwrite: boolean;
    onOverwriteChange: (v: boolean) => void;
}) {
    const t = useT();
    const stageKeys = Object.keys(template.gradeStages).sort();
    return (
        <div className="space-y-3">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <MaterialIcon name="info" size={14} className="-mt-0.5 mr-1 inline" />
                {t('stundenplan.lehrplan_map_hint')}
            </div>

            {unmapped.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {t('stundenplan.lehrplan_unmapped_warning', { defaultValue: 'Folgende Klassen konnten nicht automatisch zugeordnet werden — bitte manuell waehlen:' })}
                    <ul className="mt-1 list-disc pl-4">
                        {unmapped.map((u) => (
                            <li key={u.classSpaceId}>{u.name}</li>
                        ))}
                    </ul>
                </div>
            )}

            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1.5 pr-2 font-medium">{t('stundenplan.lehrplan_class')}</th>
                        <th className="py-1.5 font-medium w-40">{t('stundenplan.lehrplan_stage')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                    {classes.map((c) => (
                        <tr key={c.classSpaceId}>
                            <td className="py-1.5 pr-2">{c.name}</td>
                            <td className="py-1.5">
                                <select
                                    value={mappings.get(c.classSpaceId) ?? ''}
                                    onChange={(e) => onSetMapping(c.classSpaceId, e.target.value)}
                                    className="block w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                                >
                                    <option value="">— {t('stundenplan.lehrplan_skip_class')} —</option>
                                    {stageKeys.map((sk) => (
                                        <option key={sk} value={sk}>{t('stundenplan.lehrplan_grade')} {sk}</option>
                                    ))}
                                </select>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={overwrite} onChange={(e) => onOverwriteChange(e.target.checked)} />
                <span>{t('stundenplan.lehrplan_overwrite_existing')}</span>
            </label>
        </div>
    );
}

// ─── Schritt 3: Preview ──────────────────────────────────────────

function PreviewStep({
    preview, template, classes, mappings,
}: {
    preview: LehrplanPreview;
    template: LehrplanTemplate;
    classes: ClassRow[];
    mappings: Map<string, string>;
}) {
    const t = useT();
    void template; void classes; void mappings;

    return (
        <div className="space-y-3">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <MaterialIcon name="info" size={14} className="-mt-0.5 mr-1 inline" />
                {t('stundenplan.lehrplan_preview_hint')}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
                <Stat label={t('stundenplan.lehrplan_new_subjects')} value={preview.subjectsToCreate.length} icon="add_circle" color="text-blue-700" />
                <Stat label={t('stundenplan.lehrplan_new_entries')} value={preview.entriesToCreate.length} icon="post_add" color="text-emerald-700" />
                <Stat label={t('stundenplan.lehrplan_overwrite_count')} value={preview.entriesToOverwrite.length} icon="edit" color="text-amber-700" />
                <Stat label={t('stundenplan.lehrplan_skip_count')} value={preview.entriesToSkip.length} icon="skip_next" color="text-muted-foreground" />
            </div>

            {preview.invalidClasses.length > 0 && (
                <Section title={t('stundenplan.lehrplan_invalid_classes')} variant="error">
                    <ul className="text-xs">
                        {preview.invalidClasses.map((id) => <li key={id} className="font-mono">{id}</li>)}
                    </ul>
                </Section>
            )}

            {preview.unknownStages.length > 0 && (
                <Section title={t('stundenplan.lehrplan_unknown_stages')} variant="warn">
                    <ul className="text-xs">
                        {preview.unknownStages.map((u, i) => (
                            <li key={i} className="font-mono">{u.classSpaceId} → {u.stageKey}</li>
                        ))}
                    </ul>
                </Section>
            )}

            {preview.subjectsToCreate.length > 0 && (
                <Section title={t('stundenplan.lehrplan_subjects_to_create_title')}>
                    <ul className="text-xs">
                        {preview.subjectsToCreate.map((s) => (
                            <li key={s.key}><span className="font-mono">{s.key}</span> — {s.label}</li>
                        ))}
                    </ul>
                </Section>
            )}

            {preview.entriesToOverwrite.length > 0 && (
                <Section title={t('stundenplan.lehrplan_overwrite_list_title')} variant="warn">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-muted-foreground">
                                <th className="text-left">{t('stundenplan.lehrplan_subject')}</th>
                                <th className="text-right">{t('stundenplan.lehrplan_current_hours')}</th>
                                <th className="text-right">{t('stundenplan.lehrplan_new_hours')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {preview.entriesToOverwrite.slice(0, 30).map((e, i) => (
                                <tr key={i}>
                                    <td className="font-mono">{e.subjectKey}</td>
                                    <td className="text-right">{e.currentHours}</td>
                                    <td className="text-right font-medium">{e.newHours}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {preview.entriesToOverwrite.length > 30 && (
                        <p className="text-[10px] text-muted-foreground mt-1">… +{preview.entriesToOverwrite.length - 30} weitere</p>
                    )}
                </Section>
            )}
        </div>
    );
}

// ─── Schritt 4: Ergebnis ─────────────────────────────────────────

function DoneStep({ result }: { result: LehrplanApplyResult }) {
    const t = useT();
    return (
        <div className="space-y-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
                    <MaterialIcon name="check_circle" size={20} />
                    <h3 className="text-base font-semibold">{t('stundenplan.lehrplan_done_title')}</h3>
                </div>
                <ul className="mt-2 space-y-0.5 text-sm text-emerald-900 dark:text-emerald-200">
                    <li>✓ {result.createdSubjects} {t('stundenplan.lehrplan_done_subjects')}</li>
                    <li>✓ {result.createdEntries} {t('stundenplan.lehrplan_done_new')}</li>
                    <li>↻ {result.overwrittenEntries} {t('stundenplan.lehrplan_done_overwritten')}</li>
                    <li>· {result.skippedEntries} {t('stundenplan.lehrplan_done_skipped')}</li>
                </ul>
            </div>
            {(result.invalidClasses.length > 0 || result.unknownStages.length > 0) && (
                <Section title={t('stundenplan.lehrplan_done_warnings')} variant="warn">
                    {result.invalidClasses.map((id) => <p key={id} className="text-xs font-mono">Klasse nicht gefunden: {id}</p>)}
                    {result.unknownStages.map((u, i) => <p key={i} className="text-xs font-mono">Stufe unbekannt: {u.classSpaceId} → {u.stageKey}</p>)}
                </Section>
            )}
        </div>
    );
}

function Stat({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
    return (
        <div className="flex items-center gap-2 rounded-md border border-border p-2">
            <MaterialIcon name={icon} size={16} className={color} />
            <div className="flex-1">
                <div className="text-lg font-semibold">{value}</div>
                <div className="text-[10px] text-muted-foreground">{label}</div>
            </div>
        </div>
    );
}

function Section({ title, variant, children }: { title: string; variant?: 'warn' | 'error'; children: React.ReactNode }) {
    const cls = variant === 'error'
        ? 'border-destructive/40 bg-destructive/5 text-destructive'
        : variant === 'warn'
            ? 'border-amber-200 bg-amber-50/40 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200'
            : 'border-border bg-muted/20';
    return (
        <div className={cn('rounded-md border p-3', cls)}>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide">{title}</h4>
            {children}
        </div>
    );
}
