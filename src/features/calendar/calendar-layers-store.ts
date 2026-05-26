import { sessionStore } from '@/core/session/session-store';
import { createCalendarGateway } from '@/gateways/platform/calendar-gateway';
import { logger } from '@/core/logging/logger';
import type { CalendarLayer } from './calendar-types';

/**
 * Shared store fuer Kalender-Layer.
 *
 * Vorher hatte jeder useCalendarLayers-Aufruf seinen eigenen useState — die
 * Sidebar (CalendarWorld) und das Hauptpanel (CalendarPanel) liefen damit
 * in zwei voellig unabhaengigen Welten: ein Toggle in der Sidebar landete
 * im Backend, aber das Panel hatte keine Ahnung davon und re-fetched seine
 * Events nicht. Dieser Store stellt sicher, dass alle Komponenten dieselben
 * Layer sehen und auf Aenderungen reagieren.
 *
 * Pattern: einfacher externer Store mit useSyncExternalStore-faehiger
 * subscribe/getSnapshot-API. Kein Zustand/Redux noetig fuer so kleinen
 * Scope.
 */

const gateway = createCalendarGateway();

interface LayersState {
    layers: CalendarLayer[];
    loading: boolean;
    loaded: boolean;
}

let state: LayersState = {
    layers: [],
    loading: false,
    loaded: false,
};

const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

function setState(next: Partial<LayersState>) {
    state = { ...state, ...next };
    emit();
}

let inFlight: Promise<void> | null = null;

async function loadInternal() {
    const jwt = sessionStore.getSnapshot().platform?.token;
    if (!jwt) return;
    setState({ loading: true });
    try {
        const res = await gateway.getLayers(jwt);
        setState({ layers: res.layers, loaded: true });
    } catch (err) {
        logger.error('calendar-layers-store: load failed', { error: err });
    } finally {
        setState({ loading: false });
    }
}

export const calendarLayersStore = {
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },

    getSnapshot(): LayersState {
        return state;
    },

    /** Idempotent — wenn schon geladen oder gerade in flight, kein zweiter Request. */
    async ensureLoaded(): Promise<void> {
        if (state.loaded || state.loading) {
            return inFlight ?? Promise.resolve();
        }
        inFlight = loadInternal().finally(() => { inFlight = null; });
        return inFlight;
    },

    /** Erzwingt einen Refetch, etwa nach Layer-Create/Delete. */
    async refresh(): Promise<void> {
        inFlight = loadInternal().finally(() => { inFlight = null; });
        return inFlight;
    },

    /**
     * Toggle subscribed-Zustand fuer einen Layer.
     * Optimistisches Update mit Rollback bei API-Fehler. Nach erfolgreichem
     * Toggle benachrichtigen wir alle Subscriber, sodass z.B. die Events-Hook
     * automatisch nachladen kann.
     */
    async toggleLayer(layerId: string): Promise<void> {
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) return;
        const layer = state.layers.find((l) => l.id === layerId);
        if (!layer) return;
        const wasSubscribed = layer.subscribed;

        // Optimistisch
        setState({
            layers: state.layers.map((l) => (l.id === layerId ? { ...l, subscribed: !l.subscribed } : l)),
        });

        try {
            if (wasSubscribed) {
                await gateway.unsubscribeLayer(jwt, layerId);
            } else {
                await gateway.subscribeLayer(jwt, layerId);
            }
        } catch (err) {
            logger.error('calendar-layers-store: toggle failed', { error: err });
            // Rollback
            setState({
                layers: state.layers.map((l) => (l.id === layerId ? { ...l, subscribed: wasSubscribed } : l)),
            });
        }
    },
};
