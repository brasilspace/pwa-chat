/**
 * NotificationPolicySection — Workspace-Admin: Space-Digest-Freigabe
 * (E4 / TenantDigestPolicy). Tenant-Schalter, erlaubte UserTypes,
 * erlaubte Zyklen, Onboarding-Prompt-Modus.
 */
import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { Loader2, BellRing } from 'lucide-react';

const ALL_CYCLES = ['DAILY', 'WEEKLY', 'HOURLY', 'NEAR_REALTIME'] as const;
const CYCLE_LABELS: Record<string, string> = {
    DAILY: 'Täglich', WEEKLY: 'Wöchentlich', HOURLY: 'Stündlich', NEAR_REALTIME: 'Zeitnah gebündelt',
};
const PROMPTS = [
    ['SETTINGS_ONLY', 'Nur in den Einstellungen sichtbar'],
    ['ASK_ON_LOGIN', 'Beim Login einmal aktiv anbieten'],
    ['NONE', 'Gar nicht anbieten'],
] as const;

interface Policy {
    tenantEnabled: boolean;
    allowedUserTypes: string[];
    allowedCycles: string[];
    defaultPromptMode: string;
}
interface UserType { key: string; label: string }

export function NotificationPolicySection(): JSX.Element {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [pol, setPol] = useState<Policy | null>(null);
    const [types, setTypes] = useState<UserType[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const [pr, tr] = await Promise.all([
                fetch('/api/platform/v1/workspace/digest-policy', { headers: { Authorization: `Bearer ${jwt}` } }),
                fetch('/api/platform/v1/workspace/user-types', { headers: { Authorization: `Bearer ${jwt}` } }),
            ]);
            if (!pr.ok) throw new Error('Laden fehlgeschlagen');
            setPol(await pr.json());
            const tj = tr.ok ? await tr.json() : { userTypes: [] };
            setTypes((tj.userTypes ?? []).map((u: UserType) => ({ key: u.key, label: u.label })));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Fehler');
        } finally { setLoading(false); }
    };
    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    const patch = (p: Partial<Policy>) => setPol(v => v ? { ...v, ...p } : v);
    const toggleIn = (list: string[], val: string) =>
        list.includes(val) ? list.filter(x => x !== val) : [...list, val];

    const save = async () => {
        if (!pol) return;
        setSaving(true); setMsg(''); setError('');
        try {
            const res = await fetch('/api/platform/v1/workspace/digest-policy', {
                method: 'PUT',
                headers: { Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
                body: JSON.stringify({
                    enabled: pol.tenantEnabled,
                    allowedUserTypes: pol.allowedUserTypes,
                    allowedCycles: pol.allowedCycles,
                    defaultPromptMode: pol.defaultPromptMode,
                }),
            });
            if (!res.ok) { setError('Speichern fehlgeschlagen.'); return; }
            setPol(await res.json());
            setMsg('Gespeichert.');
        } catch {
            setError('Speichern fehlgeschlagen.');
        } finally { setSaving(false); }
    };

    if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lädt …</div>;
    if (error && !pol) return <p className="p-6 text-sm text-destructive">{error}</p>;
    if (!pol) return <p className="p-6 text-sm text-muted-foreground">Keine Daten.</p>;

    return (
        <div className="max-w-xl space-y-6 p-6">
            <div>
                <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><BellRing className="h-4 w-4" /> Benachrichtigungen (Workspace)</h2>
                <p className="text-sm text-muted-foreground">
                    Steuert, ob und für wen die persönliche E-Mail-Zusammenfassung
                    angeboten wird. E-Mail informiert nur — gearbeitet wird in prilog.
                    Nutzer bestätigen ihre Adresse per Double-Opt-in.
                </p>
            </div>

            <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={pol.tenantEnabled}
                    onChange={e => patch({ tenantEnabled: e.target.checked })} />
                <span className="font-medium">E-Mail-Zusammenfassung in diesem Workspace aktivieren</span>
            </label>

            <div>
                <label className="mb-2 block text-sm font-medium">Erlaubte Rollen (UserTypes)</label>
                {types.length === 0
                    ? <p className="text-xs text-muted-foreground">Keine Rollen gefunden.</p>
                    : <div className="space-y-1.5">
                        {types.map(t => (
                            <label key={t.key} className="flex items-center gap-2 text-sm">
                                <input type="checkbox"
                                    checked={pol.allowedUserTypes.includes(t.key)}
                                    onChange={() => patch({ allowedUserTypes: toggleIn(pol.allowedUserTypes, t.key) })} />
                                {t.label} <span className="text-xs text-muted-foreground">({t.key})</span>
                            </label>
                        ))}
                    </div>}
                <p className="mt-1 text-xs text-muted-foreground">
                    Nur Nutzer dieser Rollen können den Digest aktivieren. Schüler/Externe bewusst nur bei Bedarf.
                </p>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium">Erlaubte Zyklen</label>
                <div className="space-y-1.5">
                    {ALL_CYCLES.map(c => (
                        <label key={c} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={pol.allowedCycles.includes(c)}
                                onChange={() => patch({ allowedCycles: toggleIn(pol.allowedCycles, c) })} />
                            {CYCLE_LABELS[c]}
                        </label>
                    ))}
                </div>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium">Onboarding</label>
                <select value={pol.defaultPromptMode}
                    onChange={e => patch({ defaultPromptMode: e.target.value })}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {PROMPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
            </div>

            {msg && <p className="text-sm text-emerald-600">{msg}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <button onClick={save} disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
            </button>
        </div>
    );
}
