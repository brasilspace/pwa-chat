import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useIsMobile } from '@/core/responsive/use-is-mobile';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { MobileSpacesList } from '@/features/spaces/mobile-spaces-list';
import { GlanceBox } from './boxes/glance-box';
import { SetupBox } from './boxes/setup-box';
import { ActivityBox } from './boxes/activity-box';
import { BirthdaysBox } from './boxes/birthdays-box';
import { PrilogEventsBox } from './boxes/prilog-events-box';
import { FlowsBox } from './boxes/flows-box';
import { TaskBriefingBox } from './boxes/task-briefing-box';
import { GripVertical } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import {
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useT } from "@/lib/i18n/use-t";

/**
 * DashboardPage — Post-Login-Startseite mit anpassbaren Boxen.
 * Konzept: prilog_docs/docs/umsetzung/startfenster-konzept.md
 *
 * Phase 1.8: Edit-Mode + Drag-and-Drop.
 *  - Toggle-Button rechts oben → Edit-Mode an
 *  - Im Edit-Mode haben Boxen einen Drag-Handle (GripVertical)
 *  - Reihenfolge wird via PUT /dashboard/profile/start-layout persistiert
 */

const BOX_COMPONENTS: Record<string, React.ComponentType> = {
    glance: GlanceBox,
    setup: SetupBox,
    activity: ActivityBox,
    birthdays: BirthdaysBox,
    'prilog-events': PrilogEventsBox,
    flows: FlowsBox,
    'task-briefing': TaskBriefingBox,
};

const DEFAULT_BOX_ORDER = ['setup', 'glance', 'task-briefing', 'activity', 'birthdays', 'prilog-events', 'flows'];

export const DashboardPage = (): JSX.Element => {
    const t = useT();
    const isMobile = useIsMobile();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';

    const [boxes, setBoxes] = useState<string[]>(DEFAULT_BOX_ORDER);
    const [visibility, setVisibility] = useState<Record<string, boolean>>({
        setup: true, glance: true, 'task-briefing': true, activity: true, birthdays: true, 'prilog-events': true, flows: true,
    });
    const [mobileTab, setMobileTab] = useState<'today' | 'spaces'>('today');
    const [editMode, setEditMode] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    useEffect(() => {
        if (!jwt) return;
        const gw = createPlatformGateway();
        gw.getStartLayout(jwt).then((res) => setBoxes(res.boxes ?? DEFAULT_BOX_ORDER)).catch(() => { });
        gw.getDashboardBoxVisibility(jwt).then((res) => setVisibility(res.visibility)).catch(() => { });
    }, [jwt]);

    // Sichtbare Boxen nach Reihenfolge + Visibility + Rolle
    const visibleBoxes = boxes
        .filter((id) => BOX_COMPONENTS[id])
        .filter((id) => visibility[id] !== false)
        .filter((id) => id !== 'setup' || isAdmin);

    const persistOrder = (next: string[]) => {
        if (!jwt) return;
        // Persistiere full-Liste (auch unsichtbare Boxen) — aktueller boxes-State
        const merged = [...next, ...boxes.filter((b) => !next.includes(b))];
        setBoxes(merged);
        const gw = createPlatformGateway();
        gw.setStartLayout(jwt, merged).catch(() => { });
    };

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = visibleBoxes.indexOf(String(active.id));
        const newIndex = visibleBoxes.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0) return;
        const newOrder = arrayMove(visibleBoxes, oldIndex, newIndex);
        persistOrder(newOrder);
    };

    // Mobile: Tab-Switcher
    if (isMobile) {
        return (
            <div className="flex h-full flex-col bg-background">
                <div className="flex border-b border-border bg-card">
                    <TabButton active={mobileTab === 'today'} onClick={() => setMobileTab('today')} icon={<MaterialIcon name="grid_view" size={16} className="size-4" />} label={t('dashboard.dashboard_page.heute')} />
                    <TabButton active={mobileTab === 'spaces'} onClick={() => setMobileTab('spaces')} icon={<MaterialIcon name="format_list_bulleted" size={16} className="size-4" />} label={t('dashboard.dashboard_page.spaces')} />
                    {mobileTab === 'today' && <EditToggle editMode={editMode} setEditMode={setEditMode} />}
                </div>
                {mobileTab === 'today' ? (
                    <div className="flex-1 overflow-y-auto p-3">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                            <SortableContext items={visibleBoxes} strategy={verticalListSortingStrategy}>
                                <div className="space-y-3">
                                    {visibleBoxes.map((id) => (
                                        <SortableBox key={id} id={id} editMode={editMode} />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </div>
                ) : (
                    <MobileSpacesList />
                )}
            </div>
        );
    }

    // Desktop: 2-Spalten Grid mit Drag-and-Drop
    return (
        <div className="h-full overflow-y-auto bg-background">
            <div className="mx-auto max-w-6xl p-6">
                <DashboardHeader>
                    <EditToggle editMode={editMode} setEditMode={setEditMode} />
                </DashboardHeader>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={visibleBoxes} strategy={rectSortingStrategy}>
                        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {visibleBoxes.map((id) => (
                                <SortableBox key={id} id={id} editMode={editMode} />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>
        </div>
    );
};

function SortableBox({ id, editMode }: { id: string; editMode: boolean }): JSX.Element {
    const t = useT();
    const Box = BOX_COMPONENTS[id];
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        disabled: !editMode,
    });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };
    return (
        <div ref={setNodeRef} style={style} className="relative">
            {editMode && (
                <button
                    {...attributes}
                    {...listeners}
                    className="absolute right-2 top-2 z-10 rounded bg-muted p-1.5 text-muted-foreground hover:bg-accent cursor-grab active:cursor-grabbing"
                    aria-label={t('dashboard.dashboard_page.verschieben')}
                >
                    <MaterialIcon name="drag_indicator" size={16} className="size-4" />
                </button>
            )}
            <Box />
        </div>
    );
}

function DashboardHeader({ children }: { children?: React.ReactNode }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const displayName = session.bootstrap?.user.displayName ?? 'Willkommen';
    const tenantName = session.bootstrap?.branding?.tenantName ?? 'Prilog';

    return (
        <div className="flex items-end justify-between">
            <div>
                <h1 className="text-2xl font-semibold">{t('dashboard.dashboard_page.hallo')} {displayName}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{tenantName}</p>
            </div>
            {children}
        </div>
    );
}

function EditToggle({ editMode, setEditMode }: { editMode: boolean; setEditMode: (v: boolean) => void }): JSX.Element {
    const t = useT();
    return (
        <button
            onClick={() => setEditMode(!editMode)}
            className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
                editMode
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'border border-border text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
        >
            {editMode ? <MaterialIcon name="check" size={16} className="size-3.5" /> : <MaterialIcon name="edit" size={16} className="size-3.5" />}
            {editMode ? 'Fertig' : t('common.layout_edit')}
        </button>
    );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }): JSX.Element {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
                active
                    ? 'border-b-2 border-primary text-foreground'
                    : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
            )}
        >
            {icon}
            {label}
        </button>
    );
}

// keyboard helper unused but needed by some sortable patterns — keep import resolvable
void sortableKeyboardCoordinates;
