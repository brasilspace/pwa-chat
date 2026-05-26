/**
 * TagPickerPopover
 *
 * Schwebt unterhalb des Tag-Buttons in der BulkActionsBar.
 * Listet alle vorhandenen Contact-Tags + "Neuen Tag anlegen".
 * Aktion: Tag(s) hinzufuegen ODER Tag(s) entfernen — Toggle oben.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
const gateway = createProjectGateway();
import { useT } from '@/lib/i18n/use-t';

interface Tag { id: string; label: string; slug: string; color: string | null }

interface Props {
    jwt: string;
    anchorRef: RefObject<HTMLElement | null>;
    onClose: () => void;
    onApply: (mode: 'add' | 'remove', tagIds: string[], joinedLabel: string) => Promise<void>;
}

export function TagPickerPopover({ jwt, anchorRef, onClose, onApply }: Props) {
    const t = useT();
    const ref = useRef<HTMLDivElement>(null);
    const [tags, setTags] = useState<Tag[]>([]);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [q, setQ] = useState('');
    const [mode, setMode] = useState<'add' | 'remove'>('add');
    const [creating, setCreating] = useState(false);
    const [newLabel, setNewLabel] = useState('');

    useEffect(() => {
        gateway.listContactTags(jwt).then(r => setTags(r.tags as Tag[])).catch(() => { });
    }, [jwt]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!ref.current) return;
            if (ref.current.contains(e.target as Node)) return;
            if (anchorRef.current && anchorRef.current.contains(e.target as Node)) return;
            onClose();
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [onClose, anchorRef]);

    const filtered = useMemo(() => tags.filter(t => t.label.toLowerCase().includes(q.toLowerCase())), [tags, q]);

    const toggle = (id: string) => {
        const next = new Set(picked);
        if (next.has(id)) next.delete(id); else next.add(id);
        setPicked(next);
    };

    const applyNow = async () => {
        const ids = [...picked];
        if (ids.length === 0) return;
        const label = tags.filter(t => picked.has(t.id)).map(t => t.label).join(', ');
        await onApply(mode, ids, label);
        setPicked(new Set());
    };

    const createAndPick = async () => {
        const label = newLabel.trim();
        if (!label) return;
        try {
            const r = await gateway.createContactTag(jwt, { label });
            const newTag: Tag = { id: r.tag.id, label: r.tag.label, slug: r.tag.slug, color: r.tag.color };
            setTags(prev => [...prev, newTag]);
            setPicked(prev => new Set([...prev, newTag.id]));
            setNewLabel('');
            setCreating(false);
        } catch { /* silent */ }
    };

    return (
        <div ref={ref} className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border bg-background p-2 text-foreground shadow-lg">
            {/* Mode-Toggle */}
            <div className="mb-2 flex rounded-md border bg-muted/30 p-0.5 text-[11px]">
                <button
                    onClick={() => setMode('add')}
                    className={cn('flex-1 rounded px-2 py-1', mode === 'add' && 'bg-background font-medium text-primary shadow-sm')}
                >
                    {t('contacts.bulk.tag_add_mode')}
                </button>
                <button
                    onClick={() => setMode('remove')}
                    className={cn('flex-1 rounded px-2 py-1', mode === 'remove' && 'bg-background font-medium text-red-600 shadow-sm')}
                >
                    {t('contacts.bulk.tag_remove_mode')}
                </button>
            </div>

            <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={t('contacts.bulk.tag_search_placeholder')}
                className="mb-2 h-7 w-full rounded border bg-background px-2 text-[12px] outline-none focus:ring-1 focus:ring-primary"
            />

            <div className="max-h-56 overflow-y-auto">
                {filtered.length === 0 && !creating && (
                    <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                        {t('contacts.bulk.no_tags')}
                    </div>
                )}
                {filtered.map(tag => (
                    <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggle(tag.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-muted"
                    >
                        <span className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded border',
                            picked.has(tag.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30',
                        )}>
                            {picked.has(tag.id) && <MaterialIcon name="check" size={12} />}
                        </span>
                        {tag.color && <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />}
                        <span className="truncate">{tag.label}</span>
                    </button>
                ))}
            </div>

            <div className="mt-2 border-t pt-2">
                {creating ? (
                    <div className="flex gap-1">
                        <input
                            autoFocus
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') createAndPick(); if (e.key === 'Escape') setCreating(false); }}
                            placeholder={t('contacts.bulk.new_tag_label')}
                            className="h-7 flex-1 rounded border bg-background px-2 text-[12px] outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button onClick={createAndPick} className="h-7 rounded bg-primary px-2 text-[11px] text-primary-foreground">
                            {t('contacts.bulk.create')}
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setCreating(true)}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-muted"
                    >
                        <MaterialIcon name="add" size={14} />
                        {t('contacts.bulk.new_tag')}
                    </button>
                )}
            </div>

            <div className="mt-2 flex items-center justify-between border-t pt-2">
                <span className="text-[10px] text-muted-foreground">
                    {picked.size > 0 ? t('contacts.bulk.picked_count', { count: picked.size }) : ' '}
                </span>
                <button
                    type="button"
                    disabled={picked.size === 0}
                    onClick={applyNow}
                    className={cn(
                        'inline-flex h-7 items-center rounded px-3 text-[12px]',
                        picked.size === 0 ? 'cursor-not-allowed bg-muted text-muted-foreground' :
                            mode === 'add' ? 'bg-primary text-primary-foreground hover:bg-primary/90' :
                                'bg-red-600 text-white hover:bg-red-700',
                    )}
                >
                    {mode === 'add' ? t('contacts.bulk.apply_add') : t('contacts.bulk.apply_remove')}
                </button>
            </div>
        </div>
    );
}
