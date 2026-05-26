import { type JSX } from 'react';
import { useParams } from 'react-router-dom';
import { useSpaces } from '@/features/spaces/use-spaces';
import { LettersPanel } from '@/features/letters/letters-panel';
import { useT } from "@/lib/i18n/use-t";

export function LettersPlaceholder(): JSX.Element {
    const t = useT();
    const { spaceId } = useParams<{ spaceId: string }>();
    const { spaces } = useSpaces();
    const space = spaces.find(s => s.id === spaceId);
    if (!space) return <div className="p-4 text-sm text-muted-foreground">{t('modules.letters_placeholder.space_nicht_gefunden')}</div>;
    return <LettersPanel space={space} />;
}
