import { type JSX, useCallback, useEffect, useSyncExternalStore, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createMatrixGateway } from '@/gateways/matrix/matrix-gateway';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import type { SpaceItem, SpaceMember } from '@/gateways/platform/platform-types';
import { useContacts } from '@/features/contacts/use-contacts';
import { useSpaceCan, useModule } from '@/core/permissions';
import { spaceFavorites } from './space-favorites';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UserAvatar } from '@/components/ui/user-avatar';
import { MaterialIcon } from '@/components/ui/material-icon';
import { ActivityHeatmap } from './panels/activity-heatmap';
import { SpaceCalendarCard } from './space-calendar-card';
import { CsvImportModal } from '@/features/contacts/external/csv-import-modal';
import { logger } from '@/core/logging/logger';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';
import { useT } from "@/lib/i18n/use-t";

const matrixGateway = createMatrixGateway();
const platformGateway = createPlatformGateway();

interface SpaceInfoPanelProps {
    space: SpaceItem;
}

export function SpaceInfoPanel({ space }: SpaceInfoPanelProps): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const favorites = useSyncExternalStore(spaceFavorites.subscribe, spaceFavorites.get);
    const isFav = favorites.has(space.id);
    const navigate = useNavigate();
    const [leaving, setLeaving] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const hasActivityHeatmap = useModule('activity-heatmap' as any);

    const handleToggleFavorite = useCallback(() => {
        spaceFavorites.toggle(space.id);
    }, [space.id]);

    const handleLeave = useCallback(async () => {
        const token = session.matrix?.accessToken;
        const roomId = space.matrixChatRoomId ?? space.matrixRoomId;
        if (!token || !roomId) return;

        setLeaving(true);
        try {
            await matrixGateway.leaveRoom(token, roomId);
            navigate('/');
        } catch {
            setLeaving(false);
            setConfirmLeave(false);
        }
    }, [session.matrix?.accessToken, space, navigate]);

    return (
        <div className="flex h-full flex-col">
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-5">

                    {/* Name + Badges (klickbar zum Bearbeiten) */}
                    <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <EditableSpaceName spaceId={space.id} initialName={space.name} />
                            {space.internalName && space.internalName !== space.name && (
                                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <MaterialIcon name="lock" size={12} className="size-3" />
                                    {t('spaces.space_info.dauerhaft')} <strong className="font-mono">{space.internalName}</strong>
                                </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {space.type}
                                </span>
                                <span className={cn(
                                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium',
                                    space.visibility === 'PUBLIC'
                                        ? 'bg-emerald-500/10 text-emerald-600'
                                        : 'bg-amber-500/10 text-amber-600',
                                )}>
                                    {space.visibility === 'PUBLIC' ? <MaterialIcon name="public" size={14} /> : <MaterialIcon name="visibility_off" size={14} />}
                                    {space.visibility === 'PUBLIC' ? 'Oeffentlich' : 'Privat'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Description (klickbar zum Bearbeiten) */}
                    <EditableSpaceDescription spaceId={space.id} initialDescription={space.description} />

                    {/* Vertretung-App (nur sichtbar wenn Modul aktiv) */}
                    <VertretungControl space={space} />

                    {/* Space Color */}
                    {!space.parentSpaceId && (
                        <SpaceColorPicker spaceId={space.id} currentColor={space.color} />
                    )}

                    {/* Space Mode (Chat / Infotafel / Deaktiviert) */}
                    <SpaceModeSection space={space} />

                    {/* Tab-Konfiguration */}
                    <SpaceTabsConfig space={space} />

                    {/* Zutritt & Benutzertypen (Portal-Abbau: Space-Governance) */}
                    <SpaceAccessPolicy space={space} />

                    {/* Activity Heatmap — nur wenn Modul aktiv */}
                    {hasActivityHeatmap && (
                        <>
                            <div>
                                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    <MaterialIcon name="monitor_heart" size={14} />
                                    {t('spaces.space_info.aktivitaet')}
                                </h4>
                                <ActivityHeatmap spaceId={space.id} />
                            </div>

                            <Separator />
                        </>
                    )}

                    {/* Members */}
                    <SpaceMembersList space={space} />

                    {/* Encryption */}
                    <InfoRow icon="lock" label={t('spaces.space_info.verschluesselung')} value="Nicht aktiviert" muted />

                    <Separator />

                    {/* Actions */}
                    <div className="space-y-1">
                        <ActionButton
                            icon="star"
                            label={isFav ? 'Favorit entfernen' : 'Zu Favoriten hinzufuegen'}
                            onClick={handleToggleFavorite}
                            active={isFav}
                        />
                        <ActionButton
                            icon="notifications"
                            label={t('spaces.space_info.benachrichtigungen')}
                            onClick={() => { }}
                            disabled
                            hint="Kommt bald"
                        />
                        <ActionButton
                            icon="storage"
                            label={t('spaces.space_info.speicher')}
                            onClick={() => { }}
                            disabled
                            hint="Kommt bald"
                        />
                        <ActionButton
                            icon="schedule"
                            label={t('spaces.space_info.automatische_loeschung')}
                            onClick={() => { }}
                            disabled
                            hint="Kommt bald"
                        />
                    </div>

                    <Separator />

                    {/* Space-Kalender (idempotent aktivieren) */}
                    <SpaceCalendarCard spaceId={space.id} />

                    <Separator />

                    {/* Space-ID (fuer Workflow-Konfiguration) */}
                    <SpaceIdDisplay spaceId={space.id} matrixRoomId={space.matrixRoomId} matrixChatRoomId={space.matrixChatRoomId} />

                    <Separator />

                    {/* Leave */}
                    {!confirmLeave ? (
                        <button
                            onClick={() => setConfirmLeave(true)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                        >
                            <MaterialIcon name="logout" size={16} />
                            {t('spaces.space_info.space_verlassen')}
                        </button>
                    ) : (
                        <div className="rounded-lg border border-destructive/30 p-3 space-y-2">
                            <p className="text-xs text-muted-foreground">{t('spaces.space_info.moechtest_du_diesen_space_wirklich_verla')}</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setConfirmLeave(false)}
                                    className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                                >
                                    {t('spaces.space_info.abbrechen')}
                                </button>
                                <button
                                    onClick={handleLeave}
                                    disabled={leaving}
                                    className="flex-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                                >
                                    {leaving ? 'Wird verlassen...' : 'Verlassen'}
                                </button>
                            </div>
                        </div>
                    )}

                    <ArchiveSpaceSection space={space} />
                </div>
            </ScrollArea>
        </div>
    );
}

function ArchiveSpaceSection({ space }: { space: SpaceItem }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token ?? '';
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);

    async function archive() {
        if (!confirm('Diesen Space archivieren?\n\nEs wird ein Archiv-Paket (Markdown) zum Download bereitgestellt mit allen Mitgliedern, E-Mails, Dokument-Liste, Aufgaben und Kalender-Einträgen. Anschliessend wird der Space inaktiv markiert und die E-Mail-Adresse deaktiviert.')) return;
        setBusy(true);
        try {
            const exp = await requestJson<{ downloadUrl: string }>({
                target: 'platform', baseUrl: env.platformBaseUrl,
                path: `/platform/v1/spaces/${space.id}/archive/export`,
                method: 'POST', bearerToken: jwt, body: '{}',
            });
            const a = document.createElement('a');
            a.href = exp.downloadUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.click();
            if (confirm('Archiv heruntergeladen?\n\nWenn ja: Soft-Delete des Spaces durchführen.\nDer Space wird inaktiv markiert. Dokumente bleiben für 90 Tage in MinIO erhalten (DSGVO-Frist), dann automatischer Cleanup.\n\nFortfahren?')) {
                await requestJson({
                    target: 'platform', baseUrl: env.platformBaseUrl,
                    path: `/platform/v1/spaces/${space.id}/archive/commit`,
                    method: 'POST', bearerToken: jwt, body: '{}',
                });
                navigate('/');
            }
        } catch (e) {
            logger.error('Archivierung fehlgeschlagen', { error: e });
            alert('Archivierung fehlgeschlagen. Details in der Konsole.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-12 border-t pt-6">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('spaces.space_info.space_abschliessen')}
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
                {t('spaces.space_info.wenn_das_projekt_zu_ende_ist_kannst_du_d')}
            </p>
            <button
                type="button"
                onClick={archive}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400"
            >
                <MaterialIcon name="archive" size={16} />
                {busy ? 'Wird archiviert …' : 'Space archivieren'}
            </button>
            <button
                type="button"
                onClick={async () => {
                    if (!confirm(`"${space.name}" endgültig löschen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden. Alle Nachrichten, Dateien und Aufgaben gehen verloren.`)) return;
                    if (!confirm('Bist du sicher? Letzte Chance.')) return;
                    setBusy(true);
                    try {
                        await requestJson({
                            target: 'platform', baseUrl: env.platformBaseUrl,
                            path: `/platform/v1/spaces/${space.id}`,
                            method: 'DELETE', bearerToken: jwt,
                        });
                        navigate('/');
                    } catch (e) {
                        logger.error(t('common.delete_failed'), { error: e });
                        alert(t('common.delete_failed'));
                    } finally {
                        setBusy(false);
                    }
                }}
                disabled={busy}
                className="ml-2 inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
            >
                <MaterialIcon name="close" size={16} />
                {t('spaces.space_info.space_loeschen')}
            </button>
        </div>
    );
}

function hashHue(label: string): number {
    let hash = 0;
    for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
    return hash % 360;
}

function SpaceMembersList({ space }: { space: SpaceItem }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const canInvite = useSpaceCan(space.id, 'member:invite');
    const canRemove = useSpaceCan(space.id, 'member:remove');
    const { contacts } = useContacts();
    const [members, setMembers] = useState<SpaceMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<Set<string>>(new Set());
    const [typeFilter, setTypeFilter] = useState<string | null>(null);
    const [showImport, setShowImport] = useState(false);

    const load = useCallback(() => {
        const jwt = session.platform?.token;
        if (!jwt) return;
        platformGateway.getSpaceMembers(jwt, space.id)
            .then((res) => setMembers(res.items))
            .catch((err) => logger.error('Failed to load space members', { error: err }))
            .finally(() => setLoading(false));
    }, [session.platform?.token, space.id]);

    useEffect(() => { load(); }, [load]);

    const memberUserIds = new Set(members.map((m) => m.userId));

    const handleToggle = useCallback(async (userId: string) => {
        const jwt = session.platform?.token;
        if (!jwt || busy.has(userId)) return;
        setBusy((prev) => new Set(prev).add(userId));
        try {
            if (memberUserIds.has(userId)) {
                await platformGateway.removeSpaceMember(jwt, space.id, userId);
            } else {
                await platformGateway.addSpaceMember(jwt, space.id, userId);
            }
            load();
        } catch (err) {
            logger.error('Failed to toggle space member', { error: err });
        } finally {
            setBusy((prev) => { const next = new Set(prev); next.delete(userId); return next; });
        }
    }, [session.platform?.token, space.id, busy, memberUserIds, load]);

    const handleRemove = useCallback(async (userId: string) => {
        const jwt = session.platform?.token;
        if (!jwt || busy.has(userId)) return;
        setBusy((prev) => new Set(prev).add(userId));
        try {
            await platformGateway.removeSpaceMember(jwt, space.id, userId);
            load();
        } catch (err) {
            logger.error('Failed to remove space member', { error: err });
        } finally {
            setBusy((prev) => { const next = new Set(prev); next.delete(userId); return next; });
        }
    }, [session.platform?.token, space.id, busy, load]);

    // Benutzertypen aus dem Space (policy-basiert) und aus den Kontakten
    const spaceUserTypes = space.userTypes ?? [];
    const allUserTypes = (() => {
        const seen = new Map<string, { key: string; label: string }>();
        for (const ut of spaceUserTypes) seen.set(ut.key, ut);
        return Array.from(seen.values());
    })();

    // ── Zentrale Sichtbarkeitsregel (eine Quelle für Picker, Admin-
    //    Liste und Lese-Ansicht). Abgrenzung über die Space-Benutzertyp-
    //    Policy via STABILE Schlüssel (Labels sind tenant-variabel!),
    //    Fallback über die stabile `audience`. Datenschutz: in
    //    Mitarbeiter-Spaces tauchen Schüler/Eltern nicht in den Infos auf.
    const spaceTypeKeys = new Set(spaceUserTypes.map((ut) => ut.key));
    const contactAllowed = (c: { userTypeKey?: string | null; audience?: string }): boolean => {
        if (spaceTypeKeys.size > 0) {
            // Space hat eine Benutzertyp-Policy → nur passende Typen.
            if (c.userTypeKey) return spaceTypeKeys.has(c.userTypeKey);
            return c.audience === 'staff'; // ohne Key defensiv: nur Personal
        }
        // Keine Policy konfiguriert → Default „nur Mitarbeiter".
        return c.audience === 'staff';
    };
    /** Mitglied in den Infos listbar? Unbekannte (kein Verzeichnis-
     *  Eintrag, z.B. System/Admin-Konto) bleiben sichtbar. */
    const memberAllowed = (userId: string): boolean => {
        const c = contacts.find((x) => x.id === userId);
        return c ? contactAllowed(c) : true;
    };

    const potentialContacts = contacts.filter(contactAllowed);

    // Nach Benutzertyp filtern
    const filteredContacts = typeFilter
        ? potentialContacts.filter((c) => c.userType === typeFilter)
        : potentialContacts;

    const sortedContacts = [...filteredContacts].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'de'),
    );

    // Mitglieder die nicht in den Kontakten sind (z.B. Admins) — und
    // die zur Space-Policy passen (kein Schüler-Leak über diesen Pfad).
    const extraMembers = members
        .filter((m) => !contacts.some((c) => c.id === m.userId) && memberAllowed(m.userId))
        .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName, 'de'));

    return (
        <div>
            <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <MaterialIcon name="groups" size={14} />
                    {t('spaces.space_info.mitglieder')}{members.length})
                </h4>
                {canInvite && (
                    <button onClick={() => setShowImport(true)}
                        className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                        title={`Mitglieder per CSV in "${space.name}" importieren`}>
                        <MaterialIcon name="upload_file" size={12} className="size-3" />
                        {t('spaces.space_info.csv-import')}
                    </button>
                )}
            </div>
            {showImport && (
                <CsvImportModal
                    onClose={() => setShowImport(false)}
                    onDone={() => { setShowImport(false); load(); }}
                    defaultSpaceId={space.id}
                />
            )}

            {/* Benutzertyp-Filter-Chips */}
            {allUserTypes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                    <button
                        type="button"
                        onClick={() => setTypeFilter(null)}
                        className={cn(
                            'rounded-full px-2 py-0.5 text-[0.6rem] font-medium transition-all duration-150',
                            typeFilter === null
                                ? 'bg-foreground text-background shadow-sm'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80',
                        )}
                    >
                        {t('spaces.space_info.alle')}
                    </button>
                    {allUserTypes.map((ut) => {
                        const hue = hashHue(ut.label);
                        const isActive = typeFilter === ut.label;
                        return (
                            <button
                                key={ut.key}
                                type="button"
                                onClick={() => setTypeFilter(isActive ? null : ut.label)}
                                className={cn(
                                    'rounded-full px-2 py-0.5 text-[0.6rem] font-medium text-white transition-all duration-150',
                                    isActive
                                        ? 'ring-1 ring-offset-1 ring-offset-background shadow-sm'
                                        : 'opacity-60 hover:opacity-100',
                                )}
                                style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
                            >
                                {ut.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {loading && <p className="mt-2 text-sm text-muted-foreground">{t('spaces.space_info.laden')}</p>}

            {/* Kontaktliste mit Checkboxen */}
            {!loading && (canInvite || canRemove) && (
                <div className="mt-2 space-y-0.5">
                    {sortedContacts.map((contact) => {
                        const isMember = memberUserIds.has(contact.id);
                        const isBusy = busy.has(contact.id);
                        const member = members.find((m) => m.userId === contact.id);
                        const isAdmin = member?.role === 'ADMIN';
                        const hue = contact.userType ? hashHue(contact.userType) : null;
                        return (
                            <div key={contact.id} className="group flex items-center gap-2 rounded-lg px-1 py-1">
                                {/* Checkbox */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isAdmin) return;
                                        if (isMember && canRemove) handleToggle(contact.id);
                                        else if (!isMember && canInvite) handleToggle(contact.id);
                                    }}
                                    disabled={isBusy || isAdmin}
                                    className={cn(
                                        'inline-flex size-4 shrink-0 items-center justify-center rounded border transition-all duration-150',
                                        isMember
                                            ? 'border-transparent text-white'
                                            : 'border-border/80 bg-background',
                                        isBusy && 'opacity-50',
                                        isAdmin && 'cursor-default',
                                    )}
                                    style={isMember && hue !== null
                                        ? { backgroundColor: `hsl(${hue} 55% 45%)` }
                                        : isMember
                                            ? { backgroundColor: 'hsl(var(--primary))' }
                                            : hue !== null
                                                ? { borderColor: `hsl(${hue} 30% 70%)` }
                                                : undefined
                                    }
                                >
                                    {isMember && <MaterialIcon name="check" size={12} />}
                                </button>
                                <UserAvatar displayName={contact.displayName} size="sm" />
                                <span className="truncate flex-1 text-sm">{contact.displayName}</span>
                                {/* Papierkorb zum Entfernen */}
                                {isMember && !isAdmin && canRemove && (
                                    <button
                                        onClick={() => handleRemove(contact.id)}
                                        disabled={isBusy}
                                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive disabled:opacity-50"
                                    >
                                        <MaterialIcon name="delete" size={14} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {/* Extra-Mitglieder (nicht in Kontakten) */}
                    {extraMembers.map((member) => (
                        <div key={member.userId} className="group flex items-center gap-2 rounded-lg px-1 py-1">
                            <div className="inline-flex size-4 shrink-0 items-center justify-center rounded border border-transparent bg-primary text-white">
                                <MaterialIcon name="check" size={12} />
                            </div>
                            <UserAvatar displayName={member.user.displayName} size="sm" />
                            <span className="truncate flex-1 text-sm">{member.user.displayName}</span>
                            {member.role !== 'ADMIN' && canRemove && (
                                <button
                                    onClick={() => handleRemove(member.userId)}
                                    disabled={busy.has(member.userId)}
                                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive disabled:opacity-50"
                                >
                                    <MaterialIcon name="delete" size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                    {sortedContacts.length === 0 && extraMembers.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">{t('spaces.space_info.keine_passenden_kontakte')}</p>
                    )}
                </div>
            )}

            {/* Nur-Lesen Ansicht wenn keine Berechtigungen.
                Zentrale Sichtbarkeitsregel: in Mitarbeiter-Spaces keine
                Schüler/Eltern listen (Datenschutz). */}
            {!loading && !canInvite && !canRemove && (() => {
                const visible = members
                    .filter((m) => memberAllowed(m.userId))
                    .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
                return (
                    <div className="mt-2 space-y-0.5">
                        {visible.map((member) => (
                            <div key={member.userId} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                                <UserAvatar displayName={member.user.displayName} size="sm" />
                                <span className="truncate flex-1 text-sm">{member.user.displayName}</span>
                            </div>
                        ))}
                        {visible.length === 0 && (
                            <p className="text-sm text-muted-foreground italic">{t('spaces.space_info.keine_mitglieder')}</p>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}

function InfoRow({ icon, label, value, muted }: { icon: string; label: string; value: string; muted?: boolean }) {
    return (
        <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2.5 text-sm">
                <MaterialIcon name={icon} size={16} className="text-muted-foreground" />
                <span>{label}</span>
            </div>
            <span className={cn('text-sm', muted ? 'text-muted-foreground' : 'font-medium')}>{value}</span>
        </div>
    );
}

function ActionButton({ icon, label, onClick, active, disabled, hint }: {
    icon: string;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    hint?: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                disabled
                    ? 'text-muted-foreground/50 cursor-not-allowed'
                    : 'text-foreground hover:bg-muted',
                active && 'text-amber-500',
            )}
        >
            <MaterialIcon name={icon} size={16} fill={active ? 1 : 0} />
            <span className="flex-1 text-left">{label}</span>
            {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
        </button>
    );
}

// --- Space Color Picker (root spaces only) ---

const PRESET_COLORS = [
    '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e',
    '#06b6d4', '#ec4899', '#14b8a6', '#6366f1', '#f97316',
    '#84cc16', '#a855f7', '#ef4444', '#0ea5e9', '#d946ef',
];

// --- Space Mode Section: Chat vs. Infotafel ---
//
// Erlaubt Space-Admins, einen Space zwischen "Chat" (bidirektional) und
// "Infotafel" (nur Mitarbeiter senden) umzuschalten. Im Infotafel-Modus
// koennen ausserdem Reaktionen erlaubt und Lesequittungen aktiviert werden.
//
// Anzeige fuer Nicht-Admins: Read-Only-Hinweis welcher Modus aktiv ist.
function SpaceModeSection({ space }: { space: SpaceItem }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const canManage = useSpaceCan(space.id, 'space:update');
    const [mode, setMode] = useState<'CHAT' | 'INFOTAFEL' | 'DISABLED'>(space.mode ?? 'CHAT');
    const [allowReactions, setAllowReactions] = useState<boolean>(space.allowReactions ?? true);
    const [showReadStats, setShowReadStats] = useState<boolean>(space.showReadStats ?? false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setMode(space.mode ?? 'CHAT');
        setAllowReactions(space.allowReactions ?? true);
        setShowReadStats(space.showReadStats ?? false);
    }, [space.id, space.mode, space.allowReactions, space.showReadStats]);

    const persist = useCallback(async (next: { mode?: 'CHAT' | 'INFOTAFEL' | 'DISABLED'; allowReactions?: boolean; showReadStats?: boolean }) => {
        const jwt = session.platform?.token;
        if (!jwt) return;
        setSaving(true);
        setError(null);
        try {
            await platformGateway.updateSpaceMode(jwt, space.id, next);
            // Trigger space list refresh so chat-module reacts immediately
            window.dispatchEvent(new Event('prilog:spaces-changed'));
        } catch (err) {
            logger.error('Failed to update space mode', { error: err });
            setError('Konnte nicht gespeichert werden');
            setMode(space.mode ?? 'CHAT');
            setAllowReactions(space.allowReactions ?? true);
            setShowReadStats(space.showReadStats ?? false);
        } finally {
            setSaving(false);
        }
    }, [session.platform?.token, space.id, space.mode, space.allowReactions, space.showReadStats]);

    const handleModeChange = useCallback((next: 'CHAT' | 'INFOTAFEL' | 'DISABLED') => {
        setMode(next);
        const nextAllowReactions = next === 'INFOTAFEL' ? false : true;
        const nextShowReadStats = next === 'INFOTAFEL' ? true : false;
        setAllowReactions(nextAllowReactions);
        setShowReadStats(nextShowReadStats);
        persist({ mode: next, allowReactions: nextAllowReactions, showReadStats: nextShowReadStats });
    }, [persist]);

    const handleReactionsChange = useCallback((next: boolean) => {
        setAllowReactions(next);
        persist({ allowReactions: next });
    }, [persist]);

    const handleReadStatsChange = useCallback((next: boolean) => {
        setShowReadStats(next);
        persist({ showReadStats: next });
    }, [persist]);

    if (!canManage) {
        if (mode === 'CHAT') return null;
        return (
            <div>
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <MaterialIcon name="campaign" size={14} />
                    {t('spaces.space_info.modus')}
                </h4>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {mode === 'DISABLED'
                        ? 'Der Chat ist in diesem Space deaktiviert.'
                        : <>{t('spaces.space_info.dieser_space_ist_eine')} <strong>{t('spaces.space_info.infotafel')}</strong>{t('spaces.space_info.nur_mitarbeiter_koennen_mitteilungen_sen')}</>}
                </p>
            </div>
        );
    }

    return (
        <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <MaterialIcon name="campaign" size={14} />
                {t('spaces.space_info.modus')}
            </h4>
            <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                    type="button"
                    onClick={() => handleModeChange('CHAT')}
                    disabled={saving}
                    className={cn(
                        'flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors',
                        mode === 'CHAT'
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50',
                        saving && 'opacity-50',
                    )}
                >
                    <div className="flex items-center gap-1.5">
                        <MaterialIcon name="chat_bubble" size={16} />
                        <span className="text-xs font-semibold">{t('spaces.space_info.chat')}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{t('spaces.space_info.alle_schreiben')}</span>
                </button>
                <button
                    type="button"
                    onClick={() => handleModeChange('INFOTAFEL')}
                    disabled={saving}
                    className={cn(
                        'flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors',
                        mode === 'INFOTAFEL'
                            ? 'border-amber-500 bg-amber-500/5'
                            : 'border-border hover:bg-muted/50',
                        saving && 'opacity-50',
                    )}
                >
                    <div className="flex items-center gap-1.5">
                        <MaterialIcon name="campaign" size={16} />
                        <span className="text-xs font-semibold">{t('spaces.space_info.infotafel')}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{t('spaces.space_info.nur_mitarbeiter')}</span>
                </button>
                <button
                    type="button"
                    onClick={() => handleModeChange('DISABLED')}
                    disabled={saving}
                    className={cn(
                        'flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors',
                        mode === 'DISABLED'
                            ? 'border-muted-foreground bg-muted/30'
                            : 'border-border hover:bg-muted/50',
                        saving && 'opacity-50',
                    )}
                >
                    <div className="flex items-center gap-1.5">
                        <MaterialIcon name="speaker_notes_off" size={16} />
                        <span className="text-xs font-semibold">{t('spaces.space_info.deaktiviert')}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{t('spaces.space_info.kein_chat')}</span>
                </button>
            </div>

            {mode === 'INFOTAFEL' && (
                <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                    <label className="flex items-center justify-between gap-2 text-xs">
                        <span>{t('spaces.space_info.reaktionen_erlauben')}</span>
                        <input
                            type="checkbox"
                            checked={allowReactions}
                            onChange={(e) => handleReactionsChange(e.target.checked)}
                            disabled={saving}
                            className="size-4"
                        />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs">
                        <span>{t('spaces.space_info.lesequittungen_anzeigen')}</span>
                        <input
                            type="checkbox"
                            checked={showReadStats}
                            onChange={(e) => handleReadStatsChange(e.target.checked)}
                            disabled={saving}
                            className="size-4"
                        />
                    </label>
                    <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
                        {t('spaces.space_info.lesequittungen_zeigen_nur_die_anzahl_der')}
                    </p>
                </div>
            )}

            {error && <p className="mt-2 text-[10px] text-destructive">{error}</p>}
        </div>
    );
}

const CONFIGURABLE_TABS = [
    { key: 'files', label: 'Dateien' },
    { key: 'tasks', label: 'Aufgaben' },
    { key: 'calendar', label: 'Kalender' },
    { key: 'letters', label: 'Briefe' },
    { key: 'absence', label: 'Anwesenheit' },
    { key: 'notebook', label: 'Mitteilungsheft' },
    { key: 'activity', label: 'Aktivitaet' },
];

function SpaceTabsConfig({ space }: { space: SpaceItem }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const canManage = useSpaceCan(space.id, 'space:update');
    const [disabled, setDisabled] = useState<Set<string>>(new Set(space.disabledTabs ?? []));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDisabled(new Set(space.disabledTabs ?? []));
    }, [space.id, space.disabledTabs]);

    if (!canManage) return null;

    const toggle = async (key: string) => {
        const jwt = session.platform?.token;
        if (!jwt || saving) return;
        const next = new Set(disabled);
        if (next.has(key)) next.delete(key); else next.add(key);
        setDisabled(next);
        setSaving(true);
        try {
            await platformGateway.updateSpaceMode(jwt, space.id, { disabledTabs: [...next] });
            window.dispatchEvent(new Event('prilog:spaces-changed'));
        } catch {
            setDisabled(new Set(space.disabledTabs ?? []));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <MaterialIcon name="visibility" size={14} />
                {t('spaces.space_info.sichtbare_tabs')}
            </h4>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
                {CONFIGURABLE_TABS.map(({ key, label }) => (
                    <label key={key} className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer transition-colors',
                        disabled.has(key) ? 'border-border bg-muted/30 text-muted-foreground' : 'border-primary/30 bg-primary/5',
                        saving && 'opacity-50',
                    )}>
                        <input
                            type="checkbox"
                            checked={!disabled.has(key)}
                            onChange={() => toggle(key)}
                            disabled={saving}
                            className="size-3.5"
                        />
                        {label}
                    </label>
                ))}
            </div>
        </div>
    );
}

function SpaceColorPicker({ spaceId, currentColor }: { spaceId: string; currentColor: string | null }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const [selected, setSelected] = useState(currentColor ?? '#3b82f6');
    const [saving, setSaving] = useState(false);

    const handleSelect = useCallback(async (color: string) => {
        const jwt = session.platform?.token;
        if (!jwt) return;
        setSelected(color);
        setSaving(true);
        try {
            await platformGateway.updateSpace(jwt, spaceId, { color });
        } catch { /* ignore */ }
        finally { setSaving(false); }
    }, [session.platform?.token, spaceId]);

    return (
        <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <MaterialIcon name="palette" size={14} />
                {t('spaces.space_info.farbe')}
            </h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESET_COLORS.map(color => (
                    <button
                        key={color}
                        onClick={() => handleSelect(color)}
                        disabled={saving}
                        className={cn(
                            'size-6 rounded-full transition-all hover:scale-110',
                            selected === color && 'ring-2 ring-offset-2 ring-offset-background',
                        )}
                        style={{
                            backgroundColor: color,
                            ...(selected === color ? { ringColor: color } : {}),
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

function SpaceIdDisplay({ spaceId, matrixRoomId, matrixChatRoomId }: { spaceId: string; matrixRoomId?: string | null; matrixChatRoomId?: string | null }) {
    const t = useT();
    const [copied, setCopied] = useState<string | null>(null);

    const handleCopy = useCallback((value: string, label: string) => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(label);
            setTimeout(() => setCopied(null), 2000);
        });
    }, []);

    return (
        <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <MaterialIcon name="tag" size={14} />
                {t('spaces.space_info.technische_ids')}
            </h4>
            <p className="mt-1 text-[10px] text-muted-foreground">
                {t('spaces.space_info.fuer_workflow-konfiguration_und_automati')}
            </p>
            <div className="mt-2 space-y-1.5">
                <IdRow
                    label={t('spaces.space_info.space-id')}
                    value={spaceId}
                    copied={copied === 'space'}
                    onCopy={() => handleCopy(spaceId, 'space')}
                />
                {matrixChatRoomId && (
                    <IdRow
                        label={t('spaces.space_info.chat-room_fuer_workflows')}
                        value={matrixChatRoomId}
                        copied={copied === 'chat'}
                        onCopy={() => handleCopy(matrixChatRoomId, 'chat')}
                    />
                )}
                {matrixRoomId && (
                    <IdRow
                        label={t('spaces.space_info.space-room')}
                        value={matrixRoomId}
                        copied={copied === 'matrix'}
                        onCopy={() => handleCopy(matrixRoomId, 'matrix')}
                    />
                )}
            </div>
        </div>
    );
}

function IdRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
    const t = useT();
    return (
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
            <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{label}</span>
            <code className="flex-1 truncate text-[10px] text-foreground">{value}</code>
            <button
                onClick={onCopy}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                title={t('spaces.space_info.kopieren')}
            >
                <MaterialIcon name={copied ? "check" : "content_copy"} size={14} className={copied ? "text-emerald-500" : ""} />
            </button>
        </div>
    );
}

// ─── Editable Space Name ──────────────────────────────────────────────────────

function EditableSpaceName({ spaceId, initialName }: { spaceId: string; initialName: string }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(initialName);
    const [saving, setSaving] = useState(false);

    async function save() {
        if (!jwt || !name.trim() || name === initialName) { setEditing(false); return; }
        setSaving(true);
        try {
            await platformGateway.updateSpace(jwt, spaceId, { name: name.trim() });
            setEditing(false);
            window.dispatchEvent(new CustomEvent('prilog:spaces-changed'));
        } catch { } finally { setSaving(false); }
    }

    if (editing) {
        return (
            <div>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={save}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(initialName); setEditing(false); } }}
                    autoFocus
                    maxLength={255}
                    className="h-8 w-full rounded-md border border-primary bg-background px-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                />
            </div>
        );
    }

    return (
        <div>
            <h3
                className="text-base font-semibold cursor-pointer hover:text-primary transition-colors"
                onClick={() => setEditing(true)}
                title={t('spaces.space_info.klicken_zum_bearbeiten')}
            >
                {initialName}
            </h3>
        </div>
    );
}

// ─── Editable Space Description ───────────────────────────────────────────────

function EditableSpaceDescription({ spaceId, initialDescription }: { spaceId: string; initialDescription: string | null }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [editing, setEditing] = useState(false);
    const [desc, setDesc] = useState(initialDescription ?? '');
    const [saving, setSaving] = useState(false);

    async function save() {
        if (!jwt) { setEditing(false); return; }
        setSaving(true);
        try {
            await platformGateway.updateSpace(jwt, spaceId, { description: desc.trim() });
            setEditing(false);
        } catch { } finally { setSaving(false); }
    }

    return (
        <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('spaces.space_info.beschreibung')}</h4>
            {editing ? (
                <div className="mt-1.5">
                    <textarea
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        onBlur={save}
                        autoFocus
                        rows={3}
                        maxLength={2000}
                        className="w-full rounded-md border border-primary bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                </div>
            ) : (
                <p
                    className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap cursor-pointer hover:text-primary transition-colors"
                    onClick={() => setEditing(true)}
                    title={t('spaces.space_info.klicken_zum_bearbeiten')}
                >
                    {initialDescription || <span className="italic text-muted-foreground">{t('spaces.space_info.keine_beschreibung_klicken_zum_hinzufueg')}</span>}
                </p>
            )}
        </div>
    );
}

// ─── Space-Governance-Light: Zutritt & Benutzertypen ────────────────────────
// Übernimmt die Portal-Funktion „Erlaubte Benutzertypen" in den Web-Client.
// Quelle = space.userTypes-Policy (steuert auch die Datenschutz-Sichtbarkeit
// im Info-Panel). Vererbung Parent→Child wie im Portal.

function SpaceAccessPolicy({ space }: { space: SpaceItem }): JSX.Element | null {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const canManage = useSpaceCan(space.id, 'space:update');
    const jwt = session.platform?.token ?? '';
    const [types, setTypes] = useState<import('@/gateways/platform/space-governance-gateway').TenantUserType[]>([]);
    const [policies, setPolicies] = useState<import('@/gateways/platform/space-governance-gateway').SpacePolicy[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        try {
            const { spaceGovernanceGateway } = await import('@/gateways/platform/space-governance-gateway');
            const [tu, sp] = await Promise.all([
                spaceGovernanceGateway.listUserTypes(jwt),
                spaceGovernanceGateway.getSpacePolicies(jwt, space.id),
            ]);
            setTypes(tu.userTypes ?? []);
            setPolicies(sp.policies ?? []);
            setErr(null);
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwt, space.id]);

    useEffect(() => { void load(); }, [load]);

    if (!canManage || loading) return null;

    const byTypeId = new Map(policies.map(p => [p.userTypeId, p]));

    // PUT ersetzt ALLE expliziten Policies. Wir senden die explizit
    // gesetzten (inkl. neu aktivierte / rollen-geänderte). Rein vererbte
    // bleiben unangetastet (nicht senden = bleibt vererbt).
    const persist = async (next: import('@/gateways/platform/space-governance-gateway').SpacePolicy[]) => {
        setSaving(true);
        try {
            const { spaceGovernanceGateway } = await import('@/gateways/platform/space-governance-gateway');
            const explicit = next.filter(p => p.source === 'explicit')
                .map(p => ({ userTypeId: p.userTypeId, defaultRole: p.defaultRole || null }));
            await spaceGovernanceGateway.setSpacePolicies(jwt, space.id, explicit);
            window.dispatchEvent(new Event('prilog:spaces-changed'));
            await load();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
        } finally {
            setSaving(false);
        }
    };

    const toggle = (ut: { id: string; key: string; label: string }) => {
        const cur = byTypeId.get(ut.id);
        if (cur && cur.source === 'explicit') {
            // explizit → entfernen (fällt auf Vererbung zurück bzw. weg)
            void persist(policies.filter(p => p.userTypeId !== ut.id));
        } else if (cur && cur.source === 'inherited') {
            // vererbt: lokal als explizit „materialisieren" (anpinnen)
            void persist([...policies, { ...cur, source: 'explicit' }]);
        } else {
            // nicht gesetzt → explizit hinzufügen
            void persist([...policies, {
                userTypeId: ut.id, defaultRole: '', source: 'explicit',
                inheritedFromSpaceId: null, inheritedFromSpaceName: null,
                userType: { id: ut.id, key: ut.key, label: ut.label },
            }]);
        }
    };

    const setRole = (userTypeId: string, role: string) => {
        const cur = byTypeId.get(userTypeId);
        const others = policies.filter(p => p.userTypeId !== userTypeId);
        const baseEntry = cur ?? policies.find(p => p.userTypeId === userTypeId);
        if (!baseEntry) return;
        void persist([...others, { ...baseEntry, defaultRole: role, source: 'explicit' }]);
    };

    const removeOverride = (userTypeId: string) =>
        void persist(policies.filter(p => p.userTypeId !== userTypeId));

    return (
        <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                <MaterialIcon name="lock_person" size={14} />
                Zutritt & Benutzertypen
            </h4>
            <p className="mb-2 text-[11px] text-muted-foreground">
                Welche Benutzertypen sind in diesem Space vorgesehen? Nur diese
                erscheinen in Mitgliederlisten/Infos. Vom Eltern-Space geerbte
                Regeln sind markiert; lokal überschreibbar.
            </p>
            {err && <div className="mb-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">{err}</div>}
            {types.length === 0 && (
                <p className="text-[12px] italic text-muted-foreground">Keine Benutzertypen angelegt.</p>
            )}
            <div className="space-y-1.5">
                {types.map(ut => {
                    const p = byTypeId.get(ut.id);
                    const selected = !!p;
                    const inherited = p?.source === 'inherited';
                    return (
                        <div key={ut.id} className={cn('rounded-lg border px-2.5 py-2',
                            inherited ? 'border-primary/20 bg-primary/5' : 'border-border')}>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" checked={selected} disabled={saving}
                                    onChange={() => toggle(ut)} className="mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[13px] font-medium">{ut.label}</span>
                                        {inherited && (
                                            <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                                                geerbt von {p?.inheritedFromSpaceName ?? 'Eltern-Space'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{ut.key}</div>
                                    {selected && (
                                        <div className="mt-1.5 flex items-center gap-1.5">
                                            <input
                                                type="text"
                                                value={p?.defaultRole ?? ''}
                                                disabled={saving}
                                                placeholder="Standardrolle (optional)"
                                                onChange={e => setRole(ut.id, e.target.value)}
                                                className="w-44 rounded border border-input bg-background px-1.5 py-0.5 text-[11px]"
                                            />
                                            {p?.source === 'explicit' && (
                                                <button type="button" disabled={saving}
                                                    onClick={() => removeOverride(ut.id)}
                                                    className="text-[10px] text-muted-foreground hover:text-foreground">
                                                    lokalen Override entfernen
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Vertretung-App: Aktivieren/Beenden eines Vertretungs-Spaces ───────────
function VertretungControl({ space }: { space: SpaceItem }): JSX.Element | null {
    const enabled = useModule('vertretung' as never);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [active, setActive] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled || !jwt) return;
        fetch('/api/platform/v1/vertretung/status', { headers: { Authorization: `Bearer ${jwt}` } })
            .then(r => (r.ok ? r.json() : { active: [] }))
            .then((d: { active?: { classSpaceId: string }[] }) =>
                setActive(!!d.active?.some(x => x.classSpaceId === space.id)))
            .catch(() => setActive(false));
    }, [enabled, jwt, space.id]);

    if (!enabled) return null;

    const toggle = async () => {
        if (!jwt || active === null) return;
        setBusy(true);
        setMsg(null);
        const ep = active ? 'deactivate' : 'activate';
        try {
            const r = await fetch(`/api/platform/v1/vertretung/${ep}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ classSpaceId: space.id }),
            });
            if (!r.ok) {
                const e = await r.json().catch(() => null);
                throw new Error(e?.message ?? `HTTP ${r.status}`);
            }
            const next = !active;
            setActive(next);
            setMsg(next
                ? 'Vertretung aktiv — Vertretungs-Space angelegt, alle Lehrkräfte haben Zugang. Die Klasse erscheint orange in der Liste.'
                : 'Vertretung beendet.');
        } catch (e) {
            setMsg(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
                <MaterialIcon
                    name="swap_horiz"
                    size={16}
                    className={cn('size-4', active ? 'text-orange-500' : 'text-muted-foreground')}
                />
                <span className="text-sm font-medium">Vertretung</span>
                {active && (
                    <span className="ml-auto rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-600">
                        aktiv
                    </span>
                )}
            </div>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Bei Abwesenheit einen Vertretungs-Space (Infotafel) mit Sachinfos, Epochen-Unterlagen
                und Material für alle Lehrkräfte freischalten. Die Klasse wird dann in der Spaces-Liste
                orange markiert. Nur die Klassen-Lehrkraft oder ein Admin kann das schalten.
            </p>
            <button
                type="button"
                onClick={toggle}
                disabled={busy || active === null}
                className={cn(
                    'mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                    busy || active === null
                        ? 'cursor-not-allowed bg-muted text-muted-foreground'
                        : active
                            ? 'bg-muted text-foreground hover:bg-muted/70'
                            : 'bg-orange-500 text-white hover:bg-orange-600',
                )}
            >
                {active ? 'Vertretung beenden' : 'Vertretung aktivieren'}
            </button>
            {msg && <p className="mt-1.5 text-[12px] text-muted-foreground">{msg}</p>}
        </div>
    );
}
