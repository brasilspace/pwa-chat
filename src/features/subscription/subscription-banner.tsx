/**
 * SubscriptionBanner — Top-Banner fuer Freemium-Status.
 *
 * Zeigt sich oberhalb des Headers wenn:
 *  - Trial laeuft in <= 7 Tagen aus (gelb)
 *  - Daten sind ausgeblendet weil Trial-Ende erreicht (rot)
 *  - Konto-Schliessung geplant (rot, mit Cancel-Button)
 */
import { type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useSubscriptionStatus, invalidateSubscriptionStatus } from './use-subscription-status';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { useT } from "@/lib/i18n/use-t";

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    });
}

async function cancelDeletion(): Promise<void> {
    const token = sessionStore.getSnapshot().platform?.token;
    if (!token) return;
    await fetch(`${env.platformBaseUrl}/platform/v1/subscription/cancel-deletion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });
    invalidateSubscriptionStatus();
    window.location.reload();
}

export function SubscriptionBanner(): JSX.Element | null {
    const t = useT();
    const status = useSubscriptionStatus();
    const navigate = useNavigate();

    if (!status || status.bannerKind === 'none') return null;

    const goToBilling = () => navigate('/settings/rechnungen');

    let className = 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100';
    let message: JSX.Element;
    let action: JSX.Element | null = null;

    if (status.bannerKind === 'trial-ending-soon') {
        className = 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100';
        message = (
            <>
                {t('subscription.subscription_banner.in')} <strong>{status.trialDaysLeft}</strong> {t('subscription.subscription_banner.tag')}{status.trialDaysLeft === 1 ? '' : 'en'} {t('subscription.subscription_banner.werden_erste_inhalte_ausgeblendet')}
            </>
        );
        action = (
            <button
                onClick={goToBilling}
                className="ml-3 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
            >
                {t('subscription.subscription_banner.jetzt_3_euruser_abonnieren')}
            </button>
        );
    } else if (status.bannerKind === 'data-hidden') {
        className = 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100';
        message = (
            <>{t('subscription.subscription_banner.inhalte_aelter_90_tage_sind_ausgeblendet')}</>
        );
        action = (
            <button
                onClick={goToBilling}
                className="ml-3 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
                {t('subscription.subscription_banner.jetzt_3_euruser_abonnieren')}
            </button>
        );
    } else {
        className = 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100';
        message = (
            <>
                {t('subscription.subscription_banner.workspace_wird_am')} <strong>{status.scheduledDeletionAt ? formatDate(status.scheduledDeletionAt) : '?'}</strong> {t('subscription.subscription_banner.unwiderruflich_geloescht')}
            </>
        );
        action = (
            <button
                onClick={cancelDeletion}
                className="ml-3 inline-flex items-center gap-1 rounded-md bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30"
            >
                <MaterialIcon name="close" size={16} className="size-3" /> {t('subscription.subscription_banner.abbrechen')}
            </button>
        );
    }

    return (
        <div className={cn('flex items-center justify-center gap-2 px-4 py-2 text-sm', className)}>
            <MaterialIcon name="warning" size={16} className="size-4 shrink-0" />
            <span>{message}</span>
            {action}
        </div>
    );
}
