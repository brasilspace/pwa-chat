import type { JSX } from 'react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSpaces } from '@/features/spaces/use-spaces';
import { useContacts } from '@/features/contacts/use-contacts';
import { RelationshipGraphPanel, createSpacesAdapter } from '@/features/relationship-graph';
import { useT } from "@/lib/i18n/use-t";

export const RelationshipGraphPlaceholder = (): JSX.Element => {
    const t = useT();
    const { spaceId } = useParams<{ spaceId: string }>();
    const { spaces, loading } = useSpaces();
    const { contacts } = useContacts();

    const adapter = useMemo(() => createSpacesAdapter(spaces, contacts), [spaces, contacts]);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('modules.relationship_graph_placeholder.lade')}
            </div>
        );
    }

    const space = spaces.find((s) => s.id === spaceId);
    if (!space) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('modules.relationship_graph_placeholder.space_nicht_gefunden')}
            </div>
        );
    }

    return <RelationshipGraphPanel adapter={adapter} rootId={space.id} rootName={space.name} />;
};
