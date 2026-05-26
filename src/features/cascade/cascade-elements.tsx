/**
 * cascade-elements.tsx — Element-Registry fuer Kaskaden-Boxen
 *
 * Jeder Element-Typ wird EINMAL definiert:
 *   - label, icon, color (fuer das + Menue)
 *   - defaultConfig (beim Erstellen)
 *   - heightRows (wie viele Zeilen im Graph)
 *   - renderGraph (kleine Darstellung in der Box)
 *   - renderDesigner (Editor-Felder im Designer)
 *   - renderPlayer (Vollbild-Darstellung im Player)
 *
 * Neuen Typ hinzufuegen = nur hier eine Definition ergaenzen.
 */

import { type JSX } from 'react';
import { cn } from '@/lib/utils';
import { Square, CircleDot, Type, PlusCircle, Loader2, ListTodo, Split, Merge, Timer, Info, Star, Variable, FileOutput, Webhook, PlayCircle } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { env } from '@/core/config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ElementConfig {
    type: string;
    question?: string;
    label?: string;
    options?: { id: string; label: string }[];
    yesLabel?: string;
    noLabel?: string;
    [key: string]: unknown;
}

export interface ElementDef {
    type: string;
    label: string;
    icon: JSX.Element;
    color: string;                         // Tailwind hover color class
    defaultConfig: () => ElementConfig;
    heightRows: (el: ElementConfig) => number;
    renderGraph: (props: GraphElementProps) => JSX.Element;
    renderDesigner: (props: DesignerElementProps) => JSX.Element;
    renderPlayer: (props: PlayerElementProps) => JSX.Element;
}

/** i18n-Hook der vom Aufrufer reingereicht wird. ObjectLiteral-Render-
 *  Functions koennen kein eigenes useT() rufen (Hook-Rules) — der
 *  einzige Aufrufer (cascade-designer.tsx) ist eine React-Component
 *  und gibt sein t weiter. */
export type TFn = (key: string, opts?: Record<string, unknown>) => string;

export interface GraphElementProps {
    el: ElementConfig;
    idx: number;
    nodeState: any;
    allElements: ElementConfig[];
    onStateChange: (newState: any) => void;
    t: TFn;
}

export interface DesignerElementProps {
    el: ElementConfig;
    idx: number;
    allElements: ElementConfig[];
    onChange: (patch: Partial<ElementConfig>) => void;
    onAddOption: (label: string) => void;
    onRemoveOption: (optId: string) => void;
    t: TFn;
}

export interface PlayerElementProps {
    el: ElementConfig;
    idx: number;
    state: any;
    allElements: ElementConfig[];
    onNavigate: (answer?: string, option?: string) => void;
    onStateChange: (value: any) => void;
    onNavigateApp?: (path: string) => void;
    jwt?: string;
    /** true = kein eigener Weiter-Button, wird vom Parent gerendert */
    hideNavigation?: boolean;
    t: TFn;
}

// ─── Option List Editor (shared by dropdown, checklist, radio) ────────────────

function OptionListEditor({ el, onAddOption, onRemoveOption }: {
    el: ElementConfig;
    onAddOption: (label: string) => void;
    onRemoveOption: (optId: string) => void;
}) {
    return (
        <div className="space-y-1">
            {(el.options ?? []).map((opt, oi) => (
                <div key={opt.id} className="flex items-center gap-2 group">
                    <span className="text-[10px] text-muted-foreground/50 w-4 text-right">{oi + 1}.</span>
                    <span className="flex-1 text-sm">{opt.label}</span>
                    <button onClick={() => onRemoveOption(opt.id)}
                        className="rounded p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        ×
                    </button>
                </div>
            ))}
            <OptionInput onAdd={onAddOption} />
        </div>
    );
}

function OptionInput({ onAdd }: { onAdd: (label: string) => void }) {
    const t = useT();
    const [val, setVal] = __import_useState('');
    return (
        <div className="flex items-center gap-2">
            <input value={val} onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal(''); } }}
                placeholder={t('cascade.cascade_elements.neue_option')} className="flex-1 h-7 rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
            <button onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(''); } }}
                disabled={!val.trim()} className="text-[10px] text-primary hover:text-primary/80 disabled:opacity-30 font-medium">
                +
            </button>
        </div>
    );
}

// React hooks import workaround for this module
import { useState as __import_useState, useRef as __import_useRef } from 'react';
import { useT } from "@/lib/i18n/use-t";

// ─── Element Definitions ──────────────────────────────────────────────────────

const decision: ElementDef = {
    type: 'decision',
    label: 'Entscheidung',
    icon: <MaterialIcon name="warning" size={16} className="size-2.5" />,
    color: 'hover:text-amber-500',
    defaultConfig: () => ({ type: 'decision', question: 'Neue Entscheidung', yesLabel: 'Ja', noLabel: 'Nein' }),
    heightRows: () => 2,
    renderGraph: ({ el, idx, nodeState, onStateChange, t }) => (
        <>
            <div className="text-[9px] text-muted-foreground text-center">{el.question}</div>
            <div className="flex gap-1 mt-0.5">
                <button onClick={(e) => { e.stopPropagation(); onStateChange({ ...nodeState, [`el_${idx}`]: 'yes' }); }}
                    className={cn("flex-1 rounded py-0.5 text-[8px] font-semibold", nodeState?.[`el_${idx}`] === 'yes' ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400")}>
                    {el.yesLabel ?? 'Ja'}
                </button>
                <button onClick={(e) => { e.stopPropagation(); onStateChange({ ...nodeState, [`el_${idx}`]: 'no' }); }}
                    className={cn("flex-1 rounded py-0.5 text-[8px] font-semibold", nodeState?.[`el_${idx}`] === 'no' ? "bg-red-500 text-white" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
                    {el.noLabel ?? 'Nein'}
                </button>
            </div>
        </>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div className="grid grid-cols-2 gap-2">
            <input value={el.yesLabel ?? 'Ja'} onChange={(e) => onChange({ yesLabel: e.target.value })}
                className="h-8 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500" placeholder={t('cascade.cascade_elements.ja-button')} />
            <input value={el.noLabel ?? 'Nein'} onChange={(e) => onChange({ noLabel: e.target.value })}
                className="h-8 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-red-500" placeholder={t('cascade.cascade_elements.nein-button')} />
        </div>
    ),
    renderPlayer: ({ el, onNavigate, t }) => (
        <div className="flex gap-3">
            <button onClick={() => onNavigate('yes')}
                className="flex-1 rounded-2xl bg-emerald-500 py-4 text-base font-semibold text-white active:scale-95 transition-transform">
                {el.yesLabel ?? 'Ja'}
            </button>
            <button onClick={() => onNavigate('no')}
                className="flex-1 rounded-2xl bg-red-500 py-4 text-base font-semibold text-white active:scale-95 transition-transform">
                {el.noLabel ?? 'Nein'}
            </button>
        </div>
    ),
};

const dropdown: ElementDef = {
    type: 'dropdown',
    label: 'Dropdown',
    icon: <MaterialIcon name="expand_more" size={16} className="size-2.5" />,
    color: 'hover:text-violet-500',
    defaultConfig: () => ({ type: 'dropdown', question: 'Neue Auswahl', options: [] }),
    heightRows: (el) => (el.options?.length ?? 0) + 2,
    renderGraph: ({ el, idx, nodeState, onStateChange, t }) => (
        <>
            <div className="text-[9px] text-muted-foreground text-center">{el.question}</div>
            <select value={nodeState?.[`el_${idx}`] ?? ''} onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); onStateChange({ ...nodeState, [`el_${idx}`]: e.target.value }); }}
                className="mt-0.5 h-5 w-full rounded border bg-background px-1 text-[8px] outline-none">
                <option value="">{t('cascade.cascade_elements.waehlen')}</option>
                {(el.options ?? []).map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
            </select>
        </>
    ),
    renderDesigner: ({ el, onAddOption, onRemoveOption, t }) => (
        <OptionListEditor el={el} onAddOption={onAddOption} onRemoveOption={onRemoveOption} />
    ),
    renderPlayer: ({ el, idx, state, onNavigate, onStateChange, hideNavigation, t }) => {
        const selected = state?.[`el_${idx}`] ?? '';
        return (
            <div className="space-y-3">
                <select value={selected} onChange={(e) => onStateChange({ ...state, [`el_${idx}`]: e.target.value })}
                    className="w-full rounded-2xl border-2 border-border bg-background px-4 py-4 text-base outline-none focus:border-primary">
                    <option value="">{t('cascade.cascade_elements.bitte_waehlen')}</option>
                    {(el.options ?? []).map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                </select>
                {!hideNavigation && <button onClick={() => { if (selected) onNavigate(undefined, selected); }} disabled={!selected}
                    className={cn("w-full rounded-2xl py-4 text-base font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2",
                        selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground cursor-not-allowed")}>
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>}
            </div>
        );
    },
};

const checklist: ElementDef = {
    type: 'checklist',
    label: 'Checkboxen',
    icon: <MaterialIcon name="check_box" size={16} className="size-2.5" />,
    color: 'hover:text-emerald-500',
    defaultConfig: () => ({ type: 'checklist', label: 'Checkliste', options: [] }),
    heightRows: (el) => (el.options?.length ?? 0) + 1,
    renderGraph: ({ el, idx, nodeState, onStateChange, t }) => {
        const checked: string[] = nodeState?.[`el_${idx}`] ?? [];
        return (
            <>
                {el.label && <div className="text-[9px] text-muted-foreground">{el.label}</div>}
                {(el.options ?? []).map(opt => {
                    const isChecked = checked.includes(opt.id);
                    return (
                        <button key={opt.id} onClick={(e) => {
                            e.stopPropagation();
                            const next = isChecked ? checked.filter(id => id !== opt.id) : [...checked, opt.id];
                            onStateChange({ ...nodeState, [`el_${idx}`]: next });
                        }} className="flex items-center gap-1 py-0.5 w-full text-left">
                            {isChecked ? <MaterialIcon name="check_box" size={16} className="size-3 text-primary shrink-0" /> : <Square className="size-3 text-muted-foreground/40 shrink-0" />}
                            <span className={cn("text-[8px] truncate", isChecked && "line-through text-muted-foreground/40")}>{opt.label}</span>
                        </button>
                    );
                })}
            </>
        );
    },
    renderDesigner: ({ el, onAddOption, onRemoveOption, t }) => (
        <OptionListEditor el={el} onAddOption={onAddOption} onRemoveOption={onRemoveOption} />
    ),
    renderPlayer: ({ el, idx, state, onNavigate, onStateChange, hideNavigation, t }) => {
        const checked: string[] = state?.[`el_${idx}`] ?? [];
        return (
            <div className="space-y-3">
                {(el.options ?? []).map(opt => {
                    const isChecked = checked.includes(opt.id);
                    return (
                        <button key={opt.id} onClick={() => {
                            const next = isChecked ? checked.filter(id => id !== opt.id) : [...checked, opt.id];
                            onStateChange({ ...state, [`el_${idx}`]: next });
                        }} className="flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors"
                            style={{ borderColor: isChecked ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}>
                            {isChecked ? <MaterialIcon name="check_box" size={16} className="size-5 text-primary shrink-0" /> : <Square className="size-5 text-muted-foreground/40 shrink-0" />}
                            <span className="text-base">{opt.label}</span>
                        </button>
                    );
                })}
                {!hideNavigation && <button onClick={() => onNavigate()}
                    className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>}
            </div>
        );
    },
};

const radio: ElementDef = {
    type: 'radio',
    label: 'Optionsliste',
    icon: <CircleDot className="size-2.5" />,
    color: 'hover:text-blue-500',
    defaultConfig: () => ({ type: 'radio', label: 'Optionsliste', options: [] }),
    heightRows: (el) => (el.options?.length ?? 0) + 1,
    renderGraph: ({ el, idx, nodeState, onStateChange, t }) => {
        const selected = nodeState?.[`el_${idx}`];
        return (
            <>
                {el.label && <div className="text-[9px] text-muted-foreground">{el.label}</div>}
                {(el.options ?? []).map(opt => {
                    const isSelected = selected === opt.id;
                    return (
                        <button key={opt.id} onClick={(e) => {
                            e.stopPropagation();
                            onStateChange({ ...nodeState, [`el_${idx}`]: opt.id });
                        }} className="flex items-center gap-1 py-0.5 w-full text-left">
                            {isSelected ? <CircleDot className="size-3 text-primary shrink-0" /> : <MaterialIcon name="radio_button_unchecked" size={16} className="size-3 text-muted-foreground/40 shrink-0" />}
                            <span className={cn("text-[8px] truncate", isSelected && "font-semibold text-primary")}>{opt.label}</span>
                        </button>
                    );
                })}
            </>
        );
    },
    renderDesigner: ({ el, onAddOption, onRemoveOption, t }) => (
        <OptionListEditor el={el} onAddOption={onAddOption} onRemoveOption={onRemoveOption} />
    ),
    renderPlayer: ({ el, idx, state, onNavigate, onStateChange, hideNavigation, t }) => {
        const selected = state?.[`el_${idx}`];
        return (
            <div className="space-y-3">
                {(el.options ?? []).map(opt => {
                    const isSelected = selected === opt.id;
                    return (
                        <button key={opt.id} onClick={() => onStateChange({ ...state, [`el_${idx}`]: opt.id })}
                            className="flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors"
                            style={{ borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}>
                            {isSelected ? <CircleDot className="size-5 text-primary shrink-0" /> : <MaterialIcon name="radio_button_unchecked" size={16} className="size-5 text-muted-foreground/40 shrink-0" />}
                            <span className="text-base">{opt.label}</span>
                        </button>
                    );
                })}
                {!hideNavigation && <button onClick={() => { if (selected) onNavigate(undefined, selected); }} disabled={!selected}
                    className={cn("w-full rounded-2xl py-4 text-base font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2",
                        selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground cursor-not-allowed")}>
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>}
            </div>
        );
    },
};

// ─── Visibility Helper ────────────────────────────────────────────────────────

/**
 * Prüft ob ein Element sichtbar ist basierend auf seiner visibleWhen-Eigenschaft.
 * visibleWhen: { elementIdx: number, branch: 'then' | 'else' | 'yes' | 'no' | optionId }
 */
export function isElementVisible(el: ElementConfig, allElements: ElementConfig[], nodeState: any): boolean {
    const vw = el.visibleWhen as { elementIdx: number; branch: string } | undefined;
    if (!vw || vw.elementIdx === undefined || vw.elementIdx < 0) return true; // Immer sichtbar

    const srcEl = allElements[vw.elementIdx];
    if (!srcEl) return true;

    if (srcEl.type === 'condition') {
        const result = evaluateCondition(srcEl, nodeState, allElements);
        return result === vw.branch;
    }
    if (srcEl.type === 'decision') {
        return nodeState?.[`el_${vw.elementIdx}`] === vw.branch;
    }
    if (srcEl.type === 'dropdown' || srcEl.type === 'radio') {
        return nodeState?.[`el_${vw.elementIdx}`] === vw.branch;
    }
    if (srcEl.type === 'checklist') {
        if (vw.branch === 'complete') {
            const checked: string[] = nodeState?.[`el_${vw.elementIdx}`] ?? [];
            return (srcEl.options ?? []).length > 0 && (srcEl.options ?? []).every((o: any) => checked.includes(o.id));
        }
    }
    return true;
}

/**
 * Erzeugt Visibility-Optionen für ein Element an Position idx.
 * Alle vorhergehenden Elemente die Bedingungen liefern.
 */
export function getVisibilityOptions(idx: number, allElements: ElementConfig[]): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];
    for (let i = 0; i < idx; i++) {
        const el = allElements[i];
        const name = el.question ?? el.label ?? `#${i + 1}`;
        if (el.type === 'condition') {
            options.push({ value: JSON.stringify({ elementIdx: i, branch: 'then' }), label: `${name} → ${String(el.thenLabel ?? 'Dann')}` });
            options.push({ value: JSON.stringify({ elementIdx: i, branch: 'else' }), label: `${name} → ${String(el.elseLabel ?? 'Sonst')}` });
        } else if (el.type === 'decision') {
            options.push({ value: JSON.stringify({ elementIdx: i, branch: 'yes' }), label: `${name} → ${el.yesLabel ?? 'Ja'}` });
            options.push({ value: JSON.stringify({ elementIdx: i, branch: 'no' }), label: `${name} → ${el.noLabel ?? 'Nein'}` });
        } else if (el.type === 'dropdown' || el.type === 'radio') {
            for (const opt of (el.options ?? [])) {
                options.push({ value: JSON.stringify({ elementIdx: i, branch: opt.id }), label: `${name} → ${opt.label}` });
            }
        }
    }
    return options;
}

// ─── Condition Helper ──────────────────────────────────────────────────────────

const OPERATORS: { id: string; label: string }[] = [
    { id: 'equals', label: 'ist gleich' },
    { id: 'not_equals', label: 'ist nicht' },
    { id: 'is_set', label: 'ist gesetzt' },
    { id: 'is_not_set', label: 'ist leer' },
    { id: 'contains', label: 'enthält' },
];

function evaluateCondition(el: ElementConfig, state: any, allElements: ElementConfig[]): 'then' | 'else' {
    const srcIdx = el.sourceElement as number | undefined;
    if (srcIdx === undefined || srcIdx < 0) return 'else';
    const val = state?.[`el_${srcIdx}`];
    const op = el.operator as string ?? 'equals';
    const target = el.value as string ?? '';

    if (op === 'is_set') return (val !== undefined && val !== null && val !== '' && (!Array.isArray(val) || val.length > 0)) ? 'then' : 'else';
    if (op === 'is_not_set') return (!val || (Array.isArray(val) && val.length === 0)) ? 'then' : 'else';
    if (op === 'equals') return (Array.isArray(val) ? val.includes(target) : String(val) === target) ? 'then' : 'else';
    if (op === 'not_equals') return (Array.isArray(val) ? !val.includes(target) : String(val) !== target) ? 'then' : 'else';
    if (op === 'contains') return String(val ?? '').includes(target) ? 'then' : 'else';
    return 'else';
}

function getSourceOptions(srcIdx: number, allElements: ElementConfig[]): { id: string; label: string }[] {
    const src = allElements[srcIdx];
    if (!src) return [];
    if (src.type === 'decision') return [{ id: 'yes', label: src.yesLabel ?? 'Ja' }, { id: 'no', label: src.noLabel ?? 'Nein' }];
    return src.options ?? [];
}

const condition: ElementDef = {
    type: 'condition',
    label: 'If-Then-Else',
    icon: <MaterialIcon name="schema" size={16} className="size-2.5" />,
    color: 'hover:text-orange-500',
    defaultConfig: () => ({ type: 'condition', label: 'Bedingung', sourceElement: -1, operator: 'equals', value: '', thenLabel: 'Dann', elseLabel: 'Sonst' }),
    heightRows: () => 0, // Unsichtbar im Graph — reines Steuerelement
    renderGraph: () => {
        return (
            <>
            </>
        );
    },
    renderDesigner: ({ el, idx, allElements, onChange, t }) => {
        const srcIdx = (el.sourceElement as number) ?? -1;
        const op = (el.operator as string) ?? 'equals';
        const needsValue = op !== 'is_set' && op !== 'is_not_set';
        const srcOptions = srcIdx >= 0 ? getSourceOptions(srcIdx, allElements) : [];

        return (
            <div className="space-y-2">
                {/* Source element */}
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.wenn_element')}</label>
                    <select value={srcIdx} onChange={(e) => onChange({ sourceElement: parseInt(e.target.value) })}
                        className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                        <option value={-1}>{t('cascade.cascade_elements.waehlen')}</option>
                        {allElements.map((src, i) => i < idx ? (
                            <option key={i} value={i}>#{i + 1} {src.question ?? src.label ?? src.type}</option>
                        ) : null)}
                    </select>
                </div>
                {/* Operator */}
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.bedingung')}</label>
                    <select value={op} onChange={(e) => onChange({ operator: e.target.value })}
                        className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                        {OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                </div>
                {/* Value */}
                {needsValue && (
                    <div>
                        <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.wert')}</label>
                        {srcOptions.length > 0 ? (
                            <select value={(el.value as string) ?? ''} onChange={(e) => onChange({ value: e.target.value })}
                                className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                                <option value="">{t('cascade.cascade_elements.waehlen')}</option>
                                {srcOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                        ) : (
                            <input value={(el.value as string) ?? ''} onChange={(e) => onChange({ value: e.target.value })}
                                className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary" placeholder={t('cascade.cascade_elements.wert')} />
                        )}
                    </div>
                )}
                {/* Labels */}
                <div className="grid grid-cols-2 gap-2">
                    <input value={(el.thenLabel as string) ?? 'Dann'} onChange={(e) => onChange({ thenLabel: e.target.value })}
                        className="h-8 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500" placeholder={t('cascade.cascade_elements.dann-label')} />
                    <input value={(el.elseLabel as string) ?? 'Sonst'} onChange={(e) => onChange({ elseLabel: e.target.value })}
                        className="h-8 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-orange-500" placeholder={t('cascade.cascade_elements.sonst-label')} />
                </div>
            </div>
        );
    },
    renderPlayer: ({ el, idx, state, allElements, onNavigate, hideNavigation, t }) => {
        const result = evaluateCondition(el, state, allElements);
        // Auto-navigate based on condition result
        return (
            <div className="space-y-4">
                <div className={cn("rounded-2xl py-4 text-center text-base font-semibold text-white",
                    result === 'then' ? "bg-emerald-500" : "bg-orange-500")}>
                    {result === 'then' ? String(el.thenLabel ?? 'Dann') : String(el.elseLabel ?? 'Sonst')}
                </div>
                <button onClick={() => onNavigate(result === 'then' ? 'yes' : 'no')}
                    className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>
            </div>
        );
    },
};

const textfield: ElementDef = {
    type: 'textfield',
    label: 'Textfeld',
    icon: <Type className="size-2.5" />,
    color: 'hover:text-sky-500',
    defaultConfig: () => ({ type: 'textfield', label: 'Freitext', placeholder: 'Text eingeben...' }),
    heightRows: () => 2,
    renderGraph: ({ el, idx, nodeState, onStateChange, t }) => (
        <>
            {el.label && <div className="text-[9px] text-muted-foreground">{String(el.label)}</div>}
            <input
                type="text"
                value={nodeState?.[`el_${idx}`] ?? ''}
                placeholder={String(el.placeholder ?? '')}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); onStateChange({ ...nodeState, [`el_${idx}`]: e.target.value }); }}
                className="mt-0.5 h-5 w-full rounded border bg-background px-1 text-[8px] outline-none"
            />
        </>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div>
            <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.platzhalter')}</label>
            <input value={String(el.placeholder ?? '')} onChange={(e) => onChange({ placeholder: e.target.value })}
                className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" placeholder={t('cascade.cascade_elements.zb_bitte_beschreiben')} />
        </div>
    ),
    renderPlayer: ({ el, idx, state, onNavigate, onStateChange, hideNavigation, t }) => {
        const val = state?.[`el_${idx}`] ?? '';
        return (
            <div className="space-y-3">
                <textarea
                    value={val}
                    onChange={(e) => onStateChange({ ...state, [`el_${idx}`]: e.target.value })}
                    placeholder={String(el.placeholder ?? 'Text eingeben...')}
                    rows={4}
                    className="w-full rounded-2xl border-2 border-border bg-background px-4 py-4 text-base outline-none focus:border-primary resize-none"
                />
                {!hideNavigation && <button onClick={() => onNavigate()}
                    className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>}
            </div>
        );
    },
};

const link: ElementDef = {
    type: 'link',
    label: 'Link / Navigation',
    icon: <MaterialIcon name="open_in_new" size={16} className="size-2.5" />,
    color: 'hover:text-cyan-500',
    defaultConfig: () => ({ type: 'link', label: 'Öffnen', url: '', target: 'space' }),
    heightRows: () => 1,
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1">
            <MaterialIcon name="open_in_new" size={16} className="size-2.5 text-cyan-500 shrink-0" />
            <span className="text-[8px] text-cyan-600 truncate">{String(el.label ?? 'Link')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div className="space-y-2">
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.typ')}</label>
                <select value={String(el.target ?? 'space')} onChange={(e) => onChange({ target: e.target.value, url: '' })}
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                    <option value="space">{t('cascade.cascade_elements.space_oeffnen')}</option>
                    <option value="chat">{t('cascade.cascade_elements.chat_oeffnen')}</option>
                    <option value="calendar">{t('cascade.cascade_elements.kalender')}</option>
                    <option value="documents">{t('cascade.cascade_elements.dateien')}</option>
                    <option value="tasks">{t('cascade.cascade_elements.aufgaben')}</option>
                    <option value="cascade">{t('cascade.cascade_elements.flow')}</option>
                    <option value="settings">{t('cascade.cascade_elements.einstellungen')}</option>
                    <option value="url">{t('cascade.cascade_elements.externe_url')}</option>
                </select>
            </div>
            {el.target === 'url' ? (
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">URL</label>
                    <input value={String(el.url ?? '')} onChange={(e) => onChange({ url: e.target.value })}
                        placeholder="https://..." className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>
            ) : (
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.space-id_oder_pfad')}</label>
                    <input value={String(el.url ?? '')} onChange={(e) => onChange({ url: e.target.value })}
                        placeholder={el.target === 'space' ? 'Space-ID eingeben' : `/${el.target}`}
                        className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>
            )}
        </div>
    ),
    renderPlayer: ({ el, onNavigate, onNavigateApp, hideNavigation, t }) => {
        const target = String(el.target ?? 'space');
        const url = String(el.url ?? '');
        const handleClick = () => {
            if (target === 'url' && url) {
                window.open(url, '_blank');
            } else if (onNavigateApp) {
                if (target === 'space' && url) onNavigateApp(`/spaces/${url}`);
                else if (target === 'chat' && url) onNavigateApp(`/spaces/${url}`);
                else if (target === 'cascade') onNavigateApp('/kaskaden');
                else if (target === 'calendar') onNavigateApp(url ? `/spaces/${url}` : '/kalender');
                else if (target === 'documents') onNavigateApp(url ? `/spaces/${url}` : '/dateien');
                else if (target === 'tasks') onNavigateApp(url ? `/spaces/${url}` : '/aufgaben');
                else if (target === 'settings') onNavigateApp('/einstellungen');
            }
        };
        return (
            <div className="space-y-3">
                <button onClick={handleClick}
                    className="w-full rounded-2xl bg-cyan-500 py-4 text-base font-semibold text-white active:scale-95 transition-transform flex items-center justify-center gap-2">
                    <MaterialIcon name="open_in_new" size={16} className="size-5" /> {String(el.label ?? 'Öffnen')}
                </button>
                <button onClick={() => onNavigate()}
                    className="w-full rounded-2xl border-2 border-border py-3 text-base font-medium text-muted-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>
            </div>
        );
    },
};

const spaceRef: ElementDef = {
    type: 'space',
    label: 'Space öffnen',
    icon: <MaterialIcon name="chat" size={16} className="size-2.5" />,
    color: 'hover:text-primary',
    defaultConfig: () => ({ type: 'space', label: 'Space öffnen', spaceId: '', spaceName: '', openTab: '' }),
    heightRows: () => 1,
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1">
            <MaterialIcon name="chat" size={16} className="size-2.5 text-primary shrink-0" />
            <span className="text-[8px] text-primary truncate">{String(el.spaceName || el.spaceId || 'Space wählen')}</span>
        </div>
    ),
    renderDesigner: ({ el, idx, allElements, onChange, t }) => {
        const spaceElements = allElements
            .map((e, i) => ({ idx: i, el: e }))
            .filter(e => e.el.type === 'createSpace' && e.idx < idx);
        return (
            <div className="space-y-2">
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.space-quelle')}</label>
                    <select value={String((el.sourceSpaceElement as number) ?? -1)}
                        onChange={(e) => { const v = parseInt(e.target.value); onChange({ sourceSpaceElement: v, spaceId: v >= 0 ? '' : el.spaceId }); }}
                        className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                        <option value={-1}>{t('cascade.cascade_elements.manuelle_space-id')}</option>
                        {spaceElements.map(s => (
                            <option key={s.idx} value={s.idx}>#{s.idx + 1} {String(s.el.spaceName || s.el.label || 'Space erstellen')}</option>
                        ))}
                    </select>
                </div>
                {((el.sourceSpaceElement as number) ?? -1) < 0 && (
                    <div>
                        <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.space-id')}</label>
                        <input value={String(el.spaceId ?? '')} onChange={(e) => onChange({ spaceId: e.target.value })}
                            placeholder={t('cascade.cascade_elements.space-id_einfuegen')} className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                )}
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.anzeigename')}</label>
                    <input value={String(el.spaceName ?? '')} onChange={(e) => onChange({ spaceName: e.target.value })}
                        placeholder={t('cascade.cascade_elements.zb_krisenteam')} className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.tab_oeffnen')}</label>
                    <select value={String(el.openTab ?? '')} onChange={(e) => onChange({ openTab: e.target.value })}
                        className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                        <option value="">{t('cascade.cascade_elements.chat_standard')}</option>
                        <option value="files">{t('cascade.cascade_elements.dateien')}</option>
                        <option value="tasks">{t('cascade.cascade_elements.aufgaben')}</option>
                        <option value="calendar">{t('cascade.cascade_elements.kalender')}</option>
                        <option value="letters">{t('cascade.cascade_elements.briefe')}</option>
                        <option value="absence">{t('cascade.cascade_elements.abwesenheiten')}</option>
                        <option value="notebook">{t('cascade.cascade_elements.mitteilungen')}</option>
                        <option value="media">{t('cascade.cascade_elements.medien')}</option>
                        <option value="info">{t('cascade.cascade_elements.info')}</option>
                    </select>
                </div>
            </div>
        );
    },
    renderPlayer: ({ el, idx, state, allElements, onNavigate, onNavigateApp, hideNavigation, t }) => {
        // Space-ID: entweder vom referenzierten createSpace oder manuell
        const srcIdx = (el.sourceSpaceElement as number) ?? -1;
        const spaceId = srcIdx >= 0 ? (state?.[`el_${srcIdx}_created`] ?? '') : String(el.spaceId ?? '');
        const spaceName = String(el.spaceName || el.spaceId || 'Space');
        return (
            <div className="space-y-3">
                {spaceId && (
                    <button onClick={() => {
                        const tab = String(el.openTab ?? '');
                        if (tab) try { localStorage.setItem('prilog.sidePanelTab', tab); } catch { }
                        onNavigateApp?.(`/spaces/${spaceId}`);
                    }}
                        className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                        <MaterialIcon name="chat" size={16} className="size-5" /> {spaceName}
                    </button>
                )}
                {!hideNavigation && (
                    <button onClick={() => onNavigate()}
                        className="w-full rounded-2xl border-2 border-border py-3 text-base font-medium text-muted-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                        {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                    </button>
                )}
            </div>
        );
    },
};

const createSpace: ElementDef = {
    type: 'createSpace',
    label: 'Space erstellen',
    icon: <PlusCircle className="size-2.5" />,
    color: 'hover:text-emerald-500',
    defaultConfig: () => ({ type: 'createSpace', label: 'Space erstellen', spaceName: '', spaceDescription: '', enabledTabs: ['files', 'tasks', 'calendar'], autoExecute: false }),
    heightRows: () => 1,
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1">
            <PlusCircle className="size-2.5 text-emerald-500 shrink-0" />
            <span className="text-[8px] text-emerald-600 truncate">{String(el.spaceName || 'Neuer Space')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => {
        const ALL_TABS = [
            { key: 'files', label: t('app.misc.dateien') },
            { key: 'tasks', label: t('app.misc.aufgaben') },
            { key: 'calendar', label: t('app.misc.kalender') },
            { key: 'letters', label: t('app.misc.briefe') },
            { key: 'absence', label: t('app.misc.abwesenheiten') },
            { key: 'notebook', label: t('app.misc.mitteilungen') },
            { key: 'media', label: t('app.misc.medien') },
            { key: 'activity', label: t('app.misc.aktivitaet') },
        ];
        const enabled: string[] = (el.enabledTabs as string[]) ?? ['files', 'tasks', 'calendar'];
        const toggle = (key: string) => {
            const next = enabled.includes(key) ? enabled.filter(k => k !== key) : [...enabled, key];
            onChange({ enabledTabs: next });
        };
        return (
            <div className="space-y-2">
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.space-name')}</label>
                    <input value={String(el.spaceName ?? '')} onChange={(e) => onChange({ spaceName: e.target.value })}
                        placeholder={t('cascade.cascade_elements.zb_krisengespraech_datum')} className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                    <p className="text-[8px] text-muted-foreground/50 mt-0.5">{t('cascade.cascade_elements.platzhalter')} {'{datum}'}, {'{benutzer}'}</p>
                </div>
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.beschreibung')}</label>
                    <input value={String(el.spaceDescription ?? '')} onChange={(e) => onChange({ spaceDescription: e.target.value })}
                        placeholder={t('cascade.cascade_elements.optional')} className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.aktive_tabs')}</label>
                    <div className="mt-1 flex flex-wrap gap-1">
                        {ALL_TABS.map(tab => {
                            const on = enabled.includes(tab.key);
                            return (
                                <button key={tab.key} onClick={() => toggle(tab.key)}
                                    className={cn("rounded-full px-2 py-0.5 text-[9px] font-medium transition-colors",
                                        on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                    <button onClick={() => onChange({ autoExecute: !el.autoExecute })}
                        className={cn("relative w-8 h-[18px] rounded-full transition-colors shrink-0", el.autoExecute ? "bg-primary" : "bg-border")}>
                        <div className={cn("absolute top-[3px] size-3 rounded-full bg-white shadow-sm transition-transform", el.autoExecute ? "translate-x-[17px]" : "translate-x-[3px]")} />
                    </button>
                    <span className="text-[9px] text-muted-foreground">{t('cascade.cascade_elements.automatisch_erstellen_ohne_klick')}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => onChange({ onlyMe: !el.onlyMe })}
                        className={cn("relative w-8 h-[18px] rounded-full transition-colors shrink-0", el.onlyMe ? "bg-primary" : "bg-border")}>
                        <div className={cn("absolute top-[3px] size-3 rounded-full bg-white shadow-sm transition-transform", el.onlyMe ? "translate-x-[17px]" : "translate-x-[3px]")} />
                    </button>
                    <span className="text-[9px] text-muted-foreground">{t('cascade.cascade_elements.nur_ich_als_mitglied')}</span>
                </div>
            </div>
        );
    },
    renderPlayer: ({ el, idx, state, onNavigate, onNavigateApp, onStateChange, jwt, hideNavigation, t }) => {
        const created = state?.[`el_${idx}_created`];
        const creating = state?.[`el_${idx}_creating`];
        const autoStarted = state?.[`el_${idx}_autoStarted`];
        const error = state?.[`el_${idx}_error`];

        // Auto-Execute: sofort erstellen wenn autoExecute an
        if (el.autoExecute && !created && !creating && !autoStarted && jwt) {
            // Markiere als gestartet und erstelle sofort
            Promise.resolve().then(async () => {
                onStateChange({ ...state, [`el_${idx}_autoStarted`]: true, [`el_${idx}_creating`]: true });
                const now = new Date();
                const autoName = String(el.spaceName || 'Neuer Space').replace('{datum}', now.toLocaleDateString('de-DE')).replace('{benutzer}', '');
                try {
                    const res = await fetch(`${env.platformBaseUrl}/platform/v1/spaces`, {
                        method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: autoName, description: el.spaceDescription || undefined, type: 'GROUP', visibility: 'PRIVATE' }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const sid = data?.space?.id ?? data?.id;
                        // Tabs setzen
                        const allKeys = ['files', 'tasks', 'calendar', 'letters', 'absence', 'notebook', 'media', 'activity'];
                        const enabled: string[] = (el.enabledTabs as string[]) ?? ['files', 'tasks', 'calendar'];
                        const disabledTabs = allKeys.filter(k => !enabled.includes(k));
                        if (disabledTabs.length > 0 && sid) {
                            await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${sid}/mode`, {
                                method: 'PATCH', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ disabledTabs }),
                            }).catch(() => { });
                        }
                        // Nur ich als Mitglied (bei auto-execute)
                        if (el.onlyMe && sid) {
                            try {
                                const membersRes = await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${sid}/members`, { headers: { Authorization: `Bearer ${jwt}` } });
                                if (membersRes.ok) {
                                    const md = await membersRes.json();
                                    const jwtPayload = JSON.parse(atob(jwt.split('.')[1]));
                                    for (const m of (md.items ?? md.members ?? [])) {
                                        if (m.userId !== jwtPayload.sub) {
                                            await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${sid}/members/${encodeURIComponent(m.userId)}`, {
                                                method: 'DELETE', headers: { Authorization: `Bearer ${jwt}` },
                                            }).catch(() => { });
                                        }
                                    }
                                }
                            } catch { }
                        }
                        onStateChange({ ...state, [`el_${idx}_autoStarted`]: true, [`el_${idx}_created`]: sid, [`el_${idx}_creating`]: false });
                    }
                } catch { onStateChange({ ...state, [`el_${idx}_autoStarted`]: true, [`el_${idx}_creating`]: false }); }
            });
        }

        const handleCreate = async () => {
            if (!jwt || creating) return;
            onStateChange({ ...state, [`el_${idx}_creating`]: true });

            const now = new Date();
            const name = String(el.spaceName || 'Neuer Space')
                .replace('{datum}', now.toLocaleDateString('de-DE'))
                .replace('{benutzer}', '');

            try {
                const res = await fetch(`${env.platformBaseUrl}/platform/v1/spaces`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description: el.spaceDescription || undefined, type: 'GROUP', visibility: 'PRIVATE' }),
                });
                if (res.ok) {
                    const data = await res.json();
                    const spaceId = data?.space?.id ?? data?.id;
                    // Tabs konfigurieren
                    if (spaceId) {
                        const allKeys = ['files', 'tasks', 'calendar', 'letters', 'absence', 'notebook', 'media', 'activity'];
                        const enabled: string[] = (el.enabledTabs as string[]) ?? ['files', 'tasks', 'calendar'];
                        const disabledTabs = allKeys.filter(k => !enabled.includes(k));
                        if (disabledTabs.length > 0) {
                            await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${spaceId}/mode`, {
                                method: 'PATCH',
                                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ disabledTabs }),
                            }).catch(() => { });
                        }
                    }
                    // Nur den aktuellen User als Mitglied behalten (wenn onlyMe aktiviert)
                    if (el.onlyMe) try {
                        const membersRes = await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${spaceId}/members`, {
                            headers: { Authorization: `Bearer ${jwt}` },
                        });
                        if (membersRes.ok) {
                            const membersData = await membersRes.json();
                            const members = membersData.items ?? membersData.members ?? [];
                            // Finde den aktuellen User (aus JWT sub)
                            const jwtPayload = JSON.parse(atob(jwt.split('.')[1]));
                            const myUserId = jwtPayload.sub;
                            for (const m of members) {
                                if (m.userId !== myUserId) {
                                    await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${spaceId}/members/${encodeURIComponent(m.userId)}`, {
                                        method: 'DELETE', headers: { Authorization: `Bearer ${jwt}` },
                                    }).catch(() => { });
                                }
                            }
                        }
                    } catch { /* ignore */ }

                    onStateChange({ ...state, [`el_${idx}_created`]: spaceId, [`el_${idx}_creating`]: false, [`el_${idx}_error`]: null });
                } else {
                    const errText = await res.text().catch(() => '');
                    onStateChange({ ...state, [`el_${idx}_creating`]: false, [`el_${idx}_error`]: `Fehler ${res.status}: ${errText.slice(0, 100)}` });
                }
            } catch {
                onStateChange({ ...state, [`el_${idx}_creating`]: false });
            }
        };

        return (
            <div className="space-y-3">
                {error && (
                    <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-xs text-red-600 dark:text-red-400">
                        {error}
                    </div>
                )}
                {!created ? (
                    <button onClick={handleCreate} disabled={creating}
                        className={cn("w-full rounded-2xl py-4 text-base font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2",
                            creating ? "bg-muted text-muted-foreground" : "bg-emerald-500 text-white")}>
                        {creating ? <><Loader2 className="size-5 animate-spin" /> {t('cascade.cascade_elements.erstelle')}</> : <><PlusCircle className="size-5" /> {String(el.label || 'Space erstellen')}</>}
                    </button>
                ) : (
                    <div className="space-y-2">
                        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 py-3 px-4 text-center">
                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t('cascade.cascade_elements.space_erstellt')}</p>
                        </div>
                        <button onClick={() => onNavigateApp?.(`/spaces/${created}`)}
                            className="w-full rounded-2xl bg-primary py-3 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                            <MaterialIcon name="chat" size={16} className="size-5" /> {t('cascade.cascade_elements.space_oeffnen')}
                        </button>
                    </div>
                )}
                {!hideNavigation && created && (
                    <button onClick={() => onNavigate()}
                        className="w-full rounded-2xl border-2 border-border py-3 text-base font-medium text-muted-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                        {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                    </button>
                )}
            </div>
        );
    },
};

// ─── Form Element (dynamisches Formular) ─────────────────────────────────────

interface FormField {
    id: string;
    type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'file' | 'signature';
    label: string;
    required?: boolean;
    options?: string[]; // fuer select
    placeholder?: string;
}

const FORM_FIELD_TYPES: { type: FormField['type']; label: string }[] = [
    { type: 'text', label: 'Text' },
    { type: 'textarea', label: 'Mehrzeilig' },
    { type: 'number', label: 'Zahl' },
    { type: 'date', label: 'Datum' },
    { type: 'select', label: 'Auswahl' },
    { type: 'checkbox', label: 'Checkbox' },
    { type: 'file', label: 'Datei' },
    { type: 'signature', label: 'Unterschrift' },
];

const form: ElementDef = {
    type: 'form',
    label: 'Formular',
    icon: <MaterialIcon name="list_alt" size={16} className="size-2.5" />,
    color: 'hover:text-teal-500',
    defaultConfig: () => ({ type: 'form', label: 'Formular', fields: [] }),
    heightRows: (el) => Math.max(1, ((el.fields as FormField[]) ?? []).length),
    renderGraph: ({ el, t }) => {
        const fields = (el.fields as FormField[]) ?? [];
        return (
            <>
                {el.label && <div className="text-[9px] text-muted-foreground">{String(el.label)}</div>}
                {fields.slice(0, 4).map((f, i) => (
                    <div key={f.id} className="flex items-center gap-1 text-[8px] text-muted-foreground/60">
                        <span className="shrink-0">{f.required ? '●' : '○'}</span>
                        <span className="truncate">{f.label}</span>
                    </div>
                ))}
                {fields.length > 4 && <div className="text-[7px] text-muted-foreground/40">+{fields.length - 4} weitere</div>}
            </>
        );
    },
    renderDesigner: ({ el, onChange, t }) => {
        const fields: FormField[] = (el.fields as FormField[]) ?? [];
        const addField = (type: FormField['type']) => {
            const newField: FormField = { id: `field-${Date.now()}`, type, label: FORM_FIELD_TYPES.find(_t => _t.type === type)?.label ?? type, required: false };
            onChange({ fields: [...fields, newField] });
        };
        const updateField = (idx: number, patch: Partial<FormField>) => {
            onChange({ fields: fields.map((f, i) => i === idx ? { ...f, ...patch } : f) });
        };
        const removeField = (idx: number) => {
            onChange({ fields: fields.filter((_, i) => i !== idx) });
        };
        return (
            <div className="space-y-2">
                {fields.map((f, idx) => (
                    <div key={f.id} className="flex items-start gap-2 group rounded-md border border-border/50 p-1.5">
                        <span className="text-[9px] text-muted-foreground/40 mt-1 w-3 text-right shrink-0">{idx + 1}.</span>
                        <div className="flex-1 space-y-1">
                            <input value={f.label} onChange={(e) => updateField(idx, { label: e.target.value })}
                                className="h-6 w-full rounded border bg-background px-2 text-[10px] outline-none focus:ring-1 focus:ring-primary" />
                            <div className="flex items-center gap-2">
                                <select value={f.type} onChange={(e) => updateField(idx, { type: e.target.value as FormField['type'] })}
                                    className="h-5 rounded border bg-background px-1 text-[9px] outline-none">
                                    {FORM_FIELD_TYPES.map(_t => <option key={_t.type} value={_t.type}>{_t.label}</option>)}
                                </select>
                                <label className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                    <input type="checkbox" checked={f.required ?? false} onChange={(e) => updateField(idx, { required: e.target.checked })} className="size-3" />
                                    {t('cascade.cascade_elements.pflicht')}
                                </label>
                            </div>
                            {f.type === 'select' && (
                                <input value={(f.options ?? []).join(', ')}
                                    onChange={(e) => updateField(idx, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                    placeholder={t('cascade.cascade_elements.optionen_kommagetrennt')}
                                    className="h-5 w-full rounded border bg-background px-2 text-[9px] outline-none" />
                            )}
                        </div>
                        <button onClick={() => removeField(idx)}
                            className="rounded p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 shrink-0 mt-0.5">×</button>
                    </div>
                ))}
                <div className="flex flex-wrap gap-1">
                    {FORM_FIELD_TYPES.map(_t => (
                        <button key={_t.type} onClick={() => addField(_t.type)}
                            className="rounded border border-dashed border-border/50 px-1.5 py-0.5 text-[9px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                            + {_t.label}
                        </button>
                    ))}
                </div>
            </div>
        );
    },
    renderPlayer: ({ el, idx, state, onNavigate, onStateChange, hideNavigation, t }) => {
        const fields: FormField[] = (el.fields as FormField[]) ?? [];
        const formData: Record<string, unknown> = (state?.[`el_${idx}`] as Record<string, unknown>) ?? {};
        const updateFormData = (fieldId: string, value: unknown) => {
            onStateChange({ ...state, [`el_${idx}`]: { ...formData, [fieldId]: value } });
        };
        const allRequiredFilled = fields.filter(f => f.required).every(f => {
            const v = formData[f.id];
            return v !== undefined && v !== null && v !== '';
        });
        return (
            <div className="space-y-4">
                {fields.map(f => (
                    <div key={f.id}>
                        <label className="text-sm font-medium">{f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}</label>
                        {f.type === 'text' && (
                            <input type="text" value={String(formData[f.id] ?? '')} onChange={(e) => updateFormData(f.id, e.target.value)}
                                placeholder={f.placeholder} className="mt-1 w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-base outline-none focus:border-primary" />
                        )}
                        {f.type === 'textarea' && (
                            <textarea value={String(formData[f.id] ?? '')} onChange={(e) => updateFormData(f.id, e.target.value)}
                                rows={3} className="mt-1 w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-base outline-none focus:border-primary resize-none" />
                        )}
                        {f.type === 'number' && (
                            <input type="number" value={String(formData[f.id] ?? '')} onChange={(e) => updateFormData(f.id, e.target.value)}
                                className="mt-1 w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-base outline-none focus:border-primary" />
                        )}
                        {f.type === 'date' && (
                            <input type="date" value={String(formData[f.id] ?? '')} onChange={(e) => updateFormData(f.id, e.target.value)}
                                className="mt-1 w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-base outline-none focus:border-primary" />
                        )}
                        {f.type === 'select' && (
                            <select value={String(formData[f.id] ?? '')} onChange={(e) => updateFormData(f.id, e.target.value)}
                                className="mt-1 w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-base outline-none focus:border-primary">
                                <option value="">{t('cascade.cascade_elements.bitte_waehlen')}</option>
                                {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        )}
                        {f.type === 'checkbox' && (
                            <label className="mt-2 flex items-center gap-3">
                                <input type="checkbox" checked={!!formData[f.id]} onChange={(e) => updateFormData(f.id, e.target.checked)}
                                    className="size-5 rounded" />
                                <span className="text-base">{t('cascade.cascade_elements.ja')}</span>
                            </label>
                        )}
                        {f.type === 'file' && (
                            <div className="mt-1">
                                {formData[f.id] ? (
                                    <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3">
                                        <MaterialIcon name="check" size={16} className="size-4 text-emerald-500 shrink-0" />
                                        <span className="text-sm truncate flex-1">{String((formData[f.id] as any)?.name ?? 'Datei hochgeladen')}</span>
                                        <button onClick={() => updateFormData(f.id, null)} className="text-xs text-muted-foreground hover:text-destructive">{t('cascade.cascade_elements.entfernen')}</button>
                                    </div>
                                ) : (
                                    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-6 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors">
                                        <span className="text-sm text-muted-foreground">{t('cascade.cascade_elements.datei_waehlen_oder_hierher_ziehen')}</span>
                                        <input type="file" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) updateFormData(f.id, { name: file.name, size: file.size, type: file.type, dataUrl: URL.createObjectURL(file) });
                                        }} />
                                    </label>
                                )}
                            </div>
                        )}
                        {f.type === 'signature' && (
                            <div className="mt-1">
                                {formData[f.id] ? (
                                    <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-white dark:bg-card p-2">
                                        <img src={String(formData[f.id])} alt={t('cascade.cascade_elements.unterschrift')} className="h-20 mx-auto" />
                                        <button onClick={() => updateFormData(f.id, null)}
                                            className="mt-1 block mx-auto text-xs text-muted-foreground hover:text-destructive">{t('cascade.cascade_elements.neu_unterschreiben')}</button>
                                    </div>
                                ) : (
                                    <SignatureCanvas onSign={(dataUrl) => updateFormData(f.id, dataUrl)} />
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {!hideNavigation && (
                    <button onClick={() => onNavigate()} disabled={!allRequiredFilled}
                        className={cn("w-full rounded-2xl py-4 text-base font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2",
                            allRequiredFilled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground cursor-not-allowed")}>
                        {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                    </button>
                )}
            </div>
        );
    },
};

const parallelSplit: ElementDef = {
    type: 'parallel_split',
    label: 'Parallel (Aufteilen)',
    icon: <Split className="size-2.5" />,
    color: 'hover:text-purple-500',
    defaultConfig: () => ({ type: 'parallel_split', label: 'Parallele Pfade' }),
    heightRows: () => 1,
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1 rounded bg-purple-50 dark:bg-purple-900/20 px-1 py-0.5">
            <Split className="size-2.5 text-purple-500 shrink-0" />
            <span className="text-[8px] font-medium text-purple-600 dark:text-purple-400 truncate">{String(el.label ?? 'Aufteilen')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div>
            <p className="text-[9px] text-muted-foreground">{t('cascade.cascade_elements.alle_ausgehenden_kanten_werden_gleichzei')}</p>
        </div>
    ),
    renderPlayer: ({ el, onNavigate, t }) => (
        <div className="space-y-3">
            <div className="rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-4 text-center">
                <Split className="size-6 text-purple-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-purple-700 dark:text-purple-400">{t('cascade.cascade_elements.parallele_pfade_gestartet')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('cascade.cascade_elements.mehrere_aufgaben_laufen_gleichzeitig')}</p>
            </div>
            <button onClick={() => onNavigate()}
                className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
            </button>
        </div>
    ),
};

const parallelJoin: ElementDef = {
    type: 'parallel_join',
    label: 'Parallel (Zusammenführen)',
    icon: <Merge className="size-2.5" />,
    color: 'hover:text-purple-500',
    defaultConfig: () => ({ type: 'parallel_join', label: 'Zusammenführen' }),
    heightRows: () => 1,
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1 rounded bg-purple-50 dark:bg-purple-900/20 px-1 py-0.5">
            <Merge className="size-2.5 text-purple-500 shrink-0" />
            <span className="text-[8px] font-medium text-purple-600 dark:text-purple-400 truncate">{String(el.label ?? 'Zusammenführen')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div>
            <p className="text-[9px] text-muted-foreground">{t('cascade.cascade_elements.wartet_bis_alle_eingehenden_parallelen_p')}</p>
        </div>
    ),
    renderPlayer: ({ el, t }) => (
        <div className="rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-4 text-center">
            <Merge className="size-6 text-purple-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-purple-700 dark:text-purple-400">{t('cascade.cascade_elements.warte_auf_alle_parallelen_pfade')}</p>
        </div>
    ),
};

const checkpoint: ElementDef = {
    type: 'checkpoint',
    label: 'Freigabe',
    icon: <MaterialIcon name="verified_user" size={16} className="size-2.5" />,
    color: 'hover:text-rose-500',
    defaultConfig: () => ({ type: 'checkpoint', label: 'Freigabe erforderlich', assignedRole: '', assignedUserId: '', requiredApprovals: 1, dueHours: 0 }),
    heightRows: () => 1,
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1 rounded bg-rose-50 dark:bg-rose-900/20 px-1 py-0.5">
            <MaterialIcon name="verified_user" size={16} className="size-2.5 text-rose-500 shrink-0" />
            <span className="text-[8px] font-medium text-rose-600 dark:text-rose-400 truncate">{String(el.label ?? 'Freigabe')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div className="space-y-2">
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.zugewiesene_rolle')}</label>
                <input value={String(el.assignedRole ?? '')} onChange={(e) => onChange({ assignedRole: e.target.value })}
                    placeholder={t('cascade.cascade_elements.zb_schulleitung_lehrkraft')}
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.oder_bestimmte_person_user-id')}</label>
                <input value={String(el.assignedUserId ?? '')} onChange={(e) => onChange({ assignedUserId: e.target.value })}
                    placeholder={t('cascade.cascade_elements.optional_leer_rolle_entscheidet')}
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.noetige_freigaben')}</label>
                    <input type="number" min={1} max={10} value={Number(el.requiredApprovals ?? 1)}
                        onChange={(e) => onChange({ requiredApprovals: parseInt(e.target.value) || 1 })}
                        className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.frist_stunden')}</label>
                    <input type="number" min={0} max={720} value={Number(el.dueHours ?? 0)}
                        onChange={(e) => onChange({ dueHours: parseInt(e.target.value) || 0 })}
                        placeholder={t('cascade.cascade_elements.0_keine')}
                        className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>
            </div>
        </div>
    ),
    renderPlayer: ({ el, t }) => (
        <div className="space-y-3">
            <div className="rounded-2xl border-2 border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-5 text-center">
                <MaterialIcon name="verified_user" size={16} className="size-8 text-rose-500 mx-auto mb-2" />
                <p className="text-base font-semibold text-rose-700 dark:text-rose-400">{String(el.label ?? 'Freigabe erforderlich')}</p>
                {el.assignedRole ? <p className="text-sm text-rose-600/70 dark:text-rose-400/70 mt-1">{t('cascade.cascade_elements.zustaendig')} {String(el.assignedRole)}</p> : null}
                <p className="text-xs text-muted-foreground mt-2">{t('cascade.cascade_elements.dieser_schritt_wartet_auf_eine_freigabe_')}</p>
            </div>
        </div>
    ),
};

const timestamp: ElementDef = {
    type: 'timestamp',
    label: 'Zeitstempel',
    icon: <MaterialIcon name="calendar_today" size={16} className="size-2.5" />,
    color: 'hover:text-indigo-500',
    defaultConfig: () => ({ type: 'timestamp', label: 'Erstellt am', hidden: true, format: 'datetime' }),
    heightRows: (el) => el.hidden ? 0 : 1,
    renderGraph: ({ el, t }) => {
        if (el.hidden) return <></>;
        return (
            <div className="flex items-center gap-1">
                <MaterialIcon name="calendar_today" size={16} className="size-2.5 text-indigo-500 shrink-0" />
                <span className="text-[8px] text-indigo-600 truncate">{String(el.label ?? 'Zeitstempel')}</span>
            </div>
        );
    },
    renderDesigner: ({ el, onChange, t }) => (
        <div className="space-y-2">
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.format')}</label>
                <select value={String(el.format ?? 'datetime')} onChange={(e) => onChange({ format: e.target.value })}
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                    <option value="datetime">{t('cascade.cascade_elements.datum_uhrzeit')}</option>
                    <option value="date">{t('cascade.cascade_elements.nur_datum')}</option>
                    <option value="time">{t('cascade.cascade_elements.nur_uhrzeit')}</option>
                    <option value="iso">{t('cascade.cascade_elements.iso-format')}</option>
                </select>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => onChange({ hidden: !el.hidden })}
                    className={cn("relative w-8 h-[18px] rounded-full transition-colors shrink-0", el.hidden ? "bg-primary" : "bg-border")}>
                    <div className={cn("absolute top-[3px] size-3 rounded-full bg-white shadow-sm transition-transform", el.hidden ? "translate-x-[17px]" : "translate-x-[3px]")} />
                </button>
                <span className="text-[9px] text-muted-foreground">{t('cascade.cascade_elements.unsichtbar_nur_als_variable')}</span>
            </div>
        </div>
    ),
    renderPlayer: ({ el, t }) => {
        if (el.hidden) return <></>;
        const now = new Date();
        const formatted = el.format === 'date' ? now.toLocaleDateString('de-DE')
            : el.format === 'time' ? now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                : el.format === 'iso' ? now.toISOString()
                    : now.toLocaleDateString('de-DE') + ', ' + now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        return (
            <div className="flex items-center gap-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3">
                <MaterialIcon name="calendar_today" size={16} className="size-4 text-indigo-500 shrink-0" />
                <span className="text-sm text-indigo-700 dark:text-indigo-300">{String(el.label ?? 'Erstellt am')}: <strong>{formatted}</strong></span>
            </div>
        );
    },
};

// ─── Benachrichtigung ─────────────────────────────────────────────────────────

const notification: ElementDef = {
    type: 'notification',
    label: 'Benachrichtigung',
    icon: <MaterialIcon name="notifications" size={16} className="size-2.5" />,
    color: 'hover:text-blue-500',
    defaultConfig: () => ({ type: 'notification', label: 'Benachrichtigung senden', message: '', channel: 'chat', recipient: '' }),
    heightRows: () => 1,
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1">
            <MaterialIcon name="notifications" size={16} className="size-2.5 text-blue-500 shrink-0" />
            <span className="text-[8px] text-blue-600 truncate">{String(el.label ?? 'Benachrichtigung')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div className="space-y-2">
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.kanal')}</label>
                <select value={String(el.channel ?? 'chat')} onChange={(e) => onChange({ channel: e.target.value })}
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                    <option value="chat">{t('cascade.cascade_elements.chat-nachricht')}</option>
                    <option value="email">{t('cascade.cascade_elements.email')}</option>
                </select>
            </div>
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.empfaenger_user-id_oder_rolle')}</label>
                <input value={String(el.recipient ?? '')} onChange={(e) => onChange({ recipient: e.target.value })}
                    placeholder={t('cascade.cascade_elements.zb_lehrerschuleprilogteam_oder_schulleit')}
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.nachricht')}</label>
                <textarea value={String(el.message ?? '')} onChange={(e) => onChange({ message: e.target.value })} rows={2}
                    placeholder={t('cascade.cascade_elements.nachrichtentext_variablen_mit_name_einfu')}
                    className="mt-0.5 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none" />
            </div>
        </div>
    ),
    renderPlayer: ({ el, onNavigate, hideNavigation, t }) => (
        <div className="space-y-3">
            <div className="rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 text-center">
                <MaterialIcon name="notifications" size={16} className="size-6 text-blue-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">{t('cascade.cascade_elements.benachrichtigung_wird_gesendet')}</p>
                <p className="text-xs text-muted-foreground mt-1">{String(el.message ?? '').slice(0, 80) || 'Nachricht wird zugestellt...'}</p>
            </div>
            {!hideNavigation && <button onClick={() => onNavigate()}
                className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
            </button>}
        </div>
    ),
};

// ─── Verzögerung ──────────────────────────────────────────────────────────────

const delay: ElementDef = {
    type: 'delay',
    label: 'Verzoegerung',
    icon: <Timer className="size-2.5" />,
    color: 'hover:text-amber-500',
    defaultConfig: () => ({ type: 'delay', label: 'Warten', delayMinutes: 60 }),
    heightRows: () => 1,
    renderGraph: ({ el, t }) => {
        const mins = Number(el.delayMinutes ?? 60);
        const display = mins >= 1440 ? `${Math.round(mins / 1440)}d` : mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}min`;
        return (
            <div className="flex items-center gap-1">
                <Timer className="size-2.5 text-amber-500 shrink-0" />
                <span className="text-[8px] text-amber-600 truncate">{display} warten</span>
            </div>
        );
    },
    renderDesigner: ({ el, onChange, t }) => (
        <div>
            <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.wartezeit_minuten')}</label>
            <div className="mt-0.5 flex gap-1">
                {[5, 15, 60, 120, 1440].map(m => (
                    <button key={m} onClick={() => onChange({ delayMinutes: m })}
                        className={cn("rounded-md px-2 py-1 text-[10px] transition-colors",
                            Number(el.delayMinutes) === m ? "bg-amber-500 text-white" : "border hover:bg-muted")}>
                        {m >= 1440 ? `${m / 1440}d` : m >= 60 ? `${m / 60}h` : `${m}m`}
                    </button>
                ))}
                <input type="number" min={1} value={Number(el.delayMinutes ?? 60)}
                    onChange={(e) => onChange({ delayMinutes: parseInt(e.target.value) || 60 })}
                    className="h-7 w-16 rounded-lg border bg-background px-2 text-[10px] outline-none" />
            </div>
        </div>
    ),
    renderPlayer: ({ el, onNavigate, hideNavigation, t }) => {
        const mins = Number(el.delayMinutes ?? 60);
        const display = mins >= 1440 ? `${Math.round(mins / 1440)} Tage` : mins >= 60 ? `${Math.round(mins / 60)} Stunden` : `${mins} Minuten`;
        return (
            <div className="space-y-3">
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-5 text-center">
                    <Timer className="size-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-base font-semibold text-amber-700 dark:text-amber-400">{display} warten</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('cascade.cascade_elements.dieser_schritt_wartet_bevor_es_weitergeh')}</p>
                </div>
                {!hideNavigation && <button onClick={() => onNavigate()}
                    className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>}
            </div>
        );
    },
};

// ─── Info-Anzeige ─────────────────────────────────────────────────────────────

const infoDisplay: ElementDef = {
    type: 'info',
    label: 'Info-Anzeige',
    icon: <MaterialIcon name="info" size={16} className="size-2.5" />,
    color: 'hover:text-sky-500',
    defaultConfig: () => ({ type: 'info', label: 'Information', content: '', imageUrl: '' }),
    heightRows: (el) => el.content ? 2 : 1,
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1">
            <MaterialIcon name="info" size={16} className="size-2.5 text-sky-500 shrink-0" />
            <span className="text-[8px] text-sky-600 truncate">{String(el.label ?? 'Info')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div className="space-y-2">
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.inhalt_markdown')}</label>
                <textarea value={String(el.content ?? '')} onChange={(e) => onChange({ content: e.target.value })} rows={4}
                    placeholder={t('cascade.cascade_elements.anweisungen_erklaerungen_checklisten1010')}
                    className="mt-0.5 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none font-mono" />
            </div>
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.bild-url_optional')}</label>
                <input value={String(el.imageUrl ?? '')} onChange={(e) => onChange({ imageUrl: e.target.value })}
                    placeholder="https://..."
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
            </div>
        </div>
    ),
    renderPlayer: ({ el, onNavigate, hideNavigation, t }) => {
        const content = String(el.content ?? '');
        const imageUrl = String(el.imageUrl ?? '');
        // Einfaches Markdown-Rendering (fett, kursiv, Listen)
        const rendered = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^- (.+)$/gm, '• $1')
            .replace(/\n/g, '<br>');
        return (
            <div className="space-y-3">
                {imageUrl && (
                    <img src={imageUrl} alt="" className="w-full rounded-xl object-cover max-h-48" />
                )}
                <div className="rounded-2xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-5">
                    <div className="flex items-start gap-3">
                        <MaterialIcon name="info" size={16} className="size-5 text-sky-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-sky-900 dark:text-sky-100 leading-relaxed" dangerouslySetInnerHTML={{ __html: rendered }} />
                    </div>
                </div>
                {!hideNavigation && <button onClick={() => onNavigate()}
                    className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>}
            </div>
        );
    },
};

// ─── Bewertung (Sterne) ───────────────────────────────────────────────────────

const rating: ElementDef = {
    type: 'rating',
    label: 'Bewertung',
    icon: <MaterialIcon name="star" size={16} className="size-2.5" />,
    color: 'hover:text-yellow-500',
    defaultConfig: () => ({ type: 'rating', label: 'Bewertung', maxStars: 5 }),
    heightRows: () => 1,
    renderGraph: ({ el, idx, nodeState, t }) => {
        const val = Number(nodeState?.[`el_${idx}`] ?? 0);
        const max = Number(el.maxStars ?? 5);
        return (
            <div className="flex items-center gap-0.5">
                {Array.from({ length: max }, (_, i) => (
                    <Star key={i} className={cn("size-2.5", i < val ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20")} />
                ))}
            </div>
        );
    },
    renderDesigner: ({ el, onChange, t }) => (
        <div>
            <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.maximale_sterne')}</label>
            <div className="mt-0.5 flex gap-1">
                {[3, 4, 5, 6, 10].map(n => (
                    <button key={n} onClick={() => onChange({ maxStars: n })}
                        className={cn("rounded-md px-2 py-1 text-[10px] transition-colors",
                            Number(el.maxStars) === n ? "bg-yellow-500 text-white" : "border hover:bg-muted")}>
                        {n}★
                    </button>
                ))}
            </div>
        </div>
    ),
    renderPlayer: ({ el, idx, state, onNavigate, onStateChange, hideNavigation, t }) => {
        const val = Number(state?.[`el_${idx}`] ?? 0);
        const max = Number(el.maxStars ?? 5);
        return (
            <div className="space-y-4">
                <div className="flex justify-center gap-2">
                    {Array.from({ length: max }, (_, i) => (
                        <button key={i} onClick={() => onStateChange({ ...state, [`el_${idx}`]: i + 1 })}
                            className="transition-transform hover:scale-125 active:scale-95">
                            <Star className={cn("size-10", i < val ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20")} />
                        </button>
                    ))}
                </div>
                {val > 0 && <p className="text-center text-sm text-muted-foreground">{val} {t('cascade.cascade_elements.sternen')} {max} {t('cascade.cascade_elements.sternen')}</p>}
                {!hideNavigation && <button onClick={() => onNavigate()} disabled={val === 0}
                    className={cn("w-full rounded-2xl py-4 text-base font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2",
                        val > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground cursor-not-allowed")}>
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>}
            </div>
        );
    },
};

// ─── Variable setzen ──────────────────────────────────────────────────────────

const setVariable: ElementDef = {
    type: 'setVariable',
    label: 'Variable setzen',
    icon: <Variable className="size-2.5" />,
    color: 'hover:text-violet-500',
    defaultConfig: () => ({ type: 'setVariable', label: 'Variable setzen', targetVar: '', expression: '', hidden: true }),
    heightRows: (el) => el.hidden ? 0 : 1,
    renderGraph: ({ el, t }) => {
        if (el.hidden) return <></>;
        return (
            <div className="flex items-center gap-1">
                <Variable className="size-2.5 text-violet-500 shrink-0" />
                <span className="text-[8px] text-violet-600 truncate">{String(el.targetVar || 'Variable')}</span>
            </div>
        );
    },
    renderDesigner: ({ el, onChange, t }) => (
        <div className="space-y-2">
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.ziel-variable')}</label>
                <input value={String(el.targetVar ?? '')} onChange={(e) => onChange({ targetVar: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                    placeholder={t('cascade.cascade_elements.zb_status')} className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm font-mono outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.wert_ausdruck')}</label>
                <input value={String(el.expression ?? '')} onChange={(e) => onChange({ expression: e.target.value })}
                    placeholder={t('cascade.cascade_elements.zb_dringend_oder_anzahl_1')}
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm font-mono outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => onChange({ hidden: !el.hidden })}
                    className={cn("relative w-8 h-[18px] rounded-full transition-colors shrink-0", el.hidden ? "bg-primary" : "bg-border")}>
                    <div className={cn("absolute top-[3px] size-3 rounded-full bg-white shadow-sm transition-transform", el.hidden ? "translate-x-[17px]" : "translate-x-[3px]")} />
                </button>
                <span className="text-[9px] text-muted-foreground">{t('cascade.cascade_elements.unsichtbar_im_player')}</span>
            </div>
        </div>
    ),
    renderPlayer: ({ el, t }) => {
        if (el.hidden) return <></>;
        return (
            <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-4 py-2 text-xs text-violet-600">
                <Variable className="size-3 inline mr-1" />{String(el.targetVar)} = {String(el.expression)}
            </div>
        );
    },
};

// ─── Tabelle (dynamische Zeilenerfassung) ─────────────────────────────────────

const tableInput: ElementDef = {
    type: 'table',
    label: 'Tabelle',
    icon: <MaterialIcon name="table_chart" size={16} className="size-2.5" />,
    color: 'hover:text-emerald-500',
    defaultConfig: () => ({ type: 'table', label: 'Tabelle', columns: [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Wert' }] }),
    heightRows: (el) => Math.max(1, ((el.columns as any[]) ?? []).length),
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1">
            <MaterialIcon name="table_chart" size={16} className="size-2.5 text-emerald-500 shrink-0" />
            <span className="text-[8px] text-emerald-600 truncate">{((el.columns as any[]) ?? []).length} {t('cascade.cascade_elements.spalten')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => {
        const cols: Array<{ key: string; label: string }> = (el.columns as any[]) ?? [];
        return (
            <div className="space-y-2">
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.spalten')}</label>
                {cols.map((c, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <input value={c.label} onChange={(e) => {
                            const next = [...cols]; next[i] = { ...c, label: e.target.value, key: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_') };
                            onChange({ columns: next });
                        }} className="flex-1 h-6 rounded border bg-background px-2 text-[10px] outline-none" placeholder={t('cascade.cascade_elements.spaltenname')} />
                        <button onClick={() => onChange({ columns: cols.filter((_, j) => j !== i) })}
                            className="text-muted-foreground/30 hover:text-destructive text-xs">×</button>
                    </div>
                ))}
                <button onClick={() => onChange({ columns: [...cols, { key: `col_${Date.now()}`, label: 'Neue Spalte' }] })}
                    className="text-[10px] text-primary hover:text-primary/80">{t('cascade.cascade_elements.spalte')}</button>
            </div>
        );
    },
    renderPlayer: ({ el, idx, state, onNavigate, onStateChange, hideNavigation, t }) => {
        const cols: Array<{ key: string; label: string }> = (el.columns as any[]) ?? [];
        const rows: Array<Record<string, string>> = (state?.[`el_${idx}`] as any[]) ?? [];
        const addRow = () => {
            const empty: Record<string, string> = {};
            cols.forEach(c => { empty[c.key] = ''; });
            onStateChange({ ...state, [`el_${idx}`]: [...rows, empty] });
        };
        const updateCell = (rowIdx: number, key: string, value: string) => {
            const next = rows.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r);
            onStateChange({ ...state, [`el_${idx}`]: next });
        };
        const removeRow = (rowIdx: number) => {
            onStateChange({ ...state, [`el_${idx}`]: rows.filter((_, i) => i !== rowIdx) });
        };
        return (
            <div className="space-y-3">
                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-muted/30">
                                {cols.map(c => <th key={c.key} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{c.label}</th>)}
                                <th className="w-8" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, ri) => (
                                <tr key={ri} className="border-t">
                                    {cols.map(c => (
                                        <td key={c.key} className="px-1 py-1">
                                            <input value={row[c.key] ?? ''} onChange={(e) => updateCell(ri, c.key, e.target.value)}
                                                className="w-full rounded border-0 bg-transparent px-2 py-1 text-sm outline-none focus:bg-background focus:ring-1 focus:ring-primary" />
                                        </td>
                                    ))}
                                    <td><button onClick={() => removeRow(ri)} className="text-xs text-muted-foreground/40 hover:text-destructive px-1">×</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button onClick={addRow} className="text-sm text-primary hover:text-primary/80">{t('cascade.cascade_elements.zeile_hinzufuegen')}</button>
                {!hideNavigation && <button onClick={() => onNavigate()}
                    className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>}
            </div>
        );
    },
};

// ─── Dokument erstellen ───────────────────────────────────────────────────────

const createDocument: ElementDef = {
    type: 'createDocument',
    label: 'Dokument erstellen',
    icon: <FileOutput className="size-2.5" />,
    color: 'hover:text-teal-500',
    defaultConfig: () => ({ type: 'createDocument', label: 'Dokument erstellen', template: '', fileName: 'Bericht_{datum}', autoExecute: false }),
    heightRows: () => 1,
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1">
            <FileOutput className="size-2.5 text-teal-500 shrink-0" />
            <span className="text-[8px] text-teal-600 truncate">{String(el.fileName || 'Dokument')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div className="space-y-2">
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.dateiname')}</label>
                <input value={String(el.fileName ?? '')} onChange={(e) => onChange({ fileName: e.target.value })}
                    placeholder={t('cascade.cascade_elements.zb_meldebogen_datum')} className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                <p className="text-[8px] text-muted-foreground/50 mt-0.5">{t('cascade.cascade_elements.platzhalter')} {'{datum}'}, {'{benutzer}'}, {'{variablenname}'}</p>
            </div>
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.vorlage_markdown')}</label>
                <textarea value={String(el.template ?? '')} onChange={(e) => onChange({ template: e.target.value })} rows={5}
                    placeholder={'# Meldebogen\n\nDatum: {erstellt_am}\nSchweregrad: {schweregrad}\nBetroffene: {betroffene}\n\n## Beschreibung\n{beschreibung}'}
                    className="mt-0.5 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none font-mono" />
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => onChange({ autoExecute: !el.autoExecute })}
                    className={cn("relative w-8 h-[18px] rounded-full transition-colors shrink-0", el.autoExecute ? "bg-primary" : "bg-border")}>
                    <div className={cn("absolute top-[3px] size-3 rounded-full bg-white shadow-sm transition-transform", el.autoExecute ? "translate-x-[17px]" : "translate-x-[3px]")} />
                </button>
                <span className="text-[9px] text-muted-foreground">{t('cascade.cascade_elements.automatisch_erstellen')}</span>
            </div>
        </div>
    ),
    renderPlayer: ({ el, onNavigate, hideNavigation, t }) => (
        <div className="space-y-3">
            <div className="rounded-2xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 p-4 text-center">
                <FileOutput className="size-6 text-teal-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-teal-700 dark:text-teal-400">{t('cascade.cascade_elements.dokument_wird_erstellt')}</p>
                <p className="text-xs text-muted-foreground mt-1">{String(el.fileName || 'Bericht')} {t('cascade.cascade_elements.wird_aus_den_gesammelten_daten_generiert')}</p>
            </div>
            {!hideNavigation && <button onClick={() => onNavigate()}
                className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
            </button>}
        </div>
    ),
};

// ─── Webhook ──────────────────────────────────────────────────────────────────

const webhook: ElementDef = {
    type: 'webhook',
    label: 'Webhook',
    icon: <Webhook className="size-2.5" />,
    color: 'hover:text-orange-500',
    defaultConfig: () => ({ type: 'webhook', label: 'Webhook senden', url: '', method: 'POST', hidden: true }),
    heightRows: (el) => el.hidden ? 0 : 1,
    renderGraph: ({ el, t }) => {
        if (el.hidden) return <></>;
        return (
            <div className="flex items-center gap-1">
                <Webhook className="size-2.5 text-orange-500 shrink-0" />
                <span className="text-[8px] text-orange-600 truncate">{String(el.label ?? 'Webhook')}</span>
            </div>
        );
    },
    renderDesigner: ({ el, onChange, t }) => (
        <div className="space-y-2">
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">URL</label>
                <input value={String(el.url ?? '')} onChange={(e) => onChange({ url: e.target.value })}
                    placeholder="https://n8n.schule.prilog.team/webhook/..." className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm font-mono outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.methode')}</label>
                <select value={String(el.method ?? 'POST')} onChange={(e) => onChange({ method: e.target.value })}
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                </select>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => onChange({ hidden: !el.hidden })}
                    className={cn("relative w-8 h-[18px] rounded-full transition-colors shrink-0", el.hidden ? "bg-primary" : "bg-border")}>
                    <div className={cn("absolute top-[3px] size-3 rounded-full bg-white shadow-sm transition-transform", el.hidden ? "translate-x-[17px]" : "translate-x-[3px]")} />
                </button>
                <span className="text-[9px] text-muted-foreground">{t('cascade.cascade_elements.unsichtbar_im_player')}</span>
            </div>
            <p className="text-[8px] text-muted-foreground/50">{t('cascade.cascade_elements.alle_gesammelten_variablen_werden_als_js')}</p>
        </div>
    ),
    renderPlayer: ({ el, t }) => {
        if (el.hidden) return <></>;
        return (
            <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-4 py-2 text-xs text-orange-600">
                <Webhook className="size-3 inline mr-1" />{t('cascade.cascade_elements.daten_werden_gesendet')}
            </div>
        );
    },
};

// ─── Video ────────────────────────────────────────────────────────────────────

const video: ElementDef = {
    type: 'video',
    label: 'Video',
    icon: <PlayCircle className="size-2.5" />,
    color: 'hover:text-red-500',
    defaultConfig: () => ({ type: 'video', label: 'Video', url: '', description: '' }),
    heightRows: () => 2,
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1">
            <PlayCircle className="size-2.5 text-red-500 shrink-0" />
            <span className="text-[8px] text-red-600 truncate">{String(el.label ?? 'Video')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div className="space-y-2">
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.video-url')}</label>
                <input value={String(el.url ?? '')} onChange={(e) => onChange({ url: e.target.value })}
                    placeholder="https://youtube.com/watch?v=... oder .mp4 URL"
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.beschreibung_optional')}</label>
                <input value={String(el.description ?? '')} onChange={(e) => onChange({ description: e.target.value })}
                    placeholder={t('cascade.cascade_elements.kurze_erklaerung_zum_video')}
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
            </div>
        </div>
    ),
    renderPlayer: ({ el, onNavigate, hideNavigation, t }) => {
        const url = String(el.url ?? '');
        // YouTube URL → embed URL konvertieren
        let embedUrl = url;
        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
        if (ytMatch) embedUrl = `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`;
        const isYt = embedUrl.includes('youtube');

        return (
            <div className="space-y-3">
                {isYt ? (
                    <div className="relative w-full rounded-2xl overflow-hidden" style={{ paddingBottom: '56.25%' }}>
                        <iframe src={embedUrl} className="absolute inset-0 w-full h-full" allowFullScreen
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
                    </div>
                ) : url ? (
                    <video src={url} controls className="w-full rounded-2xl" />
                ) : (
                    <div className="rounded-2xl bg-muted/20 border-2 border-dashed border-border p-8 text-center text-muted-foreground">
                        <PlayCircle className="size-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">{t('cascade.cascade_elements.keine_video-url_angegeben')}</p>
                    </div>
                )}
                {el.description ? <p className="text-sm text-muted-foreground">{String(el.description)}</p> : null}
                {!hideNavigation && <button onClick={() => onNavigate()}
                    className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                    {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                </button>}
            </div>
        );
    },
};

// ─── Quiz (Multiple Choice mit Auswertung) ────────────────────────────────────

const quiz: ElementDef = {
    type: 'quiz',
    label: 'Quiz',
    icon: <MaterialIcon name="help" size={16} className="size-2.5" />,
    color: 'hover:text-green-500',
    defaultConfig: () => ({ type: 'quiz', question: 'Frage', options: [], correctOptionId: '' }),
    heightRows: (el) => (el.options as any[])?.length ?? 0 + 2,
    renderGraph: ({ el, t }) => (
        <>
            <div className="text-[9px] text-muted-foreground text-center">{String(el.question ?? 'Quiz')}</div>
            <div className="flex items-center gap-0.5 mt-0.5">
                <MaterialIcon name="help" size={16} className="size-2.5 text-green-500 shrink-0" />
                <span className="text-[8px] text-green-600">{((el.options as any[]) ?? []).length} {t('cascade.cascade_elements.optionen')}</span>
            </div>
        </>
    ),
    renderDesigner: ({ el, onAddOption, onRemoveOption, onChange, t }) => (
        <div className="space-y-2">
            <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.richtige_antwort')}</label>
                <select value={String(el.correctOptionId ?? '')} onChange={(e) => onChange({ correctOptionId: e.target.value })}
                    className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                    <option value="">{t('cascade.cascade_elements.richtige_antwort_waehlen')}</option>
                    {((el.options as any[]) ?? []).map((opt: any) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                </select>
            </div>
            <OptionListEditor el={el as any} onAddOption={onAddOption} onRemoveOption={onRemoveOption} />
        </div>
    ),
    renderPlayer: ({ el, idx, state, onNavigate, onStateChange, hideNavigation, t }) => {
        const options = (el.options as Array<{ id: string; label: string }>) ?? [];
        const selected = state?.[`el_${idx}`] as string | undefined;
        const submitted = state?.[`el_${idx}_submitted`] as boolean | undefined;
        const correctId = String(el.correctOptionId ?? '');
        const isCorrect = selected === correctId;

        const handleSubmit = () => {
            onStateChange({ ...state, [`el_${idx}_submitted`]: true });
        };

        return (
            <div className="space-y-3">
                {options.map(opt => {
                    const isSelected = selected === opt.id;
                    const showResult = submitted;
                    const isThisCorrect = opt.id === correctId;
                    return (
                        <button key={opt.id}
                            onClick={() => { if (!submitted) onStateChange({ ...state, [`el_${idx}`]: opt.id }); }}
                            disabled={!!submitted}
                            className={cn("flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors",
                                showResult && isThisCorrect ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" :
                                    showResult && isSelected && !isThisCorrect ? "border-red-500 bg-red-50 dark:bg-red-900/20" :
                                        isSelected ? "border-primary" : "border-border hover:border-primary/50")}>
                            {showResult && isThisCorrect ? <MaterialIcon name="check_box" size={16} className="size-5 text-emerald-500 shrink-0" /> :
                                showResult && isSelected ? <Square className="size-5 text-red-500 shrink-0" /> :
                                    isSelected ? <CircleDot className="size-5 text-primary shrink-0" /> :
                                        <MaterialIcon name="radio_button_unchecked" size={16} className="size-5 text-muted-foreground/40 shrink-0" />}
                            <span className="text-base">{opt.label}</span>
                        </button>
                    );
                })}
                {!submitted && selected && (
                    <button onClick={handleSubmit}
                        className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform">
                        {t('cascade.cascade_elements.antwort_pruefen')}
                    </button>
                )}
                {submitted && (
                    <div className={cn("rounded-2xl p-4 text-center", isCorrect ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-red-50 dark:bg-red-900/20")}>
                        <p className={cn("text-base font-semibold", isCorrect ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                            {isCorrect ? "Richtig!" : "Leider falsch."}
                        </p>
                        {!isCorrect && <p className="text-sm text-muted-foreground mt-1">{t('cascade.cascade_elements.richtig_waere')} {options.find(o => o.id === correctId)?.label}</p>}
                    </div>
                )}
                {submitted && !hideNavigation && (
                    <button onClick={() => onNavigate(isCorrect ? 'yes' : 'no')}
                        className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                        {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                    </button>
                )}
            </div>
        );
    },
};

const button: ElementDef = {
    type: 'button',
    label: 'Button',
    icon: <MaterialIcon name="arrow_forward" size={16} className="size-2.5" />,
    color: 'hover:text-primary',
    defaultConfig: () => ({ type: 'button', label: 'Weiter' }),
    heightRows: () => 1,
    renderGraph: ({ el, t }) => (
        <div className="rounded bg-primary/10 py-0.5 text-center">
            <span className="text-[8px] font-semibold text-primary">{String(el.label ?? 'Weiter')}</span>
        </div>
    ),
    renderDesigner: ({ el, onChange, t }) => (
        <div>
            <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.button-text')}</label>
            <input value={String(el.label ?? 'Weiter')} onChange={(e) => onChange({ label: e.target.value })}
                placeholder={t('cascade.cascade_elements.zb_weiter_absenden_fertig')} className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
        </div>
    ),
    renderPlayer: ({ el, onNavigate, t }) => (
        <button onClick={() => onNavigate()}
            className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
            {String(el.label ?? 'Weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
        </button>
    ),
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const createTasks: ElementDef = {
    type: 'createTasks',
    label: 'Aufgaben erstellen',
    icon: <ListTodo className="size-2.5" />,
    color: 'hover:text-amber-500',
    defaultConfig: () => ({ type: 'createTasks', label: 'Aufgaben erstellen', tasks: [], sourceSpaceElement: -1, groupName: '', autoExecute: false }),
    heightRows: (el) => Math.max(1, (el.tasks as any[])?.length ?? 0),
    renderGraph: ({ el, t }) => (
        <div className="flex items-center gap-1">
            <ListTodo className="size-2.5 text-amber-500 shrink-0" />
            <span className="text-[8px] text-amber-600 truncate">{(el.tasks as any[])?.length ?? 0} {t('cascade.cascade_elements.aufgaben')}</span>
        </div>
    ),
    renderDesigner: ({ el, idx, allElements, onChange, t }) => {
        const tasks: { id: string; title: string }[] = (el.tasks as any[]) ?? [];
        // Finde createSpace-Elemente fuer die Referenz
        const spaceElements = allElements
            .map((e, i) => ({ idx: i, el: e }))
            .filter(e => e.el.type === 'createSpace' && e.idx < idx);

        return (
            <div className="space-y-2">
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.in_welchem_space')}</label>
                    <select value={String((el.sourceSpaceElement as number) ?? -1)}
                        onChange={(e) => onChange({ sourceSpaceElement: parseInt(e.target.value) })}
                        className="mt-0.5 h-8 w-full rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary">
                        <option value={-1}>{t('cascade.cascade_elements.space_waehlen')}</option>
                        {spaceElements.map(s => (
                            <option key={s.idx} value={s.idx}>#{s.idx + 1} {String(s.el.spaceName || s.el.label || 'Space')}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.gruppe_optional')}</label>
                    <input value={String(el.groupName ?? '')} onChange={(e) => onChange({ groupName: e.target.value })}
                        placeholder={t('cascade.cascade_elements.zb_erstmassnahmen')} className="mt-0.5 h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-widest">{t('cascade.cascade_elements.aufgaben')}</label>
                    <div className="mt-1 space-y-1">
                        {tasks.map((_t, i) => (
                            <div key={_t.id} className="flex items-center gap-2 group">
                                <span className="text-[10px] text-muted-foreground/50 w-4 text-right">{i + 1}.</span>
                                <span className="flex-1 text-sm">{_t.title}</span>
                                <button onClick={() => onChange({ tasks: tasks.filter(x => x.id !== _t.id) })}
                                    className="rounded p-0.5 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100">×</button>
                            </div>
                        ))}
                        <TaskInput onAdd={(title) => onChange({ tasks: [...tasks, { id: `task-${Date.now()}`, title }] })} />
                    </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                    <button onClick={() => onChange({ autoExecute: !el.autoExecute })}
                        className={cn("relative w-8 h-[18px] rounded-full transition-colors shrink-0", el.autoExecute ? "bg-primary" : "bg-border")}>
                        <div className={cn("absolute top-[3px] size-3 rounded-full bg-white shadow-sm transition-transform", el.autoExecute ? "translate-x-[17px]" : "translate-x-[3px]")} />
                    </button>
                    <span className="text-[9px] text-muted-foreground">{t('cascade.cascade_elements.automatisch_erstellen_ohne_klick')}</span>
                </div>
            </div>
        );
    },
    renderPlayer: ({ el, idx, state, allElements, onNavigate, onStateChange, jwt, hideNavigation, t }) => {
        const tasks: { id: string; title: string }[] = (el.tasks as any[]) ?? [];
        const created = state?.[`el_${idx}_done`];
        const creating = state?.[`el_${idx}_creating`];
        const error = state?.[`el_${idx}_error`];

        const autoStarted = state?.[`el_${idx}_autoStarted`];

        // Space-ID aus dem referenzierten createSpace-Element holen
        const srcIdx = (el.sourceSpaceElement as number) ?? -1;
        const spaceId = srcIdx >= 0 ? state?.[`el_${srcIdx}_created`] : null;

        const doCreateTasks = async () => {
            if (!jwt || !spaceId) return;
            // Gruppe erstellen falls angegeben
            let groupId: string | undefined;
            const groupName = String(el.groupName ?? '').trim();
            if (groupName) {
                try {
                    // Board-ID holen (erstes Board des Space)
                    const boardsRes = await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${spaceId}/boards`, { headers: { Authorization: `Bearer ${jwt}` } });
                    if (boardsRes.ok) {
                        const bd = await boardsRes.json();
                        const boardId = bd.boards?.[0]?.id;
                        if (boardId) {
                            const grpRes = await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${spaceId}/boards/${boardId}/groups`, {
                                method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ title: groupName }),
                            });
                            if (grpRes.ok) { const gd = await grpRes.json(); groupId = gd.group?.id; }
                        }
                    }
                } catch { }
            }
            // Aufgaben erstellen
            for (const task of tasks) {
                await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${spaceId}/items/from-message`, {
                    method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: task.title, groupId }),
                });
            }
        };

        // Auto-Execute
        if (el.autoExecute && !created && !creating && !autoStarted && jwt && spaceId && tasks.length > 0) {
            Promise.resolve().then(async () => {
                onStateChange({ ...state, [`el_${idx}_autoStarted`]: true, [`el_${idx}_creating`]: true });
                try {
                    await doCreateTasks();
                    onStateChange({ ...state, [`el_${idx}_autoStarted`]: true, [`el_${idx}_done`]: true, [`el_${idx}_creating`]: false });
                } catch {
                    onStateChange({ ...state, [`el_${idx}_autoStarted`]: true, [`el_${idx}_creating`]: false, [`el_${idx}_error`]: 'Auto-Erstellung fehlgeschlagen' });
                }
            });
        }

        const handleCreate = async () => {
            if (!jwt || !spaceId || creating) return;
            onStateChange({ ...state, [`el_${idx}_creating`]: true });
            try {
                await doCreateTasks();
                onStateChange({ ...state, [`el_${idx}_done`]: true, [`el_${idx}_creating`]: false, [`el_${idx}_error`]: null });
            } catch {
                onStateChange({ ...state, [`el_${idx}_creating`]: false, [`el_${idx}_error`]: 'Aufgaben konnten nicht erstellt werden' });
            }
        };

        return (
            <div className="space-y-3">
                {error && (
                    <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 text-xs text-red-600">
                        {error}
                    </div>
                )}
                {!spaceId && (
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-600">
                        {t('cascade.cascade_elements.bitte_zuerst_den_space_erstellen')}
                    </div>
                )}
                {!created ? (
                    <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">{tasks.length} {t('cascade.cascade_elements.aufgaben_werden_erstellt')}</div>
                        {tasks.map((_t, i) => (
                            <div key={_t.id} className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground/50">{i + 1}.</span>
                                <span>{_t.title}</span>
                            </div>
                        ))}
                        <button onClick={handleCreate} disabled={creating || !spaceId}
                            className={cn("w-full rounded-2xl py-4 text-base font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2",
                                creating ? "bg-muted text-muted-foreground" : !spaceId ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-amber-500 text-white")}>
                            {creating ? <><Loader2 className="size-5 animate-spin" /> {t('cascade.cascade_elements.erstelle')}</> : <><ListTodo className="size-5" /> {t('cascade.cascade_elements.aufgaben_erstellen')}</>}
                        </button>
                    </div>
                ) : (
                    <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 py-3 px-4 text-center">
                        <MaterialIcon name="check" size={16} className="size-5 text-emerald-500 mx-auto mb-1" />
                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{tasks.length} {t('cascade.cascade_elements.aufgaben_erstellt')}</p>
                    </div>
                )}
                {!hideNavigation && created && (
                    <button onClick={() => onNavigate()}
                        className="w-full rounded-2xl border-2 border-border py-3 text-base font-medium text-muted-foreground active:scale-95 transition-transform flex items-center justify-center gap-2">
                        {t('cascade.cascade_elements.weiter')} <MaterialIcon name="arrow_forward" size={16} className="size-5" />
                    </button>
                )}
            </div>
        );
    },
};

// Task input helper
function TaskInput({ onAdd }: { onAdd: (title: string) => void }) {
    const t = useT();
    const [val, setVal] = __import_useState('');
    return (
        <div className="flex items-center gap-2">
            <input value={val} onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal(''); } }}
                placeholder={t('cascade.cascade_elements.neue_aufgabe')} className="flex-1 h-7 rounded-lg border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
            <button onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(''); } }}
                disabled={!val.trim()} className="text-[10px] text-primary hover:text-primary/80 disabled:opacity-30 font-medium">+</button>
        </div>
    );
}

// ─── Signature Canvas (inline, kein externer Import) ─────────────────────────

function SignatureCanvas({ onSign }: { onSign: (dataUrl: string) => void }) {
    const t = useT();
    const canvasRef = __import_useRef<HTMLCanvasElement>(null);
    const [drawing, setDrawing] = __import_useState(false);

    const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

    const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
        const ctx = getCtx();
        if (!ctx || !canvasRef.current) return;
        setDrawing(true);
        const rect = canvasRef.current.getBoundingClientRect();
        const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX;
        const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!drawing) return;
        const ctx = getCtx();
        if (!ctx || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX;
        const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#1f2937';
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const endDraw = () => {
        if (!drawing) return;
        setDrawing(false);
        if (canvasRef.current) onSign(canvasRef.current.toDataURL('image/png'));
    };

    const clear = () => {
        const ctx = getCtx();
        if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    };

    return (
        <div className="rounded-xl border-2 border-border bg-white dark:bg-card overflow-hidden">
            <canvas ref={canvasRef} width={400} height={150}
                className="w-full touch-none cursor-crosshair"
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
            <div className="flex items-center justify-between border-t px-3 py-1.5">
                <span className="text-[10px] text-muted-foreground">{t('cascade.cascade_elements.hier_unterschreiben')}</span>
                <button onClick={clear} className="text-[10px] text-muted-foreground hover:text-destructive">{t('cascade.cascade_elements.loeschen')}</button>
            </div>
        </div>
    );
}

export const ELEMENT_TYPES: ElementDef[] = [decision, dropdown, checklist, radio, condition, textfield, form, rating, quiz, link, spaceRef, createSpace, createTasks, setVariable, tableInput, createDocument, webhook, video, parallelSplit, parallelJoin, checkpoint, notification, delay, infoDisplay, timestamp, button];

export const ELEMENT_MAP: Record<string, ElementDef> = Object.fromEntries(
    ELEMENT_TYPES.map(d => [d.type, d]),
);

export function getElementDef(type: string): ElementDef | undefined {
    return ELEMENT_MAP[type];
}

/**
 * Extrahiert benannte Variablen aus dem Flow-State eines Knotens.
 * Gibt ein Record<variableName, Wert> zurück — nur Elemente mit variableName.
 */
export function extractVariables(
    elements: ElementConfig[],
    elState: Record<string, unknown>,
): Record<string, unknown> {
    const vars: Record<string, unknown> = {};
    for (let idx = 0; idx < elements.length; idx++) {
        const el = elements[idx];
        const varName = el.variableName as string | undefined;
        if (!varName) continue;

        // Zeitstempel: erzeugt den Wert selbst (kein User-Input)
        if (el.type === 'timestamp') {
            const now = new Date();
            const fmt = (el.format as string) ?? 'datetime';
            vars[varName] = fmt === 'date' ? now.toLocaleDateString('de-DE')
                : fmt === 'time' ? now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                    : fmt === 'iso' ? now.toISOString()
                        : now.toLocaleDateString('de-DE') + ', ' + now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            continue;
        }

        const raw = elState[`el_${idx}`];
        if (raw === undefined || raw === null || raw === '') continue;

        // Für Dropdowns/Radio: Option-Label statt ID zurückgeben
        if ((el.type === 'dropdown' || el.type === 'radio') && el.options) {
            const opt = el.options.find(o => o.id === raw);
            vars[varName] = opt?.label ?? raw;
        } else if (el.type === 'checklist' && Array.isArray(raw) && el.options) {
            vars[varName] = (raw as string[]).map(id => el.options!.find(o => o.id === id)?.label ?? id);
        } else if (el.type === 'decision') {
            vars[varName] = raw === 'yes' ? (el.yesLabel ?? 'Ja') : (el.noLabel ?? 'Nein');
        } else if (el.type === 'createSpace') {
            const spaceId = elState[`el_${idx}_created`] as string | undefined;
            const now = new Date();
            const resolvedName = String(el.spaceName || 'Neuer Space')
                .replace('{datum}', now.toLocaleDateString('de-DE'))
                .replace('{benutzer}', '');
            vars[varName] = spaceId ? resolvedName : null;
            if (spaceId) vars[`${varName}_id`] = spaceId;
        } else if (el.type === 'createTasks') {
            const tasks = (el.tasks as Array<{ title: string }>) ?? [];
            vars[varName] = tasks.map(_t => _t.title);
        } else if (el.type === 'form' && typeof raw === 'object' && raw !== null) {
            const fields: FormField[] = (el.fields as FormField[]) ?? [];
            const formResult: Record<string, unknown> = {};
            for (const f of fields) {
                const val = (raw as Record<string, unknown>)[f.id];
                if (val !== undefined && val !== null && val !== '') formResult[f.label] = val;
            }
            vars[varName] = formResult;
        } else if (el.type === 'table' && Array.isArray(raw)) {
            // Tabelle: Zeilen mit Spalten-Labels
            const cols: Array<{ key: string; label: string }> = (el.columns as any[]) ?? [];
            vars[varName] = (raw as Array<Record<string, string>>).map(row => {
                const labeled: Record<string, string> = {};
                for (const c of cols) { if (row[c.key]) labeled[c.label] = row[c.key]; }
                return labeled;
            });
        } else if (el.type === 'quiz') {
            // Quiz: gewählte Antwort + richtig/falsch
            const options = (el.options as Array<{ id: string; label: string }>) ?? [];
            const opt = options.find(o => o.id === raw);
            const isCorrect = raw === (el.correctOptionId as string);
            vars[varName] = opt?.label ?? String(raw);
            vars[`${varName}_richtig`] = isCorrect;
        } else if (el.type === 'setVariable') {
            const targetVar = el.targetVar as string;
            const expr = String(el.expression ?? '');
            if (targetVar) vars[targetVar] = expr;
        } else {
            vars[varName] = raw;
        }
    }
    return vars;
}
