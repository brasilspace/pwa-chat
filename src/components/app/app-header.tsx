import { type JSX, useSyncExternalStore, useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { sessionStore } from '@/core/session/session-store';
import { ownProfileStore } from '@/core/session/own-profile-store';
import { sessionMachine } from '@/core/session/session-machine';
import { useSpaces } from '@/features/spaces/use-spaces';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useMatrixAvatar } from '@/components/ui/matrix-avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MaterialIcon } from '@/components/ui/material-icon';
import { HoermiHelper } from './hoermi-helper';
import { HoermiProgressBar } from './hoermi-progress-bar';
import { knownWorkspaces } from '@/core/workspaces/known-workspaces-store';
import { useInboxUnread } from '@/features/mein-fach/use-inbox-unread';
import { createCrisisGateway } from '@/features/crisis/crisis-gateway';
import { PanicTriggerDesktop } from '@/features/emergency/panic-button';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';
import { useEnabledModules } from '@/core/permissions';
import { useT } from "@/lib/i18n/use-t";

const crisisGateway = createCrisisGateway();

const ROLE_LABEL_KEYS: Record<string, string> = {
    SCHOOL_PRINCIPAL: 'app.misc.role_school_principal',
    SCHOOL_ADMIN: 'app.misc.role_school_admin',
    CUSTODIAN: 'app.misc.role_custodian',
    ALL: 'common.all',
    TEACHERS: 'app.misc.role_teachers',
    PARENTS: 'app.misc.role_parents',
    STUDENTS: 'app.misc.role_students',
};

function getInitials(name: string): string {
    return name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

interface ActiveCrisis {
    id: string;
    scenarioName: string;
    severity: string;
    notifyRoles: string[];
    activatedAt: string;
}

export function AppHeader(): JSX.Element {
    const t = useT();
    const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const navigate = useNavigate();
    const location = useLocation();
    const onFavorites = location.pathname.startsWith('/favorites');
    const onFinden = location.pathname.startsWith('/finden');
    const onMeinFach = location.pathname.startsWith('/mein-fach');
    const inboxUnread = useInboxUnread();

    const ownProfile = useSyncExternalStore(ownProfileStore.subscribe, ownProfileStore.getSnapshot);
    const ownAvatarUrl = useMatrixAvatar(ownProfile.avatarMxc, snapshot.matrix?.accessToken);
    const fullName = ownProfile.displayName ?? snapshot.bootstrap?.user.displayName ?? '';
    const matrixId = snapshot.matrix?.userId ?? '';
    const username = matrixId.split(':')[0].replace('@', '');
    const tenantName = snapshot.bootstrap?.branding?.tenantName ?? 'Prilog';
    const { spaceId } = useParams<{ spaceId: string }>();
    const { spaces } = useSpaces();
    const currentSpace = spaceId ? spaces.find(s => s.id === spaceId) : null;
    const crisisAppEnabled = useEnabledModules().has('crisis-management');

    // Aktive Krisen pruefen
    const [activeCrisis, setActiveCrisis] = useState<ActiveCrisis | null>(null);
    const jwt = snapshot.platform?.token;

    const checkActiveCrisis = useCallback(() => {
        if (!jwt || snapshot.impersonation || !crisisAppEnabled) return;
        crisisGateway.getActiveEvents(jwt)
            .then(r => {
                if (r.items.length > 0) {
                    const evt = r.items[0];
                    crisisGateway.getScenarios(jwt, true).then(s => {
                        const scenario = s.items.find(sc => sc.id === evt.scenarioId);
                        const roles = (scenario?.notifyRoles ?? []).map(r => {
                            const key = ROLE_LABEL_KEYS[r];
                            return key ? t(key) : r;
                        });
                        setActiveCrisis({
                            id: evt.id,
                            scenarioName: evt.scenario?.name ?? 'Krise',
                            severity: evt.scenario?.severity ?? 'HIGH',
                            notifyRoles: roles,
                            activatedAt: evt.activatedAt,
                        });
                    }).catch(() => {
                        setActiveCrisis({
                            id: evt.id,
                            scenarioName: evt.scenario?.name ?? 'Krise',
                            severity: evt.scenario?.severity ?? 'HIGH',
                            notifyRoles: [],
                            activatedAt: evt.activatedAt,
                        });
                    });
                } else {
                    setActiveCrisis(null);
                }
            })
            .catch(() => { });
    }, [jwt, snapshot.impersonation, crisisAppEnabled]);

    // Initial-Load + bei Login wechsel
    useEffect(() => { checkActiveCrisis(); }, [checkActiveCrisis]);

    // SSE: Backend pusht 'crisis.changed' bei Aktivierung/Deaktivierung/Task-
    // Update. Wir reloaden den aktiven Krisen-Status sofort — ohne Polling.
    useWorkflowEvents((event) => {
        if (event === 'crisis.changed') checkActiveCrisis();
    });

    const handleLogout = (): void => {
        sessionMachine.logout();
        navigate('/login', { replace: true });
    };

    const setTheme = (theme: 'light' | 'dark' | 'system'): void => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
            localStorage.setItem('prilog-theme', 'dark');
        } else if (theme === 'light') {
            root.classList.remove('dark');
            localStorage.setItem('prilog-theme', 'light');
        } else {
            localStorage.removeItem('prilog-theme');
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
        }
    };

    const elapsed = activeCrisis
        ? Math.floor((Date.now() - new Date(activeCrisis.activatedAt).getTime()) / 60_000)
        : 0;

    return (
        <header className="relative flex h-[var(--header-height)] shrink-0 items-center justify-between border-b bg-[var(--header-background)] px-4">
            <div className="flex items-center gap-3">
                {currentSpace ? (
                    <span className="text-sm font-medium">{currentSpace.name}</span>
                ) : (
                    <span className="text-sm text-muted-foreground">{tenantName}</span>
                )}
            </div>

            {/* Krisen-Banner — nur wenn Krisenmanagement-App aktiv ist */}
            {activeCrisis && crisisAppEnabled && (
                <button
                    onClick={() => navigate('/ablaeufe?view=active')}
                    className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 transition-colors hover:bg-red-500/20"
                >
                    <span className="size-2 shrink-0 rounded-full bg-red-500 animate-pulse" />
                    <MaterialIcon name="warning" size={14} className="shrink-0 text-red-500" />
                    <span className="text-xs font-bold text-red-500">{activeCrisis.scenarioName}</span>
                    <span className="text-[10px] text-red-400">{elapsed} {t('app.misc.min')}</span>
                    {activeCrisis.notifyRoles.length > 0 && (
                        <span className="hidden text-[10px] text-red-400/70 sm:inline">
                            · {activeCrisis.notifyRoles.join(', ')}
                        </span>
                    )}
                </button>
            )}

            <div className="flex items-center gap-2">
                {/* Finden — globale Suche als Quick-Access, VOR Favoriten
                    (u.a. für die Konzepte: schneller Sprung in die Suche). */}
                <button
                    type="button"
                    onClick={() => navigate('/finden')}
                    title={t('app.misc.finden') || 'Finden'}
                    className={cn(
                        'flex size-8 items-center justify-center rounded-md transition-colors',
                        onFinden
                            ? 'text-primary bg-primary/10'
                            : 'text-foreground hover:bg-muted',
                    )}
                >
                    <MaterialIcon name="search" size={20} />
                </button>

                {/* Favoriten — kompakter Quick-Access neben dem User-Menue.
                    Vorher war Favoriten eine eigene Welt in der Sidebar; sie
                    wurde durch den Kalender-Hub ersetzt, der fuer Mitarbeiter
                    wichtiger ist. Favoriten bleiben als Power-User-Feature
                    erreichbar.
                    Bewusst plain <button> + title statt Radix-Tooltip+asChild
                    — die Slot-Variante hat onClick verschluckt, der Button
                    fuehlte sich tot an. */}
                <button
                    type="button"
                    onClick={() => navigate('/favorites')}
                    title={t('app.misc.favoriten')}
                    className={cn(
                        'flex size-8 items-center justify-center rounded-md transition-colors',
                        onFavorites
                            ? 'text-amber-500 hover:bg-amber-500/10'
                            : 'text-foreground hover:bg-muted',
                    )}
                >
                    <MaterialIcon name="star" size={20} fill={onFavorites ? 1 : 0} />
                </button>

                {/* Mein Fach — persoenliche Dokumente und Postfach.
                    Wie Favoriten ein Quick-Access neben dem User-Menue, weil
                    es ein User-eigenes Konstrukt ist (nicht Tenant-weit). */}
                <button
                    type="button"
                    onClick={() => navigate('/mein-fach')}
                    title={inboxUnread > 0 ? `Mein Fach · ${inboxUnread} neu` : 'Mein Fach'}
                    className={cn(
                        'relative flex size-8 items-center justify-center rounded-md transition-colors',
                        onMeinFach
                            ? 'text-primary bg-primary/10'
                            : 'text-foreground hover:bg-muted',
                    )}
                >
                    <MaterialIcon name="inbox" size={20} />
                    {inboxUnread > 0 && (
                        <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white tabular-nums">
                            {inboxUnread > 9 ? '9+' : inboxUnread}
                        </span>
                    )}
                </button>

                {/* Hoermi & Mia — Audio-Hilfe (Prototyp). Klick oeffnet
                    Mini-Player mit Demo-Dialog ueber das Hauptmenue. */}
                <HoermiHelper />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-8 gap-2 rounded-full px-2">
                            <Avatar className="size-7">
                                {ownAvatarUrl && <AvatarImage src={ownAvatarUrl} alt={fullName || username} />}
                                <AvatarFallback className="text-[10px]">{getInitials(fullName || username)}</AvatarFallback>
                            </Avatar>
                            <span className="hidden text-sm font-medium sm:inline">@{username}</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel className="font-normal">
                            <p className="text-sm font-medium">{fullName || username}</p>
                            <p className="text-xs text-muted-foreground">@{username}</p>
                            {tenantName && (
                                <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <MaterialIcon name="apartment" size={14} /> {tenantName}
                                </p>
                            )}
                        </DropdownMenuLabel>

                        <WorkspaceSwitcher currentDomain={snapshot.matrix?.homeserver ?? null} />

                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setTheme('light')}>
                            <MaterialIcon name="light_mode" size={20} className="mr-2" /> {t('app.misc.hell')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme('dark')}>
                            <MaterialIcon name="dark_mode" size={20} className="mr-2" /> {t('app.misc.dunkel')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme('system')}>
                            <MaterialIcon name="computer" size={20} className="mr-2" /> {t('app.misc.system')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <a
                                href="https://docs.prilog.chat"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center cursor-pointer"
                            >
                                <MaterialIcon name="menu_book" size={20} className="mr-2" />
                                <span className="flex-1">{t('app.misc.handbuch')}</span>
                                <MaterialIcon name="open_in_new" size={14} className="opacity-60" />
                            </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                            <MaterialIcon name="logout" size={20} className="mr-2" /> {t('app.misc.abmelden')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {crisisAppEnabled && <PanicTriggerDesktop />}
            </div>

            {/* Hoermi-Player ProgressBar — nur sichtbar wenn Audio einmal
                gestartet wurde. Liegt absolute am unteren Rand und uebernimmt
                visuell die Header-Border, solange aktiv. */}
            <HoermiProgressBar />
        </header>
    );
}

// ─── Workspace-Switcher ──────────────────────────────────────────────────────
// Zeigt andere Workspaces des Users (gespeichert in localStorage beim Login).
// Klick → navigiert zu https://<domain>/ — dort separater Login, da Cross-
// Tenant-SSO nicht existiert. Liste leer = nichts gerendert (kein Noise fuer
// Single-Tenant-User).

function WorkspaceSwitcher({ currentDomain }: { currentDomain: string | null }): JSX.Element | null {
    const t = useT();
    const others = knownWorkspaces.listOthers(currentDomain);
    if (others.length === 0) return null;

    return (
        <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MaterialIcon name="swap_horiz" size={14} className="mr-1 inline-block align-middle" /> {t('app.misc.workspace_wechseln')}
            </DropdownMenuLabel>
            {others.slice(0, 5).map((ws) => (
                <DropdownMenuItem
                    key={ws.domain}
                    onClick={() => { window.location.href = `https://${ws.domain}/`; }}
                    className="text-xs"
                >
                    <MaterialIcon name="apartment" size={16} className="mr-2 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">
                        {ws.displayName || ws.domain}
                    </span>
                </DropdownMenuItem>
            ))}
        </>
    );
}
