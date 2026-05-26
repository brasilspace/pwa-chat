/**
 * GroupPickerPopover
 *
 * Wie TagPickerPopover, aber fuer ContactGroups (strukturelle
 * Zugehoerigkeit). Unterschied zum Tag-Picker: Gruppen koennen
 * eine Kategorie tragen (z.B. 'klasse', 'team') und werden hier
 * gruppiert angezeigt.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
const gateway = createProjectGateway();
import { useT } from '@/lib/i18n/use-t';

interface Group {
    id: string; label: string; slug: string;
    category: string | null; color: string | null;
    description: string | null; internal: boolean;
    memberCount: number;
}

interface Props {
    jwt: string;
    anchorRef: RefObject<HTMLElement | null>;
    onClose: () => void;
    onApply: (mode: 'assign' | 'remove', groupIds: string[], joinedLabel: string) => Promise<void>;
}

export function GroupPickerPopover({ jwt, anchorRef, onClose, onApply }: Props) {
    const t = useT();
    const ref = useRef<HTMLDivElement>(null);
    const [groups, setGroups] = useState<Group[]>([]);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [q, setQ] = useState('');
    const [mode, setMode] = useState<'assign' | 'remove'>('assign');
    const [creating, setCreating] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [newCategory, setNewCategory] = useState('');

    useEffect(() => {
        gateway.listContactGroups(jwt).then(r => setGroups(r.groups as Group[])).catch(() => { });
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

    const filtered = useMemo(() => groups.filter(g => g.label.toLowerCase().includes(q.toLowerCase())), [groups, q]);
    const byCategory = useMemo(() => {
        const m = new Map<string, Group[]>();
        for (const g of filtered) {
            const k = g.category ?? '__uncat';
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(g);
        }
        return [...m.entries()].sort(([a], [b]) => (a === '__uncat' ? 1 : b === '__uncat' ? -1 : a.localeCompare(b)));
    }, [filtered]);

    const toggle = (id: string) => {
        const next = new Set(picked);
        if (next.has(id)) next.delete(id); else next.add(id);
        setPicked(next);
    };

    const applyNow = async () => {
        const ids = [...picked];
        if (ids.length === 0) return;
        const label = groups.filter(g => picked.has(g.id)).map(g => g.label).join(', ');
        await onApply(mode, ids, label);
        setPicked(new Set());
    };

    const createAndPick = async () => {
        const label = newLabel.trim();
        if (!label) return;
        try {
            const r = await gateway.createContactGroup(jwt, {
                label,
                ...(newCategory.trim() ? { category: newCategory.trim() } : {}),
            });
            const fresh: Group = {
                id: r.group.id, label: r.group.label, slug: r.group.slug,
                category: newCategory.trim() || null, color: null, description: null,
                internal: false, memberCount: 0,
            };
            setGroups(prev => [...prev, fresh]);
            setPicked(prev => new Set([...prev, fresh.id]));
            setNewLabel('');
            setNewCategory('');
            setCreating(false);
        } catch { /* silent */ }
    };

    return (
        <div ref={ref} className="absolute right-0 top-full z-50 mt-1 w-80 rounded-md border bg-background p-2 text-foreground shadow-lg">
            <div className="mb-2 flex rounded-md border bg-muted/30 p-0.5 text-[11px]">
                <button
                    onClick={() => setMode('assign')}
                    className={cn('flex-1 rounded px-2 py-1', mode === 'assign' && 'bg-background font-medium text-primary shadow-sm')}
                >
                    {t('contacts.bulk.group_assign_mode')}
                </button>
                <button
                    onClick={() => setMode('remove')}
                    className={cn('flex-1 rounded px-2 py-1', mode === 'remove' && 'bg-background font-medium text-red-600 shadow-sm')}
                >
                    {t('contacts.bulk.group_remove_mode')}
                </button>
            </div>

            <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={t('contacts.bulk.group_search_placeholder')}
                className="mb-2 h-7 w-full rounded border bg-background px-2 text-[12px] outline-none focus:ring-1 focus:ring-primary"
            />

            <div className="max-h-64 overflow-y-auto">
                {byCategory.length === 0 && !creating && (
                    <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                        {t('contacts.bulk.no_groups')}
                    </div>
                )}
                {byCategory.map(([cat, items]) => (
                    <div key={cat} className="mb-1">
                        <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {cat === '__uncat' ? t('contacts.bulk.group_other') : cat}
                        </div>
                        {items.map(g => (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => toggle(g.id)}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-muted"
                            >
                                <span className={cn(
                                    'flex size-4 shrink-0 items-center justify-center rounded border',
                                    picked.has(g.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30',
                                )}>
                                    {picked.has(g.id) && <MaterialIcon name="check" size={12} />}
                                </span>
                                {g.color && <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />}
                                <span className="truncate">{g.label}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground">{g.memberCount}</span>
                            </button>
                        ))}
                    </div>
                ))}
            </div>

            <div className="mt-2 border-t pt-2">
                {creating ? (
                    <div className="space-y-1">
                        <input
                            autoFocus
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') createAndPick(); if (e.key === 'Escape') setCreating(false); }}
                            placeholder={t('contacts.bulk.new_group_label')}
                            className="h-7 w-full rounded border bg-background px-2 text-[12px] outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="flex gap-1">
                            <input
                                value={newCategory}
                                onChange={e => setNewCategory(e.target.value)}
                                placeholder={t('contacts.bulk.new_group_category')}
                                className="h-7 flex-1 rounded border bg-background px-2 text-[11px] outline-none focus:ring-1 focus:ring-primary"
                            />
                            <button onClick={createAndPick} className="h-7 rounded bg-primary px-2 text-[11px] text-primary-foreground">
                                {t('contacts.bulk.create')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setCreating(true)}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-muted"
                    >
                        <MaterialIcon name="add" size={14} />
                        {t('contacts.bulk.new_group')}
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
                            mode === 'assign' ? 'bg-primary text-primary-foreground hover:bg-primary/90' :
                                'bg-red-600 text-white hover:bg-red-700',
                    )}
                >
                    {mode === 'assign' ? t('contacts.bulk.apply_assign') : t('contacts.bulk.apply_remove')}
                </button>
            </div>
        </div>
    );
}
