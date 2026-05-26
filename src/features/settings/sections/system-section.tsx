import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import { Server, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const GITHUB_REPO_URL = 'https://github.com/brasilspace/prilog-web-client';

interface ServerInfo {
    subdomain: string;
    matrixDomain: string;
    webappDomain: string;
    serverIp: string | null;
    adminUsername: string;
    status: string;
    plan: string;
    monthlyPrice: number;
    maxUsers: number;
    maxUploadSize: number;
    storageLimit: number;
    paymentStatus: string;
    installationStatus: string;
    createdAt: string;
}

export function SystemSection(): JSX.Element {
    const t = useT();
    return (
        <div className="space-y-10">
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MaterialIcon name="dns" size={16} className="size-5" /> {t('settings.system.system')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.system.build-version_server-status_und_technisc')}
                </p>
            </div>

            <BuildInfoBlock />
            <hr className="border-border" />
            <ServerStatusBlock />
            <hr className="border-border" />
            <UploadLimitBlock />
        </div>
    );
}

// ─── Build-Info ─────────────────────────────────────────────────────────────

function BuildInfoBlock(): JSX.Element {
    const t = useT();
    const sha = __APP_GIT_SHA__;
    const branch = __APP_GIT_BRANCH__;
    const buildTime = __APP_BUILD_TIME__;
    const buildDate = new Date(buildTime);
    const isDev = sha === 'dev';

    const formatted = isNaN(buildDate.getTime())
        ? buildTime
        : buildDate.toLocaleString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });

    const [copied, setCopied] = useState(false);
    const copyShaWithUrl = useCallback(() => {
        const text = isDev ? sha : `${sha} (${GITHUB_REPO_URL}/commit/${sha})`;
        navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }).catch(() => { });
    }, [sha, isDev]);

    return (
        <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
                <MaterialIcon name="schema" size={16} className="size-4" /> {t('settings.system.build-info')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.system.welche_version_des_web-clients_laeuft_nu')}
            </p>

            <div className="mt-4 space-y-2 rounded-xl border border-border p-4 text-sm">
                <Row label={t('settings.system.commit')} value={isDev ? (
                    <span className="font-mono text-xs">{t('settings.system.dev_lokal')}</span>
                ) : (
                    <a
                        href={`${GITHUB_REPO_URL}/commit/${sha}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-primary hover:underline"
                    >
                        {sha}
                    </a>
                )} />
                <Row label={t('settings.system.branch')} value={<span className="font-mono text-xs">{branch}</span>} />
                <Row label={t('settings.system.gebaut')} value={<span className="text-xs">{formatted}</span>} />
            </div>

            <button
                onClick={copyShaWithUrl}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
                {copied ? <MaterialIcon name="check" size={16} className="size-3.5 text-emerald-500" /> : null}
                {copied ? 'Kopiert' : 'Commit + Link kopieren'}
            </button>
        </div>
    );
}

// ─── Server-Status ──────────────────────────────────────────────────────────

function ServerStatusBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [info, setInfo] = useState<ServerInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

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
            .then(d => { if (d?.server) setInfo(d.server); setError(null); })
            .catch(e => {
                console.error('[system] server-info fetch failed:', e);
                setError(e instanceof Error ? e.message : t('common.error'));
            })
            .finally(() => setLoading(false));
    }, [jwt]);

    if (loading) {
        return <div className="text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin" /> {t('settings.system.lade_server-info')}</div>;
    }
    if (error) {
        return (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {t('settings.system.server-info_konnte_nicht_geladen_werden')} {error}
            </div>
        );
    }
    if (!info) {
        return <p className="text-sm text-muted-foreground">{t('settings.system.keine_server-info_verfuegbar')}</p>;
    }

    return (
        <div>
            <h3 className="text-base font-semibold">{t('settings.system.server-status')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('settings.system.betriebsdaten_des_tenants')}</p>

            <div className="mt-4 space-y-2 rounded-xl border border-border p-4 text-sm">
                <Row label={t('settings.system.subdomain')} value={<code className="text-xs">{info.subdomain}</code>} />
                <Row label={t('settings.system.matrix-domain')} value={
                    <a href={`https://${info.matrixDomain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        {info.matrixDomain}
                    </a>
                } />
                <Row label={t('settings.system.web-app')} value={
                    <a href={`https://${info.webappDomain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        {info.webappDomain}
                    </a>
                } />
                {info.serverIp && <Row label={t('settings.system.server-ip')} value={<code className="text-xs">{info.serverIp}</code>} />}
                <Row label={t('settings.system.status')} value={
                    <span className={cn(
                        'rounded px-1.5 py-0.5 text-xs font-medium',
                        info.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600',
                    )}>{info.status}</span>
                } />
                <Row label={t('settings.system.tarif')} value={<span className="text-xs">{info.plan} · {info.storageLimit} {t('settings.system.gb_speicher')}</span>} />
                <Row label={t('settings.system.erstellt')} value={<span className="text-xs">{new Date(info.createdAt).toLocaleDateString('de-DE')}</span>} />
            </div>
        </div>
    );
}

// ─── Upload-Limit ───────────────────────────────────────────────────────────

function UploadLimitBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [currentMb, setCurrentMb] = useState<number | null>(null);
    const [inputMb, setInputMb] = useState('');
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
                    setCurrentMb(d.server.maxUploadSize);
                    setInputMb(String(d.server.maxUploadSize));
                }
            })
            .catch(e => {
                console.error('[system] upload-limit init failed:', e);
                setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Konnte aktuellen Wert nicht laden' });
            })
            .finally(() => setLoading(false));
    }, [jwt]);

    const save = useCallback(async () => {
        if (!jwt) return;
        setMessage(null);
        const sizeMb = Number(inputMb);
        if (!Number.isInteger(sizeMb) || sizeMb < 10 || sizeMb > 2000) {
            setMessage({ kind: 'err', text: 'Wert muss zwischen 10 und 2000 MB liegen.' });
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/platform/v1/workspace/upload-size', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ sizeMb }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setCurrentMb(data.maxUploadSize);
            setMessage({
                kind: 'ok', text: data.applied
                    ? `Upload-Limit ist jetzt ${data.maxUploadSize} MB und auf dem Server aktiv.`
                    : `Wert gespeichert (${data.maxUploadSize} MB). ${data.message ?? ''}`
            });
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Speichern fehlgeschlagen.' });
        } finally {
            setSaving(false);
        }
    }, [jwt, inputMb]);

    return (
        <div>
            <h3 className="text-base font-semibold">{t('settings.system.upload-limit_fuer_chat-anhaenge')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.system.maximale_datei-groesse_fuer_bilder_video')}
            </p>

            {loading ? (
                <div className="mt-4 text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin" /> {t('settings.system.lade')}</div>
            ) : (
                <div className="mt-4 space-y-3">
                    <div className="flex items-end gap-3">
                        <div className="flex-1 max-w-[12rem]">
                            <label className="text-xs font-medium text-muted-foreground">{t('settings.system.maximale_groesse_mb')}</label>
                            <input
                                type="number"
                                min={10}
                                max={2000}
                                value={inputMb}
                                onChange={(e) => setInputMb(e.target.value)}
                                disabled={saving}
                                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                        </div>
                        <button
                            onClick={save}
                            disabled={saving || Number(inputMb) === currentMb || !inputMb}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="size-4 animate-spin" /> : t('common.apply')}
                        </button>
                    </div>

                    {message && (
                        <p className={cn('text-sm', message.kind === 'err' ? 'text-destructive' : 'text-emerald-600')}>
                            {message.text}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}
