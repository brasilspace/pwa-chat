import { type JSX, useState, useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { useMatrixAvatar } from './matrix-avatar';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import { cn } from '@/lib/utils';
import { Mail, AtSign, Shield, User } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

interface UserInfoPanelProps {
    userId: string; // Matrix user ID
    displayName: string;
    username: string;
    email?: string | null;
    userType?: string | null;
    avatarMxc?: string | null;
    onClose: () => void;
}

export function UserInfoPanel({ userId, displayName, username, email, userType, avatarMxc, onClose }: UserInfoPanelProps): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const avatarUrl = useMatrixAvatar(avatarMxc, session.matrix?.accessToken);
    const initials = displayName ? displayName.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) : '?';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div className="w-full max-w-sm rounded-xl bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                {/* Header with avatar */}
                <div className="relative flex flex-col items-center rounded-t-xl bg-gradient-to-b from-primary/10 to-background px-6 pb-4 pt-8">
                    <button onClick={onClose} className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MaterialIcon name="close" size={16} className="size-4" />
                    </button>

                    <Avatar className="size-20 ring-4 ring-background">
                        {avatarUrl ? (
                            <AvatarImage src={avatarUrl} alt={displayName} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-2xl text-primary">
                            {initials}
                        </AvatarFallback>
                    </Avatar>

                    <h3 className="mt-3 text-lg font-semibold">{displayName}</h3>
                    <p className="text-sm text-muted-foreground">@{username}</p>
                </div>

                {/* Details */}
                <div className="space-y-1 px-6 py-4">
                    {userType && (
                        <InfoRow icon={Shield} label={t('app.misc.rolle')} value={userType} />
                    )}

                    {email && (
                        <InfoRow icon={Mail} label={t('app.misc.e-mail')} value={email} />
                    )}

                    <InfoRow icon={AtSign} label={t('app.misc.matrix-id')} value={userId} mono />

                    <InfoRow icon={User} label={t('app.misc.benutzername')} value={username} />
                </div>

                {/* Shared Spaces */}
                <UserSpacesSection userId={userId} />

                {/* Footer */}
                <div className="border-t px-6 py-3">
                    <p className="text-center text-[10px] text-muted-foreground">
                        {t('app.misc.profilbild_und_name_werden_in_den_einste')}
                    </p>
                </div>
            </div>
        </div>
    );
}

const userSpaceGw = createProjectGateway();

function UserSpacesSection({ userId }: { userId: string }) {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();

    const [spaces, setSpaces] = useState<Array<{ id: string; name: string; color: string | null; role: string }>>([]);

    useEffect(() => {
        if (!jwt) return;
        userSpaceGw.getUserSpaces(jwt, userId)
            .then(res => setSpaces(res.spaces))
            .catch(() => { });
    }, [jwt, userId]);

    if (spaces.length === 0) return null;

    return (
        <div className="border-t px-6 py-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MaterialIcon name="grid_view" size={16} className="size-3" />
                {t('app.misc.gemeinsame_spaces')}{spaces.length})
            </p>
            <div className="max-h-32 space-y-0.5 overflow-y-auto">
                {spaces.map(space => (
                    <button
                        key={space.id}
                        onClick={() => navigate(`/spaces/${space.id}/chat`)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/50"
                    >
                        <div className="size-2 shrink-0 rounded-full" style={{ backgroundColor: space.color ?? '#94a3b8' }} />
                        <span className="min-w-0 flex-1 truncate">{space.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function InfoRow({ icon: Icon, label, value, mono }: { icon: typeof User; label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
                <p className={cn('text-sm', mono && 'font-mono text-xs')}>{value}</p>
            </div>
        </div>
    );
}
