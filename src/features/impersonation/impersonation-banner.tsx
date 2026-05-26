import { type JSX, useSyncExternalStore, useState } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { impersonationService } from './impersonation-service';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

export function ImpersonationBanner(): JSX.Element | null {
    const t = useT();
    const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const [ending, setEnding] = useState(false);

    if (!snapshot.impersonation) return null;

    const { targetUser } = snapshot.impersonation;

    const handleEnd = async () => {
        setEnding(true);
        try {
            await impersonationService.endImpersonation();
        } finally {
            setEnding(false);
        }
    };

    return (
        <div className="flex h-8 shrink-0 items-center justify-center gap-2 bg-amber-500 px-4 text-xs font-medium text-white">
            <MaterialIcon name="visibility" size={16} className="size-3.5" />
            <span>
                {t('impersonation.impersonation_banner.du_siehst_den_account_von')} <strong>{targetUser.displayName}</strong> {t('impersonation.impersonation_banner.nur_lesen')}
            </span>
            <button
                onClick={handleEnd}
                disabled={ending}
                className="ml-3 flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-[11px] font-medium hover:bg-white/30 disabled:opacity-50"
            >
                {ending ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="close" size={16} className="size-3" />}
                {t('impersonation.impersonation_banner.beenden')}
            </button>
        </div>
    );
}
