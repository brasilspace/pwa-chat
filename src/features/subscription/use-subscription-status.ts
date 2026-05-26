/**
 * use-subscription-status — Hook fuer den Banner und die Settings-Seite.
 *
 * Polled alle 5 Minuten den Status. Nicht oft genug zu aendern, dass
 * SSE noetig waere — Trial-Tage zaehlen taeglich, Abo-Aktivierung kommt
 * via Stripe-Webhook spaeter zurueck.
 */
import { useEffect, useState } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';

export interface SubscriptionStatus {
    status: 'trial' | 'active' | 'cancelled';
    trialDaysLeft: number | null;
    hasHiddenData: boolean;
    daysUntilFirstHide: number | null;
    scheduledDeletionAt: string | null;
    creditCents: number;
    trialAlreadyExtended: boolean;
    bannerKind: 'none' | 'trial-ending-soon' | 'data-hidden' | 'deletion-scheduled';
}

let cached: SubscriptionStatus | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

async function loadStatus(token: string): Promise<SubscriptionStatus | null> {
    try {
        const res = await fetch(`${env.platformBaseUrl}/platform/v1/subscription/status`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        return await res.json() as SubscriptionStatus;
    } catch {
        return null;
    }
}

export function useSubscriptionStatus(): SubscriptionStatus | null {
    const [status, setStatus] = useState<SubscriptionStatus | null>(cached);

    useEffect(() => {
        const session = sessionStore.getSnapshot();
        const token = session.platform?.token;
        if (!token) return;

        const fetchIfStale = () => {
            const now = Date.now();
            if (cached && now - cachedAt < CACHE_MS) {
                setStatus(cached);
                return;
            }
            loadStatus(token).then(s => {
                if (s) {
                    cached = s;
                    cachedAt = Date.now();
                    setStatus(s);
                }
            });
        };

        fetchIfStale();
        const interval = setInterval(fetchIfStale, CACHE_MS);
        return () => clearInterval(interval);
    }, []);

    return status;
}

/** Manueller Reload — z.B. nach Trial-Verlaengerung oder Stripe-Checkout. */
export function invalidateSubscriptionStatus(): void {
    cached = null;
    cachedAt = 0;
}
