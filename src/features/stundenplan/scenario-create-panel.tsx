/**
 * ScenarioCreatePanel — Slide-Over zum Anlegen eines neuen Stundenplan-
 * Szenarios.
 *
 * Drei Felder:
 *   - Name (Pflicht)
 *   - Beschreibung (optional)
 *   - Basis-Szenario (optional) — wenn gesetzt, kopiert das Backend die
 *     Eintraege des Basis-Szenarios in das neue Szenario.
 *
 * Nach erfolgreichem Anlegen ruft `onCreated(scenarioId)` auf, sodass der
 * Hub das neue Szenario direkt auswaehlen kann.
 */
import { type JSX, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import {
    createStundenplanGateway,
    type TimetableScenario,
} from '@/gateways/platform/stundenplan-gateway';

interface Props {
    open: boolean;
    onClose: () => void;
    onCreated: (scenarioId: string) => void;
    jwt: string;
    scenarios: TimetableScenario[];
}

const gateway = createStundenplanGateway();

export function ScenarioCreatePanel({ open, onClose, onCreated, jwt, scenarios }: Props): JSX.Element {
    const t = useT();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [baseScenarioId, setBaseScenarioId] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function reset() {
        setName('');
        setDescription('');
        setBaseScenarioId('');
        setError(null);
    }

    async function submit() {
        if (!name.trim()) {
            setError(t('stundenplan.scenario_create_name_required'));
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            const r = await gateway.createScenario(jwt, {
                name: name.trim(),
                description: description.trim() || undefined,
                baseScenarioId: baseScenarioId || undefined,
            });
            reset();
            onCreated(r.scenario.id);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="add_circle" size={18} className="text-primary" />
                <span className="text-sm font-semibold">{t('stundenplan.scenario_create_title')}</span>
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t('common.close')}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        {error}
                    </div>
                )}

                <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                    {t('stundenplan.scenario_create_intro')}
                </p>

                <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                        {t('stundenplan.scenario_create_name_label')} *
                    </span>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        placeholder={t('stundenplan.scenario_create_name_placeholder')}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        maxLength={120}
                    />
                </label>

                <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                        {t('stundenplan.scenario_create_description_label')}
                    </span>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder={t('stundenplan.scenario_create_description_placeholder')}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        maxLength={2000}
                    />
                </label>

                <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">
                        {t('stundenplan.scenario_create_base_label')}
                    </span>
                    <select
                        value={baseScenarioId}
                        onChange={(e) => setBaseScenarioId(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                        <option value="">— {t('stundenplan.scenario_create_base_none')} —</option>
                        {scenarios.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} ({s.status})
                            </option>
                        ))}
                    </select>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                        {t('stundenplan.scenario_create_base_hint')}
                    </span>
                </label>
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2">
                <button
                    onClick={onClose}
                    className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    {t('common.cancel')}
                </button>
                <button
                    onClick={submit}
                    disabled={submitting || !name.trim()}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    <MaterialIcon name={submitting ? 'autorenew' : 'add'} size={14} className={submitting ? 'animate-spin' : ''} />
                    {submitting ? t('common.saving') : t('stundenplan.scenario_create_submit')}
                </button>
            </div>
        </div>
    );
}
