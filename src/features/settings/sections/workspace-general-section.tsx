import { type JSX, useCallback, useEffect, useState, useSyncExternalStore, useMemo } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { WelcomeSettings } from '../welcome-settings';
import { cn } from '@/lib/utils';
import { Mic, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";
import { createCalendarGateway } from '@/gateways/platform/calendar-gateway';
import { useSpaces } from '@/features/spaces/use-spaces';
import { useCan } from '@/core/permissions';

export function WorkspaceGeneralSection(): JSX.Element {
    const t = useT();
    return (
        <div className="space-y-10">
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MaterialIcon name="apartment" size={16} className="size-5" /> {t('settings.workspace_general.workspace')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.workspace_general.allgemeine_workspace-einstellungen_begru')}
                </p>
            </div>

            <WorkspaceNameBlock />

            <hr className="border-border" />

            <WelcomeSettings />

            <hr className="border-border" />

            <PlannerSpaceBlock />

            <hr className="border-border" />

            <FlurfunkBlock />
        </div>
    );
}

// ─── Termin-Steuergruppe (Schulkalender-Schreibrechte) ───────────────────
//
// Der Schulkalender (level 1) darf nur von Admins ODER von Mitgliedern eines
// hier benannten Spaces ("Termin-Steuergruppe", "Veranstaltungs-Kreis", …)
// bewirtschaftet werden. Backend: TenantSetting `calendar_planner_space_id`,
// PATCH /platform/v1/calendar/planner-space. Hier wird der Space pro Tenant
// gewaehlt; das ist eine Konfiguration der ganzen Schule und gehoert zu den
// Workspace-Admin-Einstellungen.

const calendarGateway = createCalendarGateway();

function PlannerSpaceBlock(): JSX.Element | null {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const isAdmin = useCan('manageRuntime');
    const { spaces, loading: spacesLoading } = useSpaces();

    const [plannerSpaceId, setPlannerSpaceId] = useState<string>('');
    const [initial, setInitial] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    useEffect(() => {
        if (!jwt) return;
        calendarGateway.canManageSchool(jwt)
            .then(r => {
                const id = r.plannerSpaceId ?? '';
                setPlannerSpaceId(id);
                setInitial(id);
            })
            .catch(() => { /* still show the dropdown, just empty */ })
            .finally(() => setLoading(false));
    }, [jwt]);

    const sortedSpaces = useMemo(
        () => [...spaces].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
        [spaces],
    );

    const save = useCallback(async () => {
        if (!jwt) return;
        setMessage(null);
        setSaving(true);
        try {
            const res = await calendarGateway.setPlannerSpace(jwt, plannerSpaceId.trim() === '' ? null : plannerSpaceId);
            setInitial(res.plannerSpaceId ?? '');
            setMessage({ kind: 'ok', text: t('settings.workspace_general.planner_saved', { defaultValue: 'Gespeichert.' }) });
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Speichern fehlgeschlagen.' });
        } finally {
            setSaving(false);
        }
    }, [jwt, plannerSpaceId, t]);

    if (!isAdmin) return null;

    const dirty = plannerSpaceId !== initial;

    return (
        <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
                <MaterialIcon name="event_available" size={16} className="size-4" />
                {t('settings.workspace_general.planner_title', { defaultValue: 'Termin-Steuergruppe (Schulkalender)' })}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('settings.workspace_general.planner_hint', {
                    defaultValue:
                        'Mitglieder dieses Spaces duerfen den Schulkalender bewirtschaften — zusaetzlich zu Admins. Beispiele fuer den Namen: „Termin-Steuergruppe", „Veranstaltungs-Kreis", „Schulkalender-Team". Ohne Auswahl koennen nur Admins schreiben.',
                })}
            </p>

            {loading || spacesLoading ? (
                <div className="mt-4 text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin" /> {t('settings.workspace_general.lade')}</div>
            ) : (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                        value={plannerSpaceId}
                        onChange={(e) => setPlannerSpaceId(e.target.value)}
                        disabled={saving}
                        className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option value="">{t('settings.workspace_general.planner_none', { defaultValue: '— kein Space (nur Admins) —' })}</option>
                        {sortedSpaces.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || !dirty}
                        className={cn(
                            'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
                            saving || !dirty
                                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                                : 'bg-primary text-primary-foreground hover:opacity-90',
                        )}
                    >
                        {saving && <Loader2 className="size-4 animate-spin" />}
                        {t('settings.workspace_general.speichern')}
                    </button>
                </div>
            )}

            {message && (
                <p className={cn('mt-2 text-sm', message.kind === 'ok' ? 'text-green-600' : 'text-red-600')}>
                    {message.text}
                </p>
            )}
        </div>
    );
}

// ─── Workspace-Name (Anzeigename oben im Hauptfenster) ──────────────────────

function WorkspaceNameBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const currentName = session.bootstrap?.branding?.tenantName ?? '';

    const [name, setName] = useState(currentName);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    useEffect(() => {
        setName(currentName);
    }, [currentName]);

    const save = useCallback(async () => {
        if (!jwt) return;
        setMessage(null);
        const trimmed = name.trim();
        if (trimmed.length < 2 || trimmed.length > 60) {
            setMessage({ kind: 'err', text: t('settings.workspace_general.name_2_60_zeichen') });
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/platform/v1/workspace/display-name', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: trimmed }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? `HTTP ${res.status}`);
            }
            // Bootstrap-Snapshot aktualisieren → Name erscheint sofort oben,
            // ohne Neuladen.
            if (session.bootstrap) {
                sessionStore.setBootstrap({
                    ...session.bootstrap,
                    branding: { ...session.bootstrap.branding, tenantName: trimmed },
                });
            }
            setMessage({ kind: 'ok', text: t('settings.workspace_general.name_gespeichert') });
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : t('settings.workspace_general.speichern_fehlgeschlagen') });
        } finally {
            setSaving(false);
        }
    }, [jwt, name, session.bootstrap, t]);

    const dirty = name.trim() !== currentName.trim();

    return (
        <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
                <MaterialIcon name="badge" size={16} className="size-4" /> {t('settings.workspace_general.workspace-name')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('settings.workspace_general.workspace-name_hint')}
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                    maxLength={60}
                    placeholder={t('settings.workspace_general.workspace-name')}
                    className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                    type="button"
                    onClick={save}
                    disabled={saving || !dirty}
                    className={cn(
                        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
                        saving || !dirty
                            ? 'cursor-not-allowed bg-muted text-muted-foreground'
                            : 'bg-primary text-primary-foreground hover:opacity-90',
                    )}
                >
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    {t('settings.workspace_general.speichern')}
                </button>
            </div>

            {message && (
                <p className={cn('mt-2 text-sm', message.kind === 'ok' ? 'text-green-600' : 'text-red-600')}>
                    {message.text}
                </p>
            )}
        </div>
    );
}

// ─── Flurfunk / Voice-Transkription ─────────────────────────────────────────

function FlurfunkBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [enabled, setEnabled] = useState(false);
    const [maxSec, setMaxSec] = useState('30');
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    useEffect(() => {
        if (!jwt) return;
        fetch('/api/platform/v1/workspace/server-info', {
            headers: { Authorization: `Bearer ${jwt}` },
        })
            .then(async r => {
                if (!r.ok) {
                    const data = await r.json().catch(() => null);
                    throw new Error(data?.error ?? `HTTP ${r.status}`);
                }
                return r.json();
            })
            .then(d => {
                if (d?.server) {
                    setEnabled(Boolean(d.server.transcriptionEnabled));
                    setMaxSec(String(d.server.maxRecordingSeconds ?? 30));
                    setPrompt(d.server.transcriptionInitialPrompt ?? '');
                }
            })
            .catch(e => {
                console.error('[flurfunk] init load failed:', e);
                setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Konnte aktuelle Werte nicht laden' });
            })
            .finally(() => setLoading(false));
    }, [jwt]);

    const save = useCallback(async () => {
        if (!jwt) return;
        setMessage(null);
        const sec = Number(maxSec);
        if (!Number.isInteger(sec) || sec < 5 || sec > 300) {
            setMessage({ kind: 'err', text: 'Aufnahmedauer muss zwischen 5 und 300 Sekunden liegen.' });
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/platform/v1/workspace/transcription', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcriptionEnabled: enabled,
                    maxRecordingSeconds: sec,
                    transcriptionInitialPrompt: prompt.trim().length > 0 ? prompt.trim() : null,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setMessage({
                kind: 'ok',
                text: enabled ? `Flurfunk aktiv. Max ${sec}s pro Aufnahme.` : 'Flurfunk deaktiviert.',
            });
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Speichern fehlgeschlagen.' });
        } finally {
            setSaving(false);
        }
    }, [jwt, enabled, maxSec, prompt]);

    return (
        <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
                <Mic className="size-4" /> {t('settings.workspace_general.flurfunk_sprachnachrichten_mit_transkrip')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('settings.workspace_general.mitarbeiter_koennen_kurze_sprachnachrich')}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
                {t('settings.workspace_general.datenschutz_audio_wird_beim_whisper-serv')}
            </p>

            {loading ? (
                <div className="mt-4 text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin" /> {t('settings.workspace_general.lade')}</div>
            ) : (
                <div className="mt-4 space-y-4">
                    {/* Toggle */}
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                            disabled={saving}
                            className="mt-0.5"
                        />
                        <div>
                            <div className="text-sm font-medium">{t('settings.workspace_general.flurfunk_fuer_diesen_tenant_aktivieren')}</div>
                            <div className="text-xs text-muted-foreground">
                                {t('settings.workspace_general.ohne_diesen_schalter_sehen_mitarbeiter_d')}
                            </div>
                        </div>
                    </label>

                    <div className="grid gap-4 lg:grid-cols-[12rem_1fr]">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">{t('settings.workspace_general.max_aufnahme_sekunden')}</label>
                            <input
                                type="number"
                                min={5}
                                max={300}
                                value={maxSec}
                                onChange={(e) => setMaxSec(e.target.value)}
                                disabled={!enabled || saving}
                                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">{t('settings.workspace_general.schul-vokabular_optional')}</label>
                            <textarea
                                rows={3}
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                disabled={!enabled || saving}
                                placeholder={t('settings.workspace_general.klassenlehrerin_elternabend_foerderunter')}
                                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t('settings.workspace_general.whisper_kennt_die_begriffe_beim_transkri')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        {message && (
                            <p className={cn('text-sm', message.kind === 'err' ? 'text-destructive' : 'text-emerald-600')}>
                                {message.text}
                            </p>
                        )}
                        <button
                            onClick={save}
                            disabled={saving}
                            className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="size-4 animate-spin" /> : t('common.save')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
