/**
 * DigestConfirmPage — Double-Opt-in-Bestätigung für die E-Mail-
 * Zusammenfassung (E11). Route: /digest-confirm#<token>
 * Token im URL-Fragment → nie an Server/Logs/Referer; nur im POST-Body.
 */
import { type JSX, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, MailCheck } from 'lucide-react';
import { env } from '@/core/config/env';

type State = 'working' | 'success' | 'error';

export function DigestConfirmPage(): JSX.Element {
    const navigate = useNavigate();
    const [token] = useState(() =>
        typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').trim() : '');
    const [state, setState] = useState<State>('working');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!token || token.length < 16) { setState('error'); setError('Kein gültiger Token im Link.'); return; }
        (async () => {
            try {
                const res = await fetch(`${env.platformBaseUrl}/customer/digest/confirm`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                const d = await res.json().catch(() => ({}));
                if (!res.ok || !d.success) {
                    setError(d.error ?? 'Bestätigung fehlgeschlagen.');
                    setState('error');
                    return;
                }
                setState('success');
                setTimeout(() => navigate('/'), 3000);
            } catch {
                setError('Verbindung fehlgeschlagen.');
                setState('error');
            }
        })();
    }, [token, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
                {state === 'working' && (
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Bestätige …</p>
                    </div>
                )}
                {state === 'success' && (
                    <div className="flex flex-col items-center gap-3">
                        <CheckCircle className="h-10 w-10 text-emerald-600" />
                        <h1 className="text-lg font-semibold">E-Mail-Zusammenfassung aktiv</h1>
                        <p className="text-sm text-muted-foreground">
                            Danke! Du erhältst ab jetzt deine Zusammenfassung wie eingestellt.
                            Antworten und Bearbeitung passieren in prilog.
                        </p>
                    </div>
                )}
                {state === 'error' && (
                    <div className="flex flex-col items-center gap-3">
                        <MailCheck className="h-10 w-10 text-muted-foreground/50" />
                        <h1 className="text-lg font-semibold">Bestätigung nicht möglich</h1>
                        <p className="text-sm text-destructive">{error}</p>
                        <p className="text-xs text-muted-foreground">
                            Du kannst die Zusammenfassung in prilog unter
                            Einstellungen → Benachrichtigungen erneut aktivieren.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
