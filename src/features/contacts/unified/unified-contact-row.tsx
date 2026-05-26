/**
 * UnifiedContactRow — Liste-Eintrag, gleich fuer Mitglieder + Externe.
 */

import { type JSX } from 'react';
import { type ContactView, statusPill } from './contact-view';
import { MaterialIcon } from '@/components/ui/material-icon';
import { UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

function formatLastTouch(iso: string | null): string | null {
    if (!iso) return null;
    const ago = Date.now() - new Date(iso).getTime();
    const d = Math.floor(ago / 86400000);
    if (d < 1) return 'heute';
    if (d < 2) return 'gestern';
    if (d < 7) return `vor ${d} Tagen`;
    if (d < 30) return `vor ${Math.floor(d / 7)} Wo`;
    return `vor ${Math.floor(d / 30)} Mon`;
}

function getInitials(c: ContactView): string {
    if (c.source === 'organization') {
        return c.displayName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
    }
    const f = (c.firstName ?? '').trim();
    const l = (c.lastName ?? '').trim();
    return ((f[0] ?? '') + (l[0] ?? '')).toUpperCase() || c.displayName[0]?.toUpperCase() || '?';
}

function avatarColor(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h) + seed.charCodeAt(i);
    return `hsl(${Math.abs(h) % 360}, 65%, 55%)`;
}

export type ContactRowDensity = 'compact' | 'default' | 'expanded';

function formatAddress(addr: ContactView['addresses'][number]): string | null {
    const parts = [addr.street, [addr.postalCode, addr.city].filter(Boolean).join(' ').trim(), addr.country]
        .map(p => p?.trim())
        .filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
}

export function UnifiedContactRow({ contact, selected, onClick, onDoubleClick, density = 'default', checked, onCheckedChange }: {
    contact: ContactView;
    selected: boolean;
    onClick: () => void;
    onDoubleClick?: () => void;
    density?: ContactRowDensity;
    /** Wenn definiert: zeigt Multi-Select-Checkbox am Zeilenanfang. */
    checked?: boolean;
    onCheckedChange?: (next: boolean) => void;
}): JSX.Element {
    const t = useT();
    const initials = getInitials(contact);
    const color = avatarColor(contact.id);
    const lt = formatLastTouch(contact.lastTouchAt);
    const primaryEmail = contact.emails.find(e => e.primary)?.value ?? contact.emails[0]?.value;
    const primaryPhone = contact.phones.find(p => p.primary)?.value ?? contact.phones[0]?.value;
    const primaryAddress = contact.addresses[0];
    const addressLine = primaryAddress ? formatAddress(primaryAddress) : null;
    const status = statusPill(contact);
    const isInactive = contact.source === 'member' && contact.active === false;

    const isCompact = density === 'compact';
    const isExpanded = density === 'expanded';

    return (
        <button
            type="button"
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            className={cn(
                'group flex w-full items-center gap-3 text-left transition-colors hover:bg-muted/50',
                isCompact ? 'px-3 py-1.5' : 'px-3 py-2.5',
                selected && 'bg-primary/5',
                checked && 'bg-primary/10',
            )}
        >
            {onCheckedChange != null && (
                <span
                    role="checkbox"
                    aria-checked={!!checked}
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); onCheckedChange(!checked); }}
                    onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); onCheckedChange(!checked); } }}
                    className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 bg-background hover:border-primary/60',
                    )}
                >
                    {checked && <MaterialIcon name="check" size={12} />}
                </span>
            )}
            {contact.source === 'member' ? (
                <UserAvatar displayName={contact.displayName} size="sm" />
            ) : (
                <div
                    className={cn(
                        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
                        isCompact ? 'size-6 text-[10px]' : 'size-9 text-[11px]',
                    )}
                    style={{ backgroundColor: color }}
                >
                    {contact.source === 'organization' ? <MaterialIcon name="apartment" size={isCompact ? 12 : 16} /> : initials}
                </div>
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className={cn('truncate text-[13px] font-medium', isInactive && 'opacity-50 line-through')}>{contact.displayName}</span>
                    {contact.organization && contact.source === 'person' && (
                        <span className="shrink-0 truncate text-[10px] text-muted-foreground">· {contact.organization.name}</span>
                    )}
                    {contact.badge && contact.source === 'member' && !isCompact && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{contact.badge}</span>
                    )}
                    {contact.admin && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" title={t('contacts.unified.unified_contact_row.workspace-admin')}>{t('contacts.unified.unified_contact_row.admin')}</span>
                    )}
                    {isInactive && !isCompact && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">deaktiviert</span>
                    )}
                    {/* Compact-Modus: Primary-Email als inline-Suffix, damit alles in einer Zeile sitzt */}
                    {isCompact && primaryEmail && (
                        <span className="ml-2 shrink-0 truncate text-[11px] text-muted-foreground">{primaryEmail}</span>
                    )}
                </div>
                {!isCompact && (
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {primaryEmail && <span className="truncate">{primaryEmail}</span>}
                        {primaryPhone && !primaryEmail && <span className="truncate">{primaryPhone}</span>}
                    </div>
                )}
                {isExpanded && (
                    <div className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
                        {primaryPhone && primaryEmail && (
                            <div className="flex items-center gap-1.5">
                                <MaterialIcon name="phone" size={12} className="size-3 shrink-0" />
                                <span className="truncate">{primaryPhone}</span>
                            </div>
                        )}
                        {addressLine && (
                            <div className="flex items-center gap-1.5">
                                <MaterialIcon name="place" size={12} className="size-3 shrink-0" />
                                <span className="truncate">{addressLine}</span>
                            </div>
                        )}
                    </div>
                )}
                {status && !isCompact && (
                    <div className="mt-1">
                        <span className={cn('inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                            status.kind === 'critical' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                            status.kind === 'warn' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                            status.kind === 'info' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                        )}>
                            {status.label}
                        </span>
                    </div>
                )}
                {contact.tags.length > 0 && !isCompact && (
                    <div className="mt-1 flex items-center gap-1 overflow-hidden">
                        {contact.tags.slice(0, 3).map(_t => (
                            <span
                                key={_t.id}
                                className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                style={{ backgroundColor: (_t.color ?? '#94a3b8') + '20', color: _t.color ?? '#475569' }}
                            >
                                {_t.label}
                            </span>
                        ))}
                        {contact.tags.length > 3 && <span className="text-[9px] text-muted-foreground">+{contact.tags.length - 3}</span>}
                    </div>
                )}
            </div>
            {lt && !isCompact && <span className="shrink-0 text-[10px] text-muted-foreground">{lt}</span>}
        </button>
    );
}
