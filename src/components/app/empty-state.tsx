import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
    secondaryAction?: ReactNode;
    className?: string;
}

export function EmptyState({ icon, title, description, action, secondaryAction, className }: EmptyStateProps) {
    return (
        <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
            {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
            <h3 className="text-base font-semibold">{title}</h3>
            {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
            {secondaryAction && <div className="mt-2">{secondaryAction}</div>}
        </div>
    );
}
