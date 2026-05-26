import { type JSX, useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppHeader } from '@/components/app/app-header';
import { AppSidebar } from '@/components/app/app-sidebar';
import { MobileTopBar } from '@/components/app/mobile-top-bar';
import { sessionStore } from '@/core/session/session-store';
import { useIsMobile } from '@/core/responsive/use-is-mobile';
import { openChatDb, closeChatDb } from '@/features/chat/chat-db';
import { startSync, stopSync } from '@/features/chat/chat-sync';
import { chatStore } from '@/features/chat/chat-store';
import { ToastContainer, toast } from '@/components/ui/toast';
import { ImpersonationBanner } from '@/features/impersonation/impersonation-banner';
import { PaymentSuspensionBanner } from '@/features/payment/payment-suspension-banner';
import { SubscriptionBanner } from '@/features/subscription/subscription-banner';
import { WelcomeFreemiumModal } from '@/features/subscription/welcome-freemium-modal';
import { impersonationService } from '@/features/impersonation/impersonation-service';
import { bootstrapLoader } from '@/features/bootstrap/bootstrap-loader';
import { PanicOverlay } from '@/features/emergency/panic-button';
import { AudioGuideActionOverlay } from '@/components/audio-guide/audio-guide-action-overlay';

export const ShellLayout = (): JSX.Element => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const isMobile = useIsMobile();
    const location = useLocation();
    const navigate = useNavigate();

    // Edge-Swipe-Back: nur auf Mobile in "deep views" (Chat im Space, DM,
    // Settings). Auf der Spaces-Liste selbst gibt es nichts zum Zurueck.
    // Auf Desktop ist die Geste ohnehin irrelevant.
    //
    // Calendar/Ablaeufe/Documents sind "deep views" sobald ein view= oder
    // tag= Query-Param gesetzt ist — die Hubs zeigen ohne Param ihren
    // Mobile-Entry (sidebar-aequivalent), mit Param die eigentlichen Inhalte.
    const hubHasViewParam = (path: string) => {
        if (!location.pathname.startsWith(path)) return false;
        const sp = new URLSearchParams(location.search);
        return sp.has('view') || sp.has('tag');
    };
    const isDeepView =
        location.pathname.startsWith('/spaces/') ||
        location.pathname.startsWith('/dm/') ||
        location.pathname.startsWith('/settings') ||
        hubHasViewParam('/calendar') ||
        hubHasViewParam('/ablaeufe') ||
        hubHasViewParam('/documents') ||
        location.pathname.startsWith('/konzepte/') ||
        location.pathname.startsWith('/workflow/');

    // Letzten Space-Pfad mitschneiden, damit der "Spaces"-Welt-Button
    // dorthin zurueckspringt statt zum Dashboard. Wir merken nur Spaces-
    // Routes (inkl. Modul wie /chat, /files), nicht Dashboard/Hubs/...
    useEffect(() => {
        if (location.pathname.startsWith('/spaces/') && !location.pathname.startsWith('/spaces/new')) {
            try {
                localStorage.setItem('prilog.lastSpaceRoute', location.pathname);
            } catch { /* ignore */ }
        }
    }, [location.pathname]);

    // Phase 16: Hard-Redirect auf Rechnungsadresse nach 3-Tage-Karenz.
    // billingRequired wird im Backend-Bootstrap berechnet (admin + tenant>3d
    // + isComplete=false). Wir leiten nur weiter, wenn der User nicht schon
    // auf der Settings-Seite ist.
    const billingRequired = (session.bootstrap as { billingRequired?: boolean } | undefined)?.billingRequired === true;
    useEffect(() => {
        if (!billingRequired) return;
        if (location.pathname.startsWith('/settings/rechnungsadresse')) return;
        // Logout + Auth-Routes nicht blocken
        if (location.pathname.startsWith('/login') || location.pathname.startsWith('/auth/')) return;
        navigate('/settings/rechnungsadresse', { replace: true });
    }, [billingRequired, location.pathname, navigate]);

    // URL-basierte Impersonation: Portal oeffnet Web-Client mit Token-Parametern
    const [searchParams, setSearchParams] = useSearchParams();
    const impersonationStarted = useRef(false);
    useEffect(() => {
        const token = searchParams.get('impersonate_token');
        const logId = searchParams.get('impersonate_log');
        const targetName = searchParams.get('impersonate_name');

        if (!token || !logId || impersonationStarted.current || session.impersonation) return;
        impersonationStarted.current = true;

        // URL-Parameter sofort entfernen (Token nicht in der URL lassen)
        setSearchParams({}, { replace: true });

        // Impersonation-Session starten
        impersonationService.startFromToken(token, logId, targetName ?? 'Benutzer');
    }, [searchParams, setSearchParams, session.impersonation]);

    // Impersonation-Benachrichtigungen beim Login pruefen
    const noticesChecked = useRef(false);
    useEffect(() => {
        if (noticesChecked.current || !session.platform?.token || session.impersonation) return;
        noticesChecked.current = true;

        impersonationService.getNotices().then((notices) => {
            if (notices.length > 0) {
                const names = notices.map((n) => n.adminDisplayName).join(', ');
                const count = notices.length;
                toast.error(
                    count === 1
                        ? `Ein Administrator (${names}) hat deinen Account zu Supportzwecken eingesehen.`
                        : `${count} Administratoren (${names}) haben deinen Account zu Supportzwecken eingesehen.`,
                );
                impersonationService.markNoticesRead();
            }
        });
    }, [session.platform?.token, session.impersonation]);

    useEffect(() => {
        const userId = session.matrix?.userId;
        if (!userId) return;

        let cancelled = false;

        // Start sync immediately — don't block on IndexedDB.
        // IndexedDB open can hang indefinitely (pending deleteDatabase,
        // stale connections, version conflicts). The sync only needs the
        // Matrix access token, not the DB. We open the DB in parallel
        // with a timeout so the cache works when it can, but the chat
        // always loads regardless.
        startSync();

        (async () => {
            try {
                // Race: open DB or give up after 3 seconds
                await Promise.race([
                    openChatDb(userId),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('IndexedDB timeout')), 3000)),
                ]);
            } catch {
                console.warn('[SHELL] IndexedDB open failed/timed out, running without cache');
            }
        })();

        return () => {
            cancelled = true;
            stopSync();
            closeChatDb();
        };
    }, [session.matrix?.userId]);

    // Tab-Titel mit Total-Unread. So siehst du ungelesene Nachrichten auch
    // im Browser-Reiter, wenn Prilog im Hintergrund laeuft — wie bei Slack,
    // WhatsApp Web usw. Highlights (@-Erwaehnungen) fuegen ein "!" an.
    const chatSnapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
    const tenantName = session.bootstrap?.branding?.tenantName ?? 'prilog.team';
    useEffect(() => {
        let totalUnread = 0;
        let totalHighlight = 0;
        for (const room of chatSnapshot.rooms.values()) {
            totalUnread += room.unreadCount;
            totalHighlight += room.highlightCount;
        }
        const prefix = totalUnread > 0
            ? (totalHighlight > 0 ? `(${totalUnread}!) ` : `(${totalUnread}) `)
            : '';
        document.title = `${prefix}${tenantName}`;
    }, [chatSnapshot.rooms, tenantName]);

    // Mobile-Layout: Top-Bar mit 5 Welten + Main, keine Desktop-Sidebar.
    // Tap auf ein Welten-Icon oeffnet die Welt-Inhalte als Bottom-Sheet-Drawer.
    // In "deep views" (Chat im Space, DM, Settings) wird die Welten-Top-Bar
    // ausgeblendet — der Chat hat seinen eigenen Header mit Zurueck-Pfeil,
    // damit der Bildschirm nicht doppelt belegt ist.
    if (isMobile) {
        return (
            <TooltipProvider delayDuration={300}>
                <div
                    className="flex h-[100dvh] min-h-0 flex-col bg-background text-foreground"
                    style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
                >
                    <ImpersonationBanner />
                    <PaymentSuspensionBanner />
                    <SubscriptionBanner />
                    {!isDeepView && <MobileTopBar />}
                    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <Outlet />
                    </main>
                </div>
                <PanicOverlay />
                <AudioGuideActionOverlay />
                <WelcomeFreemiumModal />
                <ToastContainer />
            </TooltipProvider>
        );
    }

    // Desktop-Layout: wie gehabt mit Sidebar links.
    return (
        <TooltipProvider delayDuration={300}>
            <div className="flex h-screen min-h-0 bg-background text-foreground">
                <AppSidebar
                    collapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed((c) => !c)}
                />
                <main className="flex min-w-0 flex-1 flex-col">
                    <ImpersonationBanner />
                    <PaymentSuspensionBanner />
                    <SubscriptionBanner />
                    <AppHeader />
                    <div className="flex min-h-0 flex-1">
                        <div className="min-w-0 flex-1 overflow-y-auto">
                            <Outlet />
                        </div>
                    </div>
                </main>
            </div>
            <PanicOverlay />
            <AudioGuideActionOverlay />
            <WelcomeFreemiumModal />
            <ToastContainer />
        </TooltipProvider>
    );
};
