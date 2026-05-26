import { type JSX, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MaterialIcon } from '@/components/ui/material-icon';

export function OfflinePage(): JSX.Element {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const up = () => setOnline(true);
        const down = () => setOnline(false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => {
            window.removeEventListener('online', up);
            window.removeEventListener('offline', down);
        };
    }, []);

    return (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
            <MaterialIcon name={online ? 'wifi' : 'wifi_off'} size={48} className="text-muted-foreground" />
            <h1 className="text-xl font-semibold">{online ? 'Wieder online' : 'Keine Verbindung'}</h1>
            <p className="text-sm text-muted-foreground">
                {online
                    ? 'Du bist wieder mit dem Internet verbunden.'
                    : 'prilog Chat braucht eine Internet-Verbindung, um neue Nachrichten zu laden und zu senden. Bereits geladene Chats können weiter eingesehen werden.'}
            </p>
            <Link
                to="/"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
                Zurück zum Chat
            </Link>
        </div>
    );
}
