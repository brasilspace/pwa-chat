import type { JSX } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

// Konzept-Settings (Modul-Cluster). Erscheint nur wenn concept-framework
// aktiv. Hier landen Konzept-Vorlagen, Eskalations-Defaults, Evaluierungs-
// Schwellwerte.
export function ConceptSection(): JSX.Element {
    const t = useT();
    return (
        <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <MaterialIcon name="menu_book" size={16} className="size-5" /> {t('settings.concept.konzepte')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.concept.vorlagen_eskalations-defaults_und_evalui')}
            </p>
            <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                {t('settings.concept.modul-spezifische_einstellungen_folgen')}
            </div>
        </div>
    );
}
