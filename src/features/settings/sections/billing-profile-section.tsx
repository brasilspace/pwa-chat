/**
 * BillingProfileSection — Rechnungsadresse pro Tenant.
 * Pflichtfelder fuer Stripe-Rechnungen, separate Single-Source-of-Truth.
 */

import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface BillingProfile {
    legalName: string;
    contactPerson: string | null;
    email: string;
    phone: string | null;
    street: string;
    postalCode: string;
    city: string;
    country: string;
    vatId: string | null;
    isComplete?: boolean;
}

const COUNTRIES: { code: string; name: string }[] = [
    { code: 'DE', name: 'Deutschland' },
    { code: 'AT', name: 'Österreich' },
    { code: 'CH', name: 'Schweiz' },
    { code: 'LU', name: 'Luxemburg' },
    { code: 'NL', name: 'Niederlande' },
    { code: 'FR', name: 'Frankreich' },
    { code: 'IT', name: 'Italien' },
    { code: 'BE', name: 'Belgien' },
    { code: 'DK', name: 'Dänemark' },
    { code: 'PL', name: 'Polen' },
    { code: 'CZ', name: 'Tschechien' },
];

export function BillingProfileSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [data, setData] = useState<BillingProfile>({
        legalName: '', contactPerson: '', email: '', phone: '',
        street: '', postalCode: '', city: '', country: 'DE', vatId: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await fetch('/api/platform/v1/settings/billing-profile', {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const d = await res.json();
            setData({
                legalName: d.legalName ?? '',
                contactPerson: d.contactPerson ?? '',
                email: d.email ?? '',
                phone: d.phone ?? '',
                street: d.street ?? '',
                postalCode: d.postalCode ?? '',
                city: d.city ?? '',
                country: d.country ?? 'DE',
                vatId: d.vatId ?? '',
            });
            setIsComplete(d.isComplete ?? false);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const set = <K extends keyof BillingProfile>(k: K, v: BillingProfile[K]) =>
        setData(prev => ({ ...prev, [k]: v }));

    const save = useCallback(async () => {
        if (!jwt) return;
        setSaving(true);
        try {
            const res = await fetch('/api/platform/v1/settings/billing-profile', {
                method: 'PUT',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    contactPerson: data.contactPerson || null,
                    phone: data.phone || null,
                    vatId: data.vatId || null,
                }),
            });
            if (!res.ok) {
                const t = await res.text();
                throw new Error(t || `HTTP ${res.status}`);
            }
            const j = await res.json();
            const wasIncomplete = !isComplete;
            setIsComplete(j.profile?.isComplete ?? false);
            toast.success('Rechnungsadresse gespeichert');
            // Wenn der Tenant durch die 3-Tage-Karenz lief und jetzt vollstaendig
            // ist: Bootstrap muss neu geladen werden, damit der billingRequired-
            // Redirect aufhoert. Einfachster Weg: Seite reloaden.
            if (wasIncomplete && j.profile?.isComplete) {
                setTimeout(() => window.location.reload(), 800);
            }
        } catch (e) {
            toast.error('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    }, [jwt, data]);

    if (loading) {
        return <div className="flex h-32 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MaterialIcon name="receipt_long" size={16} className="size-5" /> {t('settings.billing_profile.rechnungsadresse')}
                </h2>
            </div>

            {!isComplete && (
                <div className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    <MaterialIcon name="warning" size={14} className="mr-1.5 inline-block size-3.5 align-text-bottom" />
                    {t('settings.billing_profile.pflichtfelder_noch_nicht_vollstaendig_au')}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                <Field label={t('settings.billing_profile.rechtlicher_name')} hint="z.B. Schule Musterhausen gGmbH">
                    <input type="text" value={data.legalName} onChange={e => set('legalName', e.target.value)}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </Field>
                <Field label={t('settings.billing_profile.ansprechpartner')} hint="optional, z.B. Schulleitung">
                    <input type="text" value={data.contactPerson ?? ''} onChange={e => set('contactPerson', e.target.value)}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Field label={t('settings.billing_profile.e-mail_rechnungsempfaenger')}>
                    <input type="email" value={data.email} onChange={e => set('email', e.target.value)}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </Field>
                <Field label={t('settings.billing_profile.telefon')} hint="optional">
                    <input type="tel" value={data.phone ?? ''} onChange={e => set('phone', e.target.value)}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </Field>
            </div>

            <Field label={t('settings.billing_profile.strasse_hausnummer')}>
                <input type="text" value={data.street} onChange={e => set('street', e.target.value)}
                    className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>

            <div className="grid gap-4 md:grid-cols-3">
                <Field label={t('settings.billing_profile.plz')}>
                    <input type="text" value={data.postalCode} onChange={e => set('postalCode', e.target.value)}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </Field>
                <Field label={t('settings.billing_profile.ort')}>
                    <input type="text" value={data.city} onChange={e => set('city', e.target.value)}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </Field>
                <Field label={t('settings.billing_profile.land')}>
                    <select value={data.country} onChange={e => set('country', e.target.value)}
                        className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                        {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                </Field>
            </div>

            <Field label={t('settings.billing_profile.ust-idnr_optional')}>
                <input type="text" value={data.vatId ?? ''} onChange={e => set('vatId', e.target.value)}
                    className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary" />
            </Field>

            <div className="flex items-center gap-3">
                <button onClick={save} disabled={saving}
                    className={cn('rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
                        saving && 'cursor-wait')}>
                    {saving ? <Loader2 className="size-4 animate-spin" /> : t('common.save')}
                </button>
                <p className="text-[11px] text-muted-foreground">
                    {t('settings.billing_profile.felder_mit_sind_pflicht')}
                </p>
            </div>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): JSX.Element {
    return (
        <div>
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            {children}
            {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
        </div>
    );
}
