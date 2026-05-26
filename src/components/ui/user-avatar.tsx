import { useSyncExternalStore } from 'react';
import { chatSettings } from '@/core/settings/chat-settings';
import { sessionStore } from '@/core/session/session-store';
import { useMatrixAvatar } from './matrix-avatar';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
    displayName: string;
    avatarMxc?: string | null;
    size?: 'sm' | 'md' | 'lg';
    /** Force show regardless of avatarMode setting (e.g. in profile page) */
    forceShow?: boolean;
}

const sizeClasses = {
    sm: 'size-6 text-[10px]',
    md: 'size-7 text-[11px]',
    lg: 'size-10 text-sm',
};

export function UserAvatar({ displayName, avatarMxc, size = 'md', forceShow }: UserAvatarProps) {
    const { avatarMode } = useSyncExternalStore(chatSettings.subscribe, chatSettings.get);
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const wantImage = forceShow || avatarMode === 'image';
    const avatarUrl = useMatrixAvatar(wantImage ? avatarMxc : null, session.matrix?.accessToken);

    if (!forceShow && avatarMode === 'none') return null;

    const initial = displayName.charAt(0).toUpperCase();
    const showInitial = forceShow || avatarMode === 'initial' || (avatarMode === 'image' && !avatarUrl);

    return (
        <Avatar className={cn('shrink-0', sizeClasses[size])}>
            {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
            <AvatarFallback className={sizeClasses[size]}>
                {showInitial ? initial : ''}
            </AvatarFallback>
        </Avatar>
    );
}
