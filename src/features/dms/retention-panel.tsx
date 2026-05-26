/**
 * RetentionPanel — zeigt im Doc-Detail "Aufbewahrung bis ..." + Legal-Hold-Toggle.
 *
 * - Wenn keine retentionUntil gesetzt: dezenter Text "keine Aufbewahrungsregel"
 * - Wenn aufbewahrungUntil <= 30 Tage: gelbes Banner mit Warnung
 * - Wenn ueberfaellig: rotes Banner
 * - Admin-only Legal-Hold-Toggle
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { retentionApi } from './use-retention-policies';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/ui/section-header';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    documentId: string;
    retentionUntil: string | null;
    legalHold: boolean;
    legalHoldReason: string | null;
    legalHoldBy: string | null;
    legalHoldAt: string | null;
    onChange?: () => void;
}

export function RetentionPanel({ documentId, retentionUntil, legalHold, legalHoldReason, legalHoldBy, legalHoldAt, onChange }: Props): JSX.Element | null {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const [saving, setSaving] = useState(false);
    const [showHoldForm, setShowHoldForm] = useState(false);
    const [reason, setReason] = useState(legalHoldReason ?? '');

    if (!retentionUntil && !legalHold && !isAdmin) return null;

    const until = retentionUntil ? new Date(retentionUntil) : null;
    const now = new Date();
    const daysLeft = until ? Math.ceil((until.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null;
    const isOverdue = daysLeft !== null && daysLeft < 0;
    const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;

    const toggleHold = async () => {
        if (!jwt) return;
        setSaving(true);
        try {
            await retentionApi.setLegalHold(jwt, documentId, !legalHold, reason || undefined);
            setShowHoldForm(false);
            onChange?.();
        } catch (e) {
            alert('Fehler: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-2">
            <SectionHeader>{t('dms.retention.aufbewahrung')}</SectionHeader>

            {/* Status-Banner */}
            {until && (
                <div className={cn(
                    'rounded border px-2 py-1.5 text-xs',
                    legalHold ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/20' :
                        isOverdue ? 'border-red-500/50 bg-red-50 dark:bg-red-950/20' :
                            isExpiringSoon ? 'border-orange-500/50 bg-orange-50 dark:bg-orange-950/20' :
                                'border-border bg-muted/30',
                )}>
                    <div className="flex items-center gap-1.5">
                        <MaterialIcon name="schedule" size={16} className="size-3 shrink-0" />
                        <span className="font-medium">
                            {legalHold ? 'Legal Hold aktiv — Frist pausiert' :
                                isOverdue ? `Aufbewahrungsfrist abgelaufen (vor ${-daysLeft!} Tagen)` :
                                    isExpiringSoon ? `Läuft in ${daysLeft} Tagen ab` :
                                        'Aufbewahrung bis'}
                        </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {until.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                </div>
            )}

            {!until && (
                <p className="text-[11px] text-muted-foreground italic">{t('dms.retention.keine_aufbewahrungsregel_wird_via_dokume')}</p>
            )}

            {/* Legal Hold */}
            {legalHold ? (
                <div className="rounded border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 px-2 py-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                        <MaterialIcon name="gpp_maybe" size={16} className="size-3.5 text-amber-600" />
                        {t('dms.retention.legal_hold_aktiv')}
                    </div>
                    {legalHoldReason && <p className="mt-0.5 text-[11px] italic text-muted-foreground">"{legalHoldReason}"</p>}
                    {legalHoldBy && legalHoldAt && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {t('dms.retention.gesperrt_von')} {legalHoldBy.replace(/^@/, '').split(':')[0]} am {new Date(legalHoldAt).toLocaleDateString('de-DE')}
                        </p>
                    )}
                    {isAdmin && (
                        <button
                            onClick={toggleHold}
                            disabled={saving}
                            className="mt-1.5 rounded border border-border px-2 py-0.5 text-[11px] hover:bg-background disabled:opacity-50 inline-flex items-center gap-1"
                        >
                            {saving ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="verified_user" size={16} className="size-3" />}
                            {t('dms.retention.legal_hold_aufheben')}
                        </button>
                    )}
                </div>
            ) : (
                isAdmin && (
                    showHoldForm ? (
                        <div className="rounded border border-amber-500/40 bg-background p-2 space-y-1.5">
                            <p className="text-[11px] font-medium">{t('dms.retention.legal_hold_aktivieren')}</p>
                            <input
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder={t('dms.retention.grund_zb_aktenzeichen_laufendes_verfahre')}
                                className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-[11px]"
                            />
                            <div className="flex gap-1">
                                <button onClick={toggleHold} disabled={saving} className="flex-1 rounded bg-amber-600 py-0.5 text-[11px] text-white disabled:opacity-50">
                                    {saving ? t('common.saving') : 'Aktivieren'}
                                </button>
                                <button onClick={() => setShowHoldForm(false)} className="rounded border border-border px-2 py-0.5 text-[11px]">
                                    {t('dms.retention.abbrechen')}
                                </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                                <MaterialIcon name="warning" size={16} className="size-2.5 shrink-0 mt-0.5" />
                                {t('dms.retention.blockt_automatische_loeschungarchivierun')}
                            </p>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowHoldForm(true)}
                            className="text-[11px] text-amber-700 hover:underline inline-flex items-center gap-1"
                        >
                            <MaterialIcon name="gpp_maybe" size={16} className="size-3" /> {t('dms.retention.legal_hold_setzen')}
                        </button>
                    )
                )
            )}
        </div>
    );
}
