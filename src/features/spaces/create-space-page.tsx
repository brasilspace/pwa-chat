/**
 * CreateSpacePage — Neuen Space erstellen.
 *
 * Vollbild-Seite (kein Modal), funktioniert auf Desktop und Mobile.
 * Felder: Name (Pflicht), Sichtbarkeit, Farbe, Beschreibung.
 * Nach Erstellung: Navigation zum neuen Space.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '@/core/session/session-store';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { useSpaces } from './use-spaces';
import { useT } from "@/lib/i18n/use-t";

const gateway = createPlatformGateway();

const PRESET_COLORS = [
    '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
];

export function CreateSpacePage(): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [searchParams] = useSearchParams();
    const { spaces } = useSpaces();
    const initialParent = searchParams.get('parent') || '';

    const [name, setName] = useState('');
    const [internalName, setInternalName] = useState('');
    const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [description, setDescription] = useState('');
    const [parentSpaceId, setParentSpaceId] = useState(initialParent);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const parentSpace = parentSpaceId ? spaces.find(s => s.id === parentSpaceId) : null;

    const canSubmit = name.trim().length >= 1 && !saving;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!jwt || !canSubmit) return;

        setSaving(true);
        setError('');

        try {
            const res = await gateway.createSpace(jwt, {
                name: name.trim(),
                internalName: internalName.trim() || undefined,
                visibility,
                description: description.trim() || undefined,
                parentSpaceId: parentSpaceId || undefined,
            });
            // Sofort navigieren, Sidebar-Refresh im Hintergrund
            navigate(`/spaces/${res.space.id}`);
            // Verzögert refreshen (Synapse braucht kurz für den Room)
            setTimeout(() => window.dispatchEvent(new CustomEvent('prilog:spaces-changed')), 500);
            setTimeout(() => window.dispatchEvent(new CustomEvent('prilog:spaces-changed')), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Space konnte nicht erstellt werden.');
        } finally {
            setSaving(false);
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
                    aria-label={t('spaces.create_space_page.zurueck')}
                >
                    <MaterialIcon name="arrow_back" size={16} className="size-4" />
                </button>
                <span className="text-lg font-semibold">{t('spaces.create_space_page.space_anlegen')}</span>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto">
                <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-6 p-6">

                    {/* Parent-Space-Indikator */}
                    {parentSpace && (
                        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                            <MaterialIcon name="subdirectory_arrow_right" size={16} className="size-4 shrink-0 text-primary" />
                            <span className="flex-1">
                                {t('spaces.create_space_page.wird_als_unterspace_von')} <strong>{parentSpace.name}</strong> angelegt
                            </span>
                            <button type="button" onClick={() => setParentSpaceId('')}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title={t('spaces.create_space_page.auf_oberste_ebene_anlegen')}>
                                <MaterialIcon name="close" size={14} />
                            </button>
                        </div>
                    )}
                    {!parentSpace && spaces.length > 0 && (
                        <details className="rounded-lg border border-dashed border-border px-3 py-2 text-xs">
                            <summary className="cursor-pointer text-muted-foreground">
                                <MaterialIcon name="account_tree" size={12} className="mr-1 inline align-middle" />
                                {t('spaces.create_space_page.als_unterspace_anlegen_optional')}
                            </summary>
                            <select value={parentSpaceId} onChange={e => setParentSpaceId(e.target.value)}
                                className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                                <option value="">{t('spaces.create_space_page.top-level')}</option>
                                {spaces.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </details>
                    )}

                    {/* Name (Anzeige-Etikett) */}
                    <div>
                        <label htmlFor="space-name" className="mb-1.5 block text-sm font-medium">
                            {t('spaces.create_space_page.anzeigename')} <span className="text-muted-foreground font-normal">{t('spaces.create_space_page.etikett_kann_sich_aendern')}</span>
                        </label>
                        <input
                            id="space-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('spaces.create_space_page.zb_klasse_5a_kollegium_elternbeirat')}
                            autoFocus
                            maxLength={255}
                            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>

                    {/* Interner Name (dauerhafter Identifikator) */}
                    <div>
                        <label htmlFor="space-internal-name" className="mb-1.5 block text-sm font-medium">
                            {t('spaces.create_space_page.dauerhafter_name')} <span className="text-muted-foreground font-normal">{t('spaces.create_space_page.optional_nicht_mehr_aenderbar')}</span>
                        </label>
                        <input
                            id="space-internal-name"
                            type="text"
                            value={internalName}
                            onChange={(e) => setInternalName(e.target.value)}
                            placeholder={name ? `z.B. Abi 2030 — leer = "${name}"` : 'z.B. Abi 2030'}
                            maxLength={255}
                            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            {t('spaces.create_space_page.praktisch_fuer_klassen_anzeigename_klass')}
                        </p>
                    </div>

                    {/* Sichtbarkeit */}
                    <div>
                        <label className="mb-1.5 block text-sm font-medium">{t('spaces.create_space_page.sichtbarkeit')}</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setVisibility('PRIVATE')}
                                className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${visibility === 'PRIVATE'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:border-muted-foreground/30'
                                    }`}
                            >
                                <MaterialIcon name="lock" size={16} className="size-4 shrink-0 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">{t('spaces.create_space_page.privat')}</p>
                                    <p className="text-xs text-muted-foreground">{t('spaces.create_space_page.nur_eingeladene_mitglieder')}</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setVisibility('PUBLIC')}
                                className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${visibility === 'PUBLIC'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:border-muted-foreground/30'
                                    }`}
                            >
                                <MaterialIcon name="public" size={16} className="size-4 shrink-0 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">{t('spaces.create_space_page.sichtbar')}</p>
                                    <p className="text-xs text-muted-foreground">{t('spaces.create_space_page.alle_nutzer_koennen_beitreten')}</p>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Farbe */}
                    <div>
                        <label className="mb-1.5 block text-sm font-medium">{t('spaces.create_space_page.farbe')}</label>
                        <div className="flex flex-wrap gap-2">
                            {PRESET_COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={`flex size-8 items-center justify-center rounded-full transition-transform ${color === c ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'hover:scale-110'
                                        }`}
                                    style={{ backgroundColor: c }}
                                    aria-label={c}
                                >
                                    {color === c && <MaterialIcon name="check" size={16} className="size-4 text-white" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Beschreibung */}
                    <div>
                        <label htmlFor="space-desc" className="mb-1.5 block text-sm font-medium">
                            {t('spaces.create_space_page.beschreibung')} <span className="text-muted-foreground font-normal">{t('spaces.create_space_page.optional')}</span>
                        </label>
                        <textarea
                            id="space-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t('spaces.create_space_page.wofuer_ist_dieser_space')}
                            rows={3}
                            maxLength={2000}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="flex h-10 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? 'Wird erstellt...' : 'Space erstellen'}
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="flex h-10 items-center justify-center rounded-lg border border-border px-6 text-sm font-medium transition-colors hover:bg-muted"
                        >
                            {t('spaces.create_space_page.abbrechen')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
