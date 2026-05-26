/**
 * ConceptHub — Einstiegsseite fuer Konzepte
 *
 * Zeigt aktive Konzept-Instanzen und den Template-Katalog.
 * Desktop: Karten-Grid. Mobile: vertikale Liste.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ShieldCheck, ShieldAlert, Shield, AlertTriangle, Monitor, Heart, Plus, ChevronRight } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useIsMobile } from '../../core/responsive/use-is-mobile';
import { sessionStore } from '../../core/session/session-store';
import { createConceptGateway, type ConceptTemplate, type ConceptInstance } from './concept-gateway';
import { useT } from "@/lib/i18n/use-t";

const gateway = createConceptGateway();

const ICON_MAP: Record<string, typeof BookOpen> = {
    ShieldCheck, ShieldAlert, Shield, AlertTriangle, Monitor, Heart, BookOpen,
};

const CATEGORY_COLORS: Record<string, string> = {
    sicherheit: '#ef4444',
    paedagogik: '#3b82f6',
    organisation: '#f59e0b',
};

export function ConceptHub() {
    const t = useT();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [instances, setInstances] = useState<ConceptInstance[]>([]);
    const [templates, setTemplates] = useState<ConceptTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [activating, setActivating] = useState<string | null>(null);

    useEffect(() => {
        if (!jwt) return;
        const load = async () => {
            try {
                const [instRes, tmplRes] = await Promise.all([
                    gateway.getInstances(jwt, 'active'),
                    gateway.getTemplates(jwt),
                ]);
                setInstances(instRes.items);
                setTemplates(tmplRes.items);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [jwt]);

    const handleActivate = async (template: ConceptTemplate) => {
        if (!jwt || activating) return;
        setActivating(template.id);
        try {
            const res = await gateway.activateConcept(jwt, template.id);
            setInstances((prev) => [res.instance, ...prev]);
            navigate(`/konzepte/${res.instance.id}`);
        } finally {
            setActivating(null);
        }
    };

    const activeTemplateKeys = new Set(instances.map((i) => i.template?.key));
    const availableTemplates = templates.filter((_t) => !activeTemplateKeys.has(_t.key));

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center border-b px-4">
                <MaterialIcon name="menu_book" size={16} className="mr-2 size-4 text-muted-foreground" />
                <span className="text-lg font-semibold">{t('concepts.concept_hub.konzepte')}</span>
                <span className="text-xs text-muted-foreground ml-1">{instances.length}</span>
                <div className="flex-1" />
                {availableTemplates.length > 0 && (
                    <button
                        onClick={() => {
                            const section = document.getElementById('concept-templates');
                            section?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        title={t('concepts.concept_hub.neu')}
                        aria-label={t('concepts.concept_hub.neu')}
                        className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        <MaterialIcon name="add" size={18} />
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex flex-1 items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto space-y-8 p-6">
                    {/* ─── Active Instances ────────────────────────────────────── */}
                    {instances.length > 0 && (
                        <section>
                            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                                {t('concepts.concept_hub.aktive_konzepte')}
                            </h2>
                            <div className={isMobile ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-4 xl:grid-cols-3'}>
                                {instances.map((inst) => {
                                    const Icon = ICON_MAP[inst.template?.icon ?? ''] ?? BookOpen;
                                    const catColor = CATEGORY_COLORS[inst.template?.category ?? ''] ?? '#64748b';

                                    return (
                                        <button
                                            key={inst.id}
                                            onClick={() => navigate(`/konzepte/${inst.id}`)}
                                            className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-all hover:border-[var(--primary)] hover:shadow-md"
                                        >
                                            <div
                                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                                                style={{ backgroundColor: catColor + '15' }}
                                            >
                                                <Icon size={22} color={catColor} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-medium text-[var(--foreground)]">{inst.name}</p>
                                                <p className="text-xs text-[var(--muted-foreground)]">
                                                    {inst.template?.category ?? ''} {t('concepts.concept_hub.aktiv_seit')} {new Date(inst.activatedAt).toLocaleDateString('de-DE')}
                                                </p>
                                            </div>
                                            <ChevronRight size={18} className="shrink-0 text-[var(--muted-foreground)]" />
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ─── Template Catalog ────────────────────────────────────── */}
                    <section id="concept-templates">
                        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                            {instances.length > 0 ? 'Weitere Konzepte aktivieren' : 'Konzept-Vorlagen'}
                        </h2>
                        <div className={isMobile ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-4 xl:grid-cols-3'}>
                            {availableTemplates.map((tmpl) => {
                                const Icon = ICON_MAP[tmpl.icon ?? ''] ?? BookOpen;
                                const catColor = CATEGORY_COLORS[tmpl.category] ?? '#64748b';
                                const isActivating = activating === tmpl.id;

                                return (
                                    <div
                                        key={tmpl.id}
                                        className="flex flex-col rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div
                                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                                                style={{ backgroundColor: catColor + '10' }}
                                            >
                                                <Icon size={20} color={catColor} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-[var(--foreground)]">{tmpl.name}</p>
                                                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                                                    {tmpl.category}
                                                    {tmpl.monthlyPriceCents > 0
                                                        ? ` · ${(tmpl.monthlyPriceCents / 100).toFixed(0)} €/Monat`
                                                        : ' · Kostenlos'}
                                                </p>
                                            </div>
                                        </div>
                                        {tmpl.description && (
                                            <p className="mt-2 line-clamp-2 text-sm text-[var(--muted-foreground)]">
                                                {tmpl.description}
                                            </p>
                                        )}
                                        <button
                                            onClick={() => handleActivate(tmpl)}
                                            disabled={isActivating}
                                            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-white disabled:opacity-50"
                                        >
                                            <Plus size={14} />
                                            {isActivating ? 'Wird aktiviert...' : 'Aktivieren'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {availableTemplates.length === 0 && instances.length > 0 && (
                            <p className="text-sm text-[var(--muted-foreground)]">
                                {t('concepts.concept_hub.alle_verfuegbaren_konzepte_sind_bereits_')}
                            </p>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
