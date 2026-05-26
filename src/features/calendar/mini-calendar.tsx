import { type JSX, useState, useMemo, useCallback } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { getMonthNames, getWeekdayNames } from '@/lib/i18n/locale-date';

interface MiniCalendarProps {
    /** Aktuell ausgewaehltes Datum (wird hervorgehoben) */
    selected?: Date | null;
    /** Klick auf einen Tag — Aufrufer entscheidet (z.B. Wechsel in die Tagesansicht). */
    onSelect?: (date: Date) => void;
    /**
     * Klick auf eine Kalenderwoche (KW-Spalte). Argument = Wochenstart (Montag).
     * Wenn nicht gesetzt, ist die KW-Spalte nicht klickbar.
     */
    onSelectWeek?: (weekStart: Date) => void;
}

/** ISO-Wochennummer (Mo=1) */
function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * MiniCalendar — kompakter Monatskalender fuer die Sidebar.
 *
 * - Wochennummern links
 * - Monat + Jahr linkbuendig, Pfeile rechtsbuendig
 * - Heutiger Tag hervorgehoben, ausgewaehlter Tag markiert
 */
export function MiniCalendar({ selected, onSelect, onSelectWeek }: MiniCalendarProps): JSX.Element {
    const today = useMemo(() => new Date(), []);
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const MONTH_NAMES = useMemo(() => getMonthNames(), []);
    const DAY_LABELS = useMemo(() => getWeekdayNames('short'), []);

    const prev = useCallback(() => {
        setViewMonth((m) => {
            if (m === 0) { setViewYear((y) => y - 1); return 11; }
            return m - 1;
        });
    }, []);

    const next = useCallback(() => {
        setViewMonth((m) => {
            if (m === 11) { setViewYear((y) => y + 1); return 0; }
            return m + 1;
        });
    }, []);

    // Wochen-Zeilen berechnen: jede Zeile = [Date | null] x 7 (Mo-So)
    const weeks = useMemo(() => {
        const firstDay = new Date(viewYear, viewMonth, 1);
        // Wochentag: 0=So → umrechnen auf Mo=0
        const startDow = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        const cells: (Date | null)[] = [];
        // Leere Zellen vor dem 1.
        for (let i = 0; i < startDow; i++) cells.push(null);
        // Tage des Monats
        for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));
        // Auffuellen bis volle Woche
        while (cells.length % 7 !== 0) cells.push(null);

        const rows: (Date | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
        return rows;
    }, [viewMonth, viewYear]);

    return (
        <div className="px-2 pb-3">
            {/* Header: Monat + Pfeile */}
            <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-foreground">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <div className="flex items-center gap-0.5">
                    <button onClick={prev} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MaterialIcon name="chevron_left" size={16} className="size-3.5" />
                    </button>
                    <button onClick={next} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MaterialIcon name="chevron_right" size={16} className="size-3.5" />
                    </button>
                </div>
            </div>

            {/* Tabelle */}
            <table className="w-full border-collapse text-center text-[10px]">
                <thead>
                    <tr>
                        <th className="w-5 pb-0.5 text-[9px] font-normal text-muted-foreground/60">KW</th>
                        {DAY_LABELS.map((d) => (
                            <th key={d} className="pb-0.5 font-normal text-muted-foreground/70">{d}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {weeks.map((week, wi) => {
                        // Wochennummer vom ersten echten Tag der Zeile
                        const firstDate = week.find((d) => d !== null);
                        const wn = firstDate ? getWeekNumber(firstDate) : '';
                        // Wochenstart (Montag) — wenn der 1. Wochentag der Zeile
                        // ein null-Slot ist (Monatsanfang im Kalender), aus dem
                        // ersten echten Datum + Wochentag-Offset zurueckrechnen.
                        const weekStart = firstDate ? (() => {
                            const dow = (firstDate.getDay() + 6) % 7;
                            const d = new Date(firstDate);
                            d.setDate(d.getDate() - dow);
                            return d;
                        })() : null;
                        return (
                            <tr key={wi}>
                                <td className="p-0">
                                    {onSelectWeek && weekStart ? (
                                        <button
                                            onClick={() => onSelectWeek(weekStart)}
                                            title={`KW ${wn}`}
                                            className="mx-auto flex size-5 items-center justify-center rounded text-[9px] tabular-nums text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                                        >
                                            {wn}
                                        </button>
                                    ) : (
                                        <span className="block pr-0.5 text-[9px] tabular-nums text-muted-foreground/50">{wn}</span>
                                    )}
                                </td>
                                {week.map((date, di) => {
                                    if (!date) return <td key={di} />;
                                    const isToday = isSameDay(date, today);
                                    const isSelected = selected ? isSameDay(date, selected) : false;
                                    const isWeekend = di >= 5;
                                    return (
                                        <td key={di} className="p-0">
                                            <button
                                                onClick={() => onSelect?.(date)}
                                                className={cn(
                                                    'mx-auto flex size-5 items-center justify-center rounded-full tabular-nums transition-colors',
                                                    isSelected && 'bg-primary text-primary-foreground',
                                                    isToday && !isSelected && 'bg-primary/15 font-semibold text-primary',
                                                    !isToday && !isSelected && isWeekend && 'text-muted-foreground/60',
                                                    !isToday && !isSelected && !isWeekend && 'text-foreground hover:bg-muted',
                                                )}
                                            >
                                                {date.getDate()}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
