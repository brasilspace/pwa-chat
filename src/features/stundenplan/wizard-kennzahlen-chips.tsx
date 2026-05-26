/**
 * WizardKennzahlenChips
 *
 * Drei kompakte Status-Chips fuer den Wizard-Header:
 *   [Bedarf ~420h]  [Angebot 450h]  [2 Faecher offen]
 *
 * Farbe ergibt sich aus dem Versorgungsverhaeltnis:
 *   coverage >= 1.0   → green/blau
 *   coverage >= 0.8   → amber
 *   coverage <  0.8   → red
 *
 * Tooltip beim Hover zeigt die Berechnungsquelle (echte Stundentafel
 * vs. Lehrplan-Schaetzung, Deputate vs. Pauschal-Schaetzung).
 */
import type { JSX } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useWizardKennzahlen } from './use-wizard-kennzahlen';

export function WizardKennzahlenChips({ compact = true }: { compact?: boolean }): JSX.Element | null {
    const k = useWizardKennzahlen();
    if (k.loading) return null;

    const r = k.coverageRatio;
    const supplyTone: 'good' | 'warn' | 'bad' | 'neutral' = r == null ? 'neutral'
        : r >= 1.0 ? 'good'
            : r >= 0.8 ? 'warn'
                : 'bad';

    // Bereitschafts-Chip ganz vorne — Solver-Indikator
    const verdictChip = (() => {
        if (!k.readinessVerdict) return null;
        if (k.readinessVerdict === 'ready') {
            return <Chip icon="check_circle" tone="good" label="Bereit" title="Alle Mindest-Stammdaten vorhanden. Auto-Plan kann starten." />;
        }
        if (k.readinessVerdict === 'warning') {
            return <Chip icon="warning" tone="warn"
                label={`${k.warningCount} Hinweis${k.warningCount === 1 ? '' : 'e'}`}
                title={`Auto-Plan kann starten, ist aber suboptimal:\n${k.warningSummaries.slice(0, 6).join('\n')}`} />;
        }
        return <Chip icon="block" tone="bad"
            label={`${k.blockerCount} Blocker`}
            title={`Auto-Plan kann nicht starten:\n${k.blockerSummaries.slice(0, 6).join('\n')}`} />;
    })();

    return (
        <div className={cn('flex shrink-0 items-center gap-1.5', !compact && 'flex-wrap')}>
            {verdictChip}
            {k.demandHours > 0 && (
                <Chip
                    icon="schedule"
                    tone="neutral"
                    label={`Bedarf ${k.demandSource === 'stundentafel' ? '' : '~'}${k.demandHours}h`}
                    title={
                        k.demandSource === 'stundentafel'
                            ? `Wochenstunden-Bedarf aus der konfigurierten Stundentafel (${k.classCount} Klassen).`
                            : k.demandSource === 'lehrplan-geschaetzt'
                                ? `Geschaetzt aus Lehrplan-Vorlage × ${k.classCount} Klassen (Klassenstufe aus Namen abgeleitet).`
                                : 'Noch unbekannt — Lehrplan oder Stundentafel fehlt.'
                    }
                />
            )}
            {k.teacherCount > 0 && (
                <Chip
                    icon="school"
                    tone={supplyTone}
                    label={`Angebot ${k.supplyHours}h`}
                    title={
                        k.supplySource === 'deputate'
                            ? `Summe der vertraglichen Deputate von ${k.teacherCount} Lehrern.`
                            : `Pauschal-Schaetzung: ${k.teacherCount} Lehrer × 25h (keine Deputate gepflegt).`
                    }
                />
            )}
            {r != null && (
                <Chip
                    icon={r >= 1.0 ? 'check_circle' : 'warning'}
                    tone={supplyTone}
                    label={`${Math.round(r * 100)}%`}
                    title={`Versorgungsgrad: Angebot ÷ Bedarf. ${r >= 1.0 ? 'Ausreichend.' : 'Lehrer-Stunden reichen nicht aus.'}`}
                />
            )}
            {k.missingTeacherSubjects.length > 0 && (
                <Chip
                    icon="error_outline"
                    tone="bad"
                    label={`${k.missingTeacherSubjects.length} Faecher offen`}
                    title={`Kein Lehrer ist fuer folgende Faecher qualifiziert: ${k.missingTeacherSubjects.map(s => s.label).join(', ')}.`}
                />
            )}
        </div>
    );
}

function Chip({ icon, tone, label, title }: {
    icon: string;
    tone: 'good' | 'warn' | 'bad' | 'neutral';
    label: string;
    title: string;
}) {
    const toneCls = {
        good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
        warn: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        bad: 'bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200',
        neutral: 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
    }[tone];
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                toneCls,
            )}
            title={title}
        >
            <MaterialIcon name={icon} size={11} />
            {label}
        </span>
    );
}
