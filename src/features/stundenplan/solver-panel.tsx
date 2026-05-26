/**
 * SolverPanel (Auto-Mode 0g) — Slide-Over fuer Stundenplan-Generator.
 *
 * UX-Konzept:
 *  - Header: Titel + Schliessen.
 *  - Pre-Check-Block: Vorbedingungen (Stundentafel komplett, Lehrer da, Slots da).
 *  - Solve-Button: Loest synchron via Backend-Job-Pipeline aus,
 *    Polling laeuft danach automatisch via TanStack Query refetchInterval.
 *  - Job-Liste: alle bisherigen Jobs des Szenarios mit Status-Badge,
 *    Cancel-Knopf bei aktiven Jobs, Auswahl zeigt Details.
 *  - Result-Sektion: zeigt Status, Score, gepatzte Entries, unplaced.
 *  - Accept-Workflow: Phase 0g.1 (in dieser Iteration: read-only Preview).
 *
 * No-Modal, slide-over rechts, voller Hoehe, „flutschige" Inputs.
 */
import { type JSX, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/utils';
import { useSolveJobs, useSolveJob } from './use-solve-jobs';
import type { SolveJob } from '@/gateways/platform/stundenplan-gateway';

interface Props {
    open: boolean;
    onClose: () => void;
    scenarioId: string | undefined;
}

const STATUS_BADGE: Record<SolveJob['status'], { label: string; className: string; icon: string }> = {
    queued: { label: 'queued', className: 'bg-muted text-muted-foreground', icon: 'schedule' },
    running: { label: 'running', className: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200', icon: 'autorenew' },
    done: { label: 'done', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200', icon: 'check_circle' },
    failed: { label: 'failed', className: 'bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200', icon: 'error' },
    cancelled: { label: 'cancelled', className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200', icon: 'cancel' },
};

export function SolverPanel({ open, onClose, scenarioId }: Props): JSX.Element {
    const t = useT();
    const { jobs, loading, createJob, creating, cancelJob, cancelling, acceptJob, accepting } =
        useSolveJobs(scenarioId);
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [timeoutSeconds, setTimeoutSeconds] = useState(60);
    const [error, setError] = useState<string | null>(null);
    const [acceptMessage, setAcceptMessage] = useState<string | null>(null);
    const detailQ = useSolveJob(selectedJobId);

    async function handleSolve() {
        if (!scenarioId) {
            setError(t('stundenplan.solver_no_scenario'));
            return;
        }
        setError(null);
        try {
            const r = await createJob({ scenarioId, timeoutSeconds });
            setSelectedJobId(r.job.id);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }

    async function handleCancel(jobId: string) {
        setError(null);
        try {
            await cancelJob(jobId);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }

    async function handleAccept(jobId: string) {
        setError(null);
        setAcceptMessage(null);
        const ok = confirm(t('stundenplan.solver_accept_confirm'));
        if (!ok) return;
        try {
            const r = await acceptJob({ jobId });
            const skipped = r.result.skipped.length;
            setAcceptMessage(
                t('stundenplan.solver_accept_success')
                    .replace('{created}', String(r.result.createdEntries))
                    .replace('{replaced}', String(r.result.replacedEntries))
                    .replace('{skipped}', String(skipped)),
            );
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }

    return (
        <div
            className={cn(
                'fixed inset-y-0 right-0 z-40 flex w-full max-w-[640px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
                open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
            )}
            aria-hidden={!open}
        >
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b px-3">
                <MaterialIcon name="auto_awesome" size={18} className="text-primary" />
                <span className="text-sm font-semibold">{t('stundenplan.solver_title')}</span>
                <button
                    onClick={onClose}
                    className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t('common.close')}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-sm">
                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        {error}
                    </div>
                )}
                {acceptMessage && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                        {acceptMessage}
                    </div>
                )}

                <section className="rounded-md border bg-card p-3 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('stundenplan.solver_start')}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        {t('stundenplan.solver_intro')}
                    </p>
                    <label className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{t('stundenplan.solver_timeout')}</span>
                        <input
                            type="number"
                            min={10}
                            max={600}
                            value={timeoutSeconds}
                            onChange={(e) => setTimeoutSeconds(Math.max(10, Math.min(600, Number(e.target.value) || 60)))}
                            className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs"
                        />
                        <span className="text-muted-foreground">{t('stundenplan.solver_seconds')}</span>
                    </label>
                    <button
                        onClick={handleSolve}
                        disabled={!scenarioId || creating}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        <MaterialIcon name={creating ? 'autorenew' : 'play_arrow'} size={16} className={creating ? 'animate-spin' : ''} />
                        {creating ? t('stundenplan.solver_starting') : t('stundenplan.solver_start_button')}
                    </button>
                </section>

                <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('stundenplan.solver_jobs_title')}
                    </h3>
                    {loading && <p className="text-xs text-muted-foreground">…</p>}
                    {!loading && jobs.length === 0 && (
                        <p className="text-xs text-muted-foreground">{t('stundenplan.solver_no_jobs')}</p>
                    )}
                    <ul className="space-y-1.5">
                        {jobs.map((job) => {
                            const badge = STATUS_BADGE[job.status];
                            const isActive = job.status === 'queued' || job.status === 'running';
                            const isSelected = job.id === selectedJobId;
                            return (
                                <li
                                    key={job.id}
                                    className={cn(
                                        'flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer hover:bg-muted/40',
                                        isSelected ? 'border-primary bg-primary/5' : 'border-transparent',
                                    )}
                                    onClick={() => setSelectedJobId(job.id)}
                                >
                                    <span
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                            badge.className,
                                        )}
                                    >
                                        <MaterialIcon
                                            name={badge.icon}
                                            size={11}
                                            className={job.status === 'running' ? 'animate-spin' : ''}
                                        />
                                        {badge.label}
                                    </span>
                                    <span className="font-mono text-[10px] text-muted-foreground">{job.id.slice(-6)}</span>
                                    <span className="ml-auto text-[10px] text-muted-foreground">
                                        {formatTimeAgo(job.createdAt)}
                                    </span>
                                    {isActive && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handleCancel(job.id);
                                            }}
                                            disabled={cancelling}
                                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            aria-label={t('common.cancel')}
                                        >
                                            <MaterialIcon name="cancel" size={12} />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>

                {selectedJobId && detailQ.data?.job && (
                    <JobDetail
                        job={detailQ.data.job}
                        t={t}
                        onAccept={() => handleAccept(detailQ.data!.job.id)}
                        accepting={accepting}
                    />
                )}
            </div>
        </div>
    );
}

function JobDetail({
    job,
    t,
    onAccept,
    accepting,
}: {
    job: SolveJob;
    t: (k: string) => string;
    onAccept: () => void;
    accepting: boolean;
}): JSX.Element {
    const canAccept =
        job.status === 'done' &&
        (job.result?.status === 'optimal' || job.result?.status === 'feasible');
    return (
        <section className="rounded-md border bg-card p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('stundenplan.solver_detail_title')}
            </h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">{t('stundenplan.solver_detail_status')}</dt>
                <dd className="font-medium">{job.status}</dd>
                <dt className="text-muted-foreground">{t('stundenplan.solver_detail_timeout')}</dt>
                <dd>{job.timeoutSeconds}s</dd>
                <dt className="text-muted-foreground">{t('stundenplan.solver_detail_started')}</dt>
                <dd>{job.startedAt ? new Date(job.startedAt).toLocaleString() : '—'}</dd>
                <dt className="text-muted-foreground">{t('stundenplan.solver_detail_finished')}</dt>
                <dd>{job.finishedAt ? new Date(job.finishedAt).toLocaleString() : '—'}</dd>
            </dl>
            {job.error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    <p className="font-medium">{t('stundenplan.solver_detail_error')}</p>
                    <p className="mt-0.5 font-mono">{job.error}</p>
                </div>
            )}
            {job.result && (
                <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                        <Stat label={t('stundenplan.solver_score_entries')} value={job.result.entries.length} />
                        <Stat label={t('stundenplan.solver_score_unplaced')} value={job.result.unplaced.length} />
                        <Stat label={t('stundenplan.solver_score_total')} value={job.result.score.total} />
                    </div>
                    <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            {t('stundenplan.solver_score_breakdown')}
                        </summary>
                        <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                            <dt className="text-muted-foreground">free_periods</dt>
                            <dd>{job.result.score.free_periods}</dd>
                            <dt className="text-muted-foreground">pref_grade_mismatch</dt>
                            <dd>{job.result.score.pref_grade_mismatch}</dd>
                            <dt className="text-muted-foreground">missing_preferred_tags</dt>
                            <dd>{job.result.score.missing_preferred_tags}</dd>
                            <dt className="text-muted-foreground">double_slot_misses</dt>
                            <dd>{job.result.score.double_slot_misses}</dd>
                            <dt className="text-muted-foreground">teacher_day_overload</dt>
                            <dd>{job.result.score.teacher_day_overload}</dd>
                        </dl>
                    </details>
                    {job.result.unplaced.length > 0 && (
                        <details className="text-xs">
                            <summary className="cursor-pointer text-amber-700 hover:text-amber-800">
                                {t('stundenplan.solver_unplaced_title')}
                            </summary>
                            <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[11px]">
                                {job.result.unplaced.map((u, i) => (
                                    <li key={i}>
                                        {u.classSpaceId} / {u.subjectId}: {u.placedHours}/{u.requiredHours} — {u.reason}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                    <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            {t('stundenplan.solver_log_title')}
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-1.5 text-[10px] font-mono">
                            {job.result.log.join('\n')}
                        </pre>
                    </details>
                    {canAccept && (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 space-y-2 dark:border-emerald-900 dark:bg-emerald-950/30">
                            <p className="text-[11px] text-emerald-900 dark:text-emerald-200">
                                {t('stundenplan.solver_accept_hint')}
                            </p>
                            <button
                                onClick={onAccept}
                                disabled={accepting}
                                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                <MaterialIcon
                                    name={accepting ? 'autorenew' : 'check_circle'}
                                    size={14}
                                    className={accepting ? 'animate-spin' : ''}
                                />
                                {accepting
                                    ? t('stundenplan.solver_accept_running')
                                    : t('stundenplan.solver_accept_button')}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
    return (
        <div className="rounded-md border bg-background p-1.5">
            <div className="text-[10px] text-muted-foreground">{label}</div>
            <div className="text-base font-semibold">{value}</div>
        </div>
    );
}

function formatTimeAgo(iso: string): string {
    const date = new Date(iso);
    const diff = Date.now() - date.getTime();
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'jetzt';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h`;
    return date.toLocaleDateString();
}
