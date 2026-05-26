/**
 * Guide-Editor — Anleitungs-Flow-Designer mit Phone/Tablet-Mockup.
 *
 * Layout:
 *  ┌─────────────┬──────────────────────────────┬──────────────┐
 *  │ Bausteine   │  Canvas mit Screen-Mockups   │ Properties   │
 *  │ (Sidebar L) │  Drag-Drop von Bausteinen    │ (Sidebar R)  │
 *  │             │  drauf                        │              │
 *  └─────────────┴──────────────────────────────┴──────────────┘
 *
 * Bausteine: 9 guide.* Components (siehe modules/guide-app)
 *  - guide.screen: container fuer phone/tablet
 *  - guide.heading, guide.text, guide.image
 *  - guide.button, guide.checklist, guide.choice
 *  - guide.callto, guide.video
 *
 * Drag-Drop:
 *  - Drag aus Sidebar L: neuer Component-Typ
 *  - Drop auf leerer Canvas: erstellt eine guide.screen
 *  - Drop auf existierende Screen: legt Child-Component an (groupId=screen.id)
 *  - Screens auf der Canvas haben x/y-Position (frei verschiebbar)
 *  - Edges zwischen Screens werden via "Button → naechster Screen" definiert
 *    (Click auf Button → Click auf Ziel-Screen)
 */

import { useEffect, useState, useCallback, useRef, type DragEvent, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { ArrowLeft, Smartphone, Play, X } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { flowsGateway, type ProcessTemplate, type ProcessComponent, type ProcessEdge, type ComponentKind } from './flows-gateway';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { GuidePlayer } from './guide-player';
import { GenericPropertiesForm, iconForKind, colorClassForKind } from './generic-properties-form';
import { TemplateHeaderEdit, TemplateActionsMenu } from './editor-header-shared';
import { useT } from "@/lib/i18n/use-t";

export function GuideEditor() {
    const t = useT();
    const { templateId } = useParams<{ templateId: string }>();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [template, setTemplate] = useState<ProcessTemplate | null>(null);
    const [components, setComponents] = useState<ProcessComponent[]>([]);
    const [edges, setEdges] = useState<ProcessEdge[]>([]);
    const [guideKinds, setGuideKinds] = useState<ComponentKind[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draggedKind, setDraggedKind] = useState<ComponentKind | null>(null);
    const [dropTargetScreenId, setDropTargetScreenId] = useState<string | null>(null);
    const [showPlayer, setShowPlayer] = useState(false);
    const [linkingFromButtonId, setLinkingFromButtonId] = useState<string | null>(null);
    const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
    const [showBrandingModal, setShowBrandingModal] = useState(false);
    const [showTriggerModal, setShowTriggerModal] = useState(false);
    // Viewport: Pan + Zoom der Canvas-Arbeitsflaeche
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
    // Lokale Live-Positions-Updates beim Screen-Drag (UI-Feedback ohne API-Call)
    const [livePositions, setLivePositions] = useState<Record<string, { x: number; y: number }>>({});
    // Refs fuer Pan + Screen-Drag (window-Listener-State, vermeidet Closure-Issues)
    const panRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
    const screenDragRef = useRef<{ id: string; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
    const componentsRef = useRef<ProcessComponent[]>([]);
    const viewportRef = useRef(viewport);
    const livePositionsRef = useRef(livePositions);
    componentsRef.current = components;
    viewportRef.current = viewport;
    livePositionsRef.current = livePositions;

    const reload = useCallback(async () => {
        if (!jwt || !templateId) return;
        const r = await flowsGateway.getTemplate(jwt, templateId);
        setTemplate(r.template);
        setComponents(r.template.components ?? []);
        setEdges(r.template.edges ?? []);
    }, [jwt, templateId]);

    useEffect(() => { reload(); }, [reload]);

    // Kinds (gefiltert auf appKind=guide) vom Backend laden — Sidebar + Properties
    // bekommen Icons, Farben, defaultConfig, propertiesSchema von dort.
    useEffect(() => {
        if (!jwt) return;
        flowsGateway.listKinds(jwt)
            .then(r => setGuideKinds(r.kinds.filter(k => k.appKind === 'guide')))
            .catch(() => undefined);
    }, [jwt]);

    const kindByKey = (key: string): ComponentKind | null =>
        guideKinds.find(k => k.key === key) ?? null;

    // ESC bricht Linking ab — MUSS vor early-returns stehen (Rules of Hooks)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && linkingFromButtonId) setLinkingFromButtonId(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [linkingFromButtonId]);

    // Canvas-Wheel-Handler via Callback-Ref — wird beim Mount des
    // Canvas-DOM-Elements aufgerufen (auch wenn das spaeter passiert,
    // z.B. nach Template-Load). useEffect mit [] reichte nicht, weil
    // beim ersten Render noch der Loading-State angezeigt wird und der
    // Canvas dann gar nicht im DOM existiert.
    const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);
    if (!wheelHandlerRef.current) {
        wheelHandlerRef.current = (e: WheelEvent) => {
            e.preventDefault();
            const el = canvasRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const v = viewportRef.current;
            if (e.ctrlKey || e.metaKey) {
                const delta = -e.deltaY * 0.005;
                const newZoom = Math.max(0.2, Math.min(3, v.zoom * (1 + delta)));
                const wx = (mx - v.x) / v.zoom;
                const wy = (my - v.y) / v.zoom;
                setViewport({ x: mx - wx * newZoom, y: my - wy * newZoom, zoom: newZoom });
            } else {
                const dx = e.shiftKey ? e.deltaY : e.deltaX;
                const dy = e.shiftKey ? 0 : e.deltaY;
                setViewport(prev => ({ ...prev, x: prev.x - dx, y: prev.y - dy }));
            }
        };
    }
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const setCanvasRef = useCallback((el: HTMLDivElement | null) => {
        if (canvasRef.current && wheelHandlerRef.current) {
            canvasRef.current.removeEventListener('wheel', wheelHandlerRef.current);
        }
        canvasRef.current = el;
        if (el && wheelHandlerRef.current) {
            el.addEventListener('wheel', wheelHandlerRef.current, { passive: false });
        }
    }, []);

    // Globale Mouse-Listener fuer Pan + Screen-Drag
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            // WICHTIG: Refs lokal kopieren bevor wir setX-Updater-Funktionen
            // aufrufen. React's Reconciler ruft den Updater spaeter auf — bis
            // dahin koennte der Ref null sein (mouseup hat ihn geleert).
            // Direkter panRef.current!.viewX im Updater crasht den Editor.
            const pan = panRef.current;
            if (pan) {
                const dx = e.clientX - pan.startX;
                const dy = e.clientY - pan.startY;
                setViewport(v => ({ ...v, x: pan.viewX + dx, y: pan.viewY + dy }));
            }
            const drag = screenDragRef.current;
            if (drag) {
                const z = viewportRef.current.zoom;
                const dx = (e.clientX - drag.startX) / z;
                const dy = (e.clientY - drag.startY) / z;
                const newX = Math.max(0, drag.baseX + dx);
                const newY = Math.max(0, drag.baseY + dy);
                setLivePositions(prev => ({ ...prev, [drag.id]: { x: newX, y: newY } }));
            }
        };
        const onUp = async () => {
            const dragged = screenDragRef.current;
            screenDragRef.current = null;
            panRef.current = null;
            if (dragged && jwt) {
                const newPos = livePositionsRef.current[dragged.id];
                if (newPos) {
                    try {
                        await flowsGateway.updateComponent(jwt, dragged.id, { position: newPos });
                        setLivePositions(prev => { const n = { ...prev }; delete n[dragged.id]; return n; });
                        await reload();
                    } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Position speichern fehlgeschlagen');
                    }
                }
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [jwt, reload]);

    if (!jwt || !templateId) return null;
    if (!template) return <div className="p-6 text-sm text-muted-foreground">{t('flows.guide_editor.lade')}</div>;

    // Mobile: Editor wenig sinnvoll mit drei Spalten + Drag-Drop. Stattdessen
    // Read-Only-Vorschau anbieten.
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
        return (
            <div className="flex h-screen flex-col bg-background">
                <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-3">
                    <button onClick={() => navigate('/flows')} className="rounded-md p-1.5 hover:bg-muted">
                        <MaterialIcon name="arrow_back" size={16} className="size-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="truncate text-sm font-semibold">{template.name}</h1>
                        <p className="text-[11px] text-muted-foreground">{components.filter(c => c.kind === 'guide.screen').length} {t('flows.guide_editor.bildschirme')} {template.status}</p>
                    </div>
                </div>
                <div className="p-4 space-y-3">
                    <div className="rounded-lg border border-border bg-card p-4">
                        <p className="text-sm font-medium">{t('flows.guide_editor.editor_nur_am_desktop')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t('flows.guide_editor.anleitungen_baut_man_am_desktop_hier_kan')}</p>
                    </div>
                    <button
                        onClick={() => setShowPlayer(true)}
                        disabled={components.filter(c => c.kind === 'guide.screen').length === 0}
                        className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        <MaterialIcon name="play_arrow" size={16} className="size-4" /> {t('flows.guide_editor.vorschau_starten')}
                    </button>
                </div>
                {showPlayer && (
                    <div className="fixed inset-0 z-[100] bg-black/70">
                        <button
                            onClick={() => setShowPlayer(false)}
                            className="absolute right-4 top-4 z-10 rounded-md bg-white px-3 py-1.5 text-sm shadow-md"
                        >
                            ✕
                        </button>
                        <GuidePlayer
                            components={components}
                            edges={edges}
                            branding={(template.metadata as { branding?: Record<string, string> } | null)?.branding}
                            testMode
                            onClose={() => setShowPlayer(false)}
                        />
                    </div>
                )}
            </div>
        );
    }

    const screens = components.filter(c => c.kind === 'guide.screen');
    const childrenOf = (screenId: string) =>
        components.filter(c => (c.groupId ?? null) === screenId).sort((a, b) => a.sortOrder - b.sortOrder);

    const selected = selectedId ? components.find(c => c.id === selectedId) : null;

    // ─── Drag handlers ─────────────────────────────────────────────────────

    const onSidebarDragStart = (kind: ComponentKind) => (e: DragEvent) => {
        e.dataTransfer.effectAllowed = 'copy';
        setDraggedKind(kind);
    };

    const onCanvasDrop = async (e: DragEvent) => {
        e.preventDefault();
        if (!draggedKind || !jwt || !templateId) return;
        const canBeRoot = draggedKind.designer?.canBeRoot ?? false;
        // Nur Screens duerfen direkt auf die Canvas
        if (!canBeRoot) {
            toast.error('Bitte erst einen "Bildschirm" auf die Canvas ziehen, dann andere Bausteine darauf.');
            setDraggedKind(null);
            return;
        }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        try {
            await flowsGateway.addComponent(jwt, templateId, {
                kind: draggedKind.key,
                label: draggedKind.label,
                config: draggedKind.designer?.defaultConfig ?? {},
                position: { x, y },
            });
            await reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Konnte nicht erstellen');
        }
        setDraggedKind(null);
    };

    const onScreenDrop = (screenId: string) => async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedKind || !jwt || !templateId) return;
        const canBeRoot = draggedKind.designer?.canBeRoot ?? false;
        if (canBeRoot) {
            // Screen auf Screen — nicht erlaubt
            setDraggedKind(null);
            setDropTargetScreenId(null);
            return;
        }
        try {
            // groupId nicht im gateway-API — nutze raw fetch via addComponent
            // Das addComponent-API hat kein groupId-Feld; wir setzen es via
            // updateComponent nach dem create.
            const created = await flowsGateway.addComponent(jwt, templateId, {
                kind: draggedKind.key,
                label: draggedKind.label,
                config: draggedKind.designer?.defaultConfig ?? {},
            });
            // Sortiere als Letztes innerhalb des Screens
            const siblings = components.filter(c => (c.groupId ?? null) === screenId);
            const nextSort = siblings.length > 0 ? Math.max(...siblings.map(s => s.sortOrder)) + 1 : 0;
            await flowsGateway.updateComponent(jwt, created.component.id, {
                sortOrder: nextSort,
                // groupId via direct API extension noetig — siehe gateway.setGroupId
            });
            await fetch(`/api/platform/v1/process/components/${encodeURIComponent(created.component.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
                body: JSON.stringify({ groupId: screenId, sortOrder: nextSort }),
            });
            await reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Konnte nicht erstellen');
        }
        setDraggedKind(null);
        setDropTargetScreenId(null);
    };

    const deleteComponent = async (id: string) => {
        if (!jwt) return;
        if (!confirm('Baustein wirklich loeschen?')) return;
        try {
            await flowsGateway.deleteComponent(jwt, id);
            setSelectedId(null);
            await reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Loeschen fehlgeschlagen');
        }
    };

    const updateConfig = async (id: string, configPatch: Record<string, unknown>) => {
        if (!jwt) return;
        const c = components.find(x => x.id === id);
        if (!c) return;
        setSaveState('saving');
        try {
            await flowsGateway.updateComponent(jwt, id, {
                config: { ...c.config, ...configPatch },
            });
            await reload();
            setSaveState('saved');
        } catch (err) {
            setSaveState('error');
            toast.error(err instanceof Error ? err.message : 'Update fehlgeschlagen');
        }
    };

    // ─── Edge-Linking: Click-Button-then-Click-Screen ──────────────────────
    const startLinkingFromButton = (buttonId: string) => {
        setLinkingFromButtonId(buttonId);
        toast.error('Klick einen Bildschirm an, mit dem dieser Button verbunden werden soll. (ESC: abbrechen)');
    };

    const handleScreenClickForLinking = async (screenId: string) => {
        if (!linkingFromButtonId || !jwt || !templateId) return;
        try {
            // Bestehende Edges fuer diesen Button loeschen
            const existing = edges.filter(e => e.sourceId === linkingFromButtonId);
            for (const e of existing) await flowsGateway.deleteEdge(jwt, e.id);
            await flowsGateway.addEdge(jwt, templateId, {
                sourceId: linkingFromButtonId, targetId: screenId,
                condition: { type: 'always' },
            });
            await reload();
            toast.success?.('Verbindung gesetzt') ?? toast.error('Verbindung gesetzt');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
        }
        setLinkingFromButtonId(null);
    };

    // ─── Screen duplizieren ───────────────────────────────────────────────
    const duplicateScreen = async (screenId: string) => {
        if (!jwt || !templateId) return;
        const screen = components.find(c => c.id === screenId);
        if (!screen || screen.kind !== 'guide.screen') return;
        const childs = components.filter(c => c.groupId === screenId);
        try {
            const created = await flowsGateway.addComponent(jwt, templateId, {
                kind: 'guide.screen',
                label: (screen.label ?? '') + ' (Kopie)',
                config: screen.config as Record<string, unknown>,
                position: { x: ((screen.position as { x?: number })?.x ?? 50) + 320, y: (screen.position as { y?: number })?.y ?? 50 },
            });
            for (let i = 0; i < childs.length; i++) {
                const c = childs[i];
                const newChild = await flowsGateway.addComponent(jwt, templateId, {
                    kind: c.kind, label: c.label ?? '', config: c.config as Record<string, unknown>,
                });
                await fetch(`/api/platform/v1/process/components/${encodeURIComponent(newChild.component.id)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
                    body: JSON.stringify({ groupId: created.component.id, sortOrder: i }),
                });
            }
            await reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Duplizieren fehlgeschlagen');
        }
    };

    // ─── Reorder children ─────────────────────────────────────────────────
    const moveChild = async (childId: string, screenId: string, direction: -1 | 1) => {
        if (!jwt) return;
        const siblings = components
            .filter(c => c.groupId === screenId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
        const idx = siblings.findIndex(s => s.id === childId);
        if (idx < 0) return;
        const swapIdx = idx + direction;
        if (swapIdx < 0 || swapIdx >= siblings.length) return;
        const a = siblings[idx];
        const b = siblings[swapIdx];
        await flowsGateway.updateComponent(jwt, a.id, { sortOrder: b.sortOrder });
        await flowsGateway.updateComponent(jwt, b.id, { sortOrder: a.sortOrder });
        await reload();
    };

    // ─── Branding-Profile lesen aus template.metadata ─────────────────────
    const branding = (template.metadata as { branding?: Record<string, string> } | null)?.branding;
    const trigger = (template.metadata as { trigger?: { kind: 'manual' | 'webhook' | 'schedule' | 'link'; pathSlug?: string; cron?: string; slug?: string } } | null)?.trigger
        ?? { kind: 'manual' as const };

    const saveTrigger = async (next: typeof trigger) => {
        if (!jwt || !templateId) return;
        const meta = (template.metadata ?? {}) as Record<string, unknown>;
        await fetch(`/api/platform/v1/process/templates/${encodeURIComponent(templateId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
            body: JSON.stringify({ metadata: { ...meta, trigger: next } }),
        });
        await reload();
    };

    return (
        <div className="flex h-screen w-full flex-col bg-zinc-50 dark:bg-zinc-900">
            {/* Top-Bar (gleicher Look & Feel wie flows-editor) */}
            <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
                <button onClick={() => navigate('/flows')} className="p-2 hover:bg-gray-100 rounded-lg">
                    <ArrowLeft size={18} />
                </button>

                <TemplateHeaderEdit
                    template={template}
                    subtitle={`Anleitung · v${template.version} · ${screens.length} Bildschirm${screens.length === 1 ? '' : 'e'}`}
                    jwt={jwt}
                    onUpdated={(_t) => setTemplate(_t)}
                />

                {/* Save-Indicator + Aktions-Menu — direkt links neben den Aktions-Buttons */}
                <span className={cn(
                    'text-[11px] font-medium px-2 py-0.5 rounded-full',
                    saveState === 'saved' && 'text-emerald-600',
                    saveState === 'saving' && 'text-amber-600',
                    saveState === 'error' && 'text-red-600',
                )}>
                    {saveState === 'saved' && '✓ Gespeichert'}
                    {saveState === 'saving' && '… Speichert'}
                    {saveState === 'error' && '✗ Fehler'}
                </span>

                <TemplateActionsMenu jwt={jwt} template={template} onUpdated={(_t) => setTemplate(_t)} navigate={navigate} />

                {/* Trigger-Button (anleitungs-spezifisch) */}
                <button
                    onClick={() => setShowTriggerModal(true)}
                    title={t('flows.guide_editor.trigger_konfigurieren')}
                    className="px-3 py-1.5 border border-gray-300 hover:bg-gray-100 rounded-lg text-sm flex items-center gap-1"
                >
                    {trigger.kind === 'manual' ? 'Manuell' : trigger.kind === 'webhook' ? 'Webhook' : trigger.kind === 'link' ? 'Link' : 'Zeitplan'}
                </button>

                {/* Branding-Button (anleitungs-spezifisch) */}
                <button
                    onClick={() => setShowBrandingModal(true)}
                    title={t('flows.guide_editor.branding_logo_farben')}
                    className="px-3 py-1.5 border border-gray-300 hover:bg-gray-100 rounded-lg text-sm flex items-center gap-1"
                >
                    {t('flows.guide_editor.branding')}
                </button>

                {/* Vorschau (= Test-Run) */}
                <button
                    onClick={() => setShowPlayer(true)}
                    disabled={screens.length === 0}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
                >
                    <Play size={14} /> {t('flows.guide_editor.vorschau')}
                </button>
            </div>

            {/* Linking-Mode-Banner */}
            {linkingFromButtonId && (
                <div className="flex items-center justify-between gap-3 bg-blue-100 px-4 py-2 text-xs text-blue-900">
                    <span><MaterialIcon name="link" size={16} className="mr-1 inline size-3" /> {t('flows.guide_editor.klick_einen_bildschirm_an_um_die_verbind')}</span>
                    <button onClick={() => setLinkingFromButtonId(null)} className="rounded-md p-0.5 hover:bg-blue-200">
                        <MaterialIcon name="close" size={16} className="size-3" />
                    </button>
                </div>
            )}

            <div className="flex min-h-0 flex-1">
                {/* Sidebar Links: Bausteine — gleicher Stil wie flows-editor */}
                <aside className="w-52 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
                    <div className="p-3 sticky top-0 bg-white border-b border-gray-100">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{t('flows.guide_editor.bausteine')}</div>
                        <p className="mt-0.5 text-[10px] text-gray-400">{t('flows.guide_editor.klicken_oder_in_canvas_ziehen')}</p>
                    </div>
                    <div className="p-3 space-y-1">
                        {guideKinds.map(k => {
                            const Icon = iconForKind(k.designer?.icon);
                            const colorCls = colorClassForKind(k.designer?.color);
                            return (
                                <button
                                    key={k.key}
                                    draggable
                                    onDragStart={onSidebarDragStart(k)}
                                    onDragEnd={() => { setDraggedKind(null); setDropTargetScreenId(null); }}
                                    className="w-full px-2 py-1.5 border border-gray-200 bg-white rounded-md flex items-center gap-2 text-xs text-left hover:bg-gray-50 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing"
                                    title={k.designer?.description ?? k.key}
                                >
                                    <span className={`flex size-5 items-center justify-center rounded shrink-0 ${colorCls}`}>
                                        <Icon size={11} />
                                    </span>
                                    <span className="truncate text-gray-700">{k.label}</span>
                                </button>
                            );
                        })}
                        <p className="mt-3 text-[10px] leading-relaxed text-gray-400">
                            <strong>{t('flows.guide_editor.bildschirm')}</strong> {t('flows.guide_editor.auf_die_canvas_ziehen_dann_andere_bauste')}
                        </p>
                    </div>
                </aside>

                {/* Canvas */}
                <div
                    ref={setCanvasRef}
                    className="relative flex-1 overflow-hidden"
                    style={{
                        backgroundImage: 'radial-gradient(circle, #d4d4d8 1px, transparent 1px)',
                        backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
                        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
                        cursor: panRef.current ? 'grabbing' : 'default',
                        // Verhindert Browser-Zoom auf Pinch/Trackpad
                        touchAction: 'none',
                        overscrollBehavior: 'contain',
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        // Drop-Position muss in Welt-Koordinaten (durch viewport-Transform zurueck)
                        e.preventDefault();
                        if (!draggedKind || !jwt || !templateId) return;
                        const canBeRoot = draggedKind.designer?.canBeRoot ?? false;
                        if (!canBeRoot) {
                            toast.error('Bitte erst einen "Bildschirm" auf die Canvas ziehen, dann andere Bausteine darauf.');
                            setDraggedKind(null);
                            return;
                        }
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const x = (e.clientX - rect.left - viewport.x) / viewport.zoom;
                        const y = (e.clientY - rect.top - viewport.y) / viewport.zoom;
                        flowsGateway.addComponent(jwt, templateId, {
                            kind: draggedKind.key,
                            label: draggedKind.label,
                            config: draggedKind.designer?.defaultConfig ?? {},
                            position: { x: Math.max(0, x), y: Math.max(0, y) },
                        }).then(() => reload()).catch((err) => toast.error(err instanceof Error ? err.message : 'Konnte nicht erstellen'));
                        setDraggedKind(null);
                    }}
                    onClick={() => setSelectedId(null)}
                    onMouseDown={(e) => {
                        // Pan startet nur wenn der Klick auf der Canvas selbst landet (nicht auf einem Screen).
                        // e.target === e.currentTarget pruefen funktioniert nicht zuverlaessig wegen
                        // Background-Layer; wir nutzen ein data-Attribut auf der inneren Transform-Schicht.
                        const target = e.target as HTMLElement;
                        if (target.closest('[data-screen-frame]')) return;
                        if (e.button !== 0) return; // nur left-click
                        panRef.current = { startX: e.clientX, startY: e.clientY, viewX: viewport.x, viewY: viewport.y };
                    }}
                    data-canvas-root
                >
                    {/* Zoom-Indicator + Reset-Button */}
                    <div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-md bg-card/90 backdrop-blur px-2 py-1 text-[10px] shadow-md">
                        <button
                            onClick={(e) => { e.stopPropagation(); setViewport(v => ({ ...v, zoom: Math.max(0.2, v.zoom - 0.1) })); }}
                            className="rounded px-1 hover:bg-muted"
                        >−</button>
                        <span className="px-1 tabular-nums">{Math.round(viewport.zoom * 100)}%</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); setViewport(v => ({ ...v, zoom: Math.min(3, v.zoom + 0.1) })); }}
                            className="rounded px-1 hover:bg-muted"
                        >+</button>
                        <span className="mx-1 text-muted-foreground">·</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); setViewport({ x: 0, y: 0, zoom: 1 }); }}
                            className="rounded px-2 hover:bg-muted"
                            title={t('flows.guide_editor.ansicht_zuruecksetzen')}
                        >↻</button>
                    </div>

                    {screens.length === 0 ? (
                        <div className="flex h-full items-center justify-center pointer-events-none">
                            <div className="text-center">
                                <Smartphone className="mx-auto size-12 text-muted-foreground/40" />
                                <p className="mt-3 text-sm text-muted-foreground">
                                    {t('flows.guide_editor.ziehe_einen')} <strong>{t('flows.guide_editor.bildschirm')}</strong> {t('flows.guide_editor.aus_der_linken_spalte_hierher')}
                                </p>
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                    {t('flows.guide_editor.pan_leeren_canvas_ziehen_zoom_ctrlmausra')}
                                </p>
                            </div>
                        </div>
                    ) : (
                        // Transform-Wrapper: alle Screens leben in dieser Ebene, die wir
                        // als Ganzes pannen + zoomen.
                        <div
                            className="absolute"
                            style={{
                                left: 0, top: 0,
                                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                                transformOrigin: '0 0',
                            }}
                        >
                            {screens.map(screen => {
                                const dbPos = (screen.position as { x?: number; y?: number } | null) ?? null;
                                // Live-Position waehrend Drag (UI-Feedback ohne API-Call) hat Vorrang
                                const livePos = livePositions[screen.id];
                                const pos = livePos ?? { x: dbPos?.x ?? 50, y: dbPos?.y ?? 50 };
                                const cfg = (screen.config as { device?: string; title?: string; background?: string }) ?? {};
                                const isPhone = cfg.device !== 'tablet';
                                const width = isPhone ? 280 : 560;
                                const isSelected = selectedId === screen.id;
                                const isDropTarget = dropTargetScreenId === screen.id;
                                const childs = childrenOf(screen.id);

                                // Wenn dieser Screen Ziel einer eingehenden Edge von einem Button ist, markieren
                                const incomingButtonEdges = edges.filter(e => e.targetId === screen.id);

                                return (
                                    <div
                                        key={screen.id}
                                        data-screen-frame
                                        className={cn(
                                            'absolute group',
                                            linkingFromButtonId && 'cursor-pointer',
                                        )}
                                        style={{ left: pos.x, top: pos.y, width }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (linkingFromButtonId) {
                                                handleScreenClickForLinking(screen.id);
                                            } else {
                                                setSelectedId(screen.id);
                                            }
                                        }}
                                        onDragOver={(e) => {
                                            if (draggedKind && !(draggedKind.designer?.canBeRoot ?? false)) {
                                                e.preventDefault();
                                                setDropTargetScreenId(screen.id);
                                            }
                                        }}
                                        onDragLeave={() => setDropTargetScreenId(null)}
                                        onDrop={onScreenDrop(screen.id)}
                                        onMouseDown={(e) => {
                                            // Screen draggen — aber nicht wenn Linking-Mode oder
                                            // wenn man auf den Inhalt klickt (Buttons, Inputs, screen-content).
                                            if (linkingFromButtonId) return;
                                            const target = e.target as HTMLElement;
                                            if (target.closest('[data-screen-content]') || target.closest('button') || target.closest('input') || target.closest('select') || target.closest('textarea')) return;
                                            e.stopPropagation();
                                            screenDragRef.current = {
                                                id: screen.id,
                                                startX: e.clientX,
                                                startY: e.clientY,
                                                baseX: pos.x,
                                                baseY: pos.y,
                                            };
                                        }}
                                    >
                                        {/* Header-Buttons (Hover) */}
                                        <div className="absolute -top-9 right-0 z-10 flex gap-1 opacity-0 group-hover:opacity-100">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); duplicateScreen(screen.id); }}
                                                className="rounded-md bg-white px-2 py-1 text-[10px] shadow-md hover:bg-zinc-100"
                                                title={t('flows.guide_editor.bildschirm_duplizieren')}
                                            >
                                                <MaterialIcon name="content_copy" size={16} className="size-3" />
                                            </button>
                                            {incomingButtonEdges.length > 0 && (
                                                <span className="rounded-md bg-blue-100 px-2 py-1 text-[10px] text-blue-700" title={t('flows.guide_editor.ziel_von_button-klick')}>
                                                    ← {incomingButtonEdges.length}
                                                </span>
                                            )}
                                        </div>

                                        {/* Phone-Frame */}
                                        <div className={cn(
                                            'rounded-[2.5rem] border-[6px] bg-zinc-900 p-1.5 shadow-xl transition-all',
                                            isSelected ? 'border-blue-500' : 'border-zinc-800',
                                            isDropTarget && 'ring-4 ring-emerald-400',
                                            linkingFromButtonId && 'ring-2 ring-blue-300 hover:ring-blue-500',
                                        )}>
                                            <div className="rounded-[2rem] overflow-hidden" style={{ background: cfg.background ?? '#fff', minHeight: 540 }}>
                                                {/* Notch */}
                                                <div className="flex justify-center py-1.5">
                                                    <div className="h-1 w-12 rounded-full bg-zinc-700" />
                                                </div>
                                                <div className="px-4 pb-6 pt-2 space-y-3" data-screen-content>
                                                    {cfg.title && (
                                                        <div className="text-[10px] font-medium text-zinc-400 text-center">{cfg.title}</div>
                                                    )}
                                                    {childs.length === 0 && (
                                                        <div className="rounded-md border-2 border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-400">
                                                            {t('flows.guide_editor.bausteine_hierher_ziehen')}
                                                        </div>
                                                    )}
                                                    {childs.map((child, idx) => (
                                                        <ChildElement
                                                            key={child.id}
                                                            component={child}
                                                            selectedId={selectedId}
                                                            onSelect={(id) => setSelectedId(id)}
                                                            onDelete={() => deleteComponent(child.id)}
                                                            canMoveUp={idx > 0}
                                                            canMoveDown={idx < childs.length - 1}
                                                            onMoveUp={() => moveChild(child.id, screen.id, -1)}
                                                            onMoveDown={() => moveChild(child.id, screen.id, 1)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-2 text-center text-[10px] text-muted-foreground">
                                            {cfg.title || 'Bildschirm'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Properties Panel — nur sichtbar wenn ein Baustein selektiert ist */}
                {selected && (
                    <aside className="w-96 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-y-auto">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                            <div className="font-semibold text-sm">{t('flows.guide_editor.eigenschaften')}</div>
                            <button onClick={() => setSelectedId(null)} className="p-1 hover:bg-gray-100 rounded" title={t('common.close')}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            <PropertiesEditor
                                component={selected}
                                kind={kindByKey(selected.kind)}
                                onChange={(patch) => updateConfig(selected.id, patch)}
                                onDelete={() => deleteComponent(selected.id)}
                                onStartLinking={() => startLinkingFromButton(selected.id)}
                                outgoingEdgeTarget={(() => {
                                    const e = edges.find(x => x.sourceId === selected.id);
                                    if (!e) return null;
                                    const t = components.find(c => c.id === e.targetId);
                                    return t?.label || (t?.config as { title?: string })?.title || 'Bildschirm';
                                })()}
                            />
                        </div>
                    </aside>
                )}
            </div>

            {/* Test-Run-Modal */}
            {showPlayer && (
                <div className="fixed inset-0 z-[100] bg-black/70">
                    <button
                        onClick={() => setShowPlayer(false)}
                        className="absolute right-4 top-4 z-10 rounded-md bg-white px-3 py-1.5 text-sm shadow-md hover:bg-zinc-100"
                    >
                        {t('flows.guide_editor.schliessen')}
                    </button>
                    <GuidePlayer
                        components={components}
                        edges={edges}
                        branding={branding}
                        testMode
                        onClose={() => setShowPlayer(false)}
                        initialData={{ userName: 'Anna Mustermann', studentName: 'Max', schoolName: template.name }}
                    />
                </div>
            )}

            {/* Trigger-Modal */}
            {showTriggerModal && (
                <TriggerModal
                    initial={trigger}
                    templateId={templateId}
                    onClose={() => setShowTriggerModal(false)}
                    onSave={async (next) => { await saveTrigger(next); setShowTriggerModal(false); }}
                />
            )}

            {/* Branding-Modal */}
            {showBrandingModal && (
                <BrandingModal
                    initial={branding}
                    onClose={() => setShowBrandingModal(false)}
                    onSave={async (next) => {
                        if (!jwt || !templateId) return;
                        setSaveState('saving');
                        const meta = (template.metadata ?? {}) as Record<string, unknown>;
                        await flowsGateway.updateTemplate(jwt, templateId, {
                            // metadata-Feld an updateTemplate — gateway-Erweiterung noetig falls noch nicht da
                        }).catch(() => { });
                        // Direkt PUT mit metadata via raw fetch (gateway hat metadata nicht)
                        await fetch(`/api/platform/v1/process/templates/${encodeURIComponent(templateId)}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
                            body: JSON.stringify({ metadata: { ...meta, branding: next } }),
                        });
                        await reload();
                        setSaveState('saved');
                        setShowBrandingModal(false);
                    }}
                />
            )}

        </div>
    );
}

// ─── Child-Element Renderer (Mini-Vorschau auf dem Phone) ──────────────────

function ChildElement({ component, selectedId, onSelect, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
    component: ProcessComponent;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onDelete: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
}) {
    const t = useT();
    const isSelected = selectedId === component.id;
    const cfg = component.config as Record<string, unknown>;

    let content: JSX.Element | null = null;
    if (component.kind === 'guide.heading') {
        const size = (cfg.size as string) || 'h2';
        const cls = size === 'h1' ? 'text-base font-bold' : size === 'h3' ? 'text-xs font-semibold' : 'text-sm font-bold';
        content = <div className={cls}>{(cfg.text as string) || 'Ueberschrift'}</div>;
    } else if (component.kind === 'guide.text') {
        content = <div className="text-xs leading-relaxed">{(cfg.body as string) || 'Text'}</div>;
    } else if (component.kind === 'guide.image') {
        content = (
            <div className="aspect-video w-full rounded bg-zinc-200 flex items-center justify-center text-zinc-500 text-[10px]">
                {cfg.url ? '🖼' : 'Bild ein­fuegen'}
            </div>
        );
    } else if (component.kind === 'guide.button') {
        const variant = (cfg.variant as string) || 'primary';
        const cls = variant === 'danger' ? 'bg-red-600 text-white' : variant === 'secondary' ? 'bg-zinc-200 text-zinc-800' : 'bg-blue-600 text-white';
        content = (
            <div className={cn('rounded-md py-2 text-center text-xs font-medium', cls)}>
                {(cfg.label as string) || 'Weiter'}
            </div>
        );
    } else if (component.kind === 'guide.checklist') {
        const items = (cfg.items as string[]) || [];
        content = (
            <div className="space-y-1">
                {items.slice(0, 4).map((it, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs">
                        <span className="mt-0.5 size-3 shrink-0 rounded border border-zinc-400" />
                        <span>{it}</span>
                    </div>
                ))}
                {items.length > 4 && <div className="text-[10px] text-zinc-500">+{items.length - 4} weitere</div>}
            </div>
        );
    } else if (component.kind === 'guide.choice') {
        const opts = (cfg.options as Array<{ label: string }>) || [];
        content = (
            <div className="space-y-1">
                {(cfg.question as string) && <div className="text-xs font-medium">{cfg.question as string}</div>}
                {opts.slice(0, 3).map((o, i) => (
                    <div key={i} className="rounded-md border border-zinc-300 px-2 py-1 text-[11px]">{o.label}</div>
                ))}
            </div>
        );
    } else if (component.kind === 'guide.callto') {
        const type = (cfg.type as string) || 'phone';
        content = (
            <div className="rounded-md bg-red-600 px-3 py-2 text-center text-xs font-medium text-white">
                📞 {(cfg.label as string) || (cfg.target as string) || 'Anrufen'}
                {type === 'email' && ' ✉'}
            </div>
        );
    } else if (component.kind === 'guide.video') {
        content = (
            <div className="aspect-video rounded bg-zinc-900 flex items-center justify-center text-white text-xs">
                {t('flows.guide_editor.video')}
            </div>
        );
    }

    return (
        <div
            className={cn(
                'group relative rounded-md transition-all',
                isSelected && 'ring-2 ring-blue-500',
            )}
            onClick={(e) => { e.stopPropagation(); onSelect(component.id); }}
        >
            {content}
            <div className="absolute -right-1 -top-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
                {canMoveUp && onMoveUp && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                        className="flex size-4 items-center justify-center rounded-full bg-zinc-700 text-white text-[10px] hover:bg-zinc-900"
                        title={t('flows.guide_editor.nach_oben')}
                    >
                        ↑
                    </button>
                )}
                {canMoveDown && onMoveDown && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                        className="flex size-4 items-center justify-center rounded-full bg-zinc-700 text-white text-[10px] hover:bg-zinc-900"
                        title={t('flows.guide_editor.nach_unten')}
                    >
                        ↓
                    </button>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="flex size-4 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                    title={t('common.delete')}
                >
                    <MaterialIcon name="delete" size={16} className="size-2.5" />
                </button>
            </div>
        </div>
    );
}

// ─── Properties-Panel ──────────────────────────────────────────────────────

function PropertiesEditor({ component, kind, onChange, onDelete, onStartLinking, outgoingEdgeTarget }: {
    component: ProcessComponent;
    kind: ComponentKind | null;
    onChange: (patch: Record<string, unknown>) => void;
    onDelete: () => void;
    onStartLinking: () => void;
    outgoingEdgeTarget: string | null;
}) {
    const t = useT();
    const cfg = component.config as Record<string, unknown>;
    const showIf = cfg._showIf as { var?: string; equals?: unknown } | undefined;
    const schema = kind?.designer?.propertiesSchema ?? null;

    return (
        <div className="space-y-3 text-sm">
            <div className="rounded-md bg-zinc-100 dark:bg-zinc-800 p-2 text-[10px]">
                <strong>{kind?.label ?? component.kind}</strong>
                <div className="text-muted-foreground">{component.kind}</div>
            </div>

            {kind?.designer?.description && (
                <p className="text-[11px] text-muted-foreground">{kind.designer.description}</p>
            )}

            {schema && schema.length > 0 ? (
                <GenericPropertiesForm
                    component={component}
                    schema={schema}
                    onChange={onChange}
                />
            ) : (
                <p className="text-[11px] text-muted-foreground italic">{t('flows.guide_editor.keine_bearbeitbaren_eigenschaften')}</p>
            )}

            {/* Spezial: Button-Edge (Click → Screen) — bleibt im Editor weil
                Edge-Linking ein Editor-Konzept ist, nicht Component-Config. */}
            {component.kind === 'guide.button' && (
                <div className="rounded-md border border-border p-2">
                    <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">{t('flows.guide_editor.bei_klick_bildschirm')}</label>
                    {outgoingEdgeTarget ? (
                        <p className="text-xs">→ <strong>{outgoingEdgeTarget}</strong></p>
                    ) : (
                        <p className="text-xs text-muted-foreground italic">{t('flows.guide_editor.kein_ziel_geht_zum_naechsten_screen_in_r')}</p>
                    )}
                    <button
                        onClick={onStartLinking}
                        className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                        <MaterialIcon name="link" size={16} className="size-3" /> {t('flows.guide_editor.verbinden')}
                    </button>
                </div>
            )}

            {/* Conditional Visibility — Editor-spezifisch (Player wertet
                _showIf aus, ist aber kein Component-Config-Feld). */}
            {component.kind !== 'guide.screen' && (
                <details className="rounded-md border border-border p-2">
                    <summary className="cursor-pointer text-[10px] font-medium uppercase text-muted-foreground">{t('flows.guide_editor.bedingung_optional')}</summary>
                    <div className="mt-2 space-y-2">
                        <p className="text-[10px] text-muted-foreground">{t('flows.guide_editor.nur_zeigen_wenn_variable_einen_wert_hat')}</p>
                        <div>
                            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.variable')}</label>
                            <input
                                value={showIf?.var ?? ''}
                                placeholder={t('flows.guide_editor.zb_choice')}
                                onChange={(e) => onChange({ _showIf: e.target.value ? { ...(showIf ?? {}), var: e.target.value } : undefined })}
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.gleich')}</label>
                            <input
                                value={String(showIf?.equals ?? '')}
                                placeholder={t('flows.guide_editor.zb_ja')}
                                onChange={(e) => onChange({ _showIf: showIf?.var ? { ...showIf, equals: e.target.value } : undefined })}
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                        </div>
                    </div>
                </details>
            )}

            <hr className="border-border" />
            <button
                onClick={onDelete}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
            >
                <MaterialIcon name="delete" size={16} className="size-3.5" /> {t('common.delete')}
            </button>
        </div>
    );
}

// ─── BrandingModal ─────────────────────────────────────────────────────────

function BrandingModal({ initial, onClose, onSave }: { initial?: Record<string, string>; onClose: () => void; onSave: (b: Record<string, string>) => Promise<void> }) {
    const t = useT();
    const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? '');
    const [primaryColor, setPrimaryColor] = useState(initial?.primaryColor ?? '#2563eb');
    const [backgroundColor, setBackgroundColor] = useState(initial?.backgroundColor ?? '#ffffff');
    const [fontFamily, setFontFamily] = useState(initial?.fontFamily ?? 'system-ui, sans-serif');
    const [css, setCss] = useState(initial?.css ?? '');
    const [busy, setBusy] = useState(false);

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl border border-border">
                <div className="flex items-start justify-between">
                    <h2 className="text-lg font-semibold">{t('flows.guide_editor.branding')}</h2>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t('flows.guide_editor.logo_farben_und_css_gilt_fuer_vorschau_e')}</p>

                <div className="mt-4 space-y-3 text-sm">
                    <div>
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.logo-url')}</label>
                        <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
                        {logoUrl && <img src={logoUrl} alt="" className="mt-1.5 max-h-16" />}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.akzent-farbe')}</label>
                            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-8 w-full rounded-md border border-border" />
                        </div>
                        <div>
                            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.hintergrund')}</label>
                            <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="h-8 w-full rounded-md border border-border" />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.schriftart_css')}</label>
                        <input value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
                    </div>
                    <div>
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.eigenes_css_optional')}</label>
                        <textarea value={css} onChange={(e) => setCss(e.target.value)} rows={4} placeholder={t('flows.guide_editor.guide-button_border-radius_0')} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] font-mono" />
                    </div>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">{t('common.cancel')}</button>
                    <button
                        onClick={async () => { setBusy(true); await onSave({ logoUrl, primaryColor, backgroundColor, fontFamily, css }); setBusy(false); }}
                        disabled={busy}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {t('flows.guide_editor.speichern')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── TriggerModal ──────────────────────────────────────────────────────────

type TriggerKind = 'manual' | 'webhook' | 'schedule' | 'link';
type TriggerConfig = { kind: TriggerKind; pathSlug?: string; cron?: string; slug?: string };

function TriggerModal({ initial, templateId, onClose, onSave }: {
    initial: TriggerConfig;
    templateId: string;
    onClose: () => void;
    onSave: (t: TriggerConfig) => Promise<void>;
}) {
    const t = useT();
    const [kind, setKind] = useState<TriggerKind>(initial.kind);
    const [pathSlug, setPathSlug] = useState(initial.pathSlug ?? `guide-${templateId.slice(-6)}`);
    const [cron, setCron] = useState(initial.cron ?? '0 8 * * 1');
    const [linkSlug, setLinkSlug] = useState(initial.slug ?? `link-${templateId.slice(-6)}`);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    // Tenant-Slug aus dem Hostname ableiten (z.B. "weser" aus "weser.prilog.team").
    // Bei localhost/IP fallback auf Eingabe — kann der User selbst eintippen.
    const hostParts = typeof window !== 'undefined' ? window.location.hostname.split('.') : [];
    const derivedTenantSlug = hostParts.length >= 3 ? hostParts[0] : '';
    const [tenantSlug, setTenantSlug] = useState(derivedTenantSlug);

    const linkUrl = tenantSlug && linkSlug
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/g/${tenantSlug}/${linkSlug}`
        : '';

    const copyLink = async () => {
        if (!linkUrl) return;
        try {
            await navigator.clipboard.writeText(linkUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard nicht verfuegbar */ }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl border border-border">
                <div className="flex items-start justify-between">
                    <h2 className="text-lg font-semibold">{t('flows.guide_editor.wann_startet_die_anleitung')}</h2>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
                </div>

                <div className="mt-4 space-y-2">
                    <button
                        onClick={() => setKind('manual')}
                        className={cn('w-full rounded-lg border-2 p-3 text-left text-sm', kind === 'manual' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-border')}
                    >
                        <div className="font-semibold">{t('flows.guide_editor.manuell')}</div>
                        <div className="text-xs text-muted-foreground">{t('flows.guide_editor.du_startest_die_anleitung_manuell_aus_de')}</div>
                    </button>
                    <button
                        onClick={() => setKind('link')}
                        className={cn('w-full rounded-lg border-2 p-3 text-left text-sm', kind === 'link' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-border')}
                    >
                        <div className="font-semibold">{t('flows.guide_editor.link')}</div>
                        <div className="text-xs text-muted-foreground">{t('flows.guide_editor.oeffentlicher_klick-link_wer_ihn_hat_sta')}</div>
                    </button>
                    <button
                        onClick={() => setKind('webhook')}
                        className={cn('w-full rounded-lg border-2 p-3 text-left text-sm', kind === 'webhook' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-border')}
                    >
                        <div className="font-semibold">{t('flows.guide_editor.webhook')}</div>
                        <div className="text-xs text-muted-foreground">{t('flows.guide_editor.externes_system_startet_via_http-post_zb')}</div>
                    </button>
                    <button
                        onClick={() => setKind('schedule')}
                        className={cn('w-full rounded-lg border-2 p-3 text-left text-sm', kind === 'schedule' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-border')}
                    >
                        <div className="font-semibold">{t('flows.guide_editor.zeitplan_cron')}</div>
                        <div className="text-xs text-muted-foreground">{t('flows.guide_editor.wiederkehrend_zb_jeden_montag_um_8_uhr')}</div>
                    </button>
                </div>

                {kind === 'link' && (
                    <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2">
                        <div>
                            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.slug_geheimnis')}</label>
                            <input
                                value={linkSlug}
                                onChange={(e) => setLinkSlug(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())}
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                        </div>
                        {!derivedTenantSlug && (
                            <div>
                                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.tenant-slug')}</label>
                                <input
                                    value={tenantSlug}
                                    onChange={(e) => setTenantSlug(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())}
                                    placeholder="weser"
                                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                                />
                            </div>
                        )}
                        <div className="rounded-md border border-border bg-background p-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{t('flows.guide_editor.klick-link')}</p>
                            <code className="text-[11px] break-all">{linkUrl || 'Bitte Slug + Tenant eintragen'}</code>
                            <button
                                onClick={copyLink}
                                disabled={!linkUrl}
                                className="mt-2 w-full rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {copied ? '✓ Kopiert' : 'Link kopieren'}
                            </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{t('flows.guide_editor.speichern_dann_ist_der_link_sofort_aktiv')}</p>
                    </div>
                )}

                {kind === 'webhook' && (
                    <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.pfad-slug')}</label>
                        <input value={pathSlug} onChange={(e) => setPathSlug(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
                        <p className="mt-2 text-[11px] font-mono text-muted-foreground break-all">
                            {t('flows.guide_editor.post_apiplatformv1processwebhooks')}{tenantSlug || '<tenant>'}/{pathSlug}
                        </p>
                    </div>
                )}

                {kind === 'schedule' && (
                    <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('flows.guide_editor.cron-ausdruck')}</label>
                        <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 8 * * 1" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono" />
                        <p className="mt-1 text-[10px] text-muted-foreground">{t('flows.guide_editor.beispiele')} <code>0 8 * * 1</code> {t('flows.guide_editor.jeden_montag_8_uhr')} <code>0 9 1 * *</code> {t('flows.guide_editor.jeden_1_um_9_uhr')}</p>
                    </div>
                )}

                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">{t('common.cancel')}</button>
                    <button
                        onClick={async () => {
                            setBusy(true);
                            const next: TriggerConfig =
                                kind === 'webhook' ? { kind: 'webhook', pathSlug } :
                                    kind === 'schedule' ? { kind: 'schedule', cron } :
                                        kind === 'link' ? { kind: 'link', slug: linkSlug } :
                                            { kind: 'manual' };
                            await onSave(next);
                            setBusy(false);
                        }}
                        disabled={busy}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {t('flows.guide_editor.speichern')}
                    </button>
                </div>
            </div>
        </div>
    );
}
