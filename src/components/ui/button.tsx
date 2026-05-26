import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                primary: 'bg-primary text-primary-foreground hover:opacity-95',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
                outline: 'border bg-background hover:bg-muted',
                ghost: 'hover:bg-muted',
                subtle: 'bg-muted text-foreground hover:bg-secondary',
                destructive: 'bg-destructive text-destructive-foreground hover:opacity-95',
                link: 'text-primary underline-offset-4 hover:underline',
            },
            size: {
                sm: 'h-8 px-3',
                md: 'h-10 px-4',
                lg: 'h-11 px-5',
                icon: 'size-10',
            },
        },
        defaultVariants: {
            variant: 'secondary',
            size: 'md',
        },
    },
);

interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
export type { ButtonProps };
