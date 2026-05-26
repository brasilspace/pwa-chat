import type { JSX } from 'react';
import { useParams } from 'react-router-dom';
import { useSpaces } from '@/features/spaces/use-spaces';
import { CalendarPanel } from '@/features/spaces/panels/calendar-panel';
import { useT } from "@/lib/i18n/use-t";

// Wrapper-Route: lazy-loaded Module-Tab "Kalender". Wie FilesPlaceholder
// nur ein duenner Wrapper auf den echten CalendarPanel.
export const CalendarPlaceholder = (): JSX.Element => {
    const t = useT();
    const { spaceId } = useParams<{ spaceId: string }>();
    const { spaces, loading } = useSpaces();

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('modules.calendar_placeholder.lade')}
            </div>
        );
    }

    const space = spaces.find((s) => s.id === spaceId);
    if (!space) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('modules.calendar_placeholder.space_nicht_gefunden')}
            </div>
        );
    }

    return <CalendarPanel space={space} />;
};
