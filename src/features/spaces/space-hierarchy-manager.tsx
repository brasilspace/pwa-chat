/**
 * SpaceHierarchyManager — Modal mit Drag & Drop fuer die Space-Hierarchie.
 * Admin kann Spaces in andere Spaces verschieben (oder ans Root). Persistiert
 * via PATCH /platform/v1/spaces/:id/parent.
 */

import { type JSX, useMemo, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useSpaces } from './use-spaces';
import { buildTree, type SpaceData, type SpaceNode } from './space-tree';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { MaterialIcon } from '@/components/ui/material-icon';
import { Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
    DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
    closestCenter, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useT } from "@/lib/i18n/use-t";

const platformGw = createPlatformGateway();

// Sammle alle Nachfahren-IDs eines Knotens (zur Cycle-Pruefung)
function collectDescendantIds(node: SpaceNode, into: Set<string>): void {
    into.add(node.space.id);
    for (const c of node.children) collectDescendantIds(c, into);
}

export function SpaceHierarchyManager({ onClose }: { onClose: () => void }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { spaces, loading, refresh } = useSpaces();
    const tree = useMemo(() => buildTree(spaces as SpaceData[]), [spaces]);
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    const blockedTargets = useMemo(() => {
        if (!activeDragId) return new Set<string>();
        const node = findNode(tree, activeDragId);
        const blocked = new Set<string>();
        if (node) collectDescendantIds(node, blocked);
        return blocked;
    }, [tree, activeDragId]);

    const onDragStart = (event: DragStartEvent) => {
        setActiveDragId(String(event.active.id));
    };

    const onDragEnd = async (event: DragEndEvent) => {
        const dragged = String(event.active.id);
        setActiveDragId(null);
        if (!event.over || !jwt) return;
        const target = String(event.over.id);
        if (target === dragged) return;

        // Cycle-Schutz: Ziel darf kein Nachfahre sein
        const draggedNode = findNode(tree, dragged);
        if (draggedNode) {
            const descendants = new Set<string>();
            collectDescendantIds(draggedNode, descendants);
            if (descendants.has(target)) {
                toast.error('Kann keinen Space in seinen eigenen Unterbaum verschieben.');
                return;
            }
        }

        const newParent = target === '__root__' ? null : target;
        const current = spaces.find(s => s.id === dragged);
        if (current && (current.parentSpaceId ?? null) === newParent) return;   // no-op

        setBusy(dragged);
        try {
            await platformGw.updateSpaceParent(jwt, dragged, newParent);
            const targetName = newParent ? spaces.find(s => s.id === newParent)?.name : 'Root-Ebene';
            toast.success(`"${current?.name}" verschoben → ${targetName}`);
            refresh();
        } catch (e) {
            toast.error('Verschieben fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 border-b px-4 py-2.5">
                    <MaterialIcon name="account_tree" size={18} className="text-primary" />
                    <h3 className="text-sm font-semibold">{t('spaces.space_hierarchy_manager.space-hierarchie_verwalten')}</h3>
                    <div className="flex-1" />
                    <span className="hidden text-[11px] text-muted-foreground md:inline">
                        {t('spaces.space_hierarchy_manager.per_dragampdrop_verschieben_auf_root_los')}
                    </span>
                    <button onClick={onClose} className="ml-2 rounded p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex h-full items-center justify-center">
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter}
                            onDragStart={onDragStart} onDragEnd={onDragEnd}>
                            <RootDropZone active={activeDragId !== null} />
                            <ul className="mt-2 space-y-0.5">
                                {tree.map(node => (
                                    <SpaceDragRow key={node.space.id} node={node} depth={0}
                                        activeDragId={activeDragId} blockedTargets={blockedTargets} busy={busy} />
                                ))}
                            </ul>
                            {tree.length === 0 && (
                                <p className="mt-6 text-center text-[12px] text-muted-foreground">{t('spaces.space_hierarchy_manager.noch_keine_spaces_angelegt')}</p>
                            )}
                        </DndContext>
                    )}
                </div>

                <div className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">
                    {t('spaces.space_hierarchy_manager.tipp_kann_nicht_in_eigenen_unterbaum_ver')}
                </div>
            </div>
        </div>
    );
}

// Hilfsfunktion: Knoten im Baum suchen
function findNode(tree: SpaceNode[], id: string): SpaceNode | null {
    for (const n of tree) {
        if (n.space.id === id) return n;
        const found = findNode(n.children, id);
        if (found) return found;
    }
    return null;
}

// ─── Root-Drop-Zone (oberhalb der Liste) ─────────────────────────────

function RootDropZone({ active }: { active: boolean }): JSX.Element {
    const t = useT();
    const { setNodeRef, isOver } = useDroppable({ id: '__root__' });
    return (
        <div ref={setNodeRef}
            className={cn(
                'rounded-md border-2 border-dashed px-3 py-2 text-[11px] transition-colors',
                active && isOver && 'border-primary bg-primary/10 text-primary',
                active && !isOver && 'border-muted-foreground/30 text-muted-foreground',
                !active && 'border-transparent text-muted-foreground',
            )}>
            <MaterialIcon name="home" size={12} className="mr-1 inline align-middle" />
            {t('spaces.space_hierarchy_manager.root-ebene')} <span className="text-[10px] opacity-60">{t('spaces.space_hierarchy_manager.drop_um_an_die_oberste_ebene_zu_schieben')}</span>
        </div>
    );
}

// ─── Space-Zeile (draggable + droppable) ─────────────────────────────

function SpaceDragRow({ node, depth, activeDragId, blockedTargets, busy }: {
    node: SpaceNode; depth: number;
    activeDragId: string | null;
    blockedTargets: Set<string>;
    busy: string | null;
}): JSX.Element {
    const { space, children, rootColor } = node;
    const isBlocked = blockedTargets.has(space.id);
    const isDragging = activeDragId === space.id;
    const isBusy = busy === space.id;

    const drag = useDraggable({ id: space.id, disabled: isBusy });
    const drop = useDroppable({ id: space.id, disabled: isBlocked });

    const setRefs = (el: HTMLLIElement | null) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
    };

    return (
        <>
            <li ref={setRefs} {...drag.attributes} {...drag.listeners}
                className={cn(
                    'group flex items-center gap-2 rounded-md py-1.5 pr-2 text-[13px] transition-colors',
                    isDragging && 'opacity-40',
                    drop.isOver && !isBlocked && !isDragging && 'bg-primary/10 ring-2 ring-primary',
                    isBlocked && activeDragId && 'opacity-30',
                    !isDragging && !drop.isOver && 'hover:bg-muted/50',
                    isBusy && 'animate-pulse',
                )}
                style={{ paddingLeft: 8 + depth * 18 }}
            >
                <MaterialIcon name="drag_indicator" size={16}
                    className="size-4 shrink-0 cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground" />
                <div className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: rootColor }} />
                <span className="min-w-0 flex-1 truncate">{space.name}</span>
                {children.length > 0 && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{children.length}</span>
                )}
                {isBusy && <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />}
            </li>
            {children.length > 0 && (
                <ul className="space-y-0.5">
                    {children.map(child => (
                        <SpaceDragRow key={child.space.id} node={child} depth={depth + 1}
                            activeDragId={activeDragId} blockedTargets={blockedTargets} busy={busy} />
                    ))}
                </ul>
            )}
        </>
    );
}
