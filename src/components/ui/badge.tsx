import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
    {
        variants: {
            variant: {
                neutral: 'bg-secondary text-secondary-foreground',
                brand: 'bg-accent text-accent-foreground',
                success: 'bg-[var(--surface-success)] text-[var(--success-foreground)]',
                warning: 'bg-[var(--surface-warning)] text-[var(--warning-foreground)]',
                danger: 'bg-[var(--surface-danger)] text-[var(--destructive-foreground)]',
                info: 'bg-[var(--surface-info)] text-[var(--info-foreground)]',
            },
        },
        defaultVariants: {
            variant: 'neutral',
        },
    },
);

interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
export type { BadgeProps };
