/**
 * CalendarLayerSettingsPanel — Slide-Over-Settings pro Kalender-Ebene.
 *
 * Bewusst KEIN Modal (Memory-Regel `no_modal_dialogs`): schiebt von rechts
 * rein, volle Hoehe, festes 520px (auf Mobile Vollbreite). Drei Sections,
 * erweiterbar fuer kuenftige Optionen (Benachrichtigungen, Berechtigungen,
 * Default-Sichtbarkeit, etc.).
 *
 * Sections:
 *  - Allgemein  : Name (inline edit), Farbe (Preset-Palette).
 *  - Abo / Sync : isPublic-Toggle + webcal/https-URL kopierbar.
 *  - Mehr       : Platzhalter — Hinweistext, kommt nach.
 */
import { type JSX, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { env } from '@/core/config/env';
import { sessionStore } from '@/core/session/session-store';
import { createCalendarGateway } from '@/gateways/platform/calendar-gateway';
import type { CalendarLayer } from './calendar-types';
import { useT } from '@/lib/i18n/use-t';

const gateway = createCalendarGateway();

const COLOR_PRESETS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function publicUrls(token: string): { https: string; webcal: string } {
    const https = `${env.platformBaseUrl}/platform/v1/calendar/public/${token}`;
    return { https, webcal: https.replace(/^https?:\/\//, 'webcal://') };
}

export interface CalendarLayerSettingsPanelProps {
    /** null = geschlossen, sonst der zu bearbeitende Layer. */
    layer: CalendarLayer | null;
    onClose: () => void;
    /** Nach Save: Sidebar-/Panel-Refresh anstossen. */
    onUpdated: () => void | Promise<void>;
}

export function CalendarLayerSettingsPanel({ layer, onClose, onUpdated }: CalendarLayerSettingsPanelProps): JSX.Element {
    const t = useT();
    const open = layer !== null;

    // ESC zum Schliessen — Hook MUSS vor jedem early-return stehen.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <div className={cn(
            'fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
            open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}>
            {layer && <SettingsBody key={layer.id} layer={layer} onClose={onClose} onUpdated={onUpdated} t={t} />}
        </div>
    );
}

function SettingsBody({ layer, onClose, onUpdated, t }: {
    layer: CalendarLayer; onClose: () => void; onUpdated: () => void | Promise<void>;
    t: (key: string, vars?: Record<string, unknown>) => string;
}) {
    const [name, setName] = useState(layer.name);
    const [color, setColor] = useState(layer.color);
    const [saving, setSaving] = useState(false);
    const [pendingPublic, setPendingPublic] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const dirty = name.trim() !== layer.name || color !== layer.color;

    const jwt = sessionStore.getSnapshot().platform?.token;

    const saveGeneral = async () => {
        const trimmed = name.trim();
        if (!trimmed) { setError(t('calendar.layer_settings.name_required')); return; }
        if (!jwt) return;
        setSaving(true);
        setError(null);
        try {
            await gateway.updateLayer(jwt, layer.id, { name: trimmed, color });
            await onUpdated();
            toast.success(t('calendar.layer_settings.saved'));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const togglePublic = async () => {
        if (!jwt) return;
        setPendingPublic(true);
        try {
            await gateway.updateLayer(jwt, layer.id, { isPublic: !layer.isPublic });
            await onUpdated();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setPendingPublic(false);
        }
    };

    const copy = async (text: string) => {
        await navigator.clipboard.writeText(text);
        toast.success(t('calendar.sync.copied', { defaultValue: 'Link kopiert' }));
    };

    const urls = layer.isPublic && layer.publicToken ? publicUrls(layer.publicToken) : null;

    return (
        <>
            {/* Header */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{layer.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                        {t('calendar.layer_settings.subtitle')}
                    </div>
                </div>
                <button onClick={onClose}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('common.close', { defaultValue: 'Schliessen' })}>
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
                {/* Section 1: Allgemein */}
                <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('calendar.layer_settings.section_general')}
                    </h3>
                    <div className="space-y-3">
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                                {t('calendar.layer_settings.name')}
                            </span>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-primary" />
                        </label>
                        <div>
                            <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                                <MaterialIcon name="palette" size={12} className="-mt-0.5 mr-1 inline" />
                                {t('calendar.layer_settings.color')}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {COLOR_PRESETS.map(c => (
                                    <button key={c} onClick={() => setColor(c)}
                                        className={cn('size-7 rounded-full border-2 transition-transform hover:scale-110',
                                            color === c ? 'border-foreground scale-110' : 'border-transparent')}
                                        style={{ backgroundColor: c }} />
                                ))}
                                {/* Free-Picker fuer custom-Color */}
                                <label className="relative flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 hover:border-foreground">
                                    <MaterialIcon name="colorize" size={12} className="text-muted-foreground" />
                                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                                        className="absolute inset-0 size-full cursor-pointer opacity-0" />
                                </label>
                            </div>
                        </div>
                        {error && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">{error}</div>
                        )}
                        <div className="flex justify-end">
                            <button onClick={saveGeneral} disabled={saving || !dirty}
                                className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                                {saving
                                    ? t('common.saving', { defaultValue: 'Speichere…' })
                                    : t('common.save', { defaultValue: 'Speichern' })}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Section 2: Abo / Sync */}
                <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('calendar.layer_settings.section_sync')}
                    </h3>
                    <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground/80">
                        {t('calendar.layer_settings.sync_help')}
                    </p>
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <div className="min-w-0">
                            <div className="text-[12px] font-medium">
                                {t('calendar.layer_settings.public_label')}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                {layer.isPublic
                                    ? t('calendar.layer_settings.public_on_hint')
                                    : t('calendar.layer_settings.public_off_hint')}
                            </div>
                        </div>
                        <button onClick={togglePublic} disabled={pendingPublic}
                            className={cn('shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
                                layer.isPublic ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                            {layer.isPublic
                                ? t('calendar.sync.public_on', { defaultValue: 'öffentlich · an' })
                                : t('calendar.sync.public_off', { defaultValue: 'privat' })}
                        </button>
                    </div>
                    {urls && (
                        <div className="mt-2 space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
                            {([
                                ['webcal (Apple/Outlook)', urls.webcal],
                                ['https (Google „per URL")', urls.https],
                            ] as const).map(([label, url]) => (
                                <div key={label} className="flex items-center gap-1.5">
                                    <span className="w-[140px] shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
                                    <code className="flex-1 truncate rounded bg-background px-1.5 py-0.5 text-[10px]">{url}</code>
                                    <button onClick={() => copy(url)} title={t('calendar.sync.copy', { defaultValue: 'Kopieren' })}
                                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                                        <MaterialIcon name="content_copy" size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Section 3: Mehr (Platzhalter) */}
                <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('calendar.layer_settings.section_more')}
                    </h3>
                    <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                        {t('calendar.layer_settings.more_placeholder')}
                    </p>
                </section>
            </div>
        </>
    );
}
