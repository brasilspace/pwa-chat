// Locale-aware date helpers — nutzen i18n.language statt hartcodierter
// Monats-/Wochentags-Arrays.

import { i18n } from './index';

export function getMonthNames(format: 'long' | 'short' = 'long'): string[] {
    const fmt = new Intl.DateTimeFormat(i18n.language, { month: format });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2020, i, 1)));
}

export function getMonthName(monthIndex: number, format: 'long' | 'short' = 'long'): string {
    return new Intl.DateTimeFormat(i18n.language, { month: format }).format(new Date(2020, monthIndex, 1));
}

export function getWeekdayNames(format: 'long' | 'short' | 'narrow' = 'short', mondayFirst = true): string[] {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: format });
    // 2024-01-01 war ein Montag — wir nehmen diesen als Anker für Mo-First-Reihenfolge.
    const baseMonday = new Date(2024, 0, 1);
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(baseMonday);
        d.setDate(baseMonday.getDate() + i);
        return fmt.format(d);
    });
    if (!mondayFirst) {
        // Sonntag an den Anfang
        const sunday = days.pop()!;
        days.unshift(sunday);
    }
    return days;
}

export function formatLocaleDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(i18n.language, options ?? { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}
