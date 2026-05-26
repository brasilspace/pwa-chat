/**
 * BausteinEvaluation — KPI-Dashboard fuer Baustein 9
 *
 * Zeigt Kennzahlen aus der Workflow-Timeline und Baustein-Fortschritt.
 * Nutzt recharts fuer Visualisierung.
 */

import { useEffect, useState } from 'react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { Activity, CheckCircle, XCircle, Clock, AlertTriangle, ClipboardList, Shield } from 'lucide-react';
import { createConceptGateway, type EvaluationKpis } from '../concept-gateway';
import { useT } from "@/lib/i18n/use-t";

const gateway = createConceptGateway();

interface BausteinEvaluationProps {
    instanceId: string;
    jwt: string;
}

const BAUSTEIN_LABELS: Record<string, string> = {
    haltung: 'Haltung',
    analyse: 'Analyse',
    praevention: 'Praevention',
    intervention: 'Intervention',
    organisation: 'Organisation',
    qualifizierung: 'Qualifizierung',
    kommunikation: 'Kommunikation',
    dokumentation: 'Dokumentation',
    evaluation: 'Evaluation',
};

export function BausteinEvaluation({ instanceId, jwt }: BausteinEvaluationProps) {
    const t = useT();
    const [kpis, setKpis] = useState<EvaluationKpis | null>(null);
    const [timeline, setTimeline] = useState<Array<{ date: string; count: number }>>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        gateway.getEvaluationKpis(jwt, instanceId).then((res) => {
            setKpis(res.kpis);
            setTimeline(res.activityTimeline);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [jwt, instanceId]);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
            </div>
        );
    }

    if (!kpis) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">
                {t('concepts.bausteine.baustein_evaluation.keine_daten_verfuegbar')}
            </div>
        );
    }

    const bausteinData = kpis.bausteinStatus.map((b) => ({
        name: BAUSTEIN_LABELS[b.key] ?? b.key,
        value: b.hasContent ? 100 : 0,
        fill: b.hasContent ? '#10b981' : '#e2e8f0',
    }));

    const pieData = [
        { name: 'Abgeschlossen', value: kpis.completedRuns, fill: '#10b981' },
        { name: t('common.active'), value: kpis.activeRuns, fill: '#3b82f6' },
        { name: 'Fehlgeschlagen', value: kpis.failedRuns, fill: '#ef4444' },
    ].filter((d) => d.value > 0);

    return (
        <div className="flex flex-col gap-6 p-6">
            {/* ─── KPI Cards ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiCard
                    icon={Activity}
                    label={t('concepts.bausteine.baustein_evaluation.workflows_gesamt')}
                    value={kpis.totalRuns}
                    color="#3b82f6"
                />
                <KpiCard
                    icon={CheckCircle}
                    label={t('concepts.bausteine.baustein_evaluation.abgeschlossen')}
                    value={kpis.completedRuns}
                    color="#10b981"
                />
                <KpiCard
                    icon={Clock}
                    label={t('concepts.bausteine.baustein_evaluation.bearbeitungszeit')}
                    value={kpis.avgCompletionMinutes != null ? formatDuration(kpis.avgCompletionMinutes) : '—'}
                    color="#f59e0b"
                />
                <KpiCard
                    icon={Shield}
                    label={t('concepts.bausteine.baustein_evaluation.bestaetigungsrate')}
                    value={kpis.confirmationRate != null ? `${kpis.confirmationRate}%` : '—'}
                    color="#8b5cf6"
                />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* ─── Activity Timeline ──────────────────────────────── */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{t('concepts.bausteine.baustein_evaluation.aktivitaet_letzte_30_tage')}</h3>
                    {timeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={timeline}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                    tickFormatter={(d: string) => d.slice(5)}
                                />
                                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                                    labelFormatter={(d) => new Date(String(d)).toLocaleDateString('de-DE')}
                                />
                                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">{t('concepts.bausteine.baustein_evaluation.noch_keine_aktivitaet')}</p>
                    )}
                </div>

                {/* ─── Run Status Pie ─────────────────────────────────── */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{t('concepts.bausteine.baustein_evaluation.workflow-status')}</h3>
                    {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    dataKey="value"
                                    label={({ name, value }: any) => `${name}: ${value}`}
                                    labelLine={false}
                                >
                                    {pieData.map((entry, idx) => (
                                        <Cell key={idx} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">{t('concepts.bausteine.baustein_evaluation.noch_keine_workflows_ausgefuehrt')}</p>
                    )}
                </div>
            </div>

            {/* ─── Baustein Completion ────────────────────────────────── */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('concepts.bausteine.baustein_evaluation.baustein-fortschritt')}</h3>
                    <span className="text-sm font-medium text-[var(--primary)]">{kpis.bausteinCompletionPercent}%</span>
                </div>
                {/* Progress bar */}
                <div className="mb-4 h-2 overflow-hidden rounded-full bg-[var(--accent)]">
                    <div
                        className="h-full rounded-full bg-[var(--primary)] transition-all"
                        style={{ width: `${kpis.bausteinCompletionPercent}%` }}
                    />
                </div>
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={bausteinData} layout="vertical">
                        <XAxis type="number" hide domain={[0, 100]} />
                        <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                            width={100}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                            {bausteinData.map((entry, idx) => (
                                <Cell key={idx} fill={entry.fill} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* ─── Detail Stats ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiCard icon={ClipboardList} label={t('concepts.bausteine.baustein_evaluation.formulare_ausgefuellt')} value={kpis.formResponseCount} color="#14b8a6" />
                <KpiCard icon={CheckCircle} label={t('concepts.bausteine.baustein_evaluation.checkpoints_bestaetigt')} value={kpis.confirmedCheckpoints} color="#10b981" />
                <KpiCard icon={XCircle} label={t('concepts.bausteine.baustein_evaluation.abgelehnt')} value={kpis.rejectedCheckpoints} color="#ef4444" />
                <KpiCard icon={AlertTriangle} label={t('concepts.bausteine.baustein_evaluation.sla_verletzt')} value={kpis.slaBreachedRuns} color="#f59e0b" />
            </div>
        </div>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color }: {
    icon: typeof Activity;
    label: string;
    value: string | number;
    color: string;
}) {
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: color + '15' }}>
                    <Icon size={16} color={color} />
                </div>
                <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
            </div>
            <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">{value}</p>
        </div>
    );
}

function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} Min.`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days} Tage`;
}
