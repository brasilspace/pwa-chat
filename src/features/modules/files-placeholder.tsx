import type { JSX } from 'react';
import { useParams } from 'react-router-dom';
import { useSpaces } from '@/features/spaces/use-spaces';
import { DocumentsPanel } from '@/features/documents/documents-panel';
import { useSpaceCan } from '@/core/permissions';
import { useT } from "@/lib/i18n/use-t";

// Wrapper-Route: lazy-loaded Module-Tab "Dateien". Phase 11: zeigt das DMS
// (DocumentsPanel) — beinhaltet jetzt auch Chat-Anhaenge.
export const FilesPlaceholder = (): JSX.Element => {
    const t = useT();
    const { spaceId } = useParams<{ spaceId: string }>();
    const { spaces, loading } = useSpaces();
    const canDownload = useSpaceCan(spaceId, 'file:download');

    if (loading || canDownload === null) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('modules.files_placeholder.lade')}
            </div>
        );
    }

    if (canDownload === false) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('modules.files_placeholder.du_hast_keinen_zugriff_auf_dateien_in_di')}
            </div>
        );
    }

    const space = spaces.find((s) => s.id === spaceId);
    if (!space) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('modules.files_placeholder.space_nicht_gefunden')}
            </div>
        );
    }

    return <DocumentsPanel space={space} />;
};
