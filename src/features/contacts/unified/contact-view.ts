/**
 * ContactView — vereinheitlichtes Datenmodell fuer Mitglieder
 * (UserDirectoryEntry) und externe Kontakte (ExternalContact).
 *
 * Die UI rendert beide ueber das gleiche Layout. Die Quelle wird im
 * `source`-Feld kenntlich gemacht und steuert was bearbeitbar ist.
 */

import type { Contact } from '../use-contacts';
import type { ExternalContactSummary } from '@/gateways/platform/external-contacts-gateway';

export interface ContactView {
    id: string;
    /** 'member' = interner User mit Login. 'person'/'organization' = externer Kontakt. */
    source: 'member' | 'person' | 'organization';
    /** Original-ID fuer den Backend-Call (Matrix-ID bei member, ExternalContact.id bei extern). */
    refId: string;
    /** Bei member: UserDirectoryEntry.id (fuer PATCH/extend/reset). Sonst undefined. */
    directoryId?: string;
    displayName: string;
    firstName?: string | null;
    lastName?: string | null;
    /** Berufsbezeichnung / Titel (Mitglied: userType-Label, Extern: title). */
    badge?: string | null;
    userTypeKey?: string | null;
    /** Avatar-MXC (nur fuer Members; sonst Initialen) */
    avatarMxc?: string | null;

    emails: { label?: string; value: string; primary?: boolean }[];
    phones: { label?: string; value: string; primary?: boolean }[];
    addresses: { label?: string; street?: string; postalCode?: string; city?: string; country?: string }[];
    websites: { label?: string; value: string }[];

    organization?: { id: string; name: string } | null;
    members?: { id: string; name: string }[];

    notes?: string | null;
    birthDate?: string | null;
    tags: { id: string; label: string; slug: string; color: string | null }[];

    visibility?: 'private' | 'space' | 'tenant';
    ownerUserId?: string;

    lastTouchAt: string | null;
    activityCount: number;
    /** CRM-Foundation C: Tenant-Custom-Felder (cf:<key> in der View-Engine). */
    customFields: Record<string, unknown>;

    // Office-Felder (member-only)
    admin?: boolean;
    active?: boolean;
    expiresAt?: string | null;
    isPermanent?: boolean;
    membershipCount?: number;
}

export function memberToView(c: Contact): ContactView {
    const [first, ...rest] = (c.displayName || c.username).split(/\s+/);
    return {
        id: `m:${c.id}`,
        source: 'member',
        refId: c.id,
        directoryId: c.directoryId,
        displayName: c.displayName || c.username,
        firstName: first ?? null,
        lastName: rest.length > 0 ? rest.join(' ') : null,
        badge: c.userType,
        userTypeKey: c.userTypeKey,
        avatarMxc: null,
        emails: c.email ? [{ value: c.email, primary: true }] : [],
        phones: c.phone ? [{ value: c.phone, primary: true }] : [],
        addresses: (c.street || c.city) ? [{
            street: c.street ?? '', postalCode: c.postalCode ?? '',
            city: c.city ?? '', country: c.country ?? '',
        }] : [],
        websites: [],
        organization: null,
        members: [],
        notes: null,
        birthDate: c.birthDate,
        tags: [],
        visibility: 'tenant',
        lastTouchAt: null,
        activityCount: 0,
        customFields: c.customFields ?? {},
        admin: c.admin,
        active: c.active,
        expiresAt: c.expiresAt,
        isPermanent: c.isPermanent,
        membershipCount: c.membershipCount,
    };
}

// ─── Office-Filter-Helper ────────────────────────────────────────

export type OfficeFilter = 'birthdays' | 'expiring' | 'expired-active' | 'no-space';

const DAYS_MS = 86_400_000;

export function isExpiringSoon(c: ContactView, days = 30): boolean {
    if (c.source !== 'member' || c.isPermanent || !c.expiresAt) return false;
    const ms = new Date(c.expiresAt).getTime() - Date.now();
    return ms >= 0 && ms <= days * DAYS_MS;
}

export function isExpiredActive(c: ContactView): boolean {
    if (c.source !== 'member' || !c.active || c.isPermanent || !c.expiresAt) return false;
    return new Date(c.expiresAt).getTime() < Date.now();
}

export function hasBirthdayWithin(c: ContactView, days = 7): boolean {
    if (!c.birthDate) return false;
    const bd = new Date(c.birthDate);
    const now = new Date();
    const thisYear = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
    const nextYear = new Date(now.getFullYear() + 1, bd.getMonth(), bd.getDate());
    const target = thisYear.getTime() < now.getTime() - DAYS_MS ? nextYear : thisYear;
    const diff = target.getTime() - now.getTime();
    return diff >= -DAYS_MS && diff <= days * DAYS_MS;
}

export function isOrphan(c: ContactView): boolean {
    return c.source === 'member' && (c.membershipCount ?? 0) === 0;
}

export function applyOfficeFilter(c: ContactView, filter: OfficeFilter | null): boolean {
    if (!filter) return true;
    if (filter === 'birthdays') return hasBirthdayWithin(c, 7);
    if (filter === 'expiring') return isExpiringSoon(c, 30);
    if (filter === 'expired-active') return isExpiredActive(c);
    if (filter === 'no-space') return isOrphan(c);
    return true;
}

/** Status-Pill fuer die Liste: kritisch / Achtung / Geburtstag / null */
export function statusPill(c: ContactView): { kind: 'critical' | 'warn' | 'info'; label: string } | null {
    if (isExpiredActive(c)) {
        const days = Math.floor((Date.now() - new Date(c.expiresAt!).getTime()) / DAYS_MS);
        return { kind: 'critical', label: `${days}T abgelaufen` };
    }
    if (isExpiringSoon(c, 30)) {
        const days = Math.floor((new Date(c.expiresAt!).getTime() - Date.now()) / DAYS_MS);
        return { kind: 'warn', label: `läuft in ${days}T ab` };
    }
    if (hasBirthdayWithin(c, 7)) {
        return { kind: 'info', label: '🎂 Geburtstag' };
    }
    return null;
}

export function externalToView(c: ExternalContactSummary): ContactView {
    return {
        id: `x:${c.id}`,
        source: c.kind,
        refId: c.id,
        displayName: c.displayName,
        firstName: c.firstName,
        lastName: c.lastName,
        badge: c.title,
        avatarMxc: null,
        emails: c.emails as ContactView['emails'],
        phones: c.phones as ContactView['phones'],
        addresses: c.addresses as ContactView['addresses'],
        websites: c.websites as ContactView['websites'],
        organization: c.organization,
        notes: c.notes,
        birthDate: c.birthDate,
        tags: c.tags,
        visibility: c.visibility,
        ownerUserId: c.ownerUserId,
        lastTouchAt: c.lastTouchAt,
        activityCount: c.activityCount,
        customFields: (c as { customFields?: Record<string, unknown> }).customFields ?? {},
    };
}
