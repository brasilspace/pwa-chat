import { type JSX, useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { chatSettings } from '@/core/settings/chat-settings';
import { chatStore } from '@/features/chat/chat-store';
import { useSpaces } from '@/features/spaces/use-spaces';
import { useChatRoom } from '@/features/chat/use-chat-room';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { ChatThreadPanel } from '@/components/chat/chat-thread-panel';
import { SpaceSidePanel } from '@/features/spaces/space-side-panel';
import { ResizablePanels, type ResizablePanelsHandle } from '@/components/ui/resizable-panels';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { PostCard } from '@/features/messenger/post-card';
import { useMarkRoomAsRead } from '@/features/chat/use-mark-room-as-read';
import { useSwipeRightToBack } from '@/core/responsive/use-swipe-right-to-back';
import { useIsMobile } from '@/core/responsive/use-is-mobile';
import { cn } from '@/lib/utils';
import { lazy, Suspense } from 'react';
import { env } from '@/core/config/env';

const CollabEditor = lazy(() => import('@/features/cascade/collab-editor').then(m => ({ default: m.CollabEditor })));
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const projectGateway = createProjectGateway();
const platformGateway = createPlatformGateway();

function formatDate(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Heute';
    if (d.toDateString() === yesterday.toDateString()) return 'Gestern';
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

function groupByDate<T extends { timestamp: number }>(messages: T[]): [string, T[]][] {
    const groups = new Map<string, T[]>();
    for (const msg of messages) {
        const key = formatDate(msg.timestamp);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(msg);
    }
    return Array.from(groups.entries());
}

export const ChatModule = ({ compact }: { compact?: boolean } = {}): JSX.Element => {
    const t = useT();
    const { spaceId } = useParams<{ spaceId: string }>();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const { spaces } = useSpaces();
    // Ref auf die ResizablePanels — damit der "Info-Panel oeffnen"-Pfeil
    // im Chat-Header das mobile Snap-Container imperativ scrollen kann.
    const panelsRef = useRef<ResizablePanelsHandle>(null);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const myUserId = session.matrix?.userId;

    const space = spaces.find((s) => s.id === spaceId);
    const matrixRoomId = space?.matrixChatRoomId ?? space?.matrixRoomId ?? undefined;
    const isChatDisabled = space?.mode === 'DISABLED';
    const isInfotafel = space?.mode === 'INFOTAFEL';
    const canBroadcast = session.permissions?.canBroadcast ?? false;
    const canSendInThisSpace = !isInfotafel || canBroadcast;
    const reactionsAllowed = !isInfotafel || (space?.allowReactions ?? true);

    // Gemeinsamer Text: in Spaces mit >1 Mitglied, die KEINE Schueler/Eltern enthalten
    const NON_STAFF_KEYS = ['schueler_in', 'elternteil', 'minor', 'guardian'];
    const hasNonStaff = space?.userTypes?.some(_t => NON_STAFF_KEYS.includes(_t.key)) ?? false;
    const canCollabText = !hasNonStaff && (space?.memberCount ?? 0) > 1;
    const [collabDocId, setCollabDocId] = useState<string | null>(null);

    const {
        messages,
        typingUsers,
        members,
        hasMore,
        loadingOlder,
        loadOlder,
        sendMessage,
        sendFile,
        sendReaction,
        sendTyping,
        reactions,
    } = useChatRoom(matrixRoomId);

    const scrollRef = useRef<HTMLDivElement>(null);
    const isAtBottom = useRef(true);
    const prevMsgCount = useRef(0);

    // Filter: only show main timeline (no thread replies, no transcript-replies
    // — die werden direkt in die Audio-Bubble gehaengt, nicht als eigenes Item).
    const mainMessages = useMemo(
        () => messages.filter(m => !m.threadId && !m.isTranscriptReply),
        [messages],
    );

    // Mark-as-read: shared hook mit Throttle, sendet m.fully_read + m.read
    // an Synapse und optional die Prilog-Infotafel-Lese-Stats. Muss VOR den
    // Effects deklariert sein, weil der scroll-to-bottom-Effect ihn aufruft.
    const markReadIfBottom = useMarkRoomAsRead({
        roomId: matrixRoomId,
        messages: mainMessages,
        scrollRef,
        spaceId,
    });

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (mainMessages.length > prevMsgCount.current) {
            const wasInitialLoad = prevMsgCount.current === 0;
            if (wasInitialLoad || isAtBottom.current) {
                requestAnimationFrame(() => {
                    el.scrollTop = el.scrollHeight;
                    // Nach dem Scroll sind wir garantiert am Ende — jetzt
                    // mark-read ausloesen. Mit force=true, damit die Hook
                    // nicht auf die Pixel-Position schaut (die je nach
                    // Render-Timing noch nicht aktualisiert sein koennte).
                    isAtBottom.current = true;
                    markReadIfBottom(true);
                });
            }
        }
        prevMsgCount.current = mainMessages.length;
    }, [mainMessages.length, markReadIfBottom]);

    useEffect(() => { prevMsgCount.current = 0; }, [matrixRoomId]);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        markReadIfBottom();
    }, [markReadIfBottom]);

    // Read-Stats Polling fuer Sender (nur wenn Infotafel + showReadStats + canBroadcast).
    // Wir fragen alle 30s die Stats fuer den Zeitpunkt der zuletzt gesendeten
    // eigenen Nachricht ab. So zeigen wir: "12 von 23 (52%) gelesen".
    const [readStats, setReadStats] = useState<{ readCount: number; totalMembers: number; percentage: number; sinceTs: number } | null>(null);
    const showReadStatsUI = isInfotafel && (space?.showReadStats ?? false) && canBroadcast;
    useEffect(() => {
        if (!showReadStatsUI || !spaceId) {
            setReadStats(null);
            return;
        }
        // Letzte eigene Nachricht finden
        const myLast = [...mainMessages].reverse().find((m) => m.sender === myUserId);
        if (!myLast) {
            setReadStats(null);
            return;
        }
        const sinceTs = myLast.timestamp;
        let cancelled = false;
        const fetchStats = async () => {
            const jwt = sessionStore.getSnapshot().platform?.token;
            if (!jwt) return;
            try {
                const stats = await platformGateway.getSpaceReadStats(jwt, spaceId, sinceTs);
                if (!cancelled) setReadStats({ ...stats, sinceTs });
            } catch {
                /* ignore */
            }
        };
        fetchStats();
        const id = window.setInterval(fetchStats, 30_000);
        return () => { cancelled = true; window.clearInterval(id); };
    }, [showReadStatsUI, spaceId, mainMessages, myUserId]);

    const activeTyping = typingUsers.filter((u) => u !== myUserId);
    const typingNames = activeTyping.map((u) => members.get(u)?.displayName ?? u.split(':')[0].replace('@', ''));
    const typingText = typingNames.length === 1
        ? `${typingNames[0]} schreibt...`
        : typingNames.length > 1
            ? `${typingNames.join(', ')} schreiben...`
            : null;

    const dateGroups = useMemo(() => groupByDate(mainMessages), [mainMessages]);

    // Task-Status pro Event-ID: Bubble-Border in Spaltenfarbe wenn aus
    // dieser Nachricht eine Aufgabe entstanden ist. Refresh wenn sich
    // Task-Status aendert (workflowEvent task-changed).
    const [taskStatusByEvent, setTaskStatusByEvent] = useState<Map<string, 'todo' | 'in_progress' | 'review' | 'done'>>(new Map());
    const [taskResponsibleByEvent, setTaskResponsibleByEvent] = useState<Map<string, string>>(new Map());
    const fetchTaskStatuses = useCallback(async () => {
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt || !spaceId || mainMessages.length === 0) return;
        const eventIds = mainMessages.map(m => m.eventId).filter(Boolean);
        if (eventIds.length === 0) return;
        try {
            const res = await projectGateway.getItemsByEvents(jwt, spaceId, eventIds);
            const nextStatus = new Map<string, 'todo' | 'in_progress' | 'review' | 'done'>();
            const nextResp = new Map<string, string>();
            for (const [evId, info] of Object.entries(res.items)) {
                if (info.status === 'todo' || info.status === 'in_progress' || info.status === 'review' || info.status === 'done') {
                    nextStatus.set(evId, info.status);
                }
                if (info.responsibleUserId) {
                    nextResp.set(evId, info.responsibleUserId);
                }
            }
            setTaskStatusByEvent(nextStatus);
            setTaskResponsibleByEvent(nextResp);
        } catch { /* ignore */ }
    }, [spaceId, mainMessages]);
    useEffect(() => { fetchTaskStatuses(); }, [fetchTaskStatuses]);
    useWorkflowEvents((evt, data) => {
        if (evt === 'task.changed' && (data as { spaceId?: string }).spaceId === spaceId) fetchTaskStatuses();
    });

    const { design: chatDesign, background: chatBg } = useSyncExternalStore(chatSettings.subscribe, chatSettings.get);
    const [panelOpen, setPanelOpen] = useState(true);
    const [panelFullscreen, setPanelFullscreen] = useState(false);
    const [panelTab, setPanelTabRaw] = useState<string | undefined>(() => {
        try { return localStorage.getItem('prilog.sidePanelTab') ?? undefined; } catch { return undefined; }
    });
    const setPanelTab = useCallback((tab: string | undefined) => {
        setPanelTabRaw(tab);
        try { if (tab) localStorage.setItem('prilog.sidePanelTab', tab); } catch { /* ignore */ }
    }, []);
    const [activeThread, setActiveThread] = useState<string | null>(null);

    const handleCreateTask = useCallback(async (body: string, eventId: string) => {
        const jwt = session.platform?.token;
        if (!jwt || !spaceId) return;
        try {
            await projectGateway.createItemFromMessage(jwt, spaceId, {
                title: body.slice(0, 200),
                body,
                sourceMatrixEventId: eventId,
            });
            // Map sofort lokal updaten, sodass die Bubble-Border ohne
            // Roundtrip in Spalten-Farbe (todo = rot) erscheint.
            setTaskStatusByEvent(prev => {
                const next = new Map(prev);
                next.set(eventId, 'todo');
                return next;
            });
        } catch { /* silently fail if no board */ }
    }, [session.platform?.token, spaceId]);

    const handleReply = useCallback((eventId: string) => {
        setActiveThread(eventId);
        setPanelOpen(true);
    }, []);

    const handleOpenThread = useCallback((eventId: string) => {
        setActiveThread(eventId);
        setPanelOpen(true);
    }, []);

    const handleCloseThread = useCallback(() => {
        setActiveThread(null);
    }, []);

    // Posts fuer Messenger-Modus (compact): Briefe/Umfragen als Karten im Chat
    const [compactPosts, setCompactPosts] = useState<any[]>([]);
    useEffect(() => {
        if (!compact || !spaceId || !session.platform?.token) return;
        const jwt = session.platform.token;
        fetch(`/api/platform/v1/spaces/${spaceId}/posts`, { headers: { Authorization: `Bearer ${jwt}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.posts) setCompactPosts(d.posts); })
            .catch(() => { });
    }, [compact, spaceId, session.platform?.token]);
    const refreshPosts = useCallback(() => {
        if (!compact || !spaceId || !session.platform?.token) return;
        fetch(`/api/platform/v1/spaces/${spaceId}/posts`, { headers: { Authorization: `Bearer ${session.platform.token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.posts) setCompactPosts(d.posts); })
            .catch(() => { });
    }, [compact, spaceId, session.platform?.token]);

    // Swipe-Right-to-Back: auf Mobile soll der User irgendwo im Chat-Panel
    // nach rechts wischen koennen, um zur Spaces-Liste zurueckzukehren — der
    // Snap-Container kann nicht weiter nach links snappen (chat ist linker
    // Snap-Punkt), daher feuert der Handler ohne visuellen Konflikt.
    const swipeBackHandlers = useSwipeRightToBack(isMobile, () => navigate('/'));

    if (!matrixRoomId) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('modules.chat_module.dieser_space_hat_noch_keinen_matrix-raum')}
            </div>
        );
    }

    // Chat deaktiviert → nur das Info-Panel anzeigen (volle Breite)
    if (isChatDisabled && space) {
        return (
            <SpaceSidePanel
                space={space}
                activeTab={panelTab}
                onTabChange={setPanelTab}
            />
        );
    }

    const chatPanel = (
        <div className="flex h-full flex-col" {...swipeBackHandlers}>
            {/* Header */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-2 md:gap-3 md:px-4">
                {/* Breadcrumb-Pattern (Mobile only): "Spaces > Space-Name".
                    Spaces-Icon ist tap-bar (fuehrt zurueck zur Spaces-Liste),
                    der Chevron danach ist rein dekorativ als visueller
                    Breadcrumb-Separator. Kein Hintergrund mehr — der Anker
                    soll subtil sein, kein Knall im Header. */}
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    aria-label={t('modules.chat_module.zurueck_zu_den_spaces')}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors active:bg-muted md:hidden"
                >
                    <MaterialIcon name="grid_view" size={20} />
                </button>
                <MaterialIcon name="chevron_right" size={16} className="shrink-0 text-muted-foreground/60 md:hidden" aria-hidden />
                {/* Space-Name — nur auf Mobile als Header-Titel.
                    Auf Desktop ist der Name schon im app-header sichtbar. */}
                {space && (
                    <span className="truncate text-sm font-semibold md:hidden">
                        {space.name}
                    </span>
                )}
                {isInfotafel && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                        <MaterialIcon name="campaign" size={14} />
                        {t('modules.chat_module.infotafel')}
                    </span>
                )}
                <span className="flex-1 text-xs text-muted-foreground">
                    <span className="hidden md:inline">{messages.length} {t('modules.chat_module.nachrichten')}</span>
                    {showReadStatsUI && readStats && (
                        <span className="ml-2 text-muted-foreground">
                            {t('modules.chat_module.letzte_mitteilung')} <strong className="text-foreground">{readStats.readCount}/{readStats.totalMembers}</strong> {t('modules.chat_module.gelesen')}{readStats.percentage}%)
                        </span>
                    )}
                </span>
                {/* Mobile: Pfeil nach rechts → oeffnet das Info-Panel.
                    Tap scrollt programmatisch zum naechsten Snap-Point.
                    Discoverability fuer Nutzer, die nicht wissen dass es
                    ueberhaupt ein Info-Panel gibt. */}
                <button
                    type="button"
                    onClick={() => panelsRef.current?.showInfoPanel()}
                    aria-label={t('modules.chat_module.info-panel_oeffnen')}
                    className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors active:bg-muted md:hidden"
                >
                    <MaterialIcon name="chevron_right" size={20} />
                </button>
                {/* Panel-Toggle: nur auf Desktop sichtbar. Auf Mobile wischt
                    der User zwischen den zwei Panels via Scroll-Snap, ein
                    expliziter Toggle waere redundant. */}
                <button
                    onClick={() => { setPanelOpen(o => !o); setPanelFullscreen(false); setActiveThread(null); }}
                    className="hidden size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
                    title={panelOpen ? 'Panel ausblenden' : 'Panel anzeigen'}
                >
                    <MaterialIcon name={panelOpen ? "right_panel_close" : "right_panel_open"} size={18} />
                </button>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className={cn(
                    'min-h-0 flex-1 overflow-y-auto touch-pan-y',
                    !chatBg && chatDesign === 'whatsapp' && 'bg-[#e5ddd5] dark:bg-[#0b141a]',
                )}
                // touch-action: pan-y → der Browser handhabt hier nur vertikales
                // Pannen, horizontale Wisch-Gestern propagieren zum Snap-Container
                // hoch (sonst kann der User nicht von Chat zum Info-Panel wischen)
                style={{ overscrollBehavior: 'contain', ...(chatBg ? { backgroundColor: chatBg } : {}) }}
            >
                <div className="py-4">
                    {mainMessages.length === 0 && (
                        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                            {t('modules.chat_module.noch_keine_nachrichten_in_diesem_space')}
                        </div>
                    )}

                    {dateGroups.map(([date, msgs]) => (
                        <div key={date}>
                            <div className="flex items-center gap-3 px-4 py-3">
                                <div className="h-px flex-1 bg-border" />
                                <span className="shrink-0 text-xs font-medium text-muted-foreground">{date}</span>
                                <div className="h-px flex-1 bg-border" />
                            </div>
                            {msgs.map((msg) => (
                                <ChatBubble
                                    key={msg.eventId}
                                    msg={msg}
                                    isSelf={msg.sender === myUserId}
                                    displayName={members.get(msg.sender)?.displayName ?? msg.sender.split(':')[0].replace('@', '')}
                                    avatarMxc={members.get(msg.sender)?.avatarMxc ?? null}
                                    onCreateTask={canSendInThisSpace ? handleCreateTask : undefined}
                                    onReply={canSendInThisSpace ? handleReply : undefined}
                                    onReact={reactionsAllowed ? sendReaction : undefined}
                                    reactions={reactions.get(msg.eventId)}
                                    threadCount={chatStore.getThreadCount(matrixRoomId, msg.eventId)}
                                    onOpenThread={handleOpenThread}
                                    taskStatus={taskStatusByEvent.get(msg.eventId)}
                                    taskResponsibleLabel={(() => {
                                        const respId = taskResponsibleByEvent.get(msg.eventId);
                                        if (!respId) return undefined;
                                        return members.get(respId)?.displayName ?? respId.split(':')[0].replace('@', '');
                                    })()}
                                    contextSpaceId={spaceId}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Typing indicator */}
            {typingText && (
                <div className="border-t px-4 py-1.5">
                    <span className="text-xs text-muted-foreground italic">{typingText}</span>
                </div>
            )}

            {/* Composer oder Infotafel-Hinweis */}
            {canSendInThisSpace ? (
                <ChatComposer
                    roomId={matrixRoomId ?? undefined}
                    onSend={sendMessage}
                    onSendFile={(file) => sendFile(file, spaceId)}
                    onTyping={sendTyping}
                    onCollabText={canCollabText ? async () => {
                        if (!session.platform?.token || !spaceId) return;
                        const jwt = session.platform.token;
                        const res = await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${spaceId}/collab-doc`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({}),
                        });
                        console.log('[CollabText] Response status:', res.status);
                        if (res.ok) {
                            const data = await res.json();
                            console.log('[CollabText] Response data:', data);
                            if (data?.doc?.id) { setCollabDocId(data.doc.id); setPanelOpen(true); }
                        } else {
                            console.error('[CollabText] Error:', res.status, await res.text());
                        }
                    } : undefined}
                    placeholder={isInfotafel ? 'Mitteilung an alle Mitglieder...' : undefined}
                />
            ) : (
                <div className="border-t bg-muted/30 px-4 py-3 text-center">
                    <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                        <MaterialIcon name="campaign" size={16} className="shrink-0" />
                        <span>{t('modules.chat_module.infotafel_nur_mitarbeiter_koennen_schrei')}{reactionsAllowed ? ' und mit Reaktionen bestaetigen' : ''}.</span>
                    </div>
                </div>
            )}
        </div>
    );

    // Messenger-Modus: nur Chat + PostCards, kein SidePanel
    if (compact) {
        // Unbeantwortete Posts als Karten oben anzeigen
        const openPosts = compactPosts.filter(p => !p.myResponseExists && !p.closed && p.responseType !== 'none');

        return (
            <div className="flex h-full flex-col">
                {/* Offene Briefe/Umfragen als Karten */}
                {openPosts.length > 0 && (
                    <div className="shrink-0 max-h-[40%] overflow-y-auto border-b bg-primary/[0.02]">
                        {openPosts.map(post => (
                            <PostCard key={post.id} post={post} spaceId={spaceId!} onRefresh={refreshPosts} />
                        ))}
                    </div>
                )}
                {/* Chat */}
                <div className="flex-1 min-h-0">{chatPanel}</div>
            </div>
        );
    }

    if (panelFullscreen && space) {
        return (
            <SpaceSidePanel
                space={space}
                fullscreen
                onToggleFullscreen={() => setPanelFullscreen(false)}
                activeTab={panelTab}
                onTabChange={setPanelTab}
            />
        );
    }

    // Right panel: collab panel, thread panel, or space info
    const rightPanel = collabDocId && session.platform?.token && spaceId ? (
        <Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-muted-foreground">{t('modules.chat_module.lade_editor')}</div>}>
            <CollabEditor
                jwt={session.platform.token}
                userId={session.matrix?.userId ?? 'unknown'}
                displayName={session.bootstrap?.user?.displayName ?? session.matrix?.userId ?? 'Unbekannt'}
                spaceId={spaceId}
                initialDocId={collabDocId}
                onClose={() => setCollabDocId(null)}
            />
        </Suspense>
    ) : activeThread && matrixRoomId ? (
        <ChatThreadPanel
            roomId={matrixRoomId}
            threadRootId={activeThread}
            myUserId={myUserId ?? ''}
            members={members}
            onSendMessage={sendMessage}
            onTyping={sendTyping}
            onClose={handleCloseThread}
        />
    ) : space ? (
        <SpaceSidePanel
            space={space}
            onToggleFullscreen={() => setPanelFullscreen(true)}
            activeTab={panelTab}
            onTabChange={setPanelTab}
            onEditDocument={async (doc) => {
                if (!session.platform?.token || !spaceId) return;
                // Erstelle einen neuen Collab-Draft aus dem Dokument-Inhalt
                const res = await fetch(`${env.platformBaseUrl}/platform/v1/collab-docs/from-document/${doc.id}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${session.platform.token}`, 'Content-Type': 'application/json' },
                    body: '{}',
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.docId) { setCollabDocId(data.docId); setPanelOpen(true); }
                }
            }}
        />
    ) : <div />;

    return (
        <ResizablePanels
            ref={panelsRef}
            left={chatPanel}
            right={rightPanel}
            rightCollapsed={!panelOpen}
            defaultLeftRatio={0.65}
            minLeftRatio={0.4}
            maxLeftRatio={0.85}
        />
    );
};
