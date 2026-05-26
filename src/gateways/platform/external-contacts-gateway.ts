/**
 * external-contacts-gateway — Client fuer Kontakte-Pro CRM.
 */

import { sessionStore } from '@/core/session/session-store';

export interface ContactEmail { label?: string; value: string; primary?: boolean }
export interface ContactPhone { label?: string; value: string; primary?: boolean }
export interface ContactAddress {
    label?: string; street?: string; postalCode?: string; city?: string; country?: string; primary?: boolean;
}
export interface ContactWebsite { label?: string; value: string }
export interface ContactSocial { network: string; value: string }

export interface ExternalContactSummary {
    id: string;
    kind: 'person' | 'organization';
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    salutation: string | null;
    title: string | null;
    displayName: string;
    organization: { id: string; name: string } | null;
    emails: ContactEmail[];
    phones: ContactPhone[];
    addresses: ContactAddress[];
    websites: ContactWebsite[];
    socials: ContactSocial[];
    notes: string | null;
    birthDate: string | null;
    visibility: 'private' | 'space' | 'tenant';
    ownerUserId: string;
    lastTouchAt: string | null;
    createdAt: string;
    updatedAt: string;
    tags: { id: string; label: string; slug: string; color: string | null }[];
    activityCount: number;
}

export interface ContactActivity {
    id: string;
    contactId: string;
    kind: 'call' | 'email' | 'meeting' | 'note' | 'document' | 'task';
    occurredAt: string;
    actorId: string;
    summary: string | null;
    referenceType: string | null;
    referenceId: string | null;
}

export interface ExternalContactDetail extends ExternalContactSummary {
    members: { id: string; name: string }[];
    activities: ContactActivity[];
    customFields: Record<string, unknown>;
    visibilityScopes: string[];
}

const BASE = '/api/platform/v1/external-contacts';

function authHeaders(): HeadersInit {
    const jwt = sessionStore.getSnapshot().platform?.token;
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export interface ListParams {
    q?: string;
    tags?: string;
    kind?: 'person' | 'organization';
    organizationId?: string;
    owner?: 'me';
    sort?: 'lastTouch' | 'name' | 'created';
    limit?: number;
}

export const externalContactsApi = {
    async list(params: ListParams = {}): Promise<{ items: ExternalContactSummary[] }> {
        const qs = new URLSearchParams();
        if (params.q) qs.set('q', params.q);
        if (params.tags) qs.set('tags', params.tags);
        if (params.kind) qs.set('kind', params.kind);
        if (params.organizationId) qs.set('organizationId', params.organizationId);
        if (params.owner) qs.set('owner', params.owner);
        if (params.sort) qs.set('sort', params.sort);
        if (params.limit) qs.set('limit', String(params.limit));
        const res = await fetch(`${BASE}?${qs}`, { headers: authHeaders() });
        return jsonOrThrow(res);
    },

    async get(id: string): Promise<{ contact: ExternalContactDetail }> {
        const res = await fetch(`${BASE}/${id}`, { headers: authHeaders() });
        return jsonOrThrow(res);
    },

    async create(body: Partial<ExternalContactDetail> & { kind: 'person' | 'organization'; tagIds?: string[] }): Promise<{ contact: { id: string } }> {
        const res = await fetch(BASE, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return jsonOrThrow(res);
    },

    async update(id: string, body: Partial<ExternalContactDetail> & { tagIds?: string[] }): Promise<{ contact: { id: string } }> {
        const res = await fetch(`${BASE}/${id}`, {
            method: 'PATCH',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return jsonOrThrow(res);
    },

    async remove(id: string): Promise<void> {
        const res = await fetch(`${BASE}/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
    },

    async restore(id: string): Promise<void> {
        await fetch(`${BASE}/${id}/restore`, { method: 'POST', headers: authHeaders() });
    },

    async addActivity(id: string, body: { kind: ContactActivity['kind']; summary?: string; occurredAt?: string; referenceType?: string; referenceId?: string }): Promise<{ activity: ContactActivity }> {
        const res = await fetch(`${BASE}/${id}/activities`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return jsonOrThrow(res);
    },

    async deleteActivity(contactId: string, activityId: string): Promise<void> {
        await fetch(`${BASE}/${contactId}/activities/${activityId}`, { method: 'DELETE', headers: authHeaders() });
    },

    vcardUrl(id: string): string {
        return `${BASE}/${id}/vcard`;
    },
    bulkVcardUrl(): string {
        return `${BASE}/bulk-vcard`;
    },

    async importCsv(body: {
        rows: Record<string, string>[];
        mapping: Record<string, string>;
        kind?: 'person' | 'organization';
        visibility?: 'private' | 'tenant';
    }): Promise<{ created: number; errors: { row: number; error: string }[] }> {
        const res = await fetch(`${BASE}/import-csv`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return jsonOrThrow(res);
    },
};
