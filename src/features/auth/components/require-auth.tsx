import { type JSX, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { sessionMachine } from '../../../core/session/session-machine';
import { bootstrapLoader } from '../../bootstrap/bootstrap-loader';
import { PermissionProvider, buildPermissionBundle, spacePermissionCache } from '@/core/permissions';
import { Loader2 } from 'lucide-react';
import { useT } from "@/lib/i18n/use-t";

interface RequireAuthProps {
    children: JSX.Element;
}

export const RequireAuth = ({ children }: RequireAuthProps): JSX.Element => {
    const t = useT();
    const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const location = useLocation();
    const resuming = useRef(false);

    // Resume session on page reload: tokens exist but bootstrap is missing
    useEffect(() => {
        if (
            snapshot.state === 'matrix_authenticated' &&
            snapshot.matrix?.accessToken &&
            snapshot.platform?.token &&
            !snapshot.bootstrap &&
            !resuming.current
        ) {
            resuming.current = true;
            sessionMachine.startExchange();
            sessionMachine.platformAuthenticated(snapshot.platform);
            bootstrapLoader.load().catch(() => {
                sessionMachine.logout();
            }).finally(() => {
                resuming.current = false;
            });
        }
    }, [snapshot.state, snapshot.matrix, snapshot.platform, snapshot.bootstrap]);

    // Subscribe to space permission cache updates
    const spacePermsVersion = useSyncExternalStore(
        spacePermissionCache.subscribe.bind(spacePermissionCache),
        () => spacePermissionCache.getAll().size,
    );

    const permissionBundle = useMemo(() => {
        if (!snapshot.bootstrap) return null;

        const { context, modules, featureFlags } = snapshot.bootstrap;
        const serverCaps = snapshot.permissions?.capabilities;

        return buildPermissionBundle(
            context.roles,
            modules ?? [],
            featureFlags ?? {},
            serverCaps,
        );
    }, [snapshot.bootstrap, snapshot.permissions]);

    // Show loading while resuming session
    if (snapshot.state !== 'ready' && snapshot.matrix?.accessToken && snapshot.platform?.token) {
        return (
            <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('auth.components.require_auth.sitzung_wird_wiederhergestellt')}
            </div>
        );
    }

    if (snapshot.state !== 'ready' || !permissionBundle) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return (
        <PermissionProvider
            bundle={permissionBundle}
            spacePermissions={spacePermissionCache.getAll()}
        >
            {children}
        </PermissionProvider>
    );
};
