/**
 * SerienbriefSection — Mail-Merge UI (CRM-Foundation D.5-Frontend).
 * View als Empfänger-Quelle + Text-Template ({{feld}}/{{cf:key}}).
 * Bewusst simpel (D21): kein WYSIWYG. Flag-gated über view-Liste.
 */
import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useT } from '@/lib/i18n/use-t';
import { viewDefinitionsGateway } from '@/gateways/platform/view-definitions-gateway';
import type { ViewDef } from '@/lib/view-engine';

export function SerienbriefSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [views, setViews] = useState<ViewDef[]>([]);
    const [crmV2, setCrmV2] = useState<boolean | null>(null);
    const [viewId, setViewId] = useState('');
    const [name, setName] = useState('');
    const [template, setTemplate] = useState('Hallo {{displayName}},\n\n');
    const [result, setResult] = useState<{ count: number; samples: { name: string; text: string }[] } | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!jwt) return;
        viewDefinitionsGateway.list(jwt)
            .then(r => { setCrmV2(r.crmV2); setViews(r.views ?? []); })
            .catch((e: unknown) => {
                // Fehler NICHT als "nicht aktiviert" tarnen (irreführend).
                const msg = e instanceof Error ? e.message : String(e);
                console.error('[serienbrief] views list failed:', msg);
                setErr(msg);
            });
    }, [jwt]);

    if (crmV2 === false) {
        return <div className="p-6 text-sm text-muted-foreground">{t('settings.serienbrief.not_available') || 'Serienbrief ist für diesen Workspace nicht aktiviert.'}</div>;
    }

    const run = async () => {
        if (!jwt || !viewId || !template.trim()) { setErr('Ansicht und Vorlage erforderlich'); return; }
        setBusy(true); setErr(null); setResult(null);
        try {
            const r = await viewDefinitionsGateway.serienbrief(jwt, viewId, template, name || 'Serienbrief');
            setResult(r);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally { setBusy(false); }
    };

    return (
        <div className="max-w-2xl space-y-4 p-1">
            <div>
                <h2 className="text-sm font-semibold">{t('settings.serienbrief.title') || 'Serienbrief'}</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {t('settings.serienbrief.hint') || 'Empfänger aus einer Ansicht, Platzhalter {{feld}} oder {{cf:schlüssel}}.'}
                </p>
            </div>
            {err && <div className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive">{err}</div>}

            <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Ansicht (Empfänger)</label>
                <select value={viewId} onChange={e => setViewId(e.target.value)}
                    className="w-full rounded border border-input bg-background px-2 py-1.5 text-[13px]">
                    <option value="">— wählen —</option>
                    {views.map(v => <option key={v.id} value={v.id}>{v.name} ({v.ownerType})</option>)}
                </select>
            </div>

            <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Bezeichnung</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Elternbrief Klasse 5a"
                    className="w-full rounded border border-input bg-background px-2 py-1.5 text-[13px]" />
            </div>

            <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Vorlage</label>
                <textarea value={template} onChange={e => setTemplate(e.target.value)} rows={8}
                    className="w-full rounded border border-input bg-background px-2 py-1.5 font-mono text-[12px]" />
            </div>

            <button onClick={run} disabled={busy}
                className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy ? 'Erzeuge…' : 'Serienbrief erzeugen'}
            </button>

            {result && (
                <div className="rounded-lg border p-3">
                    <p className="text-[13px] font-medium">{result.count} Empfänger · Beleg je Person abgelegt</p>
                    {result.samples?.[0] && (
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[12px]">
{`— ${result.samples[0].name} —\n${result.samples[0].text}`}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}
