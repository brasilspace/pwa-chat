import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { BoxShell, BoxEmpty, BoxSkeleton } from './box-shell';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface SetupStep {
    id: string;
    label: string;
    target: string;
    done: boolean;
    skipped: boolean;
    value: number;
}

interface SetupData {
    steps: SetupStep[];
    completed: number;
    total: number;
    nextStep: string | null;
}

/**
 * Box "Prilog-Einrichtung" (nur Admin).
 * 5-Schritt-Reise: Plugins → Spaces → User → UserTypes → Learning Flows.
 * Auto-Status + manuelle Skip-Option.
 */
export function SetupBox(): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [data, setData] = useState<SetupData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        const gw = createPlatformGateway();
        gw.fetchJson<SetupData>(jwt, '/platform/v1/dashboard/setup-status')
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [jwt]);

    const handleSkip = async (stepId: string) => {
        if (!jwt) return;
        await fetch(`/platform/v1/dashboard/setup-status/skip`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
            body: JSON.stringify({ step: stepId }),
        }).catch(() => { });
        const gw = createPlatformGateway();
        gw.fetchJson<SetupData>(jwt, '/platform/v1/dashboard/setup-status')
            .then(setData)
            .catch(() => { });
    };

    return (
        <BoxShell
            icon={<MaterialIcon name="settings" size={16} className="size-4" />}
            title={t('dashboard.boxes.setup.prilog-einrichtung')}
            action={data && <span className="text-xs text-muted-foreground">{data.completed} von {data.total}</span>}
        >
            {loading && <BoxSkeleton />}
            {!loading && data && data.completed === data.total && (
                <BoxEmpty>{t('dashboard.boxes.setup.setup_komplett')}</BoxEmpty>
            )}
            {!loading && data && data.completed < data.total && (
                <ol className="space-y-2">
                    {data.steps.map((step, idx) => (
                        <li
                            key={step.id}
                            className={cn(
                                'flex items-start gap-3 rounded p-2 transition-colors',
                                step.id === data.nextStep && 'bg-primary/5 ring-1 ring-primary/30',
                            )}
                        >
                            <span className={cn(
                                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
                                step.done ? 'bg-emerald-500 text-white' : step.skipped ? 'bg-muted text-muted-foreground' : 'border border-muted-foreground/40 text-muted-foreground',
                            )}>
                                {step.done || step.skipped ? <MaterialIcon name="check" size={16} className="size-3" /> : <MaterialIcon name="radio_button_unchecked" size={16} className="size-2 fill-current" />}
                            </span>
                            <div className="flex-1">
                                <button
                                    onClick={() => navigate(step.target)}
                                    className="text-left text-sm font-medium hover:underline"
                                >
                                    {idx + 1}. {step.label}
                                </button>
                                {!step.done && !step.skipped && (
                                    <button
                                        onClick={() => handleSkip(step.id)}
                                        className="ml-2 text-xs text-muted-foreground hover:underline"
                                    >
                                        {t('dashboard.boxes.setup.ueberspringen')}
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            )}
            {!loading && !data && <BoxEmpty>{t('dashboard.boxes.setup.status_konnte_nicht_geladen_werden')}</BoxEmpty>}
        </BoxShell>
    );
}
