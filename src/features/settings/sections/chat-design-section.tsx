import { type JSX, useCallback, useSyncExternalStore } from 'react';
import { chatSettings, type ChatDesign, type AvatarMode } from '@/core/settings/chat-settings';
import { contrastSettings, type ContrastLevel } from '@/core/settings/contrast-settings';
import { cn } from '@/lib/utils';
import { Image as ImageIcon, Type, EyeOff, Sun } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const AVATAR_MODES: { key: AvatarMode; label: string; description: string; icon: typeof ImageIcon }[] = [
    { key: 'image', label: 'Mit Bild', description: 'Profilbild neben jeder Nachricht.', icon: ImageIcon },
    { key: 'initial', label: 'Buchstabe', description: 'Erster Buchstabe des Namens.', icon: Type },
    { key: 'none', label: 'Keines', description: 'Kein Avatar, nur Name und Text.', icon: EyeOff },
];

const DESIGNS: { key: ChatDesign; label: string; description: string }[] = [
    { key: 'slack', label: 'Slack', description: 'Alle Nachrichten links, mit Avatar und Name.' },
    { key: 'whatsapp', label: 'WhatsApp', description: 'Eigene Nachrichten rechts, kompakt mit Bubbles.' },
];

const CONTRAST_LEVELS: { key: ContrastLevel; label: string; desc: string; tone: string }[] = [
    { key: 'normal', label: 'Normal', desc: 'Standard — angenehm fuer Innenraeume.', tone: 'text-muted-foreground/40' },
    { key: 'medium', label: 'Mittel', desc: 'Kraeftigere Kontraste — Laptop bei Tageslicht.', tone: 'text-amber-400' },
    { key: 'high', label: 'Hoch', desc: 'Maximaler Kontrast — draussen bei Sonnenschein.', tone: 'text-amber-500' },
];

const PRESET_COLORS = [
    '#e5ddd5', '#eae6df', '#d1e7dd', '#dbe4f0',
    '#f0e0d6', '#e8dff5', '#fef9ef', '#f5f5f5',
    '#1a1a2e', '#0b141a', '#1e1e1e', '#2d1b2e',
];

export function ChatDesignSection(): JSX.Element {
    const t = useT();
    const settings = useSyncExternalStore(chatSettings.subscribe, chatSettings.get);
    const contrast = useSyncExternalStore(contrastSettings.subscribe, contrastSettings.get);

    const handleBgChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        chatSettings.setBackground(e.target.value);
    }, []);

    const resetBg = useCallback(() => chatSettings.setBackground(null), []);

    return (
        <div className="space-y-10">
            {/* Kontrast (vormals eigener Reiter "Darstellung") */}
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MaterialIcon name="chat" size={16} className="size-5" /> {t('settings.chat_design.chat-design')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.chat_design.bei_sonnenlicht_oder_draussen_erhoehen_s')}
                </p>

                <div className="mt-6">
                    <p className="text-sm font-medium">{t('settings.chat_design.kontrast')}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        {CONTRAST_LEVELS.map(level => (
                            <button
                                key={level.key}
                                onClick={() => contrastSettings.set(level.key)}
                                className={cn(
                                    'relative rounded-xl border-2 p-4 text-left transition-all',
                                    contrast.contrast === level.key
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:border-primary/40',
                                )}
                            >
                                {contrast.contrast === level.key && (
                                    <div className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary">
                                        <MaterialIcon name="check" size={16} className="size-3 text-primary-foreground" />
                                    </div>
                                )}
                                <div className="mb-2 flex justify-center">
                                    <Sun className={cn('size-7', level.tone)} />
                                </div>
                                <div className="text-center font-medium">{level.label}</div>
                                <div className="mt-0.5 text-center text-xs text-muted-foreground">{level.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Avatar-Modus */}
            <div>
                <h3 className="text-sm font-medium">{t('settings.chat_design.avatare')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('settings.chat_design.wie_sollen_avatare_im_chat_angezeigt_wer')}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {AVATAR_MODES.map((mode) => (
                        <button
                            key={mode.key}
                            onClick={() => chatSettings.setAvatarMode(mode.key)}
                            className={cn(
                                'relative rounded-xl border-2 p-4 text-left transition-all',
                                settings.avatarMode === mode.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                            )}
                        >
                            {settings.avatarMode === mode.key && (
                                <div className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary">
                                    <MaterialIcon name="check" size={16} className="size-3 text-primary-foreground" />
                                </div>
                            )}
                            <div className="mb-3 flex justify-center"><mode.icon className="size-8 text-muted-foreground" /></div>
                            <div className="text-center font-medium">{mode.label}</div>
                            <div className="mt-0.5 text-center text-xs text-muted-foreground">{mode.description}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Layout */}
            <div>
                <h3 className="text-sm font-medium">{t('settings.chat_design.layout')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('settings.chat_design.waehle_wie_dein_chat_aussehen_soll')}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {DESIGNS.map((design) => (
                        <button
                            key={design.key}
                            onClick={() => chatSettings.setDesign(design.key)}
                            className={cn(
                                'relative rounded-xl border-2 p-4 text-left transition-all',
                                settings.design === design.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                            )}
                        >
                            {settings.design === design.key && (
                                <div className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary">
                                    <MaterialIcon name="check" size={16} className="size-3 text-primary-foreground" />
                                </div>
                            )}
                            <div className="mb-3 rounded-lg border p-3" style={{
                                backgroundColor: settings.background ?? (design.key === 'whatsapp' ? '#e5ddd5' : undefined),
                            }}>
                                {design.key === 'slack' ? <SlackPreview /> : <WhatsAppPreview />}
                            </div>
                            <div className="font-medium">{design.label}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{design.description}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Hintergrundfarbe */}
            <div>
                <h3 className="text-sm font-medium">{t('settings.chat_design.hintergrundfarbe')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('settings.chat_design.waehle_eine_hintergrundfarbe_fuer_den_ch')}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {PRESET_COLORS.map((color) => (
                        <button
                            key={color}
                            onClick={() => chatSettings.setBackground(color)}
                            className={cn(
                                'size-8 rounded-lg border-2 transition-all hover:scale-110',
                                settings.background === color ? 'border-primary ring-2 ring-primary/30' : 'border-border',
                            )}
                            style={{ backgroundColor: color }}
                            title={color}
                        />
                    ))}

                    <label className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border transition-all hover:border-primary/40">
                        <input
                            type="color"
                            value={settings.background ?? '#ffffff'}
                            onChange={handleBgChange}
                            className="absolute inset-0 cursor-pointer opacity-0"
                        />
                        <span className="text-xs font-bold text-muted-foreground">+</span>
                    </label>

                    {settings.background && (
                        <button
                            onClick={resetBg}
                            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                        >
                            <MaterialIcon name="restart_alt" size={16} className="size-3" /> {t('settings.chat_design.standard')}
                        </button>
                    )}
                </div>

                <div
                    className="mt-3 rounded-lg border p-3"
                    style={{
                        backgroundColor: settings.background ?? (settings.design === 'whatsapp' ? '#e5ddd5' : undefined),
                    }}
                >
                    {settings.design === 'whatsapp' ? <WhatsAppPreview /> : <SlackPreview />}
                </div>
            </div>
        </div>
    );
}

function SlackPreview() {
    const t = useT();
    return (
        <div className="space-y-1.5">
            <div className="flex items-start gap-2">
                <div className="size-4 shrink-0 rounded bg-muted" />
                <div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-[9px] font-semibold">{t('settings.chat_design.anna')}</span>
                        <span className="text-[8px] text-muted-foreground">10:15</span>
                    </div>
                    <div className="mt-0.5 rounded bg-muted px-2 py-1 text-[9px]">{t('settings.chat_design.guten_morgen')}</div>
                </div>
            </div>
            <div className="flex items-start gap-2">
                <div className="size-4 shrink-0 rounded bg-primary/20" />
                <div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-[9px] font-semibold text-primary">{t('settings.chat_design.du')}</span>
                        <span className="text-[8px] text-muted-foreground">10:16</span>
                    </div>
                    <div className="mt-0.5 rounded bg-muted px-2 py-1 text-[9px]">{t('settings.chat_design.hallo')}</div>
                </div>
            </div>
        </div>
    );
}

function WhatsAppPreview() {
    const t = useT();
    return (
        <div className="space-y-1.5">
            <div className="flex justify-start">
                <div className="rounded-lg rounded-tl-none bg-white px-2 py-1 shadow-sm dark:bg-[#202c33]">
                    <div className="text-[9px] font-semibold text-emerald-600">{t('settings.chat_design.anna')}</div>
                    <div className="text-[9px]">{t('settings.chat_design.guten_morgen')}</div>
                    <div className="mt-0.5 text-right text-[7px] text-muted-foreground">10:15</div>
                </div>
            </div>
            <div className="flex justify-end">
                <div className="rounded-lg rounded-tr-none bg-[#d9fdd3] px-2 py-1 shadow-sm dark:bg-[#005c4b]">
                    <div className="text-[9px]">{t('settings.chat_design.hallo')}</div>
                    <div className="mt-0.5 text-right text-[7px] text-muted-foreground">10:16</div>
                </div>
            </div>
        </div>
    );
}
