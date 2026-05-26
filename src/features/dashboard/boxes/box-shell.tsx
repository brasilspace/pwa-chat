import { type JSX, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * BoxShell — gemeinsamer Rahmen fuer alle Dashboard-Boxen.
 * Stellt Header (Icon+Titel) und Body bereit. Edit-Mode (Phase 1.8) wird
 * spaeter ueber Props (showHandle, onRemove) aktiviert.
 */
export function BoxShell({ icon, title, action, children, className }: {
    icon?: ReactNode;
    title: string;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}): JSX.Element {
    return (
        <div className={cn('rounded-lg border border-border bg-card p-4 shadow-sm', className)}>
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {icon && <span className="text-primary">{icon}</span>}
                    <h2 className="text-base font-semibold">{title}</h2>
                </div>
                {action}
            </div>
            <div className="text-sm">{children}</div>
        </div>
    );
}

export function BoxEmpty({ children }: { children: ReactNode }): JSX.Element {
    return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function BoxSkeleton(): JSX.Element {
    return (
        <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
    );
}
