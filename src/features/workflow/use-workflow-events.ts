/**
 * useWorkflowEvents — SSE-Hook fuer Echtzeit-Workflow-Updates
 *
 * Ein einziger EventSource pro User. Callbacks werden bei relevanten
 * Events aufgerufen. Automatischer Reconnect bei Verbindungsabbruch.
 */

import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { env } from '../../core/config/env';
import { sessionStore } from '../../core/session/session-store';

type WorkflowEventType =
    | 'run.updated'
    | 'checkpoint.created'
    | 'checkpoint.resolved'
    | 'form.submitted'
    | 'report.generated'
    | 'concept.updated'
    | 'document.changed'
    | 'calendar.changed'
    | 'task.changed'
    | 'crisis.changed'
    | 'space-email.received'
    | 'space.changed'
    | 'contacts.changed'
    | 'comment.changed'
    | 'checklist.changed'
    | 'mention.created'
    | 'post.changed'
    | 'absence.changed'
    | 'note.changed';

type EventCallback = (event: WorkflowEventType, data: Record<string, unknown>) => void;

// Singleton: ein SSE-Stream pro App-Instanz
let globalSource: EventSource | null = null;
let globalListeners = new Set<EventCallback>();
let globalJwt: string | null = null;

function connectSSE(jwt: string) {
    if (globalSource && globalJwt === jwt) return; // Bereits verbunden
    if (globalSource) globalSource.close();

    globalJwt = jwt;
    const url = `${env.platformBaseUrl}/platform/v1/workflow/events/stream`;

    // EventSource unterstützt keine custom Headers.
    // Workaround: JWT als Query-Parameter senden.
    // Alternativ: fetch-basierter SSE-Reader.
    const source = new EventSource(`${url}?token=${encodeURIComponent(jwt)}`);

    const EVENT_TYPES: WorkflowEventType[] = [
        'run.updated', 'checkpoint.created', 'checkpoint.resolved',
        'form.submitted', 'report.generated', 'concept.updated',
        'document.changed', 'calendar.changed', 'task.changed', 'crisis.changed',
        'space-email.received', 'space.changed', 'contacts.changed',
        'comment.changed', 'checklist.changed', 'mention.created',
        'post.changed', 'absence.changed', 'note.changed',
    ];

    for (const type of EVENT_TYPES) {
        source.addEventListener(type, (e: MessageEvent) => {
            try {
                const data = JSON.parse(e.data);
                for (const cb of globalListeners) {
                    cb(type, data);
                }
            } catch { /* parse error, ignore */ }
        });
    }

    source.onerror = () => {
        // EventSource reconnects automatically
    };

    globalSource = source;
}

function disconnectSSE() {
    if (globalSource) {
        globalSource.close();
        globalSource = null;
        globalJwt = null;
    }
}

/**
 * Hook: Registriert einen Callback fuer Workflow-Events.
 *
 * Verbindet automatisch den SSE-Stream wenn ein JWT vorhanden ist.
 * Mehrere Komponenten koennen den Hook nutzen — alle teilen sich
 * denselben Stream.
 *
 * @example
 * useWorkflowEvents((event, data) => {
 *   if (event === 'run.updated') reloadRuns();
 *   if (event === 'report.generated') reloadReports();
 * });
 */
export function useWorkflowEvents(callback: EventCallback) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    // Stabiler Wrapper der immer den aktuellen Callback aufruft
    const stableCallback = useCallback<EventCallback>((event, data) => {
        callbackRef.current(event, data);
    }, []);

    useEffect(() => {
        if (!jwt) return;

        // SSE verbinden (Singleton — nur einmal)
        connectSSE(jwt);

        // Listener registrieren
        globalListeners.add(stableCallback);

        return () => {
            globalListeners.delete(stableCallback);
            // Stream offen lassen solange andere Listener da sind
            if (globalListeners.size === 0) {
                disconnectSSE();
            }
        };
    }, [jwt, stableCallback]);
}
