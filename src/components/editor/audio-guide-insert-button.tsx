/**
 * AudioGuideInsertButton — Toolbar-Helfer fuer Tiptap-Editoren.
 *
 * Rendert einen kleinen Knopf, der den AudioGuidePickerDialog oeffnet
 * und beim Auswaehlen eines Audio-Documents `editor.commands.insertAudioGuide`
 * aufruft. Stylisch unaufdringlich — passt in jede Toolbar.
 */

import { type JSX, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { AudioGuidePickerDialog } from './audio-guide-picker-dialog';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    editor: Editor | null;
    /** Zusaetzliche Klassen — Aufrufer kann groesse / Padding ueberschreiben. */
    className?: string;
}

export function AudioGuideInsertButton({ editor, className }: Props): JSX.Element {
    const t = useT();
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={!editor}
                title={t('app.misc.audioguide_einfuegen')}
                className={cn(
                    'inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50',
                    className,
                )}
            >
                <MaterialIcon name="headphones" size={16} className="size-4" />
            </button>
            {open && editor && (
                <AudioGuidePickerDialog
                    onPick={(docId) => {
                        editor.chain().focus().insertAudioGuide(docId).run();
                    }}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}
