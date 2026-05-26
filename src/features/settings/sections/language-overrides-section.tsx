/**
 * LanguageOverridesSection — Tenant-Admins koennen einzelne Begriffe
 * fuer ihre Schule ueberschreiben.
 *
 * Beispiel: Schule moechte "Schüler" durch "Studierende" ersetzen.
 * Die Aenderung wirkt nur fuer Mitglieder dieses Tenants und überschreibt
 * sowohl den Build-Default als auch globale Overrides (admin.prilog.chat).
 *
 * UI: Liste aller bekannten Keys + Default-Wert + aktuelles Tenant-
 * Override-Feld. Inline-Edit, Save, ICU-Validierung server-seitig.
 *
 * Sichtbar nur fuer Admins (siehe settings-registry: requiresAdmin).
 */

import { type JSX, useEffect, useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import { Languages, Save, X, Search, AlertCircle, Check } from 'lucide-react';
import { sessionStore } from '@/core/session/session-store';
import { useT, useLocale } from '@/lib/i18n/use-t';
import { SUPPORTED_LOCALES } from '@/lib/i18n';
import { isInContextEditEnabled, setInContextEdit } from '@/lib/i18n/in-context-edit';
import { cn } from '@/lib/utils';

interface TranslationRow {
    key: string;
    namespace: string;
    defaultValue: string;
    description: string | null;
    translation: {
        id: string;
        value: string;
        valueContext: string | null;
        source: string;
        reviewed: boolean;
        version: number;
    } | null;
}

const API_BASE = (import.meta as { env: { VITE_PLATFORM_API_URL?: string } }).env.VITE_PLATFORM_API_URL ?? 'https://api.prilog.chat';

export function LanguageOverridesSection(): JSX.Element {
    const t = useT();
    const initialLocale = useLocale().split('-')[0];
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    // tenantId muss nicht in der URL stehen — das Backend nimmt ihn
    // automatisch aus dem JWT, weil Tenant-Admins nur ihren eigenen
    // Tenant pflegen duerfen (Sicherheits-Check im Router).
    const hasSession = Boolean(jwt);

    const [locale, setLocale] = useState(initialLocale === 'de' ? 'en' : initialLocale);
    const [rows, setRows] = useState<TranslationRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [draftValue, setDraftValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

    const reload = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setError(null);
        try {
            const url = `${API_BASE}/api/platform/v1/i18n/translations?locale=${encodeURIComponent(locale)}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            setRows(body.rows ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Fehler beim Laden');
        } finally {
            setLoading(false);
        }
    }, [jwt, locale]);

    useEffect(() => { void reload(); }, [reload]);

    const filtered = useMemo(() => {
        const lower = search.toLowerCase();
        if (!lower) return rows;
        return rows.filter(r =>
            r.key.toLowerCase().includes(lower)
            || r.defaultValue.toLowerCase().includes(lower)
            || (r.translation?.value ?? '').toLowerCase().includes(lower));
    }, [rows, search]);

    const startEdit = (row: TranslationRow) => {
        setEditingKey(row.key);
        setDraftValue(row.translation?.value ?? row.defaultValue);
    };

    const cancelEdit = () => {
        setEditingKey(null);
        setDraftValue('');
    };

    const handleSave = async (row: TranslationRow) => {
        if (!jwt) return;
        // tenantId aus dem JWT — wir senden ein Sentinel mit, das das
        // Backend mit jwt.tenantId ersetzt. Strikt ein Tenant-Save.
        const tenantId = '__self__';
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/api/platform/v1/i18n/translations`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tenantId,
                    locale,
                    namespace: row.namespace,
                    key: row.key,
                    value: draftValue,
                    expectedVersion: row.translation?.version,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message ?? `HTTP ${res.status}`);
            }
            setToast({ kind: 'success', text: t('settings.languageOverrides.saved') });
            setTimeout(() => setToast(null), 2500);
            cancelEdit();
            void reload();
        } catch (e) {
            setToast({ kind: 'error', text: e instanceof Error ? e.message : t('common.error') });
            setTimeout(() => setToast(null), 4000);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async (row: TranslationRow) => {
        if (!row.translation || !jwt) return;
        if (!confirm(`Eigene Übersetzung für '${row.key}' zurücksetzen?`)) return;
        try {
            const res = await fetch(`${API_BASE}/api/platform/v1/i18n/translations/${encodeURIComponent(row.translation.id)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setToast({ kind: 'success', text: t('settings.languageOverrides.reset') });
            setTimeout(() => setToast(null), 2500);
            void reload();
        } catch (e) {
            setToast({ kind: 'error', text: e instanceof Error ? e.message : t('common.error') });
            setTimeout(() => setToast(null), 4000);
        }
    };

    if (!hasSession) {
        return <div className="text-sm text-muted-foreground">{t('settings.languageOverrides.noTenant')}</div>;
    }

    return (
        <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Languages className="size-5" /> {t('settings.languageOverrides.title')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.languageOverrides.description')}
            </p>

            {(() => {
                const on = isInContextEditEnabled();
                return (
                    <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border bg-background p-3">
                        <div>
                            <div className="text-sm font-medium">Übersetzungs-Modus (In-Context-Edit)</div>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                Blendet ein Stift-Overlay über übersetzbaren Texten ein, um Begriffe
                                direkt zu bearbeiten. Standardmäßig <strong>aus</strong> — nur einschalten,
                                wenn aktiv übersetzt wird. Bleibt sonst pro Browser aktiv und stört die Bedienung.
                            </p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            onClick={() => setInContextEdit(!on)}
                            className={cn(
                                'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
                                on ? 'bg-primary' : 'bg-muted-foreground/30',
                            )}
                            title={on ? 'Übersetzungs-Modus ausschalten' : 'Übersetzungs-Modus einschalten'}
                        >
                            <span className={cn(
                                'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                                on ? 'left-[22px]' : 'left-0.5',
                            )} />
                        </button>
                    </div>
                );
            })()}

            <div className="mt-4 flex items-center gap-2">
                <label className="text-xs text-muted-foreground">{t('settings.languageOverrides.locale')}</label>
                {SUPPORTED_LOCALES.filter(l => l !== 'de').map(loc => (
                    <button
                        key={loc}
                        onClick={() => setLocale(loc)}
                        className={cn(
                            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                            locale === loc
                                ? 'bg-primary text-primary-foreground'
                                : 'border bg-background text-muted-foreground hover:bg-muted/50',
                        )}
                    >
                        {t(`settings.language.${loc}`)}
                    </button>
                ))}
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-md border bg-background px-3 py-1.5">
                <Search className="size-3.5 text-muted-foreground" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('actions.search') + ' …'}
                    className="flex-1 bg-transparent text-sm outline-none"
                />
            </div>

            {error && (
                <div className="mt-3 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="mt-3 rounded-lg border bg-background">
                {loading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
                ) : filtered.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">{t('common.noResults')}</div>
                ) : (
                    <ul className="divide-y">
                        {filtered.map(row => (
                            <li key={row.key} className="p-3">
                                <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                                    <div className="min-w-0">
                                        <div className="font-mono text-[10px] text-muted-foreground">{row.key}</div>
                                        <div className="mt-0.5 text-sm">
                                            <span className="text-muted-foreground">{t('settings.languageOverrides.default')}:</span>{' '}
                                            {row.defaultValue}
                                        </div>
                                        {editingKey === row.key ? (
                                            <div className="mt-2">
                                                <textarea
                                                    value={draftValue}
                                                    onChange={(e) => setDraftValue(e.target.value)}
                                                    rows={3}
                                                    className="w-full rounded border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                                                />
                                                <div className="mt-2 flex gap-2">
                                                    <button
                                                        onClick={() => handleSave(row)}
                                                        disabled={saving || !draftValue.trim()}
                                                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                                    >
                                                        <Save className="size-3" />
                                                        {saving ? '…' : t('actions.save')}
                                                    </button>
                                                    <button
                                                        onClick={cancelEdit}
                                                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted/50"
                                                    >
                                                        <X className="size-3" />
                                                        {t('actions.cancel')}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-1 flex items-center gap-2 text-sm">
                                                <span className={cn(
                                                    row.translation ? 'font-medium' : 'italic text-muted-foreground',
                                                )}>
                                                    {row.translation?.value ?? t('settings.languageOverrides.noOverride')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {editingKey !== row.key && (
                                        <div className="flex flex-col gap-1">
                                            <button
                                                onClick={() => startEdit(row)}
                                                className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted/50"
                                            >
                                                {row.translation ? t('actions.edit') : t('actions.next')}
                                            </button>
                                            {row.translation && (
                                                <button
                                                    onClick={() => handleReset(row)}
                                                    className="rounded-md border border-destructive/30 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                                                >
                                                    {t('settings.languageOverrides.reset')}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {toast && (
                <div className={cn(
                    'fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2 text-sm shadow-lg',
                    toast.kind === 'success' ? 'bg-emerald-600 text-white' : 'bg-destructive text-destructive-foreground',
                )}>
                    {toast.kind === 'success' ? <Check className="size-4" /> : <AlertCircle className="size-4" />}
                    {toast.text}
                </div>
            )}
        </div>
    );
}
