import { type JSX, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../auth-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { User, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

export const LoginForm = (): JSX.Element => {
    const t = useT();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Chat-PWA laeuft unter <tenant>.prilog.chat — kanonische
            // Tenant-Identitaet ist aber <tenant>.prilog.team. Backend
            // akzeptiert beide TLDs (siehe auth-v1/login), aber damit
            // window.location.hostname und matrixDomain konsistent sind,
            // mappen wir hier vor dem Versand.
            const host = window.location.hostname;
            const canonicalServer = host.endsWith('.prilog.chat')
                ? host.replace(/\.prilog\.chat$/, '.prilog.team')
                : host;
            await authService.login({
                identifier,
                server: canonicalServer,
                password,
            });
            navigate('/', { replace: true });
        } catch (unknownError) {
            const message = unknownError instanceof Error ? unknownError.message : t('auth.components.login_form.login_failed');
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identifier */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('auth.components.login_form.benutzername')}</label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={identifier}
                        onChange={(event) => setIdentifier(event.target.value)}
                        placeholder={t('auth.components.login_form.benutzername')}
                        className="pl-9"
                        autoComplete="username"
                        autoFocus
                        required
                    />
                </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('auth.components.login_form.passwort')}</label>
                <div className="relative">
                    <MaterialIcon name="lock" size={16} className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={t('auth.components.login_form.passwort_eingeben')}
                        className="pl-9"
                        autoComplete="current-password"
                        required
                    />
                </div>
            </div>

            {error && (
                <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={loading}
            >
                {loading ? (
                    <>
                        <Loader2 className="size-4 animate-spin" />
                        {t('auth.components.login_form.anmeldung')}
                    </>
                ) : (
                    t('auth.components.login_form.anmelden')
                )}
            </Button>

            {/* Dev hint */}
            {import.meta.env.DEV && (
                <>
                    <Separator />
                    <p className="text-center text-[11px] text-muted-foreground">
                        {t('auth.components.login_form.dev-modus')} <code className="rounded bg-muted px-1 py-0.5 font-mono">{t('auth.components.login_form.dev_dev')}</code>
                    </p>
                </>
            )}
        </form>
    );
};
