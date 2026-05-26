/**
 * DmsEmailAliasSettings — Persoenliche DMS-Email-Adresse aktivieren / rotieren.
 *
 * dms-<slug>@mail.prilog.chat → eingehende Mails landen in Mein Fach.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useDmsEmailAlias, dmsEmailAliasApi } from './use-dms-email-alias';
import { Mail, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

export function DmsEmailAliasSettings(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { alias, loading, refresh } = useDmsEmailAlias();
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const enable = async () => {
        if (!jwt) return;
        setBusy(true);
        try { await dmsEmailAliasApi.enable(jwt); refresh(); }
        catch (e) { alert('Fehler: ' + (e instanceof Error ? e.message : String(e))); }
        finally { setBusy(false); }
    };

    const disable = async () => {
        if (!jwt) return;
        if (!confirm('DMS-Email-Adresse deaktivieren? Eingehende Mails werden ignoriert.')) return;
        setBusy(true);
        try { await dmsEmailAliasApi.disable(jwt); refresh(); }
        catch (e) { alert('Fehler: ' + (e instanceof Error ? e.message : String(e))); }
        finally { setBusy(false); }
    };

    const rotate = async () => {
        if (!jwt) return;
        if (!confirm('Wirklich rotieren? Alte Adresse wird sofort ungueltig.')) return;
        setBusy(true);
        try { await dmsEmailAliasApi.rotate(jwt); refresh(); }
        catch (e) { alert('Fehler: ' + (e instanceof Error ? e.message : String(e))); }
        finally { setBusy(false); }
    };

    const copy = () => {
        if (!alias) return;
        navigator.clipboard.writeText(alias.fullAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="space-y-4 p-4">
            <div>
                <h1 className="flex items-center gap-2 text-xl font-semibold"><MaterialIcon name="mail" size={16} className="size-5" /> {t('dms.dms_email_alias_settings.mein_fach_per_e-mail')}</h1>
                <p className="text-xs text-muted-foreground">
                    {t('dms.dms_email_alias_settings.schick_anhaenge_per_mail_an_deine_persoe')}
                </p>
            </div>

            {loading && <div className="flex justify-center py-4"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}

            {!loading && !alias && (
                <div className="rounded border border-dashed border-border p-6 text-center">
                    <MaterialIcon name="mail" size={16} className="mx-auto mb-2 size-8 text-muted-foreground" />
                    <p className="mb-3 text-sm">{t('dms.dms_email_alias_settings.noch_nicht_aktiviert')}</p>
                    <button
                        onClick={enable}
                        disabled={busy}
                        className="rounded bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                        {busy ? <Loader2 className="size-3 animate-spin" /> : <MaterialIcon name="power_settings_new" size={16} className="size-3" />}
                        {t('dms.dms_email_alias_settings.adresse_generieren')}
                    </button>
                </div>
            )}

            {!loading && alias && (
                <div className="rounded border border-border bg-card p-4 space-y-3">
                    <div>
                        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t('dms.dms_email_alias_settings.deine_adresse')}</label>
                        <div className="mt-1 flex items-center gap-2">
                            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">{alias.fullAddress}</code>
                            <button onClick={copy} title={t('dms.dms_email_alias_settings.kopieren')} className="rounded border border-border p-2 hover:bg-muted">
                                {copied ? <MaterialIcon name="check" size={16} className="size-4 text-emerald-600" /> : <MaterialIcon name="content_copy" size={16} className="size-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <span className="text-muted-foreground">{t('dms.dms_email_alias_settings.status')}</span>{' '}
                            {alias.enabled ? (
                                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">{t('dms.dms_email_alias_settings.aktiv')}</span>
                            ) : (
                                <span className="rounded bg-zinc-500/20 px-2 py-0.5 text-zinc-700 dark:text-zinc-300">{t('dms.dms_email_alias_settings.deaktiviert')}</span>
                            )}
                        </div>
                        {alias.lastReceivedAt && (
                            <div>
                                <span className="text-muted-foreground">{t('dms.dms_email_alias_settings.letzte_mail')}</span>{' '}
                                {new Date(alias.lastReceivedAt).toLocaleString('de-DE')}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border">
                        {alias.enabled ? (
                            <button
                                onClick={disable}
                                disabled={busy}
                                className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
                            >
                                <MaterialIcon name="power_settings_new" size={16} className="size-3" /> {t('dms.dms_email_alias_settings.deaktivieren')}
                            </button>
                        ) : (
                            <button
                                onClick={enable}
                                disabled={busy}
                                className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1"
                            >
                                <MaterialIcon name="power_settings_new" size={16} className="size-3" /> {t('dms.dms_email_alias_settings.aktivieren')}
                            </button>
                        )}
                        <button
                            onClick={rotate}
                            disabled={busy}
                            className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
                            title={t('dms.dms_email_alias_settings.neue_adresse_generieren_alte_wird_unguel')}
                        >
                            <MaterialIcon name="refresh" size={16} className="size-3" /> {t('dms.dms_email_alias_settings.rotieren')}
                        </button>
                    </div>

                    <div className="rounded bg-muted/30 p-3 text-[11px] text-muted-foreground">
                        <strong>{t('dms.dms_email_alias_settings.tipp')}</strong> {t('dms.dms_email_alias_settings.speichere_die_adresse_als_kontakt_mein_f')}
                    </div>
                </div>
            )}
        </div>
    );
}
