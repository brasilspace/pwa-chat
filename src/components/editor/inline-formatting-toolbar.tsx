/**
 * InlineFormattingToolbar — kleines BubbleMenu fuer Selektions-Formatierung.
 *
 * Erscheint, wenn Text im Editor selektiert ist. Bietet die wichtigsten
 * Inline-Format-Optionen fuer den Chat-Composer.
 */

import { type JSX } from 'react';
import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Code, Strikethrough, ListOrdered } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    editor: Editor | null;
}

export function InlineFormattingToolbar({ editor }: Props): JSX.Element | null {
    const t = useT();
    if (!editor) return null;
    return (
        <BubbleMenu
            editor={editor}
            options={{ placement: 'top' }}
        >
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-md">
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    active={editor.isActive('bold')}
                    title={t('app.misc.fett_strgb')}
                >
                    <Bold className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    active={editor.isActive('italic')}
                    title={t('app.misc.kursiv_strgi')}
                >
                    <Italic className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    active={editor.isActive('strike')}
                    title={t('app.misc.durchgestrichen')}
                >
                    <Strikethrough className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    active={editor.isActive('code')}
                    title={t('app.misc.inline-code')}
                >
                    <Code className="size-3.5" />
                </ToolbarButton>
                <div className="mx-0.5 h-4 w-px bg-border" />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    active={editor.isActive('bulletList')}
                    title={t('app.misc.aufzaehlung')}
                >
                    <MaterialIcon name="format_list_bulleted" size={16} className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    active={editor.isActive('orderedList')}
                    title={t('app.misc.nummerierte_liste')}
                >
                    <ListOrdered className="size-3.5" />
                </ToolbarButton>
                <div className="mx-0.5 h-4 w-px bg-border" />
                <ToolbarButton
                    onClick={() => {
                        const prev = editor.getAttributes('link').href;
                        const url = prompt('URL:', prev ?? 'https://');
                        if (url === null) return;
                        if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
                        else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                    }}
                    active={editor.isActive('link')}
                    title={t('app.misc.link_einfuegen')}
                >
                    <MaterialIcon name="link" size={16} className="size-3.5" />
                </ToolbarButton>
            </div>
        </BubbleMenu>
    );
}

function ToolbarButton({ children, onClick, active, title }: {
    children: React.ReactNode;
    onClick: () => void;
    active?: boolean;
    title?: string;
}): JSX.Element {
    return (
        <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={onClick}
            title={title}
            className={cn(
                'rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                active && 'bg-muted text-foreground',
            )}
        >
            {children}
        </button>
    );
}
