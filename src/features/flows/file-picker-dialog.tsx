/**
 * FilePickerDialog — modaler Datei-Picker fuer DMS-Files.
 *
 * Quellen (Tabs):
 *   - Mein Fach (PERSONAL) → eigene Dokumente des Nutzers
 *   - Spaces → ausgewaehlter Space → Dokumente
 *
 * Onselect: gibt prilog://file/<id> zurueck.
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useOwnDocuments } from '@/features/mein-fach/use-mein-fach';
import { useSpaces } from '@/features/spaces/use-spaces';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { buildPrilogFileLink } from '@/lib/prilog-link';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { FileIcon } from '@/features/dms/file-icon';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    onSelect: (prilogLink: string, meta: { fileName: string; mimeType: string }) => void;
    onClose: () => void;
    /** Wenn gesetzt, nur Bilder anzeigen (mimeType startswith image/) */
    onlyImages?: boolean;
}

interface SpaceDocument {
    id: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
}

export function FilePickerDialog({ onSelect, onClose, onlyImages = false }: Props): JSX.Element {
    const t = useT();
    const [tab, setTab] = useState<'personal' | 'space'>('personal');
    const [search, setSearch] = useState('');

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg bg-background shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-3">
                    <div>
                        <h2 className="text-base font-semibold">{t('flows.file_picker_dialog.datei_aus_dms_waehlen')}</h2>
                        <p className="text-[11px] text-muted-foreground">{t('flows.file_picker_dialog.erzeugt_einen_internen_prilog-link_der_u')}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>

                <div className="flex border-b border-border">
                    <TabBtn active={tab === 'personal'} onClick={() => setTab('personal')} icon={<MaterialIcon name="person" size={16} className="size-3.5" />}>
                        {t('flows.file_picker_dialog.mein_fach')}
                    </TabBtn>
                    <TabBtn active={tab === 'space'} onClick={() => setTab('space')} icon={<MaterialIcon name="folder" size={16} className="size-3.5" />}>
                        {t('flows.file_picker_dialog.aus_einem_space')}
                    </TabBtn>
                </div>

                <div className="border-b border-border p-3">
                    <div className="relative">
                        <MaterialIcon name="search" size={16} className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                        <input
                            type="search"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('flows.file_picker_dialog.suchen')}
                            className="w-full rounded-md border border-border bg-background pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                    {tab === 'personal' ? (
                        <PersonalTab search={search} onlyImages={onlyImages} onSelect={onSelect} />
                    ) : (
                        <SpaceTab search={search} onlyImages={onlyImages} onSelect={onSelect} />
                    )}
                </div>
            </div>
        </div>
    );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
                active ? 'border-b-2 border-primary text-foreground' : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
            )}
        >
            {icon}
            {children}
        </button>
    );
}

function PersonalTab({ search, onlyImages, onSelect }: { search: string; onlyImages: boolean; onSelect: Props['onSelect'] }): JSX.Element {
    const { docs, loading } = useOwnDocuments(search ? { q: search } : {});
    const filtered = onlyImages ? docs.filter(d => d.mimeType.startsWith('image/')) : docs;

    if (loading) return <Loading />;
    if (filtered.length === 0) return <Empty msg={search ? 'Keine Treffer' : 'Noch keine Dokumente in Mein Fach'} />;

    return (
        <ul className="space-y-1.5">
            {filtered.map(d => (
                <FileRow
                    key={d.id}
                    title={d.title}
                    mimeType={d.mimeType}
                    sizeBytes={d.sizeBytes}
                    onClick={() => onSelect(buildPrilogFileLink(d.id), { fileName: d.title, mimeType: d.mimeType })}
                />
            ))}
        </ul>
    );
}

function SpaceTab({ search, onlyImages, onSelect }: { search: string; onlyImages: boolean; onSelect: Props['onSelect'] }): JSX.Element {
    const t = useT();
    const { spaces } = useSpaces();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [spaceId, setSpaceId] = useState<string>('');
    const [docs, setDocs] = useState<SpaceDocument[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!spaceId || !jwt) return;
        setLoading(true);
        const gw = createPlatformGateway();
        gw.fetchJson<{ documents: SpaceDocument[] }>(jwt, `/platform/v1/spaces/${encodeURIComponent(spaceId)}/documents`)
            .then(r => setDocs(r.documents ?? []))
            .catch(() => setDocs([]))
            .finally(() => setLoading(false));
    }, [spaceId, jwt]);

    const filtered = docs
        .filter(d => !onlyImages || d.mimeType.startsWith('image/'))
        .filter(d => !search || d.title.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-3">
            <select
                value={spaceId}
                onChange={e => setSpaceId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
                <option value="">{t('flows.file_picker_dialog.space_waehlen')}</option>
                {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {!spaceId && <Empty msg="Bitte einen Space waehlen" />}
            {spaceId && loading && <Loading />}
            {spaceId && !loading && filtered.length === 0 && <Empty msg="Keine Dokumente im Space" />}
            {spaceId && !loading && filtered.length > 0 && (
                <ul className="space-y-1.5">
                    {filtered.map(d => (
                        <FileRow
                            key={d.id}
                            title={d.title}
                            mimeType={d.mimeType}
                            sizeBytes={d.sizeBytes}
                            onClick={() => onSelect(buildPrilogFileLink(d.id), { fileName: d.title, mimeType: d.mimeType })}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}

function FileRow({ title, mimeType, sizeBytes, onClick }: { title: string; mimeType: string; sizeBytes: number; onClick: () => void }): JSX.Element {
    return (
        <li>
            <button
                onClick={onClick}
                className="flex w-full items-center gap-3 rounded-md border border-border p-2 text-left hover:bg-accent"
            >
                <FileIcon fileName={title} mimeType={mimeType} className="size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{title}</div>
                    <div className="text-[11px] text-muted-foreground">{mimeType} · {formatBytes(sizeBytes)}</div>
                </div>
            </button>
        </li>
    );
}

function Loading() { return <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>; }
function Empty({ msg }: { msg: string }) { return <div className="py-6 text-center text-sm text-muted-foreground">{msg}</div>; }

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
