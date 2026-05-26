import { type JSX, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Clock, Ban, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface Invoice {
    id: string;
    invoiceNumber: string;
    issuedAt: string;
    dueAt: string;
    periodStart: string;
    periodEnd: string;
    totalGross: number;
    vatAmount: number;
    status: string;
    paidAt: string | null;
    reminderLevel: number;
    suspendedAt: string | null;
}

const INVOICE_STATUS_META: Record<string, { labelKey: string; icon: typeof Clock; className: string }> = {
    paid: { labelKey: 'app.misc.bezahlt', icon: CheckCircle2, className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
    pending: { labelKey: 'common.open', icon: Clock, className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
    overdue: { labelKey: 'app.misc.im_verzug', icon: AlertTriangle, className: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
    reminded_1: { labelKey: 'app.misc.mahnung_1', icon: AlertTriangle, className: 'bg-orange-500/10 text-orange-700 border-orange-500/40' },
    reminded_2: { labelKey: 'app.misc.mahnung_2', icon: AlertTriangle, className: 'bg-red-500/10 text-red-600 border-red-500/30' },
    suspended: { labelKey: 'app.misc.dienst_pausiert', icon: Ban, className: 'bg-red-500/20 text-red-700 border-red-500/50' },
    cancelled: { labelKey: 'app.misc.storniert', icon: Ban, className: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/30' },
};

export function BillingSection(): JSX.Element {
    return (
        <div className="space-y-10">
            <FreemiumBlock />

            <hr className="border-border" />

            <InvoicesBlock />
        </div>
    );
}

// ─── Rechnungen-Liste ───────────────────────────────────────────────────────

function InvoicesBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [invoices, setInvoices] = useState<Invoice[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        fetch('/api/platform/v1/workspace/invoices', {
            headers: { Authorization: `Bearer ${jwt}` },
        })
            .then(async r => {
                if (!r.ok) {
                    const data = await r.json().catch(() => null);
                    throw new Error(data?.error ?? `HTTP ${r.status}`);
                }
                return r.json();
            })
            .then(d => { if (d?.invoices) setInvoices(d.invoices); setError(null); })
            .catch(e => {
                console.error('[billing] invoices fetch failed:', e);
                setError(e instanceof Error ? e.message : t('common.error'));
            })
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
                <MaterialIcon name="description" size={16} className="size-4" /> {t('settings.billing.rechnungen')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('settings.billing.uebersicht_aller_bisherigen_rechnungen')}</p>

            {loading && (
                <div className="mt-4 text-sm text-muted-foreground">
                    <Loader2 className="inline size-4 animate-spin" /> {t('settings.billing.lade_rechnungen')}
                </div>
            )}

            {error && (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {t('settings.billing.rechnungen_konnten_nicht_geladen_werden')} {error}
                </div>
            )}

            {!loading && !error && (!invoices || invoices.length === 0) && (
                <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    {t('settings.billing.noch_keine_rechnungen_die_erste_rechnung')}
                </div>
            )}

            {!loading && !error && invoices && invoices.length > 0 && (
                <ul className="mt-4 space-y-2">
                    {invoices.map(inv => <InvoiceRow key={inv.id} invoice={inv} />)}
                </ul>
            )}
        </div>
    );
}

function InvoiceRow({ invoice }: { invoice: Invoice }): JSX.Element {
    const t = useT();
    const meta = INVOICE_STATUS_META[invoice.status] ?? INVOICE_STATUS_META.pending;
    const Icon = meta.icon;
    const issued = new Date(invoice.issuedAt).toLocaleDateString('de-DE');
    const periodStart = new Date(invoice.periodStart).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const periodEnd = new Date(invoice.periodEnd).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

    return (
        <li className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold">{invoice.invoiceNumber}</span>
                        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', meta.className)}>
                            <Icon className="size-3" /> {t(meta.labelKey)}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t('settings.billing.zeitraum')} {periodStart} – {periodEnd} {t('settings.billing.ausgestellt')} {issued}
                    </p>
                    {invoice.status === 'paid' && invoice.paidAt && (
                        <p className="mt-1 text-xs text-emerald-600">{t('settings.billing.bezahlt_am')} {new Date(invoice.paidAt).toLocaleDateString('de-DE')}</p>
                    )}
                </div>
                <div className="text-right shrink-0">
                    <p className="text-base font-semibold tabular-nums">{invoice.totalGross.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
                    <p className="text-[10px] text-muted-foreground">{t('settings.billing.inkl')} {invoice.vatAmount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} {t('settings.billing.mwst')}</p>
                </div>
            </div>
        </li>
    );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }): JSX.Element {
    return (
        <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={valueClass ?? 'font-medium'}>{value}</span>
        </div>
    );
}

// ─── Freemium-Block (90 Tage Hide + Pro-Abo + Konto-Schliessung) ──────────

function FreemiumBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const token = session.platform?.token;
    const [status, setStatus] = useState<{
        status: string; trialDaysLeft: number | null; hasHiddenData: boolean;
        scheduledDeletionAt: string | null; creditCents: number; trialAlreadyExtended: boolean;
    } | null>(null);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(() => {
        if (!token) return;
        fetch('/api/platform/v1/subscription/status', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(setStatus)
            .catch(() => { });
    }, [token]);

    useEffect(() => { reload(); }, [reload]);

    const checkout = useCallback(async () => {
        if (!token) return;
        setBusy(true);
        try {
            const res = await fetch('/api/platform/v1/subscription/checkout', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } finally { setBusy(false); }
    }, [token]);

    const extendTrial = useCallback(async () => {
        if (!token) return;
        if (!confirm('Trial einmalig um 30 Tage verlaengern?')) return;
        setBusy(true);
        try {
            await fetch('/api/platform/v1/subscription/extend-trial', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            reload();
        } finally { setBusy(false); }
    }, [token, reload]);

    const closeAccount = useCallback(async () => {
        if (!token) return;
        if (!confirm('Konto wirklich schliessen?\n\nAlle Daten werden in 30 Tagen unwiderruflich geloescht. Du kannst die Loeschung jederzeit abbrechen.')) return;
        setBusy(true);
        try {
            await fetch('/api/platform/v1/subscription/close-account', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            reload();
        } finally { setBusy(false); }
    }, [token, reload]);

    if (!status) return <div />;

    return (
        <div>
            <h3 className="text-base font-semibold">{t('settings.billing.pro-abo')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.billing.3_eur_pro_aktivem_user_pro_monat_inaktiv')}
            </p>

            <div className="mt-4 rounded-lg border border-border p-4">
                {status.status === 'active' ? (
                    <p className="text-sm text-emerald-600">
                        <MaterialIcon name="check_circle" size={16} className="mr-1 inline size-4" />
                        {t('settings.billing.abo_aktiv_alle_inhalte_sichtbar')}
                    </p>
                ) : status.scheduledDeletionAt ? (
                    <p className="text-sm text-red-600">
                        {t('settings.billing.konto_wird_am')} {new Date(status.scheduledDeletionAt).toLocaleDateString('de-DE')} {t('settings.billing.geloescht')}
                    </p>
                ) : (
                    <>
                        <p className="text-sm">
                            <strong>{status.status === 'trial' ? 'Testphase' : t('common.inactive')}</strong>
                            {status.trialDaysLeft !== null && status.trialDaysLeft > 0 && (
                                <> {t('settings.billing.noch')} <strong>{status.trialDaysLeft}</strong> {t('settings.billing.tag')}{status.trialDaysLeft === 1 ? '' : 'e'}</>
                            )}
                        </p>
                        {status.hasHiddenData && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t('settings.billing.inhalte_aelter_90_tage_sind_aktuell_ausg')}
                            </p>
                        )}
                    </>
                )}
                {status.creditCents > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                        {t('settings.billing.verfuegbares_guthaben')} {(status.creditCents / 100).toFixed(2)} EUR
                    </p>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {status.status !== 'active' && !status.scheduledDeletionAt && (
                    <button
                        onClick={checkout}
                        disabled={busy}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {t('settings.billing.jetzt_3_euruser_abonnieren')}
                    </button>
                )}
                {status.status === 'trial' && !status.trialAlreadyExtended && !status.scheduledDeletionAt && (
                    <button
                        onClick={extendTrial}
                        disabled={busy}
                        className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    >
                        {t('settings.billing.testphase_30_tage')}
                    </button>
                )}
                {status.status !== 'active' && !status.scheduledDeletionAt && (
                    <button
                        onClick={closeAccount}
                        disabled={busy}
                        className="rounded-md border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                        {t('settings.billing.konto_schliessen')}
                    </button>
                )}
            </div>
        </div>
    );
}
