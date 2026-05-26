/**
 * SchutzkonzeptCockpit — L5b. Route /schutzkonzept-cockpit/:flowId.
 * Modul-gegatet (enabledModules: schutzkonzept, Default off, v2 §11).
 * Zeigt kuratierten Pflichtcheck + Beschlussstatus — Orientierung,
 * KEIN Rechtstestat (v2 §5.1). Backend E2E-verifiziert (KV21/KV22).
 */
import { type JSX, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { useEnabledModules } from '@/core/permissions';
import { conceptCockpitGateway, type SchutzkonzeptView } from '@/gateways/platform/concept-cockpit-gateway';
import { MaterialIcon } from '@/components/ui/material-icon';

const NEXT: Record<string, string> = { open: 'fulfilled', fulfilled: 'not_applicable', not_applicable: 'open' };
const LBL: Record<string, string> = { open: 'offen', fulfilled: 'erfüllt (intern markiert)', not_applicable: 'nicht zutreffend' };

export function SchutzkonzeptCockpitPage(): JSX.Element {
    const { flowId = '' } = useParams();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const enabledModules = useEnabledModules();
    const [data, setData] = useState<SchutzkonzeptView | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!jwt || !flowId) return;
        try { setData(await conceptCockpitGateway.schutzkonzept(jwt, flowId)); setErr(null); }
        catch (e) { setErr(e instanceof Error ? e.message : 'Laden fehlgeschlagen'); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt, flowId]);
    useEffect(() => { void load(); }, [load]);

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true); setErr(null);
        try { await fn(); await load(); }
        catch (e) { setErr(e instanceof Error ? e.message : 'Aktion fehlgeschlagen'); }
        finally { setBusy(false); }
    };

    if (!enabledModules.has('schutzkonzept' as never)) {
        return <div className="p-6 text-sm text-muted-foreground">Das Schutzkonzept-Modul ist für diesen Bereich nicht aktiviert.</div>;
    }
    if (!flowId) return <div className="p-6 text-sm text-muted-foreground">Kein Konzept angegeben.</div>;
    if (err && !data) return <div className="p-6 text-sm text-destructive">{err}</div>;
    if (!data) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;

    const a = data.adoption;
    const cycle = (checkId: string, status: string) => () => void run(() =>
        NEXT[status] === 'not_applicable'
            ? conceptCockpitGateway.setRequirementCheck(jwt, checkId, { status: 'not_applicable', notApplicableReason: window.prompt('Begründung „nicht zutreffend" (Pflicht):') ?? '' })
            : conceptCockpitGateway.setRequirementCheck(jwt, checkId, { status: NEXT[status] }));

    return (
        <div className="mx-auto max-w-3xl p-6">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
                <MaterialIcon name="verified_user" size={20} /> Schutzkonzept
            </h2>
            <div className="mb-4 rounded border border-amber-300/50 bg-amber-50/50 px-3 py-2 text-[12px] text-amber-800">
                {data.disclaimer}
            </div>
            {err && <div className="mb-3 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive">{err}</div>}

            <div className="mb-4 text-[12px] text-muted-foreground">
                Katalog <code>{data.catalog.scope}</code> v{data.catalog.version} · {data.catalog.status}
                {data.scopeFallback && ' · allgemeiner Basiskatalog (kein Bundesland hinterlegt)'}
            </div>

            <div className="mb-3 flex gap-3 text-[13px]">
                <span>{data.summary.fulfilled} erfüllt</span>
                <span>{data.summary.open} offen</span>
                <span>{data.summary.not_applicable} n.z.</span>
                <span className="text-muted-foreground">von {data.summary.total}</span>
            </div>

            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pflichtbausteine</h3>
            {data.items.map(it => (
                <div key={it.checkId} className="mb-1 flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-[13px]">
                    <span className="flex-1">{it.label}{it.mandatory ? '' : ' (optional)'}</span>
                    {it.notApplicableReason && <span className="truncate text-[11px] text-muted-foreground" title={it.notApplicableReason}>n.z.: {it.notApplicableReason}</span>}
                    <button disabled={busy} onClick={cycle(it.checkId, it.status)}
                        className={`rounded px-2 py-0.5 text-[11px] ${it.status === 'fulfilled' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {LBL[it.status]}
                    </button>
                </div>
            ))}

            <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Beschlussstatus</h3>
            <div className="rounded border border-border px-2.5 py-2 text-[13px]">
                {a ? (
                    <>
                        <div>Status: <b>{a.status}</b>{a.gremium ? ` · ${a.gremium}` : ''}{a.decidedAt ? ` · ${new Date(a.decidedAt).toLocaleDateString()}` : ''}</div>
                        <div className="text-[12px] text-muted-foreground">
                            {a.validUntil ? `gültig bis ${new Date(a.validUntil).toLocaleDateString()}` : 'keine Gültigkeit hinterlegt'}
                            {a.resolutionRef ? ` · Beleg ${a.resolutionRef}` : ' · kein Beleg'} · Signatur {a.signatureStatus}
                        </div>
                        {a.isExpired && <div className="mt-1 text-[12px] text-destructive">Gültigkeit abgelaufen — bitte neu beschließen.</div>}
                        {a.status === 'adopted' && !a.resolutionRef && <div className="mt-1 text-[12px] text-destructive">Beschluss ohne Beleg.</div>}
                    </>
                ) : <div className="text-muted-foreground">Noch kein Beschluss erfasst.</div>}
                <div className="mt-2 flex gap-1.5">
                    <button disabled={busy}
                        onClick={() => { const ref = window.prompt('DMS-Referenz des Beschlussdokuments (Pflicht für „beschlossen"):'); if (ref) void run(() => conceptCockpitGateway.setAdoption(jwt, flowId, { status: 'adopted', resolutionRef: ref, gremium: window.prompt('Gremium (z.B. Schulkonferenz):') })); }}
                        className="rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">Als beschlossen markieren</button>
                    <button disabled={busy}
                        onClick={() => void run(() => conceptCockpitGateway.setAdoption(jwt, flowId, { status: 'revoked' }))}
                        className="rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">Widerrufen</button>
                </div>
            </div>

            <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fachstellen (organisatorisch benannt)</h3>
            {data.agencyLinks.length === 0 && <p className="text-[12px] text-muted-foreground">Noch keine Fachstelle benannt.</p>}
            {data.agencyLinks.map(l => (
                <div key={l.id} className="group mb-1 flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-[13px]">
                    <span className="flex-1">{l.agency.name} <span className="text-muted-foreground">· {l.agency.kind} · {l.role}{l.agency.scope === 'global' ? ' · kuratiert' : ''}{!l.agency.active ? ' · inaktiv' : ''}</span></span>
                    <button disabled={busy} onClick={() => void run(() => conceptCockpitGateway.unlinkAgency(jwt, l.id))}
                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive">
                        <MaterialIcon name="delete" size={14} />
                    </button>
                </div>
            ))}
            <button disabled={busy}
                onClick={() => {
                    const name = window.prompt('Name der Fachstelle (tenant-eigen):'); if (!name) return;
                    const kind = window.prompt('Art (beratungsstelle/schulamt/fachberatung/jugendhilfe/traeger/sonstige):', 'beratungsstelle'); if (!kind) return;
                    const role = window.prompt('Rolle (ansprechpartner/beschwerdeweg/fachberatung/schulaufsicht/praevention/fortbildung/notfallkontakt/sonstige):', 'ansprechpartner'); if (!role) return;
                    void run(async () => {
                        const a = await conceptCockpitGateway.createAgency(jwt, { name, kind, contact: window.prompt('Organisations-Kontakt (optional):') });
                        await conceptCockpitGateway.linkAgency(jwt, flowId, { agencyId: a.id, role });
                    });
                }}
                className="mt-1.5 rounded-lg border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50">+ Fachstelle anlegen & benennen</button>
            <p className="mt-1 text-[11px] text-muted-foreground">Nur organisatorische Benennung — keine Fallkommunikation, kein externer Zugriff.</p>
        </div>
    );
}
