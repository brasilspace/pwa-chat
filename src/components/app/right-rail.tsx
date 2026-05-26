import * as React from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RightRailProps extends React.HTMLAttributes<HTMLElement> {}

const RightRail = React.forwardRef<HTMLElement, RightRailProps>(
    ({ className, children, ...props }, ref) => (
        <aside
            ref={ref}
            className={cn(
                'hidden w-[var(--right-rail-width)] shrink-0 border-l bg-[var(--right-rail-background)] xl:block',
                className,
            )}
            {...props}
        >
            <ScrollArea className="h-full">
                <div className="p-[var(--panel-padding)]">{children}</div>
            </ScrollArea>
        </aside>
    ),
);
RightRail.displayName = 'RightRail';

export { RightRail };
