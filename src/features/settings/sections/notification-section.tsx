/**
 * NotificationSection — Settings → Benachrichtigungen (Space-Digest P1).
 * Zyklus + Inhalte je Nutzer. Aktivieren löst Double-Opt-in (E11) aus:
 * Bestätigungs-Mail; aktiv erst nach Klick. E-Mail informiert nur,
 * Bearbeitung passiert in prilog.
 */
import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { Loader2, Bell, CheckCircle2, MailCheck } from 'lucide-react';

const CYCLE_LABELS: Record<string, string> = {
    OFF: 'Aus',
    DAILY: 'Täglich',
    WEEKLY: 'Wöchentlich',
    HOURLY: 'Stündlich',
    NEAR_REALTIME: 'Zeitnah gebündelt',
};

interface Pref {
    cycle: string;
    contentTasks: boolean;
    contentCalendar: boolean;
    contentDocuments: boolean;
    contentPosts: boolean;
    contentChatActivity: boolean;
    confirmed: boolean;
    pendingConfirm: boolean;
}
interface Resp {
    allowed: boolean;
    allowedCycles: string[];
    hasEmail: boolean;
    preference: Pref;
}

export function NotificationSection(): JSX.Element {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [data, setData] = useState<Resp | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const res = await fetch('/api/platform/v1/workspace/notification-preferences', {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok) throw new Error('Laden fehlgeschlagen');
            setData(await res.json());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Fehler');
        } finally { setLoading(false); }
    };
    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    const update = (patch: Partial<Pref>) =>
        setData(d => d ? { ...d, preference: { ...d.preference, ...patch } } : d);

    const save = async () => {
        if (!data) return;
        setSaving(true); setMsg(''); setError('');
        try {
            const p = data.preference;
            const res = await fetch('/api/platform/v1/workspace/notification-preferences', {
                method: 'PUT',
                headers: { Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
                body: JSON.stringify({
                    cycle: p.cycle,
                    contentTasks: p.contentTasks, contentCalendar: p.contentCalendar,
                    contentDocuments: p.contentDocuments, contentPosts: p.contentPosts,
                    contentChatActivity: p.contentChatActivity,
                }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(j.reason === 'digest_not_allowed' ? 'Für deine Rolle nicht freigegeben.'
                    : j.reason === 'no_email' ? 'Keine hinterlegte E-Mail-Adresse.'
                    : 'Speichern fehlgeschlagen.');
            } else if (j.status === 'confirm_sent') {
                setMsg('Bestätigungs-E-Mail gesendet. Bitte bestätige den Link — danach ist die Zusammenfassung aktiv.');
            } else if (j.status === 'off') {
                setMsg('E-Mail-Zusammenfassung deaktiviert.');
            } else {
                setMsg('Gespeichert.');
            }
            await load();
        } catch {
            setError('Speichern fehlgeschlagen.');
        } finally { setSaving(false); }
    };

    if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lädt …</div>;
    if (error && !data) return <p className="p-6 text-sm text-destructive">{error}</p>;
    if (!data) return <p className="p-6 text-sm text-muted-foreground">Keine Daten.</p>;

    if (!data.allowed) {
        return (
            <div className="p-6">
                <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><Bell className="h-4 w-4" /> Benachrichtigungen</h2>
                <p className="text-sm text-muted-foreground">
                    E-Mail-Zusammenfassungen sind für deine Rolle derzeit nicht freigegeben.
                    Bei Bedarf wende dich an die Administration.
                </p>
            </div>
        );
    }

    const p = data.preference;
    const cycles = ['OFF', ...data.allowedCycles.filter(c => c !== 'OFF')];

    return (
        <div className="max-w-xl space-y-6 p-6">
            <div>
                <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Bell className="h-4 w-4" /> Benachrichtigungen</h2>
                <p className="text-sm text-muted-foreground">
                    Erhalte eine E-Mail-Zusammenfassung aus prilog. Die E-Mail informiert nur —
                    Antworten und Bearbeitung passieren in prilog. Jederzeit abbestellbar.
                </p>
            </div>

            {p.pendingConfirm && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                    <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    Wir haben dir eine Bestätigungs-E-Mail geschickt. Erst nach Klick auf den Link wird die Zusammenfassung aktiv.
                </div>
            )}
            {p.confirmed && p.cycle !== 'OFF' && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" /> Aktiv und bestätigt.
                </div>
            )}

            <div>
                <label className="mb-2 block text-sm font-medium">Zyklus</label>
                <div className="space-y-1.5">
                    {cycles.map(c => (
                        <label key={c} className="flex items-center gap-2 text-sm">
                            <input type="radio" name="cycle" checked={p.cycle === c}
                                onChange={() => update({ cycle: c })} />
                            {CYCLE_LABELS[c] ?? c}
                        </label>
                    ))}
                </div>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium">Inhalte</label>
                <div className="space-y-1.5">
                    {([
                        ['contentTasks', 'Aufgaben'],
                        ['contentCalendar', 'Termine'],
                        ['contentDocuments', 'Dokumente'],
                        ['contentPosts', 'Beiträge (Briefe/Umfragen)'],
                        ['contentChatActivity', 'Chat-Aktivität (nur Anzahl)'],
                    ] as const).map(([k, lbl]) => (
                        <label key={k} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" disabled={p.cycle === 'OFF'}
                                checked={(p as unknown as Record<string, boolean>)[k]}
                                onChange={e => update({ [k]: e.target.checked } as Partial<Pref>)} />
                            {lbl}
                        </label>
                    ))}
                </div>
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
