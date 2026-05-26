/**
 * Public-Guide-Page — oeffentlicher Player fuer eine Anleitung.
 *
 * Route: /g/:tenantSlug/:linkSlug (kein Login noetig).
 * Laedt components+edges+branding vom oeffentlichen Endpoint und
 * rendert den GuidePlayer.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { env } from '@/core/config/env';
import { GuidePlayer } from './guide-player';
import type { ProcessComponent, ProcessEdge } from './flows-gateway';
import { useT } from "@/lib/i18n/use-t";

interface PublicGuide {
    template: { id: string; name: string; description: string | null; appKind: string };
    components: ProcessComponent[];
    edges: ProcessEdge[];
    branding: Record<string, string> | null;
}

export function GuidePublicPage() {
    const t = useT();
    const { tenantSlug, linkSlug } = useParams<{ tenantSlug: string; linkSlug: string }>();
    const [data, setData] = useState<PublicGuide | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!tenantSlug || !linkSlug) return;
        const url = `${env.platformBaseUrl}/platform/v1/process/public/guides/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(linkSlug)}`;
        fetch(url)
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then((j: PublicGuide) => setData(j))
            .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, [tenantSlug, linkSlug]);

    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
                <div style={{ maxWidth: 480, textAlign: 'center' }}>
                    <h1 style={{ fontSize: 18, marginBottom: 8 }}>{t('flows.guide_public_page.anleitung_nicht_gefunden')}</h1>
                    <p style={{ color: '#64748b', fontSize: 14 }}>{t('flows.guide_public_page.dieser_link_existiert_nicht_oder_die_anl')}</p>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#64748b' }}>
                {t('flows.guide_public_page.lade')}
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: data.branding?.backgroundColor ?? '#0f172a' }}>
            <GuidePlayer
                components={data.components}
                edges={data.edges}
                branding={data.branding ?? undefined}
                testMode={true}
            />
        </div>
    );
}
