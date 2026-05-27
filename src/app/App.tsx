/**
 * pwa-chat App-Root
 *
 * Chat-only-Variante von Prilog. Im Gegensatz zum Voll-Web-Client gibt es
 * hier KEIN ShellLayout, keine Module-Sidebar, keine Hubs. Stattdessen:
 *
 *   Login → ChatRuntimeProvider → MessengerShell (Chat-Liste + Chat-Detail)
 *
 * Bewusst kompakt: viel weniger Lazy-Routes, nur was Chat-relevant ist.
 */
import { Suspense, lazy, type JSX } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactiveBridge } from '@/core/reactive/reactive-bridge';
import { LoginPage } from '../features/auth/components/login-page';
import { RequireAuth } from '../features/auth/components/require-auth';
import { MessengerShell } from '../features/messenger/messenger-shell';
import { ChatRuntimeProvider } from '../features/chat/chat-runtime-provider';
import { ErrorBoundary } from './error-boundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastContainer } from '@/components/ui/toast';

const LazyChatOnlySettings = lazy(() => import('../features/chat-only/chat-only-settings').then(m => ({ default: m.ChatOnlySettings })));
const LazyInstallPage = lazy(() => import('../features/chat-only/install-pwa-page').then(m => ({ default: m.InstallPwaPage })));
const LazyOfflinePage = lazy(() => import('../features/chat-only/offline-page').then(m => ({ default: m.OfflinePage })));
const LazyDmChat = lazy(() => import('../features/modules/dm-chat').then(m => ({ default: m.DmChat })));

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: true,
            retry: 1,
        },
        mutations: { retry: 0 },
    },
});

function AuthenticatedApp(): JSX.Element {
    // MessengerShell hat eigene <Routes>-Logik fuer index / spaces / settings /
    // absence-report — deshalb hier nicht nochmal per Pfad matchen, sondern
    // die Shell unter /* einmal mounten und intern matchen lassen.
    return (
        <ChatRuntimeProvider>
            <Routes>
                <Route path="/dm/:recipientId" element={<Suspense fallback={<div />}><LazyDmChat /></Suspense>} />
                <Route path="/chat-settings" element={<Suspense fallback={<div />}><LazyChatOnlySettings /></Suspense>} />
                <Route path="/install" element={<Suspense fallback={<div />}><LazyInstallPage /></Suspense>} />
                <Route path="/offline" element={<Suspense fallback={<div />}><LazyOfflinePage /></Suspense>} />
                <Route path="/*" element={<MessengerShell />} />
            </Routes>
        </ChatRuntimeProvider>
    );
}

export const App = (): JSX.Element => (
    <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={200}>
                <ReactiveBridge />
                <BrowserRouter>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route
                            path="/*"
                            element={
                                <RequireAuth>
                                    <AuthenticatedApp />
                                </RequireAuth>
                            }
                        />
                    </Routes>
                </BrowserRouter>
                <ToastContainer />
            </TooltipProvider>
        </QueryClientProvider>
    </ErrorBoundary>
);
