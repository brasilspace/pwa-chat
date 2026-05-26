/**
 * Konzept-Verankerung — Seite im Prilog-Layout.
 *
 * Spaltenaufteilung (vom User festgelegt):
 *   Sidebar       = Konzept-Master-Liste (verankerung-sidebar.tsx)
 *   Hauptfenster  = Konzept-Detailansicht (KonzeptDetail, Fach-Tabs)
 *   Detailfenster = Hilfe-/Kontext-Texte zum gerade geöffneten Tab
 */
import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { useT } from '@/lib/i18n/use-t';
import { conceptCockpitGateway } from '@/gateways/platform/concept-cockpit-gateway';
import { MaterialIcon } from '@/components/ui/material-icon';
import { ResizablePanels } from '@/components/ui/resizable-panels';
import { ScrollArea } from '@/components/ui/scroll-area';
import { KonzeptDetail, HelpPanel } from './konzept-detail';

type HelpData = { items: Record<string, { body: string; updatedAt: string; updatedBy: string | null }>; canEdit: boolean };

export function VerankerungWorld(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const { flowId } = useParams();
    const [searchParams] = useSearchParams();
    const isNew = searchParams.get('neu') === '1';

    const [helpTopic, setHelpTopic] = useState<string>('overview');
    const [help, setHelp] = useState<HelpData | null>(null);
    const [fullscreen, setFullscreen] = useState(false);

    useEffect(() => {
        if (!jwt) return;
        conceptCockpitGateway.listHelp(jwt).then(setHelp).catch(() => { /* Hilfe optional */ });
    }, [jwt]);

    const tabLabel = (k: string): string => ({
        overview: t('verankerung.tab.overview', { defaultValue: 'Übersicht' }),
        practice: t('verankerung.tab.practice', { defaultValue: 'Praxisbausteine' }),
        targets: t('verankerung.tab.targets', { defaultValue: 'Zielgruppen' }),
        evaluation: t('verankerung.tab.evaluation', { defaultValue: 'Evaluation / Pulse' }),
        score: t('verankerung.tab.score', { defaultValue: 'Score' }),
        schutz: t('verankerung.tab.schutz', { defaultValue: 'Schutzkonzept' }),
        agencies: t('verankerung.tab.agencies', { defaultValue: 'Fachstellen' }),
        report: t('verankerung.tab.report', { defaultValue: 'Nachweisbericht' }),
        gates: t('verankerung.tab.gates', { defaultValue: 'Freigaben & Gates' }),
    } as Record<string, string>)[k] ?? k;

    if (!flowId) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <MaterialIcon name="architecture" size={40} className="text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground">
                    {t('verankerung.selectConcept', { defaultValue: 'Konzept in der Sidebar auswählen — oder neu anlegen.' })}
                </p>
            </div>
        );
    }

    const detailPanel = (
        <KonzeptDetail
            key={flowId}
            flowId={flowId}
            isNew={isNew}
            showHelpTab={false}
            onTabChange={(tab) => setHelpTopic(tab)}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen(f => !f)}
        />
    );

    const helpPanel = (
        <div className="flex h-full flex-col">
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
                <MaterialIcon name="help" size={16} className="text-primary" />
                <span className="text-[12px] font-medium">{t('verankerung.tab.help', { defaultValue: 'Hilfe & Kontext' })}</span>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-4">
                    <HelpPanel
                        t={t} jwt={jwt}
                        topic={helpTopic}
                        topicLabel={tabLabel(helpTopic)}
                        help={help}
                        onSaved={(items) => setHelp(h => h ? { ...h, items } : h)}
                    />
                </div>
            </ScrollArea>
        </div>
    );

    return (
        <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1">
                {fullscreen ? (
                    <div className="h-full">{detailPanel}</div>
                ) : (
                    <ResizablePanels
                        left={detailPanel}
                        right={helpPanel}
                        defaultLeftRatio={0.62}
                        minLeftRatio={0.4}
                        maxLeftRatio={0.8}
                    />
                )}
            </div>
        </div>
    );
}
