/**
 * Generische Daten-Typen fuer den Beziehungs-Graph.
 *
 * Pro Hub gibt es einen Adapter, der Hub-spezifische Daten in dieses
 * Modell uebersetzt. Das Modal selbst ist Hub-agnostisch und rendert
 * nur Nodes + Edges.
 */

export type GraphNodeKind =
    | 'person'        // Mitglied / Externe
    | 'space'         // Space / Klasse
    | 'task'          // Aufgabe
    | 'event'         // Kalender-Termin
    | 'file'          // Dokument / Datei
    | 'tag'           // Tag-Knoten (gruppiert mehrere)
    | 'group';        // Andere Gruppen-Knoten

export interface GraphCategory {
    name: string;
    color: string;
}

export interface GraphNode {
    id: string;
    name: string;
    kind: GraphNodeKind;
    /** Index in der adapter-spezifischen categories[]-Liste fuer ECharts. */
    category: number;
    /** Groesse 30..70. Root ist meist 60. */
    symbolSize: number;
    /** Optionales Sub-Label (Rolle / Typ etc.). */
    subtitle?: string;
    /** Wenn true: Linksklick im Modal pivoted auf diesen Knoten. */
    pivotable?: boolean;
    /**
     * Optionaler Hint fuer die visuelle Form (Adapter-gesetzt). Wenn fehlt,
     * leitet graph-symbols.resolveSymbol() aus kind+subtitle her.
     * Siehe graph-symbols.ts → VisualType.
     */
    visualType?: 'space-1' | 'space-2' | 'space-3' | 'staff' | 'parents' | 'student' | 'external-contact'
        | 'task' | 'document' | 'event' | 'flow' | 'tag' | 'group';
    /** Fuer Space-Knoten: Tiefe in der Hierarchie (0=top, 1=eingenistet, 2+=tief). */
    hierarchyDepth?: number;
    /**
     * Optional: harter Color-Override fuer itemStyle.color. Wenn gesetzt,
     * uebersteuert er die Kategorie-Farbe. Wird z.B. genutzt damit alle
     * Spaces einer Schul-Hierarchie die Farbe des Top-Spaces tragen.
     */
    color?: string;
}

export interface GraphEdge {
    source: string;
    target: string;
    /** Beziehungs-Label (z.B. 'Klassenleitung'). */
    label?: string;
    /** Linien-Farbe; default = Quelle-Knoten-Farbe (lineStyle: 'source'). */
    color?: string;
    dashed?: boolean;
    width?: number;
}

export interface GraphData {
    rootId: string;
    rootName: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    /** Optionale Adapter-spezifische Categories fuer ECharts Legende. */
    categories: GraphCategory[];
}

export interface GraphPivotCandidate {
    id: string;
    name: string;
    subtitle?: string;
}

/**
 * Adapter-Interface — pro Hub einer.
 *
 * Der Adapter ist die einzige Stelle, an der Hub-spezifische Logik liegt.
 * Modal/Force-Sim/Tooltip/Click-Handler sind generisch.
 */
export interface GraphAdapter {
    /** Anzeige-Name der Hub-Domain, fuer Modal-Titel ("Familiengraph", "Space-Netz", ...). */
    domain: string;
    /** Welt-Icon (Material) fuer Modal-Header. */
    icon: string;

    /**
     * Liefert Daten fuer einen Root. Optional kann der Adapter auf Filter/
     * Toggles reagieren (z.B. "Schule einblenden") — der options-Param ist
     * frei. Schemata stehen pro Adapter in den Doc-Kommentaren.
     */
    loadGraph(input: {
        rootId: string;
        jwt: string;
        options?: Record<string, unknown>;
    }): Promise<GraphData>;

    /**
     * Liste pivotbarer Kandidaten fuer das Such-Feld. Sucht z.B. ueber alle
     * Personen / Spaces / Aufgaben — die Quelle haengt vom Adapter ab.
     */
    searchPivotTargets(query: string): GraphPivotCandidate[];

    /** Optional: pro-Knoten-Aktionen im Kontextmenue. */
    nodeActions?(node: GraphNode): Array<{
        icon: string;
        label: string;
        onClick: (navigate: (path: string) => void, onClose: () => void) => void;
    }>;
}
