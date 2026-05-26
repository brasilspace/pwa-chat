import { Suspense, type JSX } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useEnabledModules, useSpacePermissions } from '@/core/permissions';
import {
    getEnabledModuleRoutes,
    getDefaultModuleRoute,
} from '@/core/module-registry';
import { useT } from "@/lib/i18n/use-t";

function ModuleLoadingSkeleton() {
    const t = useT();
    return (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
            {t('shell.space_view.laden')}
        </div>
    );
}

export function DynamicSpaceView(): JSX.Element {
    const { spaceId } = useParams<{ spaceId: string }>();
    const enabledModules = useEnabledModules();
    const routes = getEnabledModuleRoutes(enabledModules);
    const defaultRoute = getDefaultModuleRoute(enabledModules);

    useSpacePermissions(spaceId);

    return (
        <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1">
                <Suspense fallback={<ModuleLoadingSkeleton />}>
                    <Routes>
                        <Route index element={<Navigate to={defaultRoute} replace />} />
                        {routes.map((route) => (
                            <Route
                                key={route.path}
                                path={route.path}
                                element={<route.component />}
                            />
                        ))}
                    </Routes>
                </Suspense>
            </div>
        </div>
    );
}

export { DynamicSpaceView as SpaceView };
