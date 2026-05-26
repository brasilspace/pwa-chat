/**
 * MeinFachWorld — Sidebar-Navigation fuer den Mein-Fach-Bereich.
 *
 * Drei Sektionen: Dokumente, Postfach (mit Unread-Badge), Archiv.
 * Wird im Sidebar gerendert wenn die aktuelle URL mit /mein-fach
 * beginnt. Settings-Section wurde bewusst entfernt — sie liegt jetzt
 * in den globalen Settings (z.B. Email-Alias unter
 * /settings/dms-email).
 */

import { type JSX } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Inbox, FileText, Archive } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useInboxUnread } from './use-inbox-unread';
import { useT } from "@/lib/i18n/use-t";

interface MeinFachWorldProps {
    collapsed: boolean;
}

export function MeinFachWorld({ collapsed }: MeinFachWorldProps): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const location = useLocation();
    const inboxUnread = useInboxUnread();

    const isActive = (path: string) => {
        if (path === '/mein-fach') {
            // Default-Route — auch /mein-fach (ohne Suffix) als aktiv anzeigen
            return location.pathname === '/mein-fach' || location.pathname === '/mein-fach/';
        }
        return location.pathname.startsWith(path);
    };

    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-1 py-2">
                <button onClick={() => navigate('/mein-fach')} className="rounded-md p-2 hover:bg-muted" title={t('mein-fach.mein_fach_world.dokumente')}>
                    <MaterialIcon name="description" size={16} className="size-4" />
                </button>
                <button onClick={() => navigate('/mein-fach/inbox')} className="relative rounded-md p-2 hover:bg-muted" title={t('mein-fach.mein_fach_world.postfach')}>
                    <MaterialIcon name="inbox" size={16} className="size-4" />
                    {inboxUnread > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">
                            {inboxUnread > 9 ? '9+' : inboxUnread}
                        </span>
                    )}
                </button>
                <button onClick={() => navigate('/mein-fach/archive')} className="rounded-md p-2 hover:bg-muted" title={t('mein-fach.mein_fach_world.archiv')}>
                    <MaterialIcon name="archive" size={16} className="size-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="mb-2">
            <div className="mb-1 flex items-center gap-2 px-2">
                <MaterialIcon name="folder" size={16} className="size-3.5 text-muted-foreground" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('mein-fach.mein_fach_world.mein_fach')}</p>
            </div>

            <SidebarBtn
                icon={FileText}
                label={t('mein-fach.mein_fach_world.dokumente')}
                active={isActive('/mein-fach') && !location.pathname.includes('/inbox') && !location.pathname.includes('/archive')}
                onClick={() => navigate('/mein-fach')}
            />
            <SidebarBtn
                icon={Inbox}
                label={t('mein-fach.mein_fach_world.postfach')}
                badge={inboxUnread}
                active={isActive('/mein-fach/inbox')}
                onClick={() => navigate('/mein-fach/inbox')}
            />
            <SidebarBtn
                icon={Archive}
                label={t('mein-fach.mein_fach_world.archiv')}
                active={isActive('/mein-fach/archive')}
                onClick={() => navigate('/mein-fach/archive')}
            />
        </div>
    );
}

function SidebarBtn({
    icon: Icon,
    label,
    badge,
    active,
    onClick,
}: {
    icon: typeof Inbox;
    label: string;
    badge?: number;
    active?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted',
                active && 'bg-muted font-medium',
            )}
        >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {badge !== undefined && badge > 0 && (
                <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold leading-[14px] text-white">
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
        </button>
    );
}
