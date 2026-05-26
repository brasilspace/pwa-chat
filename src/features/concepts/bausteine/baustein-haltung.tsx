/**
 * BausteinHaltung — Rich-Text-Editor fuer Haltung & Leitbild
 *
 * Nutzt den bestehenden Tiptap-Editor mit Markdown-Support.
 * Automatisches Speichern nach 2 Sekunden Inaktivitaet.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Markdown } from 'tiptap-markdown';
import { Save, Check } from 'lucide-react';
import type { ConceptBaustein } from '../concept-gateway';
import { createConceptGateway } from '../concept-gateway';
import { AudioGuideExtension } from '@/components/editor/audio-guide-tiptap-extension';
import { AudioGuideInsertButton } from '@/components/editor/audio-guide-insert-button';
import '../../documents/tiptap-styles.css';
import { useT } from "@/lib/i18n/use-t";

const gateway = createConceptGateway();

interface BausteinHaltungProps {
    baustein: ConceptBaustein;
    instanceId: string;
    jwt: string;
}

export function BausteinHaltung({ baustein, instanceId, jwt }: BausteinHaltungProps) {
    const t = useT();
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ codeBlock: false }),
            Highlight,
            Typography,
            TaskList,
            TaskItem.configure({ nested: true }),
            Table.configure({ resizable: true }),
            TableRow,
            TableCell,
            TableHeader,
            Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true }),
            AudioGuideExtension,
        ],
        content: '',
        editable: true,
        editorProps: {
            attributes: {
                class: 'tiptap-content prose prose-sm dark:prose-invert max-w-none focus:outline-none px-8 py-6',
            },
        },
        onUpdate: () => {
            setSaved(false);
            // Auto-save after 2s of inactivity
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => handleSave(), 2000);
        },
    });

    // Load fresh content from server on mount
    useEffect(() => {
        if (!editor) return;
        gateway.getBaustein(jwt, instanceId, 'haltung').then((res) => {
            const content = res.baustein.richTextContent ?? '';
            editor.commands.setContent(content);
            setLoading(false);
        }).catch(() => {
            editor.commands.setContent(baustein.richTextContent ?? '');
            setLoading(false);
        });
    }, [editor, jwt, instanceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = useCallback(async () => {
        if (!editor || saving) return;
        const content = (editor.storage as any).markdown?.getMarkdown?.() ?? editor.getHTML();
        setSaving(true);
        try {
            await gateway.updateBaustein(jwt, instanceId, 'haltung', { richTextContent: content });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } finally {
            setSaving(false);
        }
    }, [editor, jwt, instanceId, saving]);

    // Cleanup timer
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    // Ctrl+S
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleSave]);

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-2">
                <div className="flex items-center gap-2">
                    {editor && (
                        <>
                            <ToolbarButton
                                active={editor.isActive('bold')}
                                onClick={() => editor.chain().focus().toggleBold().run()}
                                label="B"
                                bold
                            />
                            <ToolbarButton
                                active={editor.isActive('italic')}
                                onClick={() => editor.chain().focus().toggleItalic().run()}
                                label="I"
                                italic
                            />
                            <div className="mx-1 h-4 w-px bg-[var(--border)]" />
                            <ToolbarButton
                                active={editor.isActive('heading', { level: 2 })}
                                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                                label={t('concepts.bausteine.baustein_haltung.h2')}
                            />
                            <ToolbarButton
                                active={editor.isActive('heading', { level: 3 })}
                                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                                label={t('concepts.bausteine.baustein_haltung.h3')}
                            />
                            <div className="mx-1 h-4 w-px bg-[var(--border)]" />
                            <ToolbarButton
                                active={editor.isActive('bulletList')}
                                onClick={() => editor.chain().focus().toggleBulletList().run()}
                                label="•"
                            />
                            <ToolbarButton
                                active={editor.isActive('orderedList')}
                                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                                label="1."
                            />
                            <ToolbarButton
                                active={editor.isActive('taskList')}
                                onClick={() => editor.chain().focus().toggleTaskList().run()}
                                label="☑"
                            />
                            <AudioGuideInsertButton editor={editor} />
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {saved && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                            <Check size={12} /> {t('concepts.bausteine.baustein_haltung.gespeichert')}
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs text-white transition-opacity disabled:opacity-50"
                    >
                        <Save size={12} />
                        {saving ? 'Speichert...' : t('common.save')}
                    </button>
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto" style={{ maxWidth: 'var(--content-reading-width, 48rem)' }}>
                    <EditorContent editor={editor} />
                </div>
            </div>
        </div>
    );
}

function ToolbarButton({
    active, onClick, label, bold, italic,
}: {
    active: boolean; onClick: () => void; label: string; bold?: boolean; italic?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`rounded px-2 py-1 text-xs transition-colors ${active
                    ? 'bg-[var(--accent)] text-[var(--foreground)]'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)]'
                } ${bold ? 'font-bold' : ''} ${italic ? 'italic' : ''}`}
        >
            {label}
        </button>
    );
}
