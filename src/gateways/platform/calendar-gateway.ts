import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';
import type { CalendarLayer, CalendarEvent } from '@/features/calendar/calendar-types';

export interface CalendarGateway {
    getLayers(jwt: string): Promise<{ layers: CalendarLayer[] }>;
    createLayer(jwt: string, body: { spaceId?: string; level: number; name: string; color?: string }): Promise<{ layer: CalendarLayer }>;
    updateLayer(jwt: string, layerId: string, patch: { name?: string; color?: string; isPublic?: boolean }): Promise<{ layer: CalendarLayer }>;
    deleteLayer(jwt: string, layerId: string): Promise<void>;
    subscribeLayer(jwt: string, layerId: string): Promise<void>;
    unsubscribeLayer(jwt: string, layerId: string): Promise<void>;
    getEvents(jwt: string, params: { layers?: string; from: string; to: string }): Promise<{ events: CalendarEvent[] }>;
    createEvent(jwt: string, body: { layerId: string; title: string; description?: string; location?: string; dtstart: string; dtend?: string; allDay?: boolean; rrule?: string; color?: string; categories?: string[]; attendees?: string[] }): Promise<{ event: CalendarEvent }>;
    updateEvent(jwt: string, eventId: string, body: Record<string, unknown>): Promise<{ event: CalendarEvent }>;
    deleteEvent(jwt: string, eventId: string): Promise<void>;
    importIcs(jwt: string, body: { layerId: string; icsContent: string }): Promise<{ imported: number; skipped: number; total: number }>;
    getPersonalCalendar(jwt: string): Promise<{ layer: CalendarLayer | null }>;
    ensurePersonalCalendar(jwt: string): Promise<{ layer: CalendarLayer }>;
    canManageSchool(jwt: string): Promise<{ canManage: boolean; plannerSpaceId: string | null }>;
    setPlannerSpace(jwt: string, spaceId: string | null): Promise<{ ok: true; plannerSpaceId: string | null }>;
    ensureSpaceCalendar(jwt: string, spaceId: string): Promise<{ layer: CalendarLayer }>;
}

const B = env.platformBaseUrl;
const P = '/platform/v1/calendar';

export const createCalendarGateway = (): CalendarGateway => ({
    getLayers(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/layers`, method: 'GET', bearerToken: jwt });
    },
    createLayer(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/layers`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateLayer(jwt, layerId, patch) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/layers/${encodeURIComponent(layerId)}`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify(patch) });
    },
    deleteLayer(jwt, layerId) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/layers/${encodeURIComponent(layerId)}`, method: 'DELETE', bearerToken: jwt });
    },
    subscribeLayer(jwt, layerId) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/layers/${encodeURIComponent(layerId)}/subscribe`, method: 'POST', bearerToken: jwt, body: '{}' });
    },
    unsubscribeLayer(jwt, layerId) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/layers/${encodeURIComponent(layerId)}/subscribe`, method: 'DELETE', bearerToken: jwt });
    },
    getEvents(jwt, params) {
        const qs = new URLSearchParams({ from: params.from, to: params.to });
        if (params.layers) qs.set('layers', params.layers);
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/events?${qs}`, method: 'GET', bearerToken: jwt });
    },
    createEvent(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/events`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    updateEvent(jwt, eventId, body) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/events/${encodeURIComponent(eventId)}`, method: 'PUT', bearerToken: jwt, body: JSON.stringify(body) });
    },
    deleteEvent(jwt, eventId) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/events/${encodeURIComponent(eventId)}`, method: 'DELETE', bearerToken: jwt });
    },
    importIcs(jwt, body) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/import`, method: 'POST', bearerToken: jwt, body: JSON.stringify(body) });
    },
    getPersonalCalendar(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/personal`, method: 'GET', bearerToken: jwt });
    },
    ensurePersonalCalendar(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/personal/ensure`, method: 'POST', bearerToken: jwt, body: '{}' });
    },
    canManageSchool(jwt) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/can-manage-school`, method: 'GET', bearerToken: jwt });
    },
    setPlannerSpace(jwt, spaceId) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/planner-space`, method: 'PATCH', bearerToken: jwt, body: JSON.stringify({ spaceId }) });
    },
    ensureSpaceCalendar(jwt, spaceId) {
        return requestJson({ target: 'platform', baseUrl: B, path: `${P}/spaces/${encodeURIComponent(spaceId)}/ensure`, method: 'POST', bearerToken: jwt, body: '{}' });
    },
});
