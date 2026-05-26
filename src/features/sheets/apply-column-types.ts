/**
 * apply-column-types — wendet SheetColumn-Configs auf Univer an.
 *
 * Aufgerufen einmal beim Sheet-Open + nach jedem Column-Type-Save.
 * Map zu Univer's nativem Data-Validation-System (so weit moeglich):
 *   - select / status        → requireValueInList(opts, false)
 *   - multi-select           → requireValueInList(opts, true)
 *   - checkbox               → requireCheckbox()
 *   - number (mit Range)     → requireNumberBetween(min, max)
 *   - date (mit Range)       → requireDateBetween(start, end)
 *
 * Person, File und freie text/link bekommen (noch) keine Validation —
 * Person+File werden in P2.3 mit eigenen Custom-Validators gehookt.
 */

import type { SheetColumn } from './use-sheet-columns';

interface UniverFacade {
    getActiveWorkbook?: () => UniverWorkbook | null;
    newDataValidation?: () => UniverDataValidationBuilder;
}

interface UniverWorkbook {
    getSheetBySheetId?: (id: string) => UniverWorksheet | null;
    getActiveSheet?: () => UniverWorksheet | null;
}

interface UniverWorksheet {
    getRange: (row: number, column: number, numRows: number, numColumns: number) => UniverRange;
    getMaxRows?: () => number;
    newConditionalFormattingRule?: () => UniverCfBuilder;
    addConditionalFormattingRule?: (rule: unknown) => unknown;
    getConditionalFormattingRules?: () => Array<{ cfId?: string; ranges?: Array<{ startColumn: number; endColumn: number }> }>;
    deleteConditionalFormattingRule?: (cfId: string) => unknown;
}

interface UniverRange {
    setDataValidation: (rule: unknown) => UniverRange;
}

interface UniverCfBuilder {
    whenTextEqualTo: (text: string) => UniverCfBuilder;
    setBackground: (color?: string) => UniverCfBuilder;
    setFontColor: (color?: string) => UniverCfBuilder;
    setRanges: (ranges: Array<{ startRow: number; endRow: number; startColumn: number; endColumn: number }>) => UniverCfBuilder;
    build: () => unknown;
}

/** Auto-Foreground (white/black) basierend auf Background-Helligkeit. */
function pickContrastColor(hex: string): string {
    const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return '#000';
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    // Standard-Luminanz (rel)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#1f2937' : '#ffffff';
}

interface UniverDataValidationBuilder {
    requireValueInList: (values: string[], multiple?: boolean, showDropdown?: boolean) => UniverDataValidationBuilder;
    requireCheckbox: () => UniverDataValidationBuilder;
    requireNumberBetween: (start: number, end: number, isInteger?: boolean) => UniverDataValidationBuilder;
    requireDateBetween: (start: Date, end: Date) => UniverDataValidationBuilder;
    setOptions: (opts: { showErrorMessage?: boolean; error?: string; allowBlank?: boolean }) => UniverDataValidationBuilder;
    build: () => unknown;
}

/** Bekannte Personen fuer Person-Spalten. Nur displayName + matrixUserId. */
export interface KnownPerson {
    matrixUserId: string;
    displayName: string;
}

/**
 * Wendet eine einzelne Spalten-Config auf Univer an.
 * Header-Row (row 0) bleibt frei — nur row 1+ bekommt die Validierung.
 *
 * options.persons wird fuer type='person' benoetigt — Editor laedt
 * Contacts vorher und reicht sie hier durch.
 */
export function applyColumnToUniver(
    api: UniverFacade,
    column: SheetColumn,
    options?: { headerRow?: number; persons?: KnownPerson[] },
): boolean {
    const wb = api.getActiveWorkbook?.();
    if (!wb) return false;

    // Worksheet finden (per ID falls Univer das unterstuetzt, sonst aktives)
    const sheet = wb.getSheetBySheetId?.(column.worksheetId) ?? wb.getActiveSheet?.();
    if (!sheet) return false;

    const headerRow = options?.headerRow ?? 1; // ab Zeile 1 (Index 1) — Zeile 0 = Header
    const rowCount = (sheet.getMaxRows?.() ?? 1000) - headerRow;
    if (rowCount <= 0) return false;

    const range = sheet.getRange(headerRow, column.columnIndex, rowCount, 1);
    const builder = api.newDataValidation?.();
    if (!builder) return false;

    let configured = false;
    try {
        switch (column.type) {
            case 'select':
            case 'status': {
                const opts = (column.config?.options as Array<{ value: string }> | undefined) ?? [];
                if (opts.length > 0) {
                    builder.requireValueInList(opts.map(o => o.value), false, true);
                    configured = true;
                }
                break;
            }
            case 'multi-select': {
                const opts = (column.config?.options as Array<{ value: string }> | undefined) ?? [];
                if (opts.length > 0) {
                    builder.requireValueInList(opts.map(o => o.value), true, true);
                    configured = true;
                }
                break;
            }
            case 'checkbox':
                builder.requireCheckbox();
                configured = true;
                break;
            case 'number': {
                const min = typeof column.config?.min === 'number' ? column.config.min : -Number.MAX_SAFE_INTEGER;
                const max = typeof column.config?.max === 'number' ? column.config.max : Number.MAX_SAFE_INTEGER;
                if (min !== -Number.MAX_SAFE_INTEGER || max !== Number.MAX_SAFE_INTEGER) {
                    builder.requireNumberBetween(min, max, false);
                    configured = true;
                }
                break;
            }
            case 'date':
                // Default: irgendein Datum zwischen 1970 und 2100
                builder.requireDateBetween(new Date('1970-01-01'), new Date('2100-12-31'));
                configured = true;
                break;
            case 'person': {
                // Person-Spalte: dropdown mit displayNames der Kontakte.
                // Speicherung als Plain-Text (displayName). Avatar-Rendering
                // im Cell waere Univer-Plugin-Aufwand fuer P2.3+.
                const persons = options?.persons ?? [];
                if (persons.length > 0) {
                    const names = persons.map(p => p.displayName).filter(Boolean);
                    if (names.length > 0) {
                        builder.requireValueInList(names, false, true);
                        configured = true;
                    }
                }
                break;
            }
            // text / link / file → keine native Validation in V1
            default:
                break;
        }
    } catch (err) {
        console.warn('applyColumnToUniver: builder failed', column.type, err);
        return false;
    }

    if (!configured) return false;

    builder.setOptions({ showErrorMessage: true, allowBlank: true });
    range.setDataValidation(builder.build());

    // Status / Select mit Farben → zusaetzlich Conditional-Formatting-Rules
    // pro Option, damit der Wert farbig sichtbar wird.
    if (column.type === 'status' || column.type === 'select') {
        applyColorRulesToColumn(sheet, column, headerRow, rowCount);
    }

    return true;
}

/** Erzeugt pro Option mit Farbe eine CF-Rule "wenn Wert = X dann Hintergrund X". */
function applyColorRulesToColumn(
    sheet: UniverWorksheet,
    column: SheetColumn,
    headerRow: number,
    rowCount: number,
): void {
    const opts = (column.config?.options as Array<{ value: string; color?: string }> | undefined) ?? [];
    const withColor = opts.filter(o => o.value && o.color);
    if (withColor.length === 0) return;

    // Bestehende Rules auf dieser Spalte entfernen (idempotent — verhindert
    // Duplikate beim Re-Apply nach Config-Aenderung).
    try {
        const existing = sheet.getConditionalFormattingRules?.() ?? [];
        for (const r of existing) {
            if (r.cfId && r.ranges?.some(rg => rg.startColumn === column.columnIndex && rg.endColumn === column.columnIndex)) {
                sheet.deleteConditionalFormattingRule?.(r.cfId);
            }
        }
    } catch { /* noop */ }

    for (const opt of withColor) {
        try {
            const cfBuilder = sheet.newConditionalFormattingRule?.();
            if (!cfBuilder) return;
            const rule = cfBuilder
                .whenTextEqualTo(opt.value)
                .setBackground(opt.color!)
                .setFontColor(pickContrastColor(opt.color!))
                .setRanges([{
                    startRow: headerRow,
                    endRow: headerRow + rowCount - 1,
                    startColumn: column.columnIndex,
                    endColumn: column.columnIndex,
                }])
                .build();
            sheet.addConditionalFormattingRule?.(rule);
        } catch (err) {
            console.warn('applyColorRulesToColumn: rule failed', opt.value, err);
        }
    }
}

/** Alle Spalten eines Sheets in einem Rutsch anwenden. Best-effort. */
export function applyAllColumnsToUniver(
    api: UniverFacade,
    columns: SheetColumn[],
    options?: { persons?: KnownPerson[] },
): number {
    let applied = 0;
    for (const c of columns) {
        if (applyColumnToUniver(api, c, options)) applied++;
    }
    return applied;
}
