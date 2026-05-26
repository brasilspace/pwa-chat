/**
 * DmsTemplatesSettings — Vorlagen-Library als Settings-Seite (Admin).
 *
 * Zeigt alle als Vorlage markierten Documents, Kategorie-Bearbeitung,
 * Demarkierung. Anlegen erfolgt im DMS-Hub via "Als Vorlage markieren".
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useDmsTemplates, dmsTemplatesApi, type DmsTemplate } from './use-dms-templates';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function DmsTemplatesSettings(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const jwt = session.platform?.token;
    const { templates, loading, refresh } = useDmsTemplates();

    if (!isAdmin) {
        return <div className="p-6 text-sm text-muted-foreground">{t('dms.dms_templates_settings.nur_tenant-admins_koennen_vorlagen_verwa')}</div>;
    }

    // Gruppieren nach Kategorie
    const grouped = new Map<string, DmsTemplate[]>();
    for (const t of templates) {
        const cat = t.templateCategory ?? '— Allgemein —';
        const arr = grouped.get(cat) ?? [];
        arr.push(t);
        grouped.set(cat, arr);
    }

    const unmark = async (id: string) => {
        if (!jwt) return;
        if (!confirm('Vorlagen-Markierung entfernen?')) return;
        try {
            await dmsTemplatesApi.setTemplate(jwt, id, false);
            refresh();
        } catch (e) {
            alert('Fehler: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    const setCategory = async (id: string, current: string | null) => {
        if (!jwt) return;
        const cat = prompt('Kategorie (leer fuer keine):', current ?? '');
        if (cat === null) return;
        try {
            await dmsTemplatesApi.setTemplate(jwt, id, true, cat.trim() || null);
            refresh();
        } catch (e) {
            alert('Fehler: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    return (
        <div className="space-y-4 p-4">
            <div>
                <h1 className="flex items-center gap-2 text-xl font-semibold"><MaterialIcon name="star" size={16} className="size-5" /> {t('dms.dms_templates_settings.vorlagen-library')}</h1>
                <p className="text-xs text-muted-foreground">
                    {t('dms.dms_templates_settings.markiere_ein_dokument_als_vorlage_um_es_')}
                </p>
            </div>

            {loading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}

            {!loading && templates.length === 0 && (
                <div className="rounded border border-dashed border-border p-6 text-center">
                    <MaterialIcon name="folder_open" size={16} className="mx-auto mb-2 size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('dms.dms_templates_settings.noch_keine_vorlagen')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('dms.dms_templates_settings.im_dms-hub_kannst_du_jedes_dokument_als_')}</p>
                </div>
            )}

            {Array.from(grouped.entries()).map(([cat, items]) => (
                <div key={cat} className="space-y-2">
                    <h2 className="text-sm font-semibold text-muted-foreground">{cat}</h2>
                    <ul className="space-y-1">
                        {items.map(_t => (
                            <li key={_t.id} className="flex items-center gap-3 rounded border border-border bg-card p-3">
                                <MaterialIcon name="description" size={16} className="size-5 text-muted-foreground" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium">{_t.title}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {_t.mimeType} · {formatBytes(_t.sizeBytes)}
                                    </div>
                                    {_t.description && <div className="mt-0.5 text-xs text-muted-foreground">{_t.description}</div>}
                                </div>
                                <button onClick={() => setCategory(_t.id, _t.templateCategory)} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">
                                    {t('dms.dms_templates_settings.kategorie')}
                                </button>
                                <button onClick={() => unmark(_t.id)} title={t('dms.dms_templates_settings.vorlagen-markierung_entfernen')} className="rounded border border-border px-2 py-1 text-xs text-red-600 hover:bg-red-50 inline-flex items-center gap-1">
                                    <MaterialIcon name="star" size={16} fill={0} className="size-3.5" /> {t('dms.dms_templates_settings.entfernen')}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}
