/**
 * BulkActionsBar
 *
 * Erscheint ueber der Kontaktliste, sobald >=1 Kontakt markiert ist.
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │  3 Kontakte ausgewaehlt   [Tag ▼] [Gruppe ▼] [...]      ✕    │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Buttons oeffnen das Tag-/Gruppen-Picker-Popover. Jede Aktion
 * schickt einen Bulk-Request, zeigt einen Undo-Toast und triggert
 * onActionComplete (Liste neu laden + Verlauf invalidieren).
 */
import { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
const gateway = createProjectGateway();
import { useT } from '@/lib/i18n/use-t';
import type { ContactView } from '@/features/contacts/unified/contact-view';
import { GroupPickerPopover } from './group-picker-popover';
import { TagPickerPopover } from './tag-picker-popover';
import { showUndoToast } from './undo-toast';

interface Props {
    jwt: string;
    selected: ContactView[];
    /** Alle aktuell gefilterten Kontakte — fuer "Alle gefilterten markieren". */
    filteredCount: number;
    onSelectAll: () => void;
    onClear: () => void;
    onActionComplete: () => void;
}

export function BulkActionsBar({ jwt, selected, filteredCount, onSelectAll, onClear, onActionComplete }: Props) {
    const t = useT();
    const count = selected.length;
    const [openPopover, setOpenPopover] = useState<'tag' | 'group' | null>(null);
    const tagBtnRef = useRef<HTMLButtonElement>(null);
    const groupBtnRef = useRef<HTMLButtonElement>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClear(); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClear]);

    const memberContacts = selected.filter(c => c.source === 'member' && c.refId);

    async function applyTagBulk(mode: 'add' | 'remove', tagIds: string[], tagLabel: string) {
        if (busy || memberContacts.length === 0 || tagIds.length === 0) return;
        setBusy(true);
        try {
            const contacts = memberContacts.map(c => ({ userMatrixId: c.refId! }));
            const fn = mode === 'add' ? gateway.bulkAddContactTags : gateway.bulkRemoveContactTags;
            const res = await fn(jwt, { tagIds, contacts });
            setOpenPopover(null);
            onActionComplete();
            showUndoToast({
                jwt,
                batchId: res.batchId,
                summary: mode === 'add'
                    ? t('contacts.bulk.tag_added', { count: res.affectedCount, label: tagLabel })
                    : t('contacts.bulk.tag_removed', { count: res.affectedCount, label: tagLabel }),
                onUndone: onActionComplete,
            });
        } finally {
            setBusy(false);
        }
    }

    async function applyGroupBulk(mode: 'assign' | 'remove', groupIds: string[], groupLabel: string) {
        if (busy || selected.length === 0 || groupIds.length === 0) return;
        setBusy(true);
        try {
            const contacts = selected.map(c => c.source === 'member' && c.refId
                ? { userMatrixId: c.refId }
                : { externalContactId: c.refId },
            ).filter(c => c.userMatrixId || c.externalContactId);
            const fn = mode === 'assign' ? gateway.bulkAssignContactGroups : gateway.bulkRemoveContactGroups;
            const res = await fn(jwt, { groupIds, contacts });
            setOpenPopover(null);
            onActionComplete();
            showUndoToast({
                jwt,
                batchId: res.batchId,
                summary: mode === 'assign'
                    ? t('contacts.bulk.group_assigned', { count: res.affectedCount, label: groupLabel })
                    : t('contacts.bulk.group_removed', { count: res.affectedCount, label: groupLabel }),
                onUndone: onActionComplete,
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-primary/30 bg-primary px-3 py-2 text-[13px] text-primary-foreground shadow-sm">
            <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 font-semibold">
                    <MaterialIcon name="check_circle" size={18} />
                    {t('contacts.bulk.selected_count', { count })}
                </span>
                {filteredCount > count && (
                    <button
                        type="button"
                        onClick={onSelectAll}
                        className="rounded border border-primary-foreground/30 px-2 py-0.5 text-[11px] underline-offset-2 hover:bg-primary-foreground/10"
                    >
                        {t('contacts.bulk.select_all_filtered', { count: filteredCount })}
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2">
                <div className="relative">
                    <button
                        ref={tagBtnRef}
                        type="button"
                        onClick={() => setOpenPopover(p => p === 'tag' ? null : 'tag')}
                        disabled={busy || memberContacts.length === 0}
                        className={cn(
                            'inline-flex h-8 items-center gap-1.5 rounded-md bg-background px-3 text-[13px] font-medium text-primary',
                            'shadow-sm hover:bg-background/90 disabled:opacity-50',
                            openPopover === 'tag' && 'ring-2 ring-primary-foreground/60',
                        )}
                        title={memberContacts.length === 0 ? t('contacts.bulk.tags_only_members') : undefined}
                    >
                        <MaterialIcon name="sell" size={16} />
                        {t('contacts.bulk.tag')}
                        <MaterialIcon name="arrow_drop_down" size={16} />
                    </button>
                    {openPopover === 'tag' && (
                        <TagPickerPopover
                            jwt={jwt}
                            anchorRef={tagBtnRef}
                            onClose={() => setOpenPopover(null)}
                            onApply={applyTagBulk}
                        />
                    )}
                </div>

                <div className="relative">
                    <button
                        ref={groupBtnRef}
                        type="button"
                        onClick={() => setOpenPopover(p => p === 'group' ? null : 'group')}
                        disabled={busy}
                        className={cn(
                            'inline-flex h-8 items-center gap-1.5 rounded-md bg-background px-3 text-[13px] font-medium text-primary',
                            'shadow-sm hover:bg-background/90 disabled:opacity-50',
                            openPopover === 'group' && 'ring-2 ring-primary-foreground/60',
                        )}
                    >
                        <MaterialIcon name="group" size={16} />
                        {t('contacts.bulk.group')}
                        <MaterialIcon name="arrow_drop_down" size={16} />
                    </button>
                    {openPopover === 'group' && (
                        <GroupPickerPopover
                            jwt={jwt}
                            anchorRef={groupBtnRef}
                            onClose={() => setOpenPopover(null)}
                            onApply={applyGroupBulk}
                        />
                    )}
                </div>

                <button
                    type="button"
                    onClick={onClear}
                    className="ml-1 inline-flex size-8 items-center justify-center rounded-md text-primary-foreground/80 hover:bg-primary-foreground/15"
                    title={t('contacts.bulk.clear_selection')}
                >
                    <MaterialIcon name="close" size={18} />
                </button>
            </div>
        </div>
    );
}
