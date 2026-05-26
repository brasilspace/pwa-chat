import type { JSX } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

// Flow-Designer Settings (Modul-Cluster). Erscheint nur wenn cascade-Modul aktiv.
// Hier landen Default-Vorlagen, Auto-Forward-Regeln, Standard-Element-Sets.
export function CascadeSection(): JSX.Element {
    const t = useT();
    return (
        <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <MaterialIcon name="schema" size={16} className="size-5" /> {t('settings.cascade.flow-designer')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.cascade.default-vorlagen_auto-forward-regeln_und')}
            </p>
            <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                {t('settings.cascade.modul-spezifische_einstellungen_folgen')}
            </div>
        </div>
    );
}
