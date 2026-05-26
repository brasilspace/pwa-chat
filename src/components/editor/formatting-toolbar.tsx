/**
 * FormattingToolbar — Word-like Toolbar fuer Tiptap.
 * Font-Family, Font-Size, Heading H1-H6, Inline-Marks, Farben,
 * Alignment, Listen, Tabellen, Bilder, Sub/Superscript, Undo/Redo.
 */

import { type JSX, useState } from 'react';
import type { Editor } from '@tiptap/core';
import {
    Bold, Italic, Underline, Strikethrough, Code,
    ListOrdered, Quote,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Subscript as SubIcon, Superscript as SuperIcon,
} from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    editor: Editor | null;
}

const HIGHLIGHT_COLORS = [
    { name: 'Gelb', value: '#fef08a' },
    { name: 'Grün', value: '#bbf7d0' },
    { name: 'Blau', value: '#bfdbfe' },
    { name: 'Pink', value: '#fbcfe8' },
    { name: 'Lila', value: '#e9d5ff' },
    { name: 'Orange', value: '#fed7aa' },
];

const TEXT_COLORS = [
    { name: 'Schwarz', value: '#000000' },
    { name: 'Grau', value: '#64748b' },
    { name: 'Rot', value: '#dc2626' },
    { name: 'Orange', value: '#ea580c' },
    { name: 'Gelb', value: '#ca8a04' },
    { name: 'Grün', value: '#16a34a' },
    { name: 'Blau', value: '#2563eb' },
    { name: 'Lila', value: '#9333ea' },
    { name: 'Pink', value: '#db2777' },
];

const FONT_FAMILIES = [
    { label: 'Standard', value: '' },
    { label: 'Serif', value: 'Georgia, serif' },
    { label: 'Sans', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Mono', value: 'Menlo, Consolas, monospace' },
];

const FONT_SIZES = ['8pt', '9pt', '10pt', '11pt', '12pt', '13pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '32pt', '36pt', '48pt', '60pt', '72pt'];

export function FormattingToolbar({ editor }: Props): JSX.Element | null {
    const t = useT();
    if (!editor) return null;

    const setLink = () => {
        const prev = (editor.getAttributes('link').href as string | undefined);
        const url = prompt('URL:', prev ?? 'https://');
        if (url === null) return;
        if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
        else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    const insertImage = () => {
        const url = prompt('Bild-URL:', 'https://');
        if (!url) return;
        editor.chain().focus().setImage({ src: url }).run();
    };

    const currentBlock = (() => {
        for (let lvl = 1; lvl <= 6; lvl++) {
            if (editor.isActive('heading', { level: lvl })) return `h${lvl}`;
        }
        return 'p';
    })();

    const onBlockChange = (v: string) => {
        const c = editor.chain().focus();
        if (v === 'p') c.setParagraph().run();
        else c.toggleHeading({ level: parseInt(v.slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
    };

    const currentFontSize = (editor.getAttributes('textStyle').fontSize as string | undefined) ?? '';
    const currentFont = (editor.getAttributes('textStyle').fontFamily as string | undefined) ?? '';

    return (
        <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1 shrink-0">
            {/* Block-Type */}
            <select
                value={currentBlock}
                onChange={(e) => onBlockChange(e.target.value)}
                className="h-7 rounded border bg-background px-2 text-xs outline-none focus:border-primary"
                title={t('app.misc.absatz-typ')}
            >
                <option value="p">{t('app.misc.standard')}</option>
                <option value="h1">{t('app.misc.ueberschrift_1')}</option>
                <option value="h2">{t('app.misc.ueberschrift_2')}</option>
                <option value="h3">{t('app.misc.ueberschrift_3')}</option>
                <option value="h4">{t('app.misc.ueberschrift_4')}</option>
                <option value="h5">{t('app.misc.ueberschrift_5')}</option>
                <option value="h6">{t('app.misc.ueberschrift_6')}</option>
            </select>

            {/* Font Family */}
            <select
                value={currentFont}
                onChange={(e) => {
                    if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run();
                    else editor.chain().focus().unsetFontFamily().run();
                }}
                className="h-7 rounded border bg-background px-2 text-xs outline-none focus:border-primary"
                title={t('app.misc.schriftart')}
            >
                {FONT_FAMILIES.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
            </select>

            {/* Font Size */}
            <select
                value={currentFontSize}
                onChange={(e) => {
                    if (e.target.value) editor.chain().focus().setFontSize(e.target.value).run();
                    else editor.chain().focus().unsetFontSize().run();
                }}
                className="h-7 w-16 rounded border bg-background px-1 text-xs outline-none focus:border-primary"
                title={t('app.misc.schriftgroesse')}
            >
                <option value="">—</option>
                {FONT_SIZES.map(s => <option key={s} value={s}>{s.replace('pt', '')}</option>)}
            </select>
            <Divider />

            {/* Inline Marks */}
            <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title={t('app.misc.fett_strgb')}>
                <Bold className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title={t('app.misc.kursiv_strgi')}>
                <Italic className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => (editor.chain() as any).focus().toggleUnderline?.().run()} active={editor.isActive('underline')} title={t('app.misc.unterstrichen_strgu')}>
                <Underline className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title={t('app.misc.durchgestrichen')}>
                <Strikethrough className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title={t('app.misc.inline-code')}>
                <Code className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} title={t('app.misc.tiefgestellt')}>
                <SubIcon className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} title={t('app.misc.hochgestellt')}>
                <SuperIcon className="size-3.5" />
            </ToolbarButton>
            <Divider />

            {/* Colors */}
            <ColorDropdown editor={editor} kind="text" />
            <ColorDropdown editor={editor} kind="highlight" />
            <ToolbarButton onClick={setLink} active={editor.isActive('link')} title={t('app.misc.link_einfuegen')}>
                <MaterialIcon name="link" size={16} className="size-3.5" />
            </ToolbarButton>
            <Divider />

            {/* Alignment */}
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title={t('app.misc.linksbuendig')}>
                <AlignLeft className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title={t('app.misc.zentriert')}>
                <AlignCenter className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title={t('app.misc.rechtsbuendig')}>
                <AlignRight className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title={t('app.misc.blocksatz')}>
                <AlignJustify className="size-3.5" />
            </ToolbarButton>
            <Divider />

            {/* Lists */}
            <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title={t('app.misc.aufzaehlung')}>
                <MaterialIcon name="format_list_bulleted" size={16} className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title={t('app.misc.nummerierte_liste')}>
                <ListOrdered className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => (editor.chain() as any).focus().toggleTaskList?.().run()} active={editor.isActive('taskList')} title={t('app.misc.aufgaben-liste')}>
                <MaterialIcon name="checklist" size={16} className="size-3.5" />
            </ToolbarButton>
            <Divider />

            {/* Blocks */}
            <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title={t('app.misc.zitat')}>
                <Quote className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title={t('app.misc.code-block')}>
                <MaterialIcon name="code" size={16} className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title={t('app.misc.trennlinie')}>
                <MaterialIcon name="horizontal_rule" size={16} className="size-3.5" />
            </ToolbarButton>
            <Divider />

            {/* Media + Tables */}
            <ToolbarButton onClick={insertImage} title={t('app.misc.bild_einfuegen_url')}>
                <MaterialIcon name="image" size={16} className="size-3.5" />
            </ToolbarButton>
            <TableDropdown editor={editor} />
            <Divider />

            {/* Clear */}
            <ToolbarButton onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title={t('app.misc.formatierung_entfernen')}>
                <MaterialIcon name="format_clear" size={16} className="size-3.5" />
            </ToolbarButton>
            <Divider />

            {/* Undo / Redo */}
            <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().chain().focus().undo().run()} title={t('app.misc.rueckgaengig')}>
                <MaterialIcon name="undo" size={16} className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().chain().focus().redo().run()} title={t('app.misc.wiederherstellen')}>
                <MaterialIcon name="redo" size={16} className="size-3.5" />
            </ToolbarButton>
        </div>
    );
}

function ColorDropdown({ editor, kind }: { editor: Editor; kind: 'text' | 'highlight' }): JSX.Element {
    const t = useT();
    const [open, setOpen] = useState(false);
    const colors = kind === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS;
    const apply = (color: string) => {
        if (kind === 'text') editor.chain().focus().setColor(color).run();
        else editor.chain().focus().toggleHighlight({ color }).run();
        setOpen(false);
    };
    const reset = () => {
        if (kind === 'text') editor.chain().focus().unsetColor().run();
        else editor.chain().focus().unsetHighlight().run();
        setOpen(false);
    };
    const active = kind === 'text'
        ? !!editor.getAttributes('textStyle').color
        : editor.isActive('highlight');

    return (
        <div className="relative">
            <ToolbarButton onClick={() => setOpen(o => !o)} active={active} title={kind === 'text' ? 'Schriftfarbe' : 'Hervorhebung'}>
                <MaterialIcon name={kind === 'text' ? 'format_color_text' : 'format_color_fill'} size={16} className="size-3.5" />
            </ToolbarButton>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 top-full z-50 mt-0.5 rounded border bg-background p-1.5 shadow-md">
                        <div className="grid grid-cols-3 gap-1">
                            {colors.map(c => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => apply(c.value)}
                                    title={c.name}
                                    className="size-5 rounded border border-border/40 hover:scale-110 transition-transform"
                                    style={{ backgroundColor: c.value }}
                                />
                            ))}
                        </div>
                        <button
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={reset}
                            className="mt-1 w-full rounded border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                        >
                            {t('app.misc.zuruecksetzen')}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

function TableDropdown({ editor }: { editor: Editor }): JSX.Element {
    const t = useT();
    const [open, setOpen] = useState(false);
    const inTable = editor.isActive('table');
    const cmd = (fn: () => void) => { fn(); setOpen(false); };

    return (
        <div className="relative">
            <ToolbarButton onClick={() => setOpen(o => !o)} active={inTable} title={t('app.misc.tabelle')}>
                <MaterialIcon name="table_chart" size={16} className="size-3.5" />
            </ToolbarButton>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 top-full z-50 mt-0.5 w-52 rounded border bg-background py-1 shadow-md">
                        {!inTable && (
                            <MenuItem onClick={() => cmd(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>
                                {t('app.misc.tabelle_einfuegen_33')}
                            </MenuItem>
                        )}
                        {inTable && (
                            <>
                                <MenuItem onClick={() => cmd(() => editor.chain().focus().addRowBefore().run())}>{t('app.misc.zeile_darueber')}</MenuItem>
                                <MenuItem onClick={() => cmd(() => editor.chain().focus().addRowAfter().run())}>{t('app.misc.zeile_darunter')}</MenuItem>
                                <MenuItem onClick={() => cmd(() => editor.chain().focus().addColumnBefore().run())}>{t('app.misc.spalte_links')}</MenuItem>
                                <MenuItem onClick={() => cmd(() => editor.chain().focus().addColumnAfter().run())}>{t('app.misc.spalte_rechts')}</MenuItem>
                                <div className="my-1 border-t" />
                                <MenuItem onClick={() => cmd(() => editor.chain().focus().toggleHeaderRow().run())}>{t('app.misc.kopfzeile_umschalten')}</MenuItem>
                                <MenuItem onClick={() => cmd(() => editor.chain().focus().mergeOrSplit().run())}>{t('app.misc.zellen_verbinden_trennen')}</MenuItem>
                                <div className="my-1 border-t" />
                                <MenuItem danger onClick={() => cmd(() => editor.chain().focus().deleteRow().run())}>{t('app.misc.zeile_loeschen')}</MenuItem>
                                <MenuItem danger onClick={() => cmd(() => editor.chain().focus().deleteColumn().run())}>{t('app.misc.spalte_loeschen')}</MenuItem>
                                <MenuItem danger onClick={() => cmd(() => editor.chain().focus().deleteTable().run())}>{t('app.misc.tabelle_loeschen')}</MenuItem>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }): JSX.Element {
    return (
        <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={onClick}
            className={cn(
                'flex w-full items-center px-3 py-1 text-left text-xs hover:bg-muted',
                danger ? 'text-destructive' : 'text-foreground',
            )}
        >
            {children}
        </button>
    );
}

function Divider(): JSX.Element {
    return <div className="mx-1 h-4 w-px bg-border" />;
}

function ToolbarButton({ children, onClick, active, disabled, title }: {
    children: React.ReactNode;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title?: string;
}): JSX.Element {
    return (
        <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={cn(
                'flex size-7 items-center justify-center rounded text-muted-foreground transition-colors',
                'hover:bg-muted hover:text-foreground',
                active && 'bg-primary/10 text-primary',
                disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent',
            )}
        >
            {children}
        </button>
    );
}
