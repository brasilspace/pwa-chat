/**
 * BausteinOrganisation — Rollen-Matrix
 *
 * Editierbares Grid: Rollen vs. Verantwortlichkeiten.
 * Daten werden in baustein.config gespeichert.
 */

import { useState, useCallback } from 'react';
import { Users, Plus, Trash2, Save, Check } from 'lucide-react';
import type { ConceptBaustein } from '../concept-gateway';
import { createConceptGateway } from '../concept-gateway';
import { useT } from "@/lib/i18n/use-t";

const gateway = createConceptGateway();

interface RoleEntry {
    id: string;
    role: string;
    person: string;
    responsibilities: string;
    contact: string;
}

interface Props {
    baustein: ConceptBaustein;
    instanceId: string;
    jwt: string;
}

export function BausteinOrganisation({ baustein, instanceId, jwt }: Props) {
    const t = useT();
    const config = baustein.config as Record<string, unknown>;
    const initialRoles = (config.roles as RoleEntry[] | undefined) ?? [];

    const [roles, setRoles] = useState<RoleEntry[]>(initialRoles);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleAdd = () => {
        setRoles((prev) => [...prev, {
            id: `role_${Date.now()}`,
            role: '',
            person: '',
            responsibilities: '',
            contact: '',
        }]);
    };

    const handleUpdate = (id: string, field: keyof RoleEntry, value: string) => {
        setRoles((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
    };

    const handleRemove = (id: string) => {
        setRoles((prev) => prev.filter((r) => r.id !== id));
    };

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            await gateway.updateBaustein(jwt, instanceId, 'organisation', {
                config: { ...config, roles },
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } finally {
            setSaving(false);
        }
    }, [jwt, instanceId, config, roles]);

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-2">
                <div className="flex items-center gap-2">
                    <Users size={15} className="text-[var(--muted-foreground)]" />
                    <span className="text-sm font-medium">{t('concepts.bausteine.baustein_organisation.zustaendigkeiten_rollen')}</span>
                </div>
                <div className="flex items-center gap-2">
                    {saved && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                            <Check size={12} /> {t('concepts.bausteine.baustein_organisation.gespeichert')}
                        </span>
                    )}
                    <button
                        onClick={handleAdd}
                        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--accent)]"
                    >
                        <Plus size={12} />
                        {t('concepts.bausteine.baustein_organisation.rolle_hinzufuegen')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    >
                        <Save size={12} />
                        {saving ? 'Speichert...' : t('common.save')}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto p-4">
                {roles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                        <Users size={32} className="text-[var(--muted-foreground)]" />
                        <p className="text-sm text-[var(--muted-foreground)]">{t('concepts.bausteine.baustein_organisation.noch_keine_rollen_definiert')}</p>
                        <button
                            onClick={handleAdd}
                            className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-white"
                        >
                            <Plus size={14} />
                            {t('concepts.bausteine.baustein_organisation.erste_rolle_hinzufuegen')}
                        </button>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--border)] text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                                <th className="px-3 py-2">{t('concepts.bausteine.baustein_organisation.rolle')}</th>
                                <th className="px-3 py-2">{t('concepts.bausteine.baustein_organisation.person')}</th>
                                <th className="px-3 py-2">{t('concepts.bausteine.baustein_organisation.verantwortlichkeiten')}</th>
                                <th className="px-3 py-2">{t('concepts.bausteine.baustein_organisation.kontakt')}</th>
                                <th className="w-10 px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map((role) => (
                                <tr key={role.id} className="border-b border-[var(--border)] last:border-0">
                                    <td className="px-2 py-1.5">
                                        <input
                                            value={role.role}
                                            onChange={(e) => handleUpdate(role.id, 'role', e.target.value)}
                                            placeholder={t('concepts.bausteine.baustein_organisation.zb_kinderschutzbeauftragte')}
                                            className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm focus:border-[var(--ring)] focus:outline-none"
                                        />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input
                                            value={role.person}
                                            onChange={(e) => handleUpdate(role.id, 'person', e.target.value)}
                                            placeholder={t('concepts.bausteine.baustein_organisation.name')}
                                            className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm focus:border-[var(--ring)] focus:outline-none"
                                        />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input
                                            value={role.responsibilities}
                                            onChange={(e) => handleUpdate(role.id, 'responsibilities', e.target.value)}
                                            placeholder={t('concepts.bausteine.baustein_organisation.aufgaben')}
                                            className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm focus:border-[var(--ring)] focus:outline-none"
                                        />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input
                                            value={role.contact}
                                            onChange={(e) => handleUpdate(role.id, 'contact', e.target.value)}
                                            placeholder={t('concepts.bausteine.baustein_organisation.tel_e-mail')}
                                            className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm focus:border-[var(--ring)] focus:outline-none"
                                        />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <button
                                            onClick={() => handleRemove(role.id)}
                                            className="rounded p-1 text-[var(--muted-foreground)] hover:text-red-500"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
