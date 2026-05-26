/**
 * SettingsPage — Sidebar-Layout mit drei Cluster (Persönlich / Workspace / Module).
 *
 * Sektionen sind in settings-registry.ts deklariert. Jede Sektion ist eine
 * eigene Datei in sections/<key>-section.tsx. Sichtbarkeit wird hier gefiltert
 * (Admin-only, Cloud-only, Modul-aktiv). URL-Routing /settings/<key>.
 *
 * Mobile (< md): Sidebar ist ein Select-Dropdown am oberen Rand. Desktop:
 * vertikale Sidebar links + Content rechts.
 */

import { type JSX, useMemo, useSyncExternalStore } from 'react';
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/use-t';
import {
    SETTINGS_SECTIONS,
    CLUSTER_LABELS,
    CLUSTER_ORDER,
    type SettingsSection,
    type SettingsCluster,
} from './settings-registry';

/**
 * t() mit defaultValue: nutzt vorhandene Übersetzung, sonst fällt
 * auf den hartcodierten Registry-Label zurück. So muss die Locale-
 * JSON nicht jeden Section-Key kennen.
 */
function useSectionLabel() {
    const t = useT();
    return (section: SettingsSection): string => {
        const key = `settings.sections.${section.key}`;
        const translated = t(key);
        // i18next gibt den Key selbst zurück wenn keine Übersetzung —
        // dann den Registry-Label nehmen.
        return translated === key ? section.label : translated;
    };
}

function useClusterLabel() {
    const t = useT();
    return (cluster: SettingsCluster): string => {
        const key = `settings.clusters.${cluster}`;
        const translated = t(key);
        return translated === key ? CLUSTER_LABELS[cluster] : translated;
    };
}

function useVisibleSections(): SettingsSection[] {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);

    return useMemo(() => {
        const role = session.permissions?.effectiveInstanceRole;
        const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';

        // Aktive Module aus Bootstrap (manifest.featureFlag)
        const enabledModules = new Set(
            (session.bootstrap?.modules ?? [])
                .filter((m: any) => m.enabled)
                .map((m: any) => m.key as string),
        );

        // Deployment-Modus aus tenantSettings (Default 'cloud')
        const tenantSettings = (session.bootstrap as any)?.tenantSettings ?? {};
        const deploymentMode = tenantSettings.deployment_mode ?? 'cloud';

        return SETTINGS_SECTIONS.filter((s) => {
            if (s.requiresAdmin && !isAdmin) return false;
            if (s.requiresCloud && deploymentMode !== 'cloud') return false;
            if (s.requiresModule && !enabledModules.has(s.requiresModule)) return false;
            return true;
        });
    }, [session.permissions, session.bootstrap]);
}

export const SettingsPage = (): JSX.Element => {
    const visible = useVisibleSections();
    const defaultKey = visible[0]?.key ?? 'profil';

    return (
        <div className="flex h-full min-h-0 flex-col md:flex-row">
            {/* Mobile: Header + Dropdown */}
            <MobileSelector sections={visible} />

            {/* Desktop: Sidebar */}
            <DesktopSidebar sections={visible} />

            {/* Content */}
            <main className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl px-6 py-8 lg:px-8 lg:py-10">
                    <Routes>
                        <Route index element={<Navigate to={`/settings/${defaultKey}`} replace />} />
                        {visible.map((s) => (
                            <Route key={s.key} path={s.key} element={<s.component />} />
                        ))}
                        <Route path="*" element={<Navigate to={`/settings/${defaultKey}`} replace />} />
                    </Routes>
                </div>
            </main>
        </div>
    );
};

// ─── Desktop Sidebar ────────────────────────────────────────────────────────

function DesktopSidebar({ sections }: { sections: SettingsSection[] }): JSX.Element {
    const grouped = groupByCluster(sections);
    const clusterLabel = useClusterLabel();
    const t = useT();

    return (
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-border bg-sidebar-background md:block">
            <div className="px-4 py-6">
                <h1 className="text-base font-semibold">{t('settings.title')}</h1>
            </div>

            {CLUSTER_ORDER.map((cluster) => {
                const items = grouped.get(cluster) ?? [];
                if (items.length === 0) return null;
                return (
                    <ClusterGroup key={cluster} label={clusterLabel(cluster)} sections={items} />
                );
            })}
        </aside>
    );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ClusterGroup({ label, sections }: { label: string; sections: SettingsSection[] }): JSX.Element {
    return (
        <div className="mb-4">
            <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            <ul>
                {sections.map((s) => <SidebarLink key={s.key} section={s} />)}
            </ul>
        </div>
    );
}

function SidebarLink({ section }: { section: SettingsSection }): JSX.Element {
    const Icon = section.icon;
    const sectionLabel = useSectionLabel();
    return (
        <li>
            <NavLink
                to={`/settings/${section.key}`}
                end
                className={({ isActive }) =>
                    cn(
                        'mx-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent',
                    )
                }
            >
                <Icon className="size-4" />
                <span className="truncate">{sectionLabel(section)}</span>
            </NavLink>
        </li>
    );
}

// ─── Mobile Selector ────────────────────────────────────────────────────────

function MobileSelector({ sections }: { sections: SettingsSection[] }): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();
    const grouped = groupByCluster(sections);
    const t = useT();
    const sectionLabel = useSectionLabel();
    const clusterLabel = useClusterLabel();

    // Aktiver Key aus URL extrahieren (letzter Pfad-Teil)
    const currentKey = location.pathname.split('/').pop() ?? '';

    return (
        <div className="border-b border-border bg-sidebar-background px-4 py-3 md:hidden">
            <h1 className="mb-2 text-base font-semibold">{t('settings.title')}</h1>
            <select
                value={currentKey}
                onChange={(e) => navigate(`/settings/${e.target.value}`)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
                {CLUSTER_ORDER.map((cluster) => {
                    const items = grouped.get(cluster) ?? [];
                    if (items.length === 0) return null;
                    return (
                        <optgroup key={cluster} label={clusterLabel(cluster)}>
                            {items.map((s) => (
                                <option key={s.key} value={s.key}>{sectionLabel(s)}</option>
                            ))}
                        </optgroup>
                    );
                })}
            </select>
        </div>
    );
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function groupByCluster(sections: SettingsSection[]): Map<SettingsCluster, SettingsSection[]> {
    const map = new Map<SettingsCluster, SettingsSection[]>();
    for (const s of sections) {
        const arr = map.get(s.cluster) ?? [];
        arr.push(s);
        map.set(s.cluster, arr);
    }
    return map;
}
