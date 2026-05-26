/**
 * sheets-collab — Y.js-Bridge fuer Univer-Sheets.
 *
 * V1 Snapshot-Broadcast-Modell:
 *   - Y.Map<'workbook', WorkbookSnapshot> = einziger geteilter State
 *   - Local Mutation → debounced 800ms → ydoc.transact(() => map.set(...))
 *   - Y.Map.observe auf entfernte Updates → diff & apply via setValues
 *   - Loopback-Schutz via transaction origin (LOCAL_ORIGIN-Tag)
 *   - Awareness fuer User-Presenz (Name + Farbe), v2: Live-Cursor
 *
 * Bekannte Limitierungen v1:
 *   - Gleichzeitiges Editing derselben Zelle → Last-Write-Wins
 *   - Keine Live-Cursor-Position anderer User (nur "X ist auch hier")
 *   - Kein Command-Stream-Replay (kommt v2)
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Awareness } from 'y-protocols/awareness';

const LOCAL_ORIGIN = Symbol('prilog-sheets-local');

export interface CollabUser {
    matrixUserId: string;
    displayName: string;
    color: string;
}

export interface CollabPresence {
    clientId: number;
    user: CollabUser;
}

export interface SheetCollabHandle {
    /** Teile dem Bridge mit, dass der Univer-Editor bereit ist und liefere callbacks. */
    attach(callbacks: {
        /** Liefere die aktuelle Workbook-Snapshot (zum Speichern in Y.Map). */
        getWorkbook: () => Record<string, unknown> | null;
        /** Wende einen entfernten Snapshot auf Univer an (differential). */
        applyRemoteWorkbook: (snapshot: Record<string, unknown>) => void;
    }): void;
    /** Markiere den lokalen State als geaendert — triggert debounced-broadcast. */
    markDirty(): void;
    /** Holt die initiale Snapshot aus Y.Map (oder null wenn leer). */
    getInitialSnapshot(): Record<string, unknown> | null;
    /** Liste der aktuell verbundenen User (eigener Client ausgeschlossen). */
    getPeers(): CollabPresence[];
    /** Subscribe zu Peer-Aenderungen (return unsubscribe). */
    onPeersChange(cb: () => void): () => void;
    /** Signal: WebSocket-Verbindung etabliert? */
    isConnected(): boolean;
    onConnectionChange(cb: (connected: boolean) => void): () => void;
    /** Sauber abbauen. */
    dispose(): void;
}

export function createSheetCollab(opts: {
    sheetId: string;
    jwt: string;
    user: CollabUser;
    wsBaseUrl: string;
}): SheetCollabHandle {
    const { sheetId, jwt, user, wsBaseUrl } = opts;

    const ydoc = new Y.Doc();

    // WebSocket-URL bauen — wsBaseUrl beginnt mit ws:// oder wss://
    const provider = new WebsocketProvider(
        `${wsBaseUrl}/sheets-collab`,
        `${sheetId}/ws?token=${encodeURIComponent(jwt)}`,
        ydoc,
    );

    const sharedMap = ydoc.getMap('workbook');
    const awareness = provider.awareness as Awareness;

    awareness.setLocalStateField('user', user);

    let attached: {
        getWorkbook: () => Record<string, unknown> | null;
        applyRemoteWorkbook: (snapshot: Record<string, unknown>) => void;
    } | null = null;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let connected = false;
    const connectionListeners = new Set<(c: boolean) => void>();
    const peerListeners = new Set<() => void>();

    provider.on('status', ({ status }: { status: string }) => {
        const newConnected = status === 'connected';
        if (newConnected !== connected) {
            connected = newConnected;
            for (const cb of connectionListeners) cb(connected);
        }
    });

    awareness.on('change', () => { for (const cb of peerListeners) cb(); });

    // ── Lokal → Y.Map (debounced) ───────────────────────────────────────────
    function flush(): void {
        if (!attached) return;
        const wb = attached.getWorkbook();
        if (!wb) return;
        ydoc.transact(() => {
            // Vergleiche und setze nur die Top-Level-Felder die sich geaendert haben.
            // Univer's Workbook hat sheets, sheetOrder, styles, name etc. als
            // Top-Level-Keys. Ein Diff auf Cell-Ebene wuerde Y.Map verschachteln,
            // was die Wire-Effizienz erhoeht aber den Code verkompliziert. V1
            // ueberschreibt komplett.
            for (const [k, v] of Object.entries(wb)) {
                const prev = sharedMap.get(k);
                if (JSON.stringify(prev) !== JSON.stringify(v)) {
                    sharedMap.set(k, v as never);
                }
            }
            // Geloeschte Keys entfernen
            for (const k of Array.from(sharedMap.keys())) {
                if (!(k in wb)) sharedMap.delete(k);
            }
        }, LOCAL_ORIGIN);
    }

    // ── Y.Map → Lokal (auf entfernte Updates) ───────────────────────────────
    sharedMap.observe((event, transaction) => {
        if (transaction.origin === LOCAL_ORIGIN) return; // eigene Aenderungen ignorieren
        if (!attached) return;
        // Vollstaendigen Snapshot aus Y.Map auslesen und an Univer geben
        const wb: Record<string, unknown> = {};
        for (const [k, v] of sharedMap.entries()) wb[k] = v;
        attached.applyRemoteWorkbook(wb);
        void event; // event.changes verfuegbar fuer feinerer Diff (v2)
    });

    return {
        attach(callbacks) {
            attached = callbacks;
        },
        markDirty() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => { flush(); }, 800);
        },
        getInitialSnapshot() {
            if (sharedMap.size === 0) return null;
            const wb: Record<string, unknown> = {};
            for (const [k, v] of sharedMap.entries()) wb[k] = v;
            return wb;
        },
        getPeers() {
            const peers: CollabPresence[] = [];
            for (const [clientId, state] of awareness.getStates()) {
                if (clientId === ydoc.clientID) continue;
                const u = (state as { user?: CollabUser }).user;
                if (u) peers.push({ clientId, user: u });
            }
            return peers;
        },
        onPeersChange(cb) {
            peerListeners.add(cb);
            return () => { peerListeners.delete(cb); };
        },
        isConnected() { return connected; },
        onConnectionChange(cb) {
            connectionListeners.add(cb);
            return () => { connectionListeners.delete(cb); };
        },
        dispose() {
            if (debounceTimer) clearTimeout(debounceTimer);
            // letztes Flush sicherstellen damit nichts verloren geht
            flush();
            attached = null;
            awareness.setLocalState(null);
            provider.disconnect();
            provider.destroy();
            ydoc.destroy();
        },
    };
}

/** Stabile Farbe pro User-ID (HSL 0-360). */
export function colorForUser(userId: string): string {
    let h = 0;
    for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % 360;
    return `hsl(${h}, 70%, 50%)`;
}
