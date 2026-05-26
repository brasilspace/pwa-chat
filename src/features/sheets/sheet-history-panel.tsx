/**
 * SheetHistoryPanel — Sidebar mit Cell-Diff-History.
 *
 * Liste der letzten Aenderungen (max 200), aktualisiert automatisch
 * alle 30s. Klick auf einen Eintrag scrollt zur Cell (best-effort).
 *
 * Format pro Eintrag:
 *   <user> · <zeit> · <Sheet1!B3>: '<old>' → '<new>'
 */

import { type JSX } from 'react';
import { useSheetHistory } from './use-sheet-history';
import { History, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    sheetId: string;
    onClose: () => void;
    onJumpToCell?: (worksheetId: string, row: number, col: number) => void;
}

function formatUser(uid: string): string {
    return uid.replace(/^@/, '').split(':')[0];
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = Date.now();
    const diffSec = Math.floor((now - d.getTime()) / 1000);
    if (diffSec < 60) return 'gerade eben';
    if (diffSec < 3600) return `vor ${Math.floor(diffSec / 60)} Min`;
    if (diffSec < 86400) return `vor ${Math.floor(diffSec / 3600)} Std`;
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function colLetter(col: number): string {
    let s = '';
    let n = col;
    while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
    return s;
}

function shorten(v: string | null, max = 32): string {
    if (v === null || v === '') return '—';
    if (v.length <= max) return v;
    return v.slice(0, max) + '…';
}

export function SheetHistoryPanel({ sheetId, onClose, onJumpToCell }: Props): JSX.Element {
    const t = useT();
    const { versions, loading, refresh } = useSheetHistory(sheetId, { autoRefreshMs: 30_000 });

    return (
        <div className="flex h-full w-80 flex-col border-l border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                    <MaterialIcon name="history" size={16} className="size-4" />
                    <span className="text-sm font-medium">{t('sheets.sheet_history.verlauf')}</span>
                    <span className="text-[10px] text-muted-foreground">{versions.length}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={refresh} title={t('sheets.sheet_history.aktualisieren')} className="rounded p-1 hover:bg-muted">
                        <Loader2 className={cn('size-3.5', loading && 'animate-spin')} />
                    </button>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {loading && versions.length === 0 && (
                    <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
                )}

                {!loading && versions.length === 0 && (
                    <p className="text-xs text-muted-foreground italic text-center py-4">
                        {t('sheets.sheet_history.noch_keine_aenderungen')}
                    </p>
                )}

                {versions.map(v => (
                    <button
                        key={v.id}
                        onClick={() => onJumpToCell?.(v.worksheetId, v.row, v.col)}
                        className="block w-full text-left rounded border border-border p-2 text-[11px] hover:bg-muted"
                    >
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="font-medium text-foreground">{formatUser(v.userId)}</span>
                            <span>·</span>
                            <span>{formatTime(v.changedAt)}</span>
                            <span>·</span>
                            <code className="rounded bg-muted px-1 font-mono">{colLetter(v.col)}{v.row + 1}</code>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 break-words">
                            <span className="text-muted-foreground line-through">{shorten(v.oldValue)}</span>
                            <MaterialIcon name="arrow_forward" size={16} className="size-3 shrink-0 text-muted-foreground" />
                            <span className="font-medium">{shorten(v.newValue)}</span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
