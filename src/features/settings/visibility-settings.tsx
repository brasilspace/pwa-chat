/**
 * VisibilitySettings — Rollen-Sichtbarkeitsmatrix.
 *
 * Admin konfiguriert welche Hubs und Space-Tabs fuer jede Rolle
 * sichtbar sind. Die Matrix wird als tenant_setting gespeichert.
 *
 * Wird in der UI nur gerendert wenn der Tenant mindestens 2 Rollen hat —
 * bei einer einzigen Rolle gibt es nichts zu unterscheiden.
 */

import { type JSX, useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const API_BASE = '/api/platform/v1';

interface VisibilityMatrix {
    [userType: string]: { [key: string]: boolean };
}

interface UserTypeInfo {
    key: string;
    label: string;
    contactVisibility: string;
}

// Reihenfolge + Labels strikt synchron zu app-sidebar.tsx WORLDS:
// Kontakte, Spaces, Aufgaben, Termine, Abläufe, Konzepte.
// (Favoriten und Mein Fach sind Quick-Access im Header, keine "Welten",
// und tauchen daher nicht in der Sichtbarkeits-Matrix auf.)
const ITEMS = [
    { key: 'hub_contacts', label: 'Kontakte', group: 'Hubs' },
    { key: 'hub_spaces', label: 'Spaces', group: 'Hubs' },
    { key: 'hub_my_tasks', label: 'Aufgaben', group: 'Hubs' },
    { key: 'hub_calendar', label: 'Termine', group: 'Hubs' },
    { key: 'hub_workflows', label: 'Abläufe', group: 'Hubs' },
    { key: 'hub_knowledge', label: 'Konzepte', group: 'Hubs' },
    { key: 'tab_chat', label: 'Chat', group: 'Space-Tabs' },
    { key: 'tab_files', label: 'Dateien', group: 'Space-Tabs' },
    { key: 'tab_tasks', label: 'Aufgaben', group: 'Space-Tabs' },
    { key: 'tab_calendar', label: 'Kalender', group: 'Space-Tabs' },
    { key: 'tab_letters', label: 'Briefe', group: 'Space-Tabs' },
    { key: 'tab_absence', label: 'Anwesenheit', group: 'Space-Tabs' },
    { key: 'tab_notebook', label: 'Mitteilungen', group: 'Space-Tabs' },
    { key: 'tab_activity', label: 'Aktivität', group: 'Space-Tabs' },
    { key: 'tab_info', label: 'Space-Info', group: 'Space-Tabs' },
];

const GROUPS = [...new Set(ITEMS.map(i => i.group))];

export function VisibilitySettings(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const isAdmin = session.permissions?.effectiveInstanceRole === 'ADMIN' || session.permissions?.effectiveInstanceRole === 'SUPERADMIN';

    const [matrix, setMatrix] = useState<VisibilityMatrix | null>(null);
    const [userTypes, setUserTypes] = useState<UserTypeInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!jwt) return;
        fetch(`${API_BASE}/settings/visibility-matrix`, { headers: { Authorization: `Bearer ${jwt}` } })
            .then(r => r.json())
            .then(d => {
                setMatrix(d.matrix ?? null);
                setUserTypes(d.userTypes ?? []);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [jwt]);

    const toggle = useCallback((userType: string, key: string) => {
        setMatrix(prev => {
            if (!prev) return prev;
            const updated = { ...prev };
            updated[userType] = { ...updated[userType], [key]: !updated[userType]?.[key] };
            return updated;
        });
        setSaved(false);
    }, []);

    const handleSave = useCallback(async () => {
        if (!jwt || !matrix) return;
        setSaving(true);
        try {
            await fetch(`${API_BASE}/settings/visibility-matrix`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ matrix }),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } finally { setSaving(false); }
    }, [jwt, matrix]);

    if (!isAdmin) return <></>;

    if (loading) return <div className="py-4 text-sm text-muted-foreground">{t('settings.visibility_settings.laden')}</div>;
    if (!matrix) return <></>;

    // Hebel 3: Bei nur einer Rolle macht die Matrix keinen Sinn — alle sehen
    // alles, weil alle dieselbe Rolle haben. Stattdessen einen Hinweis zeigen.
    if (userTypes.length < 2) {
        return (
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MaterialIcon name="grid_view" size={16} className="size-5" />
                    {t('settings.visibility_settings.sichtbarkeit_nach_rolle')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.visibility_settings.sobald_du_mindestens_zwei_rollen_hast_ka')}
                </p>
                <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    {t('settings.visibility_settings.aktuell_gibt_es')} {userTypes.length === 1 ? `nur die Rolle "${userTypes[0].label}"` : 'noch keine Rollen'}{t('settings.visibility_settings.lege_unter')} <em>{t('settings.visibility_settings.settings_mitglieder')}</em> {t('settings.visibility_settings.weitere_rollen_an')}
                </div>
            </div>
        );
    }

    return (
        <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <MaterialIcon name="grid_view" size={16} className="size-5" />
                {t('settings.visibility_settings.sichtbarkeit_nach_rolle')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
                {t('settings.visibility_settings.lege_fest_welche_bereiche_und_funktionen')}
            </p>

            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr>
                            <th className="text-left py-2 pr-4 text-muted-foreground font-medium">{t('settings.visibility_settings.bereich')}</th>
                            {userTypes.map(ut => (
                                <th key={ut.key} className="text-center px-3 py-2 font-medium">{ut.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {GROUPS.map(group => (
                            <>
                                <tr key={`group-${group}`}>
                                    <td colSpan={userTypes.length + 1}
                                        className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                                        {group}
                                    </td>
                                </tr>
                                {ITEMS.filter(i => i.group === group).map(item => (
                                    <tr key={item.key} className="hover:bg-muted/30">
                                        <td className="py-1.5 pr-4 text-sm">{item.label}</td>
                                        {userTypes.map(ut => {
                                            const checked = matrix[ut.key]?.[item.key] ?? false;
                                            return (
                                                <td key={ut.key} className="text-center px-3 py-1.5">
                                                    <button
                                                        onClick={() => toggle(ut.key, item.key)}
                                                        className={cn(
                                                            'mx-auto flex size-6 items-center justify-center rounded border-2 transition-colors',
                                                            checked ? 'border-primary bg-primary text-white' : 'border-border hover:border-primary/40'
                                                        )}
                                                    >
                                                        {checked && <MaterialIcon name="check" size={16} className="size-3.5" />}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <MaterialIcon name="save" size={16} className="size-4" />}
                    {t('settings.visibility_settings.speichern')}
                </button>
                {saved && <span className="text-sm text-emerald-600">{t('settings.visibility_settings.gespeichert')}</span>}
            </div>
        </div>
    );
}
