/**
 * RichEditor — geteilter Tiptap-Wrapper mit profilbasierter Config.
 *
 * Profile:
 *   - chat-composer: minimales Set fuer Chat-Eingabe (Bold, Italic, Code,
 *     Liste, Link). Enter sendet, Shift+Enter Zeilenumbruch.
 *   - dms-viewer: Read-only Vorschau mit Tabellen + Code + Tasks.
 *   - notes: Mein-Fach-Notizen mit StarterKit + Highlight + Tasks.
 *
 * Optional: children erhaelt das Editor-Instance — z.B. fuer BubbleMenu.
 */

import { type JSX, type KeyboardEvent, type ReactNode, useEffect, useImperativeHandle, forwardRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import { AudioGuideExtension } from './audio-guide-tiptap-extension';
import { cn } from '@/lib/utils';

export type EditorProfile = 'chat-composer' | 'dms-viewer' | 'notes';

export interface RichEditorHandle {
    /** Aktueller Plain-Text (zum Senden als body). */
    getText: () => string;
    /** Aktueller HTML-String (zum Senden als formatted_body). */
    getHtml: () => string;
    /** Editor leeren. */
    clear: () => void;
    /** Editor fokussieren. */
    focus: () => void;
    /** Direkter Zugriff auf das Editor-Instance (advanced use). */
    getEditor: () => Editor | null;
}

interface RichEditorProps {
    profile: EditorProfile;
    /** Initialer Inhalt — HTML oder Plain-Text. */
    initialContent?: string;
    /** Wird bei jedem Update mit { text, html } aufgerufen. */
    onChange?: (out: { text: string; html: string }) => void;
    /** Bei chat-composer: wird gerufen wenn Enter gedrueckt wurde (ohne Shift). */
    onEnter?: () => void;
    /** Wird bei jedem Tastendruck gerufen — z.B. Typing-Indicator. */
    onKeyDown?: (e: KeyboardEvent) => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    /** Render-Prop fuer Menus (BubbleMenu, FloatingMenu) — bekommt das Editor-Instance. */
    children?: (editor: Editor | null) => ReactNode;
}

function buildExtensions(profile: EditorProfile) {
    switch (profile) {
        case 'chat-composer':
            return [
                StarterKit.configure({
                    heading: false,
                    blockquote: false,
                    horizontalRule: false,
                }),
                Typography,
                Link.configure({
                    openOnClick: false,
                    autolink: true,
                    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
                }),
            ];
        case 'dms-viewer':
            return [
                StarterKit,
                Highlight,
                Typography,
                TaskList,
                TaskItem.configure({ nested: true }),
                AudioGuideExtension,
            ];
        case 'notes':
            return [
                StarterKit,
                Highlight,
                Typography,
                TaskList,
                TaskItem.configure({ nested: true }),
                Link.configure({
                    openOnClick: false,
                    autolink: true,
                    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
                }),
                AudioGuideExtension,
            ];
    }
}

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
    { profile, initialContent, onChange, onEnter, onKeyDown, placeholder, className, autoFocus, children },
    ref,
) {
    const editor = useEditor({
        extensions: buildExtensions(profile),
        content: initialContent ?? '',
        editable: profile !== 'dms-viewer',
        editorProps: {
            attributes: {
                class: cn(
                    'tiptap-content prose prose-sm dark:prose-invert max-w-none focus:outline-none',
                    className,
                ),
                ...(placeholder ? { 'data-placeholder': placeholder } : {}),
            },
            handleKeyDown: profile === 'chat-composer'
                ? (_view, event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
                        event.preventDefault();
                        onEnter?.();
                        return true;
                    }
                    return false;
                }
                : undefined,
        },
        onUpdate: ({ editor: ed }) => {
            onChange?.({ text: ed.getText(), html: ed.getHTML() });
        },
        autofocus: autoFocus ? 'end' : false,
    });

    useEffect(() => () => { editor?.destroy(); }, [editor]);

    useImperativeHandle(ref, () => ({
        getText: () => editor?.getText() ?? '',
        getHtml: () => editor?.getHTML() ?? '',
        clear: () => { editor?.commands.clearContent(); },
        focus: () => { editor?.commands.focus('end'); },
        getEditor: () => editor,
    }), [editor]);

    return (
        <>
            <EditorContent editor={editor} onKeyDown={onKeyDown} />
            {children?.(editor)}
        </>
    );
});
