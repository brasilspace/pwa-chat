import { type JSX, useEffect } from 'react';
import './tiptap-styles.css';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { AudioGuideExtension } from '@/components/editor/audio-guide-tiptap-extension';

const lowlight = createLowlight(common);

interface TiptapViewerProps {
    content: string;
    editable?: boolean;
}

export function TiptapViewer({ content, editable = false }: TiptapViewerProps): JSX.Element {
    const editor = useEditor({
        editable,
        extensions: [
            StarterKit.configure({
                codeBlock: false, // replaced by CodeBlockLowlight
            }),
            Highlight,
            Typography,
            Table.configure({ resizable: false }),
            TableRow,
            TableCell,
            TableHeader,
            TaskList,
            TaskItem.configure({ nested: true }),
            CodeBlockLowlight.configure({ lowlight }),
            Markdown.configure({
                html: true,
                transformPastedText: true,
                transformCopiedText: true,
            }),
            AudioGuideExtension,
        ],
        content,
        editorProps: {
            attributes: {
                class: 'tiptap-content prose prose-sm dark:prose-invert max-w-none focus:outline-none px-6 py-4',
            },
        },
    });

    // Update content when it changes
    useEffect(() => {
        if (editor) {
            editor.commands.setContent(content);
        }
    }, [content, editor]);

    if (!editor) return <div />;

    return <EditorContent editor={editor} className="h-full overflow-auto" />;
}
