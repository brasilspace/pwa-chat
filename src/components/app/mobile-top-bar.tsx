import { type JSX, useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import { attachFiveTapHandler } from '@/features/emergency/panic-button';
import { useLocation, useNavigate } from 'react-router-dom';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { ownProfileStore } from '@/core/session/own-profile-store';
import { chatStore } from '@/features/chat/chat-store';
import { useInboxUnread } from '@/features/mein-fach/use-inbox-unread';
import { useMatrixAvatar } from '@/components/ui/matrix-avatar';
import { useEnabledModules } from '@/core/permissions';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

/**
 * MobileTopBar — Kompakte Top-Navigation fuer Mobile.
 *
 * Ersetzt auf Handys die Desktop-AppSidebar. Zeigt oben eine Zeile
 * mit:
 *   - 5 Welten-Icons (Users / Spaces / Kalender / Ablaeufe / Dokumente)
 *   - Favoriten-Stern rechts
 *   - Avatar rechts (Settings/Logout via DropdownMenu)
 *
 * Tap auf ein Welten-Icon navigiert zur Default-URL dieser Welt. Da
 * auf Mobile kein Platz fuer eine staendig sichtbare Sidebar ist,
 * oeffnet sich der Welten-Inhalt (Space-Tree, Kontakt-Liste, ...)
 * als Bottom-Sheet ueber einen separaten Mechanismus. Vorerst: einfach
 * navigieren, Welt-spezifische Hubs uebernehmen die Listenansicht.
 *
 * Die Active-State-Logik entspricht der von AppSidebar (URL → Welt).
 */

// Mein Fach ist KEINE Welt — wandert in den rechten Quick-Access-Bereich
// neben Favoriten-Stern und Avatar (siehe unten).
type MobileWorld = 'users' | 'spaces' | 'my-tasks' | 'calendar' | 'dms' | 'cascades' | 'concepts';

// Reihenfolge wie in app-sidebar: Adressen, Spaces, Aufgaben, Termine, DMS, Kaskaden, Konzepte
// requiresModule koppelt das Welt-Icon an ein App-Feature-Flag.
const WORLDS: { key: MobileWorld; icon: string; labelKey: string; url: string; requiresModule?: string }[] = [
    { key: 'users', icon: 'groups', labelKey: 'app.misc.adressen', url: '/contacts' },
    { key: 'spaces', icon: 'grid_view', labelKey: 'app.misc.spaces', url: '/' },
    { key: 'my-tasks', icon: 'check_box', labelKey: 'app.misc.aufgaben', url: '/meine-aufgaben', requiresModule: 'project' },
    { key: 'calendar', icon: 'calendar_today', labelKey: 'common.appointments', url: '/calendar', requiresModule: 'calendar' },
    { key: 'dms', icon: 'folder_open', labelKey: 'app.misc.dms', url: '/dms', requiresModule: 'personal-fach' },
    { key: 'cascades', icon: 'schema', labelKey: 'app.misc.flow_designer', url: '/kaskaden', requiresModule: 'cascade' },
    { key: 'concepts', icon: 'menu_book', labelKey: 'app.misc.konzepte', url: '/konzepte', requiresModule: 'concept-framework' },
];

function getActiveWorldFromPath(path: string): MobileWorld | 'favorites' | null {
    if (path.startsWith('/favorites')) return 'favorites';
    if (path.startsWith('/sheets')) return 'dms';
    if (path.startsWith('/dms')) return 'dms';
    if (path.startsWith('/spaces/')) return 'spaces';
    if (path.startsWith('/dm/') || path.startsWith('/contacts')) return 'users';
    if (path.startsWith('/meine-aufgaben')) return 'my-tasks';
    if (path.startsWith('/calendar')) return 'calendar';
    if (path.startsWith('/kaskaden')) return 'cascades';
    if (path.startsWith('/ablaeufe')) return 'cascades';
    if (path.startsWith('/konzepte') || path.startsWith('/workflow/')) return 'concepts';
    return 'spaces';
}

export function MobileTopBar(): JSX.Element {
    const t = useT();
    const location = useLocation();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const ownProfile = useSyncExternalStore(ownProfileStore.subscribe, ownProfileStore.getSnapshot);
    const ownAvatarUrl = useMatrixAvatar(ownProfile.avatarMxc, session.matrix?.accessToken);
    const chatSnapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
    const enabledModules = useEnabledModules();
    const active = getActiveWorldFromPath(location.pathname);
    const onFavorites = active === 'favorites';
    const onMeinFach = location.pathname.startsWith('/mein-fach');

    // Welten filtern nach Modul-Aktivierung (siehe app-sidebar fuer dieselbe Logik)
    const visibleWorlds = WORLDS.filter(w => !w.requiresModule || enabledModules.has(w.requiresModule as any));

    // Gesamt-Unread fuer den Spaces-Icon-Badge (Quick-Hint wieviel unten haengt)
    let totalUnread = 0;
    for (const room of chatSnapshot.rooms.values()) totalUnread += room.unreadCount;
    const inboxUnread = useInboxUnread();

    const fullName = ownProfile.displayName ?? session.bootstrap?.user.displayName ?? '';
    const initials = fullName
        ? fullName.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
        : '?';

    const handleWorldClick = useCallback((world: typeof WORLDS[number]) => {
        // Sonderfall Spaces:
        //   1) im Space → bleiben
        //   2) sonst zum letzten Space (gepflegt vom ShellLayout in
        //      localStorage.prilog.lastSpaceRoute), nicht zum Dashboard
        if (world.key === 'spaces') {
            if (location.pathname.startsWith('/spaces/')) return;
            try {
                const last = localStorage.getItem('prilog.lastSpaceRoute');
                if (last && last.startsWith('/spaces/')) {
                    navigate(last);
                    return;
                }
            } catch { /* ignore */ }
        }
        navigate(world.url);
    }, [location.pathname, navigate]);

    // Notfall-Auslöser auf Mobile: 5x-Tap auf die Top-Bar innerhalb von 2 Sek.
    // Nur wenn die Krisenmanagement-App aktiv ist.
    const topBarRef = useRef<HTMLElement>(null);
    const crisisAppEnabled = enabledModules.has('crisis-management');
    useEffect(() => {
        if (!crisisAppEnabled) return;
        return attachFiveTapHandler(topBarRef.current);
    }, [crisisAppEnabled]);

    return (
        <header ref={topBarRef} className="shrink-0 border-b border-border bg-sidebar-background">
            <div className="flex h-14 items-center gap-1 px-2">
                {/* Welten-Icons — gleichmaessig verteilt */}
                <div className="flex flex-1 items-center justify-around">
                    {visibleWorlds.map((world) => {
                        const isActive = active === world.key;
                        const showSpacesBadge = world.key === 'spaces' && totalUnread > 0;
                        return (
                            <button
                                key={world.key}
                                type="button"
                                onClick={() => handleWorldClick(world)}
                                aria-label={t(world.labelKey)}
                                className={cn(
                                    'relative flex size-11 items-center justify-center rounded-lg transition-colors',
                                    isActive
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground active:bg-muted',
                                )}
                            >
                                <MaterialIcon name={world.icon} size={22} />
                                {showSpacesBadge && (
                                    <span className="absolute right-1 top-1 size-2 rounded-full bg-emerald-500" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Trennlinie */}
                <div className="mx-1 h-6 w-px bg-border" />

                {/* Favoriten-Stern */}
                <button
                    type="button"
                    onClick={() => navigate('/favorites')}
                    aria-label={t('app.misc.favoriten')}
                    className={cn(
                        'flex size-11 items-center justify-center rounded-lg transition-colors',
                        onFavorites
                            ? 'text-amber-500'
                            : 'text-muted-foreground active:bg-muted',
                    )}
                >
                    <MaterialIcon name="star" size={22} fill={onFavorites ? 1 : 0} />
                </button>

                {/* Mein Fach — User-eigenes Konstrukt, daher hier neben Favoriten + Avatar */}
                <button
                    type="button"
                    onClick={() => navigate('/mein-fach')}
                    aria-label={inboxUnread > 0 ? `Mein Fach (${inboxUnread} neu)` : 'Mein Fach'}
                    className={cn(
                        'relative flex size-11 items-center justify-center rounded-lg transition-colors',
                        onMeinFach
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground active:bg-muted',
                    )}
                >
                    <MaterialIcon name="inbox" size={22} />
                    {inboxUnread > 0 && (
                        <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white tabular-nums">
                            {inboxUnread > 9 ? '9+' : inboxUnread}
                        </span>
                    )}
                </button>

                {/* Einstellungen — explizites Zahnrad, weil das Avatar-Icon
                    nicht klar als Settings-Eintrag erkennbar war (Audit-Befund
                    von Lee 2026-05-10). Avatar bleibt auch tappable als
                    Fallback fuer Slack-/WhatsApp-Gewohnte. */}
                <button
                    type="button"
                    onClick={() => navigate('/settings')}
                    aria-label={t('app.misc.einstellungen')}
                    className={cn(
                        'flex size-11 items-center justify-center rounded-lg transition-colors',
                        location.pathname.startsWith('/settings')
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground active:bg-muted',
                    )}
                >
                    <MaterialIcon name="settings" size={22} />
                </button>

                {/* Avatar → Settings (Fallback, gleiche Aktion wie Zahnrad) */}
                <button
                    type="button"
                    onClick={() => navigate('/settings')}
                    aria-label={t('app.misc.mein_profil_und_einstellungen')}
                    className="flex size-11 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary"
                >
                    {ownAvatarUrl ? (
                        <img src={ownAvatarUrl} alt={fullName || initials} className="size-full object-cover" />
                    ) : (
                        initials
                    )}
                </button>
            </div>
        </header>
    );
}
