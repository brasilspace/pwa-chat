import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State { error: Error | null; info: ErrorInfo | null; }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
    state: State = { error: null, info: null };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        this.setState({ error, info });
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    reset = () => this.setState({ error: null, info: null });
    reload = () => location.reload();

    async clearAndReload() {
        try {
            if ('caches' in window) {
                const ks = await caches.keys();
                await Promise.all(ks.map((k) => caches.delete(k)));
            }
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
            }
        } catch (e) {
            console.error('clearCache failed', e);
        }
        location.reload();
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-8">
                <h1 className="text-xl font-semibold text-destructive">Etwas ist schiefgelaufen</h1>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                    <div className="font-mono font-semibold">{this.state.error.name}: {this.state.error.message}</div>
                    {this.state.info?.componentStack && (
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] opacity-70">
                            {this.state.info.componentStack.slice(0, 1500)}
                        </pre>
                    )}
                    {this.state.error.stack && (
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] opacity-70">
                            {this.state.error.stack.slice(0, 1500)}
                        </pre>
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <button
                        onClick={this.reload}
                        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        Neu laden
                    </button>
                    <button
                        onClick={() => void this.clearAndReload()}
                        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                    >
                        Cache leeren & neu laden
                    </button>
                </div>
            </div>
        );
    }
}
