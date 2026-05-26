import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { Navigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { useIsMobile } from '@/core/responsive/use-is-mobile';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { MobileSpacesList } from '@/features/spaces/mobile-spaces-list';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

/**
 * ShellPage — Startseite (Route `/`).
 *
 * Routing-Logik (2026-05-02):
 *   1) Dashboard-App enabled UND User-Wahl="dashboard" (default) → DashboardPage
 *   2) User-Wahl=Space/Calendar/Hub/PersonalFach → Redirect dorthin
 *   3) User-Wahl=last-route → localStorage.lastRoute
 *   4) Fallback: legacy "Hallo, waehle einen Space"-Empty-State
 *
 * Konzept: prilog_docs/docs/umsetzung/startfenster-konzept.md
 */
export const ShellPage = (): JSX.Element => {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const enabledModules = new Set(
        (session.bootstrap?.modules ?? []).filter((m: any) => m.enabled).map((m: any) => m.key as string),
    );
    const dashboardEnabled = enabledModules.has('dashboard');
    // useIsMobile vor allen conditional-returns — Hook-Order muss stabil sein.
    const isMobile = useIsMobile();

    const [startView, setStartView] = useState<{ view: string; spaceId: string | null } | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!jwt) { setLoaded(true); return; }
        const gw = createPlatformGateway();
        gw.getStartView(jwt)
            .then((res) => setStartView(res))
            .catch(() => setStartView({ view: 'dashboard', spaceId: null }))
            .finally(() => setLoaded(true));
    }, [jwt]);

    if (!loaded) {
        return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('shell.shell_page.wird_geladen')}</div>;
    }

    // User-Wahl pro Start-View
    const view = startView?.view ?? (dashboardEnabled ? 'dashboard' : 'fallback');

    // Auf Mobile macht das Dashboard kaum Sinn (zu viele Widgets fuer kleine
    // Screens) — direkt in die Spaces-Liste fallen, das ist die mobile
    // Heimseite. Das Dashboard bleibt auf Desktop unveraendert.
    if (view === 'dashboard' && dashboardEnabled && !isMobile) {
        return <DashboardPage />;
    }

    if (view === 'space' && startView?.spaceId) {
        return <Navigate to={`/spaces/${startView.spaceId}`} replace />;
    }

    if (view === 'calendar') return <Navigate to="/calendar" replace />;
    if (view === 'personal-fach') return <Navigate to="/mein-fach" replace />;
    if (view === 'hub') return <Navigate to="/hub" replace />;

    if (view === 'last-route') {
        const last = typeof localStorage !== 'undefined' ? localStorage.getItem('lastRoute') : null;
        if (last && last !== '/') return <Navigate to={last} replace />;
    }

    return <ShellFallback />;
};

function ShellFallback(): JSX.Element {
    const isMobile = useIsMobile();
    if (isMobile) return <MobileSpacesList />;
    return <DesktopEmptyState />;
}

function DesktopEmptyState(): JSX.Element {
    const t = useT();
    const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const displayName = snapshot.bootstrap?.user.displayName ?? 'Willkommen';
    const tenantName = snapshot.bootstrap?.branding?.tenantName ?? 'Prilog';

    return (
        <div className="flex h-full flex-col items-center justify-center bg-background px-6 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-primary/10">
                <MaterialIcon name="grid_view" size={16} className="size-9 text-primary" />
            </div>
            <h1 className="mt-6 text-xl font-semibold">{t('shell.shell_page.hallo')} {displayName}</h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {t('shell.shell_page.waehle_links_in_der_seitenleiste_einen_s')}
            </p>
            <p className="mt-6 text-xs text-muted-foreground/70">{tenantName}</p>
        </div>
    );
}
