/**
 * Error-Boundary — fangt Render-Errors im Guide-Editor und zeigt
 * statt weissem Screen die Stack-Trace + einen Reload-Button.
 *
 * Dauerhaft drin lassen: kostet nichts, hilft beim Debug enorm.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useT } from "@/lib/i18n/use-t";

interface State {
    error: Error | null;
    componentStack: string | null;
}

function ErrorFallback({
    error,
    componentStack,
    onReload,
    onClear,
}: {
    error: Error;
    componentStack: string | null;
    onReload: () => void;
    onClear: () => void;
}) {
    const t = useT();
    return (
        <div className="flex min-h-screen items-start justify-center bg-zinc-900 p-6 text-zinc-100">
            <div className="max-w-3xl w-full space-y-4">
                <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-4">
                    <h1 className="text-xl font-semibold text-red-300">{t('flows.guide_error_boundary.render-fehler_im_anleitungs-designer')}</h1>
                    <p className="mt-1 text-sm text-zinc-300">
                        {t('flows.guide_error_boundary.der_editor_ist_abgestuerzt_so_gehts_weit')}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-zinc-300 list-disc list-inside">
                        <li><strong>{t('flows.guide_error_boundary.reload')}</strong> {t('flows.guide_error_boundary.versuchts_frisch_meistens_reicht_das')}</li>
                        <li><strong>{t('flows.guide_error_boundary.stack-trace_kopieren')}</strong> {t('flows.guide_error_boundary.an_lee_schicken_dann_fixe_ichs_gezielt')}</li>
                    </ul>
                    <div className="mt-3 flex gap-2">
                        <button onClick={onReload} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-700">
                            {t('flows.guide_error_boundary.reload')}
                        </button>
                        <button onClick={onClear} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800">
                            {t('flows.guide_error_boundary.trotzdem_versuchen')}
                        </button>
                    </div>
                </div>

                <details open className="rounded-lg border border-zinc-700 bg-zinc-950 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-200">{t('flows.guide_error_boundary.fehler-details')}</summary>
                    <div className="mt-3 space-y-2 text-xs">
                        <div>
                            <div className="text-zinc-400 mb-1">{t('flows.guide_error_boundary.message')}</div>
                            <pre className="rounded bg-black/50 p-2 whitespace-pre-wrap break-words text-red-200">{error.message}</pre>
                        </div>
                        {error.stack && (
                            <div>
                                <div className="text-zinc-400 mb-1">{t('flows.guide_error_boundary.stack')}</div>
                                <pre className="rounded bg-black/50 p-2 whitespace-pre-wrap break-words text-zinc-300 max-h-72 overflow-auto">{error.stack}</pre>
                            </div>
                        )}
                        {componentStack && (
                            <div>
                                <div className="text-zinc-400 mb-1">{t('flows.guide_error_boundary.component-stack')}</div>
                                <pre className="rounded bg-black/50 p-2 whitespace-pre-wrap break-words text-zinc-300 max-h-48 overflow-auto">{componentStack}</pre>
                            </div>
                        )}
                    </div>
                </details>

                <div className="rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-400">
                    {t('flows.guide_error_boundary.tipp_browser-devtools-console_oeffnen_f1')}
                </div>
            </div>
        </div>
    );
}

export class GuideErrorBoundary extends Component<{ children: ReactNode }, State> {
    state: State = { error: null, componentStack: null };

    static getDerivedStateFromError(error: Error): State {
        return { error, componentStack: null };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // eslint-disable-next-line no-console
        console.error('[GuideEditor] Render-Error', error, info);
        this.setState({ componentStack: info.componentStack ?? null });
    }

    handleReload = () => {
        window.location.reload();
    };

    handleClear = () => {
        this.setState({ error: null, componentStack: null });
    };

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <ErrorFallback
                error={this.state.error}
                componentStack={this.state.componentStack}
                onReload={this.handleReload}
                onClear={this.handleClear}
            />
        );
    }
}
