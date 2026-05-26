/**
 * PersonalCalendarCard — in „Mein Fach": persönlichen Kalender (level-4,
 * userId-scoped, nur für mich sichtbar) aktivieren. Danach erscheint er
 * als Ebene „Persönlich" in den Kalender-Ansichten.
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

export function PersonalCalendarCard(): JSX.Element | null {
    const t = useT();
    const navigate = useNavigate();
    const [state, setState] = useState<'loading' | 'inactive' | 'active'>('loading');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) { setState('inactive'); return; }
        gateway.getPersonalCalendar(jwt)
            .then(r => setState(r.layer ? 'active' : 'inactive'))
            .catch(() => setState('inactive'));
    }, []);

    if (state === 'loading') return null;

    const activate = async () => {
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) return;
        setBusy(true);
        try {
            await gateway.ensurePersonalCalendar(jwt);
            try { await calendarLayersStore.refresh(); } catch { /* optional */ }
            setState('active');
            toast.success(t('mein-fach.personal_cal.activated', { defaultValue: 'Persönlicher Kalender aktiviert — im Kalender unter „Persönlich" sichtbar.' }));
        } catch (e) {
            toast.error((e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    return (
        <div className="m-2 flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <MaterialIcon name="lock" size={16} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{t('mein-fach.personal_cal.title', { defaultValue: 'Persönlicher Kalender' })}</div>
                <div className="text-[11px] text-muted-foreground">
                    {state === 'active'
                        ? t('mein-fach.personal_cal.active_hint', { defaultValue: 'Aktiv · nur für dich sichtbar · als Ebene „Persönlich" im Kalender' })
                        : t('mein-fach.personal_cal.inactive_hint', { defaultValue: 'Eigener Kalender, nur für dich sichtbar. Erscheint nach Aktivierung als Ebene im Kalender.' })}
                </div>
            </div>
            {state === 'active' ? (
                <button onClick={() => navigate('/calendar')}
                    className="shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-muted">
                    {t('mein-fach.personal_cal.open', { defaultValue: 'Zum Kalender' })}
                </button>
            ) : (
                <button disabled={busy} onClick={activate}
                    className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-[12px] text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {busy ? t('mein-fach.personal_cal.activating', { defaultValue: 'Aktiviere…' }) : t('mein-fach.personal_cal.activate', { defaultValue: 'Aktivieren' })}
                </button>
            )}
        </div>
    );
}
