import { useEffect, useRef, useSyncExternalStore, type JSX } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUserTypeList } from '@/features/contacts/use-user-type-list';
import { userTypeFilterStore } from '@/features/contacts/user-type-filter-store';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

/**
 * Erzeugt einen deterministischen HSL-Farbton aus einem Label, damit jeder
 * Benutzertyp ueberall dieselbe Farbe hat.
 */
export function hashHue(label: string): number {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
    }
    return hash % 360;
}

function initials(label: string): string {
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

interface SidebarUserTypeFilterProps {
    collapsed: boolean;
}

export function SidebarUserTypeFilter({ collapsed }: SidebarUserTypeFilterProps): JSX.Element | null {
    const t = useT();
    const { types, mine, loading } = useUserTypeList();
    const active = useSyncExternalStore(userTypeFilterStore.subscribe, userTypeFilterStore.getSnapshot, () => null);

    // Beim Mount einmal den eigenen Benutzertyp als Default setzen, sobald
    // er bekannt ist. Das ueberschreibt einen ggf. gespeicherten Wert aus
    // einer frueheren Session, damit du nach jedem Reload in deiner eigenen
    // Gruppe startest. Die Auswahl innerhalb der Session bleibt erhalten,
    // weil der Ref weitere Effekt-Durchlaeufe blockiert.
    const appliedDefaultRef = useRef(false);
    useEffect(() => {
        if (appliedDefaultRef.current) return;
        if (!mine) return;
        if (!types.includes(mine)) return;
        appliedDefaultRef.current = true;
        userTypeFilterStore.set(mine);
    }, [mine, types]);

    if (loading || types.length === 0) return null;

    // Reihenfolge: erst "Alle", dann (eigener Typ zuerst), dann Rest alphabetisch
    const orderedTypes = mine && types.includes(mine)
        ? [mine, ...types.filter((_t) => _t !== mine)]
        : types;

    const options: Array<{ key: string | null; label: string; hue: number | null; initial: string }> = [
        { key: null, label: 'Alle Rollen', hue: null, initial: '' },
        ...orderedTypes.map((label) => ({
            key: label,
            label,
            hue: hashHue(label),
            initial: initials(label),
        })),
    ];

    if (collapsed) {
        // Collapsed-Variante: nur der aktive Typ sichtbar, Klick oeffnet nichts
        // (Expand ist der Weg zur Auswahl). Dezenter als ein vollstaendiger Popover.
        const current = options.find((o) => o.key === active) ?? options[0]!;
        return (
            <div className="flex justify-center p-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div
                            className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full text-[0.6875rem] font-semibold text-white shadow-sm ring-2 ring-primary/40',
                            )}
                            style={current.hue !== null ? { background: `hsl(${current.hue} 55% 45%)` } : { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                        >
                            {current.key === null ? <MaterialIcon name="groups" size={16} className="size-4" /> : current.initial}
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                        {current.label}
                    </TooltipContent>
                </Tooltip>
            </div>
        );
    }

    return (
        <div className="px-2 pt-2 pb-1">
            <div className="mb-1.5 text-[0.625rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {t('app.misc.ansicht')}
            </div>
            <div className="flex flex-wrap gap-1.5">
                {options.map((option) => {
                    const isActive = option.key === active;
                    return (
                        <Tooltip key={option.key ?? '__all__'}>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={() => userTypeFilterStore.set(option.key)}
                                    className={cn(
                                        'flex h-8 w-8 items-center justify-center rounded-full text-[0.6875rem] font-semibold text-white shadow-sm transition-all duration-150',
                                        isActive
                                            ? 'ring-2 ring-primary ring-offset-1 ring-offset-sidebar-background scale-105'
                                            : 'opacity-60 hover:opacity-100 hover:scale-105',
                                    )}
                                    style={
                                        option.hue !== null
                                            ? { background: `hsl(${option.hue} 55% 45%)` }
                                            : {
                                                background: 'hsl(var(--muted))',
                                                color: 'hsl(var(--muted-foreground))',
                                            }
                                    }
                                    aria-label={option.label}
                                    aria-pressed={isActive}
                                >
                                    {option.key === null ? <MaterialIcon name="groups" size={16} className="size-4" /> : option.initial}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                {option.label}
                                {option.key === mine && option.key !== null && (
                                    <span className="ml-1 text-muted-foreground">{t('app.misc.das_bin_ich')}</span>
                                )}
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>
        </div>
    );
}
