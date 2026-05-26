import { useCallback, useEffect, useRef, useState, useMemo, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createCalendarGateway } from '@/gateways/platform/calendar-gateway';
import { logger } from '@/core/logging/logger';
import { calendarLayersStore } from './calendar-layers-store';
import type { CalendarEvent } from './calendar-types';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';

const gateway = createCalendarGateway();

// ─── Layers Hook ────────────────────────────────────────────────────────
//
// Liest aus dem geteilten calendarLayersStore. So sehen Sidebar-Welt und
// Haupt-Panel denselben Zustand und Toggle-Aenderungen propagieren ueberall.

export function useCalendarLayers() {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const layersState = useSyncExternalStore(
        calendarLayersStore.subscribe,
        calendarLayersStore.getSnapshot,
    );

    useEffect(() => {
        if (session.state === 'ready') {
            calendarLayersStore.ensureLoaded();
        }
    }, [session.state]);

    const subscribedLayerIds = useMemo(
        () => layersState.layers.filter((l) => l.subscribed).map((l) => l.id),
        [layersState.layers],
    );

    return {
        layers: layersState.layers,
        loading: layersState.loading,
        toggleLayer: calendarLayersStore.toggleLayer,
        subscribedLayerIds,
        refresh: calendarLayersStore.refresh,
    };
}

// ─── Events Hook ────────────────────────────────────────────────────────

export function useCalendarEvents(layerIds: string[], from: Date, to: Date) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    const layerKey = layerIds.join(',');
    const fromKey = from.getTime();
    const toKey = to.getTime();

    const load = useCallback(async () => {
        if (!jwt || layerIds.length === 0) {
            setEvents([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await gateway.getEvents(jwt, {
                layers: layerIds.join(','),
                from: from.toISOString(),
                to: to.toISOString(),
            });
            if (mountedRef.current) setEvents(res.events);
        } catch (err) {
            logger.error('Failed to load calendar events', { error: err });
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [jwt, layerKey, fromKey, toKey]);

    useEffect(() => {
        mountedRef.current = true;
        if (session.state === 'ready') load();
        return () => { mountedRef.current = false; };
    }, [session.state, load]);

    // SSE: Backend pusht 'calendar.changed' bei Event-Aenderungen im Tenant.
    useWorkflowEvents((event) => {
        if (event === 'calendar.changed') load();
    });

    const createEvent = useCallback(async (data: {
        layerId: string; title: string; description?: string; location?: string;
        dtstart: string; dtend?: string; allDay?: boolean; color?: string;
    }) => {
        if (!jwt) return;
        try {
            await gateway.createEvent(jwt, data);
            await load();
        } catch (err) {
            logger.error('Failed to create event', { error: err });
            throw err;
        }
    }, [jwt, load]);

    const updateEvent = useCallback(async (eventId: string, patch: Record<string, unknown>) => {
        if (!jwt) return;
        try {
            await gateway.updateEvent(jwt, eventId, patch);
            await load();
        } catch (err) {
            logger.error('Failed to update event', { error: err });
            throw err;
        }
    }, [jwt, load]);

    const deleteEvent = useCallback(async (eventId: string) => {
        if (!jwt) return;
        setEvents(prev => prev.filter(e => e.id !== eventId));
        try {
            await gateway.deleteEvent(jwt, eventId);
        } catch (err) {
            logger.error('Failed to delete event', { error: err });
            await load();
        }
    }, [jwt, load]);

    return { events, loading, createEvent, updateEvent, deleteEvent, refresh: load };
}

// ─── Schulkalender (Level 1) – Schreibrechte ─────────────────────────────
//
// Backend-Wahrheit: Admins oder Mitglieder des Tenant-Settings
// `calendar_planner_space_id` ("Termin-Steuergruppe") duerfen den
// Schulkalender bewirtschaften. UI darf Level-1 fuer alle anderen
// gar nicht erst zur Auswahl anbieten.

export function useCanManageSchoolCalendar() {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [canManage, setCanManage] = useState(false);
    const [plannerSpaceId, setPlannerSpaceId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await gateway.canManageSchool(jwt);
            setCanManage(!!res.canManage);
            setPlannerSpaceId(res.plannerSpaceId ?? null);
        } catch (err) {
            logger.error('Failed to load school-calendar permission', { error: err });
            setCanManage(false);
            setPlannerSpaceId(null);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => {
        if (session.state === 'ready' && jwt) refresh();
    }, [session.state, jwt, refresh]);

    return { canManage, plannerSpaceId, loading, refresh };
}

