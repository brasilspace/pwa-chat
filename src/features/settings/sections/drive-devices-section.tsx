/**
 * DriveDevicesSection — "Meine Geraete" fuer den Desktop-Sync-Client.
 *
 * Bedient:
 *  - POST   /platform/v1/drive/device/pair-request → Pairing-Code holen
 *  - GET    /platform/v1/drive/devices             → eigene Liste
 *  - DELETE /platform/v1/drive/devices/:id          → Geraet revoken
 */

import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { MaterialIcon } from '@/components/ui/material-icon';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Device {
    id: string;
    deviceName: string | null;
    platform: 'macos' | 'windows' | 'linux' | null;
    agentVersion: string | null;
    hostname: string | null;
    pairedAt: string;
    lastSeenAt: string | null;
}

interface PairCode {
    pairingCode: string;
    expiresAt: string;
}

const PLATFORM_LABEL: Record<string, string> = {
    macos: 'macOS',
    windows: 'Windows',
    linux: 'Linux',
};

const PLATFORM_ICON: Record<string, string> = {
    macos: 'laptop_mac',
    windows: 'laptop_windows',
    linux: 'laptop',
};

export function DriveDevicesSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [pairing, setPairing] = useState<PairCode | null>(null);
    const [pairingError, setPairingError] = useState<string | null>(null);
    const [showAddDialog, setShowAddDialog] = useState(false);

    const reload = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const gw = createPlatformGateway();
            const res = await gw.fetchJson<{ devices: Device[] }>(jwt, '/platform/v1/drive/devices');
            setDevices(res.devices);
        } catch (e) {
            console.error('[drive] failed to load devices', e);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { void reload(); }, [reload]);

    // Countdown beim Pairing — Code laeuft nach 10 Min ab.
    useEffect(() => {
        if (!pairing) return;
        const interval = window.setInterval(() => {
            if (new Date(pairing.expiresAt).getTime() <= Date.now()) {
                setPairing(null);
                setPairingError('Pairing-Code abgelaufen. Bitte neuen Code erzeugen.');
            }
        }, 1000);
        return () => window.clearInterval(interval);
    }, [pairing]);

    const requestPair = async (platform: 'macos' | 'windows' | 'linux', deviceName: string) => {
        if (!jwt) return;
        setPairingError(null);
        try {
            const res = await fetch('/api/platform/v1/drive/device/pair-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
                body: JSON.stringify({ deviceName, platform }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.message ?? `HTTP ${res.status}`);
            }
            const body: PairCode = await res.json();
            setPairing(body);
            setShowAddDialog(false);
        } catch (e) {
            setPairingError(e instanceof Error ? e.message : 'Pairing fehlgeschlagen');
        }
    };

    const revoke = async (deviceId: string, deviceName: string | null) => {
        if (!jwt) return;
        if (!confirm(`"${deviceName ?? deviceId}" wirklich entfernen? Der Sync wird gestoppt und lokale Cache geloescht.`)) return;
        try {
            const res = await fetch(`/api/platform/v1/drive/devices/${deviceId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
            await reload();
        } catch (e) {
            alert('Revoke fehlgeschlagen: ' + (e instanceof Error ? e.message : t('common.unknown')));
        }
    };

    return (
        <div className="space-y-6 p-6 text-[13px]">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-semibold">{t('settings.drive_devices.meine_geraete')}</h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t('settings.drive_devices.desktop-sync-clients_die_mit_deinem_acco')}
                    </p>
                </div>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => { setPairingError(null); setShowAddDialog(true); }}
                >
                    <MaterialIcon name="add" size={16} className="mr-1" />
                    {t('settings.drive_devices.geraet_verbinden')}
                </Button>
            </div>

            {pairing && (
                <PairingCodeBox pairing={pairing} onCancel={() => setPairing(null)} onComplete={async () => { setPairing(null); await reload(); }} />
            )}

            {pairingError && !pairing && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                    {pairingError}
                </div>
            )}

            {showAddDialog && (
                <AddDeviceDialog
                    onClose={() => setShowAddDialog(false)}
                    onSubmit={requestPair}
                />
            )}

            {loading ? (
                <div className="flex items-center justify-center p-12">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
            ) : devices.length === 0 ? (
                <EmptyState onAdd={() => setShowAddDialog(true)} />
            ) : (
                <div className="divide-y rounded-md border">
                    {devices.map(d => (
                        <DeviceRow key={d.id} device={d} onRevoke={() => revoke(d.id, d.deviceName)} />
                    ))}
                </div>
            )}

            <div className="rounded-md border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                <p className="font-medium text-foreground">{t('settings.drive_devices.wie_funktioniert_das')}</p>
                <ol className="mt-1.5 ml-4 list-decimal space-y-0.5">
                    <li>{t('settings.drive_devices.lade_die_prilog-drive-app_herunter_kommt')}</li>
                    <li>{t('settings.drive_devices.klick_auf_geraet_verbinden_und_kopiere_d')}</li>
                    <li>{t('settings.drive_devices.trage_ihn_in_der_app_ein_fertig')}</li>
                </ol>
                <p className="mt-2">{t('settings.drive_devices.ein_verlorenes_geraet_kannst_du_jederzei')}</p>
            </div>
        </div>
    );
}

function PairingCodeBox({ pairing, onCancel, onComplete }: {
    pairing: PairCode; onCancel: () => void; onComplete: () => Promise<void>;
}): JSX.Element {
    const t = useT();
    const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000)));

    useEffect(() => {
        const interval = window.setInterval(() => {
            setRemaining(Math.max(0, Math.floor((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000)));
        }, 1000);
        return () => window.clearInterval(interval);
    }, [pairing.expiresAt]);

    const m = Math.floor(remaining / 60).toString().padStart(2, '0');
    const s = (remaining % 60).toString().padStart(2, '0');

    return (
        <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-4">
            <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('settings.drive_devices.pairing-code')}</h3>
                <span className="font-mono text-[11px] text-muted-foreground">{t('settings.drive_devices.laeuft_ab_in')} {m}:{s}</span>
            </div>
            <p className="mb-3 text-[12px] text-muted-foreground">
                {t('settings.drive_devices.trage_diesen_code_in_der_prilog-drive-ap')}
            </p>
            <div className="mb-4 flex justify-center">
                <code className="select-all rounded-md border bg-background px-6 py-3 text-2xl font-bold tracking-widest text-primary">
                    {pairing.pairingCode}
                </code>
            </div>
            <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={async () => await onComplete()} className="flex-1">
                    {t('settings.drive_devices.verbindung_pruefen')}
                </Button>
                <Button variant="secondary" size="sm" onClick={onCancel}>
                    {t('settings.drive_devices.abbrechen')}
                </Button>
            </div>
        </div>
    );
}

function AddDeviceDialog({ onClose, onSubmit }: {
    onClose: () => void;
    onSubmit: (platform: 'macos' | 'windows' | 'linux', deviceName: string) => Promise<void>;
}): JSX.Element {
    const t = useT();
    const [platform, setPlatform] = useState<'macos' | 'windows' | 'linux'>('macos');
    const [name, setName] = useState('Mein Laptop');
    const [submitting, setSubmitting] = useState(false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="w-full max-w-md rounded-md border bg-background p-4 shadow-lg" onClick={e => e.stopPropagation()}>
                <h3 className="mb-3 text-base font-semibold">{t('settings.drive_devices.geraet_verbinden')}</h3>
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{t('settings.drive_devices.geraete-name')}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('settings.drive_devices.zb_lisas_macbook_pro')}
                            className="h-9 w-full rounded-md border bg-background px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary"
                            maxLength={255}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{t('settings.drive_devices.plattform')}</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['macos', 'windows', 'linux'] as const).map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPlatform(p)}
                                    className={cn(
                                        'flex flex-col items-center gap-1 rounded-md border px-3 py-2 text-[12px] hover:bg-muted',
                                        platform === p ? 'border-primary bg-primary/5 text-primary' : 'border-border'
                                    )}
                                >
                                    <MaterialIcon name={PLATFORM_ICON[p]} size={20} />
                                    {PLATFORM_LABEL[p]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" size="sm" onClick={onClose}>{t('settings.drive_devices.abbrechen')}</Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={!name.trim() || submitting}
                            onClick={async () => {
                                setSubmitting(true);
                                try { await onSubmit(platform, name.trim()); }
                                finally { setSubmitting(false); }
                            }}
                        >
                            {submitting ? 'Pairing...' : 'Code erzeugen'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DeviceRow({ device, onRevoke }: { device: Device; onRevoke: () => void }): JSX.Element {
    const t = useT();
    const platform = device.platform ?? 'macos';
    const lastSeenLabel = device.lastSeenAt
        ? formatRelative(new Date(device.lastSeenAt))
        : 'nie';

    return (
        <div className="flex items-center gap-3 p-3 hover:bg-muted/30">
            <MaterialIcon name={PLATFORM_ICON[platform]} size={24} className="shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{device.deviceName ?? device.id}</p>
                <p className="text-[11px] text-muted-foreground">
                    {PLATFORM_LABEL[platform]}
                    {device.hostname && <> · {device.hostname}</>}
                    {device.agentVersion && <> {t('settings.drive_devices.v')}{device.agentVersion}</>}
                </p>
                <p className="text-[10px] text-muted-foreground">
                    {t('settings.drive_devices.verbunden_seit')} {new Date(device.pairedAt).toLocaleDateString('de-DE')} {t('settings.drive_devices.zuletzt_aktiv')} {lastSeenLabel}
                </p>
            </div>
            <button
                onClick={onRevoke}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title={t('settings.drive_devices.geraet_entfernen')}
            >
                <MaterialIcon name="logout" size={16} />
            </button>
        </div>
    );
}

function EmptyState({ onAdd }: { onAdd: () => void }): JSX.Element {
    const t = useT();
    return (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-12 text-center">
            <MaterialIcon name="devices" size={48} className="text-muted-foreground/30" />
            <div>
                <p className="text-sm font-medium">{t('settings.drive_devices.noch_keine_geraete_verbunden')}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                    {t('settings.drive_devices.verbinde_prilog-drive_auf_deinem_compute')}
                </p>
            </div>
            <Button variant="primary" size="sm" onClick={onAdd}>
                <MaterialIcon name="add" size={16} className="mr-1" />
                {t('settings.drive_devices.erstes_geraet_verbinden')}
            </Button>
        </div>
    );
}

function formatRelative(date: Date): string {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'gerade eben';
    if (minutes < 60) return `vor ${minutes} Min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `vor ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `vor ${days} Tagen`;
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' });
}
