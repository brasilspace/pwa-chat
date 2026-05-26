/**
 * Install-Anleitung fuer iOS-Nutzer.
 * Auf Android koennen wir den browser-eigenen Install-Prompt nutzen.
 * Auf iOS gibt es keinen API-Trigger — Nutzer muessen ueber "Teilen → Zum
 * Home-Bildschirm" gehen. Web-Push funktioniert auf iOS NUR nach Install.
 */
import { type JSX, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MaterialIcon } from '@/components/ui/material-icon';

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function detectPlatform(): 'ios' | 'android' | 'desktop' {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
}

export function InstallPwaPage(): JSX.Element {
    const [platform] = useState(detectPlatform());
    const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setInstallEvent(e as BeforeInstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', handler);
        const installedHandler = () => setInstalled(true);
        window.addEventListener('appinstalled', installedHandler);
        if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true);
        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('appinstalled', installedHandler);
        };
    }, []);

    async function triggerInstall() {
        if (!installEvent) return;
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice.outcome === 'accepted') setInstalled(true);
        setInstallEvent(null);
    }

    return (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 py-8">
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <MaterialIcon name="arrow_back" size={16} />
                Zurück zum Chat
            </Link>

            <header>
                <h1 className="text-2xl font-bold">prilog Chat installieren</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Damit du Nachrichten zuverlässig auf deinem Telefon empfängst — auch wenn der Browser geschlossen ist.
                </p>
            </header>

            {installed && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <MaterialIcon name="check_circle" size={16} className="-mt-0.5 mr-1 inline" />
                    prilog Chat ist installiert. Öffne ihn vom Home-Bildschirm.
                </div>
            )}

            {!installed && platform === 'ios' && (
                <ol className="space-y-3 text-sm">
                    <li className="flex gap-3 rounded-lg border border-border p-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">1</span>
                        <span>Tippe unten in Safari auf das <strong>Teilen-Symbol</strong> <MaterialIcon name="ios_share" size={14} className="-mt-0.5 inline" />.</span>
                    </li>
                    <li className="flex gap-3 rounded-lg border border-border p-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">2</span>
                        <span>Wähle <strong>„Zum Home-Bildschirm"</strong>.</span>
                    </li>
                    <li className="flex gap-3 rounded-lg border border-border p-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">3</span>
                        <span>Bestätige mit <strong>„Hinzufügen"</strong>. prilog Chat erscheint dann wie eine echte App.</span>
                    </li>
                    <li className="flex gap-3 rounded-lg border border-border p-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">4</span>
                        <span>Öffne prilog Chat <strong>vom Home-Bildschirm aus</strong> und erlaube Benachrichtigungen, wenn du gefragt wirst.</span>
                    </li>
                </ol>
            )}

            {!installed && platform === 'android' && (
                <div className="space-y-3 text-sm">
                    {installEvent ? (
                        <button
                            onClick={triggerInstall}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-medium text-primary-foreground hover:bg-primary/90"
                        >
                            <MaterialIcon name="install_mobile" size={18} />
                            Jetzt installieren
                        </button>
                    ) : (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                            Falls der Install-Button nicht erscheint, öffne das Menü oben rechts (⋮) und wähle „App installieren".
                        </p>
                    )}
                </div>
            )}

            {!installed && platform === 'desktop' && (
                <div className="space-y-3 text-sm">
                    {installEvent ? (
                        <button
                            onClick={triggerInstall}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-medium text-primary-foreground hover:bg-primary/90"
                        >
                            <MaterialIcon name="install_desktop" size={18} />
                            Installieren
                        </button>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Im Chrome/Edge öffne die URL-Leiste und klicke auf das Installations-Symbol rechts.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
