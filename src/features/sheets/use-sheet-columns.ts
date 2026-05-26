/**
 * use-sheet-columns — Spalten-Typ-Konfiguration eines Sheets.
 *
 * Spalten-Typen werden deklarativ pro (sheetId, worksheetId, columnIndex)
 * gespeichert. Beim Sheet-Editor-Open liest der Frontend die Configs
 * und konfiguriert Univer's Data-Validation/Conditional-Formatting
 * automatisch fuer die Spalten-Range.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';

export type SheetColumnType =
    | 'text' | 'number' | 'date' | 'checkbox'
    | 'select' | 'multi-select' | 'status'
    | 'link' | 'person' | 'file';

export interface SelectOption {
    value: string;
    color?: string;
}

export interface SheetColumnConfig {
    /** select / multi-select / status */
    options?: SelectOption[];
    /** number */
    min?: number;
    max?: number;
    decimals?: number;
    /** Generische Felder fuer kuenftige Typen */
    [key: string]: unknown;
}

export interface SheetColumn {
    id: string;
    sheetId: string;
    worksheetId: string;
    columnIndex: number;
    name: string | null;
    type: SheetColumnType;
    config: SheetColumnConfig | null;
    createdAt: string;
    updatedAt: string;
}

const base = env.platformBaseUrl;

export const sheetColumnsApi = {
    list: (jwt: string, sheetId: string) =>
        requestJson<{ columns: SheetColumn[] }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/columns`,
            method: 'GET', bearerToken: jwt,
        }),
    upsert: (jwt: string, sheetId: string, data: {
        worksheetId: string;
        columnIndex: number;
        name?: string | null;
        type: SheetColumnType;
        config?: SheetColumnConfig | null;
    }) =>
        requestJson<{ column: SheetColumn }>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/columns`,
            method: 'PUT', bearerToken: jwt, body: JSON.stringify(data),
        }),
    delete: (jwt: string, sheetId: string, columnId: string) =>
        requestJson<void>({
            target: 'platform', baseUrl: base,
            path: `/platform/v1/sheets/${encodeURIComponent(sheetId)}/columns/${encodeURIComponent(columnId)}`,
            method: 'DELETE', bearerToken: jwt,
        }),
};

export function useSheetColumns(sheetId: string | null) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [columns, setColumns] = useState<SheetColumn[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!jwt || !sheetId) { setLoading(false); return; }
        setLoading(true);
        sheetColumnsApi.list(jwt, sheetId)
            .then(r => setColumns(r.columns))
            .catch(() => setColumns([]))
            .finally(() => setLoading(false));
    }, [jwt, sheetId]);

    useEffect(() => { refresh(); }, [refresh]);

    return { columns, loading, refresh };
}

/** Default-Status-Optionen mit Prilog-Farben — Quick-Setup beim "Status"-Wahl. */
export const DEFAULT_STATUS_OPTIONS: SelectOption[] = [
    { value: 'Offen',     color: '#9CA3AF' },
    { value: 'In Arbeit', color: '#F59E0B' },
    { value: 'Erledigt',  color: '#10B981' },
    { value: 'Blockiert', color: '#EF4444' },
];

/** Type-Labels (deutsch) */
export const COLUMN_TYPE_LABELS: Record<SheetColumnType, string> = {
    text: 'Text',
    number: 'Zahl',
    date: 'Datum',
    checkbox: 'Checkbox',
    select: 'Auswahl',
    'multi-select': 'Mehrfachauswahl',
    status: 'Status',
    link: 'Link',
    person: 'Person',
    file: 'Datei',
};
