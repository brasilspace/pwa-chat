/**
 * ConceptInstanceView — 9-Tab-Ansicht fuer ein aktives Konzept
 *
 * Jeder Tab entspricht einem Baustein. Tab-Labels kommen aus dem Template
 * (kontextspezifisch: "Fallbearbeitung" statt "Intervention").
 */

import { useEffect, useState, useSyncExternalStore, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    BookOpen, Search, Shield, GitBranch, Users, GraduationCap,
    MessageCircle, FileText, BarChart3, ArrowLeft,
} from 'lucide-react';
import { useIsMobile } from '../../core/responsive/use-is-mobile';
import { sessionStore } from '../../core/session/session-store';
import { createConceptGateway, type ConceptInstance, type ConceptBaustein } from './concept-gateway';
import { BausteinHaltung } from './bausteine/baustein-haltung';
import { BausteinAnalyse } from './bausteine/baustein-analyse';
import { BausteinKalender } from './bausteine/baustein-kalender';
import { BausteinIntervention } from './bausteine/baustein-intervention';
import { BausteinOrganisation } from './bausteine/baustein-organisation';
import { BausteinKommunikation } from './bausteine/baustein-kommunikation';
import { BausteinDokumentation } from './bausteine/baustein-dokumentation';
import { BausteinEvaluation } from './bausteine/baustein-evaluation';
import { BausteinPlaceholder } from './bausteine/baustein-placeholder';
import { useT } from "@/lib/i18n/use-t";

const gateway = createConceptGateway();

const BAUSTEIN_ICONS: Record<string, typeof BookOpen> = {
    haltung: BookOpen,
    analyse: Search,
    praevention: Shield,
    intervention: GitBranch,
    organisation: Users,
    qualifizierung: GraduationCap,
    kommunikation: MessageCircle,
    dokumentation: FileText,
    evaluation: BarChart3,
};

export function ConceptInstanceView() {
    const t = useT();
    const { instanceId } = useParams<{ instanceId: string }>();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [instance, setInstance] = useState<ConceptInstance | null>(null);
    const [activeTab, setActiveTab] = useState<string>('haltung');
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const reload = () => setRefreshKey((k) => k + 1);

    useEffect(() => {
        if (!jwt || !instanceId) return;
        gateway.getInstance(jwt, instanceId).then((res) => {
            setInstance(res.instance);
            setLoading(false);
        });
    }, [jwt, instanceId, refreshKey]);

    // Persist active tab
    useEffect(() => {
        try {
            const saved = localStorage.getItem(`prilog.concept.${instanceId}.tab`);
            if (saved) setActiveTab(saved);
        } catch { }
    }, [instanceId]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        try { localStorage.setItem(`prilog.concept.${instanceId}.tab`, tab); } catch { }
    };

    if (loading || !instance) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
            </div>
        );
    }

    const bausteine = instance.bausteine ?? [];
    const templateBausteine = (instance as any).template?.bausteine as Array<{ key: string; label: string }> | undefined;

    const getLabel = (key: string): string => {
        const fromBaustein = bausteine.find((b) => b.bausteinKey === key);
        const configLabel = (fromBaustein?.config as any)?.label;
        if (configLabel) return configLabel;
        const fromTemplate = templateBausteine?.find((b) => b.key === key);
        return fromTemplate?.label ?? key;
    };

    const activeBaustein = bausteine.find((b) => b.bausteinKey === activeTab);

    // ─── Mobile: Tab-Dropdown ────────────────────────────────────────

    if (isMobile) {
        const Icon = BAUSTEIN_ICONS[activeTab] ?? BookOpen;
        return (
            <div className="flex h-full flex-col">
                {/* Mobile header */}
                <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <button onClick={() => navigate('/konzepte')} className="rounded p-1.5 text-[var(--muted-foreground)]">
                        <ArrowLeft size={18} />
                    </button>
                    <span className="flex-1 truncate text-sm font-medium">{instance.name}</span>
                </div>

                {/* Tab selector as horizontal scroll */}
                <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--card)] px-3 py-1.5"
                    style={{ scrollSnapType: 'x mandatory' }}>
                    {bausteine.map((b) => {
                        const BIcon = BAUSTEIN_ICONS[b.bausteinKey] ?? BookOpen;
                        const isActive = activeTab === b.bausteinKey;
                        return (
                            <button
                                key={b.bausteinKey}
                                onClick={() => handleTabChange(b.bausteinKey)}
                                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${isActive
                                        ? 'bg-[var(--primary)] text-white'
                                        : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)]'
                                    }`}
                                style={{ scrollSnapAlign: 'start' }}
                            >
                                <BIcon size={13} />
                                {getLabel(b.bausteinKey)}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    <BausteinContent
                        bausteinKey={activeTab}
                        baustein={activeBaustein ?? null}
                        instance={instance}
                        jwt={jwt ?? ''}
                        onChanged={reload}
                    />
                </div>
            </div>
        );
    }

    // ─── Desktop: Left sidebar + content ───────────────────────────

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-6 py-3 shrink-0">
                <button
                    onClick={() => navigate('/konzepte')}
                    className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h2 className="text-base font-semibold">{instance.name}</h2>
                    <span className="text-xs text-[var(--muted-foreground)]">
                        {instance.template?.category} {t('concepts.concept_instance_view.aktiv_seit')} {new Date(instance.activatedAt).toLocaleDateString('de-DE')}
                    </span>
                </div>
            </div>

            {/* Sidebar + Content */}
            <div className="flex flex-1 min-h-0">
                {/* Left sidebar — 9 Bausteine */}
                <div className="w-52 shrink-0 border-r overflow-y-auto bg-muted/10 py-3">
                    <p className="px-4 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">{t('concepts.concept_instance_view.bausteine')}</p>
                    <div className="space-y-0.5 px-2">
                        {bausteine.map((b, idx) => {
                            const BIcon = BAUSTEIN_ICONS[b.bausteinKey] ?? BookOpen;
                            const isActive = activeTab === b.bausteinKey;
                            return (
                                <button
                                    key={b.bausteinKey}
                                    onClick={() => handleTabChange(b.bausteinKey)}
                                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${isActive
                                            ? 'bg-primary/10 text-primary font-medium'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                        }`}
                                >
                                    <span className="text-[9px] text-muted-foreground/50 w-3 shrink-0">{idx + 1}</span>
                                    <span className="text-xs truncate">{getLabel(b.bausteinKey)}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    <BausteinContent
                        bausteinKey={activeTab}
                        baustein={activeBaustein ?? null}
                        instance={instance}
                        jwt={jwt ?? ''}
                        onChanged={reload}
                    />
                </div>
            </div>
        </div>
    );
}

// ─── Baustein Content Router ─────────────────────────────────────────────────

function BausteinContent({
    bausteinKey, baustein, instance, jwt, onChanged,
}: {
    bausteinKey: string;
    baustein: ConceptBaustein | null;
    instance: ConceptInstance;
    jwt: string;
    onChanged: () => void;
}) {
    const t = useT();
    if (!baustein) {
        return <BausteinPlaceholder label={bausteinKey} />;
    }

    switch (bausteinKey) {
        case 'haltung':
            return <BausteinHaltung baustein={baustein} instanceId={instance.id} jwt={jwt} />;
        case 'analyse':
            return <BausteinAnalyse baustein={baustein} instance={instance} jwt={jwt} />;
        case 'praevention':
            return <BausteinKalender baustein={baustein} instance={instance} bausteinKey="praevention" label={t('concepts.concept_instance_view.praevention')} description="Massnahmenplan mit Fristen und Verantwortlichkeiten. Termine erscheinen im dedizierten Kalender-Layer." jwt={jwt} onChanged={onChanged} />;
        case 'intervention':
            return <BausteinIntervention baustein={baustein} instanceId={instance.id} jwt={jwt} />;
        case 'organisation':
            return <BausteinOrganisation baustein={baustein} instanceId={instance.id} jwt={jwt} />;
        case 'qualifizierung':
            return <BausteinKalender baustein={baustein} instance={instance} bausteinKey="qualifizierung" label={t('concepts.concept_instance_view.qualifizierung')} description="Schulungstermine und Fortbildungen. Zertifikate werden im DMS abgelegt." jwt={jwt} onChanged={onChanged} />;
        case 'kommunikation':
            return <BausteinKommunikation baustein={baustein} instanceId={instance.id} jwt={jwt} />;
        case 'dokumentation':
            return <BausteinDokumentation baustein={baustein} instanceId={instance.id} jwt={jwt} label={t('concepts.concept_instance_view.dokumentation')} />;
        case 'evaluation':
            return <BausteinEvaluation instanceId={instance.id} jwt={jwt} />;
        default:
            return <BausteinPlaceholder label={bausteinKey} />;
    }
}
