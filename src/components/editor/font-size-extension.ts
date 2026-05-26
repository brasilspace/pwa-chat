/**
 * FontSize — Custom Tiptap-Extension fuer font-size Inline-Styles.
 * Erweitert TextStyle um ein fontSize-Attribut.
 *
 * Verwendung:
 *   editor.chain().focus().setFontSize('14pt').run()
 *   editor.chain().focus().unsetFontSize().run()
 */

import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        fontSize: {
            setFontSize: (size: string) => ReturnType;
            unsetFontSize: () => ReturnType;
        };
    }
}

export const FontSize = Extension.create({
    name: 'fontSize',

    addOptions() {
        return { types: ['textStyle'] };
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: (element: HTMLElement) => element.style.fontSize?.replace(/['"]+/g, '') || null,
                        renderHTML: (attributes: { fontSize?: string }) => {
                            if (!attributes.fontSize) return {};
                            return { style: `font-size: ${attributes.fontSize}` };
                        },
                    },
                },
            },
        ];
    },

    addCommands() {
        return {
            setFontSize: (size: string) => ({ chain }) =>
                chain().setMark('textStyle', { fontSize: size }).run(),
            unsetFontSize: () => ({ chain }) =>
                chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
        };
    },
});
