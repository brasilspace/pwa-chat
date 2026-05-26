import { type JSX, useState, useCallback, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCalendarLayers, useCanManageSchoolCalendar } from './use-calendar';
import { calendarLayersStore } from './calendar-layers-store';
import { useCan } from '@/core/permissions';
import { sessionStore } from '@/core/session/session-store';
import { createCalendarGateway } from '@/gateways/platform/calendar-gateway';
import { logger } from '@/core/logging/logger';
import { cn } from '@/lib/utils';
import { Loader2, School, LayoutGrid, Lock } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { MiniCalendar } from './mini-calendar';
import { CalendarSyncDialog } from './calendar-sync-dialog';
import { CalendarLayerSettingsPanel } from './calendar-layer-settings-panel';
import { useT } from "@/lib/i18n/use-t";

const gateway = createCalendarGateway();

/** YYYY-MM-DD in lokaler Zeit (kein UTC-Drift bei toISOString). */
function formatDateParam(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

interface CalendarWorldProps {
    collapsed: boolean;
}

/**
 * CalendarWorld — Sidebar-Inhalt fuer den Kalender-Hub.
 *
 * Zweck: Schnellzugriff auf den Kalender und Layer-Toggle in der Seitenleiste.
 * Schulkalender (level 1) wird oben separat hervorgehoben — er ist die
 * gemeinsame Basis fuer die ganze Schule. Darunter listen wir die
 * Space-Kalender mit Toggle-Buttons, mit denen Lehrer einzelne Kalender
 * ein- und ausblenden koennen.
 *
 * Der eigentliche Kalender (Monat/Woche/Liste) liegt im Hauptbereich
 * (calendar-hub.tsx). Diese Seitenleiste ist nur Navigation und Layer-Filter.
 */
export function CalendarWorld({ collapsed }: CalendarWorldProps): JSX.Element {
    const t = useT();
    const { layers, loading, toggleLayer, refresh } = useCalendarLayers();
    const { canManage: canManageSchool } = useCanManageSchoolCalendar();
    const navigate = useNavigate();
    const canManage = useCan('manageSpaces');
    const [showSync, setShowSync] = useState(false);
    const [settingsLayerId, setSettingsLayerId] = useState<string | null>(null);
    const [showCreateSchool, setShowCreateSchool] = useState(false);
    const [schoolName, setSchoolName] = useState('Schulkalender');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);

    const handleCreateSchoolCalendar = useCallback(async () => {
        const name = schoolName.trim();
        if (!name) return;
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) return;
        setCreating(true);
        setCreateError(null);
        try {
            await gateway.createLayer(jwt, { level: 1, name });
            await calendarLayersStore.refresh();
            // Nach dem Anlegen automatisch abonnieren — der User will ihn ja
            // sehen, sonst haette er ihn nicht angelegt. Wir holen die neue
            // Layer-Liste, finden den gerade erstellten und toggeln ihn falls
            // nicht bereits subscribed.
            const fresh = calendarLayersStore.getSnapshot().layers;
            const created = fresh.find((l) => l.level === 1 && l.name === name && !l.subscribed);
            if (created) {
                await calendarLayersStore.toggleLayer(created.id);
            }
            setShowCreateSchool(false);
            setSchoolName('Schulkalender');
        } catch (err) {
            logger.error('createSchoolCalendar failed', { error: err });
            setCreateError(err instanceof Error ? err.message : 'Konnte Schulkalender nicht anlegen.');
        } finally {
            setCreating(false);
        }
    }, [schoolName]);
    // Hinweis: Auto-Navigate beim Mount entfaellt — der Welten-Button im
    // app-sidebar navigiert direkt nach /calendar, sodass CalendarWorld nur
    // dort ueberhaupt gerendert wird. Frueher hatte ein zusaetzlicher Effect
    // den User staendig zurueck nach /calendar gezerrt, was den
    // Favoriten-Button kaputt gemacht hat.

    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-1 py-2">
                <button
                    onClick={() => navigate('/calendar')}
                    className="rounded-md p-2 hover:bg-muted"
                    title={t('calendar.calendar_world.kalender')}
                >
                    <MaterialIcon name="calendar_today" size={16} className="size-4" />
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Schulkalender = level 1 (tenant-weit, fuer alle Mitarbeiter relevant)
    const schoolLayers = layers.filter((l) => l.level === 1);
    // Konzept-Kalender = Layer gehoert zu einem Space vom Typ 'concept'
    const conceptLayers = layers.filter((l) => l.isConcept);
    // Persönlicher Kalender = level 4 (userId-scoped, nur für mich)
    const personalLayers = layers.filter((l) => l.level === 4);
    // Space-Kalender = level >= 2 (pro Space), ohne Konzept-Kalender; level 4 (persönlich) raus
    const spaceLayers = layers.filter((l) => l.level >= 2 && l.level !== 4 && !l.isConcept);

    return (
        <div className="mb-2">
            <div className="mb-1 flex items-center justify-between px-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('calendar.calendar_world.kalender')}</p>
                <button onClick={() => setShowSync(true)}
                    title={t('calendar.sync.title', { defaultValue: 'Kalender synchronisieren' })}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                    <MaterialIcon name="sync_alt" size={16} className="size-3.5" />
                </button>
            </div>
            {showSync && (() => {
                const jwt = sessionStore.getSnapshot().platform?.token;
                return jwt ? (
                    <CalendarSyncDialog layers={layers} jwt={jwt}
                        onClose={() => setShowSync(false)}
                        refresh={() => { void refresh(); }}
                        canManageSchool={canManageSchool} />
                ) : null;
            })()}

            {/* Mini-Kalender — Tag-Klick oeffnet die Tages-, KW-Klick die Wochen-Ansicht */}
            <MiniCalendar
                onSelect={(d) => navigate(`/calendar?view=day&date=${formatDateParam(d)}`)}
                onSelectWeek={(d) => navigate(`/calendar?view=week&date=${formatDateParam(d)}`)}
            />

            {/* Schulkalender */}
            <div>
                {schoolLayers.length > 0 && schoolLayers.map((layer) => (
                    <LayerToggle
                        key={layer.id}
                        color={layer.color}
                        name={layer.name}
                        subscribed={layer.subscribed}
                        icon={School}
                        onToggle={() => toggleLayer(layer.id)}
                        onSettings={() => setSettingsLayerId(layer.id)}
                    />
                ))}

                {/* Leere-Liste-Zustand */}
                {schoolLayers.length === 0 && !showCreateSchool && (
                    <>
                        <p className="px-2 py-1 text-[11px] italic text-muted-foreground">
                            {t('calendar.calendar_world.noch_nicht_eingerichtet')}
                        </p>
                        {canManage && (
                            <button
                                onClick={() => setShowCreateSchool(true)}
                                className="mt-1 flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <MaterialIcon name="add" size={16} className="size-3" />
                                {t('calendar.calendar_world.schulkalender_anlegen')}
                            </button>
                        )}
                    </>
                )}

                {/* Inline-Form zum Anlegen. Wird bewusst nicht als Modal
                    gerendert, weil der Sidebar-Kontext schmal genug ist
                    und ein einzeiliger Dialog ausreicht. */}
                {showCreateSchool && (
                    <div className="mt-1 rounded-md border border-border bg-card p-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('calendar.calendar_world.neuer_schulkalender')}
                            </span>
                            <button
                                onClick={() => { setShowCreateSchool(false); setCreateError(null); }}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <MaterialIcon name="close" size={16} className="size-3" />
                            </button>
                        </div>
                        <input
                            type="text"
                            value={schoolName}
                            onChange={(e) => setSchoolName(e.target.value)}
                            placeholder={t('calendar.calendar_world.name_des_kalenders')}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-[12px] outline-none focus:border-primary"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateSchoolCalendar();
                                if (e.key === 'Escape') setShowCreateSchool(false);
                            }}
                        />
                        {createError && (
                            <p className="mt-1 text-[10px] text-destructive">{createError}</p>
                        )}
                        <button
                            onClick={handleCreateSchoolCalendar}
                            disabled={creating || !schoolName.trim()}
                            className="mt-1.5 w-full rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {creating ? t('common.creating') : t('common.create')}
                        </button>
                    </div>
                )}
            </div>

            {/* Persönlicher Kalender (nur für mich sichtbar) */}
            {personalLayers.length > 0 && (
                <div>
                    <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('calendar.calendar_world.persoenlich', { defaultValue: 'Persönlich' })}
                    </p>
                    {personalLayers.map((layer) => (
                        <LayerToggle
                            key={layer.id}
                            color={layer.color}
                            name={layer.name}
                            subscribed={layer.subscribed}
                            icon={Lock}
                            onToggle={() => toggleLayer(layer.id)}
                            onSettings={() => setSettingsLayerId(layer.id)}
                        />
                    ))}
                </div>
            )}

            {/* Space-Kalender */}
            <div>
                <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('calendar.calendar_world.space-kalender')}
                </p>
                {spaceLayers.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] italic text-muted-foreground">
                        {t('calendar.calendar_world.keine_vorhanden')}
                    </p>
                ) : (
                    spaceLayers.map((layer) => (
                        <LayerToggle
                            key={layer.id}
                            color={layer.color}
                            name={layer.name}
                            subscribed={layer.subscribed}
                            icon={LayoutGrid}
                            onToggle={() => toggleLayer(layer.id)}
                            onSettings={() => setSettingsLayerId(layer.id)}
                        />
                    ))
                )}
            </div>

            {/* Konzept-Kalender */}
            {conceptLayers.length > 0 && (
                <div>
                    <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('calendar.calendar_world.konzept-kalender')}
                    </p>
                    {conceptLayers.map((layer) => (
                        <LayerToggle
                            key={layer.id}
                            color={layer.color}
                            name={layer.name}
                            subscribed={layer.subscribed}
                            icon={LayoutGrid}
                            onToggle={() => toggleLayer(layer.id)}
                            onSettings={() => setSettingsLayerId(layer.id)}
                        />
                    ))}
                </div>
            )}

            <p className="mt-1 px-2 text-[10px] leading-relaxed text-muted-foreground/70">
                {t('calendar.calendar_world.aktive_kalender_werden_im_hauptbereich_a')}
            </p>

            {/* Layer-Settings als Slide-Over (kein Modal — Memory-Regel). */}
            <CalendarLayerSettingsPanel
                layer={settingsLayerId ? layers.find(l => l.id === settingsLayerId) ?? null : null}
                onClose={() => setSettingsLayerId(null)}
                onUpdated={() => refresh()}
            />
        </div>
    );
}

function LayerToggle({
    color,
    name,
    subscribed,
    icon: Icon,
    onToggle,
    onSettings,
}: {
    color: string;
    name: string;
    subscribed: boolean;
    icon: typeof School;
    onToggle: () => void;
    /** Optional: Zahnrad-Icon zum Oeffnen der Layer-Settings. */
    onSettings?: () => void;
}) {
    const tt = useT();
    return (
        <div className={cn(
            'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-muted',
            subscribed && 'bg-muted/50',
        )}>
            <button
                onClick={onToggle}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
                <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: subscribed ? color : 'transparent', borderWidth: 1, borderColor: color, borderStyle: 'solid' }}
                />
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className={cn('min-w-0 flex-1 truncate', subscribed ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                    {name}
                </span>
                {subscribed ? (
                    <MaterialIcon name="visibility" size={16} className="size-3 shrink-0 text-muted-foreground" />
                ) : (
                    <MaterialIcon name="visibility_off" size={16} className="size-3 shrink-0 text-muted-foreground/50" />
                )}
            </button>
            {onSettings && (
                <button
                    onClick={(e) => { e.stopPropagation(); onSettings(); }}
                    title={tt('calendar.layer_settings.open_settings')}
                    className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-opacity hover:bg-muted-foreground/10 hover:text-foreground group-hover:opacity-100"
                >
                    <MaterialIcon name="settings" size={14} className="size-3" />
                </button>
            )}
        </div>
    );
}
