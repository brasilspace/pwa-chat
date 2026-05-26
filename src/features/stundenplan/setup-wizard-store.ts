/**
 * setup-wizard-store.ts
 *
 * Zustand fuer den Schuljahr-Setup-Wizard mit localStorage-persist, sodass
 * Abbruch + Re-entry funktioniert. Per-User-Browser, kein Backend.
 *
 * Pattern: subscribe/getSnapshot fuer useSyncExternalStore (wie
 * stundenplan-store.ts).
 */

const STORAGE_KEY = 'prilog.stundenplan.wizard.v1';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface WizardForm {
    name: string;
    region: string; // z.B. 'bayern'
    schoolType: string; // z.B. 'gymnasium-g9'
    lehrplanKey: string | null; // z.B. 'bayern-gymnasium-g9.json'
    skipLehrplan: boolean;
    skipTeacherWarning: boolean;
    /** Wenn !== null: gerade laufende Solver-Jobs Id (Final-Step). */
    finalSolveJobId: string | null;
}

interface WizardState {
    open: boolean;
    currentStep: WizardStep;
    form: WizardForm;
    /** Wenn !== null: ein begonnener-aber-nicht-abgeschlossener Wizard */
    persistedAt: string | null;
    /** Nach erfolgreichem Anlegen: das frisch erzeugte Szenario. */
    createdScenarioId: string | null;
    /** Vollbild-Modus: Panel deckt fast den ganzen Viewport ab. */
    expanded: boolean;
}

function defaultName(): string {
    // Aktuelles oder kommendes Schuljahr nach DE-Konvention.
    // Schuljahres-Start liegt ueblicherweise im August/September.
    const now = new Date();
    const month = now.getMonth() + 1; // 1..12
    const year = now.getFullYear();
    // Ab August: aktuelles Jahr/naechstes Jahr (z.B. 2026/27 ab Aug 2026).
    // Vor August: vorheriges/aktuelles Jahr (Schuljahr laeuft noch).
    const start = month >= 8 ? year : year - 1;
    const endShort = String((start + 1) % 100).padStart(2, '0');
    return `Schuljahr ${start}/${endShort}`;
}

function defaultForm(): WizardForm {
    return {
        name: defaultName(),
        region: 'bayern',
        schoolType: 'gymnasium-g9',
        lehrplanKey: null,
        skipLehrplan: false,
        skipTeacherWarning: false,
        finalSolveJobId: null,
    };
}

let state: WizardState = loadFromStorage() ?? {
    open: false,
    currentStep: 1,
    form: defaultForm(),
    persistedAt: null,
    createdScenarioId: null,
    expanded: false,
};

function loadFromStorage(): WizardState | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<WizardState>;
        // Wenn ein abgeschlossener Wizard (oder Schmuetz) — zurueck zum Default.
        if (!parsed.persistedAt) return null;
        return {
            open: false, // Beim Page-Reload nicht auto-oeffnen
            currentStep: (parsed.currentStep ?? 1) as WizardStep,
            form: { ...defaultForm(), ...(parsed.form ?? {}) },
            persistedAt: parsed.persistedAt ?? null,
            createdScenarioId: parsed.createdScenarioId ?? null,
            expanded: parsed.expanded ?? false,
        };
    } catch {
        return null;
    }
}

function persist() {
    if (typeof window === 'undefined') return;
    try {
        if (state.persistedAt) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } else {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        // Quota voll? Egal — Wizard funktioniert auch ohne persist.
    }
}

const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
    persist();
}

export const setupWizardStore = {
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    getSnapshot(): WizardState {
        return state;
    },
    open() {
        // Resume-Logik: wenn schon ein Szenario angelegt wurde (User hatte
        // den Wizard durchgespielt, aber Job lief schief), direkt zu Step 7
        // springen — sonst muesste er sich erneut durch alle 7 Steps klicken.
        const resumeStep: WizardStep = state.createdScenarioId ? 7 : state.currentStep;
        state = {
            ...state,
            open: true,
            currentStep: resumeStep,
            persistedAt: state.persistedAt ?? new Date().toISOString(),
        };
        emit();
    },
    close() {
        state = { ...state, open: false };
        emit();
    },
    next() {
        const next = Math.min(7, state.currentStep + 1) as WizardStep;
        state = { ...state, currentStep: next };
        emit();
    },
    prev() {
        const prev = Math.max(1, state.currentStep - 1) as WizardStep;
        state = { ...state, currentStep: prev };
        emit();
    },
    goTo(step: WizardStep) {
        state = { ...state, currentStep: step };
        emit();
    },
    setForm(patch: Partial<WizardForm>) {
        state = { ...state, form: { ...state.form, ...patch } };
        emit();
    },
    setCreatedScenarioId(id: string | null) {
        state = { ...state, createdScenarioId: id };
        emit();
    },
    toggleExpanded() {
        state = { ...state, expanded: !state.expanded };
        emit();
    },
    /** Wizard erfolgreich abgeschlossen — Persist und Form zuruecksetzen. */
    finish() {
        state = {
            open: false,
            currentStep: 1,
            form: defaultForm(),
            persistedAt: null,
            createdScenarioId: null,
            expanded: false,
        };
        if (typeof window !== 'undefined') {
            try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        }
        emit();
    },
    /** Hat der User einen Wizard nicht abgeschlossen? */
    hasUnfinished(): boolean {
        return state.persistedAt !== null && state.createdScenarioId === null;
    },
};
