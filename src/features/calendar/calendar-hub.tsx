import { type JSX, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPanel, type CalendarView } from '@/features/spaces/panels/calendar-panel';
import { MobileCalendarList } from './mobile-calendar-list';
import { useIsMobile } from '@/core/responsive/use-is-mobile';
import { useSwipeRightToBack } from '@/core/responsive/use-swipe-right-to-back';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const VALID_VIEWS: CalendarView[] = ['year', 'month', 'week', 'day', 'list', 'gantt'];

/** YYYY-MM-DD aus URL parsen; ungueltige Strings → undefined (Default = heute). */
function parseDateParam(s: string | null): Date | undefined {
    if (!s) return undefined;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return undefined;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * CalendarHub — Top-Level-Sicht auf alle Kalender des Tenants.
 *
 * Desktop: rendert direkt das CalendarPanel (Monats-/Wochenansicht).
 *
 * Mobile: zeigt ohne `view`-Param die MobileCalendarList als Entry — das
 * Pendant zur Desktop-Sidebar (Layer-Toggles, Ansichten). Ein Tap auf eine
 * Ansicht navigiert in den eigentlichen Kalender mit Breadcrumb-Header und
 * Swipe-Right-to-Back-Geste.
 */
export function CalendarHub(): JSX.Element {
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const currentView = searchParams.get('view');
    const dateParam = searchParams.get('date');

    const initialView = useMemo<CalendarView | undefined>(
        () => (currentView && (VALID_VIEWS as string[]).includes(currentView) ? (currentView as CalendarView) : undefined),
        [currentView],
    );
    const initialDate = useMemo(() => parseDateParam(dateParam), [dateParam]);

    // Mobile-Entry: ohne View-Param zeigen wir die Sidebar-Liste
    if (isMobile && !currentView) {
        return <MobileCalendarList />;
    }

    return <CalendarDetail isMobile={isMobile} onBack={() => navigate('/calendar')} initialView={initialView} initialDate={initialDate} />;
}

function CalendarDetail({ isMobile, onBack, initialView, initialDate }: { isMobile: boolean; onBack: () => void; initialView?: CalendarView; initialDate?: Date }): JSX.Element {
    const t = useT();
    const swipeBackHandlers = useSwipeRightToBack(isMobile, onBack);
    return (
        <div className="flex h-full flex-col" {...swipeBackHandlers}>
            {/* Mobile Breadcrumb-Header */}
            {isMobile ? (
                <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-2">
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={t('calendar.calendar_hub.zurueck_zur_kalender-uebersicht')}
                        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors active:bg-muted"
                    >
                        <MaterialIcon name="calendar_today" size={20} />
                    </button>
                    <MaterialIcon name="chevron_right" size={16} className="shrink-0 text-muted-foreground/60" aria-hidden />
                    <span className="truncate text-sm font-semibold">{t('calendar.calendar_hub.kalender')}</span>
                </div>
            ) : (
                <div className="flex h-[var(--toolbar-height)] shrink-0 items-center border-b px-4">
                    <MaterialIcon name="calendar_today" size={16} className="mr-2 text-muted-foreground" />
                    <span className="text-lg font-semibold">{t('calendar.calendar_hub.kalender')}</span>
                </div>
            )}
            <div className="min-h-0 flex-1">
                <CalendarPanel fullscreen hideLayerBar initialView={initialView} initialDate={initialDate} />
            </div>
        </div>
    );
}
