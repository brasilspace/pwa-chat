/**
 * ConceptsWorld — Sidebar-Panel fuer aktive Konzepte
 *
 * Zeigt eine Liste der aktiven Konzept-Instanzen im Sidebar-Panel.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, ShieldCheck, AlertTriangle, Monitor, HandMetal, Heart, Plus } from 'lucide-react';
import { sessionStore } from '../../core/session/session-store';
import { createConceptGateway, type ConceptInstance } from './concept-gateway';
import { useT } from "@/lib/i18n/use-t";

const gateway = createConceptGateway();

const ICON_MAP: Record<string, typeof BookOpen> = {
    ShieldCheck, AlertTriangle, Monitor, HandMetal, Heart, BookOpen,
};

export function ConceptsWorld() {
    const t = useT();
    const navigate = useNavigate();
    const location = useLocation();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [instances, setInstances] = useState<ConceptInstance[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        gateway.getInstances(jwt, 'active').then((res) => {
            setInstances(res.items);
            setLoading(false);
        }).catch(() => { });
    }, [jwt]);

    return (
        <div className="mb-2">
            <div className="mb-1 flex items-center justify-between px-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('concepts.concepts_world.konzepte')}</p>
            </div>
            {loading ? (
                <div className="space-y-1 px-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-9 animate-pulse rounded-lg bg-[var(--accent)]" />
                    ))}
                </div>
            ) : (
                <>
                    {instances.map((inst) => {
                        const Icon = ICON_MAP[inst.template?.icon ?? ''] ?? BookOpen;
                        const isActive = location.pathname === `/konzepte/${inst.id}`;

                        return (
                            <button
                                key={inst.id}
                                onClick={() => navigate(`/konzepte/${inst.id}`)}
                                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${isActive
                                        ? 'bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]'
                                        : 'text-[var(--foreground)] hover:bg-[var(--sidebar-accent)]'
                                    }`}
                            >
                                <Icon size={16} className="shrink-0" />
                                <span className="truncate">{inst.name}</span>
                            </button>
                        );
                    })}

                    {instances.length === 0 && (
                        <p className="px-2.5 py-3 text-xs text-[var(--muted-foreground)]">
                            {t('concepts.concepts_world.noch_keine_konzepte_aktiviert')}
                        </p>
                    )}

                    <button
                        onClick={() => navigate('/konzepte')}
                        className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--foreground)]"
                    >
                        <Plus size={14} />
                        {t('concepts.concepts_world.konzept_aktivieren')}
                    </button>
                </>
            )}
        </div>
    );
}
