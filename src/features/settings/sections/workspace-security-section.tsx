import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

export function WorkspaceSecuritySection(): JSX.Element {
    const t = useT();
    return (
        <div className="space-y-10">
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MaterialIcon name="shield" size={16} className="size-5" /> {t('settings.workspace_security.sicherheit')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.workspace_security.workspace-weite_sicherheits-einstellunge')}
                </p>
            </div>

            <AdminPasswordBlock />
            <hr className="border-border" />
            <AvvBlock />
            <hr className="border-border" />
            <AvIncidentsBlock />
            <hr className="border-border" />
            <AvWhitelistBlock />
        </div>
    );
}

// ─── Matrix-Admin-Passwort ──────────────────────────────────────────────────

function AdminPasswordBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const save = useCallback(async () => {
        setMessage(null);
        if (next.length < 8) {
            setMessage({ kind: 'err', text: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' });
            return;
        }
        if (next !== confirm) {
            setMessage({ kind: 'err', text: 'Die Passwort-Wiederholung stimmt nicht überein.' });
            return;
        }
        if (!jwt) return;
        setSaving(true);
        try {
            const res = await fetch('/api/platform/v1/workspace/admin-password', {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: current, newPassword: next }),
            });
            const data = await res.json();
            if (!res.ok || data?.success === false) {
                throw new Error(data?.error ?? `HTTP ${res.status}`);
            }
            setCurrent('');
            setNext('');
            setConfirm('');
            setMessage({ kind: 'ok', text: data.message ?? 'Matrix-Admin-Passwort wurde aktualisiert.' });
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Passwort konnte nicht gespeichert werden.' });
        } finally {
            setSaving(false);
        }
    }, [jwt, current, next, confirm]);

    return (
        <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
                <MaterialIcon name="lock" size={16} className="size-4" /> {t('settings.workspace_security.matrix-admin-passwort')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('settings.workspace_security.aendert_das_admin-passwort_fuer_synapse_')}
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('settings.workspace_security.aktuelles_passwort')}</label>
                    <input
                        type="password"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        disabled={saving}
                        autoComplete="current-password"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('settings.workspace_security.neues_passwort')}</label>
                    <input
                        type="password"
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        disabled={saving}
                        autoComplete="new-password"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('settings.workspace_security.wiederholen')}</label>
                    <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        disabled={saving}
                        autoComplete="new-password"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
                {message && (
                    <p className={cn('text-sm', message.kind === 'err' ? 'text-destructive' : 'text-emerald-600')}>
                        {message.text}
                    </p>
                )}
                <button
                    onClick={save}
                    disabled={saving || !current || !next || !confirm}
                    className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : 'Passwort speichern'}
                </button>
            </div>
        </div>
    );
}

// ─── AVV-Download ───────────────────────────────────────────────────────────

interface AvvStatus {
    available: boolean;
    consentDate: string | null;
    subdomain: string | null;
}

function AvvBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [status, setStatus] = useState<AvvStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jwt) return;
        fetch('/api/platform/v1/workspace/avv-status', {
            headers: { Authorization: `Bearer ${jwt}` },
        })
            .then(async r => {
                if (!r.ok) {
                    const data = await r.json().catch(() => null);
                    throw new Error(data?.error ?? `HTTP ${r.status}`);
                }
                return r.json();
            })
            .then(d => { if (d) setStatus(d); setError(null); })
            .catch(e => {
                console.error('[avv] status fetch failed:', e);
                setError(e instanceof Error ? e.message : 'AVV-Status konnte nicht geladen werden');
            })
            .finally(() => setLoading(false));
    }, [jwt]);

    const download = useCallback(async () => {
        if (!jwt) return;
        setDownloading(true);
        setError(null);
        try {
            const res = await fetch('/api/platform/v1/workspace/avv', {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({} as any));
                throw new Error(data?.error ?? `HTTP ${res.status}`);
            }
            // PDF-Blob in Browser-Download geben
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `AVV_${status?.subdomain ?? 'prilog'}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Blob-URL nach kurzem Delay aufraeumen
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Download fehlgeschlagen');
        } finally {
            setDownloading(false);
        }
    }, [jwt, status]);

    return (
        <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
                <MaterialIcon name="download" size={16} className="size-4" /> {t('settings.workspace_security.auftragsverarbeitungsvertrag_avv')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.workspace_security.der_bei_der_bestellung_digital_abgeschlo')}
            </p>

            {loading ? (
                <div className="mt-4 text-sm text-muted-foreground">
                    <Loader2 className="inline size-4 animate-spin" /> {t('settings.workspace_security.lade_avv-status')}
                </div>
            ) : error ? (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </div>
            ) : !status?.available ? (
                <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    {t('settings.workspace_security.fuer_diesen_tenant_liegt_kein_avv_vor_ma')}
                </div>
            ) : (
                <div className="mt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                        {t('settings.workspace_security.abgeschlossen_am')} {status.consentDate ? new Date(status.consentDate).toLocaleDateString('de-DE') : '–'}.
                    </p>
                    <button
                        onClick={download}
                        disabled={downloading}
                        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                        {downloading ? <Loader2 className="size-4 animate-spin" /> : <MaterialIcon name="download" size={16} className="size-4" />}
                        {t('settings.workspace_security.avv_als_pdf_herunterladen')}
                    </button>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
            )}
        </div>
    );
}

// ─── AV-Vorfaelle (Tenant-Admin sieht eigene) ─────────────────────────

interface AvIncident {
    id: number;
    tenantId: string;
    userMatrixId: string | null;
    filename: string;
    virusSignature: string;
    context: string;
    sizeBytes: number | null;
    sha256: string | null;
    blocked: boolean;
    quarantineKey: string | null;
    detectedAt: string;
}

const AV_CONTEXT_LABEL: Record<string, string> = {
    'dms': 'DMS', 'mein-fach': 'Mein Fach', 'space-file': 'Space-Datei',
    'chat': 'Chat', 'other': 'Andere',
};

function AvIncidentsBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [items, setItems] = useState<AvIncident[]>([]);
    const [loading, setLoading] = useState(true);
    const [whitelistingId, setWhitelistingId] = useState<number | null>(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const r = await fetch('/api/platform/v1/workspace/av-incidents?limit=50', {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (r.ok) {
                const data = await r.json() as { items: AvIncident[] };
                setItems(data.items);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const whitelistEntry = useCallback(async (it: AvIncident) => {
        if (!jwt || !it.sha256) return;
        const reason = window.prompt(
            `Datei "${it.filename}" ist ein False-Positive?\n\nGib eine kurze Begruendung an (wird im Audit-Log gespeichert):`,
            `False-Positive: ${it.virusSignature}`,
        );
        if (!reason) return;
        setWhitelistingId(it.id);
        try {
            const r = await fetch('/api/platform/v1/workspace/av-whitelist', {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ sha256: it.sha256, filename: it.filename, reason }),
            });
            if (!r.ok) {
                const text = await r.text();
                alert(`Whitelist fehlgeschlagen: ${text}`);
                return;
            }
            alert('Hash zur Whitelist hinzugefuegt. Folge-Uploads dieser Datei werden durchgelassen.');
        } finally {
            setWhitelistingId(null);
        }
    }, [jwt]);

    const downloadQuarantine = useCallback(async (it: AvIncident) => {
        if (!jwt || !it.quarantineKey) return;
        const reason = window.prompt(
            `🛡️ Forensik-Download fuer "${it.filename}"\n\n`
            + `Diese Datei wurde von ClamAV als "${it.virusSignature}" markiert. `
            + `Der Download wird im Audit-Log protokolliert.\n\n`
            + `Begruendung (>=5 Zeichen, z.B. "Forensik-Analyse"):`,
            'Forensik-Analyse',
        );
        if (!reason || reason.trim().length < 5) return;
        try {
            const r = await fetch(
                `/api/platform/v1/workspace/av-incidents/${it.id}/quarantine-download?reason=${encodeURIComponent(reason.trim())}`,
                { headers: { Authorization: `Bearer ${jwt}` } },
            );
            if (!r.ok) {
                const text = await r.text();
                alert(`Download fehlgeschlagen: ${text}`);
                return;
            }
            const data = await r.json() as { downloadUrl: string };
            window.open(data.downloadUrl, '_blank');
        } catch (err) {
            alert(`Download fehlgeschlagen: ${err instanceof Error ? err.message : err}`);
        }
    }, [jwt]);

    const purgeQuarantine = useCallback(async (it: AvIncident) => {
        if (!jwt) return;
        if (!window.confirm(
            `Quarantaene-Datei "${it.filename}" endgueltig loeschen?\n\n`
            + `Audit-Eintrag bleibt bestehen, aber die Datei wird aus dem Speicher entfernt. `
            + `Nicht mehr wiederherstellbar.`,
        )) return;
        try {
            const r = await fetch(`/api/platform/v1/workspace/av-incidents/${it.id}/quarantine`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!r.ok) {
                const text = await r.text();
                alert(`Loeschen fehlgeschlagen: ${text}`);
                return;
            }
            await load();
        } catch (err) {
            alert(`Loeschen fehlgeschlagen: ${err instanceof Error ? err.message : err}`);
        }
    }, [jwt, load]);

    return (
        <div>
            <h3 className="mb-1 flex items-center gap-2 text-base font-semibold">
                <MaterialIcon name="report" size={16} />
                {t('settings.workspace_security.antivirus-vorfaelle')}
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
                {t('settings.workspace_security.geblockte_uploads_in_deinem_workspace_be')}
            </p>
            {loading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">{t('settings.workspace_security.bisher_keine_vorfaelle')}</p>
            ) : (
                <div className="space-y-1.5">
                    {items.slice(0, 20).map(it => (
                        <div key={it.id} className={cn(
                            'flex items-center gap-3 rounded-md border p-2.5 text-xs',
                            it.blocked ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/50',
                        )}>
                            <MaterialIcon name={it.blocked ? 'block' : 'check_circle'} size={16}
                                className={it.blocked ? 'text-red-600' : 'text-amber-600'} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{it.filename}</div>
                                <div className="text-[10px] text-muted-foreground">
                                    {AV_CONTEXT_LABEL[it.context] ?? it.context}
                                    {' · '}<span className="font-mono">{it.virusSignature}</span>
                                    {' · '}{new Date(it.detectedAt).toLocaleString('de-DE')}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                {it.blocked && it.sha256 && (
                                    <button
                                        onClick={() => whitelistEntry(it)}
                                        disabled={whitelistingId === it.id}
                                        className="rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
                                        title={t('settings.workspace_security.hash_zur_whitelist_hinzufuegen_false-pos')}
                                    >
                                        {whitelistingId === it.id ? <Loader2 className="size-3 animate-spin" /> : 'Whitelisten'}
                                    </button>
                                )}
                                {it.quarantineKey && (
                                    <>
                                        <button
                                            onClick={() => downloadQuarantine(it)}
                                            className="rounded-md border bg-background p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            title={t('settings.workspace_security.forensik-download_mit_audit-log')}
                                        >
                                            <MaterialIcon name="download" size={12} />
                                        </button>
                                        <button
                                            onClick={() => purgeQuarantine(it)}
                                            className="rounded-md border bg-background p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            title={t('settings.workspace_security.quarantaene-datei_endgueltig_loeschen')}
                                        >
                                            <MaterialIcon name="delete_forever" size={12} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── AV-Whitelist ────────────────────────────────────────────────────

interface AvWhitelistRow {
    id: number;
    sha256: string;
    filename: string | null;
    reason: string;
    createdBy: string;
    createdAt: string;
    lastUsedAt: string | null;
    useCount: number;
}

function AvWhitelistBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [items, setItems] = useState<AvWhitelistRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const r = await fetch('/api/platform/v1/workspace/av-whitelist', {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (r.ok) {
                const data = await r.json() as { items: AvWhitelistRow[] };
                setItems(data.items);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const remove = useCallback(async (id: number) => {
        if (!jwt) return;
        if (!window.confirm('Whitelist-Eintrag entfernen? Folge-Uploads dieser Datei werden dann wieder geblockt.')) return;
        setBusyId(id);
        try {
            const r = await fetch(`/api/platform/v1/workspace/av-whitelist/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (r.ok) await load();
        } finally {
            setBusyId(null);
        }
    }, [jwt, load]);

    return (
        <div>
            <h3 className="mb-1 flex items-center gap-2 text-base font-semibold">
                <MaterialIcon name="shield_with_heart" size={16} />
                {t('settings.workspace_security.antivirus-whitelist')}
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
                {t('settings.workspace_security.datei-hashes_die_vom_virus-scan_ausgenom')}
            </p>
            {loading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">{t('settings.workspace_security.noch_keine_whitelist-eintraege')}</p>
            ) : (
                <div className="space-y-1.5">
                    {items.map(it => (
                        <div key={it.id} className="flex items-start gap-3 rounded-md border p-2.5 text-xs">
                            <MaterialIcon name="verified" size={16} className="mt-0.5 text-emerald-600" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{it.filename ?? '(ohne Dateiname)'}</div>
                                <div className="font-mono text-[10px] text-muted-foreground truncate">{it.sha256}</div>
                                <div className="mt-0.5 text-[11px] italic text-muted-foreground">
                                    {it.reason}
                                </div>
                                <div className="mt-0.5 text-[10px] text-muted-foreground">
                                    {it.createdBy} · {new Date(it.createdAt).toLocaleDateString('de-DE')}
                                    {it.useCount > 0 && (
                                        <> · {it.useCount}{t('settings.workspace_security.verwendet_zuletzt')} {it.lastUsedAt ? new Date(it.lastUsedAt).toLocaleDateString('de-DE') : '—'}</>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => remove(it.id)}
                                disabled={busyId === it.id}
                                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                                title={t('settings.workspace_security.eintrag_entfernen')}
                            >
                                {busyId === it.id ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="delete" size={14} />}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
