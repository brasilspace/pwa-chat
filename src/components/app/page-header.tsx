import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    breadcrumb?: ReactNode;
    className?: string;
}

export function PageHeader({ title, subtitle, actions, breadcrumb, className }: PageHeaderProps) {
    return (
        <div className={cn('flex items-start justify-between gap-4', className)}>
            <div className="min-w-0 flex-1">
                {breadcrumb && <div className="mb-1 text-sm text-muted-foreground">{breadcrumb}</div>}
                <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}
