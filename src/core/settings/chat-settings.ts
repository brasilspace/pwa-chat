export type ChatDesign = 'slack' | 'whatsapp';
export type AvatarMode = 'image' | 'initial' | 'none';

const DESIGN_KEY = 'prilog.chat.design';
const BG_KEY = 'prilog.chat.background';
const AVATAR_KEY = 'prilog.chat.avatar';

const listeners = new Set<() => void>();

// pwa-chat: Default ist 'whatsapp' (Messenger-Look). Voll-Web-Client nutzt 'slack'.
let currentDesign: ChatDesign = (localStorage.getItem(DESIGN_KEY) as ChatDesign) || 'whatsapp';
let currentBg: string | null = localStorage.getItem(BG_KEY);
let currentAvatar: AvatarMode = (localStorage.getItem(AVATAR_KEY) as AvatarMode) || 'initial';

export interface ChatSettingsSnapshot {
    design: ChatDesign;
    background: string | null;
    avatarMode: AvatarMode;
}

let snapshot: ChatSettingsSnapshot = { design: currentDesign, background: currentBg, avatarMode: currentAvatar };

function emit() {
    snapshot = { design: currentDesign, background: currentBg, avatarMode: currentAvatar };
    for (const fn of listeners) fn();
}

export const chatSettings = {
    get(): ChatSettingsSnapshot {
        return snapshot;
    },

    setDesign(design: ChatDesign) {
        currentDesign = design;
        localStorage.setItem(DESIGN_KEY, design);
        emit();
    },

    setBackground(color: string | null) {
        currentBg = color;
        if (color) {
            localStorage.setItem(BG_KEY, color);
        } else {
            localStorage.removeItem(BG_KEY);
        }
        emit();
    },

    setAvatarMode(mode: AvatarMode) {
        currentAvatar = mode;
        localStorage.setItem(AVATAR_KEY, mode);
        emit();
    },

    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
};
