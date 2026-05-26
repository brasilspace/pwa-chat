/**
 * SectionHeader — kompakter Bar-Header fuer Detail-Panels (DMS, Document-Detail).
 *
 * Visuelle Trennung von dichten Detail-Spalten, in denen alle Texte
 * standardmaessig klein sind. Spannt sich ueber die volle Panel-Breite,
 * damit ein klar lesbares Section-Trennzeichen entsteht.
 *
 * Voraussetzung: liegt in einem Container mit `p-4` (das ist im
 * Document-Detail-Panel der Fall). `-mx-4` zieht den Header bis an die
 * Panel-Kante, `border-y` setzt klare Linien.
 */

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
    children: ReactNode;
    /** Optional: Action-Button rechts (z.B. Settings-Icon). */
    action?: ReactNode;
    className?: string;
}

export function SectionHeader({ children, action, className }: Props) {
    return (
        <div
            className={cn(
                '-mx-4 mb-2 flex items-center justify-between border-y border-border bg-muted/60 px-4 py-1.5',
                className,
            )}
        >
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                {children}
            </h3>
            {action}
        </div>
    );
}
