/**
 * WelcomeFreemiumModal — Einmaliger Hinweis nach erstem Login.
 *
 * Erklaert das Freemium-Modell (90 Tage gratis, dann Hide-Filter, Abo macht
 * alles wieder sichtbar). Wird mit localStorage-Flag unterdrueckt nach
 * Bestaetigung.
 */
import { useEffect, useState, type JSX } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useNavigate } from 'react-router-dom';
import { useT } from "@/lib/i18n/use-t";

const STORAGE_KEY = 'prilog-freemium-welcome-shown-v1';

export function WelcomeFreemiumModal(): JSX.Element | null {
    const t = useT();
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (localStorage.getItem(STORAGE_KEY) !== 'true') {
            // Etwas Verzoegerung damit nicht direkt mit dem Layout konkurriert
            const t = setTimeout(() => setOpen(true), 800);
            return () => clearTimeout(t);
        }
    }, []);

    const dismiss = () => {
        localStorage.setItem(STORAGE_KEY, 'true');
        setOpen(false);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
                <div className="flex items-start justify-between">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                        <MaterialIcon name="auto_awesome" size={16} className="size-5 text-primary" />
                    </div>
                    <button onClick={dismiss} className="rounded-md p-1 hover:bg-muted">
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>
                </div>

                <h2 className="mt-4 text-xl font-semibold">{t('subscription.welcome_freemium_modal.willkommen_bei_prilog')}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    {t('subscription.welcome_freemium_modal.du_kannst_alles')} <strong>{t('subscription.welcome_freemium_modal.90_tage_gratis')}</strong> {t('subscription.welcome_freemium_modal.testen_keine_karte_noetig')}
                </p>

                <ul className="mt-4 space-y-2 text-sm">
                    <li className="flex gap-2">
                        <span className="text-primary">✓</span>
                        <span>{t('subscription.welcome_freemium_modal.alle_funktionen_frei_nutzbar')}</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-primary">✓</span>
                        <span>{t('subscription.welcome_freemium_modal.nach_90_tagen_werden_inhalte_aelter_90_t')} <em>ausgeblendet</em> {t('subscription.welcome_freemium_modal.nie_geloescht')}</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-primary">✓</span>
                        <span>{t('subscription.welcome_freemium_modal.mit_abo_3_eur_pro_aktivem_usermonat_sofo')}</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-primary">✓</span>
                        <span>{t('subscription.welcome_freemium_modal.inaktive_user_werden_gutgeschrieben_du_z')}</span>
                    </li>
                </ul>

                <div className="mt-6 flex gap-2">
                    <button
                        onClick={() => { dismiss(); navigate('/settings/rechnungen'); }}
                        className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        {t('subscription.welcome_freemium_modal.mehr_erfahren')}
                    </button>
                    <button
                        onClick={dismiss}
                        className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                    >
                        {t('subscription.welcome_freemium_modal.verstanden')}
                    </button>
                </div>
            </div>
        </div>
    );
}
