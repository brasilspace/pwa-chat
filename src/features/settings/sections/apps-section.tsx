import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import { Loader2, PowerOff, Box } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ModuleCatalogEntry {
    key: string;
    name: string;
    description: string | null;
    sortOrder: number;
    available: boolean;
}

interface SpaceModule {
    id: string;
    moduleKey: string;
    enabled: boolean;
    activatedAt: string | null;
}

interface SpaceWithModules {
    id: string;
    name: string;
    type: string;
    modules: SpaceModule[];
}

interface SpacesWithModulesResponse {
    catalog: ModuleCatalogEntry[];
    spaces: SpaceWithModules[];
}

interface WorkspaceApp {
    moduleId: string;
    name: string;
    version: string;
    type: string;
    description: string | null;
    category: string;
    scope: 'workspace' | 'space' | 'both';
    featureFlag: string | null;
    permissions: string[];
    installation: { status: string; activatedAt: string | null; deactivatedAt: string | null } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
    communication: 'Kommunikation',
    organization: 'Organisation',
    management: 'Management',
    tools: 'Werkzeuge',
    operations: 'Betrieb',
    education: 'Bildung',
    other: 'Sonstige',
};

const CATEGORY_ORDER = ['communication', 'organization', 'management', 'tools', 'operations', 'education', 'other'];

function groupByCategory(apps: WorkspaceApp[]): Map<string, WorkspaceApp[]> {
    const map = new Map<string, WorkspaceApp[]>();
    for (const app of apps) {
        const cat = CATEGORY_LABELS[app.category] ? app.category : 'other';
        const arr = map.get(cat) ?? [];
        arr.push(app);
        map.set(cat, arr);
    }
    return map;
}

interface AppsResponse {
    apps: WorkspaceApp[];
}

// ─── Section ────────────────────────────────────────────────────────────────

export function AppsSection(): JSX.Element {
    const t = useT();
    return (
        <div className="space-y-10">
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MaterialIcon name="grid_view" size={16} className="size-5" /> {t('settings.apps.apps')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.apps.apps_erweitern_prilog_um_zusaetzliche_fu')}
                </p>
            </div>

            <WorkspaceAppsBlock />
            <hr className="border-border" />
            <SpaceAppsBlock />
        </div>
    );
}

// ─── Workspace-weite Apps ──────────────────────────────────────────────────

function WorkspaceAppsBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [apps, setApps] = useState<WorkspaceApp[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const reload = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        fetch('/api/platform/v1/workspace/apps', {
            headers: { Authorization: `Bearer ${jwt}` },
        })
            .then(async r => {
                if (!r.ok) {
                    const data = await r.json().catch(() => null);
                    throw new Error(data?.error ?? `HTTP ${r.status}`);
                }
                return r.json() as Promise<AppsResponse>;
            })
            .then(d => { setApps(d.apps); setError(null); })
            .catch(e => {
                console.error('[apps] workspace-apps fetch failed:', e);
                setError(e instanceof Error ? e.message : t('common.error'));
            })
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { reload(); }, [reload]);

    const toggle = useCallback(async (app: WorkspaceApp) => {
        if (!jwt) return;
        const isActive = app.installation?.status === 'active';
        if (isActive) {
            const ok = confirm(`App "${app.name}" deaktivieren?\n\nFunktionen dieser App werden nicht mehr sichtbar sein.`);
            if (!ok) return;
        }
        setBusyId(app.moduleId);
        try {
            const action = isActive ? 'deactivate' : 'activate';
            const res = await fetch(`/api/platform/v1/workspace/apps/${encodeURIComponent(app.moduleId)}/${action}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok && res.status !== 204) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? `HTTP ${res.status}`);
            }
            reload();
            // Bootstrap muss neu geladen werden damit aktivierte App in der
            // Sidebar erscheint. Schnellster Weg: voller Reload.
            setTimeout(() => window.location.reload(), 600);
        } catch (e) {
            console.error('[apps] activate failed:', e);
            setError(e instanceof Error ? e.message : 'Aktion fehlgeschlagen');
            setBusyId(null);
        }
    }, [jwt, reload]);

    return (
        <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
                <MaterialIcon name="apartment" size={16} className="size-4" /> {t('settings.apps.workspace-apps')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.apps.workspace-weite_apps_gelten_fuer_alle_mi')}
            </p>

            {error && (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            {loading && !apps && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 rounded-xl border border-border bg-muted/30 animate-pulse" />
                    ))}
                </div>
            )}

            {(() => {
                if (!apps) return null;
                // Workspace-Block zeigt nur scope=workspace oder both
                const visible = apps.filter(a => a.scope === 'workspace' || a.scope === 'both');
                if (visible.length === 0) {
                    return <p className="mt-4 text-sm text-muted-foreground">{t('settings.apps.keine_workspace-apps_im_katalog')}</p>;
                }
                const grouped = groupByCategory(visible);
                return (
                    <div className="mt-4 space-y-6">
                        {CATEGORY_ORDER.filter(cat => grouped.has(cat)).map(cat => (
                            <div key={cat}>
                                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {CATEGORY_LABELS[cat]}
                                </h4>
                                <ul className="grid gap-3 sm:grid-cols-2">
                                    {grouped.get(cat)!.map(app => (
                                        <AppCard
                                            key={app.moduleId}
                                            app={app}
                                            busy={busyId === app.moduleId}
                                            onToggle={() => toggle(app)}
                                        />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                );
            })()}
        </div>
    );
}

function AppCard({ app, busy, onToggle }: { app: WorkspaceApp; busy: boolean; onToggle: () => void }): JSX.Element {
    const t = useT();
    const isActive = app.installation?.status === 'active';

    return (
        <li className={cn(
            'rounded-xl border p-4 transition-colors',
            isActive ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
        )}>
            <div className="flex items-start gap-3">
                <div className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}>
                    <Box className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{app.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                        v{app.version} · {app.category}
                    </p>
                </div>
                {isActive && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                        <MaterialIcon name="check" size={16} className="size-3" /> {t('settings.apps.aktiv')}
                    </span>
                )}
            </div>

            {app.description && (
                <p className="mt-3 text-xs text-muted-foreground">{app.description}</p>
            )}

            <button
                onClick={onToggle}
                disabled={busy}
                className={cn(
                    'mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                    isActive
                        ? 'border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                        : 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                )}
            >
                {busy ? <Loader2 className="size-3.5 animate-spin" />
                    : isActive ? <PowerOff className="size-3.5" />
                        : <MaterialIcon name="power_settings_new" size={16} className="size-3.5" />}
                {isActive ? 'Deaktivieren' : 'Aktivieren'}
            </button>
        </li>
    );
}

// ─── Per-Space Apps (bisher) ───────────────────────────────────────────────

function SpaceAppsBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [data, setData] = useState<SpacesWithModulesResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingKey, setSavingKey] = useState<string | null>(null);

    const reload = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        fetch('/api/platform/v1/workspace/spaces-with-modules', {
            headers: { Authorization: `Bearer ${jwt}` },
        })
            .then(async r => {
                if (!r.ok) {
                    const data = await r.json().catch(() => null);
                    throw new Error(data?.error ?? `HTTP ${r.status}`);
                }
                return r.json() as Promise<SpacesWithModulesResponse>;
            })
            .then(d => { setData(d); setError(null); })
            .catch(e => {
                console.error('[apps] space-modules fetch failed:', e);
                setError(e instanceof Error ? e.message : t('common.error'));
            })
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { reload(); }, [reload]);

    const toggle = useCallback(async (spaceId: string, moduleKey: string, currentlyActive: boolean) => {
        if (!jwt) return;
        const saveKey = `${spaceId}::${moduleKey}`;
        setSavingKey(saveKey);
        try {
            if (currentlyActive) {
                const res = await fetch(`/api/platform/v1/spaces/${spaceId}/modules/${encodeURIComponent(moduleKey)}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${jwt}` },
                });
                if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
            } else {
                const res = await fetch(`/api/platform/v1/spaces/${spaceId}/modules`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ moduleKey }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            }
            reload();
        } catch (e) {
            console.error('[apps] space-module toggle failed:', e);
            setError(e instanceof Error ? e.message : 'Fehler beim Speichern');
        } finally {
            setSavingKey(null);
        }
    }, [jwt, reload]);

    return (
        <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
                <MaterialIcon name="grid_view" size={16} className="size-4" /> {t('settings.apps.apps_pro_space')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.apps.pro_space_festlegen_welche_apps_verfuegb')}
            </p>

            {error && (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            {loading && !data ? (
                <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> {t('settings.apps.lade_spaces')}
                </div>
            ) : data ? (
                <div className="mt-6 space-y-6">
                    {data.spaces.length === 0 && (
                        <p className="text-sm text-muted-foreground">{t('settings.apps.keine_spaces_vorhanden')}</p>
                    )}

                    {data.spaces.map(space => {
                        const activeKeys = new Set(space.modules.filter(m => m.enabled).map(m => m.moduleKey));
                        return (
                            <div key={space.id} className="rounded-xl border border-border p-4">
                                <h4 className="text-sm font-semibold">{space.name}</h4>
                                <p className="text-xs text-muted-foreground">{space.type}</p>

                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {data.catalog.map(mod => {
                                        const active = activeKeys.has(mod.key);
                                        const saving = savingKey === `${space.id}::${mod.key}`;
                                        return (
                                            <button
                                                key={mod.key}
                                                onClick={() => toggle(space.id, mod.key, active)}
                                                disabled={saving}
                                                className={cn(
                                                    'flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors',
                                                    active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                                                    saving && 'opacity-50',
                                                )}
                                            >
                                                <span className={cn(
                                                    'flex size-5 shrink-0 items-center justify-center rounded border-2',
                                                    active ? 'border-primary bg-primary text-white' : 'border-border',
                                                )}>
                                                    {saving ? <Loader2 className="size-3 animate-spin" /> : active ? <MaterialIcon name="check" size={16} className="size-3.5" /> : null}
                                                </span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block font-medium">{mod.name}</span>
                                                    {mod.description && (
                                                        <span className="block text-xs text-muted-foreground line-clamp-1">{mod.description}</span>
                                                    )}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
