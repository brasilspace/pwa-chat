/**
 * LanguageSection — Sprach-Umschaltung.
 *
 * Phase 0 der i18n-Foundation. Schreibt die Auswahl in localStorage
 * (siehe lib/i18n/index.ts → detection.caches), nach dem Reload greift
 * sie automatisch.
 *
 * Spaeter (Phase 4+): Synchronisierung mit User-Profil im Backend,
 * damit die Sprache auch auf einem anderen Geraet gleich greift.
 */

import { type JSX, useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { useT, useLocale, useChangeLocale } from '@/lib/i18n/use-t';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const LOCALE_FLAGS: Record<SupportedLocale, string> = {
    de: '🇩🇪',
    en: '🇬🇧',
    fr: '🇫🇷',
    it: '🇮🇹',
    es: '🇪🇸',
    pl: '🇵🇱',
    nl: '🇳🇱',
};

export function LanguageSection(): JSX.Element {
    const t = useT();
    const locale = useLocale();
    const changeLocale = useChangeLocale();
    const [pending, setPending] = useState<string | null>(null);

    const currentBase = locale.split('-')[0];

    const handleSelect = async (target: SupportedLocale) => {
        if (target === currentBase || pending) return;
        setPending(target);
        try {
            await changeLocale(target);
        } finally {
            setPending(null);
        }
    };

    return (
        <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Globe className="size-5" /> {t('settings.language.title')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.language.description')}
            </p>

            <div className="mt-6 space-y-2">
                {SUPPORTED_LOCALES.map((loc) => {
                    const isActive = currentBase === loc;
                    return (
                        <button
                            key={loc}
                            onClick={() => handleSelect(loc)}
                            disabled={pending !== null}
                            className={cn(
                                'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors',
                                isActive
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:bg-muted/50',
                                pending && 'opacity-50',
                            )}
                        >
                            <span className="flex items-center gap-3">
                                <span className="text-xl" aria-hidden="true">{LOCALE_FLAGS[loc]}</span>
                                <span className="text-sm font-medium">{t(`settings.language.${loc}`)}</span>
                            </span>
                            {isActive && <Check className="size-4 text-primary" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
