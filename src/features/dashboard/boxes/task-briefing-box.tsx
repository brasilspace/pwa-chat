import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { BoxShell, BoxEmpty, BoxSkeleton } from './box-shell';
import { useT } from "@/lib/i18n/use-t";

interface TaskItem {
    id: string;
    title: string;
    spaceId: string;
    spaceName: string;
    dueDate: string | null;
    daysOverdue?: number;
}

interface TaskBriefingData {
    empty: boolean;
    total: number;
    spaceCount: number;
    overdue: TaskItem[];
    dueToday: TaskItem[];
    upcoming: TaskItem[];
}

/**
 * Box "Aufgaben-Briefing"
 *
 * Ersetzt das frueher als Chat-Notice in den ersten Space gepostete
 * Cron-Briefing. Liefert live aus /platform/v1/dashboard/task-briefing.
 *
 * Empty-State: wenn nichts brennt (kein ueberfaellig, kein heute faellig,
 * weniger als 3 offene Aufgaben) zeigt die Box "Alles im Griff".
 */
export function TaskBriefingBox(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [data, setData] = useState<TaskBriefingData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        const gw = createPlatformGateway();
        gw.fetchJson<TaskBriefingData>(jwt, '/platform/v1/dashboard/task-briefing')
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [jwt]);

    const headerAction = data && !data.empty ? (
        <a href="/my-tasks" className="text-xs text-primary hover:underline">
            {t('dashboard.boxes.task_briefing.alle_ansehen')}
        </a>
    ) : undefined;

    return (
        <BoxShell
            icon={<MaterialIcon name="checklist" size={16} className="size-4" />}
            title={t('dashboard.boxes.task_briefing.aufgaben-briefing')}
            action={headerAction}
        >
            {loading && <BoxSkeleton />}
            {!loading && data?.empty && (
                <BoxEmpty>{t('dashboard.boxes.task_briefing.alles_im_griff_keine_dringenden_aufgaben')}</BoxEmpty>
            )}
            {!loading && data && !data.empty && (
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        {data.total} {t('dashboard.boxes.task_briefing.offene_aufgabe')}{data.total === 1 ? '' : 'n'} in {data.spaceCount} {t('dashboard.boxes.task_briefing.space')}{data.spaceCount === 1 ? '' : 's'}
                    </p>

                    {data.overdue.length > 0 && (
                        <TaskSection
                            label={`${data.overdue.length} ueberfaellig`}
                            tone="critical"
                            tasks={data.overdue}
                            showDaysOverdue
                        />
                    )}

                    {data.dueToday.length > 0 && (
                        <TaskSection
                            label={`${data.dueToday.length} heute faellig`}
                            tone="warning"
                            tasks={data.dueToday}
                        />
                    )}

                    {data.upcoming.length > 0 && data.overdue.length + data.dueToday.length < 5 && (
                        <TaskSection
                            label={t('dashboard.boxes.task_briefing.naechste')}
                            tone="neutral"
                            tasks={data.upcoming.slice(0, 5 - data.overdue.length - data.dueToday.length)}
                        />
                    )}
                </div>
            )}
        </BoxShell>
    );
}

type Tone = 'critical' | 'warning' | 'neutral';

function TaskSection({
    label, tone, tasks, showDaysOverdue,
}: {
    label: string;
    tone: Tone;
    tasks: TaskItem[];
    showDaysOverdue?: boolean;
}): JSX.Element {
    const dotClass = tone === 'critical'
        ? 'bg-red-500'
        : tone === 'warning' ? 'bg-amber-500' : 'bg-muted-foreground';
    const labelClass = tone === 'critical'
        ? 'text-red-600 dark:text-red-400'
        : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';

    return (
        <div>
            <div className="mb-1 flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${dotClass}`} />
                <span className={`text-xs font-medium ${labelClass}`}>{label}</span>
            </div>
            <ul className="ml-3.5 space-y-1 border-l border-border pl-3">
                {tasks.map((_t) => (
                    <li key={_t.id} className="flex items-baseline justify-between gap-2 text-xs">
                        <a
                            href={`/spaces/${_t.spaceId}#task=${_t.id}`}
                            className="truncate hover:underline"
                            title={`${_t.title} (${_t.spaceName})`}
                        >
                            {_t.title}
                        </a>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                            {showDaysOverdue && _t.daysOverdue !== undefined ? `${_t.daysOverdue}d` : _t.spaceName}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
