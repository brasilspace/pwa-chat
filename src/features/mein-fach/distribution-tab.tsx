import { type JSX, useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Users, Eye, Archive as ArchiveIcon, Upload } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useFileDrop } from './use-file-drop';
import { useT } from "@/lib/i18n/use-t";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_NOTE = 140;

type Audience = 'staff' | 'guardian' | 'minor' | 'external';

interface Distribution {
    id: string;
    masterTitle: string;
    masterMimeType: string;
    masterSizeBytes: number;
    senderUserId: string;
    senderNote: string | null;
    recipientCount: number;
    recipientFilter: { audiences?: Audience[]; excludeUserIds?: string[] };
    createdAt: string;
    deletedAt: string | null;
    replacedById: string | null;
}

interface DistributionStats {
    delivered: number;
    read: number;
    archived: number;
    deleted: number;
    readPercent: number;
    archivedPercent: number;
}

interface PreviewResponse {
    recipientCount: number;
    sample: { userId: string; displayName: string; audience: string | null }[];
}

const AUDIENCE_LABELS: Record<Audience, string> = {
    staff: 'Mitarbeiter',
    guardian: 'Eltern',
    minor: 'Schueler',
    external: 'Extern',
};

function getJwt(): string | null {
    return sessionStore.getSnapshot().platform?.token ?? null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const jwt = getJwt();
    if (!jwt) throw new Error('Not authenticated');
    return requestJson<T>({
        target: 'platform',
        baseUrl: env.platformBaseUrl,
        path: `/platform/v1${path}`,
        method: init?.method ?? 'GET',
        bearerToken: jwt,
        body: init?.body,
        headers: init?.headers,
    });
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export function DistributionTab(): JSX.Element {
    const t = useT();
    const { spaceId } = useParams<{ spaceId: string }>();
    const [items, setItems] = useState<Distribution[]>([]);
    const [loading, setLoading] = useState(true);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [composing, setComposing] = useState(false);
    const [replacingId, setReplacingId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!spaceId) return;
        setLoading(true);
        try {
            const data = await api<{ items: Distribution[] }>(`/spaces/${spaceId}/distributions`);
            setItems(data.items);
            setPermissionDenied(false);
        } catch (err) {
            const msg = (err as Error).message ?? '';
            if (msg.includes('FORBIDDEN') || msg.includes('403')) {
                setPermissionDenied(true);
            }
        } finally {
            setLoading(false);
        }
    }, [spaceId]);

    useEffect(() => { void refresh(); }, [refresh]);

    if (permissionDenied) {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <Card className="max-w-md p-6 text-center">
                    <MaterialIcon name="inbox" size={16} className="mx-auto size-8 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">{t('mein-fach.distribution_tab.verteiler-fach')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t('mein-fach.distribution_tab.nur_lehrer_und_mitglieder_mit_verteiler-')}
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b px-6 py-4">
                <div>
                    <h2 className="text-base font-semibold">{t('mein-fach.distribution_tab.verteiler-fach')}</h2>
                    <p className="text-xs text-muted-foreground">
                        {t('mein-fach.distribution_tab.datei_einmal_hochladen_landet_in_jedem_p')}
                    </p>
                </div>
                <Button onClick={() => setComposing(true)}>{t('mein-fach.distribution_tab.datei_verteilen')}</Button>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
                {loading && <div className="text-sm text-muted-foreground">{t('mein-fach.distribution_tab.lade')}</div>}

                {!loading && items.length === 0 && (
                    <Card className="p-6 text-center text-sm text-muted-foreground">
                        {t('mein-fach.distribution_tab.noch_keine_verteilungen_klicke_datei_ver')}
                    </Card>
                )}

                <ul className="space-y-3">
                    {items.map((d) => (
                        <DistributionItem
                            key={d.id}
                            distribution={d}
                            spaceId={spaceId!}
                            onReplace={() => setReplacingId(d.id)}
                            onDelete={async () => {
                                if (!confirm(`Verteilung "${d.masterTitle}" loeschen? Empfaenger sehen weiterhin den Drop mit Vermerk "Original entfernt".`)) return;
                                await api(`/spaces/${spaceId}/distributions/${d.id}`, { method: 'DELETE' });
                                toast.success('Verteilung geloescht.');
                                await refresh();
                            }}
                        />
                    ))}
                </ul>
            </div>

            {composing && spaceId && (
                <ComposeDialog
                    spaceId={spaceId}
                    onClose={() => setComposing(false)}
                    onSent={async () => { setComposing(false); await refresh(); }}
                />
            )}

            {replacingId && spaceId && (
                <ComposeDialog
                    spaceId={spaceId}
                    replaceId={replacingId}
                    onClose={() => setReplacingId(null)}
                    onSent={async () => { setReplacingId(null); await refresh(); }}
                />
            )}
        </div>
    );
}

// ─── Item ────────────────────────────────────────────────────────────────────

function DistributionItem({
    distribution: d,
    spaceId,
    onReplace,
    onDelete,
}: {
    distribution: Distribution;
    spaceId: string;
    onReplace: () => void;
    onDelete: () => void;
}): JSX.Element {
    const t = useT();
    const [stats, setStats] = useState<DistributionStats | null>(null);

    useEffect(() => {
        api<DistributionStats>(`/spaces/${spaceId}/distributions/${d.id}/stats`)
            .then(setStats)
            .catch(() => { /* ignore */ });
    }, [spaceId, d.id]);

    const isDeleted = d.deletedAt !== null;
    const filterLabel = d.recipientFilter.audiences?.length
        ? d.recipientFilter.audiences.map((a) => AUDIENCE_LABELS[a]).join(', ')
        : 'alle Mitglieder';

    return (
        <Card className={cn('p-4', isDeleted && 'opacity-60')}>
            <div className="flex items-start gap-3">
                <MaterialIcon name="attach_file" size={16} className="mt-1 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                        <div className="truncate text-sm font-medium">{d.masterTitle}</div>
                        {isDeleted && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                                {t('mein-fach.distribution_tab.original_entfernt')}
                            </span>
                        )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatBytes(d.masterSizeBytes)} {t('mein-fach.distribution_tab.verteilt_am')} {formatDate(d.createdAt)} {t('mein-fach.distribution_tab.an')} {d.recipientCount} ({filterLabel})
                    </div>
                    {d.senderNote && (
                        <div className="mt-2 rounded-md bg-muted px-2 py-1 text-xs italic">
                            „{d.senderNote}"
                        </div>
                    )}

                    {stats && (
                        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                            <Stat icon={Users} label="zugestellt" value={stats.delivered} />
                            <Stat icon={Eye} label="geoeffnet" value={`${stats.read} (${stats.readPercent}%)`} />
                            <Stat icon={ArchiveIcon} label="archiviert" value={`${stats.archived} (${stats.archivedPercent}%)`} />
                        </div>
                    )}
                </div>

                {!isDeleted && (
                    <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="sm" onClick={onReplace} title={t('mein-fach.distribution_tab.neue_version_verteilen')}>
                            <MaterialIcon name="refresh" size={16} className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={onDelete} title={t('mein-fach.distribution_tab.loeschen')}>
                            <MaterialIcon name="delete" size={16} className="size-4" />
                        </Button>
                    </div>
                )}
            </div>
        </Card>
    );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }): JSX.Element {
    return (
        <span className="inline-flex items-center gap-1">
            <Icon className="size-3" />
            <span className="font-medium text-foreground">{value}</span>
            <span>{label}</span>
        </span>
    );
}

// ─── Compose Dialog ──────────────────────────────────────────────────────────

function ComposeDialog({
    spaceId,
    replaceId,
    onClose,
    onSent,
}: {
    spaceId: string;
    /** Wenn gesetzt, wird statt einer neuen Verteilung eine Replace-Operation ausgeloest. */
    replaceId?: string;
    onClose: () => void;
    onSent: () => void;
}): JSX.Element {
    const t = useT();
    const [file, setFile] = useState<File | null>(null);
    const [note, setNote] = useState('');
    const [audiences, setAudiences] = useState<Audience[]>([]);
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [sending, setSending] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Vorschau bei Filter-Aenderung neu laden
    useEffect(() => {
        const controller = new AbortController();
        api<PreviewResponse>(`/spaces/${spaceId}/distributions/preview`, {
            method: 'POST',
            body: JSON.stringify({ filter: { audiences: audiences.length ? audiences : undefined } }),
            signal: controller.signal,
        }).then(setPreview).catch(() => { /* ignore */ });
        return () => controller.abort();
    }, [spaceId, audiences]);

    const toggleAudience = (a: Audience) => {
        setAudiences((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
    };

    const handleFile = (picked: File | null) => {
        if (!picked) return;
        if (picked.size > MAX_FILE_SIZE) {
            toast.error(`Datei zu gross (max. ${formatBytes(MAX_FILE_SIZE)}).`);
            return;
        }
        setFile(picked);
    };

    const { isDragging, dragHandlers } = useFileDrop({
        onDrop: (files) => handleFile(files[0] ?? null),
        disabled: sending,
    });

    const handleSubmit = async () => {
        if (!file || !preview || preview.recipientCount === 0) return;
        setSending(true);
        try {
            // 1. Upload-URL holen
            const upload = await api<{ storageKey: string; uploadUrl: { url: string } }>(
                `/spaces/${spaceId}/distributions/upload-url`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        fileName: file.name,
                        mimeType: file.type || 'application/octet-stream',
                        sizeBytes: file.size,
                    }),
                },
            );

            if (!upload?.uploadUrl?.url) {
                toast.error('Datei-Speicher ist gerade nicht verfuegbar. Bitte wende dich an den Schul-Admin.');
                return;
            }

            // 2. Direct-PUT zu S3
            const putRes = await fetch(upload.uploadUrl.url, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                body: file,
            });
            if (!putRes.ok) throw new Error(`Upload fehlgeschlagen (${putRes.status})`);

            // 3. Distribution oder Replace
            const path = replaceId
                ? `/spaces/${spaceId}/distributions/${replaceId}/replace`
                : `/spaces/${spaceId}/distributions`;
            await api(path, {
                method: 'POST',
                body: JSON.stringify({
                    storageKey: upload.storageKey,
                    fileName: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    sizeBytes: file.size,
                    senderNote: note.trim() || null,
                    filter: audiences.length ? { audiences } : undefined,
                }),
            });

            toast.success(replaceId ? 'Neue Version verteilt.' : `An ${preview.recipientCount} Personen verteilt.`);
            onSent();
        } catch (err) {
            const msg = (err as Error).message ?? '';
            if (msg.includes('S3_NOT_CONFIGURED') || msg.includes('503')) {
                toast.error('Datei-Speicher ist gerade nicht verfuegbar. Bitte wende dich an den Schul-Admin.');
            } else {
                toast.error(`Fehler: ${msg || 'Unbekannter Fehler'}`);
            }
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <Card
                className={cn(
                    'relative w-full max-w-lg p-6 transition-all',
                    isDragging && 'ring-2 ring-primary',
                )}
                onClick={(e) => e.stopPropagation()}
                {...dragHandlers}
            >
                {isDragging && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/5 backdrop-blur-[1px]">
                        <div className="flex flex-col items-center gap-2 rounded-lg bg-background px-6 py-4 shadow-lg">
                            <MaterialIcon name="upload" size={16} className="size-8 text-primary" />
                            <p className="text-sm font-medium">{t('mein-fach.distribution_tab.datei_hier_ablegen')}</p>
                        </div>
                    </div>
                )}
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">
                        {replaceId ? 'Neue Version verteilen' : 'Datei verteilen'}
                    </h3>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>

                {/* Preview-Banner */}
                {preview && (
                    <div className="mt-4 rounded-md border bg-primary/5 px-3 py-2 text-sm">
                        <span className="font-medium">{preview.recipientCount}</span>{' '}
                        {preview.recipientCount === 1 ? 'Empfaenger' : 'Empfaenger'} {t('mein-fach.distribution_tab.basierend_auf_filter')}
                    </div>
                )}

                {/* Audience-Filter */}
                <div className="mt-4">
                    <label className="text-xs font-medium text-muted-foreground">{t('mein-fach.distribution_tab.filter_optional')}</label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => setAudiences([])}
                            className={cn(
                                'rounded-full px-3 py-1 text-xs',
                                audiences.length === 0
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                            )}
                        >
                            {t('mein-fach.distribution_tab.alle')}
                        </button>
                        {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                            <button
                                key={a}
                                type="button"
                                onClick={() => toggleAudience(a)}
                                className={cn(
                                    'rounded-full px-3 py-1 text-xs',
                                    audiences.includes(a)
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                                )}
                            >
                                {AUDIENCE_LABELS[a]}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Datei */}
                <div className="mt-4">
                    <label className="text-xs font-medium text-muted-foreground">{t('mein-fach.distribution_tab.datei')}</label>
                    {!file ? (
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 px-4 py-6 text-sm text-muted-foreground hover:border-primary/50"
                        >
                            <MaterialIcon name="attach_file" size={16} className="size-4" />
                            {t('mein-fach.distribution_tab.datei_waehlen_max_50_mb')}
                        </button>
                    ) : (
                        <div className="mt-1 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                            <MaterialIcon name="attach_file" size={16} className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{file.name}</div>
                                <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
                            </div>
                            <button onClick={() => setFile(null)} disabled={sending}>
                                <MaterialIcon name="close" size={16} className="size-4" />
                            </button>
                        </div>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                            handleFile(e.target.files?.[0] ?? null);
                            e.target.value = '';
                        }}
                    />
                </div>

                {/* Notiz */}
                <div className="mt-4">
                    <label className="text-xs font-medium text-muted-foreground">
                        {t('mein-fach.distribution_tab.begleitnotiz')} <span className="text-muted-foreground/60">{t('mein-fach.distribution_tab.max')} {MAX_NOTE} {t('mein-fach.distribution_tab.zeichen')}</span>
                    </label>
                    <textarea
                        rows={2}
                        maxLength={MAX_NOTE}
                        className="mt-1 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder={t('mein-fach.distribution_tab.zb_hausaufgabe_fuer_donnerstag_bitte_bis')}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        disabled={sending}
                    />
                    <div className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">
                        {note.length} / {MAX_NOTE}
                    </div>
                </div>

                {/* Aktionen */}
                <div className="mt-6 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={sending}>{t('mein-fach.distribution_tab.abbrechen')}</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!file || sending || !preview || preview.recipientCount === 0}
                    >
                        {sending ? 'Verteile…' : replaceId ? 'Neue Version verteilen' : `An ${preview?.recipientCount ?? 0} verteilen`}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
