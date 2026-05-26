import { type JSX, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface Member {
    id: string;
    matrixUserId: string;
    username: string;
    displayName: string;
    email: string | null;
    active: boolean;
    admin: boolean;
    createdAt: string;
    userType: { key: string; label: string; audience: string } | null;
}

interface UserTypeOption {
    key: string;
    label: string;
    audience: string;
    contactVisibility?: string;
    canBroadcast?: boolean;
    sortOrder?: number;
    isDefault?: boolean;
}

export function MembersSection(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();

    const [members, setMembers] = useState<Member[] | null>(null);
    const [userTypes, setUserTypes] = useState<UserTypeOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
    const [savingId, setSavingId] = useState<string | null>(null);

    const reload = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        Promise.all([
            fetch('/api/platform/v1/workspace/users', { headers: { Authorization: `Bearer ${jwt}` } }).then(r => r.json()),
            fetch('/api/platform/v1/workspace/user-types', { headers: { Authorization: `Bearer ${jwt}` } }).then(r => r.json()),
        ])
            .then(([u, t]) => {
                if (u?.users) setMembers(u.users);
                if (t?.userTypes) setUserTypes(t.userTypes);
                setError(null);
            })
            .catch(e => setError(e instanceof Error ? e.message : t('common.error')))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { reload(); }, [reload]);

    const updateMember = useCallback(async (id: string, patch: { userTypeKey?: string | null; active?: boolean }) => {
        if (!jwt) return;
        setSavingId(id);
        try {
            const res = await fetch(`/api/platform/v1/workspace/users/${id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // Liste neu laden um konsistent zu bleiben
            reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
        } finally {
            setSavingId(null);
        }
    }, [jwt, reload]);

    const filtered = useMemo(() => {
        if (!members) return [];
        const s = search.trim().toLowerCase();
        return members.filter(m => {
            if (filter === 'active' && !m.active) return false;
            if (filter === 'inactive' && m.active) return false;
            if (s && !(m.displayName.toLowerCase().includes(s) || m.username.toLowerCase().includes(s) || (m.email?.toLowerCase().includes(s) ?? false))) return false;
            return true;
        });
    }, [members, search, filter]);

    return (
        <div>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                        <MaterialIcon name="groups" size={16} className="size-5" /> {t('settings.members.mitglieder')}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t('settings.members.verwalte_benutzer_dieses_workspaces_roll')}
                    </p>
                </div>
                <button
                    onClick={() => navigate('/invite')}
                    className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <MaterialIcon name="person_add" size={16} className="size-4" /> {t('settings.members.einladen')}
                </button>
            </div>

            {error && (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
            )}

            {/* Toolbar: Filter + Suche */}
            <div className="mt-4 flex items-center gap-2">
                <div className="relative flex-1">
                    <MaterialIcon name="search" size={16} className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('settings.members.suche_name_e-mail')}
                        className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
                    />
                </div>
                <div className="flex gap-1">
                    {(['active', 'inactive', 'all'] as const).map(key => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={cn(
                                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                                filter === key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                            )}
                        >
                            {key === 'active' ? t('common.active') : key === 'inactive' ? t('common.inactive') : t('common.all')}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="mt-6 text-sm text-muted-foreground">
                    <Loader2 className="inline size-4 animate-spin" /> {t('settings.members.lade_mitglieder')}
                </div>
            ) : (
                <div className="mt-4">
                    <p className="mb-2 text-xs text-muted-foreground">
                        {filtered.length} {filtered.length === 1 ? t('common.member_singular') : t('common.members')}
                        {members && filtered.length !== members.length && ` (von ${members.length})`}
                    </p>

                    <ul className="divide-y divide-border rounded-xl border border-border">
                        {filtered.map(m => (
                            <MemberRow
                                key={m.id}
                                member={m}
                                userTypes={userTypes}
                                saving={savingId === m.id}
                                onChangeUserType={(key) => updateMember(m.id, { userTypeKey: key })}
                                onToggleActive={() => updateMember(m.id, { active: !m.active })}
                            />
                        ))}
                        {filtered.length === 0 && (
                            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                                {t('settings.members.keine_mitglieder_im_filter')}
                            </li>
                        )}
                    </ul>

                    {/* Rollen-Verwaltung: Liste + Neue-Rolle-Dialog */}
                    <RolesManager userTypes={userTypes} onChanged={reload} />
                </div>
            )}
        </div>
    );
}

// ─── Rollen verwalten ──────────────────────────────────────────────────────

interface RoleFormValues {
    label: string;
    audience: 'staff' | 'guardian' | 'minor';
    contactVisibility: 'tenant-wide' | 'staff-only' | 'space-only';
    canBroadcast: boolean;
}

function emptyForm(): RoleFormValues {
    return { label: '', audience: 'staff', contactVisibility: 'tenant-wide', canBroadcast: true };
}

function RolesManager({ userTypes, onChanged }: {
    userTypes: UserTypeOption[];
    onChanged: () => void;
}): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [adding, setAdding] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null); // role key currently saving/deleting/reordering
    const [error, setError] = useState<string | null>(null);

    const closeAll = useCallback(() => {
        setAdding(false);
        setEditingKey(null);
        setError(null);
    }, []);

    // ── Create ──
    const create = useCallback(async (values: RoleFormValues) => {
        if (!jwt) return;
        setBusy('__new__');
        setError(null);
        try {
            const res = await fetch('/api/platform/v1/workspace/user-types', {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? `HTTP ${res.status}`);
            }
            closeAll();
            onChanged();
        } catch (e) {
            console.error('[roles] create failed:', e);
            setError(e instanceof Error ? e.message : 'Anlegen fehlgeschlagen');
        } finally {
            setBusy(null);
        }
    }, [jwt, closeAll, onChanged]);

    // ── Update ──
    const update = useCallback(async (key: string, values: Partial<RoleFormValues>) => {
        if (!jwt) return;
        setBusy(key);
        setError(null);
        try {
            const res = await fetch(`/api/platform/v1/workspace/user-types/${encodeURIComponent(key)}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? `HTTP ${res.status}`);
            }
            closeAll();
            onChanged();
        } catch (e) {
            console.error('[roles] update failed:', e);
            setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
        } finally {
            setBusy(null);
        }
    }, [jwt, closeAll, onChanged]);

    // ── Delete ──
    const remove = useCallback(async (key: string, label: string) => {
        if (!jwt) return;
        if (!confirm(`Rolle "${label}" wirklich löschen?\n\nDas geht nur wenn keine Mitglieder mehr diese Rolle haben.`)) return;
        setBusy(key);
        setError(null);
        try {
            const res = await fetch(`/api/platform/v1/workspace/user-types/${encodeURIComponent(key)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (!res.ok && res.status !== 204) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? `HTTP ${res.status}`);
            }
            onChanged();
        } catch (e) {
            console.error('[roles] delete failed:', e);
            setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
        } finally {
            setBusy(null);
        }
    }, [jwt, onChanged]);

    // ── Reorder (up/down) ──
    const move = useCallback(async (key: string, direction: 'up' | 'down') => {
        if (!jwt) return;
        const currentIdx = userTypes.findIndex(ut => ut.key === key);
        if (currentIdx < 0) return;
        const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
        if (targetIdx < 0 || targetIdx >= userTypes.length) return;
        // Neue Reihenfolge: Element vertauschen
        const newOrder = [...userTypes];
        [newOrder[currentIdx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[currentIdx]];
        setBusy(key);
        setError(null);
        try {
            const res = await fetch('/api/platform/v1/workspace/user-types/reorder', {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys: newOrder.map(ut => ut.key) }),
            });
            if (!res.ok && res.status !== 204) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? `HTTP ${res.status}`);
            }
            onChanged();
        } catch (e) {
            console.error('[roles] reorder failed:', e);
            setError(e instanceof Error ? e.message : 'Reihenfolge ändern fehlgeschlagen');
        } finally {
            setBusy(null);
        }
    }, [jwt, userTypes, onChanged]);

    return (
        <div className="mt-4 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('settings.members.rollen')}{userTypes.length})</h3>
                {!adding && !editingKey && (
                    <button
                        onClick={() => setAdding(true)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                        <MaterialIcon name="add" size={16} className="size-3.5" /> {t('settings.members.neue_rolle')}
                    </button>
                )}
            </div>

            {error && (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    {error}
                </div>
            )}

            {userTypes.length === 0 && !adding && (
                <p className="mt-2 text-xs text-muted-foreground">
                    {t('settings.members.keine_rollen_definiert_alle_mitglieder_s')}
                </p>
            )}

            {/* Liste mit Edit/Delete/Reorder */}
            {userTypes.length > 0 && (
                <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                    {userTypes.map((ut, idx) => (
                        editingKey === ut.key ? (
                            <li key={ut.key} className="p-3">
                                <RoleForm
                                    initial={{
                                        label: ut.label,
                                        audience: (ut.audience as RoleFormValues['audience']) ?? 'staff',
                                        contactVisibility: (ut.contactVisibility as RoleFormValues['contactVisibility']) ?? 'tenant-wide',
                                        canBroadcast: ut.canBroadcast ?? false,
                                    }}
                                    submitLabel={t('common.save')}
                                    submitting={busy === ut.key}
                                    onSubmit={(values) => update(ut.key, values)}
                                    onCancel={closeAll}
                                />
                            </li>
                        ) : (
                            <RoleRow
                                key={ut.key}
                                role={ut}
                                isFirst={idx === 0}
                                isLast={idx === userTypes.length - 1}
                                busy={busy === ut.key}
                                onEdit={() => { closeAll(); setEditingKey(ut.key); }}
                                onDelete={() => remove(ut.key, ut.label)}
                                onMoveUp={() => move(ut.key, 'up')}
                                onMoveDown={() => move(ut.key, 'down')}
                            />
                        )
                    ))}
                </ul>
            )}

            {adding && (
                <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                    <RoleForm
                        initial={emptyForm()}
                        submitLabel={t('common.create')}
                        submitting={busy === '__new__'}
                        onSubmit={create}
                        onCancel={closeAll}
                    />
                </div>
            )}
        </div>
    );
}

function RoleRow({ role, isFirst, isLast, busy, onEdit, onDelete, onMoveUp, onMoveDown }: {
    role: UserTypeOption;
    isFirst: boolean;
    isLast: boolean;
    busy: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}): JSX.Element {
    const t = useT();
    return (
        <li className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{role.label}</span>
                    {role.isDefault && (
                        <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">{t('settings.members.standard')}</span>
                    )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                    {audienceLabel(role.audience)} · {visibilityLabel(role.contactVisibility)}
                    {role.canBroadcast && ' · darf in Infotafel-Spaces senden'}
                </p>
            </div>

            <div className="flex items-center gap-0.5">
                <IconButton title={t('settings.members.nach_oben')} disabled={isFirst || busy} onClick={onMoveUp}>
                    <MaterialIcon name="arrow_upward" size={16} className="size-3.5" />
                </IconButton>
                <IconButton title={t('settings.members.nach_unten')} disabled={isLast || busy} onClick={onMoveDown}>
                    <MaterialIcon name="arrow_downward" size={16} className="size-3.5" />
                </IconButton>
                <IconButton title={t('settings.members.bearbeiten')} disabled={busy} onClick={onEdit}>
                    <MaterialIcon name="edit" size={16} className="size-3.5" />
                </IconButton>
                <IconButton title={role.isDefault ? 'Standard-Rolle kann nicht gelöscht werden' : t('common.delete')} disabled={busy || (role.isDefault ?? false)} onClick={onDelete} variant="destructive">
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <MaterialIcon name="delete" size={16} className="size-3.5" />}
                </IconButton>
            </div>
        </li>
    );
}

function IconButton({ children, title, disabled, onClick, variant }: {
    children: React.ReactNode;
    title: string;
    disabled: boolean;
    onClick: () => void;
    variant?: 'destructive';
}): JSX.Element {
    return (
        <button
            type="button"
            title={title}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'flex size-7 items-center justify-center rounded transition-colors disabled:opacity-30',
                variant === 'destructive'
                    ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}

function RoleForm({ initial, submitLabel, submitting, onSubmit, onCancel }: {
    initial: RoleFormValues;
    submitLabel: string;
    submitting: boolean;
    onSubmit: (values: RoleFormValues) => void;
    onCancel: () => void;
}): JSX.Element {
    const t = useT();
    const [values, setValues] = useState<RoleFormValues>(initial);

    const setField = <K extends keyof RoleFormValues>(key: K, value: RoleFormValues[K]) => {
        setValues(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="space-y-3">
            <div>
                <label className="text-xs font-medium">{t('settings.members.bezeichnung')}</label>
                <input
                    type="text"
                    value={values.label}
                    onChange={(e) => setField('label', e.target.value)}
                    placeholder={t('settings.members.zb_mitarbeiter_gast_trainer')}
                    disabled={submitting}
                    autoFocus
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
                />
            </div>

            <div>
                <label className="text-xs font-medium">{t('settings.members.zielgruppe')}</label>
                <select
                    value={values.audience}
                    onChange={(e) => setField('audience', e.target.value as RoleFormValues['audience'])}
                    disabled={submitting}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
                >
                    <option value="staff">{t('settings.members.mitarbeiter_aktiv')}</option>
                    <option value="guardian">{t('settings.members.begleitende_eltern_bezugspersonen')}</option>
                    <option value="minor">{t('settings.members.schutzbeduerftig_schueler_kinder')}</option>
                </select>
            </div>

            <div>
                <label className="text-xs font-medium">{t('settings.members.kontaktsichtbarkeit')}</label>
                <select
                    value={values.contactVisibility}
                    onChange={(e) => setField('contactVisibility', e.target.value as RoleFormValues['contactVisibility'])}
                    disabled={submitting}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
                >
                    <option value="tenant-wide">{t('settings.members.alle_im_tenant_sichtbar')}</option>
                    <option value="staff-only">{t('settings.members.nur_mitarbeiter_sichtbar')}</option>
                    <option value="space-only">{t('settings.members.nur_in_gemeinsamen_spaces_sichtbar')}</option>
                </select>
            </div>

            <label className="flex cursor-pointer items-start gap-2">
                <input
                    type="checkbox"
                    checked={values.canBroadcast}
                    onChange={(e) => setField('canBroadcast', e.target.checked)}
                    disabled={submitting}
                    className="mt-0.5"
                />
                <div>
                    <div className="text-xs font-medium">{t('settings.members.darf_in_infotafel-spaces_senden')}</div>
                    <div className="text-[10px] text-muted-foreground">
                        {t('settings.members.klassisch_nur_mitarbeiter_in_lese-spaces')}
                    </div>
                </div>
            </label>

            <div className="flex justify-end gap-2 pt-1">
                <button
                    onClick={onCancel}
                    disabled={submitting}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                    <MaterialIcon name="close" size={16} className="size-3.5" /> {t('settings.members.abbrechen')}
                </button>
                <button
                    onClick={() => onSubmit(values)}
                    disabled={submitting || values.label.trim().length < 2}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <MaterialIcon name="save" size={16} className="size-3.5" />}
                    {submitLabel}
                </button>
            </div>
        </div>
    );
}

function audienceLabel(audience: string): string {
    if (audience === 'staff') return 'Mitarbeiter';
    if (audience === 'guardian') return 'Begleitende';
    if (audience === 'minor') return 'Schutzbedürftig';
    return audience;
}

function visibilityLabel(v?: string): string {
    if (v === 'tenant-wide') return 'tenantweit sichtbar';
    if (v === 'staff-only') return 'nur Mitarbeiter sichtbar';
    if (v === 'space-only') return 'nur in Spaces sichtbar';
    return 'Sichtbarkeit unbekannt';
}

function MemberRow({
    member, userTypes, saving, onChangeUserType, onToggleActive,
}: {
    member: Member;
    userTypes: UserTypeOption[];
    saving: boolean;
    onChangeUserType: (key: string | null) => void;
    onToggleActive: () => void;
}): JSX.Element {
    const t = useT();
    // Hebel 3: Rollen-Dropdown nur sichtbar wenn ≥2 Rollen verfuegbar.
    // Bei 1 oder 0 Rollen ist die Auswahl sinnlos (alle haben dieselbe Rolle).
    const showRoleSelect = userTypes.length >= 2;

    return (
        <li className={cn('flex items-center gap-3 px-4 py-3', !member.active && 'bg-muted/30')}>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('text-sm font-medium', !member.active && 'text-muted-foreground line-through')}>
                        {member.displayName}
                    </span>
                    {member.admin && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                            {t('settings.members.admin')}
                        </span>
                    )}
                    {member.userType && !showRoleSelect && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {member.userType.label}
                        </span>
                    )}
                    {!member.active && (
                        <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                            {t('settings.members.inaktiv')}
                        </span>
                    )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                    @{member.username}{member.email && ` · ${member.email}`}
                </p>
            </div>

            {showRoleSelect && (
                <select
                    value={member.userType?.key ?? ''}
                    onChange={(e) => onChangeUserType(e.target.value || null)}
                    disabled={saving}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
                >
                    <option value="">{t('settings.members.keine_rolle')}</option>
                    {userTypes.map(ut => (
                        <option key={ut.key} value={ut.key}>{ut.label}</option>
                    ))}
                </select>
            )}

            {/* Aktivieren / Deaktivieren */}
            <button
                onClick={onToggleActive}
                disabled={saving}
                title={member.active ? 'Deaktivieren' : 'Aktivieren'}
                className={cn(
                    'flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50',
                    member.active
                        ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                        : 'text-emerald-600 hover:bg-emerald-500/10',
                )}
            >
                {saving ? <Loader2 className="size-4 animate-spin" />
                    : member.active ? <MaterialIcon name="gpp_bad" size={16} className="size-4" />
                        : <MaterialIcon name="verified_user" size={16} className="size-4" />}
            </button>
        </li>
    );
}
