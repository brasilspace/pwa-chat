import { type JSX, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import ReactECharts from 'echarts-for-react';
import { Loader2 } from 'lucide-react';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { MaterialIcon } from '@/components/ui/material-icon';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { useT } from "@/lib/i18n/use-t";

/**
 * Aktivitaets-Chart-Tab im SpaceSidePanel.
 *
 * Liest /spaces/:id/activity/heatmap (365 Tage) und rendert die letzten
 * 90 Tage als Linien-/Flaechen-Chart. Komplementaer zur ActivityHeatmap-
 * Komponente in den Sidepanel-Tooltips: Heatmap-Style fuer Long-Range,
 * Chart fuer Trend-Lesen.
 */
interface HeatmapResponse {
    days: { date: string; count: number }[];
    summary: {
        total: number;
        activeDays: number;
        maxCount: number;
        periodDays: number;
    };
}

export function ActivityChartPanel({ space }: { space: SpaceItem }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const gateway = useMemo(() => createPlatformGateway(), []);

    const [data, setData] = useState<HeatmapResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState<30 | 90 | 365>(90);

    useEffect(() => {
        if (!jwt) return;
        let aborted = false;
        setLoading(true);
        gateway.fetchJson<HeatmapResponse>(jwt, `/platform/v1/spaces/${encodeURIComponent(space.id)}/activity/heatmap`)
            .then(r => { if (!aborted) setData(r); })
            .catch(() => { if (!aborted) setData(null); })
            .finally(() => { if (!aborted) setLoading(false); });
        return () => { aborted = true; };
    }, [jwt, gateway, space.id]);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!data || data.days.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-xs text-muted-foreground">
                <MaterialIcon name="show_chart" size={36} className="text-muted-foreground/40" />
                <p className="mt-3">{t('spaces.panels.activity_chart.keine_aktivitaets-daten_verfuegbar')}</p>
            </div>
        );
    }

    const tail = data.days.slice(-range);
    const labels = tail.map(d => d.date);
    const values = tail.map(d => d.count);
    const total = values.reduce((s, v) => s + v, 0);
    const activeDays = values.filter(v => v > 0).length;
    const max = Math.max(...values, 0);

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: (params: { name: string; value: number }[]) => {
                const p = params[0];
                const date = new Date(p.name).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
                return `<b>${date}</b><br/>${p.value} Aktion${p.value === 1 ? '' : 'en'}`;
            },
        },
        grid: { left: 40, right: 16, top: 12, bottom: 32, containLabel: true },
        xAxis: {
            type: 'category',
            data: labels,
            boundaryGap: false,
            axisLabel: {
                fontSize: 10,
                hideOverlap: true,
                formatter: (v: string) => {
                    const d = new Date(v);
                    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
                },
            },
        },
        yAxis: {
            type: 'value',
            axisLabel: { fontSize: 10 },
            splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } },
        },
        series: [{
            type: 'line',
            data: values,
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 2 },
            areaStyle: { opacity: 0.2 },
            itemStyle: { color: 'hsl(var(--primary))' },
        }],
    };

    return (
        <div className="flex h-full flex-col">
            {/* Range-Switcher + Summary */}
            <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
                <div className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{total}</span> {t('spaces.panels.activity_chart.aktionen')}{' '}
                    <span className="font-semibold text-foreground">{activeDays}</span> {t('spaces.panels.activity_chart.aktive_tage')}{' '}
                    {t('spaces.panels.activity_chart.max')} <span className="font-semibold text-foreground">{max}</span>{t('spaces.panels.activity_chart.tag')}
                </div>
                <div className="flex gap-0.5">
                    {([30, 90, 365] as const).map(n => (
                        <button
                            key={n}
                            type="button"
                            onClick={() => setRange(n)}
                            className={
                                'rounded px-2 py-1 text-[11px] transition-colors ' +
                                (range === n
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                            }
                        >
                            {n}d
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart */}
            <div className="min-h-0 flex-1 p-2">
                <ReactECharts
                    option={option}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                />
            </div>
        </div>
    );
}
