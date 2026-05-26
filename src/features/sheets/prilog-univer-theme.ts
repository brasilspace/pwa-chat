/**
 * prilog-univer-theme — Theme-Config fuer Univer in Prilog-Look.
 *
 * Univer's createUniver() akzeptiert einen `theme`-Parameter mit Farb-
 * Paletten (primary, gray, blue, ...). Die Default-Theme verwendet
 * #466AF7 als Primary — wir mappen auf Prilog's Indigo-Blau.
 *
 * Die Palette ist als 50-900 Skala angelegt (Tailwind-Style); jedes
 * Tab/Hover/Active wird daraus interpoliert.
 *
 * Quelle Prilog --primary (light): oklch(0.56 0.16 257) ≈ #2C53F1
 * (dunklerer Indigo). Wir nehmen eine feinjustierte Skala die in
 * 500 dem entspricht.
 */

import { defaultTheme } from '@univerjs/themes';

/** Prilog-Indigo (Light + Dark adaptierbar via Univer's Theme-Loader). */
const prilogPrimary = {
    50:  '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#4F61E0',  // Prilog Primary (entspricht oklch 0.56 0.16 257)
    600: '#3D4FCC',
    700: '#3340B3',
    800: '#2A3499',
    900: '#222D80',
};

/** Warm-neutrale Grays — passt besser zu Prilog's Off-White */
const prilogGray = {
    50:  '#F8F9FB',
    100: '#F1F3F7',
    200: '#E5E8EE',
    300: '#CDD2DB',
    400: '#9AA1AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
};

export const prilogUniverTheme = {
    ...defaultTheme,
    primary: prilogPrimary,
    gray: prilogGray,
};
