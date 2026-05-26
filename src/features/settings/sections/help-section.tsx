/**
 * HelpSection — Settings: Hilfe & Tipps.
 *
 * Zwei Bereiche:
 *
 *   1. User-Schalter "Hörmi & Mia Audio-Hilfe anzeigen" (lokal, default an).
 *
 *   2. Admin-Bereich: Route-Mappings — pro Pfad ein AudioGuide. Wer als
 *      Admin angemeldet ist, kann hier "/calendar" → Termine-Tutorial,
 *      "/contacts" → Adressen-Tutorial usw. zuordnen. Hörmi laedt dann
 *      automatisch das passende Audio, wenn der User auf den Pfad geht.
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { hoermiPrefStore } from '@/components/app/hoermi-pref-store';
import { sessionStore } from '@/core/session/session-store';
import { audioGuideApi, type AudioGuideListItem } from '@/features/audio-guide/use-audio-guide';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface RouteEntry {
    rid: string;
    routePattern: string;
    documentId: string;
}

let nextRid = 1;
const newRid = () => `r-${++nextRid}-${Date.now()}`;

const SUGGESTED_ROUTES = ['/', '/calendar', '/contacts', '/dms', '/meine-aufgaben', '/flows', '/favorites', '/mein-fach', '/sheets', '/spaces/*'];

export function HelpSection(): JSX.Element {
    const t = useT();
    const enabled = useSyncExternalStore(hoermiPrefStore.subscribe, hoermiPrefStore.getSnapshot);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN' || role === 'OWNER';

    const [routes, setRoutes] = useState<RouteEntry[]>([]);
    const [savedSnapshot, setSavedSnapshot] = useState<string>('[]');
    const [audioGuides, setAudioGuides] = useState<AudioGuideListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!jwt || !isAdmin) { setLoading(false); return; }
        Promise.all([
            audioGuideApi.listRoutes(jwt),
            audioGuideApi.list(jwt),
        ]).then(([rRes, gRes]) => {
            const initial = rRes.routes.map((r) => ({ rid: r.id, routePattern: r.routePattern, documentId: r.documentId }));
            setRoutes(initial);
            setSavedSnapshot(JSON.stringify(initial.map((r) => ({ p: r.routePattern, d: r.documentId }))));
            setAudioGuides(gRes.audioGuides);
        }).catch(() => { /* noop */ })
            .finally(() => setLoading(false));
    }, [jwt, isAdmin]);

    const dirty = JSON.stringify(routes.map((r) => ({ p: r.routePattern, d: r.documentId }))) !== savedSnapshot;

    const addRoute = (pattern = '') => {
        setRoutes((prev) => [...prev, { rid: newRid(), routePattern: pattern, documentId: audioGuides[0]?.documentId ?? '' }]);
    };
    const updateRoute = (rid: string, patch: Partial<RouteEntry>) => {
        setRoutes((prev) => prev.map((r) => r.rid === rid ? { ...r, ...patch } : r));
    };
    const removeRoute = (rid: string) => {
        setRoutes((prev) => prev.filter((r) => r.rid !== rid));
    };

    const save = async () => {
        if (!jwt) return;
        setSaving(true);
        try {
            const payload = routes
                .filter((r) => r.routePattern.trim() && r.documentId.trim())
                .map((r) => ({ routePattern: r.routePattern.trim(), documentId: r.documentId }));
            const r = await audioGuideApi.saveRoutes(jwt, payload);
            const fresh = r.routes.map((x) => ({ rid: x.id, routePattern: x.routePattern, documentId: x.documentId }));
            setRoutes(fresh);
            setSavedSnapshot(JSON.stringify(fresh.map((x) => ({ p: x.routePattern, d: x.documentId }))));
        } catch (e) {
            alert('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-lg font-semibold">{t('settings.help.hilfe_tipps')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.help.steuere_die_audio-hilfe_von_hoermi_mia_d')}
                </p>
            </div>

            {/* User-Schalter */}
            <label className="flex items-start gap-3 rounded border border-border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => hoermiPrefStore.setEnabled(e.target.checked)}
                    className="mt-1 size-4 cursor-pointer accent-primary"
                />
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <MaterialIcon name="headphones" size={16} className="size-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{t('settings.help.hoermi_mia_audio-hilfe_anzeigen')}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t('settings.help.zeigt_das_kleine_kopfhoerer-symbol_oben_')}
                    </p>
                </div>
            </label>

            {/* Admin-Bereich: Route-Mappings */}
            {isAdmin && (
                <div className="space-y-3">
                    <div>
                        <h3 className="text-sm font-semibold">{t('settings.help.hoermi-routen_admin')}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {t('settings.help.ordne_pro_app-bereich_einen_audioguide_z')} <code>/calendar</code>{t('settings.help.oder_mit_wildcard')} <code>*</code> {t('settings.help.am_ende_z_b')} <code>/spaces/*</code>{t('settings.help.exakte_treffer_gewinnen_vor_wildcards')}
                        </p>
                    </div>

                    {loading && <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>}

                    {!loading && audioGuides.length === 0 && (
                        <p className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
                            {t('settings.help.noch_keine_audioguides_angelegt_erstelle')}
                        </p>
                    )}

                    {!loading && audioGuides.length > 0 && (
                        <>
                            <div className="grid grid-cols-[1fr_2fr_28px] gap-2 border-b border-border pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <div>{t('settings.help.pfad-pattern')}</div>
                                <div>{t('settings.help.audioguide')}</div>
                                <div></div>
                            </div>

                            {routes.map((r) => (
                                <div key={r.rid} className="grid grid-cols-[1fr_2fr_28px] gap-2 items-center">
                                    <input
                                        type="text"
                                        value={r.routePattern}
                                        onChange={(e) => updateRoute(r.rid, { routePattern: e.target.value })}
                                        placeholder="/calendar"
                                        list={`routes-${r.rid}`}
                                        className="rounded border border-border bg-background px-2 py-1.5 text-xs"
                                    />
                                    <datalist id={`routes-${r.rid}`}>
                                        {SUGGESTED_ROUTES.map((s) => <option key={s} value={s} />)}
                                    </datalist>
                                    <select
                                        value={r.documentId}
                                        onChange={(e) => updateRoute(r.rid, { documentId: e.target.value })}
                                        className="rounded border border-border bg-background px-2 py-1.5 text-xs"
                                    >
                                        <option value="">{t('settings.help.audioguide_waehlen')}</option>
                                        {audioGuides.map((g) => (
                                            <option key={g.documentId} value={g.documentId}>
                                                {g.title} ({g.cueCount} {t('settings.help.cues')}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => removeRoute(r.rid)}
                                        title={t('settings.help.eintrag_entfernen')}
                                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    >
                                        <MaterialIcon name="delete" size={16} className="size-3.5" />
                                    </button>
                                </div>
                            ))}

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => addRoute()}
                                    className="inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-1.5 text-xs hover:bg-muted"
                                >
                                    <MaterialIcon name="add" size={16} className="size-3" /> {t('settings.help.eintrag_hinzufuegen')}
                                </button>
                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={saving || !dirty}
                                    className={cn(
                                        'relative ml-auto inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
                                    )}
                                >
                                    {saving ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="save" size={16} className="size-3" />}
                                    {t('settings.help.speichern')}
                                    {dirty && !saving && (
                                        <span className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-400 ring-2 ring-background" aria-hidden />
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
