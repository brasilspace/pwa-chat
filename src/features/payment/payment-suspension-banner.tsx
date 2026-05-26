import { type JSX, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { AlertOctagon } from 'lucide-react';
import { useT } from "@/lib/i18n/use-t";

/**
 * PaymentSuspensionBanner — vollflaechiger Hinweis bei suspended Tenant.
 *
 * Zeigt einen prominent roten Balken oberhalb des Chat-Inhalts wenn die
 * Schule wegen ausstehender Zahlung pausiert wurde. Lesen funktioniert
 * normal weiter (read-only Modus), neue Nachrichten kann der Synapse-Hook
 * spaeter blocken — der Banner ist die UX-Erklaerung warum.
 *
 * Status kommt aus session.permissions.paymentHealthStatus, das vom
 * /platform/v1/me/permissions Endpoint gesetzt wird.
 */
async function openBillingPortal() {
    const token = sessionStore.getSnapshot().platform?.token;
    if (!token) return;
    try {
        const res = await fetch('/api/platform/v1/billing/portal-session', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.url) window.location.href = data.url;
    } catch { /* ignore */ }
}

export function PaymentSuspensionBanner(): JSX.Element | null {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const status = session.permissions?.paymentHealthStatus;

    const handleOpenBillingPortal = () => { openBillingPortal(); };

    if (status !== 'suspended' && status !== 'cancelled') {
        return null;
    }

    return (
        <div className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-900 dark:bg-red-950/30">
            <AlertOctagon className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="min-w-0 flex-1">
                <p className="font-semibold text-red-800 dark:text-red-200">
                    {status === 'suspended'
                        ? 'Dieser Prilog-Server ist wegen ausstehender Zahlung pausiert.'
                        : 'Dieser Prilog-Vertrag wurde beendet.'}
                </p>
                <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">
                    {t('payment.payment_suspension_banner.lesen_ist_moeglich_neue_nachrichten_koen')}
                </p>
                <button
                    onClick={handleOpenBillingPortal}
                    className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                >
                    {t('payment.payment_suspension_banner.zahlungsmethode_aktualisieren')}
                </button>
            </div>
        </div>
    );
}
