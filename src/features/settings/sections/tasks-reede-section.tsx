import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

export function TasksReedeSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [staleDays, setStaleDays] = useState(14);
    const [retentionDays, setRetentionDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await fetch('/api/platform/v1/settings/tasks-reede', {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setStaleDays(data.reedeStaleDays ?? 14);
            setRetentionDays(data.trashRetentionDays ?? 30);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const save = useCallback(async () => {
        if (!jwt) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/platform/v1/settings/tasks-reede', {
                method: 'PUT',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reedeStaleDays: staleDays, trashRetentionDays: retentionDays }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setMessage({ kind: 'ok', text: 'Schwellen gespeichert. Bootstrap neu laden, damit der Web-Client die neuen Werte übernimmt.' });
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Speichern fehlgeschlagen.' });
        } finally {
            setSaving(false);
        }
    }, [jwt, staleDays, retentionDays]);

    if (loading) {
        return <div className="flex h-32 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MaterialIcon name="anchor" size={16} className="size-5" /> {t('settings.tasks_reede.aufgaben-pflege')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.tasks_reede.schwellen_fuer_die_reede_aufgaben_die_ei')}
                </p>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">{t('settings.tasks_reede.reede-schwelle')}</label>
                <p className="text-xs text-muted-foreground">
                    {t('settings.tasks_reede.eine_aufgabe_gilt_als_schlafend_und_land')}
                </p>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min={1}
                        max={365}
                        value={staleDays}
                        onChange={(e) => setStaleDays(parseInt(e.target.value, 10) || 14)}
                        disabled={saving}
                        className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <span className="text-sm text-muted-foreground">{t('settings.tasks_reede.tage')}</span>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">{t('settings.tasks_reede.papierkorb-aufbewahrung')}</label>
                <p className="text-xs text-muted-foreground">
                    {t('settings.tasks_reede.geloeschte_aufgaben_bleiben_fuer_x_tage_')}
                </p>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min={1}
                        max={365}
                        value={retentionDays}
                        onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 30)}
                        disabled={saving}
                        className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <span className="text-sm text-muted-foreground">{t('settings.tasks_reede.tage')}</span>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={save}
                    disabled={saving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : t('common.save')}
                </button>
                {message && (
                    <span className={cn('text-xs', message.kind === 'ok' ? 'text-emerald-600' : 'text-destructive')}>
                        {message.text}
                    </span>
                )}
            </div>
        </div>
    );
}
