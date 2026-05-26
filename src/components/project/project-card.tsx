import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { StateBadge } from '@/components/app/state-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ProjectCardData {
    id: string;
    title: string;
    status: string;
    description?: string;
    owner: string;
    lastActivity?: string;
    progress?: number;
}

interface ProjectCardProps {
    project: ProjectCardData;
    onClick?: () => void;
    className?: string;
}

export function ProjectCard({ project, onClick, className }: ProjectCardProps) {
    return (
        <Card
            className={cn(
                'group cursor-pointer bg-[var(--project-card)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--project-card-hover)]',
                className,
            )}
            onClick={onClick}
        >
            <CardContent className="pt-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold">{project.title}</h3>
                        {project.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                {project.description}
                            </p>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 shrink-0 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <MoreHorizontal className="size-4" />
                    </Button>
                </div>

                {/* Status */}
                <div className="mt-3">
                    <StateBadge status={project.status} />
                </div>

                {/* Progress */}
                {typeof project.progress === 'number' && (
                    <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--project-progress-bg)]">
                            <div
                                className="h-full rounded-full bg-[var(--project-progress-fill)] transition-[width] duration-300"
                                style={{ width: `${project.progress}%` }}
                            />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{project.progress}%</p>
                    </div>
                )}

                {/* Footer */}
                <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Avatar className="size-5">
                            <AvatarFallback className="text-[9px]">
                                {project.owner.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">{project.owner}</span>
                    </div>
                    {project.lastActivity && (
                        <span className="text-xs text-muted-foreground">{project.lastActivity}</span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
