/**
 * useReadiness — Stundenplan-Bereitschaft (Auto-Mode 0i).
 *
 * Liest den Diagnose-Report vom Backend und invalidiert automatisch, wenn
 * sich Stammdaten geaendert haben (ReactiveBridge mapped `stundenplan.changed`
 * → `['readiness']`).
 *
 * TanStack Query — staleTime moderat (5 s), damit das Panel sich beim
 * Wiederoeffnen auffrischt aber pro Mount nicht doppelt feuert.
 */
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sessionStore } from '@/core/session/session-store';
import {
    createStundenplanGateway,
    type ReadinessReport,
} from '@/gateways/platform/stundenplan-gateway';

const gateway = createStundenplanGateway();

export function useReadiness(scenarioId?: string) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const q = useQuery({
        queryKey: ['readiness', { scenarioId }] as const,
        enabled: !!jwt,
        staleTime: 5_000,
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.getReadinessReport(jwt, { scenarioId });
        },
    });

    const report: ReadinessReport | undefined = q.data?.report;
    return {
        report,
        loading: q.isLoading,
        error: q.error,
        refetch: q.refetch,
    };
}
