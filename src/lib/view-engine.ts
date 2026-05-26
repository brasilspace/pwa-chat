/**
 * view-engine — wendet eine ViewDefinition (filters/sort/groupBy)
 * client-seitig auf eine ContactView-Liste an (CRM-Foundation C.4).
 *
 * field-Namespace (D18, deckt sich mit view-definition-defaults.ts):
 *   Core:  displayName | firstName | lastName | primaryEmail |
 *          primaryPhone | userType | userTypeKey | source | active |
 *          admin | organization | birthDate | lastTouchAt | activityCount
 *   Custom: `cf:<fieldKey>`  → ContactView.customFields[fieldKey]
 *
 * Server-seitige Filterung/GIN ist bewusst NICHT Phase-C-Scope.
 */

import type { ContactView } from '@/features/contacts/unified/contact-view';

export type ViewOwnerType = 'USER' | 'SHARED' | 'SYSTEM';
export type ViewType = 'TABLE' | 'KANBAN' | 'CALENDAR' | 'TIMELINE';
export type FilterOp = 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'in' | 'exists';

export interface ViewColumn { key: string; width?: number; visible?: boolean }
export interface ViewFilter { field: string; op: FilterOp; value: unknown }
export interface ViewSort { field: string; dir: 'asc' | 'desc' }

export interface ViewDef {
    id: string;
    entityType: string;
    name: string;
    icon: string | null;
    ownerType: ViewOwnerType;
    ownerAccountId: string | null;
    columns: ViewColumn[];
    filters: ViewFilter[];
    sort: ViewSort[];
    groupBy: string | null;
    viewType: ViewType;
    sortOrder: number;
}

function primary(arr: { value: string; primary?: boolean }[] | undefined): string | null {
    if (!arr || arr.length === 0) return null;
    return (arr.find(x => x.primary) ?? arr[0]).value;
}

/** Liest einen Feldwert aus einer ContactView nach Namespace-Konvention. */
export function getFieldValue(c: ContactView, field: string): unknown {
    if (field.startsWith('cf:')) {
        return (c.customFields ?? {})[field.slice(3)];
    }
    switch (field) {
        case 'displayName': return c.displayName;
        case 'firstName': return c.firstName ?? null;
        case 'lastName': return c.lastName ?? null;
        case 'primaryEmail': return primary(c.emails);
        case 'primaryPhone': return primary(c.phones);
        case 'userType': return c.badge ?? null;
        case 'userTypeKey': return c.userTypeKey ?? null;
        case 'source': return c.source;
        case 'active': return c.active ?? null;
        case 'admin': return c.admin ?? null;
        case 'organization': return c.organization?.name ?? null;
        case 'birthDate': return c.birthDate ?? null;
        case 'lastTouchAt': return c.lastTouchAt ?? null;
        case 'activityCount': return c.activityCount ?? 0;
        default: return null;
    }
}

function cmp(a: unknown, b: unknown): number {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function matchFilter(c: ContactView, f: ViewFilter): boolean {
    const v = getFieldValue(c, f.field);
    switch (f.op) {
        case 'eq': return v === f.value || String(v) === String(f.value);
        case 'neq': return !(v === f.value || String(v) === String(f.value));
        case 'contains':
            return v != null && String(v).toLowerCase().includes(String(f.value).toLowerCase());
        case 'gt': return v != null && cmp(v, f.value) > 0;
        case 'lt': return v != null && cmp(v, f.value) < 0;
        case 'in':
            return Array.isArray(f.value) && f.value.some(x => x === v || String(x) === String(v));
        case 'exists': {
            const has = v != null && v !== '';
            return f.value === false ? !has : has;
        }
        default: return true;
    }
}

export interface AppliedView {
    rows: ContactView[];
    /** Nur bei viewType=KANBAN + groupBy gesetzt: Reihenfolge der Gruppen. */
    groups: { key: string; label: string; rows: ContactView[] }[] | null;
}

/** Filtert + sortiert (+ gruppiert bei KANBAN) eine Liste nach einer View. */
export function applyView(list: ContactView[], view: ViewDef): AppliedView {
    let rows = list;
    if (view.filters?.length) {
        rows = rows.filter(c => view.filters.every(f => matchFilter(c, f)));
    }
    if (view.sort?.length) {
        rows = [...rows].sort((a, b) => {
            for (const s of view.sort) {
                const d = cmp(getFieldValue(a, s.field), getFieldValue(b, s.field));
                if (d !== 0) return s.dir === 'desc' ? -d : d;
            }
            return 0;
        });
    }
    let groups: AppliedView['groups'] = null;
    if (view.viewType === 'KANBAN' && view.groupBy) {
        const gb = view.groupBy;
        const map = new Map<string, ContactView[]>();
        for (const c of rows) {
            const raw = getFieldValue(c, gb);
            const key = raw == null || raw === '' ? '—' : String(raw);
            (map.get(key) ?? map.set(key, []).get(key)!).push(c);
        }
        groups = [...map.entries()]
            .sort((a, b) => cmp(a[0], b[0]))
            .map(([key, r]) => ({ key, label: key, rows: r }));
    }
    return { rows, groups };
}

/** Spalten einer View die NICHT zum Default-Row-Layout gehören (Sub-Zeile). */
const DEFAULT_ROW_KEYS = new Set(['displayName', 'primaryEmail', 'userType']);
export function extraColumns(view: ViewDef): ViewColumn[] {
    return (view.columns ?? []).filter(
        col => col.visible !== false && !DEFAULT_ROW_KEYS.has(col.key),
    );
}
