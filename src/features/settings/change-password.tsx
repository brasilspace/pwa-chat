/**
 * ChangePassword — Passwort aendern in den Settings.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { Loader2, CheckCircle } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { useT } from "@/lib/i18n/use-t";

const platformGateway = createPlatformGateway();

export function ChangePassword(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const platformToken = session.platform?.token;

    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const valid = currentPw.length > 0 && newPw.length >= 8 && newPw === confirmPw;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!platformToken || !valid) return;

        setSaving(true);
        setError('');
        setSuccess(false);

        try {
            await platformGateway.changePassword(platformToken, {
                currentPassword: currentPw,
                newPassword: newPw,
            });

            setSuccess(true);
            setCurrentPw('');
            setNewPw('');
            setConfirmPw('');
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            const status = (err as { status?: number })?.status;
            if (status === 401) {
                setError('Aktuelles Passwort ist falsch.');
            } else if (status === 429) {
                setError('Konto vorruebergehend gesperrt. Bitte spaeter erneut versuchen.');
            } else {
                setError('Passwort konnte nicht geaendert werden.');
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <MaterialIcon name="lock" size={16} className="size-5 text-muted-foreground" />
                <div>
                    <h3 className="text-sm font-semibold">{t('settings.change_password.passwort_aendern')}</h3>
                    <p className="text-xs text-muted-foreground">{t('settings.change_password.neues_passwort_muss_mindestens_8_zeichen')}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('settings.change_password.aktuelles_passwort')}</label>
                    <input
                        type={showPw ? 'text' : 'password'}
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('settings.change_password.neues_passwort')}</label>
                    <input
                        type={showPw ? 'text' : 'password'}
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('settings.change_password.wiederholen')}</label>
                    <input
                        type={showPw ? 'text' : 'password'}
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {confirmPw && newPw !== confirmPw && (
                        <p className="mt-1 text-xs text-destructive">{t('settings.change_password.passwoerter_stimmen_nicht_ueberein')}</p>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setShowPw(!showPw)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                        {showPw ? <MaterialIcon name="visibility_off" size={16} className="size-3" /> : <MaterialIcon name="visibility" size={16} className="size-3" />}
                        {showPw ? 'Verbergen' : 'Anzeigen'}
                    </button>
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <button
                    type="submit"
                    disabled={!valid || saving}
                    className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : success ? <CheckCircle className="size-4" /> : <MaterialIcon name="lock" size={16} className="size-4" />}
                    {saving ? t('common.saving') : success ? 'Gespeichert' : t('common.change_password')}
                </button>
            </form>
        </div>
    );
}
