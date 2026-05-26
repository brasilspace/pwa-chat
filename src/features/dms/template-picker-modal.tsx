/**
 * TemplatePickerModal — "Neu aus Vorlage": Vorlage waehlen, Titel, Scope, instantiieren.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useDmsTemplates, dmsTemplatesApi, type DmsTemplate } from './use-dms-templates';
import { useSpaces } from '@/features/spaces/use-spaces';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    onClose: () => void;
    onCreated: (doc: { id: string; title: string }) => void;
    /** Wenn gesetzt: Default-Scope=SPACE mit dieser spaceId. */
    spaceId?: string;
}

export function TemplatePickerModal({ onClose, onCreated, spaceId }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { templates, loading } = useDmsTemplates();
    const { spaces } = useSpaces();
    const [selected, setSelected] = useState<DmsTemplate | null>(null);
    const [title, setTitle] = useState('');
    const [scope, setScope] = useState<'PERSONAL' | 'SPACE'>(spaceId ? 'SPACE' : 'PERSONAL');
    const [chosenSpaceId, setChosenSpaceId] = useState<string>(spaceId ?? '');
    const [busy, setBusy] = useState(false);

    const grouped = new Map<string, DmsTemplate[]>();
    for (const t of templates) {
        const cat = t.templateCategory ?? '— Allgemein —';
        const arr = grouped.get(cat) ?? [];
        arr.push(t);
        grouped.set(cat, arr);
    }

    const create = async () => {
        if (!jwt || !selected || !title.trim()) return;
        if (scope === 'SPACE' && !chosenSpaceId) {
            alert('Bitte Space auswaehlen');
            return;
        }
        setBusy(true);
        try {
            const r = await dmsTemplatesApi.instantiate(jwt, selected.id, {
                title: title.trim(),
                scope,
                spaceId: scope === 'SPACE' ? chosenSpaceId : undefined,
            });
            onCreated(r.document);
            onClose();
        } catch (e) {
            alert('Erstellen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-4">
                    <h2 className="flex items-center gap-2 font-semibold"><MaterialIcon name="star" size={16} className="size-4" /> {t('dms.template_picker_modal.neu_aus_vorlage')}</h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={16} className="size-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading && <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}

                    {!loading && templates.length === 0 && (
                        <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            {t('dms.template_picker_modal.noch_keine_vorlagen_verfuegbar_admin_mus')}
                        </div>
                    )}

                    {Array.from(grouped.entries()).map(([cat, items]) => (
                        <div key={cat} className="space-y-2">
                            <h3 className="text-xs font-semibold text-muted-foreground">{cat}</h3>
                            <ul className="space-y-1">
                                {items.map(_t => (
                                    <li key={_t.id}>
                                        <button
                                            onClick={() => { setSelected(_t); if (!title.trim()) setTitle(_t.title); }}
                                            className={cn(
                                                'flex w-full items-center gap-2 rounded border p-2 text-left text-sm hover:bg-muted',
                                                selected?.id === _t.id ? 'border-primary bg-primary/5' : 'border-border'
                                            )}
                                        >
                                            <MaterialIcon name="description" size={16} className="size-4 text-muted-foreground shrink-0" />
                                            <span className="flex-1 truncate">{_t.title}</span>
                                            <span className="text-[10px] text-muted-foreground">{_t.mimeType.split('/')[1]?.toUpperCase()}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {selected && (
                    <div className="border-t border-border p-4 space-y-3">
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground">{t('dms.template_picker_modal.neuer_titel')}</label>
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder={t('dms.template_picker_modal.titel_des_neuen_dokuments')}
                                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            />
                        </div>
                        <div className="flex gap-2">
                            <label className={cn('flex-1 rounded border p-2 text-xs cursor-pointer', scope === 'PERSONAL' ? 'border-primary bg-primary/5' : 'border-border')}>
                                <input type="radio" checked={scope === 'PERSONAL'} onChange={() => setScope('PERSONAL')} className="mr-1" />
                                {t('dms.template_picker_modal.mein_fach')}
                            </label>
                            <label className={cn('flex-1 rounded border p-2 text-xs cursor-pointer', scope === 'SPACE' ? 'border-primary bg-primary/5' : 'border-border')}>
                                <input type="radio" checked={scope === 'SPACE'} onChange={() => setScope('SPACE')} className="mr-1" />
                                {t('dms.template_picker_modal.in_space')}
                            </label>
                        </div>
                        {scope === 'SPACE' && (
                            <select
                                value={chosenSpaceId}
                                onChange={e => setChosenSpaceId(e.target.value)}
                                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            >
                                <option value="">{t('dms.template_picker_modal.space_auswaehlen')}</option>
                                {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        )}
                        <div className="flex justify-end gap-2">
                            <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs">{t('common.cancel')}</button>
                            <button
                                onClick={create}
                                disabled={busy || !title.trim() || (scope === 'SPACE' && !chosenSpaceId)}
                                className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {busy ? <Loader2 className="size-3 animate-spin inline" /> : 'Erstellen'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
