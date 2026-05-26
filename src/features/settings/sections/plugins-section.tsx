/**
 * PluginsSection — Marketplace-Catalog als Settings-Page.
 *
 * Listet alle published Items (Flows + spaeter Apps) und erlaubt Installation
 * mit einem Klick. Ersetzt das frueher verwendete FlowStoreModal.
 */

import { useEffect, useState, useSyncExternalStore, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Loader2, Check, X, Trash2 } from 'lucide-react';
import { sessionStore } from '@/core/session/session-store';
import { marketplaceGateway, type MarketplaceItem } from '@/features/flows/marketplace-gateway';
import { useT } from "@/lib/i18n/use-t";

export function PluginsSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();

    const [items, setItems] = useState<MarketplaceItem[] | null>(null);
    const [installing, setInstalling] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'flow' | 'app'>('all');
    /** Wenn gesetzt: Confirm-Dialog vor Install (paid items). */
    const [confirmItem, setConfirmItem] = useState<MarketplaceItem | null>(null);

    const reload = async () => {
        if (!jwt) return;
        const r = await marketplaceGateway.listItems(jwt);
        setItems(r.items);
    };

    useEffect(() => {
        if (!jwt) return;
        marketplaceGateway.listItems(jwt)
            .then(r => setItems(r.items))
            .catch(err => setError(err instanceof Error ? err.message : String(err)));
    }, [jwt]);

    const startInstall = (item: MarketplaceItem) => {
        if (item.priceModel && item.priceCents) {
            setConfirmItem(item);
        } else {
            void doInstall(item);
        }
    };

    const doInstall = async (item: MarketplaceItem) => {
        if (!jwt) return;
        setInstalling(item.id);
        setConfirmItem(null);
        setError(null);
        try {
            const r = await marketplaceGateway.install(jwt, item.id);
            await reload();
            if (item.itemType === 'flow' && r.templateId) {
                navigate(`/flows/${r.templateId}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Installation fehlgeschlagen');
        } finally {
            setInstalling(null);
        }
    };

    const handleUninstall = async (item: MarketplaceItem) => {
        if (!jwt || !item.subscriptionId) return;
        const paid = item.priceModel && item.priceCents;
        const msg = paid
            ? `${item.name} deinstallieren? Das Stripe-Abo wird sofort gekuendigt — Du zahlst ab naechstem Monat nichts mehr. Bereits angelegte Templates bleiben erhalten.`
            : `${item.name} deinstallieren? Bereits angelegte Templates bleiben erhalten.`;
        if (!confirm(msg)) return;
        setInstalling(item.id);
        setError(null);
        try {
            await marketplaceGateway.uninstall(jwt, item.subscriptionId);
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Deinstallation fehlgeschlagen');
        } finally {
            setInstalling(null);
        }
    };

    const filtered = items?.filter(it => filter === 'all' || it.itemType === filter) ?? null;
    const grouped = filtered ? groupByCategory(filtered) : null;

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center gap-2">
                    <ShoppingBag size={20} className="text-blue-600" />
                    <h2 className="text-xl font-semibold">{t('settings.plugins.plugin-store')}</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.plugins.vorgefertigte_flows_anleitungen_und_apps')}
                </p>
            </div>

            {/* Filter-Tabs */}
            <div className="flex gap-1 border-b border-gray-200">
                {([
                    { key: 'all', label: t('common.all') },
                    { key: 'flow', label: 'Flows & Anleitungen' },
                    { key: 'app', label: 'Apps' },
                ] as const).map(t => (
                    <button
                        key={t.key}
                        onClick={() => setFilter(t.key)}
                        className={`px-3 py-2 text-sm border-b-2 -mb-px ${filter === t.key ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {items === null && !error && (
                <div className="flex items-center gap-2 text-sm text-gray-500 p-12 justify-center">
                    <Loader2 size={16} className="animate-spin" /> {t('settings.plugins.lade_catalog')}
                </div>
            )}

            {filtered && filtered.length === 0 && (
                <div className="p-12 text-center text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg">
                    {t('settings.plugins.keine_items_in_dieser_kategorie')}
                </div>
            )}

            {grouped && Object.entries(grouped).map(([cat, catItems]) => (
                <div key={cat}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                        {CATEGORY_LABELS[cat] ?? cat}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {catItems.map(item => (
                            <PluginCard
                                key={item.id}
                                item={item}
                                onInstall={() => startInstall(item)}
                                onUninstall={() => handleUninstall(item)}
                                busy={installing === item.id}
                                anyBusy={installing !== null}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {confirmItem && (
                <ConfirmInstallDialog
                    item={confirmItem}
                    onConfirm={() => doInstall(confirmItem)}
                    onCancel={() => setConfirmItem(null)}
                />
            )}
        </div>
    );
}

function ConfirmInstallDialog({ item, onConfirm, onCancel }: { item: MarketplaceItem; onConfirm: () => void; onCancel: () => void }) {
    const t = useT();
    const eur = item.priceCents ? (item.priceCents / 100).toFixed(2).replace('.', ',') : '0,00';
    const suffix = item.priceModel === 'flat-monthly' ? 'pro Monat' : 'pro Aktiv-User pro Monat';

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-2xl">
                <div className="border-b border-gray-200 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{item.iconEmoji ?? '📦'}</span>
                        <h3 className="font-semibold">{t('settings.plugins.kostenpflichtig_installieren')}</h3>
                    </div>
                    <button onClick={onCancel} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
                </div>
                <div className="p-4 space-y-3 text-sm">
                    <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-gray-500">von {item.vendorName}</div>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-amber-700">{eur} €</span>
                            <span className="text-xs text-amber-700">{suffix}</span>
                        </div>
                        <p className="text-[11px] text-amber-700 mt-1">
                            {t('settings.plugins.wird_zur_monatlichen_rechnung_addiert_du')}
                        </p>
                    </div>
                    {item.description && (
                        <p className="text-xs text-gray-600">{item.description}</p>
                    )}
                </div>
                <div className="border-t border-gray-200 p-4 flex justify-end gap-2">
                    <button onClick={onCancel} className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded text-sm">{t('settings.plugins.abbrechen')}</button>
                    <button onClick={onConfirm} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">
                        {t('settings.plugins.kostenpflichtig_installieren')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PluginCard({ item, onInstall, onUninstall, busy, anyBusy }: {
    item: MarketplaceItem;
    onInstall: () => void;
    onUninstall: () => void;
    busy: boolean;
    anyBusy: boolean;
}) {
    const t = useT();
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-2 transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between">
                <div className="text-3xl">{item.iconEmoji ?? '📦'}</div>
                <PriceBadge model={item.priceModel} cents={item.priceCents} />
            </div>
            <h3 className="font-semibold text-sm">{item.name}</h3>
            <p className="text-xs text-gray-500 line-clamp-3 flex-1">{item.description}</p>
            <div className="text-[10px] text-gray-400">
                {item.vendorName} {t('settings.plugins.v')}{item.version} · {item.itemType === 'flow' ? 'Flow' : 'App'}
            </div>
            {item.installed ? (
                <div className="flex gap-1">
                    <div className="flex-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 flex items-center justify-center gap-1">
                        <Check size={12} /> {t('settings.plugins.installiert')}
                    </div>
                    <button
                        onClick={onUninstall}
                        disabled={anyBusy}
                        title={t('settings.plugins.deinstallieren')}
                        className="rounded-md border border-gray-200 hover:border-red-300 hover:bg-red-50 px-2 py-1.5 text-gray-500 hover:text-red-600 disabled:opacity-50"
                    >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                </div>
            ) : (
                <button
                    onClick={onInstall}
                    disabled={anyBusy}
                    className="w-full rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 flex items-center justify-center gap-1"
                >
                    {busy ? <><Loader2 size={12} className="animate-spin" /> {t('settings.plugins.installiert')}</> : 'Installieren'}
                </button>
            )}
        </div>
    );
}

function PriceBadge({ model, cents }: { model: string | null; cents: number | null }) {
    const t = useT();
    if (!model || !cents) return <span className="text-[10px] font-medium text-emerald-700 px-2 py-0.5 bg-emerald-50 rounded-full">{t('settings.plugins.kostenlos')}</span>;
    const eur = (cents / 100).toFixed(2).replace('.', ',');
    const suffix = model === 'flat-monthly' ? '/Monat' : model === 'per-active-user' ? '/User/Mt' : '';
    return <span className="text-[10px] font-medium text-amber-700 px-2 py-0.5 bg-amber-50 rounded-full">{eur} €{suffix}</span>;
}

function groupByCategory(items: MarketplaceItem[]): Record<string, MarketplaceItem[]> {
    const out: Record<string, MarketplaceItem[]> = {};
    for (const it of items) {
        const cat = it.category ?? 'other';
        (out[cat] = out[cat] ?? []).push(it);
    }
    return out;
}

const CATEGORY_LABELS: Record<string, string> = {
    crisis: 'Krise & Notfall',
    organization: 'Organisation',
    education: 'Paedagogik',
    communication: 'Kommunikation',
    management: 'Management',
    tools: 'Werkzeuge',
    operations: 'Betrieb',
    other: 'Sonstiges',
};
