/**
 * OwnerSetupPage — Workspace-Admin legt initial sein Passwort fest.
 *
 * Öffentliche Seite (kein Login). Route: /owner-setup#<token>
 * Der Token steht im URL-FRAGMENT — wird nie an Server/Proxy/Referer
 * gesendet. Wir lesen ihn clientseitig und schicken ihn nur im POST-Body.
 *
 * Flow:
 *   1. token aus location.hash → POST /customer/owner-setup/lookup
 *   2. Passwort + Bestätigung eingeben
 *   3. POST /customer/owner-setup/claim → Passwort wird im Tenant gesetzt
 *   4. Weiter zum Login
 */
import { type JSX, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, ShieldCheck } from 'lucide-react';
import { env } from '@/core/config/env';

interface SetupInfo {
    workspaceName: string;
    username: string;
    webappDomain: string;
}
type PageState = 'loading' | 'form' | 'saving' | 'success' | 'error';

export function OwnerSetupPage(): JSX.Element {
    const navigate = useNavigate();
    // Token aus dem URL-Fragment (#...) — verlässt nie den Browser Richtung
    // Server-URL/Logs/Referer.
    const [token] = useState(() =>
        typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').trim() : '');

    const [state, setState] = useState<PageState>('loading');
    const [info, setInfo] = useState<SetupInfo | null>(null);
    const [error, setError] = useState('');
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');

    useEffect(() => {
        if (!token || token.length < 16) { setState('error'); setError('Kein gültiger Token im Link.'); return; }
        (async () => {
            try {
                const res = await fetch(`${env.platformBaseUrl}/customer/owner-setup/lookup`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    setError(data.error ?? 'Link ungültig oder abgelaufen.');
                    setState('error');
                    return;
                }
                setInfo(data.setup);
                setState('form');
            } catch {
                setError('Verbindung fehlgeschlagen. Bitte später erneut versuchen.');
                setState('error');
            }
        })();
    }, [token]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pw.length < 8) { setError('Das Passwort muss mindestens 8 Zeichen lang sein.'); return; }
        if (pw !== pw2) { setError('Die Passwörter stimmen nicht überein.'); return; }
        setError('');
        setState('saving');
        try {
            const res = await fetch(`${env.platformBaseUrl}/customer/owner-setup/claim`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ token, password: pw }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error ?? 'Passwort konnte nicht gesetzt werden.');
                setState('form');
                return;
            }
            setState('success');
            setTimeout(() => navigate('/login'), 2500);
        } catch {
            setError('Verbindung fehlgeschlagen.');
            setState('form');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
                <div className="mb-6 flex items-center gap-2">
                    <ShieldCheck className="h-6 w-6 text-primary" />
                    <h1 className="text-lg font-semibold">Passwort festlegen</h1>
                </div>

                {state === 'loading' && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
                    </div>
                )}

                {state === 'error' && (
                    <p className="text-sm text-destructive">{error}</p>
                )}

                {state === 'success' && (
                    <div className="space-y-3 text-center">
                        <CheckCircle className="mx-auto h-10 w-10 text-emerald-600" />
                        <p className="text-sm">Passwort gesetzt. Du wirst zum Login weitergeleitet …</p>
                    </div>
                )}

                {(state === 'form' || state === 'saving') && info && (
                    <form onSubmit={submit} className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Workspace <strong className="text-foreground">{info.workspaceName}</strong>.
                            Lege jetzt das Passwort für deinen Zugang fest.
                        </p>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Benutzername</label>
                            <input
                                value={info.username}
                                readOnly
                                className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Neues Passwort</label>
                            <input
                                type="password"
                                value={pw}
                                onChange={e => setPw(e.target.value)}
                                autoFocus
                                minLength={8}
                                required
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Passwort wiederholen</label>
                            <input
                                type="password"
                                value={pw2}
                                onChange={e => setPw2(e.target.value)}
                                minLength={8}
                                required
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                            />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <button
                            type="submit"
                            disabled={state === 'saving'}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                        >
                            {state === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
                            Passwort festlegen & loslegen
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
