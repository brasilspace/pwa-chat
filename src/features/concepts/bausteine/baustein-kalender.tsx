/**
 * BausteinKalender — Kalender-Layer-Ansicht fuer Praevention und Qualifizierung
 *
 * Zeigt Hinweis auf den verlinkten Kalender-Layer mit Quick-Link.
 * Erlaubt Deaktivieren wenn keine Termine existieren, und Re-Aktivieren.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ExternalLink, Power, Loader2 } from 'lucide-react';
import type { ConceptBaustein, ConceptInstance } from '../concept-gateway';
import { createConceptGateway } from '../concept-gateway';
import { createCalendarGateway } from '@/gateways/platform/calendar-gateway';
import { useT } from "@/lib/i18n/use-t";

const conceptGateway = createConceptGateway();
const calendarGateway = createCalendarGateway();

interface Props {
    baustein: ConceptBaustein;
    instance: ConceptInstance;
    bausteinKey: string;
    label: string;
    description: string;
    jwt: string;
    onChanged: () => void;
}

export function BausteinKalender({ baustein, instance, bausteinKey, label, description, jwt, onChanged }: Props) {
    const t = useT();
    const navigate = useNavigate();
    const [eventCount, setEventCount] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!baustein.calendarLayerId || !jwt) {
            setEventCount(null);
            return;
        }
        calendarGateway.getLayers(jwt).then((res) => {
            const l = res.layers.find((x) => x.id === baustein.calendarLayerId);
            setEventCount(l?.eventCount ?? 0);
        }).catch(() => setEventCount(null));
    }, [baustein.calendarLayerId, jwt]);

    const handleDeactivate = useCallback(async () => {
        if (!baustein.calendarLayerId) return;
        if (!confirm('Kalender deaktivieren? Der Layer wird entfernt. Bestehende Einstellungen gehen verloren.')) return;
        setBusy(true);
        setError(null);
        try {
            await calendarGateway.deleteLayer(jwt, baustein.calendarLayerId);
            await conceptGateway.updateBaustein(jwt, instance.id, bausteinKey, { calendarLayerId: null });
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Fehler beim Deaktivieren');
        } finally {
            setBusy(false);
        }
    }, [baustein.calendarLayerId, jwt, instance.id, bausteinKey, onChanged]);

    const handleActivate = useCallback(async () => {
        const spaceId = (instance.config as { spaceId?: string })?.spaceId;
        if (!spaceId) {
            setError('Konzept-Space nicht gefunden');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const color = bausteinKey === 'qualifizierung' ? '#8b5cf6' : '#3b82f6';
            const created = await calendarGateway.createLayer(jwt, {
                spaceId,
                level: 2,
                name: `${instance.name}: ${label}`,
                color,
            });
            await conceptGateway.updateBaustein(jwt, instance.id, bausteinKey, { calendarLayerId: created.layer.id });
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Fehler beim Aktivieren');
        } finally {
            setBusy(false);
        }
    }, [instance, bausteinKey, label, jwt, onChanged]);

    const canDeactivate = baustein.calendarLayerId && eventCount === 0 && !busy;

    return (
        <div className="flex h-full flex-col p-6">
            <div className="mx-auto w-full" style={{ maxWidth: 'var(--content-reading-width, 48rem)' }}>
                <div className="mb-6">
                    <h3 className="text-base font-semibold">{label}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
                </div>

                {baustein.calendarLayerId ? (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                                        <Calendar size={20} className="text-blue-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{t('concepts.bausteine.baustein_kalender.kalender-layer_aktiv')}</p>
                                        <p className="text-xs text-[var(--muted-foreground)]">
                                            {eventCount === null ? 'Termine werden geladen …'
                                                : eventCount === 0 ? 'Noch keine Termine'
                                                    : `${eventCount} Termin${eventCount === 1 ? '' : 'e'} im Layer`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => navigate('/calendar')}
                                        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--accent)]"
                                    >
                                        <ExternalLink size={12} />
                                        {t('concepts.bausteine.baustein_kalender.kalender_oeffnen')}
                                    </button>
                                    <button
                                        onClick={handleDeactivate}
                                        disabled={!canDeactivate}
                                        title={
                                            !baustein.calendarLayerId ? ''
                                                : eventCount === null ? 'Wird geladen …'
                                                    : eventCount > 0 ? 'Deaktivieren nur moeglich wenn keine Termine vorhanden sind'
                                                        : 'Kalender deaktivieren'
                                        }
                                        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--destructive)] hover:bg-[var(--destructive)]/10 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                                        {t('concepts.bausteine.baustein_kalender.deaktivieren')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center">
                            <p className="text-sm text-[var(--muted-foreground)]">
                                {t('concepts.bausteine.baustein_kalender.termine_koennen_direkt_im_kalender-hub_e')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--accent)]/30 p-6 text-center">
                        <Calendar size={24} className="mx-auto mb-2 text-[var(--muted-foreground)]" />
                        <p className="text-sm text-[var(--muted-foreground)]">{t('concepts.bausteine.baustein_kalender.kein_kalender-layer_verknuepft')}</p>
                        <button
                            onClick={handleActivate}
                            disabled={busy}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90 disabled:opacity-50"
                        >
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                            {t('concepts.bausteine.baustein_kalender.kalender_aktivieren')}
                        </button>
                    </div>
                )}

                {error && <p className="mt-3 text-xs text-[var(--destructive)]">{error}</p>}
            </div>
        </div>
    );
}
