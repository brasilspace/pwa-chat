// In-Context-Edit — Stift-Overlay ueber jedem t()-Resultat.
//
// Aktivierung:
//   1. URL ?i18n-edit=1 (einmalig per Reload)
//   2. Wird in localStorage gespeichert, also bleibt aktiv bis ?i18n-edit=0
//
// Effekt:
//  - Jeder DOM-Knoten der von t() befuellt wird kriegt einen
//    data-i18n-key="<namespace>:<key>" Attribut
//  - Ein Mouse-Hover zeigt ein Stift-Icon-Overlay
//  - Klick darauf oeffnet admin.prilog.chat/i18n?focus=<key> in neuem Tab
//
// Wir nutzen NICHT i18next's eingebaute Markierungen, weil die nicht
// React-friendly sind. Stattdessen: ein Mutation-Observer scannt nach
// data-i18n-key Attributen + setzt die Overlay-Listener nach.

import { i18n } from './index';

const ATTR = 'data-i18n-key';
const STORAGE_KEY = 'prilog-i18n-edit';
const ADMIN_BASE = 'https://admin.prilog.chat';

let active = false;
let overlay: HTMLDivElement | null = null;
let hideTimer: number | null = null;

/**
 * Pruefe URL-Param + localStorage, aktiviere/deaktiviere wenn noetig.
 */
export function initInContextEdit(): void {
    // Param sowohl in ?search ALS AUCH im #hash suchen (Hash-Routing /
    // Deep-Links): so wirkt ?i18n-edit=0 zuverlässig zum Aussteigen.
    const hashQuery = window.location.hash.includes('?')
        ? window.location.hash.slice(window.location.hash.indexOf('?') + 1)
        : '';
    const params = new URLSearchParams(`${window.location.search.replace(/^\?/, '')}&${hashQuery}`);
    const urlVal = params.get('i18n-edit');
    if (urlVal === '1') {
        localStorage.setItem(STORAGE_KEY, '1');
    } else if (urlVal === '0') {
        localStorage.removeItem(STORAGE_KEY);
    }
    if (localStorage.getItem(STORAGE_KEY) === '1') {
        enable();
    }
}

/** Aktueller Zustand laut localStorage (für den Admin-Schalter). */
export function isInContextEditEnabled(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Expliziter An/Aus-Schalter (Admin → Sprache). Setzt/entfernt den
 * localStorage-Marker und lädt neu — der Modus selbst ist reload-
 * basiert (siehe initInContextEdit). Verhindert das „bleibt hängen"-
 * Problem, weil der Zustand jetzt sichtbar steuerbar ist.
 */
export function setInContextEdit(on: boolean): void {
    try {
        if (on) localStorage.setItem(STORAGE_KEY, '1');
        else localStorage.removeItem(STORAGE_KEY);
    } catch { /* localStorage blockiert — ignorieren */ }
    window.location.reload();
}

function enable(): void {
    if (active) return;
    active = true;

    // Monkey-patch i18n.t — jeder Aufruf bekommt einen Tag im Result
    // (wenn er als JSX gerendert wird) via einer span-Wrapper-Klasse.
    // Saubere Variante: post-processor in i18next.
    i18n.use({
        type: 'postProcessor',
        name: 'inContextEdit',
        process: (value: string, key: string | string[], options: Record<string, unknown>) => {
            const fullKey = Array.isArray(key) ? key[0] : key;
            const ns = options.ns ?? i18n.options.defaultNS;
            // Wir koennen den String nicht direkt mit HTML-Tags wrappen
            // (React entweicht), aber wir packen einen Zero-Width-Space-
            // Marker rein, den der MutationObserver erkennt:
            return `​${ns}::${fullKey}​${value}`;
        },
    } as never);

    // Wir aktivieren den postProcessor global
    i18n.options.postProcess = ['inContextEdit'];

    // Mutation-Observer scannt nach Text-Nodes mit dem Marker und
    // packt einen click-Handler drumherum.
    setupObserver();
    showStatusBanner();
}

function setupObserver(): void {
    const observer = new MutationObserver(() => scanAndAnnotate());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scanAndAnnotate();
}

function scanAndAnnotate(): void {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    const work: Array<{ node: Text; key: string; clean: string }> = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
        const text = node as Text;
        const content = text.data;
        const match = content.match(/^​([^​]+)​(.*)$/s);
        if (!match) continue;
        const [, key, clean] = match;
        // Bereits annotiert?
        const parent = text.parentElement;
        if (parent?.dataset.i18nAnnotated === '1') continue;
        work.push({ node: text, key, clean });
    }
    for (const w of work) {
        w.node.data = w.clean;
        const parent = w.node.parentElement;
        if (parent) {
            parent.dataset.i18nAnnotated = '1';
            parent.setAttribute(ATTR, w.key);
            parent.style.position ||= 'relative';
            parent.addEventListener('mouseenter', onEnter);
            parent.addEventListener('mouseleave', onLeave);
        }
    }
}

function cancelHide(): void {
    if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
}

function scheduleHide(): void {
    cancelHide();
    hideTimer = window.setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
        hideTimer = null;
    }, 250);
}

function onEnter(this: HTMLElement): void {
    cancelHide();
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed',
            'pointer-events:auto',
            'z-index:2147483647',
            'background:#ea580c',
            'color:white',
            'border-radius:4px',
            'padding:2px 6px',
            'font-size:11px',
            'font-family:sans-serif',
            'cursor:pointer',
            'box-shadow:0 1px 3px rgba(0,0,0,0.3)',
            'display:none',
        ].join(';');
        overlay.textContent = '✎ edit';
        // Overlay haelt sich selbst sichtbar wenn die Maus drin ist —
        // das verhindert das Wegspringen wenn man vom Parent zum Overlay
        // hovert. Bug-Fix 2026-05-14.
        overlay.addEventListener('mouseenter', cancelHide);
        overlay.addEventListener('mouseleave', scheduleHide);
        document.body.appendChild(overlay);
    }
    const rect = this.getBoundingClientRect();
    // Position: leicht ueberlappend mit dem rechten Rand des Parents, damit
    // es keine Hover-Luecke zwischen Parent und Overlay gibt.
    overlay.style.left = `${rect.right - 8}px`;
    overlay.style.top = `${Math.max(rect.top - 4, 0)}px`;
    overlay.style.display = 'block';
    const key = this.getAttribute(ATTR);
    overlay.onclick = () => {
        const target = `${ADMIN_BASE}/i18n?focus=${encodeURIComponent(key ?? '')}`;
        window.open(target, '_blank');
    };
}

function onLeave(): void {
    scheduleHide();
}

function showStatusBanner(): void {
    const banner = document.createElement('div');
    banner.style.cssText = [
        'position:fixed',
        'bottom:12px',
        'left:12px',
        'z-index:2147483647',
        'background:#ea580c',
        'color:white',
        'padding:6px 12px',
        'border-radius:6px',
        'font:600 11px sans-serif',
        'box-shadow:0 2px 6px rgba(0,0,0,0.25)',
        'display:flex',
        'gap:8px',
        'align-items:center',
    ].join(';');
    const label = document.createElement('span');
    label.textContent = 'i18n-Edit aktiv';
    const btn = document.createElement('button');
    btn.textContent = 'deaktivieren';
    btn.style.cssText = [
        'background:white',
        'color:#ea580c',
        'border:0',
        'border-radius:4px',
        'padding:2px 8px',
        'font:600 11px sans-serif',
        'cursor:pointer',
    ].join(';');
    // Harte Deaktivierung: localStorage direkt leeren + Vollreload.
    // Unabhängig von Query-Param/SPA-Routing/Service-Worker — genau das
    // hat beim alten ?i18n-edit=0-Link gefehlt (Marker blieb hängen).
    btn.addEventListener('click', () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        window.location.reload();
    });
    banner.appendChild(label);
    banner.appendChild(btn);
    document.body.appendChild(banner);
}
