import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
    title: string;
    actions?: ReactNode;
    className?: string;
}

export function SectionHeader({ title, actions, className }: SectionHeaderProps) {
    return (
        <div className={cn('flex items-center justify-between gap-3', className)}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
            {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
    );
}
