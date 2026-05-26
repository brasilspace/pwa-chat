/**
 * BirthdaysBox — Dashboard-Card "Geburtstage diese Woche".
 * Zeigt Mitglieder + externe Kontakte mit Geburtstag in den naechsten 7 Tagen.
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { externalContactsApi, type ExternalContactSummary } from '@/gateways/platform/external-contacts-gateway';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { BoxShell, BoxEmpty, BoxSkeleton } from './box-shell';
import { MaterialIcon } from '@/components/ui/material-icon';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useT } from "@/lib/i18n/use-t";

const platformGateway = createPlatformGateway();
const DAYS_MS = 86_400_000;

interface BirthdayPerson {
    id: string;
    refId: string;
    displayName: string;
    avatarMember: boolean;
    daysUntil: number;
    age: number | null;
}

function buildBirthdayList(members: { id: string; displayName: string; birthDate?: string | null }[], externals: ExternalContactSummary[]): BirthdayPerson[] {
    const out: BirthdayPerson[] = [];
    const now = new Date();
    const consider = (id: string, refId: string, displayName: string, isMember: boolean, birthDate: string | null | undefined) => {
        if (!birthDate) return;
        const bd = new Date(birthDate);
        if (isNaN(bd.getTime())) return;
        const thisYear = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
        const nextYear = new Date(now.getFullYear() + 1, bd.getMonth(), bd.getDate());
        const target = thisYear.getTime() < now.getTime() - DAYS_MS ? nextYear : thisYear;
        const diff = target.getTime() - now.getTime();
        const daysUntil = Math.round(diff / DAYS_MS);
        if (daysUntil < -1 || daysUntil > 7) return;
        const age = target.getFullYear() - bd.getFullYear();
        out.push({ id, refId, displayName, avatarMember: isMember, daysUntil, age });
    };
    for (const m of members) consider(`m:${m.id}`, m.id, m.displayName, true, m.birthDate);
    for (const e of externals) consider(`x:${e.id}`, e.id, e.displayName, false, e.birthDate);
    out.sort((a, b) => a.daysUntil - b.daysUntil);
    return out;
}

export function BirthdaysBox(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const [list, setList] = useState<BirthdayPerson[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        let aborted = false;
        (async () => {
            try {
                const [usersRes, externalsRes] = await Promise.all([
                    platformGateway.getUsers(jwt),
                    externalContactsApi.list({ limit: 500 }).catch(() => ({ items: [] as ExternalContactSummary[] })),
                ]);
                if (aborted) return;
                const members = usersRes.users.map((u: { id: string; displayName: string; birthDate?: string | null }) => ({
                    id: u.id, displayName: u.displayName, birthDate: u.birthDate ?? null,
                }));
                setList(buildBirthdayList(members, externalsRes.items));
            } catch { /* silent */ }
            finally { if (!aborted) setLoading(false); }
        })();
        return () => { aborted = true; };
    }, [jwt]);

    return (
        <BoxShell
            icon={<span className="text-base">🎂</span>}
            title={t('dashboard.boxes.birthdays.geburtstage')}
            action={list.length > 0 ? <span className="text-xs text-muted-foreground">{list.length}</span> : null}
        >
            {loading && <BoxSkeleton />}
            {!loading && list.length === 0 && (
                <BoxEmpty>{t('dashboard.boxes.birthdays.keine_geburtstage_in_den_naechsten_7_tag')}</BoxEmpty>
            )}
            {!loading && list.length > 0 && (
                <ul className="space-y-1.5">
                    {list.slice(0, 6).map((p) => (
                        <li key={p.id}>
                            <button
                                onClick={() => navigate(`/contacts?focus=${encodeURIComponent(p.refId)}`)}
                                className="flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors hover:bg-muted/50"
                            >
                                {p.avatarMember
                                    ? <UserAvatar displayName={p.displayName} size="sm" />
                                    : <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">🎂</div>}
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[13px] font-medium">{p.displayName}</div>
                                    <div className="text-[11px] text-muted-foreground">
                                        {p.daysUntil === 0 ? 'heute' : p.daysUntil === 1 ? 'morgen' : `in ${p.daysUntil} Tagen`}
                                        {p.age != null && p.age > 0 && p.age < 120 && ` · wird ${p.age}`}
                                    </div>
                                </div>
                                {p.daysUntil <= 1 && (
                                    <MaterialIcon name="celebration" size={14} className="size-3.5 shrink-0 text-amber-500" />
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </BoxShell>
    );
}
