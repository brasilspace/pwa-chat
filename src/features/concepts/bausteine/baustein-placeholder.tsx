/**
 * BausteinPlaceholder — Platzhalter fuer noch nicht implementierte Bausteine
 *
 * Zeigt den Baustein-Namen, Beschreibung und vorhandene Ressourcen-Links.
 */

import { BookOpen, ExternalLink, Kanban, Calendar, GitBranch, MessageCircle, FolderOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useT } from "@/lib/i18n/use-t";

interface BausteinPlaceholderProps {
    label: string;
    description?: string;
    boardId?: string | null;
    calendarLayerId?: string | null;
    workflowTemplateId?: string | null;
    matrixRoomId?: string | null;
    dmsFolderId?: string | null;
}

export function BausteinPlaceholder({
    label, description, boardId, calendarLayerId, workflowTemplateId, matrixRoomId, dmsFolderId,
}: BausteinPlaceholderProps) {
    const t = useT();
    const navigate = useNavigate();

    const resources = [
        boardId && { icon: Kanban, label: 'Kanban-Board', action: () => { } },
        calendarLayerId && { icon: Calendar, label: 'Kalender-Layer', action: () => navigate('/calendar') },
        workflowTemplateId && { icon: GitBranch, label: 'Workflow bearbeiten', action: () => navigate(`/workflow/${workflowTemplateId}`) },
        matrixRoomId && { icon: MessageCircle, label: 'Matrix-Raum', action: () => { } },
        dmsFolderId && { icon: FolderOpen, label: 'DMS-Ordner', action: () => navigate('/documents') },
    ].filter(Boolean) as Array<{ icon: typeof BookOpen; label: string; action: () => void }>;

    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]">
                <BookOpen size={28} className="text-[var(--muted-foreground)]" />
            </div>

            <div>
                <h3 className="text-base font-medium text-[var(--foreground)]">{label}</h3>
                {description && (
                    <p className="mt-1 max-w-md text-sm text-[var(--muted-foreground)]">{description}</p>
                )}
            </div>

            {resources.length > 0 && (
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {resources.map((res, idx) => {
                        const Icon = res.icon;
                        return (
                            <button
                                key={idx}
                                onClick={res.action}
                                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
                            >
                                <Icon size={14} />
                                {res.label}
                                <ExternalLink size={12} className="text-[var(--muted-foreground)]" />
                            </button>
                        );
                    })}
                </div>
            )}

            <p className="mt-4 text-xs text-[var(--muted-foreground)]">
                {t('concepts.bausteine.baustein_placeholder.dieser_baustein_wird_in_einer_zukuenftig')}
            </p>
        </div>
    );
}
