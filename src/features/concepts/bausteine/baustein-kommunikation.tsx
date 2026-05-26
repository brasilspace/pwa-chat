/**
 * BausteinKommunikation — Matrix-Raum-Verknuepfung + Benachrichtigungsregeln
 */

import { MessageCircle, Users, Bell } from 'lucide-react';
import type { ConceptBaustein } from '../concept-gateway';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    baustein: ConceptBaustein;
    instanceId: string;
    jwt: string;
}

export function BausteinKommunikation({ baustein }: Props) {
    const t = useT();
    return (
        <div className="flex h-full flex-col p-6">
            <div className="mx-auto w-full" style={{ maxWidth: 'var(--content-reading-width, 48rem)' }}>
                {/* Matrix Room */}
                <section className="mb-8">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <MessageCircle size={16} />
                        {t('concepts.bausteine.baustein_kommunikation.kommunikationsraum')}
                    </h3>

                    {baustein.matrixRoomId ? (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium">{t('concepts.bausteine.baustein_kommunikation.matrix-raum_aktiv')}</p>
                                    <p className="text-xs text-[var(--muted-foreground)]">{baustein.matrixRoomId}</p>
                                </div>
                                <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    {t('concepts.bausteine.baustein_kommunikation.verbunden')}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--accent)]/30 p-4 text-center">
                            <p className="text-sm text-[var(--muted-foreground)]">
                                {t('concepts.bausteine.baustein_kommunikation.matrix-raum_wird_bei_der_naechsten_synch')}
                            </p>
                        </div>
                    )}
                </section>

                {/* Notification rules */}
                <section className="mb-8">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <Bell size={16} />
                        {t('concepts.bausteine.baustein_kommunikation.benachrichtigungsregeln')}
                    </h3>

                    <div className="space-y-3">
                        <NotificationRule
                            title={t('concepts.bausteine.baustein_kommunikation.workflow_gestartet')}
                            description="Alle Mitglieder des Konzept-Raums werden bei jedem neuen Durchlauf benachrichtigt."
                            enabled
                        />
                        <NotificationRule
                            title={t('concepts.bausteine.baustein_kommunikation.checkpoint_faellig')}
                            description="Die zustaendige Person erhaelt eine Erinnerung wenn ein Checkpoint auf sie wartet."
                            enabled
                        />
                        <NotificationRule
                            title={t('concepts.bausteine.baustein_kommunikation.sla-warnung')}
                            description="Schulleitung wird informiert wenn ein Checkpoint die Frist ueberschreitet."
                            enabled={false}
                        />
                        <NotificationRule
                            title={t('concepts.bausteine.baustein_kommunikation.workflow_abgeschlossen')}
                            description="Zusammenfassung wird im Konzept-Raum gepostet."
                            enabled
                        />
                    </div>
                </section>

                {/* Stakeholder */}
                <section>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <Users size={16} />
                        {t('concepts.bausteine.baustein_kommunikation.stakeholder-gruppen')}
                    </h3>
                    <p className="text-sm text-[var(--muted-foreground)]">
                        {t('concepts.bausteine.baustein_kommunikation.die_sichtbarkeit_wird_ueber_die_space-ko')}
                    </p>
                </section>
            </div>
        </div>
    );
}

function NotificationRule({ title, description, enabled }: { title: string; description: string; enabled: boolean }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
            <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
            <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-[var(--muted-foreground)]">{description}</p>
            </div>
        </div>
    );
}
