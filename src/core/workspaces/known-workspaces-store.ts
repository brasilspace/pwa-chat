/**
 * known-workspaces-store — Liste der schon besuchten Workspaces im Browser.
 *
 * Wird beim Login um den aktuellen Tenant ergaenzt. Der Avatar-Dropdown im
 * Header zeigt diese Liste, damit User mit mehreren Tenants (z.B. Schul-
 * traeger oder Lehrer an zwei Schulen) schnell wechseln koennen.
 *
 * Cross-Tenant-SSO existiert nicht — beim Wechseln muss der User im neuen
 * Tenant erneut einloggen. Der Switcher ist daher im Kern eine bequeme,
 * zentral gepflegte Bookmark-Liste.
 *
 * Speicher: localStorage unter Key "prilog:known-workspaces", JSON-Liste.
 * Format: { subdomain, displayName?, lastAccessedAt }.
 */

const STORAGE_KEY = 'prilog:known-workspaces';
const MAX_ENTRIES = 20;

export interface KnownWorkspace {
    /** Volle Domain, z.B. "leander.prilog.team" */
    domain: string;
    /** Human-readable, z.B. "Leander Demo-Schule" — kommt aus bootstrap.branding */
    displayName: string | null;
    /** ISO-Date als String, beim letzten Login gesetzt */
    lastAccessedAt: string;
}

function read(): KnownWorkspace[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
    } catch {
        return [];
    }
}

function isValidEntry(x: unknown): x is KnownWorkspace {
    if (!x || typeof x !== 'object') return false;
    const e = x as Record<string, unknown>;
    return typeof e.domain === 'string' && typeof e.lastAccessedAt === 'string';
}

function write(list: KnownWorkspace[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
    } catch {
        // Quota exceeded oder Privacy-Mode — silent fail
    }
}

export const knownWorkspaces = {
    list(): KnownWorkspace[] {
        return read().sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt));
    },

    /** Liste ohne den aktuellen Workspace (fuer den Switcher). */
    listOthers(currentDomain: string | null | undefined): KnownWorkspace[] {
        if (!currentDomain) return this.list();
        return this.list().filter((w) => w.domain !== currentDomain);
    },

    /** Beim Login: aktuellen Workspace eintragen oder aktualisieren. */
    upsert(domain: string, displayName: string | null = null): void {
        const list = read();
        const idx = list.findIndex((w) => w.domain === domain);
        const entry: KnownWorkspace = {
            domain,
            displayName: idx >= 0 ? (displayName ?? list[idx].displayName) : displayName,
            lastAccessedAt: new Date().toISOString(),
        };
        if (idx >= 0) list[idx] = entry;
        else list.push(entry);
        write(list);
    },

    remove(domain: string): void {
        write(read().filter((w) => w.domain !== domain));
    },

    clear(): void {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch { /* ignore */ }
    },
};
