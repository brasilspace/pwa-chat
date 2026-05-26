export type ContrastLevel = 'normal' | 'medium' | 'high';

const STORAGE_KEY = 'prilog.contrast';

const listeners = new Set<() => void>();
let current: ContrastLevel = (localStorage.getItem(STORAGE_KEY) as ContrastLevel) || 'normal';
let snapshot = { contrast: current };

// Beim Laden sofort anwenden
applyClass(current);

function applyClass(level: ContrastLevel) {
    const el = document.documentElement;
    el.classList.remove('contrast-medium', 'contrast-high');
    if (level === 'medium') el.classList.add('contrast-medium');
    if (level === 'high') el.classList.add('contrast-high');
}

function emit() {
    snapshot = { contrast: current };
    for (const fn of listeners) fn();
}

export const contrastSettings = {
    get() { return snapshot; },
    set(level: ContrastLevel) {
        current = level;
        localStorage.setItem(STORAGE_KEY, level);
        applyClass(level);
        emit();
    },
    subscribe(fn: () => void) {
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    },
};
