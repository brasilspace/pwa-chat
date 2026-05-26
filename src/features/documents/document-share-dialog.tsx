/**
 * DocumentShareDialog — Cross-Space-Sharing fuer ein Dokument.
 *
 * UX-Konzept:
 *   - Liste der Spaces, in denen der User Mitglied ist.
 *   - Spaces, mit denen das Dokument schon geteilt ist, sind oben mit
 *     gruener Markierung "geteilt" und einem X zum Zurueckziehen.
 *   - Andere Spaces erscheinen darunter mit Plus-Button "Teilen".
 *   - Optionales Notiz-Feld pro Share ("warum teile ich das?").
 *   - Live-Suche, wenn der User viele Spaces hat.
 *
 * Bewusst NICHT in dem Dialog: Tenant-weiter Broadcast — das ist ein
 * separater Toggle im Detail-Panel ("schul-weit sichtbar"), keine
 * Cross-Share-Aktion.
 */

import { type JSX, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useSpaces } from '@/features/spaces/use-spaces';
import {
    documentVisibilityApi, type DocumentSpaceShare,
} from './use-document-visibility';
import { toast } from '@/components/ui/toast';
import { X, Plus, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    documentId: string;
    documentTitle: string;
    /** Source-Space des Dokuments — wird im Picker uebersprungen, weil
     *  Sharing in den eigenen Source-Space sinnlos ist. */
    sourceSpaceId: string | null;
    onClose: () => void;
}

export function DocumentShareDialog({ documentId, documentTitle, sourceSpaceId, onClose }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { spaces } = useSpaces();

    const [shares, setShares] = useState<DocumentSpaceShare[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeNoteSpaceId, setActiveNoteSpaceId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState('');
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        if (!jwt) return;
        documentVisibilityApi.listShares(jwt, documentId)
            .then(r => setShares(r.shares))
            .catch(() => setShares([]))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    const sharedMap = useMemo(() => {
        const m = new Map<string, DocumentSpaceShare>();
        for (const s of shares) m.set(s.spaceId, s);
        return m;
    }, [shares]);

    // Spaces gefiltert: Source-Space raus, Suche anwenden, sortieren
    const visibleSpaces = useMemo(() => {
        const q = search.trim().toLowerCase();
        return spaces
            .filter(s => s.id !== sourceSpaceId)
            .filter(s => !q || s.name.toLowerCase().includes(q))
            .sort((a, b) => {
                // Bereits geteilt zuerst
                const aShared = sharedMap.has(a.id);
                const bShared = sharedMap.has(b.id);
                if (aShared !== bShared) return aShared ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
    }, [spaces, sourceSpaceId, search, sharedMap]);

    const handleShare = async (spaceId: string, note?: string) => {
        if (!jwt) return;
        setBusy(spaceId);
        try {
            const r = await documentVisibilityApi.addShare(jwt, documentId, spaceId, note);
            setShares(prev => [r.share, ...prev.filter(s => s.spaceId !== spaceId)]);
            setActiveNoteSpaceId(null);
            setNoteDraft('');
            toast.success(`Geteilt mit "${r.targetSpace.name}"`);
        } catch (e) {
            toast.error('Teilen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(null);
        }
    };

    const handleUnshare = async (share: DocumentSpaceShare) => {
        if (!jwt) return;
        setBusy(share.spaceId);
        try {
            await documentVisibilityApi.removeShare(jwt, share.id);
            setShares(prev => prev.filter(s => s.id !== share.id));
            toast.success('Freigabe zurueckgenommen');
        } catch (e) {
            toast.error('Zuruecknehmen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div
                className="flex w-full max-w-md flex-col max-h-[80vh] rounded border border-border bg-background shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border p-4">
                    <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <MaterialIcon name="share" size={16} className="size-3.5" />
                            {t('documents.document_share_dialog.mit_space_teilen')}
                        </div>
                        <h2 className="mt-1 truncate text-sm font-medium" title={documentTitle}>
                            {documentTitle}
                        </h2>
                    </div>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>

                {/* Suche */}
                <div className="border-b border-border p-3">
                    <div className="relative">
                        <MaterialIcon name="search" size={16} className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('documents.document_share_dialog.space_suchen')}
                            className="w-full rounded border border-border bg-background py-1.5 pl-7 pr-2 text-sm"
                        />
                    </div>
                </div>

                {/* Liste */}
                <div className="flex-1 overflow-auto p-2">
                    {loading && (
                        <div className="flex justify-center py-6">
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {!loading && visibleSpaces.length === 0 && (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                            {t('documents.document_share_dialog.keine_spaces')} {search ? 'fuer diese Suche' : 'verfuegbar'}.
                        </p>
                    )}

                    <ul className="space-y-1">
                        {visibleSpaces.map((space) => {
                            const share = sharedMap.get(space.id);
                            const isShared = Boolean(share);
                            const isActiveNote = activeNoteSpaceId === space.id;
                            const isBusy = busy === space.id;

                            return (
                                <li key={space.id}>
                                    <div
                                        className={cn(
                                            'group flex flex-col gap-2 rounded border p-3 transition-colors',
                                            isShared
                                                ? 'border-emerald-500/40 bg-emerald-500/5'
                                                : 'border-border hover:bg-muted/50',
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="size-2 shrink-0 rounded-full"
                                                style={{ backgroundColor: space.color ?? '#94a3b8' }}
                                            />
                                            <span className="flex-1 truncate text-sm font-medium">{space.name}</span>

                                            {isShared ? (
                                                <>
                                                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                                        <MaterialIcon name="check" size={16} className="size-3" /> geteilt
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUnshare(share!)}
                                                        disabled={isBusy}
                                                        title={t('documents.document_share_dialog.freigabe_zuruecknehmen')}
                                                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                                                    >
                                                        {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <MaterialIcon name="delete" size={16} className="size-3.5" />}
                                                    </button>
                                                </>
                                            ) : isActiveNote ? null : (
                                                <button
                                                    type="button"
                                                    onClick={() => { setActiveNoteSpaceId(space.id); setNoteDraft(''); }}
                                                    disabled={isBusy}
                                                    className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                                                >
                                                    <MaterialIcon name="add" size={16} className="size-3" /> {t('documents.document_share_dialog.teilen')}
                                                </button>
                                            )}
                                        </div>

                                        {/* Geteilt: existierende Notiz anzeigen */}
                                        {isShared && share?.note && (
                                            <div className="flex items-start gap-1.5 rounded bg-emerald-500/10 px-2 py-1 text-[11px] italic text-emerald-700 dark:text-emerald-300">
                                                <MaterialIcon name="chat" size={16} className="mt-0.5 size-3 shrink-0" />
                                                <span>„{share.note}"</span>
                                            </div>
                                        )}

                                        {/* Notiz-Eingabe vor dem Teilen */}
                                        {isActiveNote && !isShared && (
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={noteDraft}
                                                    onChange={(e) => setNoteDraft(e.target.value)}
                                                    placeholder={t('documents.document_share_dialog.notiz_fuer_die_empfaenger_optional')}
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleShare(space.id, noteDraft);
                                                        if (e.key === 'Escape') { setActiveNoteSpaceId(null); setNoteDraft(''); }
                                                    }}
                                                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                                                />
                                                <div className="flex justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setActiveNoteSpaceId(null); setNoteDraft(''); }}
                                                        disabled={isBusy}
                                                        className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                                                    >
                                                        {t('documents.document_share_dialog.abbrechen')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleShare(space.id, noteDraft)}
                                                        disabled={isBusy}
                                                        className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                                    >
                                                        {isBusy ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="share" size={16} className="size-3" />}
                                                        {t('documents.document_share_dialog.teilen')}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* Footer-Hinweis */}
                <div className="border-t border-border p-3 text-[11px] text-muted-foreground">
                    {t('documents.document_share_dialog.cross-share_macht_das_dokument_nur')} <strong>lesbar</strong> {t('documents.document_share_dialog.in_den_ziel-spaces_die_originaldatei_ble')}
                </div>
            </div>
        </div>
    );
}
