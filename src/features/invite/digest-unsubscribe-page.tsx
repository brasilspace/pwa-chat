/**
 * DigestUnsubscribePage — 1-Klick-Abmelden vom Space-Digest (ohne Login).
 * Route: /digest-unsubscribe#<token>  (Token im Fragment → nie in Logs).
 * Setzt ausschließlich cycle=OFF.
 */
import { type JSX, useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { env } from '@/core/config/env';

type S = 'working' | 'ok' | 'err';

export function DigestUnsubscribePage(): JSX.Element {
    const [token] = useState(() =>
        typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').trim() : '');
    const [s, setS] = useState<S>('working');

    useEffect(() => {
        if (!token || token.length < 16) { setS('err'); return; }
        (async () => {
            try {
                const res = await fetch(`${env.platformBaseUrl}/customer/digest/unsubscribe`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                const d = await res.json().catch(() => ({}));
                setS(res.ok && d.success ? 'ok' : 'err');
            } catch { setS('err'); }
        })();
    }, [token]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
                {s === 'working' && <div className="flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Abmelden …</p></div>}
                {s === 'ok' && <div className="flex flex-col items-center gap-3"><CheckCircle className="h-10 w-10 text-emerald-600" /><h1 className="text-lg font-semibold">Abgemeldet</h1><p className="text-sm text-muted-foreground">Du erhältst keine E-Mail-Zusammenfassung mehr. In prilog unter Einstellungen → Benachrichtigungen jederzeit wieder aktivierbar.</p></div>}
                {s === 'err' && <div className="flex flex-col items-center gap-3"><XCircle className="h-10 w-10 text-muted-foreground/50" /><h1 className="text-lg font-semibold">Link ungültig</h1><p className="text-sm text-muted-foreground">Bitte melde dich in prilog ab: Einstellungen → Benachrichtigungen → Aus.</p></div>}
            </div>
        </div>
    );
}
