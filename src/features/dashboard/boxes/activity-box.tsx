import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { Activity } from 'lucide-react';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { BoxShell, BoxEmpty, BoxSkeleton } from './box-shell';
import { useT } from "@/lib/i18n/use-t";

interface ActivityItem {
    id: string;
    type: 'mention' | 'document';
    title: string;
    actor: string;
    timestamp: string;
    url: string;
}

/**
 * Box "Aktivitaeten".
 * Phase 1.7 fuellt mit echten Daten (Mentions + neue Dokumente).
 */
export function ActivityBox(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [items, setItems] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        const gw = createPlatformGateway();
        gw.fetchJson<{ items: ActivityItem[] }>(jwt, '/platform/v1/dashboard/activity-feed')
            .then((res) => setItems(res.items ?? []))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <BoxShell icon={<Activity className="size-4" />} title={t('dashboard.boxes.activity.aktivitaeten')}>
            {loading && <BoxSkeleton />}
            {!loading && items.length === 0 && <BoxEmpty>{t('dashboard.boxes.activity.keine_neuen_aktivitaeten')}</BoxEmpty>}
            {!loading && items.length > 0 && (
                <ul className="space-y-2">
                    {items.slice(0, 10).map((item) => (
                        <li key={item.id} className="text-sm">
                            <a href={item.url} className="hover:underline">
                                <span className="font-medium">{item.actor}</span>
                                <span className="text-muted-foreground"> — {item.title}</span>
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </BoxShell>
    );
}
