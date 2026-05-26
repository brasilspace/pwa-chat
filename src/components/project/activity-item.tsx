import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface ActivityItemData {
    id: string;
    actor: string;
    action: string;
    target?: string;
    timestamp: string;
    icon?: React.ReactNode;
}

interface ActivityItemProps {
    item: ActivityItemData;
    className?: string;
}

export function ActivityItem({ item, className }: ActivityItemProps) {
    return (
        <div className={cn('flex gap-3 py-2.5', className)}>
            <Avatar className="mt-0.5 size-6 shrink-0">
                <AvatarFallback className="text-[9px]">
                    {item.actor.charAt(0).toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <p className="text-sm">
                    <span className="font-medium">{item.actor}</span>
                    {' '}
                    <span className="text-muted-foreground">{item.action}</span>
                    {item.target && (
                        <>
                            {' '}
                            <span className="font-medium text-primary">{item.target}</span>
                        </>
                    )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.timestamp}</p>
            </div>
        </div>
    );
}
