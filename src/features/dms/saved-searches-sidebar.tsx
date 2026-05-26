/**
 * SavedSearchesSidebar — zeigt persoenliche + shared Smart Folders.
 * Anlegen + Loeschen inline.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { useSavedSearches, savedSearchesApi, type SavedSearch, type SavedSearchQuery } from './use-saved-searches';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    selectedId: string | null;
    onSelect: (s: SavedSearch | null) => void;
    /** Aktueller Filter aus dem Hauptbereich — wird beim "Aus aktueller Suche speichern" verwendet. */
    currentQuery?: SavedSearchQuery;
}

export function SavedSearchesSidebar({ selectedId, onSelect, currentQuery }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const { items, loading, refresh } = useSavedSearches();
    const [creating, setCreating] = useState(false);

    const remove = async (id: string) => {
        if (!jwt) return;
        if (!confirm('Smart Folder loeschen?')) return;
        await savedSearchesApi.delete(jwt, id).catch(() => { });
        if (selectedId === id) onSelect(null);
        refresh();
    };

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('dms.saved_searches_sidebar.smart_folders')}</h3>
                {currentQuery && (
                    <button
                        onClick={() => setCreating(true)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={t('dms.saved_searches_sidebar.aktuelle_suche_speichern')}
                    >
                        <MaterialIcon name="add" size={16} className="size-3.5" />
                    </button>
                )}
            </div>

            {loading && <div className="flex justify-center py-1 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /></div>}

            {!loading && items.length === 0 && !creating && (
                <p className="px-2 text-[11px] text-muted-foreground italic">{t('dms.saved_searches_sidebar.keine_smart_folders')}</p>
            )}

            {creating && jwt && currentQuery && (
                <CreateForm
                    jwt={jwt}
                    query={currentQuery}
                    isAdmin={isAdmin}
                    onDone={() => { setCreating(false); refresh(); }}
                />
            )}

            <ul className="space-y-0.5">
                {items.map(s => (
                    <li key={s.id} className={cn(
                        'group flex items-center gap-1.5 rounded px-2 py-1 cursor-pointer hover:bg-muted/50',
                        selectedId === s.id && 'bg-primary/10',
                    )}>
                        <button onClick={() => onSelect(s)} className="flex flex-1 items-center gap-1.5 text-left min-w-0">
                            {s.iconEmoji ? <span className="text-xs">{s.iconEmoji}</span> : <MaterialIcon name="auto_awesome" size={16} className="size-3 text-amber-500" />}
                            <span className="truncate text-xs">{s.name}</span>
                            {s.ownerUserId === null
                                ? <MaterialIcon name="public" size={12} className="text-muted-foreground" title={t('dms.saved_searches_sidebar.shared')} />
                                : <MaterialIcon name="lock" size={12} className="text-muted-foreground" title={t('dms.saved_searches_sidebar.persoenlich')} />
                            }
                        </button>
                        <button
                            onClick={() => remove(s.id)}
                            className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                            title={t('dms.saved_searches_sidebar.loeschen')}
                        >
                            <MaterialIcon name="delete" size={16} className="size-3" />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function CreateForm({ jwt, query, isAdmin, onDone }: { jwt: string; query: SavedSearchQuery; isAdmin: boolean; onDone: () => void }): JSX.Element {
    const t = useT();
    const [name, setName] = useState('');
    const [emoji, setEmoji] = useState('');
    const [shared, setShared] = useState(false);

    const submit = async () => {
        if (!name.trim()) return;
        try {
            await savedSearchesApi.create(jwt, {
                name: name.trim(),
                iconEmoji: emoji.trim() || undefined,
                query,
                shared: shared && isAdmin,
            });
            onDone();
        } catch (e) {
            alert('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div className="rounded-md border border-primary/40 bg-background p-1.5 space-y-1">
            <div className="flex gap-1">
                <input value={emoji} onChange={e => setEmoji(e.target.value.slice(0, 2))} placeholder="✨" className="w-8 rounded border border-border px-1 py-0.5 text-center text-xs" />
                <input
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') onDone(); }}
                    placeholder={t('dms.saved_searches_sidebar.name_zb_vertraege_30_tage')}
                    className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                />
            </div>
            {isAdmin && (
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} className="size-3" />
                    {t('dms.saved_searches_sidebar.mit_allen_im_tenant_teilen')}
                </label>
            )}
            <div className="flex gap-1">
                <button onClick={submit} disabled={!name.trim()} className="flex-1 rounded bg-primary py-0.5 text-[11px] text-primary-foreground disabled:opacity-50 inline-flex items-center justify-center gap-1">
                    <MaterialIcon name="check" size={16} className="size-3" /> {t('dms.saved_searches_sidebar.speichern')}
                </button>
                <button onClick={onDone} className="rounded border border-border px-1.5 py-0.5 text-[11px]">
                    <MaterialIcon name="close" size={16} className="size-3" />
                </button>
            </div>
        </div>
    );
}
