import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { BoxShell, BoxEmpty, BoxSkeleton } from './box-shell';
import { useT } from "@/lib/i18n/use-t";

interface PrilogEvent {
    id: string;
    title: string;
    body: string | null;
    type: string;
    date: string | null;
    url: string | null;
    icon: string | null;
}

/**
 * Box "Prilog-Veranstaltungen" — von uns (Prilog GmbH) bewirtschaftet.
 */
export function PrilogEventsBox(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [events, setEvents] = useState<PrilogEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        const gw = createPlatformGateway();
        gw.fetchJson<{ events: PrilogEvent[] }>(jwt, '/platform/v1/dashboard/prilog-events')
            .then((res) => setEvents(res.events ?? []))
            .catch(() => setEvents([]))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <BoxShell icon={<MaterialIcon name="campaign" size={16} className="size-4" />} title={t('dashboard.boxes.prilog_events.prilog-veranstaltungen')}>
            {loading && <BoxSkeleton />}
            {!loading && events.length === 0 && (
                <BoxEmpty>{t('dashboard.boxes.prilog_events.keine_anstehenden_veranstaltungen_wir_me')}</BoxEmpty>
            )}
            {!loading && events.length > 0 && (
                <ul className="space-y-2">
                    {events.map((e) => (
                        <li key={e.id}>
                            {e.url ? (
                                <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 rounded p-1 hover:bg-accent">
                                    {e.icon && <span>{e.icon}</span>}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">{e.title}</p>
                                        {e.date && <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>}
                                    </div>
                                    <MaterialIcon name="open_in_new" size={16} className="size-3 mt-1 shrink-0 opacity-60" />
                                </a>
                            ) : (
                                <div className="flex items-start gap-2 p-1">
                                    {e.icon && <span>{e.icon}</span>}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">{e.title}</p>
                                        {e.body && <p className="text-xs text-muted-foreground">{e.body}</p>}
                                        {e.date && <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>}
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </BoxShell>
    );
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        return iso;
    }
}
