import { cn } from '@/lib/utils';
import { StateBadge } from '@/components/app/state-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ProjectRowData {
    id: string;
    title: string;
    status: string;
    owner: string;
    dueDate?: string;
    progress?: number;
}

interface ProjectListRowProps {
    project: ProjectRowData;
    selected?: boolean;
    onClick?: () => void;
    className?: string;
}

export function ProjectListRow({ project, selected, onClick, className }: ProjectListRowProps) {
    return (
        <div
            className={cn(
                'group flex cursor-pointer items-center gap-4 border-b px-4 transition-colors duration-[var(--dur-fast)]',
                'h-[var(--row-height-table)]',
                selected
                    ? 'bg-[var(--project-row-selected)]'
                    : 'hover:bg-[var(--project-row-hover)]',
                className,
            )}
            onClick={onClick}
        >
            {/* Title */}
            <div className="min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{project.title}</span>
            </div>

            {/* Status */}
            <div className="w-24 shrink-0">
                <StateBadge status={project.status} />
            </div>

            {/* Owner */}
            <div className="flex w-32 shrink-0 items-center gap-2">
                <Avatar className="size-5">
                    <AvatarFallback className="text-[9px]">
                        {project.owner.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm text-muted-foreground">{project.owner}</span>
            </div>

            {/* Due Date */}
            <div className="w-24 shrink-0 text-sm text-muted-foreground">
                {project.dueDate ?? '—'}
            </div>

            {/* Progress */}
            <div className="w-16 shrink-0">
                {typeof project.progress === 'number' ? (
                    <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--project-progress-bg)]">
                            <div
                                className="h-full rounded-full bg-[var(--project-progress-fill)]"
                                style={{ width: `${project.progress}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                )}
            </div>

            {/* Actions */}
            <Button
                variant="ghost"
                size="sm"
                className="size-7 shrink-0 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
            >
                <MoreHorizontal className="size-4" />
            </Button>
        </div>
    );
}
