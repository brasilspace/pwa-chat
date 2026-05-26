// Pseudo-Locale — Layout-Bug-Detektor.
//
// Aktiviert per `?lang=xx-pl` oder `localStorage.setItem('prilog-locale', 'xx-pl')`.
// Nimmt _jeden_ Default-DE-String und transformiert ihn so:
//
//   "Speichern" → "[!! Şpéíčhéŕń łłłł]"
//
// Effekte:
//  - Eckige Klammern + Ausrufezeichen am Anfang → sofort sichtbar wenn
//    irgendwo ein nicht-uebersetzter String durchrutscht (man sieht den
//    eckigen Klammern)
//  - Accents auf jedem Buchstaben → Unicode-Edge-Cases (ä-Renderer,
//    Schriftarten ohne diakritische Zeichen)
//  - 50% mehr Zeichen am Ende → Layout-Tests: Buttons zu schmal,
//    Truncation-Probleme, abgeschnittene Texte
//
// Der String bleibt _semantisch_ erkennbar — Native-Speaker:innen
// koennen ihn lesen.

import { i18n, type SupportedLocale } from './index';

const PSEUDO_LOCALE = 'xx-pl';

const ACCENTS: Record<string, string> = {
    a: 'á', A: 'Ǎ',
    b: 'ƀ', B: 'Ɓ',
    c: 'č', C: 'Č',
    d: 'ď', D: 'Ď',
    e: 'é', E: 'É',
    f: 'ƒ', F: 'Ƒ',
    g: 'ǵ', G: 'Ǵ',
    h: 'ħ', H: 'Ĥ',
    i: 'í', I: 'Í',
    j: 'ǰ', J: 'Ĵ',
    k: 'ķ', K: 'Ķ',
    l: 'ł', L: 'Ł',
    m: 'ḿ', M: 'Ḿ',
    n: 'ń', N: 'Ń',
    o: 'ǒ', O: 'Ǒ',
    p: 'ṕ', P: 'Ṕ',
    q: 'q́', Q: 'Q́',
    r: 'ŕ', R: 'Ŕ',
    s: 'š', S: 'Š',
    t: 'ť', T: 'Ť',
    u: 'ǔ', U: 'Ǔ',
    v: 'ṽ', V: 'Ṽ',
    w: 'ẃ', W: 'Ẃ',
    x: 'ẍ', X: 'Ẍ',
    y: 'ý', Y: 'Ý',
    z: 'ž', Z: 'Ž',
};

function transform(input: string): string {
    // Akzentuieren, aber ICU-Platzhalter ({{name}}, {count, plural, …})
    // bleiben unangetastet, sonst zerbricht i18next.
    let result = '';
    let depth = 0;
    for (const ch of input) {
        if (ch === '{') depth++;
        if (ch === '}' && depth > 0) {
            result += ch;
            depth--;
            continue;
        }
        if (depth > 0) {
            result += ch;
        } else {
            result += ACCENTS[ch] ?? ch;
        }
    }
    // Padding: 50% extra Zeichen am Ende — Layout-Test
    const pad = Math.max(2, Math.ceil(input.length * 0.5));
    return `[!! ${result}${' łłł'.repeat(Math.ceil(pad / 4))}]`;
}

/**
 * Baut ein neues Resource-Bundle aus dem aktiven Default-Bundle,
 * registriert es unter `xx-PL`. Wird beim i18n-Init aufgerufen wenn
 * der User die pseudo-Locale waehlt.
 *
 * Iteriert ueber alle deutschen Strings und transformiert sie. Das
 * ist O(n) und passiert nur einmal beim Boot bei dieser Locale.
 */
export function registerPseudoLocale(): void {
    const all = i18n.getResourceBundle('de', 'common');
    if (!all) return;
    const transformed = walkAndTransform(all);
    i18n.addResourceBundle(PSEUDO_LOCALE, 'common', transformed, true, true);
}

function walkAndTransform(obj: unknown): unknown {
    if (typeof obj === 'string') return transform(obj);
    if (Array.isArray(obj)) return obj.map(walkAndTransform);
    if (typeof obj === 'object' && obj !== null) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = walkAndTransform(v);
        }
        return out;
    }
    return obj;
}

export function isPseudoLocale(locale: string): boolean {
    return locale === PSEUDO_LOCALE || locale.startsWith('xx-');
}

export const PSEUDO_LOCALES_FOR_REGISTRY = [PSEUDO_LOCALE] as const;
export type PseudoLocaleCode = typeof PSEUDO_LOCALE;

// Export auch fuer die Typ-Erweiterung
export const PSEUDO_LOCALE_CODE: SupportedLocale | 'xx-pl' = PSEUDO_LOCALE as never;
