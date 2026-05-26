import { Badge, type BadgeProps } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/use-t';

type StatusGroup = 'project' | 'task' | 'risk' | 'sync';

interface StateBadgeProps extends Omit<BadgeProps, 'variant'> {
    status: string;
    group?: StatusGroup;
}

const STATUS_MAP: Record<string, BadgeProps['variant']> = {
    active: 'success',
    completed: 'success',
    done: 'success',
    in_progress: 'brand',
    running: 'brand',
    syncing: 'brand',
    pending: 'neutral',
    planned: 'neutral',
    draft: 'neutral',
    paused: 'warning',
    at_risk: 'warning',
    warning: 'warning',
    overdue: 'danger',
    blocked: 'danger',
    failed: 'danger',
    critical: 'danger',
    archived: 'neutral',
    cancelled: 'neutral',
};

const STATUS_LABEL_KEYS: Record<string, string> = {
    active: 'common.active',
    completed: 'app.misc.abgeschlossen',
    done: 'common.done',
    in_progress: 'common.in_progress',
    running: 'app.misc.laeuft',
    syncing: 'app.misc.synchronisiert',
    pending: 'app.misc.ausstehend',
    planned: 'app.misc.geplant',
    draft: 'app.misc.entwurf',
    paused: 'app.misc.pausiert',
    at_risk: 'app.misc.gefaehrdet',
    warning: 'app.misc.warnung',
    overdue: 'app.misc.ueberfaellig',
    blocked: 'app.misc.blockiert',
    failed: 'app.misc.fehlgeschlagen',
    critical: 'app.misc.kritisch',
    archived: 'app.misc.archiviert',
    cancelled: 'app.misc.abgebrochen',
};

export function StateBadge({ status, group: _group, children, ...props }: StateBadgeProps) {
    const t = useT();
    const variant = STATUS_MAP[status] ?? 'neutral';
    const labelKey = STATUS_LABEL_KEYS[status];
    const label = children ?? (labelKey ? t(labelKey) : status);

    return (
        <Badge variant={variant} {...props}>
            {label}
        </Badge>
    );
}
