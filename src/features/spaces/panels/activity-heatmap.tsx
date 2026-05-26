/**
 * Activity Heatmap Component (Hochkant-Layout)
 *
 * Rendert einen GitHub-Style Contribution-Graph fuer einen Space, optimiert
 * fuer schmale Panels: 7 Spalten (Mo-So) x ca. 53 Zeilen (Wochen), oben
 * alt, unten aktuell. Jede Zelle entspricht einem Tag, gefaerbt nach
 * Aktivitaets-Intensitaet (5 Stufen von grau bis kraeftigem Gruen).
 *
 * Das Layout ist bewusst hochkant, weil die Heatmap in einer Side-Panel-
 * Breite steckt, in der die klassische 53-Wochen-Zeile nicht hineinpasst.
 * Dafuer skaliert die Hoehe mit dem Zeitraum — bei 365 Tagen also
 * 53 Zeilen × Zellhoehe.
 */
import { useEffect, useState, useMemo, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from "@/lib/i18n/use-t";

const gateway = createPlatformGateway();

// GitHub green palette (light mode) — 5 levels
const COLORS = [
    'var(--heatmap-0, #ebedf0)',  // 0: no activity
    'var(--heatmap-1, #9be9a8)',  // 1: low
    'var(--heatmap-2, #40c463)',  // 2: medium
    'var(--heatmap-3, #30a14e)',  // 3: high
    'var(--heatmap-4, #216e39)',  // 4: very high
];

const DARK_COLORS = [
    '#161b22',  // 0
    '#0e4429',  // 1
    '#006d32',  // 2
    '#26a641',  // 3
    '#39d353',  // 4
];

// Vollstaendige Labels fuer das Hochkant-Layout (oben, je Spalte)
const DAY_LABELS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

interface DayData {
    date: string;
    count: number;
}

interface HeatmapResponse {
    days: DayData[];
    summary: {
        total: number;
        activeDays: number;
        maxCount: number;
        periodDays: number;
    };
}

function getLevel(count: number, maxCount: number): number {
    if (count === 0) return 0;
    if (maxCount === 0) return 0;
    const ratio = count / maxCount;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
}

interface ActivityHeatmapProps {
    spaceId: string;
}

export function ActivityHeatmap({ spaceId }: ActivityHeatmapProps) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [data, setData] = useState<HeatmapResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        setLoading(true);
        gateway.fetchJson<HeatmapResponse>(jwt, `/platform/v1/spaces/${encodeURIComponent(spaceId)}/activity/heatmap`)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [jwt, spaceId]);

    // Detect dark mode
    const isDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const palette = isDark ? DARK_COLORS : COLORS;

    // Datensatz auf den "gemessenen" Bereich trimmen: alles vor dem ersten
    // Tag mit Aktivitaet abschneiden. So verschwinden die leeren Monate,
    // die der Backend-Endpoint (365 Tage fix) zurueckliefert, wenn ein
    // Space juenger als ein Jahr ist. Der erste Aktivitaets-Tag wird auf
    // den Montag seiner Woche gerundet, damit das Grid-Layout nicht
    // schief anfaengt.
    // Sonderfall: wenn es gar keine Aktivitaet gibt, zeigen wir die
    // letzten 4 Wochen als Platzhalter.
    const trimmedDays = useMemo(() => {
        if (!data || data.days.length === 0) return [] as DayData[];

        const firstActiveIdx = data.days.findIndex((d) => d.count > 0);
        if (firstActiveIdx < 0) {
            // Keine Aktivitaet — zeige nur die letzten 28 Tage
            return data.days.slice(-28);
        }

        // Auf Wochenanfang (Montag) zurueckrunden, damit die erste Zeile
        // komplett ist und das Monats-Label passt.
        const firstActiveDate = new Date(data.days[firstActiveIdx].date);
        const dow = (firstActiveDate.getDay() + 6) % 7; // Mo=0..So=6
        const startIdx = Math.max(0, firstActiveIdx - dow);
        return data.days.slice(startIdx);
    }, [data]);

    // Grid bauen: N Zeilen (Wochen, oben alt → unten heute) x 7 Spalten (Mo-So).
    const grid = useMemo(() => {
        if (trimmedDays.length === 0) return [];

        const weeks: Array<Array<DayData | null>> = [];
        let currentWeek: Array<DayData | null> = [];

        // Erste Woche mit Leer-Zellen auffuellen, falls der Datenbereich nicht
        // an einem Montag startet (Montag = 0). Dank trimmedDays passiert
        // das fast nie, aber defensiv halten.
        const firstDate = new Date(trimmedDays[0].date);
        const firstDow = (firstDate.getDay() + 6) % 7;
        for (let i = 0; i < firstDow; i++) currentWeek.push(null);

        for (const day of trimmedDays) {
            currentWeek.push(day);
            if (currentWeek.length === 7) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
        }
        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) currentWeek.push(null);
            weeks.push(currentWeek);
        }

        return weeks;
    }, [trimmedDays]);

    // Monats-Labels links neben den Zeilen: jede Woche, in der ein neuer
    // Monat beginnt, bekommt ein Label.
    const monthPositions = useMemo(() => {
        if (!data || grid.length === 0) return [];

        const positions: Array<{ label: string; row: number }> = [];
        let lastMonth = -1;

        for (let row = 0; row < grid.length; row++) {
            const firstDay = grid[row].find((d) => d !== null);
            if (firstDay) {
                const month = new Date(firstDay.date).getMonth();
                if (month !== lastMonth) {
                    positions.push({ label: MONTH_LABELS[month], row });
                    lastMonth = month;
                }
            }
        }
        return positions;
    }, [data, grid]);

    if (loading) {
        return <div className="py-4 text-xs text-muted-foreground">{t('spaces.panels.activity_heatmap.lade_aktivitaet')}</div>;
    }

    if (!data || data.days.length === 0) {
        return <div className="py-4 text-xs text-muted-foreground">{t('spaces.panels.activity_heatmap.keine_aktivitaetsdaten_vorhanden')}</div>;
    }

    // Layout-Konstanten fuer Hochkant-Darstellung
    const cellSize = 10;
    const cellGap = 2;
    const step = cellSize + cellGap;
    const labelWidth = 28; // Platz fuer Monats-Kuerzel links
    const headerHeight = 14; // Platz fuer Tag-Buchstaben oben
    const svgWidth = labelWidth + 7 * step;
    const svgHeight = headerHeight + grid.length * step;

    return (
        <div>
            {/* Summary — zeigt den tatsaechlich dargestellten Zeitraum,
                nicht die vom Backend gelieferten 365 Tage (die werden oben
                auf den ersten Aktivitaetstag zurueckgetrimmt). */}
            <div className="mb-3 flex items-baseline gap-3">
                <span className="text-sm font-semibold">{data.summary.total}</span>
                <span className="text-xs text-muted-foreground">
                    {t('spaces.panels.activity_heatmap.aktivitaeten_in')} {trimmedDays.length} {t('spaces.panels.activity_heatmap.tagen')}
                </span>
            </div>

            {/* Heatmap SVG (Hochkant) */}
            <div className="overflow-y-auto">
                <svg width={svgWidth} height={svgHeight} className="block">
                    {/* Tag-Labels oben: M D M D F S S (= Mo Di Mi Do Fr Sa So) */}
                    {DAY_LABELS.map((label, col) => (
                        <text
                            key={col}
                            x={labelWidth + col * step + cellSize / 2}
                            y={headerHeight - 4}
                            textAnchor="middle"
                            className="fill-muted-foreground"
                            fontSize={8}
                            fontFamily="system-ui, sans-serif"
                        >
                            {label}
                        </text>
                    ))}

                    {/* Monats-Labels links, an der ersten Woche des Monats */}
                    {monthPositions.map((m, i) => (
                        <text
                            key={i}
                            x={0}
                            y={headerHeight + m.row * step + cellSize - 1}
                            className="fill-muted-foreground"
                            fontSize={9}
                            fontFamily="system-ui, sans-serif"
                        >
                            {m.label}
                        </text>
                    ))}

                    {/* Zellen: Zeile = Woche, Spalte = Wochentag */}
                    {grid.map((week, row) =>
                        week.map((day, col) => {
                            if (!day) return null;
                            const level = getLevel(day.count, data.summary.maxCount);
                            const x = labelWidth + col * step;
                            const y = headerHeight + row * step;
                            const dateStr = new Date(day.date).toLocaleDateString('de-DE', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                            });

                            return (
                                <Tooltip key={day.date}>
                                    <TooltipTrigger asChild>
                                        <rect
                                            x={x}
                                            y={y}
                                            width={cellSize}
                                            height={cellSize}
                                            rx={2}
                                            fill={palette[level]}
                                            className="outline-none transition-opacity hover:opacity-80"
                                        />
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="text-xs">
                                        <strong>
                                            {day.count} {t('spaces.panels.activity_heatmap.aktivitaet')}{day.count !== 1 ? 'en' : ''}
                                        </strong>
                                        <span className="ml-1 text-muted-foreground">am {dateStr}</span>
                                    </TooltipContent>
                                </Tooltip>
                            );
                        })
                    )}
                </svg>
            </div>

            {/* Legende */}
            <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                <span>{t('spaces.panels.activity_heatmap.weniger')}</span>
                {palette.map((color, i) => (
                    <div
                        key={i}
                        className="size-[10px] rounded-[2px]"
                        style={{ backgroundColor: color }}
                    />
                ))}
                <span>{t('spaces.panels.activity_heatmap.mehr')}</span>
            </div>
        </div>
    );
}
