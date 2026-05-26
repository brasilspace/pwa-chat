/**
 * ShareSheetModal — Berechtigungen pro Sheet verwalten.
 *
 * Eigentuemer kann:
 *   - Personen hinzufuegen mit Rolle (Bearbeiter/Kommentator/Betrachter)
 *   - Rolle bestehender Eintraege aendern
 *   - Eintraege entfernen
 *
 * Andere Rollen sehen nur die Liste (keine Aktionen).
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { sheetPermissionsApi, type SheetPermission, type SheetRole } from './use-sheets';
import { useContacts } from '@/features/contacts/use-contacts';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    sheetId: string;
    onClose: () => void;
}

const ROLE_LABEL: Record<'EDITOR' | 'COMMENTER' | 'VIEWER', string> = {
    EDITOR: 'Bearbeiter',
    COMMENTER: 'Kommentator',
    VIEWER: 'Betrachter',
};

const ROLE_DESCRIPTION: Record<'EDITOR' | 'COMMENTER' | 'VIEWER', string> = {
    EDITOR: 'Kann Zellen, Spalten und Zeilen bearbeiten',
    COMMENTER: 'Kann nur kommentieren, keine Zellinhalte aendern',
    VIEWER: 'Kann nur ansehen',
};

function formatUserId(uid: string): string {
    return uid.replace(/^@/, '').split(':')[0];
}

export function ShareSheetModal({ sheetId, onClose }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { contacts } = useContacts();
    const [permissions, setPermissions] = useState<SheetPermission[]>([]);
    const [myRole, setMyRole] = useState<SheetRole>('VIEWER');
    const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
    const [scope, setScope] = useState<'SPACE' | 'PERSONAL' | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [pickerUserId, setPickerUserId] = useState('');
    const [pickerRole, setPickerRole] = useState<'EDITOR' | 'COMMENTER' | 'VIEWER'>('EDITOR');

    const refresh = () => {
        if (!jwt) return;
        setLoading(true);
        sheetPermissionsApi.list(jwt, sheetId)
            .then(r => {
                setPermissions(r.permissions);
                setMyRole(r.myRole);
                setOwnerUserId(r.ownerUserId);
                setScope(r.scope);
            })
            .catch(e => alert('Fehler: ' + (e instanceof Error ? e.message : String(e))))
            .finally(() => setLoading(false));
    };

    useEffect(refresh, [sheetId, jwt]);

    const isOwner = myRole === 'OWNER';

    const grant = async () => {
        if (!jwt || !pickerUserId) return;
        setBusy(true);
        try {
            await sheetPermissionsApi.grant(jwt, sheetId, pickerUserId, pickerRole);
            setPickerUserId('');
            refresh();
        } catch (e) {
            alert('Hinzufuegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    const updateRole = async (perm: SheetPermission, role: 'EDITOR' | 'COMMENTER' | 'VIEWER') => {
        if (!jwt) return;
        setBusy(true);
        try {
            await sheetPermissionsApi.update(jwt, sheetId, perm.id, role);
            refresh();
        } catch (e) {
            alert('Update fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    const revoke = async (perm: SheetPermission) => {
        if (!jwt) return;
        if (!confirm(`Berechtigung fuer ${formatUserId(perm.userId)} entfernen?`)) return;
        setBusy(true);
        try {
            await sheetPermissionsApi.revoke(jwt, sheetId, perm.id);
            refresh();
        } catch (e) {
            alert('Entfernen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    // Kontakte ohne bestehende Permissions + ohne Owner anbieten
    const grantedIds = new Set(permissions.map(p => p.userId).concat(ownerUserId ? [ownerUserId] : []));
    const candidates = contacts.filter(c => !grantedIds.has(c.id));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-lg bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="font-semibold inline-flex items-center gap-2"><MaterialIcon name="groups" size={16} className="size-4" /> {t('sheets.share_sheet_modal.tabelle_teilen')}</h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading && <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}

                    {!loading && (
                        <>
                            {/* Owner-Zeile */}
                            {ownerUserId && (
                                <div className="rounded border border-border p-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{formatUserId(ownerUserId)}</span>
                                        <span className="text-xs text-muted-foreground">{t('sheets.share_sheet_modal.eigentuemer')}</span>
                                    </div>
                                </div>
                            )}

                            {scope === 'SPACE' && (
                                <p className="rounded bg-muted/30 p-2 text-[11px] text-muted-foreground">
                                    {t('sheets.share_sheet_modal.diese_tabelle_liegt_in_einem_space_alle_')}
                                </p>
                            )}

                            {/* Permission-Liste */}
                            {permissions.map(p => (
                                <div key={p.id} className="rounded border border-border p-2 text-sm flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{formatUserId(p.userId)}</div>
                                        <div className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[p.role]}</div>
                                    </div>
                                    {isOwner ? (
                                        <>
                                            <select
                                                value={p.role}
                                                onChange={e => updateRole(p, e.target.value as never)}
                                                disabled={busy}
                                                className="rounded border border-border bg-background px-1.5 py-1 text-xs"
                                            >
                                                {(['EDITOR', 'COMMENTER', 'VIEWER'] as const).map(r => (
                                                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => revoke(p)}
                                                disabled={busy}
                                                title={t('sheets.share_sheet_modal.entfernen')}
                                                className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                            >
                                                <MaterialIcon name="delete" size={16} className="size-3.5" />
                                            </button>
                                        </>
                                    ) : (
                                        <span className="text-xs">{ROLE_LABEL[p.role]}</span>
                                    )}
                                </div>
                            ))}

                            {permissions.length === 0 && scope !== 'SPACE' && (
                                <p className="text-center text-xs text-muted-foreground py-3">
                                    {t('sheets.share_sheet_modal.noch_nicht_geteilt')}
                                </p>
                            )}

                            {/* Hinzufuegen — nur Owner */}
                            {isOwner && (
                                <div className="rounded border border-dashed border-border p-3 space-y-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('sheets.share_sheet_modal.person_hinzufuegen')}</p>
                                    <select
                                        value={pickerUserId}
                                        onChange={e => setPickerUserId(e.target.value)}
                                        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                                    >
                                        <option value="">{t('sheets.share_sheet_modal.person_waehlen')}</option>
                                        {candidates.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.displayName} ({formatUserId(c.id)})
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={pickerRole}
                                        onChange={e => setPickerRole(e.target.value as never)}
                                        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                                    >
                                        {(['EDITOR', 'COMMENTER', 'VIEWER'] as const).map(r => (
                                            <option key={r} value={r}>{ROLE_LABEL[r]} — {ROLE_DESCRIPTION[r]}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={grant}
                                        disabled={busy || !pickerUserId}
                                        className={cn(
                                            'w-full rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
                                        )}
                                    >
                                        {busy ? <Loader2 className="size-3 animate-spin inline" /> : t('common.add')}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end border-t border-border p-3">
                    <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs">{t('sheets.share_sheet_modal.schliessen')}</button>
                </div>
            </div>
        </div>
    );
}
