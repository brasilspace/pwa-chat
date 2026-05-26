/**
 * graph-symbols.ts — SVG-Path-Symbole fuer den Beziehungs-Graph.
 *
 * ECharts faerbt das Path-Symbol mit `itemStyle.color` (= Kategorie-Farbe).
 * Deshalb haben wir hier nur die FORM — die Farbe bleibt bei den Kategorien.
 *
 * Form unterscheidet den Knoten-Typ (Space, Person, Aufgabe, Dokument, ...),
 * Farbe unterscheidet die Kategorie/Rolle (Eltern, Lehrkraft, Schueler, ...).
 *
 * Pfad-Konvention: 0..100 viewBox, zentriert. ECharts skaliert auf symbolSize.
 */

import type { GraphNode } from './graph-types';

// ────────────────────────────────────────────────────────────────────────
// Annulus-Helper — gefuellter Ring zwischen rOuter und rInner (cx=cy=50).
// Outer-Kreis cw, Inner-Kreis ccw → nonzero-winding-fill ergibt Annulus.
// ────────────────────────────────────────────────────────────────────────
function annulus(rOuter: number, rInner: number): string {
    const cx = 50, cy = 50;
    return (
        `M${cx + rOuter} ${cy} ` +
        `A${rOuter} ${rOuter} 0 1 0 ${cx - rOuter} ${cy} ` +
        `A${rOuter} ${rOuter} 0 1 0 ${cx + rOuter} ${cy} Z ` +
        `M${cx + rInner} ${cy} ` +
        `A${rInner} ${rInner} 0 1 1 ${cx - rInner} ${cy} ` +
        `A${rInner} ${rInner} 0 1 1 ${cx + rInner} ${cy} Z`
    );
}

/**
 * Konzentrische Ringe — count={1,2,3}. Je tiefer ein Space in der Hierarchie
 * sitzt, desto mehr Ringe.
 */
function spaceRings(count: 1 | 2 | 3): string {
    if (count === 1) return annulus(45, 36);
    if (count === 2) return [annulus(45, 36), annulus(28, 19)].join(' ');
    return [annulus(45, 38), annulus(30, 23), annulus(15, 8)].join(' ');
}

// ────────────────────────────────────────────────────────────────────────
// Personen-Silhouette (Kopf + Schultern). Geschlechtsneutral — die Rolle
// (Mitarbeiter / Eltern / Schueler / Extern) kommt ueber die Kategorie-Farbe.
// ────────────────────────────────────────────────────────────────────────
const HEAD = 'M50 14 a14 14 0 1 0 0.01 0 z';
const TORSO = 'M50 33 c-16 0 -27 9 -27 24 v15 h54 v-15 c0 -15 -11 -24 -27 -24 z';

const PERSON = `${HEAD} ${TORSO}`;

/**
 * Student — Person mit Doktorhut. Identifiziert minderjaehrige Lernende.
 */
const STUDENT = `${HEAD} ${TORSO} M28 10 l22 -8 l22 8 l-22 8 z M68 11 v6 a2 2 0 0 1 -2 2 h-2 v-8 z`;

/**
 * Externer Kontakt — Person mit Sternchen-Markierung "ausserhalb".
 */
const EXTERNAL = `${HEAD} ${TORSO} M78 16 l3 0 l0 -7 l-3 0 z M73 13 l7 0 l0 -3 l-7 0 z M73 22 l7 0 l0 -3 l-7 0 z M82 13 l7 0 l0 -3 l-7 0 z`;

/**
 * Eltern-Paar — zwei verbundene Personen-Silhouetten. Funktioniert fuer
 * alle Familienkonstellationen (kein Mann/Frau-Stereotyp).
 */
const PARENTS =
    // Linke Person
    'M35 18 a10 10 0 1 0 0.01 0 z M35 32 c-11 0 -18 6 -18 16 v14 h36 v-14 c0 -10 -7 -16 -18 -16 z ' +
    // Rechte Person
    'M65 18 a10 10 0 1 0 0.01 0 z M65 32 c-11 0 -18 6 -18 16 v14 h36 v-14 c0 -10 -7 -16 -18 -16 z';

/**
 * Mitarbeiter (Lehrkraft/Verwaltung) — Person mit Aktentaschen-Hint.
 */
const STAFF =
    `${HEAD} ${TORSO} ` +
    // kleines Koffer-Symbol unten rechts
    'M70 65 h12 v10 h-12 z M74 62 h4 v3 h-4 z';

// ────────────────────────────────────────────────────────────────────────
// Objekt-Symbole — Welt-Icon-Konsistenz
// ────────────────────────────────────────────────────────────────────────

/**
 * Aufgabe — Checkbox mit Haken. Wie das Welt-Icon (checklist).
 */
const TASK =
    'M20 15 h60 a5 5 0 0 1 5 5 v60 a5 5 0 0 1 -5 5 h-60 a5 5 0 0 1 -5 -5 v-60 a5 5 0 0 1 5 -5 z ' +
    // Innenflaeche aussparen (ccw → bleibt leer)
    'M22 22 v56 a3 3 0 0 0 3 3 h50 a3 3 0 0 0 3 -3 v-56 a3 3 0 0 0 -3 -3 h-50 a3 3 0 0 0 -3 3 z ' +
    // Hakensymbol
    'M30 50 l5 -5 l8 8 l20 -20 l5 5 l-25 25 z';

/**
 * Dokument — Seite mit umgeknickter Ecke.
 */
const DOCUMENT =
    'M25 12 h35 l20 20 v50 a4 4 0 0 1 -4 4 h-51 a4 4 0 0 1 -4 -4 v-66 a4 4 0 0 1 4 -4 z ' +
    'M60 12 v20 h20 z';

/**
 * Kalender-Event — Kalenderblatt mit Linien.
 */
const EVENT =
    'M15 22 h70 a4 4 0 0 1 4 4 v58 a4 4 0 0 1 -4 4 h-70 a4 4 0 0 1 -4 -4 v-58 a4 4 0 0 1 4 -4 z ' +
    // Aussparung Innenflaeche
    'M16 38 v44 a3 3 0 0 0 3 3 h62 a3 3 0 0 0 3 -3 v-44 z ' +
    // Aufhaengungen
    'M26 14 h4 v14 h-4 z M70 14 h4 v14 h-4 z';

/**
 * Flow / Workflow — drei verbundene Knoten.
 */
const FLOW =
    // Knoten 1 (oben links)
    'M28 28 a8 8 0 1 0 0.01 0 z ' +
    // Knoten 2 (oben rechts)
    'M72 28 a8 8 0 1 0 0.01 0 z ' +
    // Knoten 3 (unten)
    'M50 72 a8 8 0 1 0 0.01 0 z ' +
    // Verbindungen (dicke Linien als Polygone)
    'M34 32 l32 0 l0 4 l-32 0 z ' +
    'M34 38 l16 28 l-3 2 l-16 -28 z ' +
    'M66 38 l-16 28 l-3 -2 l16 -28 z';

/**
 * Tag — klassisches Label mit Loch.
 */
const TAG =
    'M14 50 v-30 a4 4 0 0 1 4 -4 h30 l40 40 a4 4 0 0 1 0 6 l-30 30 a4 4 0 0 1 -6 0 z ' +
    'M27 24 a4 4 0 1 0 0.01 0 z';

/**
 * Gruppe (Fallback) — Personenstapel.
 */
const GROUP_ICON =
    // Hintere Person
    'M50 14 a10 10 0 1 0 0.01 0 z M50 30 c-14 0 -24 8 -24 22 v14 h48 v-14 c0 -14 -10 -22 -24 -22 z ' +
    // Vordere kleine Person
    'M30 38 a7 7 0 1 0 0.01 0 z M30 50 c-9 0 -15 5 -15 13 v17 h30 v-17 c0 -8 -6 -13 -15 -13 z ' +
    'M70 38 a7 7 0 1 0 0.01 0 z M70 50 c-9 0 -15 5 -15 13 v17 h30 v-17 c0 -8 -6 -13 -15 -13 z';

// ────────────────────────────────────────────────────────────────────────
// Resolver — pickt aus GraphNode den passenden ECharts-Symbol-String
// ────────────────────────────────────────────────────────────────────────

export type VisualType =
    | 'space-1' | 'space-2' | 'space-3'
    | 'staff' | 'parents' | 'student' | 'external-contact'
    | 'task' | 'document' | 'event' | 'flow' | 'tag' | 'group';

const SYMBOL_BY_VISUAL: Record<VisualType, string> = {
    'space-1': `path://${spaceRings(1)}`,
    'space-2': `path://${spaceRings(2)}`,
    'space-3': `path://${spaceRings(3)}`,
    staff: `path://${STAFF}`,
    parents: `path://${PARENTS}`,
    student: `path://${STUDENT}`,
    'external-contact': `path://${EXTERNAL}`,
    task: `path://${TASK}`,
    document: `path://${DOCUMENT}`,
    event: `path://${EVENT}`,
    flow: `path://${FLOW}`,
    tag: `path://${TAG}`,
    group: `path://${GROUP_ICON}`,
};

/**
 * Erweitert GraphNode um optionalen visualType-Hint, den der Adapter setzt.
 * Wenn nicht gesetzt, faellt resolveSymbol auf eine sinnvolle Heuristik
 * aus `kind` + `subtitle` zurueck.
 */
export interface NodeWithVisual extends GraphNode {
    visualType?: VisualType;
    /** Fuer Space-Knoten: Hierarchie-Tiefe (0=top, 1=erste Verschachtelung, ...). */
    hierarchyDepth?: number;
}

/**
 * Resolved den ECharts-Symbol-String fuer einen Knoten.
 * Fallback: 'circle' wenn nichts matcht (sicheres Default).
 */
export function resolveSymbol(node: NodeWithVisual): string {
    if (node.visualType) {
        const sym = SYMBOL_BY_VISUAL[node.visualType];
        if (sym) return sym;
    }

    // Heuristik aus kind + subtitle wenn visualType fehlt
    if (node.kind === 'space') {
        const depth = node.hierarchyDepth ?? 0;
        if (depth <= 0) return SYMBOL_BY_VISUAL['space-1'];
        if (depth === 1) return SYMBOL_BY_VISUAL['space-2'];
        return SYMBOL_BY_VISUAL['space-3'];
    }
    if (node.kind === 'task') return SYMBOL_BY_VISUAL.task;
    if (node.kind === 'file') return SYMBOL_BY_VISUAL.document;
    if (node.kind === 'event') return SYMBOL_BY_VISUAL.event;
    if (node.kind === 'tag') return SYMBOL_BY_VISUAL.tag;
    if (node.kind === 'group') return SYMBOL_BY_VISUAL.group;
    if (node.kind === 'person') {
        const sub = node.subtitle?.toLowerCase() ?? '';
        if (sub.includes('schueler') || sub.includes('schüler') || sub.includes('kind') || sub === 'minor') return SYMBOL_BY_VISUAL.student;
        if (sub.includes('eltern') || sub.includes('mutter') || sub.includes('vater') || sub === 'guardian') return SYMBOL_BY_VISUAL.staff;
        if (sub.includes('extern')) return SYMBOL_BY_VISUAL['external-contact'];
        return SYMBOL_BY_VISUAL.staff;
    }

    return 'circle';
}
