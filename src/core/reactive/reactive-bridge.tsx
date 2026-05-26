/**
 * ReactiveBridge — verbindet workflow-events (SSE) mit TanStack Query.
 *
 * Wenn das Backend ein workflow-event sendet (z.B. 'document.changed'),
 * werden die passenden queryKeys invalidiert. Alle Komponenten, die diese
 * Queries abonniert haben (useQuery), refetchen automatisch — ohne dass
 * irgendjemand das von Hand triggern muss.
 *
 * Das ist die fundamentale Reactive-Layer fuer Prilog. Jede neue Feature-
 * Komponente, die `useQuery(['<bereich>', ...])` nutzt, ist automatisch
 * live.
 *
 * Erweitern: neuen Event-Typ → Mapping hier ergaenzen.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';

/** Workflow-Event → invalidierte queryKey-Praefixe. */
const EVENT_TO_QUERY_KEYS: Record<string, string[]> = {
    'document.changed':       ['documents', 'document-folders', 'document-stats', 'document-tags'],
    'calendar.changed':       ['calendar-events', 'calendar-layers'],
    'task.changed':           ['tasks', 'task-stats'],
    'crisis.changed':         ['crisis'],
    'space.changed':          ['spaces', 'space-info'],
    'contacts.changed':       ['contacts', 'contact-groups'],
    'comment.changed':        ['comments'],
    'checklist.changed':      ['checklists'],
    'post.changed':           ['posts', 'space-posts'],
    'absence.changed':        ['absences'],
    'note.changed':           ['notes'],
    'concept.updated':        ['concepts', 'concept-instances'],
    'run.updated':            ['runs', 'run-detail'],
    'checkpoint.created':     ['checkpoints', 'runs'],
    'checkpoint.resolved':    ['checkpoints', 'runs'],
    'form.submitted':         ['forms', 'form-submissions'],
    'report.generated':       ['reports'],
    'mention.created':        ['mentions'],
    'space-email.received':   ['space-emails'],
    'solve.changed':          ['solve-jobs', 'solve-job', 'readiness'],
    'stundenplan.changed':    ['readiness', 'solve-jobs'],
};

export function ReactiveBridge(): null {
    const qc = useQueryClient();

    useWorkflowEvents((event) => {
        const keys = EVENT_TO_QUERY_KEYS[event];
        if (!keys) return;
        for (const k of keys) {
            qc.invalidateQueries({ queryKey: [k] });
        }
    });

    // Bei Tab-zurueck-Fokus zusaetzlich alles invalidieren — TanStack Query
    // refetched standardmaessig stale Queries on focus, aber wir wollen
    // _alle_ unsere "Hauptdaten" sicher frisch nach Idle.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                qc.invalidateQueries();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [qc]);

    return null;
}
