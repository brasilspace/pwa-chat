/**
 * IconPicker — Kuratierte Auswahl von Lucide-Icons fuer AudioGuide-Cues.
 *
 * Wir nutzen einen festen Subset (~40 Icons) damit das Bundle nicht
 * den ganzen Lucide-Namespace ziehen muss. Die ausgewaehlten Icons
 * decken die haeufigsten Tour-/Lehr-/Aktions-Faelle ab.
 *
 * Wer ein anderes Icon braucht, kann den Subset hier erweitern oder
 * spaeter ueber einen Volltext-Picker mit Tree-Shaking-freundlichem
 * Loader (TBD).
 */

import { type JSX, useState } from 'react';
import {
    LayoutGrid, Users, CheckSquare, Calendar, FolderOpen, GitBranch,
    Star, Inbox, Sparkles,
    BookOpen, GraduationCap, Lightbulb, Brain,
    User, UserCheck, Heart, Smile,
    FileText, FileImage, FilePlus2, Upload, Download,
    Settings, Cog, Wrench,
    Play, Pause, Plus, Minus, Edit, Trash2, Save,
    Bell, AlertTriangle, Info, HelpCircle,
    Mail, MessageSquare, Phone, Video,
    ArrowRight, ArrowLeft, Navigation, MapPin, Compass,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ICON_LIBRARY: Record<string, LucideIcon> = {
    'layout-grid': LayoutGrid,
    'users': Users,
    'check-square': CheckSquare,
    'calendar': Calendar,
    'folder-open': FolderOpen,
    'git-branch': GitBranch,
    'star': Star,
    'inbox': Inbox,
    'sparkles': Sparkles,
    'book-open': BookOpen,
    'graduation-cap': GraduationCap,
    'lightbulb': Lightbulb,
    'brain': Brain,
    'user': User,
    'user-check': UserCheck,
    'heart': Heart,
    'smile': Smile,
    'file-text': FileText,
    'file-image': FileImage,
    'file-plus': FilePlus2,
    'upload': Upload,
    'download': Download,
    'settings': Settings,
    'cog': Cog,
    'wrench': Wrench,
    'play': Play,
    'pause': Pause,
    'plus': Plus,
    'minus': Minus,
    'edit': Edit,
    'trash': Trash2,
    'save': Save,
    'bell': Bell,
    'alert-triangle': AlertTriangle,
    'info': Info,
    'help-circle': HelpCircle,
    'mail': Mail,
    'message-square': MessageSquare,
    'phone': Phone,
    'video': Video,
    'arrow-right': ArrowRight,
    'arrow-left': ArrowLeft,
    'navigation': Navigation,
    'map-pin': MapPin,
    'compass': Compass,
};

export const ICON_NAMES = Object.keys(ICON_LIBRARY);

/** Lookup mit Fallback auf Sparkles fuer unbekannte Namen. */
export function getIcon(name: string): LucideIcon {
    return ICON_LIBRARY[name] ?? Sparkles;
}

interface PickerProps {
    value: string;
    onChange: (name: string) => void;
}

export function IconPicker({ value, onChange }: PickerProps): JSX.Element {
    const [open, setOpen] = useState(false);
    const Selected = getIcon(value);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    'flex h-8 w-10 items-center justify-center rounded border border-border bg-background hover:bg-muted',
                    open && 'ring-1 ring-primary',
                )}
                title={value || 'Icon waehlen'}
            >
                <Selected className="size-4" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 top-full z-50 mt-1 grid w-64 grid-cols-8 gap-1 rounded border border-border bg-popover p-2 shadow-lg">
                        {ICON_NAMES.map((name) => {
                            const Ico = ICON_LIBRARY[name];
                            const isActive = name === value;
                            return (
                                <button
                                    key={name}
                                    type="button"
                                    onClick={() => { onChange(name); setOpen(false); }}
                                    title={name}
                                    className={cn(
                                        'flex size-7 items-center justify-center rounded transition-colors',
                                        isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                                    )}
                                >
                                    <Ico className="size-3.5" />
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
