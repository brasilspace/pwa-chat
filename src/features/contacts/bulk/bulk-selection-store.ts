/**
 * bulk-selection-store
 *
 * Zentraler Snapshot der aktuell im Hub markierten Kontakte. Wird vom
 * ContactsHub gefuellt und u.a. von der App-Sidebar gelesen, damit
 * "+ Button pro Gruppe/Tag" direkt mit der lebenden Selektion arbeiten kann.
 */
export interface BulkSelectionEntry {
    /** ContactView.id (prefixt mit m:/x:) — fuer UI-Lookups. */
    id: string;
    /** Roher refId — Matrix-ID bei Mitgliedern, ExternalContact-ID sonst. */
    refId: string;
    source: 'member' | 'person' | 'organization';
}

interface State {
    entries: Map<string, BulkSelectionEntry>;
}

type Listener = () => void;

let snapshot: State = { entries: new Map() };
const listeners = new Set<Listener>();
const emit = () => { for (const l of listeners) l(); };

export const bulkSelectionStore = {
    subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
    getSnapshot(): State { return snapshot; },
    /** Vollstaendiger Replace — der Hub pusht hier seine aktuelle Selektion. */
    set(entries: BulkSelectionEntry[]) {
        const m = new Map<string, BulkSelectionEntry>();
        for (const e of entries) m.set(e.id, e);
        snapshot = { entries: m };
        emit();
    },
    clear() {
        snapshot = { entries: new Map() };
        emit();
    },
    /** Hilfsfunktion: Mitglieder-Targets fuer Tag-Bulks. */
    memberTargets(): Array<{ userMatrixId: string }> {
        const out: Array<{ userMatrixId: string }> = [];
        for (const e of snapshot.entries.values()) {
            if (e.source === 'member' && e.refId) out.push({ userMatrixId: e.refId });
        }
        return out;
    },
    /** Hilfsfunktion: Gemischte Targets fuer Gruppen-Bulks (Mitglieder UND externe). */
    contactTargets(): Array<{ userMatrixId?: string; externalContactId?: string }> {
        const out: Array<{ userMatrixId?: string; externalContactId?: string }> = [];
        for (const e of snapshot.entries.values()) {
            if (!e.refId) continue;
            if (e.source === 'member') out.push({ userMatrixId: e.refId });
            else out.push({ externalContactId: e.refId });
        }
        return out;
    },
};
