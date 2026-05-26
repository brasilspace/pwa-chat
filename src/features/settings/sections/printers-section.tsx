/**
 * PrintersSection — Schul-Drucker registrieren (Direkt-IPP).
 *
 * Workflow: Admin gibt einen IPP-Endpunkt ein (z.B.
 * `ipp://printer.intern.schule:631/printers/sekretariat`), optional User+Pwd,
 * und der Drucker erscheint im Drucken-Dropdown.
 */

import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { toast } from '@/components/ui/toast';
import { useT } from "@/lib/i18n/use-t";

interface Printer {
    id: string;
    name: string;
    location: string | null;
    ippEndpoint: string | null;
    color: boolean;
    duplex: boolean;
}

export function PrintersSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [printers, setPrinters] = useState<Printer[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await fetch('/api/platform/v1/printers', { headers: { Authorization: `Bearer ${jwt}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setPrinters(data.printers ?? []);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const remove = async (id: string) => {
        if (!jwt) return;
        if (!confirm('Drucker wirklich entfernen?')) return;
        await fetch(`/api/platform/v1/printers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${jwt}` } });
        load();
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MaterialIcon name="print" size={16} className="size-5" /> {t('settings.printers.drucker')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.printers.direkt-druck_an_netzwerk-drucker_via_ipp')}
                </p>
            </div>

            {loading && <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}

            {!loading && (
                <>
                    {printers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t('settings.printers.keine_drucker_eingerichtet')}</p>
                    ) : (
                        <div className="space-y-2">
                            {printers.map(p => (
                                <div key={p.id} className="flex items-center gap-3 rounded border px-3 py-2">
                                    <MaterialIcon name="print" size={20} className="text-primary" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium">{p.name}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {p.location && <>{p.location} · </>}
                                            {p.ippEndpoint}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                            {p.color ? 'Farbe' : 'S/W'} · {p.duplex ? 'Duplex' : 'Einseitig'}
                                        </div>
                                    </div>
                                    <button onClick={() => remove(p.id)} className="rounded p-1 text-destructive hover:bg-destructive/10" title={t('settings.printers.entfernen')}>
                                        <MaterialIcon name="delete" size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {adding ? (
                        <AddPrinterForm jwt={jwt!} onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />
                    ) : (
                        <button
                            onClick={() => setAdding(true)}
                            className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
                        >
                            {t('settings.printers.drucker_hinzufuegen')}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

function AddPrinterForm({ jwt, onDone, onCancel }: { jwt: string; onDone: () => void; onCancel: () => void }): JSX.Element {
    const t = useT();
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [ippEndpoint, setIppEndpoint] = useState('ipp://');
    const [ippUsername, setIppUsername] = useState('');
    const [ippPassword, setIppPassword] = useState('');
    const [color, setColor] = useState(true);
    const [duplex, setDuplex] = useState(false);
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/platform/v1/printers', {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, location: location || undefined,
                    ippEndpoint, ippUsername: ippUsername || undefined, ippPassword: ippPassword || undefined,
                    color, duplex,
                }),
            });
            if (!res.ok) {
                const t = await res.text();
                throw new Error(t || `HTTP ${res.status}`);
            }
            toast.success('Drucker hinzugefügt');
            onDone();
        } catch (e) {
            toast.error('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3 rounded border p-4">
            <div className="grid gap-3 md:grid-cols-2">
                <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('settings.printers.name')}</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                        placeholder={t('settings.printers.sekretariat')}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('settings.printers.standort')}</label>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                        placeholder={t('settings.printers.verwaltungsgebaeude_raum_12')}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
            </div>
            <div>
                <label className="text-xs font-medium text-muted-foreground">{t('settings.printers.ipp-endpunkt')}</label>
                <input type="text" value={ippEndpoint} onChange={e => setIppEndpoint(e.target.value)}
                    placeholder={t('settings.printers.ippdruckerschulede631printerssekretariat')}
                    className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary font-mono" />
                <p className="mt-1 text-[10px] text-muted-foreground">
                    {t('settings.printers.format')} <code>{t('settings.printers.ipphost631printersqueue')}</code> oder <code>{t('settings.printers.ipps')}</code>{t('settings.printers.drucker_muss_vom_prilog-server_aus_errei')}
                </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('settings.printers.benutzername_optional')}</label>
                    <input type="text" value={ippUsername} onChange={e => setIppUsername(e.target.value)}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('settings.printers.passwort_optional')}</label>
                    <input type="password" value={ippPassword} onChange={e => setIppPassword(e.target.value)}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
            </div>
            <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={color} onChange={e => setColor(e.target.checked)} />
                    {t('settings.printers.farbe_verfuegbar')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={duplex} onChange={e => setDuplex(e.target.checked)} />
                    {t('settings.printers.duplex_beidseitig')}
                </label>
            </div>
            <div className="flex gap-2">
                <button onClick={submit} disabled={saving || !name || !ippEndpoint}
                    className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? 'Speichere...' : t('common.save')}
                </button>
                <button onClick={onCancel} className="rounded border px-3 py-1.5 text-xs hover:bg-muted">
                    {t('settings.printers.abbrechen')}
                </button>
            </div>
        </div>
    );
}
