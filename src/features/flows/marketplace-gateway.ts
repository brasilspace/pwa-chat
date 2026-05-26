/**
 * Marketplace-Gateway — Catalog-Endpoints fuer Flow-Store + spaeter App-Store.
 */

import { env } from '../../core/config/env';
import { requestJson } from '../../core/http/http-client';

export interface MarketplaceItem {
    id: string;
    itemType: 'flow' | 'app';
    slug: string;
    name: string;
    description: string | null;
    iconEmoji: string | null;
    category: string | null;
    vendorName: string;
    version: string;
    priceModel: 'flat-monthly' | 'per-active-user' | null;
    priceCents: number | null;
    screenshots: string[];
    publishedAt: string | null;
    installed: boolean;
    subscriptionId: string | null;
}

export interface InstallResponse {
    subscriptionId: string;
    templateId: string | null;
}

export function createMarketplaceGateway() {
    const base = env.platformBaseUrl;

    return {
        listItems(jwt: string, type?: 'flow' | 'app', category?: string) {
            const params = new URLSearchParams();
            if (type) params.set('type', type);
            if (category) params.set('category', category);
            const qs = params.toString();
            return requestJson<{ items: MarketplaceItem[] }>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/marketplace/items${qs ? '?' + qs : ''}`,
                method: 'GET', bearerToken: jwt,
            });
        },

        install(jwt: string, itemId: string) {
            return requestJson<InstallResponse>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/marketplace/items/${encodeURIComponent(itemId)}/install`,
                method: 'POST', bearerToken: jwt,
                body: JSON.stringify({}),
            });
        },

        listSubscriptions(jwt: string) {
            return requestJson<{ subscriptions: Array<{ id: string; itemId: string; status: string; installedAt: string; installedTemplateId: string | null; item: { name: string; itemType: string; iconEmoji: string | null; vendorName: string } }> }>({
                target: 'platform', baseUrl: base,
                path: '/platform/v1/marketplace/subscriptions',
                method: 'GET', bearerToken: jwt,
            });
        },

        uninstall(jwt: string, subscriptionId: string) {
            return requestJson<void>({
                target: 'platform', baseUrl: base,
                path: `/platform/v1/marketplace/subscriptions/${encodeURIComponent(subscriptionId)}`,
                method: 'DELETE', bearerToken: jwt,
            });
        },
    };
}

export const marketplaceGateway = createMarketplaceGateway();
