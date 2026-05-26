/**
 * CouplingsPanel (P4) — Bänder & Kopplungen verwalten.
 *
 * Slide-Over rechts (no-modal-Regel). Liste pro kind (coupling / band /
 * parallel_group). Inline-Form zum Anlegen, Toggle active/inactive.
 *
 * Spec: P0-v2.1 §10.1 P4 + §11 G5.
 */
import { type JSX, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import {
    createStundenplanGateway,
    type Coupling,
} from '@/gateways/platform/stundenplan-gateway';

const gateway = createStundenplanGateway();
const KINDS = ['coupling', 'band', 'parallel_group'] as const;
type Kind = (typeof KINDS)[number];

export function CouplingsPanel({
    open,
    jwt,
    onClose,
}: {
    open: boolean;
    jwt: string;
    onClose: () => void;
}): JSX.Element {
    const t = useT();
    const [activeKind, setActiveKind] = useState<Kind>('coupling');
    const [items, setItems] = useState<Coupling[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [formKey, setFormKey] = useState('');
    const [formLabel, setFormLabel] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !jwt) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const r = await gateway.listCouplings(jwt);
                if (!cancelled) setItems(r.couplings);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, jwt]);

    const filtered = items.filter((c) => c.kind === activeKind);

    async function handleCreate() {
        if (!formKey.trim() || !formLabel.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const r = await gateway.createCoupling(jwt, {
                key: formKey.trim(),
                kind: activeKind,
                label: formLabel.trim(),
                description: formDescription.trim() || undefined,
            });
            setItems((prev) => [...prev, r.coupling]);
            setShowForm(false);
            setFormKey('');
            setFormLabel('');
            setFormDescription('');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(c: Coupling) {
        try {
            const r = await gateway.patchCoupling(jwt, c.id, { active: !c.active });
            setItems((prev) => prev.map((x) => (x.id === c.id ? r.coupling : x)));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[500px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="link" size={18} className="text-muted-foreground" />
                <span className="text-sm font-semibold">{t('stundenplan.couplings_panel_title')}</span>
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('common.close', { defaultValue: 'Schliessen' })}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            {/* Kind-Tabs */}
            <div className="flex shrink-0 border-b px-3 py-2 gap-1">
                {KINDS.map((k) => (
                    <button
                        key={k}
                        onClick={() => {
                            setActiveKind(k);
                            setShowForm(false);
                        }}
                        className={cn(
                            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                            activeKind === k
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-muted',
                        )}
                    >
                        {t(`stundenplan.coupling_kind_${k}`)}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        {error}
                    </div>
                )}

                {/* Inline-Hinweis pro kind */}
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                    {t(`stundenplan.coupling_kind_${activeKind}_hint`)}
                </div>

                {/* Liste */}
                {loading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-12 rounded-md bg-muted/40 animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        {t('stundenplan.couplings_empty')}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {filtered.map((c) => (
                            <div
                                key={c.id}
                                className={cn(
                                    'flex items-center gap-2 rounded-md border border-border px-3 py-2',
                                    !c.active && 'opacity-50',
                                )}
                            >
                                <span className="inline-flex h-6 min-w-[60px] items-center justify-center rounded bg-muted px-2 text-[11px] font-mono font-medium text-muted-foreground">
                                    {c.key}
                                </span>
                                <div className="flex-1">
                                    <div className="text-sm">{c.label}</div>
                                    {c.description && (
                                        <div className="text-[11px] text-muted-foreground">{c.description}</div>
                                    )}
                                </div>
                                <button
                                    onClick={() => toggleActive(c)}
                                    className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
                                    title={t('stundenplan.coupling_toggle_active')}
                                >
                                    {c.active ? t('stundenplan.coupling_active') : t('stundenplan.coupling_inactive')}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Neu-Anlegen-Form */}
                {!showForm ? (
                    <button
                        onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                        <MaterialIcon name="add" size={14} />
                        {t('stundenplan.coupling_new')}
                    </button>
                ) : (
                    <div className="rounded-md border border-border p-3 space-y-2">
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.coupling_field_key')}</span>
                            <input
                                value={formKey}
                                onChange={(e) => setFormKey(e.target.value)}
                                placeholder="z.B. Band-7 oder Bio-Chem"
                                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono"
                            />
                        </label>
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.coupling_field_label')}</span>
                            <input
                                value={formLabel}
                                onChange={(e) => setFormLabel(e.target.value)}
                                placeholder={t('stundenplan.coupling_field_label_placeholder')}
                                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                            />
                        </label>
                        <label className="block text-xs">
                            <span className="text-muted-foreground">{t('stundenplan.coupling_field_description')}</span>
                            <textarea
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                rows={2}
                                className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                            />
                        </label>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                onClick={() => setShowForm(false)}
                                className="rounded-md px-3 py-1 text-xs hover:bg-muted"
                            >
                                {t('common.cancel', { defaultValue: 'Abbrechen' })}
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={saving || !formKey.trim() || !formLabel.trim()}
                                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {saving ? '…' : t('common.save', { defaultValue: 'Speichern' })}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
