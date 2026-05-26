import { type JSX } from 'react';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { useActivity } from '@/features/project/use-activity';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const CONTENT_TYPE_CONFIG: Record<string, { icon: string; color: string; verb: string }> = {
    'file.uploaded': { icon: 'description', color: 'text-sky-500', verb: 'hat hochgeladen' },
    'file.deleted': { icon: 'delete', color: 'text-red-400', verb: 'hat geloescht' },
    'file.restored': { icon: 'restart_alt', color: 'text-emerald-500', verb: 'hat wiederhergestellt' },
    'file.moved': { icon: 'arrow_forward', color: 'text-purple-400', verb: 'hat verschoben' },
    'file.version_uploaded': { icon: 'description', color: 'text-sky-400', verb: 'neue Version' },
    'file.version_restored': { icon: 'restart_alt', color: 'text-emerald-400', verb: 'Version zurueckgesetzt' },
    'board.created': { icon: 'grid_view', color: 'text-indigo-500', verb: 'Board erstellt' },
    'board.deleted': { icon: 'delete', color: 'text-red-400', verb: 'Board geloescht' },
    'task.created': { icon: 'check_box', color: 'text-blue-500', verb: 'hat erstellt' },
    'task.assigned': { icon: 'person_add', color: 'text-emerald-500', verb: 'wurde zugewiesen' },
    'task.status_changed': { icon: 'arrow_forward', color: 'text-amber-500', verb: 'Status geaendert' },
    'task.moved': { icon: 'arrow_forward', color: 'text-purple-500', verb: 'wurde verschoben' },
    'task.deleted': { icon: 'delete', color: 'text-red-400', verb: 'hat in Papierkorb verschoben' },
    'task.restored': { icon: 'restore', color: 'text-emerald-500', verb: 'aus Papierkorb wiederhergestellt' },
    'task.purged': { icon: 'delete_forever', color: 'text-red-600', verb: 'endgueltig geloescht' },
    'task.parked': { icon: 'anchor', color: 'text-slate-500', verb: 'vertagt' },
    'task.revived': { icon: 'autorenew', color: 'text-blue-500', verb: 'wiederbelebt' },
};

function formatRelativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `vor ${days}d`;
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export function ActivityPanel({ space }: { space: SpaceItem }): JSX.Element {
    const t = useT();
    const { entries, loading, hasMore, loadMore } = useActivity(space.id);

    if (loading && entries.length === 0) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }

    if (entries.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center p-6 text-xs text-muted-foreground">
                <MaterialIcon name="monitor_heart" size={32} className="mb-2 opacity-30" />
                <p>{t('spaces.panels.activity.noch_keine_aktivitaeten')}</p>
            </div>
        );
    }

    return (
        <ScrollArea className="flex-1">
            <div className="p-2">
                {entries.map(entry => {
                    const config = CONTENT_TYPE_CONFIG[entry.contentType] ?? { icon: 'monitor_heart', color: 'text-muted-foreground', verb: entry.contentType };
                    return (
                        <div key={entry.id} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted">
                            <MaterialIcon name={config.icon} size={16} className={cn('mt-0.5 shrink-0', config.color)} />
                            <div className="min-w-0 flex-1">
                                <div className="text-xs">
                                    <span className="font-medium">{entry.actorName ?? entry.actorId.split(':')[0].replace('@', '')}</span>
                                    {' '}<span className="text-muted-foreground">{config.verb}</span>
                                </div>
                                <div className="mt-0.5 text-xs text-foreground">{entry.title}</div>
                                <div className="mt-0.5 text-[10px] text-muted-foreground">{formatRelativeTime(entry.occurredAt)}</div>
                            </div>
                        </div>
                    );
                })}

                {hasMore && (
                    <button
                        onClick={loadMore}
                        className="mt-2 w-full rounded-lg py-2 text-center text-xs text-muted-foreground transition-colors hover:bg-muted"
                    >
                        {t('spaces.panels.activity.mehr_laden')}
                    </button>
                )}
            </div>
        </ScrollArea>
    );
}
