import { type JSX, useMemo } from 'react';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { useSpaces } from '@/features/spaces/use-spaces';
import { useContacts } from '@/features/contacts/use-contacts';
import { RelationshipGraphPanel, createSpacesAdapter } from '@/features/relationship-graph';

/**
 * Hierarchie-Graph-Tab im SpaceSidePanel.
 *
 * Zeigt den aktuellen Space als Root mit Eltern-, Kinder-Spaces und
 * Mitgliedern als Beziehungsgraph. Greift auf den existierenden
 * RelationshipGraphPanel + Spaces-Adapter zurueck.
 */
export function HierarchyGraphPanel({ space }: { space: SpaceItem }): JSX.Element {
    const { spaces } = useSpaces();
    const { contacts } = useContacts();
    const adapter = useMemo(() => createSpacesAdapter(spaces, contacts), [spaces, contacts]);

    return (
        <RelationshipGraphPanel
            adapter={adapter}
            rootId={space.id}
            rootName={space.name}
        />
    );
}
