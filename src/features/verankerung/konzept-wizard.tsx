/**
 * KonzeptWizard — geführter „Konzept anlegen"-Prozess (Sprint 1).
 * Route /verankerung/neu. Eine Haupt-App: Vorlagenkatalog + 9-Baustein-
 * Erklärung sind hier integriert (kein Welten-Wechsel mehr).
 * Schritte: Vorlage → Vorschau → Name → Verantwortliche → Zielgruppen
 * → Start-Aufgaben → Anlegen. Wiederverwendung bestehender Endpoints.
 */
import { type JSX, useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { useT } from '@/lib/i18n/use-t';
import { useSpaces } from '@/features/spaces/use-spaces';
import { spaceGovernanceGateway } from '@/gateways/platform/space-governance-gateway';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { conceptCockpitGateway } from '@/gateways/platform/concept-cockpit-gateway';
import { MaterialIcon } from '@/components/ui/material-icon';

const platformGateway = createPlatformGateway();

interface Tpl { key: string; name: string; description: string | null; category: string; bausteine: Array<{ key: string; label: string }> }

const STEPS = ['vorlage', 'vorschau', 'name', 'verantwortlich', 'zielgruppe', 'startaufgaben', 'anlegen'] as const;
type Step = typeof STEPS[number];

export function KonzeptWizard(): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const { spaces } = useSpaces();

    const [step, setStep] = useState<Step>('vorlage');
    const [templates, setTemplates] = useState<Tpl[]>([]);
    const [userTypes, setUserTypes] = useState<{ value: string; label: string }[]>([]);
    const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Auswahl
    const [tplKey, setTplKey] = useState<string>(''); // '' = leeres Konzept
    const [name, setName] = useState('');
    const [respUser, setRespUser] = useState('');
    const [respRole, setRespRole] = useState('owner');
    const [tgScope, setTgScope] = useState('');
    const [tgUserType, setTgUserType] = useState('');
    const [tgSpace, setTgSpace] = useState('');

    const load = useCallback(async () => {
        if (!jwt) return;
        try {
            const tpl = await conceptCockpitGateway.listCuratedTemplates(jwt);
            setTemplates(tpl.items);
        } catch { /* Vorlagen optional → leeres Konzept bleibt möglich */ }
        try {
            const ut = await spaceGovernanceGateway.listUserTypes(jwt);
            setUserTypes(ut.userTypes.map(u => ({ value: u.key, label: u.label })));
        } catch { /* optional */ }
        try {
            const us = await platformGateway.getUsers(jwt);
            setUsers(us.users.map(u => ({ value: u.id, label: u.displayName || u.username })));
        } catch { /* optional */ }
    }, [jwt]);
    useEffect(() => { void load(); }, [load]);

    const selected = templates.find(x => x.key === tplKey);
    const idx = STEPS.indexOf(step);
    const go = (d: 1 | -1) => setStep(STEPS[Math.min(STEPS.length - 1, Math.max(0, idx + d))]);
    const effectiveName = name.trim() || selected?.name || '';

    const finish = async () => {
        setBusy(true); setErr(null);
        try {
            const created = tplKey
                ? await conceptCockpitGateway.createConceptFromTemplate(jwt, tplKey)
                : await conceptCockpitGateway.createConcept(jwt, effectiveName);
            const flowId = created.id;
            // Optional gewählte Verantwortliche / Zielgruppe direkt setzen.
            if (respUser) {
                try { await conceptCockpitGateway.addResponsibility(jwt, flowId, { userId: respUser, role: respRole || 'owner' }); } catch { /* nicht blockierend */ }
            }
            if (tgScope) {
                try {
                    await conceptCockpitGateway.addTargetGroup(jwt, flowId, {
                        scopeType: tgScope,
                        userTypeKey: tgScope === 'userType' ? tgUserType : null,
                        spaceId: tgScope === 'space' ? tgSpace : null,
                    });
                } catch { /* nicht blockierend */ }
            }
            navigate(`/verankerung/${encodeURIComponent(flowId)}?neu=1`);
        } catch (e) {
            setErr(e instanceof Error ? e.message : t('verankerung.actionFailed', { defaultValue: 'Anlegen fehlgeschlagen' }));
            setBusy(false);
        }
    };

    const Shell = ({ children, next, nextLabel, canNext = true }: { children: React.ReactNode; next?: () => void; nextLabel?: string; canNext?: boolean }) => (
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
            <button onClick={() => navigate('/verankerung')} className="mb-2 text-[12px] text-muted-foreground hover:underline">← {t('verankerung.title', { defaultValue: 'Konzept-Verankerung' })}</button>
            <div className="mb-3 flex items-center gap-2">
                <MaterialIcon name="tips_and_updates" size={20} />
                <h2 className="text-lg font-semibold">{t('verankerung.wizardTitle', { defaultValue: 'Konzept anlegen' })}</h2>
                <span className="ml-auto text-[12px] text-muted-foreground">{t('verankerung.step', { defaultValue: 'Schritt' })} {idx + 1}/{STEPS.length}</span>
            </div>
            <div className="mb-4 h-1 w-full overflow-hidden rounded bg-muted">
                <div className="h-1 bg-primary" style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
            </div>
            {err && <div className="mb-3 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive">{err}</div>}
            <div className="rounded-lg border border-border p-4">{children}</div>
            <div className="mt-3 flex gap-2">
                {idx > 0 && <button disabled={busy} onClick={() => go(-1)} className="rounded-lg border px-3 py-1.5 text-[12px] hover:bg-muted disabled:opacity-50">{t('verankerung.back', { defaultValue: 'Zurück' })}</button>}
                <button disabled={busy || !canNext} onClick={next ?? (() => go(1))}
                    className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-[12px] text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {nextLabel ?? t('verankerung.next', { defaultValue: 'Weiter' })}
                </button>
            </div>
        </div>
    );

    if (step === 'vorlage') return (
        <Shell canNext>
            <p className="mb-3 text-[13px] font-medium">{t('verankerung.wiz.whichConcept', { defaultValue: 'Welches Konzept möchtest du verankern?' })}</p>
            <div className="grid gap-2 sm:grid-cols-2">
                {templates.map(tp => (
                    <button key={tp.key} onClick={() => setTplKey(tp.key)}
                        className={`rounded-lg border p-3 text-left text-[13px] ${tplKey === tp.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                        <div className="font-medium">{tp.name}</div>
                        <div className="text-[11px] text-muted-foreground">{tp.bausteine.length} {t('verankerung.bausteine', { defaultValue: 'Bausteine' })}</div>
                    </button>
                ))}
                <button onClick={() => setTplKey('')}
                    className={`rounded-lg border p-3 text-left text-[13px] ${tplKey === '' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                    <div className="font-medium">{t('verankerung.emptyConcept', { defaultValue: 'Leeres Konzept' })}</div>
                    <div className="text-[11px] text-muted-foreground">{t('verankerung.wiz.emptyHint', { defaultValue: 'Ohne Vorlage starten' })}</div>
                </button>
            </div>
        </Shell>
    );

    if (step === 'vorschau') return (
        <Shell>
            {selected ? (
                <>
                    <p className="mb-1 text-[13px] font-medium">{selected.name}</p>
                    {selected.description && <p className="mb-3 text-[12px] text-muted-foreground">{selected.description}</p>}
                    <p className="mb-1 text-[12px] font-medium">{t('verankerung.wiz.contains', { defaultValue: 'Diese Vorlage enthält folgende Bausteine:' })}</p>
                    <ol className="list-decimal space-y-0.5 pl-5 text-[13px]">
                        {selected.bausteine.map(b => <li key={b.key}>{b.label}</li>)}
                    </ol>
                    <p className="mt-3 text-[11px] text-muted-foreground">{t('verankerung.wiz.previewNote', { defaultValue: 'Die Bausteine werden beim Anlegen als bearbeitbare Praxisbausteine erstellt.' })}</p>
                </>
            ) : (
                <p className="text-[13px] text-muted-foreground">{t('verankerung.wiz.emptyPreview', { defaultValue: 'Leeres Konzept — Bausteine baust du selbst auf.' })}</p>
            )}
        </Shell>
    );

    if (step === 'name') return (
        <Shell canNext={!!effectiveName}>
            <label className="mb-1 block text-[12px] font-medium">{t('verankerung.conceptName', { defaultValue: 'Name des Konzepts' })}</label>
            <input className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]"
                value={name} placeholder={selected?.name ?? ''} onChange={e => setName(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">{t('verankerung.wiz.nameHint', { defaultValue: 'Vorbelegt mit dem Vorlagennamen — anpassbar.' })}</p>
        </Shell>
    );

    if (step === 'verantwortlich') return (
        <Shell>
            <p className="mb-2 text-[13px] font-medium">{t('verankerung.wiz.responsible', { defaultValue: 'Verantwortliche:n festlegen (optional)' })}</p>
            <select className="mb-2 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]" value={respUser} onChange={e => setRespUser(e.target.value)}>
                <option value="">{t('verankerung.wiz.later', { defaultValue: '— später festlegen —' })}</option>
                {users.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
            {respUser && (
                <select className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]" value={respRole} onChange={e => setRespRole(e.target.value)}>
                    <option value="owner">{t('verankerung.role.owner', { defaultValue: 'Konzept-Pate / Verantwortung' })}</option>
                    <option value="team">{t('verankerung.role.team', { defaultValue: 'Steuergruppe' })}</option>
                    <option value="approver">{t('verankerung.role.approver', { defaultValue: 'Schulleitung (Beschluss)' })}</option>
                    <option value="reviewer">{t('verankerung.role.reviewer', { defaultValue: 'Kollegium (Kenntnisnahme)' })}</option>
                    <option value="dataProtectionReviewer">{t('verankerung.role.dpo', { defaultValue: 'Datenschutz' })}</option>
                </select>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">{t('verankerung.wiz.respHint', { defaultValue: 'Du kannst Verantwortliche auch nach dem Anlegen über die geführte Liste bestätigen.' })}</p>
        </Shell>
    );

    if (step === 'zielgruppe') return (
        <Shell>
            <p className="mb-2 text-[13px] font-medium">{t('verankerung.wiz.targets', { defaultValue: 'Zielgruppe festlegen (optional)' })}</p>
            <select className="mb-2 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]" value={tgScope} onChange={e => setTgScope(e.target.value)}>
                <option value="">{t('verankerung.wiz.later', { defaultValue: '— später festlegen —' })}</option>
                <option value="tenant">{t('verankerung.scopeTenant', { defaultValue: 'Die ganze Schule' })}</option>
                <option value="userType">{t('verankerung.scopeUserType', { defaultValue: 'Eine Benutzergruppe' })}</option>
                <option value="space">{t('verankerung.scopeSpace', { defaultValue: 'Einen Space' })}</option>
            </select>
            {tgScope === 'userType' && (
                <select className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]" value={tgUserType} onChange={e => setTgUserType(e.target.value)}>
                    <option value="">—</option>
                    {userTypes.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
            )}
            {tgScope === 'space' && (
                <select className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]" value={tgSpace} onChange={e => setTgSpace(e.target.value)}>
                    <option value="">—</option>
                    {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            )}
        </Shell>
    );

    if (step === 'startaufgaben') return (
        <Shell nextLabel={t('verankerung.wiz.toReview', { defaultValue: 'Weiter zum Anlegen' })}>
            <p className="mb-2 text-[13px] font-medium">{t('verankerung.wiz.starterTitle', { defaultValue: 'Nach dem Anlegen werden diese Schritte als geführte Liste vorbereitet:' })}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
                <li>{t('verankerung.step.resp', { defaultValue: 'Verantwortliche bestätigen' })}</li>
                <li>{t('verankerung.step.targets', { defaultValue: 'Zielgruppen prüfen' })}</li>
                <li>{t('verankerung.step.practice', { defaultValue: 'Erste Praxisbausteine bearbeiten' })}</li>
                <li>{t('verankerung.step.check', { defaultValue: 'Pflichtcheck starten (falls Schutzkonzept-Modul aktiv)' })}</li>
                <li>{t('verankerung.step.adopt', { defaultValue: 'Beschluss vorbereiten' })}</li>
                <li>{t('verankerung.step.eval', { defaultValue: 'Erste Evaluation / Wiedervorlage terminieren' })}</li>
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">{t('verankerung.wiz.starterNote', { defaultValue: 'Eine jährliche Wiedervorlage wird automatisch angelegt. Inhalte je Bundesland sind separat fachlich zu kuratieren.' })}</p>
        </Shell>
    );

    // step === 'anlegen'
    return (
        <Shell next={() => void finish()} nextLabel={busy ? t('verankerung.wiz.creating', { defaultValue: 'Wird angelegt…' }) : t('verankerung.wiz.create', { defaultValue: 'Konzept für meine Schule anlegen' })} canNext={!busy}>
            <p className="mb-2 text-[13px] font-medium">{t('verankerung.wiz.summary', { defaultValue: 'Zusammenfassung' })}</p>
            <dl className="space-y-1 text-[13px]">
                <div><dt className="inline text-muted-foreground">{t('verankerung.template', { defaultValue: 'Vorlage' })}: </dt><dd className="inline">{selected?.name ?? t('verankerung.emptyConcept', { defaultValue: 'Leeres Konzept' })}</dd></div>
                <div><dt className="inline text-muted-foreground">{t('verankerung.conceptName', { defaultValue: 'Name' })}: </dt><dd className="inline">{effectiveName || '—'}</dd></div>
                <div><dt className="inline text-muted-foreground">{t('verankerung.responsibles', { defaultValue: 'Verantwortliche' })}: </dt><dd className="inline">{respUser ? (users.find(u => u.value === respUser)?.label ?? respUser) : t('verankerung.wiz.laterShort', { defaultValue: 'später' })}</dd></div>
                <div><dt className="inline text-muted-foreground">{t('verankerung.tab.targets', { defaultValue: 'Zielgruppe' })}: </dt><dd className="inline">{tgScope || t('verankerung.wiz.laterShort', { defaultValue: 'später' })}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] text-muted-foreground">{t('verankerung.wiz.createNote', { defaultValue: 'Es entstehen Konzept, Bausteine, jährliche Wiedervorlage. Danach landest du auf der geführten Nächste-Schritte-Liste.' })}</p>
        </Shell>
    );
}
