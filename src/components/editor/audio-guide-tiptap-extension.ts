/**
 * audio-guide-tiptap-extension — Tiptap-Node fuer eingebettete AudioGuides.
 *
 * Markup im Schema:
 *   <div data-audio-guide="<documentId>"></div>
 *
 * Atom-Block: ein einzelnes Embed mit fester Document-Referenz, kein
 * Inline-Inhalt. Im Editor wird ueber ReactNodeViewRenderer der inline-
 * Player gerendert (audio-guide-embed-view.tsx). Im read-only Viewer
 * (z.B. Brief-Vorschau) ebenso.
 *
 * Insertion ueber den Befehl `editor.commands.insertAudioGuide(docId)`.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AudioGuideEmbedView } from './audio-guide-embed-view';

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        audioGuide: {
            /** AudioGuide-Embed an Cursor-Position einfuegen. */
            insertAudioGuide: (documentId: string) => ReturnType;
        };
    }
}

export const AudioGuideExtension = Node.create({
    name: 'audioGuide',
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
        return {
            documentId: {
                default: '',
                parseHTML: (el) => el.getAttribute('data-audio-guide') ?? '',
                renderHTML: (attrs) => {
                    if (!attrs.documentId) return {};
                    return { 'data-audio-guide': attrs.documentId };
                },
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'div[data-audio-guide]' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-audio-guide-embed': 'true' })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(AudioGuideEmbedView);
    },

    addCommands() {
        return {
            insertAudioGuide:
                (documentId: string) =>
                ({ commands }) => {
                    return commands.insertContent({
                        type: this.name,
                        attrs: { documentId },
                    });
                },
        };
    },
});
