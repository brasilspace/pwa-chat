/**
 * my-tasks-world.tsx — Sidebar-Inhalt fuer den Aufgaben-Hub.
 *
 * Pattern wie UsersWorld: Filter-Listen mit Counts, klickbar fuer Toggle.
 * Filter-State liegt in my-tasks-filters.ts (localStorage-persistent).
 */

import { type JSX, useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import type { MyTaskItem, WorkItemPriority, WorkItemStatus } from '@/features/project/project-types';
import {
    urgencyFilterStore, statusFilterStore, spaceFilterStore, priorityFilterStore, personFilterStore,
    type UrgencyFilter, type StatusFilter,
} from './my-tasks-filters';
import { useContacts } from '@/features/contacts/use-contacts';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const gateway = createProjectGateway();

interface MyTasksWorldProps {
    collapsed: boolean;
}

function daysUntilDue(dueDate: string | null): number | null {
    if (!dueDate) return null;
    return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
}

function urgencyOf(t: { dueDate: string | null }): UrgencyFilter {
    const d = daysUntilDue(t.dueDate);
    if (d === null) return 'nodue';
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    if (d <= 7) return 'thisWeek';
    if (d <= 31) return 'thisMonth';
    return 'later';
}

const URGENCY_ROWS: { key: NonNullable<UrgencyFilter>; icon: string; iconColor: string; labelKey: string }[] = [
    { key: 'overdue', icon: 'warning', iconColor: '#ef4444', labelKey: 'app.misc.ueberfaellig' },
    { key: 'today', icon: 'today', iconColor: '#f59e0b', labelKey: 'app.misc.heute' },
    { key: 'thisWeek', icon: 'date_range', iconColor: '#3b82f6', labelKey: 'app.misc.diese_woche' },
    { key: 'thisMonth', icon: 'calendar_month', iconColor: '#8b5cf6', labelKey: 'app.misc.diesen_monat' },
    { key: 'later', icon: 'schedule_send', iconColor: '#6b7280', labelKey: 'app.misc.spaeter' },
    { key: 'nodue', icon: 'event_busy', iconColor: '#94a3b8', labelKey: 'app.misc.ohne_datum' },
];

const STATUS_ROWS: { key: StatusFilter; icon: string; iconColor: string; labelKey: string }[] = [
    { key: 'open', icon: 'inbox', iconColor: '#0ea5e9', labelKey: 'app.misc.offene' },
    { key: 'todo', icon: 'radio_button_unchecked', iconColor: '#94a3b8', labelKey: 'app.misc.zu_erledigen' },
    { key: 'in_progress', icon: 'schedule', iconColor: '#f59e0b', labelKey: 'app.misc.in_arbeit' },
    { key: 'review', icon: 'rate_review', iconColor: '#3b82f6', labelKey: 'common.review' },
    { key: 'done', icon: 'check_circle', iconColor: '#10b981', labelKey: 'common.done' },
];

const PRIORITY_ROWS: { key: WorkItemPriority; icon: string; iconColor: string; labelKey: string }[] = [
    { key: 'critical', icon: 'priority_high', iconColor: '#ef4444', labelKey: 'app.misc.kritisch' },
    { key: 'high', icon: 'arrow_upward', iconColor: '#f59e0b', labelKey: 'app.misc.hoch' },
    { key: 'medium', icon: 'remove', iconColor: '#3b82f6', labelKey: 'app.misc.mittel' },
    { key: 'low', icon: 'arrow_downward', iconColor: '#94a3b8', labelKey: 'app.misc.niedrig' },
];

export function MyTasksWorld({ collapsed }: MyTasksWorldProps): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();

    const urgencyFilter = useSyncExternalStore(urgencyFilterStore.subscribe, urgencyFilterStore.getSnapshot);
    const statusFilter = useSyncExternalStore(statusFilterStore.subscribe, statusFilterStore.getSnapshot);
    const spaceFilter = useSyncExternalStore(spaceFilterStore.subscribe, spaceFilterStore.getSnapshot);
    const priorityFilter = useSyncExternalStore(priorityFilterStore.subscribe, priorityFilterStore.getSnapshot);
    const personFilter = useSyncExternalStore(personFilterStore.subscribe, personFilterStore.getSnapshot);
    const { contacts } = useContacts();

    const [tasks, setTasks] = useState<MyTaskItem[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        try {
            // includeDone:true damit der "Erledigt"-Filter etwas zaehlt
            const res = await gateway.getMyTasks(jwt, { includeDone: true });
            setTasks(res.items ?? []);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    // ── Counts ──────────────────────────────────────────────────────────
    const openTasks = useMemo(() => tasks.filter(_t => _t.status !== 'done'), [tasks]);

    const urgencyCounts = useMemo(() => {
        const counts: Record<NonNullable<UrgencyFilter>, number> = {
            overdue: 0, today: 0, thisWeek: 0, thisMonth: 0, later: 0, nodue: 0,
        };
        for (const t of openTasks) counts[urgencyOf(t) as NonNullable<UrgencyFilter>]++;
        return counts;
    }, [openTasks]);

    const statusCounts = useMemo(() => ({
        open: openTasks.length,
        todo: tasks.filter(_t => _t.status === 'todo').length,
        in_progress: tasks.filter(_t => _t.status === 'in_progress').length,
        review: tasks.filter(_t => _t.status === 'review').length,
        done: tasks.filter(_t => _t.status === 'done').length,
    }), [tasks, openTasks]);

    const priorityCounts = useMemo(() => {
        const counts: Record<WorkItemPriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const t of openTasks) counts[t.priority]++;
        return counts;
    }, [openTasks]);

    const spaceCounts = useMemo(() => {
        const map = new Map<string, { id: string; name: string; color: string | null; count: number }>();
        for (const t of openTasks) {
            const cur = map.get(t.spaceId);
            if (cur) { cur.count++; }
            else map.set(t.spaceId, { id: t.spaceId, name: t.spaceName, color: t.spaceColor, count: 1 });
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    }, [openTasks]);

    // Verantwortliche/Bearbeiter aus offenen Aufgaben — eindeutig zaehlen
    // (eine Aufgabe pro Person zaehlt einmal, auch wenn jemand sowohl
    // responsibleUserId als auch in assignees ist).
    const personCounts = useMemo(() => {
        const map = new Map<string, number>();
        for (const t of openTasks) {
            const involved = new Set<string>();
            if (t.responsibleUserId) involved.add(t.responsibleUserId);
            for (const a of t.assignees) involved.add(a);
            for (const id of involved) map.set(id, (map.get(id) ?? 0) + 1);
        }
        const contactById = new Map(contacts.map(c => [c.id, c]));
        return Array.from(map.entries())
            .map(([id, count]) => ({
                id,
                count,
                name: contactById.get(id)?.displayName ?? id.slice(0, 8),
                audience: contactById.get(id)?.audience,
            }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'));
    }, [openTasks, contacts]);

    // ── Reset ───────────────────────────────────────────────────────────
    const anyFilterActive = Boolean(
        urgencyFilter || spaceFilter || priorityFilter || personFilter || statusFilter !== 'open',
    );
    const resetAll = () => {
        urgencyFilterStore.set(null);
        statusFilterStore.set('open');
        spaceFilterStore.set(null);
        priorityFilterStore.set(null);
        personFilterStore.set(null);
    };

    // ── Collapsed: nur das Hub-Icon mit Overdue-Badge ───────────────────
    if (collapsed) {
        return (
            <button onClick={() => navigate('/meine-aufgaben')}
                className="relative flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                <MaterialIcon name="check_box" size={20} />
                {urgencyCounts.overdue > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[7px] font-bold text-white">
                        {urgencyCounts.overdue}
                    </span>
                )}
            </button>
        );
    }

    return (
        <>
            {/* Hauptaktion + Reset */}
            <SidebarGroup label={t('my-tasks.my_tasks_world.aufgaben')} collapsed={collapsed}>
                <li>
                    <NavLink to="/meine-aufgaben" end className={({ isActive }) => cn(
                        'flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm transition-colors',
                        isActive ? 'bg-sidebar-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                    )}>
                        <MaterialIcon name="check_box" size={20} />
                        <span className="flex-1">{t('my-tasks.my_tasks_world.alle_aufgaben')}</span>
                        {loading ? (
                            <Loader2 className="size-3 animate-spin text-muted-foreground" />
                        ) : (
                            <span className="text-[10px] text-muted-foreground tabular-nums">{statusCounts.open}</span>
                        )}
                    </NavLink>
                </li>
                {anyFilterActive && (
                    <li>
                        <button onClick={resetAll}
                            className="mt-0.5 flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
                            <MaterialIcon name="filter_alt_off" size={16} />
                            {t('my-tasks.my_tasks_world.alle_filter_zuruecksetzen')}
                        </button>
                    </li>
                )}
            </SidebarGroup>

            {/* Dringlichkeit */}
            <SidebarGroup label={t('my-tasks.my_tasks_world.dringlichkeit')} collapsed={collapsed}>
                {URGENCY_ROWS.map(row => (
                    <FilterRow
                        key={row.key}
                        active={urgencyFilter === row.key}
                        icon={row.icon}
                        iconColor={row.iconColor}
                        label={t(row.labelKey)}
                        count={urgencyCounts[row.key]}
                        onClick={() => urgencyFilterStore.set(urgencyFilter === row.key ? null : row.key)}
                    />
                ))}
            </SidebarGroup>

            {/* Status */}
            <SidebarGroup label={t('my-tasks.my_tasks_world.status')} collapsed={collapsed}>
                {STATUS_ROWS.map(row => (
                    <FilterRow
                        key={row.key as string}
                        active={statusFilter === row.key}
                        icon={row.icon}
                        iconColor={row.iconColor}
                        label={t(row.labelKey)}
                        count={statusCounts[row.key as keyof typeof statusCounts]}
                        onClick={() => {
                            // 'open' bleibt der Default — Toggle setzt zurueck auf 'open'
                            if (statusFilter === row.key) statusFilterStore.set('open');
                            else statusFilterStore.set(row.key);
                        }}
                    />
                ))}
            </SidebarGroup>

            {/* Prioritaet */}
            <SidebarGroup label={t('my-tasks.my_tasks_world.prioritaet')} collapsed={collapsed}>
                {PRIORITY_ROWS.map(row => (
                    <FilterRow
                        key={row.key}
                        active={priorityFilter === row.key}
                        icon={row.icon}
                        iconColor={row.iconColor}
                        label={t(row.labelKey)}
                        count={priorityCounts[row.key]}
                        onClick={() => priorityFilterStore.set(priorityFilter === row.key ? null : row.key)}
                    />
                ))}
            </SidebarGroup>

            {/* Spaces — nur wenn es welche mit offenen Aufgaben gibt */}
            {spaceCounts.length > 0 && (
                <SidebarGroup label={t('my-tasks.my_tasks_world.spaces')} collapsed={collapsed}>
                    {spaceCounts.map(sp => (
                        <FilterRow
                            key={sp.id}
                            active={spaceFilter === sp.id}
                            icon="folder"
                            iconColor={sp.color ?? '#94a3b8'}
                            label={sp.name}
                            count={sp.count}
                            onClick={() => spaceFilterStore.set(spaceFilter === sp.id ? null : sp.id)}
                        />
                    ))}
                </SidebarGroup>
            )}

            {/* Verantwortliche / Bearbeiter — Personen aus offenen Aufgaben */}
            {personCounts.length > 0 && (
                <SidebarGroup label={t('common.responsible')} collapsed={collapsed}>
                    {personCounts.map(p => (
                        <FilterRow
                            key={p.id}
                            active={personFilter === p.id}
                            icon="person"
                            iconColor={audienceColor(p.audience)}
                            label={p.name}
                            count={p.count}
                            onClick={() => personFilterStore.set(personFilter === p.id ? null : p.id)}
                        />
                    ))}
                </SidebarGroup>
            )}
        </>
    );
}

function audienceColor(audience: string | undefined): string {
    if (audience === 'staff') return '#dc2626';
    if (audience === 'guardian') return '#0891b2';
    if (audience === 'minor') return '#059669';
    return '#64748b';
}

// ─── Lokale Helfer (Pattern aus app-sidebar.tsx, ohne dort zu importieren) ──

function SidebarGroup({ label, collapsed, children }: { label: string; collapsed: boolean; children: React.ReactNode }) {
    if (collapsed) return <ul className="flex flex-col gap-0.5">{children}</ul>;
    return (
        <div className="mt-2 first:mt-0">
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {label}
            </div>
            <ul className="flex flex-col gap-0.5">{children}</ul>
        </div>
    );
}

function FilterRow({ active, icon, iconColor, label, count, onClick }: {
    active: boolean; icon: string; iconColor?: string; label: string; count?: number; onClick: () => void;
}) {
    const showCount = count !== undefined && count > 0;
    return (
        <li>
            <button onClick={onClick}
                className={cn(
                    'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[12px] transition-colors',
                    active
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                )}>
                <MaterialIcon name={icon} size={14}
                    style={iconColor && !active ? { color: iconColor } : undefined} />
                <span className="flex-1 truncate text-left">{label}</span>
                {showCount && (
                    <span className={cn(
                        'rounded px-1.5 py-0 text-[10px] tabular-nums',
                        active ? 'bg-primary/15' : 'bg-muted text-muted-foreground',
                    )}>
                        {count}
                    </span>
                )}
            </button>
        </li>
    );
}
