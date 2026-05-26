/**
 * InvitePage — Nutzer per Email einladen.
 *
 * Vollbild-Seite (kein Modal), funktioniert auf Desktop und Mobile.
 * Felder: Email (Pflicht), Name (optional), Nachricht (optional).
 * Nach Einladung: Einladungslink wird angezeigt + kopierbar.
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, QrCode } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { CreateStudentTab } from './create-student-tab';
import { cn } from '@/lib/utils';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { useT } from "@/lib/i18n/use-t";

const gateway = createPlatformGateway();

interface SentInvite {
    email: string;
    fullName: string;
    inviteUrl: string;
}

interface UserType {
    id: string;
    key: string;
    label: string;
}

export function InvitePage(): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [userTypeId, setUserTypeId] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
    const [userTypes, setUserTypes] = useState<UserType[]>([]);
    const [activeTab, setActiveTab] = useState<'email' | 'student'>('email');

    // UserTypes laden
    useEffect(() => {
        if (!jwt) return;
        fetch('/api/platform/v1/user-types', {
            headers: { Authorization: `Bearer ${jwt}` },
        })
            .then((r) => r.json())
            .then((d) => {
                const types = d.userTypes ?? d.items ?? [];
                setUserTypes(types);
                // Ersten als Default setzen
                if (types.length > 0 && !userTypeId) setUserTypeId(types[0].id);
            })
            .catch(() => { });
    }, [jwt]);

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const canSubmit = isValidEmail && !saving;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!jwt || !canSubmit) return;

        setSaving(true);
        setError('');

        try {
            const res = await gateway.createInvitation(jwt, {
                email: email.trim(),
                fullName: fullName.trim() || undefined,
                userTypeId: userTypeId || undefined,
                message: message.trim() || undefined,
            });

            setSentInvites((prev) => [{
                email: email.trim(),
                fullName: fullName.trim(),
                inviteUrl: res.invitation.inviteUrl,
            }, ...prev]);

            // Formular zuruecksetzen fuer naechste Einladung
            setEmail('');
            setFullName('');
            setMessage('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Einladung konnte nicht versendet werden.');
        } finally {
            setSaving(false);
        }
    }

    async function handleCopy(url: string) {
        try {
            await navigator.clipboard.writeText(url);
            setCopiedUrl(url);
            setTimeout(() => setCopiedUrl(null), 2000);
        } catch {
            // Fallback fuer aeltere Browser
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            setCopiedUrl(url);
            setTimeout(() => setCopiedUrl(null), 2000);
        }
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-3 border-b px-4">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    aria-label={t('invite.invite_page.zurueck')}
                >
                    <MaterialIcon name="arrow_back" size={16} className="size-4" />
                </button>
                <MaterialIcon name="person_add" size={16} className="size-4 text-muted-foreground" />
                <span className="text-lg font-semibold">{t('invite.invite_page.nutzer_einladen')}</span>
            </div>

            {/* Tabs */}
            <div className="flex border-b px-4">
                <button
                    onClick={() => setActiveTab('email')}
                    className={cn(
                        'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                        activeTab === 'email' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                >
                    <MaterialIcon name="mail" size={16} className="size-4" />
                    {t('invite.invite_page.per_email_einladen')}
                </button>
                <button
                    onClick={() => setActiveTab('student')}
                    className={cn(
                        'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                        activeTab === 'student' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                >
                    <QrCode className="size-4" />
                    {t('invite.invite_page.schueler_anlegen')}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-lg p-6">

                    {activeTab === 'student' ? (
                        <CreateStudentTab />
                    ) : (
                        <>
                            {/* Einladungsformular */}
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <p className="text-sm text-muted-foreground">
                                    {t('invite.invite_page.laden_sie_personen_per_e-mail_ein_sie_er')}
                                </p>

                                {/* Email */}
                                <div>
                                    <label htmlFor="invite-email" className="mb-1.5 block text-sm font-medium">
                                        {t('invite.invite_page.e-mail-adresse')}
                                    </label>
                                    <div className="relative">
                                        <MaterialIcon name="mail" size={16} className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            id="invite-email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder={t('invite.invite_page.namebeispielde')}
                                            autoFocus
                                            className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                        />
                                    </div>
                                </div>

                                {/* Name */}
                                <div>
                                    <label htmlFor="invite-name" className="mb-1.5 block text-sm font-medium">
                                        {t('invite.invite_page.name')} <span className="text-muted-foreground font-normal">{t('invite.invite_page.optional')}</span>
                                    </label>
                                    <input
                                        id="invite-name"
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder={t('invite.invite_page.vor-_und_nachname')}
                                        maxLength={255}
                                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </div>

                                {/* UserTyp */}
                                {userTypes.length > 0 && (
                                    <div>
                                        <label htmlFor="invite-type" className="mb-1.5 block text-sm font-medium">{t('invite.invite_page.rolle')}</label>
                                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(userTypes.length, 3)}, 1fr)` }}>
                                            {userTypes.map((ut) => (
                                                <button
                                                    key={ut.id}
                                                    type="button"
                                                    onClick={() => setUserTypeId(ut.id)}
                                                    className={`rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors ${userTypeId === ut.id
                                                            ? 'border-primary bg-primary/5 text-primary'
                                                            : 'border-border text-muted-foreground hover:border-muted-foreground/30'
                                                        }`}
                                                >
                                                    {ut.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Nachricht */}
                                <div>
                                    <label htmlFor="invite-msg" className="mb-1.5 block text-sm font-medium">
                                        {t('invite.invite_page.persoenliche_nachricht')} <span className="text-muted-foreground font-normal">{t('invite.invite_page.optional')}</span>
                                    </label>
                                    <textarea
                                        id="invite-msg"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder={t('invite.invite_page.hallo_ich_lade_dich_ein_unserem_team_bei')}
                                        rows={3}
                                        maxLength={500}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                                    />
                                </div>

                                {/* Error */}
                                {error && (
                                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                                )}

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                                >
                                    <MaterialIcon name="mail" size={16} className="size-4" />
                                    {saving ? 'Wird gesendet...' : 'Einladung senden'}
                                </button>
                            </form>

                            {/* Versendete Einladungen */}
                            {sentInvites.length > 0 && (
                                <div className="mt-8 space-y-3">
                                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                        {t('invite.invite_page.versendete_einladungen')}
                                    </h2>
                                    {sentInvites.map((invite, i) => (
                                        <div key={i} className="rounded-lg border border-border bg-card p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium truncate">
                                                        {invite.fullName || invite.email}
                                                    </p>
                                                    {invite.fullName && (
                                                        <p className="text-xs text-muted-foreground truncate">{invite.email}</p>
                                                    )}
                                                </div>
                                                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                    {t('invite.invite_page.gesendet')}
                                                </span>
                                            </div>
                                            <div className="mt-3 flex items-center gap-2">
                                                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-muted px-3 py-1.5">
                                                    <MaterialIcon name="link" size={16} className="size-3 shrink-0 text-muted-foreground" />
                                                    <span className="truncate text-xs text-muted-foreground">{invite.inviteUrl}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(invite.inviteUrl)}
                                                    className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                    title={t('invite.invite_page.link_kopieren')}
                                                >
                                                    {copiedUrl === invite.inviteUrl
                                                        ? <MaterialIcon name="check" size={16} className="size-3.5 text-emerald-500" />
                                                        : <MaterialIcon name="content_copy" size={16} className="size-3.5" />
                                                    }
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
