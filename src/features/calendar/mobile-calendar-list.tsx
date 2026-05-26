import { type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CalendarDays, CalendarRange, School, LayoutGrid, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useCalendarLayers } from './use-calendar';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

/**
 * MobileCalendarList — Mobile-Entry fuer den Kalender-Hub.
 *
 * Spiegelt die Inhalte der CalendarWorld-Sidebar (Layer-Toggles fuer
 * Schul- und Space-Kalender) als full-width Touch-Liste, plus zwei
 * prominent platzierte Ansichts-Eintraege (Monat / Jahr) zum Drill-in.
 *
 * UX-Logik (analog zur Spaces-Liste):
 * - Tap auf einen Ansichts-Eintrag → navigiert in den Kalender (Detail-View)
 * - Tap auf eine Layer-Zeile → toggelt deren Sichtbarkeit (kein Nav)
 * - Touch-Targets sind 44px hoch
 */
export function MobileCalendarList(): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const { layers, loading, toggleLayer } = useCalendarLayers();

    const schoolLayers = layers.filter((l) => l.level === 1);
    const spaceLayers = layers.filter((l) => l.level >= 2);

    return (
        <div className="flex h-full flex-col bg-background">
            {/* Header */}
            <div className="shrink-0 border-b border-border bg-background px-4 py-3">
                <h1 className="text-lg font-semibold">{t('calendar.mobile_calendar_list.kalender')}</h1>
                <p className="text-xs text-muted-foreground">{t('calendar.mobile_calendar_list.termine_und_layer')}</p>
            </div>

            {/* Content */}
            <div className="min-h-0 flex-1 overflow-y-auto pb-6">
                {/* Ansichten — Drill-in Targets */}
                <section className="px-4 pt-4">
                    <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('calendar.mobile_calendar_list.ansichten')}
                    </h2>
                    <ViewRow
                        icon={CalendarDays}
                        label={t('calendar.mobile_calendar_list.monatsansicht')}
                        onClick={() => navigate('/calendar?view=open')}
                    />
                    <ViewRow
                        icon={CalendarRange}
                        label={t('calendar.mobile_calendar_list.jahresansicht')}
                        onClick={() => navigate('/calendar?view=year')}
                    />
                </section>

                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        {/* Schulkalender */}
                        <section className="px-4 pt-6">
                            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('calendar.mobile_calendar_list.schulkalender')}
                            </h2>
                            {schoolLayers.length === 0 ? (
                                <p className="px-2 py-3 text-xs italic text-muted-foreground">
                                    {t('calendar.mobile_calendar_list.noch_nicht_eingerichtet')}
                                </p>
                            ) : (
                                schoolLayers.map((layer) => (
                                    <LayerRow
                                        key={layer.id}
                                        color={layer.color}
                                        name={layer.name}
                                        subscribed={layer.subscribed}
                                        icon={School}
                                        onToggle={() => toggleLayer(layer.id)}
                                    />
                                ))
                            )}
                        </section>

                        {/* Space-Kalender */}
                        <section className="px-4 pt-6">
                            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('calendar.mobile_calendar_list.space-kalender')}
                            </h2>
                            {spaceLayers.length === 0 ? (
                                <p className="px-2 py-3 text-xs italic text-muted-foreground">
                                    {t('calendar.mobile_calendar_list.keine_vorhanden')}
                                </p>
                            ) : (
                                spaceLayers.map((layer) => (
                                    <LayerRow
                                        key={layer.id}
                                        color={layer.color}
                                        name={layer.name}
                                        subscribed={layer.subscribed}
                                        icon={LayoutGrid}
                                        onToggle={() => toggleLayer(layer.id)}
                                    />
                                ))
                            )}
                        </section>

                        <p className="mt-6 px-6 text-center text-[11px] leading-relaxed text-muted-foreground/70">
                            {t('calendar.mobile_calendar_list.tippe_einen_kalender_an_um_ihn_ein-_oder')}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

function ViewRow({ icon: Icon, label, onClick }: {
    icon: typeof Calendar;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors active:bg-muted"
        >
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-[15px] font-medium text-foreground">{label}</span>
            <MaterialIcon name="chevron_right" size={16} className="size-4 shrink-0 text-muted-foreground/60" />
        </button>
    );
}

function LayerRow({ color, name, subscribed, icon: Icon, onToggle }: {
    color: string;
    name: string;
    subscribed: boolean;
    icon: typeof School;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors active:bg-muted"
        >
            <span
                className="size-3 shrink-0 rounded-full"
                style={{
                    backgroundColor: subscribed ? color : 'transparent',
                    borderWidth: 1.5,
                    borderColor: color,
                    borderStyle: 'solid',
                }}
            />
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn(
                'flex-1 truncate text-[15px]',
                subscribed ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}>
                {name}
            </span>
            {subscribed ? (
                <MaterialIcon name="visibility" size={16} className="size-4 shrink-0 text-muted-foreground" />
            ) : (
                <MaterialIcon name="visibility_off" size={16} className="size-4 shrink-0 text-muted-foreground/50" />
            )}
        </button>
    );
}
