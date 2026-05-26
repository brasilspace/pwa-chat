/**
 * hoermi-pref-store — Persistente Ein/Aus-Praeferenz fuer den Hoermi-Helfer.
 *
 * Default: AN. Wer in den Settings deaktiviert, dem wird das Icon nicht
 * mehr im Header gezeigt. Speicherung in localStorage, weil rein lokal
 * (kein Server-Aufruf).
 */

const KEY = 'prilog-hoermi-enabled';

function read(): boolean {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem(KEY);
    if (v === null) return true; // Default an
    return v === '1';
}

function write(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, enabled ? '1' : '0');
}

const listeners = new Set<() => void>();

export const hoermiPrefStore = {
    getSnapshot(): boolean {
        return read();
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    setEnabled(enabled: boolean): void {
        write(enabled);
        for (const l of listeners) l();
    },
};
