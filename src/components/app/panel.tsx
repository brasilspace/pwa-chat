import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const panelVariants = cva('rounded-xl border', {
    variants: {
        tone: {
            default: 'bg-card text-card-foreground',
            soft: 'bg-[var(--app-panel-soft)] text-foreground',
            accent: 'bg-accent text-accent-foreground',
        },
        padding: {
            sm: 'p-3',
            md: 'p-[var(--panel-padding)]',
            lg: 'p-[var(--panel-padding-lg)]',
        },
        elevated: {
            true: 'bg-[var(--app-panel-elevated)] shadow-[var(--shadow-sm)]',
            false: 'shadow-none',
        },
    },
    defaultVariants: {
        tone: 'default',
        padding: 'md',
        elevated: false,
    },
});

interface PanelProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof panelVariants> {}

const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
    ({ className, tone, padding, elevated, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(panelVariants({ tone, padding, elevated }), className)}
            {...props}
        />
    ),
);
Panel.displayName = 'Panel';

export { Panel };
export type { PanelProps };
