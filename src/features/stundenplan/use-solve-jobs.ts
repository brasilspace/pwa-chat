/**
 * useSolveJobs — Auto-Mode Solver-Jobs mit TanStack Query.
 *
 * Reactive-Layer:
 *  - useQuery fuer Liste + einzelnen Job (Polling solange aktiv)
 *  - useMutation fuer Create/Cancel mit Invalidation
 *  - ReactiveBridge invalidiert bei SSE `solve.changed` (Backend feuert
 *    nach jeder Status-Aenderung).
 *
 * Polling-Fallback: Wenn ein Job in `queued` oder `running` steht, pollen
 * wir alle 2 s. Solver-Run dauert oft < 1 min — Polling laeuft auch ohne
 * SSE robust.
 */
import { useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionStore } from '@/core/session/session-store';
import { createStundenplanGateway, type SolveJob } from '@/gateways/platform/stundenplan-gateway';

const gateway = createStundenplanGateway();

const ACTIVE_STATUSES: SolveJob['status'][] = ['queued', 'running'];

export function useSolveJobs(scenarioId?: string) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const qc = useQueryClient();

    const listQ = useQuery({
        queryKey: ['solve-jobs', { scenarioId }] as const,
        enabled: !!jwt,
        refetchInterval: (q) => {
            const data = q.state.data as { jobs: SolveJob[] } | undefined;
            const active = data?.jobs.some((j) => ACTIVE_STATUSES.includes(j.status));
            return active ? 2_000 : false;
        },
        queryFn: async () => {
            if (!jwt) throw new Error('no jwt');
            return gateway.listSolveJobs(jwt, { scenarioId, limit: 30 });
        },
    });

    const createM = useMutation({
        mutationFn: async (input: { scenarioId: string; timeoutSeconds?: number }) => {
            if (!jwt) throw new Error('no jwt');
            return gateway.createSolveJob(jwt, input);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['solve-jobs'] });
        },
    });

    const cancelM = useMutation({
        mutationFn: async (jobId: string) => {
            if (!jwt) throw new Error('no jwt');
            return gateway.cancelSolveJob(jwt, jobId);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['solve-jobs'] });
        },
    });

    const acceptM = useMutation({
        mutationFn: async (input: {
            jobId: string;
            targetScenarioId?: string;
            replaceExistingDraft?: boolean;
        }) => {
            if (!jwt) throw new Error('no jwt');
            return gateway.acceptSolveJob(jwt, input.jobId, {
                targetScenarioId: input.targetScenarioId,
                replaceExistingDraft: input.replaceExistingDraft,
            });
        },
        onSuccess: () => {
            // Wochengrid neu laden (timetable-entries) + Bereitschaft + Jobs.
            qc.invalidateQueries({ queryKey: ['solve-jobs'] });
            qc.invalidateQueries({ queryKey: ['timetable-entries'] });
            qc.invalidateQueries({ queryKey: ['readiness'] });
        },
    });

    return {
        jobs: listQ.data?.jobs ?? [],
        loading: listQ.isLoading,
        error: listQ.error,
        createJob: createM.mutateAsync,
        creating: createM.isPending,
        cancelJob: cancelM.mutateAsync,
        cancelling: cancelM.isPending,
        acceptJob: acceptM.mutateAsync,
        accepting: acceptM.isPending,
    };
}

export function useSolveJob(jobId: string | null, includeResult = true) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    return useQuery({
        queryKey: ['solve-job', jobId, { includeResult }] as const,
        enabled: !!jwt && !!jobId,
        refetchInterval: (q) => {
            const data = q.state.data as { job: SolveJob } | undefined;
            return data?.job && ACTIVE_STATUSES.includes(data.job.status) ? 2_000 : false;
        },
        queryFn: async () => {
            if (!jwt || !jobId) throw new Error('no jwt/jobId');
            return gateway.getSolveJob(jwt, jobId, { includeResult });
        },
    });
}
