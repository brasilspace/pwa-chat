import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { LoginForm } from './login-form';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

export const LoginPage = (): JSX.Element => {
    const t = useT();
    const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const isTransitioning = snapshot.state !== 'logged_out' && snapshot.state !== 'ready';

    const [supportOpen, setSupportOpen] = useState(false);
    const [supportEmail, setSupportEmail] = useState('');
    const [supportMessage, setSupportMessage] = useState('');
    const [supportSent, setSupportSent] = useState(false);
    const [supportSending, setSupportSending] = useState(false);

    async function handleSupportSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!supportEmail.trim() || !supportMessage.trim()) return;

        setSupportSending(true);
        try {
            const res = await fetch('https://api.prilog.chat/api/public/support', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: supportEmail.trim(),
                    message: supportMessage.trim(),
                    source: 'web-client-login',
                    server: window.location.hostname,
                }),
            });
            if (res.ok) {
                setSupportSent(true);
                setTimeout(() => {
                    setSupportSent(false);
                    setSupportOpen(false);
                    setSupportEmail('');
                    setSupportMessage('');
                }, 2500);
            }
        } catch {
            window.location.href = `mailto:support@prilog.chat?subject=Support%20(${window.location.hostname})&body=${encodeURIComponent(supportMessage)}`;
        } finally {
            setSupportSending(false);
        }
    }

    return (
        <main className="relative flex min-h-screen">
            {/* Left panel — branding */}
            <div className="hidden w-[45%] flex-col justify-between bg-[var(--sidebar-background)] p-10 lg:flex">
                <div>
                    <span className="text-xl font-semibold">
                        <span className="text-foreground">{t('auth.components.login_page.prilog')}</span>
                        <span className="text-primary">team</span>
                    </span>
                </div>

                <div className="max-w-md">
                    <blockquote className="text-[1.75rem] font-semibold leading-snug tracking-tight">
                        {t('auth.components.login_page.kommunikation_und_projektarbeit_an_einem')}
                    </blockquote>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                        {t('auth.components.login_page.dsgvo-konform_fuer_schulen_gebaut_sicher')}
                    </p>
                </div>

                <p className="text-xs text-muted-foreground">
                    {t('auth.components.login_page.copy')} {new Date().getFullYear()} {t('auth.components.login_page.prilog_middot')} {window.location.hostname}
                </p>
            </div>

            {/* Right panel — form */}
            <div className="flex flex-1 flex-col items-center justify-center bg-background px-6">
                <div className="w-full max-w-[380px]">
                    {/* Mobile logo */}
                    <div className="mb-10 text-center lg:hidden">
                        <span className="text-2xl font-semibold">
                            <span className="text-foreground">{t('auth.components.login_page.prilog')}</span>
                            <span className="text-primary">team</span>
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">{window.location.hostname}</p>
                    </div>

                    <header className="mb-8">
                        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.components.login_page.anmelden')}</h1>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {t('auth.components.login_page.melde_dich_mit_deinem_matrix-konto_an')}
                        </p>
                    </header>

                    <LoginForm />

                    {/* Error */}
                    {snapshot.lastError && (
                        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-[var(--surface-danger)] px-4 py-3">
                            <MaterialIcon name="error" size={16} className="mt-0.5 size-4 shrink-0 text-destructive" />
                            <p className="text-sm text-destructive">{snapshot.lastError}</p>
                        </div>
                    )}

                    {/* Transition state */}
                    {isTransitioning && !snapshot.lastError && (
                        <div className="mt-4 flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3">
                            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                                {stateLabel(snapshot.state, t)}
                            </p>
                        </div>
                    )}

                    {/* Support */}
                    <div className="mt-8 text-center">
                        <button
                            onClick={() => setSupportOpen(!supportOpen)}
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <MaterialIcon name="support" size={16} className="size-3.5" />
                            {t('auth.components.login_page.probleme_beim_anmelden_support_kontaktie')}
                        </button>

                        {supportOpen && (
                            <div className="mt-3 rounded-xl border bg-card p-4 text-left">
                                {supportSent ? (
                                    <p className="text-sm font-medium text-emerald-600">{t('auth.components.login_page.nachricht_gesendet')}</p>
                                ) : (
                                    <form onSubmit={handleSupportSubmit} className="space-y-3">
                                        <div>
                                            <input
                                                type="email"
                                                required
                                                placeholder={t('auth.components.login_page.deine_e-mail-adresse')}
                                                value={supportEmail}
                                                onChange={(e) => setSupportEmail(e.target.value)}
                                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                            />
                                        </div>
                                        <div>
                                            <textarea
                                                required
                                                placeholder={t('auth.components.login_page.wie_koennen_wir_helfen')}
                                                value={supportMessage}
                                                onChange={(e) => setSupportMessage(e.target.value)}
                                                rows={3}
                                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={supportSending}
                                            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            {supportSending ? t('auth.components.login_page.support_sending') : t('auth.components.login_page.support_submit')}
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
};

function stateLabel(state: string, t: (k: string) => string): string {
    switch (state) {
        case 'matrix_authenticating': return t('auth.components.login_page.state_matrix_authenticating');
        case 'matrix_authenticated': return t('auth.components.login_page.state_matrix_authenticated');
        case 'platform_exchanging': return t('auth.components.login_page.state_platform_exchanging');
        case 'refreshing_platform_token': return t('auth.components.login_page.state_refreshing_token');
        case 'session_invalid': return t('auth.components.login_page.state_session_invalid');
        default: return state;
    }
}
