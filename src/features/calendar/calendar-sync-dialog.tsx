/**
 * CalendarSyncDialog — Termine importieren (.ics) + Kalender abonnieren/
 * exportieren (öffentlicher .ics-Feed je Ebene).
 *
 * Backend: POST /calendar/import, PATCH /calendar/layers/:id {isPublic}
 * (erzeugt stabilen publicToken), GET /calendar/public/:token (no auth).
 */
import { type JSX, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MaterialIcon } from '@/components/ui/material-icon';
import { toast } from '@/components/ui/toast';
import { env } from '@/core/config/env';
import { createCalendarGateway } from '@/gateways/platform/calendar-gateway';
import type { CalendarLayer } from './calendar-types';
import { useT } from '@/lib/i18n/use-t';

const gateway = createCalendarGateway();

function publicUrls(token: string): { https: string; webcal: string } {
    const https = `${env.platformBaseUrl}/platform/v1/calendar/public/${token}`;
    return { https, webcal: https.replace(/^https?:\/\//, 'webcal://') };
}

export function CalendarSyncDialog({
    layers, jwt, onClose, refresh, canManageSchool,
}: {
    layers: CalendarLayer[];
    jwt: string;
    onClose: () => void;
    refresh: () => void | Promise<void>;
    canManageSchool: boolean;
}): JSX.Element {
    const t = useT();
    const [tab, setTab] = useState<'import' | 'subscribe'>('import');
    const importableLayers = layers.filter(l => l.level !== 1 || canManageSchool);
    const [targetLayer, setTargetLayer] = useState(importableLayers[0]?.id ?? '');
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [pendingPublic, setPendingPublic] = useState<string | null>(null);

    const doImport = async () => {
        if (!targetLayer || !file) return;
        setBusy(true);
        try {
            const icsContent = await file.text();
            const r = await gateway.importIcs(jwt, { layerId: targetLayer, icsContent });
            toast.success(t('calendar.sync.imported', { defaultValue: 'Importiert' }) + `: ${r.imported} · ${t('calendar.sync.skipped', { defaultValue: 'übersprungen' })}: ${r.skipped} / ${r.total}`);
            setFile(null);
            await refresh();
        } catch (e) {
            toast.error(t('calendar.sync.import_failed', { defaultValue: 'Import fehlgeschlagen' }) + ': ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    const togglePublic = async (layer: CalendarLayer, next: boolean) => {
        setPendingPublic(layer.id);
        try {
            await gateway.updateLayer(jwt, layer.id, { isPublic: next });
            await refresh();
        } catch (e) {
            toast.error((e instanceof Error ? e.message : String(e)));
        } finally { setPendingPublic(null); }
    };

    const copy = async (text: string) => {
        await navigator.clipboard.writeText(text);
        toast.success(t('calendar.sync.copied', { defaultValue: 'Link kopiert' }));
    };

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('calendar.sync.title', { defaultValue: 'Kalender synchronisieren' })}</DialogTitle>
                </DialogHeader>

                <div className="mb-3 flex gap-1 border-b border-border">
                    {(['import', 'subscribe'] as const).map(k => (
                        <button key={k} onClick={() => setTab(k)}
                            className={`rounded-t px-3 py-1.5 text-[12px] ${tab === k ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                            {k === 'import'
                                ? t('calendar.sync.tab_import', { defaultValue: 'Termine importieren' })
                                : t('calendar.sync.tab_subscribe', { defaultValue: 'Abonnieren / Exportieren' })}
                        </button>
                    ))}
                </div>

                {tab === 'import' && (
                    <div className="space-y-3 text-[13px]">
                        <p className="text-[12px] text-muted-foreground">
                            {t('calendar.sync.import_help', { defaultValue: 'Eine .ics-Datei (iCal, z. B. Export aus Outlook/Google/Apple) in eine Kalender-Ebene importieren. Bereits vorhandene Termine (gleiche UID) werden übersprungen.' })}
                        </p>
                        <label className="block">
                            <span className="mb-1 block text-[12px] text-muted-foreground">{t('calendar.sync.target_layer', { defaultValue: 'Ziel-Ebene' })}</span>
                            <select value={targetLayer} onChange={e => setTargetLayer(e.target.value)}
                                className="w-full rounded border border-input bg-background px-2 py-1.5 text-[13px]">
                                {importableLayers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </label>
                        <div>
                            <span className="mb-1 block text-[12px] text-muted-foreground">{t('calendar.sync.ics_file', { defaultValue: '.ics-Datei' })}</span>
                            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-[13px] hover:border-primary hover:bg-primary/5">
                                <input type="file" accept=".ics,text/calendar"
                                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                                    className="hidden" />
                                <MaterialIcon name="upload_file" size={16} className="shrink-0 text-primary" />
                                {file ? (
                                    <span className="flex-1 truncate font-medium">{file.name}</span>
                                ) : (
                                    <span className="flex-1 text-muted-foreground">
                                        {t('calendar.sync.pick_local_file', { defaultValue: 'Lokale .ics-Datei vom Gerät auswählen…' })}
                                    </span>
                                )}
                                <span className="shrink-0 rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                    {t('calendar.sync.browse', { defaultValue: 'Durchsuchen' })}
                                </span>
                            </label>
                            {file && (
                                <button onClick={() => setFile(null)}
                                    className="mt-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline">
                                    {t('calendar.sync.clear_file', { defaultValue: 'Auswahl entfernen' })}
                                </button>
                            )}
                        </div>
                        <button disabled={busy || !targetLayer || !file} onClick={doImport}
                            className="rounded-lg bg-primary px-3 py-1.5 text-[12px] text-primary-foreground hover:opacity-90 disabled:opacity-50">
                            {busy ? t('calendar.sync.importing', { defaultValue: 'Importiere…' }) : t('calendar.sync.do_import', { defaultValue: 'Importieren' })}
                        </button>
                    </div>
                )}

                {tab === 'subscribe' && (
                    <div className="space-y-2 text-[13px]">
                        <p className="text-[12px] text-muted-foreground">
                            {t('calendar.sync.subscribe_help', { defaultValue: 'Eine Ebene öffentlich abonnierbar machen — den Link in Outlook/Google/Apple als Kalender-Abo (per URL) eintragen. Der Link enthält ein nicht erratbares Token; „öffentlich" wieder ausschalten widerruft den Zugriff.' })}
                        </p>
                        <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
                            {layers.map(l => {
                                const u = l.isPublic && l.publicToken ? publicUrls(l.publicToken) : null;
                                return (
                                    <div key={l.id} className="rounded border border-border p-2">
                                        <div className="flex items-center gap-2">
                                            <span className="flex-1 truncate font-medium">{l.name}</span>
                                            <button disabled={pendingPublic === l.id}
                                                onClick={() => togglePublic(l, !l.isPublic)}
                                                className={`rounded px-2 py-0.5 text-[11px] ${l.isPublic ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'} disabled:opacity-50`}>
                                                {l.isPublic
                                                    ? t('calendar.sync.public_on', { defaultValue: 'öffentlich · an' })
                                                    : t('calendar.sync.public_off', { defaultValue: 'privat' })}
                                            </button>
                                        </div>
                                        {u && (
                                            <div className="mt-2 space-y-1">
                                                {([['webcal (Apple/Outlook)', u.webcal], ['https (Google „per URL")', u.https]] as const).map(([label, url]) => (
                                                    <div key={label} className="flex items-center gap-1.5">
                                                        <span className="w-[150px] shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
                                                        <code className="flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-[11px]">{url}</code>
                                                        <button onClick={() => copy(url)} title={t('calendar.sync.copy', { defaultValue: 'Kopieren' })}
                                                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                                                            <MaterialIcon name="content_copy" size={16} className="size-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {layers.length === 0 && <p className="text-[12px] text-muted-foreground">{t('calendar.sync.no_layers', { defaultValue: 'Keine Kalender-Ebenen vorhanden.' })}</p>}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
