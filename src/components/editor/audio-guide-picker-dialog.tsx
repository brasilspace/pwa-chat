/**
 * AudioGuidePickerDialog — Modal zum Auswaehlen einer Audio-Datei aus
 * dem DMS, um sie als AudioGuide-Embed in einen Tiptap-Editor zu setzen.
 *
 * Zeigt alle Audio-Documents (mimeType audio/* ODER Datei-Endung mp3/m4a/
 * wav/ogg/aac/flac) des aktuellen Tenants. Pro Eintrag: Titel + ggf. die
 * Anzahl bereits gepflegter Cues.
 *
 * Auswahl ruft onPick(documentId) — der Aufrufer macht z.B.:
 *   editor.commands.insertAudioGuide(documentId)
 */

import { type JSX, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useDocuments } from '@/features/documents/use-documents';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    onPick: (documentId: string) => void;
    onClose: () => void;
}

export function AudioGuidePickerDialog({ onPick, onClose }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    void session;
    const { documents, loading } = useDocuments();
    const [query, setQuery] = useState('');

    const audioDocs = useMemo(() => {
        return documents.filter((d) => {
            const mt = d.mimeType ?? '';
            const isMedia = /^audio\//.test(mt) || /^video\//.test(mt)
                || /\.(mp3|m4a|wav|ogg|aac|flac|mp4|webm|mov|m4v)$/i.test(d.title);
            if (!isMedia) return false;
            if (!query.trim()) return true;
            return d.title.toLowerCase().includes(query.toLowerCase());
        });
    }, [documents, query]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md max-h-[80vh] flex flex-col rounded border border-border bg-background shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-border p-3">
                    <div className="flex items-center gap-2">
                        <MaterialIcon name="headphones" size={16} className="size-4" />
                        <h2 className="text-sm font-semibold">{t('app.misc.audioguide_einfuegen')}</h2>
                    </div>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted" aria-label={t('app.misc.schliessen')}>
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>

                <div className="border-b border-border p-3">
                    <div className="relative">
                        <MaterialIcon name="search" size={16} className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('app.misc.audio-datei_suchen')}
                            autoFocus
                            className="w-full rounded border border-border bg-background py-1.5 pl-7 pr-2 text-sm"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-2">
                    {loading && (
                        <div className="flex justify-center py-6">
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {!loading && audioDocs.length === 0 && (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                            {t('app.misc.keine_audio-dateien')} {query ? 'fuer diese Suche' : 'im DMS'} {t('app.misc.gefunden')}
                        </p>
                    )}

                    {!loading && audioDocs.length > 0 && (
                        <ul className="space-y-1">
                            {audioDocs.map((d) => (
                                <li key={d.id}>
                                    <button
                                        type="button"
                                        onClick={() => { onPick(d.id); onClose(); }}
                                        className={cn(
                                            'flex w-full items-start gap-2 rounded p-2 text-left text-sm hover:bg-muted',
                                        )}
                                    >
                                        <MaterialIcon name="headphones" size={16} className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">{d.title}</div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {d.spaceName ? `${d.spaceName} · ` : ''}
                                                {formatBytes(d.sizeBytes)}
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
