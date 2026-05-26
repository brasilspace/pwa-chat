/**
 * RegisterPage — Einladung annehmen und Account erstellen.
 *
 * Öffentliche Seite (kein Login nötig).
 * Route: /register?invite=TOKEN
 *
 * Flow:
 *   1. Token aus URL lesen → GET /invitations/:token → Details anzeigen
 *   2. User wählt Username + Passwort
 *   3. POST /invitations/:token/accept → Account wird erstellt
 *   4. Auto-Login → Matrix-Token → Exchange → Redirect zum Dashboard
 */

import { type JSX, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { env } from '@/core/config/env';
import { useT } from "@/lib/i18n/use-t";

interface InvitationDetails {
    id: string;
    email: string;
    fullName: string | null;
    status: string;
    requestedSpace: { id: string; name: string } | null;
    userType: { id: string; label: string } | null;
    message: string | null;
    expiresAt: string | null;
}

interface InviteContext {
    facilityName: string;
    contactPerson: string;
    welcomeText: string;
    userTypeLabel: string | null;
    inviteeName: string | null;
    personalMessage: string | null;
}

type PageState = 'loading' | 'form' | 'creating' | 'success' | 'error';

export function RegisterPage(): JSX.Element {
    const t = useT();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('invite') ?? '';

    const [state, setState] = useState<PageState>('loading');
    const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
    const [context, setContext] = useState<InviteContext | null>(null);
    const [error, setError] = useState('');

    // Form
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [fullName, setFullName] = useState('');
    const [showPw, setShowPw] = useState(false);

    // Token validieren
    useEffect(() => {
        if (!token) {
            setError('Kein Einladungslink vorhanden.');
            setState('error');
            return;
        }

        fetch(`${env.platformBaseUrl}/customer/invitations/${encodeURIComponent(token)}`)
            .then(async (r) => {
                const data = await r.json();
                if (!r.ok || !data.success) {
                    setError(data.error ?? 'Einladung ungueltig oder abgelaufen.');
                    setState('error');
                    return;
                }
                if (data.invitation.status !== 'PENDING') {
                    setError(
                        data.invitation.status === 'CLAIMED' ? 'Diese Einladung wurde bereits angenommen.' :
                            data.invitation.status === 'EXPIRED' ? 'Diese Einladung ist abgelaufen.' :
                                data.invitation.status === 'REVOKED' ? 'Diese Einladung wurde widerrufen.' :
                                    'Einladung ungueltig.'
                    );
                    setState('error');
                    return;
                }
                setInvitation(data.invitation);
                setFullName(data.invitation.fullName ?? '');

                // Willkommensnachricht + Einrichtungsinfos laden
                try {
                    const ctxRes = await fetch(`${env.platformBaseUrl}/platform/v1/public/invite-context/${encodeURIComponent(token)}`);
                    if (ctxRes.ok) {
                        const ctxData = await ctxRes.json();
                        if (ctxData.success) setContext(ctxData.context);
                    }
                } catch { /* Context ist optional */ }

                setState('form');
            })
            .catch(() => {
                setError('Verbindung fehlgeschlagen. Bitte spaeter erneut versuchen.');
                setState('error');
            });
    }, [token]);

    // Validierung
    const usernameValid = /^[a-z0-9_-]{3,30}$/.test(username);
    const passwordValid = password.length >= 8;
    const passwordsMatch = password === passwordConfirm;
    const canSubmit = usernameValid && passwordValid && passwordsMatch && state === 'form';

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;

        setState('creating');
        setError('');

        try {
            const res = await fetch(`${env.platformBaseUrl}/customer/invitations/${encodeURIComponent(token)}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    fullName: fullName.trim() || undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error ?? 'Registrierung fehlgeschlagen.');
                setState('form');
                return;
            }

            setState('success');

            // Auto-Login: Matrix-Login mit den gerade erstellten Credentials
            try {
                const loginRes = await fetch('/_matrix/client/v3/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'm.login.password',
                        identifier: { type: 'm.id.user', user: username },
                        password,
                    }),
                });
                const loginData = await loginRes.json();

                if (loginRes.ok && loginData.access_token) {
                    // Session speichern
                    localStorage.setItem('prilog.matrix.session', JSON.stringify({
                        accessToken: loginData.access_token,
                        deviceId: loginData.device_id,
                        userId: loginData.user_id,
                        homeserver: loginData.home_server ?? window.location.hostname,
                    }));

                    // Platform-Token holen
                    const exchangeRes = await fetch('/api/auth/v1/exchange', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            matrix_access_token: loginData.access_token,
                            homeserver: loginData.home_server ?? window.location.hostname,
                        }),
                    });
                    const exchangeData = await exchangeRes.json();

                    if (exchangeRes.ok && exchangeData.token) {
                        localStorage.setItem('prilog.platform.session', JSON.stringify({
                            token: exchangeData.token,
                            expiresAt: Date.now() + (exchangeData.expiresIn ?? 86400) * 1000,
                        }));

                        // Zum Profil weiterleiten
                        setTimeout(() => {
                            window.location.href = '/settings';
                        }, 1500);
                        return;
                    }
                }
            } catch {
                // Auto-Login fehlgeschlagen — Fallback zur Login-Seite
            }

            setTimeout(() => {
                navigate('/login');
            }, 3000);

        } catch {
            setError('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
            setState('form');
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-md">

                {/* Header */}
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
                        <MaterialIcon name="person_add" size={16} className="size-8 text-primary" />
                    </div>
                    {context?.facilityName ? (
                        <h1 className="text-2xl font-bold">{context.facilityName}</h1>
                    ) : (
                        <h1 className="text-2xl font-bold">{t('invite.register_page.konto_erstellen')}</h1>
                    )}
                    {context?.welcomeText && (
                        <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                            {context.welcomeText}
                        </p>
                    )}
                    {context?.contactPerson && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {t('invite.register_page.eingeladen_von')} <span className="font-medium text-foreground">{context.contactPerson}</span>
                        </p>
                    )}
                    {(context?.userTypeLabel || invitation?.userType) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {t('invite.register_page.ihre_rolle')} <span className="font-medium text-foreground">{context?.userTypeLabel ?? invitation?.userType?.label}</span>
                        </p>
                    )}
                </div>

                {/* Loading */}
                {state === 'loading' && (
                    <div className="flex flex-col items-center gap-3 py-12">
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{t('invite.register_page.einladung_wird_geladen')}</p>
                    </div>
                )}

                {/* Error */}
                {state === 'error' && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
                        <MaterialIcon name="error" size={16} className="mx-auto mb-3 size-8 text-destructive" />
                        <p className="text-sm text-destructive">{error}</p>
                        <a href="/login" className="mt-4 inline-block text-sm text-primary hover:underline">
                            {t('invite.register_page.zur_anmeldung')}
                        </a>
                    </div>
                )}

                {/* Success */}
                {state === 'success' && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
                        <CheckCircle className="mx-auto mb-3 size-8 text-emerald-500" />
                        <h2 className="text-lg font-semibold">{t('invite.register_page.willkommen')}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {t('invite.register_page.ihr_konto_wurde_erstellt_sie_werden_zu_i')}
                        </p>
                        <p className="mt-3 text-xs text-muted-foreground">
                            {t('invite.register_page.benutzername')} <span className="font-mono font-medium text-foreground">{username}</span>
                        </p>
                    </div>
                )}

                {/* Form */}
                {(state === 'form' || state === 'creating') && invitation && (
                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* Einladungsinfo */}
                        {invitation.message && (
                            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                                {invitation.message}
                            </div>
                        )}

                        {/* Name */}
                        <div>
                            <label htmlFor="reg-name" className="mb-1.5 block text-sm font-medium">{t('invite.register_page.name')}</label>
                            <input
                                id="reg-name"
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder={t('invite.register_page.vor-_und_nachname')}
                                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        {/* Username */}
                        <div>
                            <label htmlFor="reg-user" className="mb-1.5 block text-sm font-medium">{t('invite.register_page.benutzername')}</label>
                            <input
                                id="reg-user"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                placeholder={t('invite.register_page.zb_maxmustermann')}
                                autoComplete="username"
                                maxLength={30}
                                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            {username && !usernameValid && (
                                <p className="mt-1 text-xs text-destructive">{t('invite.register_page.min_3_zeichen_nur_kleinbuchstaben_zahlen')}</p>
                            )}
                        </div>

                        {/* Passwort */}
                        <div>
                            <label htmlFor="reg-pw" className="mb-1.5 block text-sm font-medium">{t('invite.register_page.passwort')}</label>
                            <div className="relative">
                                <input
                                    id="reg-pw"
                                    type={showPw ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('invite.register_page.mindestens_8_zeichen')}
                                    autoComplete="new-password"
                                    className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw(!showPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                >
                                    {showPw ? <MaterialIcon name="visibility_off" size={16} className="size-4" /> : <MaterialIcon name="visibility" size={16} className="size-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Passwort bestätigen */}
                        <div>
                            <label htmlFor="reg-pw2" className="mb-1.5 block text-sm font-medium">{t('invite.register_page.passwort_wiederholen')}</label>
                            <input
                                id="reg-pw2"
                                type={showPw ? 'text' : 'password'}
                                value={passwordConfirm}
                                onChange={(e) => setPasswordConfirm(e.target.value)}
                                placeholder={t('invite.register_page.passwort_wiederholen')}
                                autoComplete="new-password"
                                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            {passwordConfirm && !passwordsMatch && (
                                <p className="mt-1 text-xs text-destructive">{t('invite.register_page.passwoerter_stimmen_nicht_ueberein')}</p>
                            )}
                        </div>

                        {/* Fehler */}
                        {error && (
                            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={!canSubmit || (state as string) === 'creating'}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {(state as string) === 'creating' ? (
                                <><Loader2 className="size-4 animate-spin" /> {t('invite.register_page.konto_wird_erstellt')}</>
                            ) : (
                                'Konto erstellen'
                            )}
                        </button>

                        <p className="text-center text-xs text-muted-foreground">
                            {t('invite.register_page.bereits_ein_konto')} <a href="/login" className="text-primary hover:underline">{t('invite.register_page.anmelden')}</a>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}
