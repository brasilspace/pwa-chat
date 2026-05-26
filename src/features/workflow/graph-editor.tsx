/**
 * GraphEditor — Hauptkomponente des visuellen Workflow-Editors
 *
 * Desktop: 3-Spalten-Layout (Palette | Canvas | Inspektor)
 * Mobile: Vertikale Schritt-Liste
 */

import { useEffect, useState, useSyncExternalStore, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Check, ArrowLeft, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useIsMobile } from '../../core/responsive/use-is-mobile';
import { sessionStore } from '../../core/session/session-store';
import { createWorkflowGateway } from './workflow-gateway';
import { graphStore } from './graph-store';
import { GraphCanvas } from './graph-canvas';
import { NodePalette } from './node-palette';
import { NodeInspector } from './node-inspector';
import { MobileGraphList } from './mobile-graph-list';
import type { BuilderNodeDefinition, WorkflowTemplate } from './workflow-types';
import { useT } from "@/lib/i18n/use-t";

const gateway = createWorkflowGateway();

export function GraphEditor() {
    const t = useT();
    const { templateId } = useParams<{ templateId: string }>();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const graphState = useSyncExternalStore(graphStore.subscribe, graphStore.getSnapshot);

    const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
    const [palette, setPalette] = useState<BuilderNodeDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const jwt = session.platform?.token;

    // ─── Load template and palette ───────────────────────────────────

    useEffect(() => {
        if (!jwt || !templateId) return;

        const load = async () => {
            try {
                setLoading(true);
                const [tmplRes, paletteRes] = await Promise.all([
                    gateway.getTemplate(jwt, templateId),
                    gateway.getPalette(jwt),
                ]);

                setTemplate(tmplRes.template);
                setPalette(paletteRes.items);
                graphStore.loadGraph(tmplRes.template.graph);
            } catch (err) {
                setError('Vorlage konnte nicht geladen werden.');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [jwt, templateId]);

    // ─── Save ────────────────────────────────────────────────────────

    const handleSave = useCallback(async () => {
        if (!jwt || !templateId) return;
        setSaving(true);
        try {
            const graph = graphStore.getGraph();
            const result = await gateway.updateTemplate(jwt, templateId, { graph });
            if (result.newVersion) {
                setTemplate(result.template);
            }
            graphStore.markClean();
        } catch {
            setError('Speichern fehlgeschlagen.');
        } finally {
            setSaving(false);
        }
    }, [jwt, templateId]);

    // ─── Approve ─────────────────────────────────────────────────────

    const handleApprove = useCallback(async () => {
        if (!jwt || !templateId) return;
        try {
            // Save first if dirty
            if (graphState.dirty) await handleSave();

            const result = await gateway.approveTemplate(jwt, templateId);
            setTemplate(result.template);
        } catch {
            setError('Freigabe fehlgeschlagen.');
        }
    }, [jwt, templateId, graphState.dirty, handleSave]);

    // ─── Keyboard shortcuts ──────────────────────────────────────────

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Ctrl+S: Speichern — immer aktiv
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
                return;
            }

            // Wenn der Fokus auf einem Eingabefeld liegt, keine Shortcuts auslösen
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (graphState.selectedNodeId) {
                    const node = graphState.nodes.find((n) => n.id === graphState.selectedNodeId);
                    if (node?.type !== 'start') graphStore.removeNode(graphState.selectedNodeId);
                } else if (graphState.selectedEdgeId) {
                    graphStore.removeEdge(graphState.selectedEdgeId);
                }
            }
            if (e.key === 'Escape') {
                graphStore.selectNode(null);
                graphStore.selectEdge(null);
                graphStore.cancelConnecting();
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [graphState.selectedNodeId, graphState.selectedEdgeId, graphState.nodes, handleSave]);

    // ─── Loading / Error ─────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--muted-foreground)]">
                <p>{error}</p>
                <button
                    onClick={() => navigate(-1)}
                    className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-white"
                >
                    {t('workflow.graph_editor.zurueck')}
                </button>
            </div>
        );
    }

    // ─── Mobile: step list ───────────────────────────────────────────

    if (isMobile) {
        return (
            <div className="flex h-full flex-col">
                <MobileHeader
                    template={template}
                    dirty={graphState.dirty}
                    saving={saving}
                    onSave={handleSave}
                    onBack={() => navigate(-1)}
                />
                <MobileGraphList palette={palette} />
            </div>
        );
    }

    // ─── Desktop: 3-column layout ────────────────────────────────────

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-2">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h2 className="text-sm font-medium">{template?.name ?? 'Workflow'}</h2>
                        <span className="text-xs text-[var(--muted-foreground)]">
                            v{template?.version} · {template?.status === 'active' ? t('common.active') : template?.status === 'draft' ? 'Entwurf' : 'Archiviert'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Zoom controls */}
                    <button
                        onClick={() => graphStore.setZoom(graphState.zoom - 0.1)}
                        className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                        title={t('workflow.graph_editor.verkleinern')}
                    >
                        <ZoomOut size={16} />
                    </button>
                    <span className="min-w-[3rem] text-center text-xs text-[var(--muted-foreground)]">
                        {Math.round(graphState.zoom * 100)}%
                    </span>
                    <button
                        onClick={() => graphStore.setZoom(graphState.zoom + 0.1)}
                        className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                        title={t('workflow.graph_editor.vergroessern')}
                    >
                        <ZoomIn size={16} />
                    </button>
                    <button
                        onClick={() => { graphStore.setZoom(1); graphStore.setPan(0, 0); }}
                        className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                        title={t('workflow.graph_editor.zuruecksetzen')}
                    >
                        <RotateCcw size={16} />
                    </button>

                    <div className="mx-2 h-5 w-px bg-[var(--border)]" />

                    {/* Save */}
                    <button
                        onClick={handleSave}
                        disabled={!graphState.dirty || saving}
                        className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm text-white transition-opacity disabled:opacity-40"
                    >
                        <Save size={14} />
                        {saving ? 'Speichert...' : t('common.save')}
                    </button>

                    {/* Approve (only for drafts) */}
                    {template?.status === 'draft' && (
                        <button
                            onClick={handleApprove}
                            className="flex items-center gap-1.5 rounded-md border border-emerald-500 px-3 py-1.5 text-sm text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        >
                            <Check size={14} />
                            {t('workflow.graph_editor.freigeben')}
                        </button>
                    )}
                </div>
            </div>

            {/* 3-column layout */}
            <div className="flex min-h-0 flex-1">
                {/* Left: Palette */}
                <div className="w-56 shrink-0">
                    <NodePalette palette={palette} />
                </div>

                {/* Center: Canvas */}
                <div className="flex-1">
                    <GraphCanvas />
                </div>

                {/* Right: Inspector */}
                <div className="w-72 shrink-0">
                    <NodeInspector palette={palette} />
                </div>
            </div>
        </div>
    );
}

// ─── Mobile Header ───────────────────────────────────────────────────────────

function MobileHeader({
    template, dirty, saving, onSave, onBack,
}: {
    template: WorkflowTemplate | null;
    dirty: boolean;
    saving: boolean;
    onSave: () => void;
    onBack: () => void;
}) {
    return (
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-3 py-2">
            <button onClick={onBack} className="rounded p-1.5 text-[var(--muted-foreground)]">
                <ArrowLeft size={18} />
            </button>
            <span className="text-sm font-medium">{template?.name ?? 'Workflow'}</span>
            <button
                onClick={onSave}
                disabled={!dirty || saving}
                className="rounded p-1.5 text-[var(--primary)] disabled:opacity-40"
            >
                <Save size={18} />
            </button>
        </div>
    );
}
