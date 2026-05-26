/**
 * FlowEditorRouter — laedt das Template, dispatcht an passenden Editor.
 *
 * - appKind='guide' → GuideEditor (Phone/Tablet-Mockup)
 * - sonst           → FlowsEditor (React-Flow-Canvas)
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { flowsGateway, type ProcessTemplate } from './flows-gateway';
import { Loader2 } from 'lucide-react';
import { FlowsEditor } from './flows-editor';
import { GuideEditor } from './guide-editor';
import { GuideErrorBoundary } from './guide-error-boundary';
import { useT } from "@/lib/i18n/use-t";

export function FlowEditorRouter() {
    const t = useT();
    const { templateId } = useParams<{ templateId: string }>();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [template, setTemplate] = useState<ProcessTemplate | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jwt || !templateId) return;
        flowsGateway.getTemplate(jwt, templateId)
            .then(r => setTemplate(r.template))
            .catch(err => setError(err instanceof Error ? err.message : t('common.error')));
    }, [jwt, templateId]);

    if (error) return <div className="p-6 text-sm text-destructive">{error}</div>;
    if (!template) {
        return (
            <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {t('flows.flow_editor_router.lade')}
            </div>
        );
    }

    if (template.appKind === 'guide') return (
        <GuideErrorBoundary>
            <GuideEditor />
        </GuideErrorBoundary>
    );
    return <FlowsEditor />;
}
