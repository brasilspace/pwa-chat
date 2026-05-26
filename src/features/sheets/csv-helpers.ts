/**
 * csv-helpers — CSV-Im/Export fuer Univer-Workbooks.
 *
 * Wir gehen ueber das aktive Worksheet eines Workbook-Snapshots und
 * mappen Cell-Daten auf CSV (export) bzw. zurueck (import). Quoting
 * folgt RFC 4180 — doppelte Anfuehrungszeichen werden verdoppelt,
 * Felder mit Komma/Anfuehrungszeichen/Newline werden gequotet.
 */

interface CellData { v?: string | number | boolean | null; t?: number }
interface SheetData { cellData?: Record<string, Record<string, CellData>>; rowCount?: number; columnCount?: number }
interface WorkbookSnapshot { sheets: Record<string, SheetData>; sheetOrder: string[] }

/** Escapt ein einzelnes Feld nach RFC 4180. */
function escapeField(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

/** Exportiert die Daten des aktiven (oder ersten) Worksheets als CSV-String. */
export function workbookToCsv(workbook: WorkbookSnapshot): string {
    const firstSheetId = workbook.sheetOrder[0];
    if (!firstSheetId) return '';
    const sheet = workbook.sheets[firstSheetId];
    if (!sheet?.cellData) return '';

    // Echte Bounding-Box ermitteln (statt rowCount/columnCount, das oft 100/26 Default ist)
    let maxRow = -1;
    let maxCol = -1;
    for (const rowKey of Object.keys(sheet.cellData)) {
        const r = Number(rowKey);
        if (Number.isFinite(r) && r > maxRow) maxRow = r;
        for (const colKey of Object.keys(sheet.cellData[rowKey] ?? {})) {
            const c = Number(colKey);
            if (Number.isFinite(c) && c > maxCol) maxCol = c;
        }
    }
    if (maxRow < 0 || maxCol < 0) return '';

    const lines: string[] = [];
    for (let r = 0; r <= maxRow; r++) {
        const row = sheet.cellData[r] ?? {};
        const fields: string[] = [];
        for (let c = 0; c <= maxCol; c++) {
            fields.push(escapeField(row[c]?.v));
        }
        lines.push(fields.join(','));
    }
    return lines.join('\r\n');
}

/** Parst CSV-String in ein 2D-Array. RFC 4180. */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { row.push(field); field = ''; }
            else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                row.push(field); field = '';
                rows.push(row); row = [];
            } else {
                field += ch;
            }
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

/**
 * Konvertiert ein 2D-Array in ein cellData-JSON, wie Univer es im
 * Worksheet erwartet. Versucht numerische Werte als number zu speichern,
 * sonst als string.
 */
export function rowsToCellData(rows: string[][]): Record<string, Record<string, { v: string | number }>> {
    const out: Record<string, Record<string, { v: string | number }>> = {};
    for (let r = 0; r < rows.length; r++) {
        const cells: Record<string, { v: string | number }> = {};
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
            const raw = row[c];
            if (raw === '') continue;
            // Ist's eine Zahl?
            const num = Number(raw);
            const isNumber = raw.trim() !== '' && Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(raw.trim());
            cells[String(c)] = { v: isNumber ? num : raw };
        }
        if (Object.keys(cells).length > 0) out[String(r)] = cells;
    }
    return out;
}

export function downloadCsv(filename: string, csv: string): void {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}
