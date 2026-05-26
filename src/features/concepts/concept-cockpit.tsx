/**
 * ConceptCockpit — P1a einfache Konzept-Verankerungs-Ansicht.
 * Route /konzept-cockpit/:flowId (flowId = Concept-ProcessTemplate.id).
 * Schicht auf Process-Engine; nutzt fertige, E2E-verifizierte Endpoints
 * (KV11). Kanon: prilog_docs/umsetzung/konzept-verankerung/ (v2).
 */
import { type JSX, type ReactNode, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { conceptCockpitGateway, type ConceptCockpit } from '@/gateways/platform/concept-cockpit-gateway';
import { MaterialIcon } from '@/components/ui/material-icon';

export function ConceptCockpitPage(): JSX.Element {
    const { flowId = '' } = useParams();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const [data, setData] = useState<ConceptCockpit | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!jwt || !flowId) return;
        try {
            setData(await conceptCockpitGateway.cockpit(jwt, flowId));
            setErr(null);
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt, flowId]);

    useEffect(() => { void load(); }, [load]);

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true); setErr(null);
        try { await fn(); await load(); }
        catch (e) { setErr(e instanceof Error ? e.message : 'Aktion fehlgeschlagen'); }
        finally { setBusy(false); }
    };

    if (!flowId) return <div className="p-6 text-sm text-muted-foreground">Kein Konzept angegeben.</div>;
    if (err && !data) return <div className="p-6 text-sm text-destructive">{err}</div>;
    if (!data) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;

    const Section = ({ title, children }: { title: string; children: ReactNode }) => (
        <div className="mb-5">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
            {children}
        </div>
    );

    return (
        <div className="mx-auto max-w-3xl p-6">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <MaterialIcon name="hub" size={20} /> Konzept-Cockpit
            </h2>
            <p className="mb-4 text-[12px] text-muted-foreground">
                Verankerungs-Sicht auf den Konzept-Flow <code>{data.anchor.conceptFlowId}</code>
                {' '}· Status {data.anchor.status}
            </p>
            {err && <div className="mb-3 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive">{err}</div>}

            <Section title="Verankerungs-Score">
                {(() => {
                    const s = data.score;
                    const dim = (label: string, v: number | null, p1 = false) => (
                        <div className="flex items-center justify-between rounded border border-border px-2.5 py-1.5 text-[13px]">
                            <span>{label}</span>
                            <span className={v === null ? 'text-muted-foreground' : 'font-semibold'}>
                                {v === null ? (p1 ? 'in P1 nicht erhoben' : 'nicht messbar') : `${v} %`}
                            </span>
                        </div>
                    );
                    const recompute = (
                        <button disabled={busy}
                            onClick={() => void run(() => conceptCockpitGateway.recomputeScore(jwt, flowId))}
                            className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">
                            {s ? 'Neu berechnen' : 'Jetzt berechnen'}
                        </button>
                    );
                    if (!s) return (<div><p className="text-[12px] text-muted-foreground">Noch nicht berechnet.</p>{recompute}</div>);
                    const trendTxt = s.trend === 'up' ? '▲ steigend' : s.trend === 'down' ? '▼ fallend' : s.trend === 'flat' ? '► stabil' : '';
                    return (
                        <div className="space-y-1.5">
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-semibold">{s.gesamtValue === null ? '—' : `${s.gesamtValue} %`}</span>
                                <span className="text-[12px] text-muted-foreground">Gesamt {trendTxt}</span>
                            </div>
                            {s.suppressed && (
                                <div className="rounded border border-amber-300/40 bg-amber-50/40 px-2 py-1 text-[12px] text-amber-700">
                                    {s.suppressionReason === 'cohort_too_small'
                                        ? 'Zu kleine Gruppe für eine Auswertung (Datenschutz).'
                                        : 'Noch keine belegbaren Signale — wird nicht geschätzt.'}
                                </div>
                            )}
                            {dim('Bekanntheit', s.bekanntheitValue)}
                            {dim('Anwendung', s.anwendungValue)}
                            {dim('Beteiligung', s.beteiligungValue)}
                            {dim('Verständnis', s.verstaendnisValue, true)}
                            {dim('Nachhaltigkeit', s.nachhaltigValue, true)}
                            <p className="text-[11px] text-muted-foreground">
                                Zeitraum {new Date(s.periodStart).toLocaleDateString()}–{new Date(s.periodEnd).toLocaleDateString()}
                                {' '}· Stand {new Date(s.computedAt).toLocaleDateString()} · {s.calculationVersion} · nur belegbare, aggregierte Signale
                            </p>
                            {recompute}
                        </div>
                    );
                })()}
            </Section>

            <Section title={`Zielgruppen (${data.targetGroups.length})`}>
                {data.targetGroups.map(t => (
                    <div key={t.id} className="rounded border border-border px-2.5 py-1.5 text-[13px]">
                        {t.scopeType}{t.userTypeKey ? ` · ${t.userTypeKey}` : ''}{t.spaceId ? ` · Space ${t.spaceId}` : ''}
                        {t.responseRequired ? ' · Rückmeldung erforderlich' : ''}
                    </div>
                ))}
                <button disabled={busy}
                    onClick={() => { const k = window.prompt('Benutzertyp-Schlüssel (Zielgruppe userType):'); if (k) void run(() => conceptCockpitGateway.addTargetGroup(jwt, flowId, { scopeType: 'userType', userTypeKey: k })); }}
                    className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ Zielgruppe (Benutzertyp)</button>
            </Section>

            <Section title={`Praxisbausteine (${data.practice.length})`}>
                {data.practice.map(pc => (
                    <div key={pc.id} className="group flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-[13px]">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{pc.kind}</span>
                        <span className="flex-1 truncate">{pc.title}{pc.refType ? ` · ${pc.refType}` : ''}</span>
                        <button disabled={busy}
                            onClick={() => void run(() => conceptCockpitGateway.deletePractice(jwt, pc.id))}
                            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive">
                            <MaterialIcon name="delete" size={14} />
                        </button>
                    </div>
                ))}
                <button disabled={busy}
                    onClick={() => { const t = window.prompt('Titel des Praxisbausteins:'); if (t) void run(() => conceptCockpitGateway.addPractice(jwt, flowId, { kind: 'checklist', title: t })); }}
                    className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ Praxisbaustein (Checkliste)</button>
            </Section>

            <Section title={`Verantwortliche (${data.responsibilities.length})`}>
                {data.responsibilities.map(r => (
                    <div key={r.id} className="rounded border border-border px-2.5 py-1.5 text-[13px]">{r.userId} · {r.role}</div>
                ))}
                <button disabled={busy}
                    onClick={() => { const u = window.prompt('Nutzer (Matrix-ID) als Konzept-Pate (owner):'); if (u) void run(() => conceptCockpitGateway.addResponsibility(jwt, flowId, { userId: u, role: 'owner' })); }}
                    className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ Verantwortliche:r (owner)</button>
            </Section>

            <Section title={`Erinnerungen / Nudges (${data.nudges.length})`}>
                {data.nudges.map(n => (
                    <div key={n.id} className="group flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-[13px]">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{n.triggerType}</span>
                        <span className="flex-1 truncate">{n.message}<span className="text-muted-foreground"> · {n.channel}</span></span>
                        {!n.active && <span className="text-[10px] text-muted-foreground">inaktiv</span>}
                        <button disabled={busy}
                            onClick={() => void run(() => conceptCockpitGateway.deleteNudge(jwt, n.id))}
                            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive">
                            <MaterialIcon name="delete" size={14} />
                        </button>
                    </div>
                ))}
                <button disabled={busy}
                    onClick={() => { const m = window.prompt('Nachricht der Erinnerung (Trigger: Kalender):'); if (m) void run(() => conceptCockpitGateway.addNudge(jwt, flowId, { triggerType: 'calendar', channel: 'notification', message: m })); }}
                    className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ Erinnerung (Kalender → Benachrichtigung)</button>
                <p className="mt-1 text-[11px] text-muted-foreground">Inhalts-/Chat-Auswertung ist aus Datenschutzgründen nicht möglich.</p>
            </Section>

            <Section title={`Pulse-Evaluationen (${data.surveys.length})`}>
                {data.surveys.map(s => (
                    <div key={s.id} className="rounded border border-border px-2.5 py-1.5 text-[13px]">
                        {s.formRef ? `Formular ${s.formRef}` : 'Formular noch nicht verknüpft'}
                        <span className="text-muted-foreground"> · {s.anonymous ? 'anonym' : 'nicht anonym'}</span>
                    </div>
                ))}
                <button disabled={busy}
                    onClick={() => void run(() => conceptCockpitGateway.addSurvey(jwt, flowId, { anonymous: true }))}
                    className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ Pulse-Evaluation (anonym)</button>
            </Section>
        </div>
    );
}
