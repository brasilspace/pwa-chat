/**
 * WelcomeSettings — Willkommensnachrichten fuer Einladungen konfigurieren.
 *
 * Admin-only. Wird im Settings-Bereich angezeigt.
 * Texte werden in tenant_settings gespeichert und auf der
 * Registrierungsseite angezeigt.
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { Loader2, CheckCircle } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

export function WelcomeSettings(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [facilityName, setFacilityName] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [welcomeStaff, setWelcomeStaff] = useState('');
    const [welcomeParents, setWelcomeParents] = useState('');
    const [welcomeStudents, setWelcomeStudents] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        fetch('/api/platform/v1/settings/welcome', {
            headers: { Authorization: `Bearer ${jwt}` },
        })
            .then((r) => r.json())
            .then((d) => {
                if (d.success) {
                    setFacilityName(d.welcome.facilityName ?? '');
                    setContactPerson(d.welcome.contactPerson ?? '');
                    setWelcomeStaff(d.welcome.welcomeStaff ?? '');
                    setWelcomeParents(d.welcome.welcomeParents ?? '');
                    setWelcomeStudents(d.welcome.welcomeStudents ?? '');
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [jwt]);

    async function handleSave() {
        if (!jwt) return;
        setSaving(true);
        setSaved(false);
        try {
            await fetch('/api/platform/v1/settings/welcome', {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    facilityName,
                    contactPerson,
                    welcomeStaff,
                    welcomeParents,
                    welcomeStudents,
                }),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch {
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <MaterialIcon name="apartment" size={16} className="size-5 text-muted-foreground" />
                <div>
                    <h3 className="text-sm font-semibold">{t('settings.welcome_settings.einrichtung_willkommensnachrichten')}</h3>
                    <p className="text-xs text-muted-foreground">{t('settings.welcome_settings.diese_texte_sehen_eingeladene_personen_a')}</p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="mb-1.5 block text-sm font-medium">{t('settings.welcome_settings.name_der_einrichtung')}</label>
                    <input
                        type="text"
                        value={facilityName}
                        onChange={(e) => setFacilityName(e.target.value)}
                        placeholder={t('settings.welcome_settings.zb_grundschule_am_see')}
                        maxLength={255}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium">{t('settings.welcome_settings.ansprechpartner')}</label>
                    <input
                        type="text"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        placeholder={t('settings.welcome_settings.zb_frau_weber_schulleiterin')}
                        maxLength={255}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium">
                        {t('settings.welcome_settings.willkommenstext_mitarbeiter')}
                    </label>
                    <textarea
                        value={welcomeStaff}
                        onChange={(e) => setWelcomeStaff(e.target.value)}
                        placeholder={t('settings.welcome_settings.dieser_text_wird_mitarbeitern_auf_der_re')}
                        rows={3}
                        maxLength={1000}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium">
                        {t('settings.welcome_settings.willkommenstext_eltern')}
                    </label>
                    <textarea
                        value={welcomeParents}
                        onChange={(e) => setWelcomeParents(e.target.value)}
                        placeholder={t('settings.welcome_settings.dieser_text_wird_eltern_auf_der_registri')}
                        rows={3}
                        maxLength={1000}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-sm font-medium">
                        {t('settings.welcome_settings.willkommenstext_betreute_schueler')}
                    </label>
                    <textarea
                        value={welcomeStudents}
                        onChange={(e) => setWelcomeStudents(e.target.value)}
                        placeholder={t('settings.welcome_settings.dieser_text_wird_schuelernbetreuten_auf_')}
                        rows={3}
                        maxLength={1000}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                </div>
            </div>

            <button
                onClick={handleSave}
                disabled={saving}
                className="flex h-10 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
                {saving ? (
                    <><Loader2 className="size-4 animate-spin" /> {t('settings.welcome_settings.speichern')}</>
                ) : saved ? (
                    <><CheckCircle className="size-4" /> {t('settings.welcome_settings.gespeichert')}</>
                ) : (
                    <><MaterialIcon name="save" size={16} className="size-4" /> {t('settings.welcome_settings.speichern')}</>
                )}
            </button>
        </div>
    );
}
