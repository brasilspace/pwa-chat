/**
 * stundenplan-store.ts
 *
 * Schmaler shared Store fuer Stundenplan-spezifische UI-Zustaende, die sowohl
 * von der Sidebar (StundenplanWorld) als auch vom Hauptpanel (StundenplanHub)
 * gesetzt/gelesen werden.
 *
 * Pattern wie `calendar-layers-store.ts`: subscribe/getSnapshot-API fuer
 * useSyncExternalStore. Kein Redux/Zustand noetig fuer so kleinen Scope.
 *
 * Speichert:
 *   - `scenarioId`         — aktuell ausgewaehltes Szenario
 *   - `openPanel`          — welches Slide-Over-Panel ist offen
 *                            (stammdaten | bands | bulk-import | publish | null)
 *
 * Szenarien-LISTE selbst lebt nicht hier — die laesst sich beidseitig per
 * gateway.listScenarios laden, mit TanStack-Query bekommen beide einen
 * gemeinsamen Cache.
 */

export type StundenplanPanel = 'stammdaten' | 'bands' | 'bulk-import' | 'publish' | 'pre-pinning' | null;

interface StundenplanUiState {
    scenarioId: string | undefined;
    openPanel: StundenplanPanel;
}

let state: StundenplanUiState = {
    scenarioId: undefined,
    openPanel: null,
};

const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

export const stundenplanStore = {
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    getSnapshot(): StundenplanUiState {
        return state;
    },
    setScenarioId(id: string | undefined) {
        if (state.scenarioId === id) return;
        state = { ...state, scenarioId: id };
        emit();
    },
    openPanel(panel: Exclude<StundenplanPanel, null>) {
        if (state.openPanel === panel) return;
        state = { ...state, openPanel: panel };
        emit();
    },
    closePanel() {
        if (state.openPanel === null) return;
        state = { ...state, openPanel: null };
        emit();
    },
};
