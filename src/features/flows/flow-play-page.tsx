/**
 * FlowPlayPage — laeuft eine Anleitung (appKind='guide') als Wizard fuer
 * den eingeloggten User. Hauptauesserstelle aus Dashboard-Box "Aktive Flows".
 *
 * Im Gegensatz zum Test-Run im Designer:
 *  - keine "x Schliessen"-Taste oben rechts (User soll's durchspielen)
 *  - Backend-Tracking als ProcessInstance (ueber startInstance)
 *  - Bei Abschluss zurueck zur Startseite
 *
 * Nicht-Guide-Templates (appKind='flow', 'concept' etc.) werden hier nicht
 * unterstuetzt — Redirect zur Editor-Seite.
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { flowsGateway, type ProcessTemplate, type ProcessComponent, type ProcessEdge } from './flows-gateway';
import { GuidePlayer } from './guide-player';
import { Loader2 } from 'lucide-react';
import { useT } from "@/lib/i18n/use-t";

export function FlowPlayPage(): JSX.Element {
    const t = useT();
    const { templateId } = useParams<{ templateId: string }>();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const userName = session.bootstrap?.user.displayName ?? '';

    const [template, setTemplate] = useState<ProcessTemplate | null>(null);
    const [components, setComponents] = useState<ProcessComponent[]>([]);
    const [edges, setEdges] = useState<ProcessEdge[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jwt || !templateId) return;
        flowsGateway.getTemplate(jwt, templateId)
            .then(r => {
                setTemplate(r.template);
                setComponents(r.template.components);
                setEdges(r.template.edges);
            })
            .catch(err => setError(err instanceof Error ? err.message : String(err)));
    }, [jwt, templateId]);

    useEffect(() => {
        if (!template) return;
        if (template.appKind !== 'guide') {
            // Nicht-Guide: zurueck zum Editor
            navigate(`/flows/${template.id}`, { replace: true });
        }
    }, [template, navigate]);

    if (error) {
        return (
            <div className="flex h-full flex-col items-center justify-center bg-background p-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <button onClick={() => navigate(-1)} className="mt-4 rounded border border-border px-4 py-2 text-sm">{t('flows.flow_play_page.zurueck')}</button>
            </div>
        );
    }

    if (!template) {
        return (
            <div className="flex h-full items-center justify-center bg-background">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const branding = (template.metadata as { brandingProfile?: Record<string, unknown> } | null)?.brandingProfile as never;

    return (
        <div className="fixed inset-0 z-[100] bg-black/70">
            <button
                onClick={() => navigate('/')}
                className="absolute right-4 top-4 z-10 rounded-md bg-white px-3 py-1.5 text-sm shadow-md hover:bg-zinc-100"
            >
                {t('flows.flow_play_page.schliessen')}
            </button>
            <GuidePlayer
                components={components}
                edges={edges}
                branding={branding}
                testMode={true}
                onClose={() => navigate('/')}
                initialData={{ userName }}
            />
        </div>
    );
}
