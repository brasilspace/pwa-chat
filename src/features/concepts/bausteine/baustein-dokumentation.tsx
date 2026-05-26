/**
 * BausteinDokumentation — Generierte Berichte + DMS-Ordner
 *
 * Zeigt automatisch generierte Workflow-Berichte mit Vorschau/Druck
 * und den verlinkten DMS-Ordner.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowEvents } from '../../workflow/use-workflow-events';
import { FileText, FolderOpen, ExternalLink, Eye, Printer, Clock, X } from 'lucide-react';
import type { ConceptBaustein } from '../concept-gateway';
import { createConceptGateway } from '../concept-gateway';
import { useT } from "@/lib/i18n/use-t";

const gateway = createConceptGateway();

interface Props {
    baustein: ConceptBaustein;
    instanceId: string;
    jwt: string;
    label: string;
}

interface ReportItem {
    id: string;
    title: string;
    runId: string;
    createdAt: string;
}

export function BausteinDokumentation({ baustein, instanceId, jwt, label }: Props) {
    const t = useT();
    const navigate = useNavigate();
    const [reports, setReports] = useState<ReportItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewingReport, setViewingReport] = useState<{ id: string; title: string; htmlContent: string } | null>(null);

    const loadReports = useCallback(() => {
        gateway.getReports(jwt).then((res) => {
            setReports(res.items);
        }).finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { loadReports(); }, [loadReports]);

    // SSE: Neue Berichte in Echtzeit
    useWorkflowEvents(useCallback((event) => {
        if (event === 'report.generated') loadReports();
    }, [loadReports]));

    const handleView = async (reportId: string) => {
        const res = await gateway.getReport(jwt, reportId);
        setViewingReport(res.report);
    };

    const handlePrint = () => {
        if (!viewingReport) return;
        const win = window.open('', '_blank');
        if (win) {
            win.document.write(viewingReport.htmlContent);
            win.document.close();
            setTimeout(() => win.print(), 500);
        }
    };

    // Report viewer overlay
    if (viewingReport) {
        return (
            <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-2">
                    <h3 className="text-sm font-semibold">{viewingReport.title}</h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--accent)]"
                        >
                            <Printer size={12} />
                            {t('concepts.bausteine.baustein_dokumentation.drucken_pdf')}
                        </button>
                        <button
                            onClick={() => setViewingReport(null)}
                            className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto bg-white p-4">
                    <div
                        className="mx-auto"
                        style={{ maxWidth: '800px' }}
                        dangerouslySetInnerHTML={{ __html: viewingReport.htmlContent }}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col p-6">
            <div className="mx-auto w-full" style={{ maxWidth: 'var(--content-reading-width, 48rem)' }}>
                <div className="mb-6">
                    <h3 className="text-base font-semibold">{label}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {t('concepts.bausteine.baustein_dokumentation.automatisch_generierte_berichte_und_prot')}
                    </p>
                </div>

                {/* Generated Reports */}
                <section className="mb-8">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <FileText size={16} />
                        {t('concepts.bausteine.baustein_dokumentation.generierte_berichte')}
                    </h4>

                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
                        </div>
                    ) : reports.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
                            <FileText size={24} className="mx-auto mb-2 text-[var(--muted-foreground)]" />
                            <p className="text-sm text-[var(--muted-foreground)]">
                                {t('concepts.bausteine.baustein_dokumentation.noch_keine_berichte_berichte_werden_auto')}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {reports.map((report) => (
                                <div
                                    key={report.id}
                                    className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3"
                                >
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                                        <FileText size={18} className="text-blue-500" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{report.title}</p>
                                        <p className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                                            <Clock size={10} />
                                            {new Date(report.createdAt).toLocaleString('de-DE')}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleView(report.id)}
                                        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--accent)]"
                                    >
                                        <Eye size={12} />
                                        {t('concepts.bausteine.baustein_dokumentation.ansehen')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* DMS Folder */}
                {baustein.dmsFolderId && (
                    <section>
                        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                            <FolderOpen size={16} />
                            {t('concepts.bausteine.baustein_dokumentation.konzept-ordner_im_dms')}
                        </h4>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm">{t('concepts.bausteine.baustein_dokumentation.zusaetzliche_dokumente_koennen_im_dms_ho')}</p>
                                <button
                                    onClick={() => navigate('/documents')}
                                    className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--accent)]"
                                >
                                    <ExternalLink size={12} />
                                    {t('concepts.bausteine.baustein_dokumentation.dms_oeffnen')}
                                </button>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
