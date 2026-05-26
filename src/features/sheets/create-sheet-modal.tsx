/**
 * CreateSheetModal — "Neue Tabelle" Dialog mit zwei Modi.
 *
 *   Tab "Leer":      neues Sheet mit minimalem Workbook (sheets.create)
 *   Tab "Vorlage":   instantiiert eine Sheet-Vorlage (dms-templates/instantiate
 *                    auf Sheet-mimeType — gleiche Pipeline wie alle anderen
 *                    DMS-Vorlagen, nur gefiltert)
 */

import { type JSX, useState, useSyncExternalStore, useEffect } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { sheetsApi, type SheetSummary, type SheetTemplate } from './use-sheets';
import { dmsTemplatesApi } from '@/features/dms/use-dms-templates';
import { useSpaces } from '@/features/spaces/use-spaces';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    onClose: () => void;
    onCreated: (sheet: SheetSummary | { id: string; title: string }) => void;
    /** Wenn gesetzt: Default-Scope=SPACE mit dieser ID. */
    spaceId?: string;
}

export function CreateSheetModal({ onClose, onCreated, spaceId }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const role = session.permissions?.effectiveInstanceRole;
    const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
    const { spaces } = useSpaces();
    const [tab, setTab] = useState<'blank' | 'template'>('blank');
    const [title, setTitle] = useState('');
    const [scope, setScope] = useState<'PERSONAL' | 'SPACE'>(spaceId ? 'SPACE' : 'PERSONAL');
    const [chosenSpaceId, setChosenSpaceId] = useState(spaceId ?? '');
    const [busy, setBusy] = useState(false);
    const [templates, setTemplates] = useState<SheetTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<SheetTemplate | null>(null);

    // Templates lazy laden wenn Tab gewechselt wird
    useEffect(() => {
        if (tab !== 'template' || !jwt) return;
        setTemplatesLoading(true);
        sheetsApi.listTemplates(jwt)
            .then(r => setTemplates(r.templates))
            .catch(() => setTemplates([]))
            .finally(() => setTemplatesLoading(false));
    }, [tab, jwt]);

    const seedTemplates = async () => {
        if (!jwt || !isAdmin) return;
        setBusy(true);
        try {
            const r = await sheetsApi.seedTemplates(jwt);
            const list = await sheetsApi.listTemplates(jwt);
            setTemplates(list.templates);
            alert(`${r.created.length} Vorlagen angelegt (${r.totalTemplates} insgesamt verfuegbar).`);
        } catch (e) {
            alert('Seed fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };

    const create = async () => {
        if (!jwt) return;
        if (scope === 'SPACE' && !chosenSpaceId) { alert('Bitte Space auswaehlen'); return; }

        setBusy(true);
        try {
            if (tab === 'blank') {
                if (!title.trim()) return;
                const r = await sheetsApi.create(jwt, {
                    title: title.trim(),
                    scope,
                    spaceId: scope === 'SPACE' ? chosenSpaceId : undefined,
                });
                onCreated(r.sheet);
            } else {
                if (!selectedTemplate) { alert('Bitte Vorlage waehlen'); return; }
                const finalTitle = (title.trim() || selectedTemplate.title.replace(/\.prilog-sheet$/, ''));
                const r = await dmsTemplatesApi.instantiate(jwt, selectedTemplate.id, {
                    title: finalTitle,
                    scope,
                    spaceId: scope === 'SPACE' ? chosenSpaceId : undefined,
                });
                onCreated(r.document);
            }
        } catch (e) {
            alert('Erstellen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
        }
    };

    // Templates nach Kategorie gruppieren
    const grouped = new Map<string, SheetTemplate[]>();
    for (const t of templates) {
        const cat = t.templateCategory ?? 'Allgemein';
        const arr = grouped.get(cat) ?? [];
        arr.push(t);
        grouped.set(cat, arr);
    }

    const canSubmit = (
        tab === 'blank' ? !!title.trim() : !!selectedTemplate
    ) && (scope === 'PERSONAL' || !!chosenSpaceId) && !busy;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-lg bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="font-semibold">{t('sheets.create_sheet_modal.neue_tabelle')}</h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setTab('blank')}
                        className={cn(
                            'flex-1 px-4 py-2 text-sm border-b-2 transition-colors',
                            tab === 'blank' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <MaterialIcon name="add" size={16} className="inline size-3.5 mr-1" /> {t('sheets.create_sheet_modal.leer')}
                    </button>
                    <button
                        onClick={() => setTab('template')}
                        className={cn(
                            'flex-1 px-4 py-2 text-sm border-b-2 transition-colors',
                            tab === 'template' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <MaterialIcon name="star" size={16} className="inline size-3.5 mr-1" /> {t('sheets.create_sheet_modal.aus_vorlage')}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {tab === 'blank' && (
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.create_sheet_modal.titel')}</label>
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder={t('sheets.create_sheet_modal.zb_klassenliste_7a')}
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter' && canSubmit) create(); }}
                                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            />
                        </div>
                    )}

                    {tab === 'template' && (
                        <>
                            {templatesLoading && (
                                <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                            )}

                            {!templatesLoading && templates.length === 0 && (
                                <div className="rounded border border-dashed border-border p-6 text-center space-y-3">
                                    <MaterialIcon name="description" size={16} className="mx-auto size-8 text-muted-foreground" />
                                    <p className="text-sm">{t('sheets.create_sheet_modal.noch_keine_vorlagen')}</p>
                                    {isAdmin ? (
                                        <button
                                            onClick={seedTemplates}
                                            disabled={busy}
                                            className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            {busy ? <Loader2 className="size-3 animate-spin inline" /> : 'Standard-Vorlagen installieren'}
                                        </button>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">{t('sheets.create_sheet_modal.bitte_admin_um_vorlagen-installation')}</p>
                                    )}
                                </div>
                            )}

                            {Array.from(grouped.entries()).map(([cat, items]) => (
                                <div key={cat} className="space-y-1">
                                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{cat}</h3>
                                    <ul className="space-y-1">
                                        {items.map(_t => {
                                            const cleanTitle = _t.title.replace(/\.prilog-sheet$/, '');
                                            const desc = _t.description?.replace(/^\[tpl:[^\]]+\]\s*/, '') ?? '';
                                            return (
                                                <li key={_t.id}>
                                                    <button
                                                        onClick={() => { setSelectedTemplate(_t); if (!title.trim()) setTitle(cleanTitle); }}
                                                        className={cn(
                                                            'flex w-full items-start gap-2 rounded border p-2 text-left text-sm transition-colors hover:bg-muted',
                                                            selectedTemplate?.id === _t.id ? 'border-primary bg-primary/5' : 'border-border',
                                                        )}
                                                    >
                                                        <MaterialIcon name="description" size={16} className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-medium">{cleanTitle}</div>
                                                            {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}

                            {selectedTemplate && (
                                <div>
                                    <label className="text-[10px] font-medium text-muted-foreground">{t('sheets.create_sheet_modal.neuer_titel')}</label>
                                    <input
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        placeholder={t('sheets.create_sheet_modal.titel_der_neuen_tabelle')}
                                        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {/* Scope-Wahl ist gemeinsam */}
                    <div className="flex gap-2 pt-2">
                        <label className={cn('flex-1 cursor-pointer rounded border p-2 text-xs inline-flex items-center gap-2', scope === 'PERSONAL' ? 'border-primary bg-primary/5' : 'border-border')}>
                            <input type="radio" checked={scope === 'PERSONAL'} onChange={() => setScope('PERSONAL')} className="hidden" />
                            <MaterialIcon name="person" size={16} className="size-3.5" /> {t('sheets.create_sheet_modal.mein_fach')}
                        </label>
                        <label className={cn('flex-1 cursor-pointer rounded border p-2 text-xs inline-flex items-center gap-2', scope === 'SPACE' ? 'border-primary bg-primary/5' : 'border-border')}>
                            <input type="radio" checked={scope === 'SPACE'} onChange={() => setScope('SPACE')} className="hidden" />
                            <MaterialIcon name="groups" size={16} className="size-3.5" /> {t('sheets.create_sheet_modal.in_space')}
                        </label>
                    </div>
                    {scope === 'SPACE' && (
                        <select
                            value={chosenSpaceId}
                            onChange={e => setChosenSpaceId(e.target.value)}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                        >
                            <option value="">{t('sheets.create_sheet_modal.space_auswaehlen')}</option>
                            {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-border p-3">
                    <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs">{t('common.cancel')}</button>
                    <button
                        onClick={create}
                        disabled={!canSubmit}
                        className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="size-3 animate-spin inline" /> : 'Erstellen'}
                    </button>
                </div>
            </div>
        </div>
    );
}
