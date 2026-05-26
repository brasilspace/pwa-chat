/**
 * SpaceCalendarCard — im Space-Info-Panel: Space-Kalender (level-2,
 * spaceId-scoped) aktivieren. Idempotent — wenn schon ein Layer existiert,
 * zeigt die Karte nur den Status. Mitglieder + Admins duerfen aktivieren,
 * Backend prueft die Membership.
 *
 * Analog [[personal-calendar-card]] in Mein Fach.
 */
import { type JSX, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MaterialIcon } from '@/components/ui/material-icon';
import { toast } from '@/components/ui/toast';
import { sessionStore } from '@/core/session/session-store';
import { createCalendarGateway } from '@/gateways/platform/calendar-gateway';
import { calendarLayersStore } from '@/features/calendar/calendar-layers-store';
import { useT } from '@/lib/i18n/use-t';

const gateway = createCalendarGateway();

export function SpaceCalendarCard({ spaceId }: { spaceId: string }): JSX.Element | null {
    const t = useT();
    const navigate = useNavigate();
    const [state, setState] = useState<'loading' | 'inactive' | 'active'>('loading');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const tick = () => {
            const layers = calendarLayersStore.getSnapshot().layers;
            const has = layers.some(l => l.level === 2 && l.spaceId === spaceId);
            if (!cancelled) setState(has ? 'active' : 'inactive');
        };
        // Sicherstellen, dass die Layer-Liste geladen ist, dann zustand ableiten.
        calendarLayersStore.ensureLoaded();
        tick();
        const unsub = calendarLayersStore.subscribe(tick);
        return () => { cancelled = true; unsub(); };
    }, [spaceId]);

    if (state === 'loading') return null;

    const activate = async () => {
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) return;
        setBusy(true);
        try {
            await gateway.ensureSpaceCalendar(jwt, spaceId);
            try { await calendarLayersStore.refresh(); } catch { /* optional */ }
            setState('active');
            toast.success(t('spaces.space_cal.activated', { defaultValue: 'Space-Kalender aktiviert — als Ebene im Kalender sichtbar.' }));
        } catch (e) {
            toast.error((e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    return (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <MaterialIcon name="calendar_month" size={16} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{t('spaces.space_cal.title', { defaultValue: 'Space-Kalender' })}</div>
                <div className="text-[11px] text-muted-foreground">
                    {state === 'active'
                        ? t('spaces.space_cal.active_hint', { defaultValue: 'Aktiv · sichtbar fuer alle Mitglieder dieses Space' })
                        : t('spaces.space_cal.inactive_hint', { defaultValue: 'Eigener Kalender fuer diesen Space. Erscheint nach Aktivierung als Ebene im Kalender.' })}
                </div>
            </div>
            {state === 'active' ? (
                <button onClick={() => navigate('/calendar')}
                    className="shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-muted">
                    {t('spaces.space_cal.open', { defaultValue: 'Zum Kalender' })}
                </button>
            ) : (
                <button disabled={busy} onClick={activate}
                    className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-[12px] text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {busy ? t('spaces.space_cal.activating', { defaultValue: 'Aktiviere…' }) : t('spaces.space_cal.activate', { defaultValue: 'Aktivieren' })}
                </button>
            )}
        </div>
    );
}
