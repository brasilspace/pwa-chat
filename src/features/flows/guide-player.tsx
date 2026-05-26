/**
 * GuidePlayer — rendert eine Anleitung (appKind='guide') als Wizard.
 *
 * Verwendet von:
 *  - Test-Run im Designer (Modal mit Player drin)
 *  - Echter Run wenn ein User die Anleitung erhaelt (eigene Route /guide/:instanceId)
 *
 * Funktionsweise:
 *  - Laedt template + components + edges
 *  - Findet Start-Screen (kind=guide.screen ohne incoming-Edge)
 *  - Rendert die Children als echte Wizard-UI
 *  - Bei Click auf einen Button: traversiere ausgehende Edge → naechster Screen
 *  - Choice-Antwort wird in localData gespeichert (im Test-Run nur in-memory,
 *    im echten Run via completeComponent ans Backend)
 *  - Variablen ${data.x} werden in Texten substitutuiert
 *  - Conditional-Visibility (config._showIf) skipt Components
 *
 * Branding: Logo + Farben aus template.metadata.brandingProfile
 */
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react';
import { Phone as PhoneIcon, Volume2, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { sessionStore } from '@/core/session/session-store';
import { isPrilogFileLink, resolveImageUrl } from '@/lib/prilog-link';
import type { ProcessComponent, ProcessEdge } from './flows-gateway';
import { useT } from "@/lib/i18n/use-t";

interface BrandingProfile {
    logoUrl?: string;
    primaryColor?: string;
    backgroundColor?: string;
    fontFamily?: string;
    css?: string;
}

interface GuidePlayerProps {
    components: ProcessComponent[];
    edges: ProcessEdge[];
    initialData?: Record<string, unknown>;
    branding?: BrandingProfile;
    onClose?: () => void;
    /** Test-Mode: Aktionen werden nur lokal verarbeitet, kein Backend-Call */
    testMode?: boolean;
    /** Wenn gesetzt: per-Step Callback (im echten Run für completeComponent) */
    onStepAdvance?: (fromScreenId: string, toScreenId: string | null, data: Record<string, unknown>) => void;
}

// Variable-Resolver: ${data.x} → data['x']
function resolveTemplate(text: string, data: Record<string, unknown>): string {
    return text.replace(/\$\{data\.([^}]+)\}/g, (_, key: string) => {
        const v = data[key.trim()];
        return v == null ? '' : String(v);
    });
}

// Conditional Visibility: { _showIf: { var: 'choice', equals: 'yes' } }
function shouldShow(component: ProcessComponent, data: Record<string, unknown>): boolean {
    const cfg = (component.config ?? {}) as Record<string, unknown>;
    const showIf = cfg._showIf as { var?: string; equals?: unknown } | undefined;
    if (!showIf || !showIf.var) return true;
    return data[showIf.var] === showIf.equals;
}

export function GuidePlayer({ components, edges, initialData = {}, branding, onClose, testMode = true, onStepAdvance }: GuidePlayerProps) {
    const t = useT();
    const [currentScreenId, setCurrentScreenId] = useState<string | null>(() => findStartScreen(components, edges));
    const [data, setData] = useState<Record<string, unknown>>(initialData);
    const [completedScreens, setCompletedScreens] = useState<Set<string>>(new Set());
    const [checkedItems, setCheckedItems] = useState<Record<string, Set<number>>>({});

    const screen = currentScreenId ? components.find(c => c.id === currentScreenId) : null;
    const children = useMemo(() => {
        if (!screen) return [];
        return components
            .filter(c => c.groupId === screen.id && shouldShow(c, data))
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }, [components, screen, data]);

    if (!screen) {
        return <FinishedScreen onClose={onClose} />;
    }

    const cfg = (screen.config ?? {}) as { device?: string; background?: string; title?: string };
    const isPhone = cfg.device !== 'tablet';

    const handleButtonClick = (buttonId: string, optionValue?: string, outputKey?: string) => {
        let newData = data;
        if (outputKey && optionValue !== undefined) {
            newData = { ...data, [outputKey]: optionValue };
            setData(newData);
        }
        // Naechsten Screen finden ueber ausgehende Edges
        const outgoing = edges.filter(e => e.sourceId === buttonId);
        let nextScreenId: string | null = null;
        for (const edge of outgoing) {
            const cond = (edge.condition ?? {}) as { type?: string; expr?: { '==': [{ var?: string }, unknown] } };
            if (!cond.type || cond.type === 'always') {
                nextScreenId = edge.targetId;
                break;
            }
            if (cond.type === 'if' && cond.expr && '==' in cond.expr) {
                const [left, right] = cond.expr['=='] as [{ var?: string }, unknown];
                if (left && left.var && newData[left.var] === right) {
                    nextScreenId = edge.targetId;
                    break;
                }
            }
        }
        // Falls keine Edge: gehe zum naechsten Screen in sortOrder (Default-Verhalten)
        if (!nextScreenId) {
            const allScreens = components.filter(c => c.kind === 'guide.screen').sort((a, b) => a.sortOrder - b.sortOrder);
            const idx = allScreens.findIndex(s => s.id === screen.id);
            nextScreenId = idx >= 0 && idx < allScreens.length - 1 ? allScreens[idx + 1].id : null;
        }
        setCompletedScreens(prev => new Set([...prev, screen.id]));
        setCurrentScreenId(nextScreenId);
        if (onStepAdvance && !testMode) onStepAdvance(screen.id, nextScreenId, newData);
    };

    const speakText = (text: string) => {
        if (!('speechSynthesis' in window)) return;
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'de-DE';
        window.speechSynthesis.speak(utter);
    };

    const screenStyle = {
        backgroundColor: cfg.background || branding?.backgroundColor || '#fff',
        fontFamily: branding?.fontFamily,
    };

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center bg-zinc-200 dark:bg-zinc-900 p-4 overflow-auto"
            style={branding?.css ? { '--branding-css': branding.css } as React.CSSProperties : undefined}
        >
            {testMode && (
                <div className="mb-3 rounded-md bg-amber-100 px-3 py-1 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                    {t('flows.guide_player.test-modus_aktionen_werden_nicht_wirklic')}
                </div>
            )}

            <div
                className={cn(
                    'rounded-[2.5rem] border-[8px] border-zinc-800 bg-zinc-900 p-2 shadow-2xl',
                )}
                style={{ width: isPhone ? 360 : 720, maxWidth: '95vw' }}
            >
                <div className="rounded-[2rem] overflow-hidden" style={{ ...screenStyle, minHeight: 600 }}>
                    {/* Notch + Status-Bar */}
                    <div className="relative h-8">
                        <div className="absolute left-1/2 top-1.5 h-1.5 w-16 -translate-x-1/2 rounded-full bg-zinc-700/30" />
                    </div>

                    {/* Branding-Header */}
                    {branding?.logoUrl && (
                        <div className="px-6 pb-3 pt-2 flex justify-center">
                            <img src={branding.logoUrl} alt={t('flows.guide_player.logo')} className="max-h-10 object-contain" />
                        </div>
                    )}

                    {/* Progress-Indikator */}
                    <ProgressDots
                        components={components}
                        currentScreenId={screen.id}
                        completedScreens={completedScreens}
                        primaryColor={branding?.primaryColor}
                    />

                    {/* Inhalt */}
                    <div className="px-6 py-6 space-y-4 min-h-[440px]">
                        {children.length === 0 && (
                            <p className="text-center text-sm text-zinc-400">{t('flows.guide_player.dieser_bildschirm_hat_noch_keine_inhalte')}</p>
                        )}
                        {children.map(child => (
                            <PlayerElement
                                key={child.id}
                                component={child}
                                data={data}
                                branding={branding}
                                onButtonClick={handleButtonClick}
                                onChecklistToggle={(items) => setCheckedItems(prev => ({ ...prev, [child.id]: items }))}
                                checkedItems={checkedItems[child.id] ?? new Set()}
                                onSpeak={speakText}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {testMode && (
                <button onClick={onClose} className="mt-4 rounded-md bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700">
                    {t('flows.guide_player.vorschau_schliessen')}
                </button>
            )}
        </div>
    );
}

function findStartScreen(components: ProcessComponent[], edges: ProcessEdge[]): string | null {
    const screens = components.filter(c => c.kind === 'guide.screen');
    if (screens.length === 0) return null;
    // Screen mit keiner eingehenden Edge ist der Start
    const targetIds = new Set(edges.map(e => e.targetId));
    const start = screens.find(s => !targetIds.has(s.id));
    return (start ?? screens[0]).id;
}

function ProgressDots({ components, currentScreenId, completedScreens, primaryColor }: {
    components: ProcessComponent[];
    currentScreenId: string;
    completedScreens: Set<string>;
    primaryColor?: string;
}) {
    const screens = components.filter(c => c.kind === 'guide.screen').sort((a, b) => a.sortOrder - b.sortOrder);
    if (screens.length <= 1) return null;
    return (
        <div className="flex justify-center gap-1.5 py-2">
            {screens.map(s => {
                const isCurrent = s.id === currentScreenId;
                const isDone = completedScreens.has(s.id);
                return (
                    <span
                        key={s.id}
                        className={cn(
                            'h-1.5 rounded-full transition-all',
                            isCurrent ? 'w-6' : 'w-1.5',
                        )}
                        style={{
                            backgroundColor: isCurrent || isDone ? (primaryColor || '#2563eb') : '#d4d4d8',
                        }}
                    />
                );
            })}
        </div>
    );
}

function FinishedScreen({ onClose }: { onClose?: () => void }) {
    const t = useT();
    return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-200 dark:bg-zinc-900 p-4">
            <div className="rounded-2xl bg-emerald-50 px-8 py-12 text-center shadow-lg dark:bg-emerald-900/30">
                <div className="mb-4 inline-flex size-16 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <MaterialIcon name="check" size={16} className="size-8" />
                </div>
                <h2 className="text-xl font-semibold text-emerald-900 dark:text-emerald-100">{t('flows.guide_player.fertig')}</h2>
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-200">
                    {t('flows.guide_player.du_hast_alle_schritte_abgeschlossen')}
                </p>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="mt-6 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                        {t('flows.guide_player.schliessen')}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Element-Renderer ───────────────────────────────────────────────────────

function PlayerElement({ component, data, branding, onButtonClick, onChecklistToggle, checkedItems, onSpeak }: {
    component: ProcessComponent;
    data: Record<string, unknown>;
    branding?: BrandingProfile;
    onButtonClick: (buttonId: string, optionValue?: string, outputKey?: string) => void;
    onChecklistToggle: (items: Set<number>) => void;
    checkedItems: Set<number>;
    onSpeak: (text: string) => void;
}): JSX.Element | null {
    const t = useT();
    const cfg = (component.config ?? {}) as Record<string, unknown>;
    const primary = branding?.primaryColor || '#2563eb';

    if (component.kind === 'guide.heading') {
        const size = (cfg.size as string) || 'h2';
        const align = (cfg.align as string) || 'left';
        const text = resolveTemplate((cfg.text as string) || '', data);
        const cls =
            size === 'h1' ? 'text-2xl font-bold' :
                size === 'h3' ? 'text-base font-semibold' : 'text-xl font-bold';
        return (
            <div className="flex items-start gap-2 group">
                <h2 className={cn(cls, align === 'center' && 'text-center w-full', align === 'right' && 'text-right w-full')}>
                    {text}
                </h2>
                <button onClick={() => onSpeak(text)} className="opacity-0 group-hover:opacity-50 hover:opacity-100" title={t('flows.guide_player.vorlesen')}>
                    <Volume2 className="size-3.5" />
                </button>
            </div>
        );
    }

    if (component.kind === 'guide.text') {
        const body = resolveTemplate((cfg.body as string) || '', data);
        const align = (cfg.align as string) || 'left';
        return (
            <div className="flex items-start gap-2 group">
                <p className={cn('text-sm leading-relaxed text-zinc-700 dark:text-zinc-300', align === 'center' && 'text-center w-full')}>
                    {body}
                </p>
                <button onClick={() => onSpeak(body)} className="opacity-0 group-hover:opacity-50 hover:opacity-100 mt-1" title={t('flows.guide_player.vorlesen')}>
                    <Volume2 className="size-3.5" />
                </button>
            </div>
        );
    }

    if (component.kind === 'guide.image') {
        const url = (cfg.url as string) || '';
        if (!url) {
            return <div className="aspect-video w-full rounded-lg bg-zinc-200 flex items-center justify-center text-zinc-500 text-xs">{t('flows.guide_player.bild_fehlt')}</div>;
        }
        return (
            <PrilogAwareImage src={url} alt={(cfg.alt as string) || ''} caption={cfg.caption as string} />
        );
    }

    if (component.kind === 'guide.button') {
        const label = resolveTemplate((cfg.label as string) || 'Weiter', data);
        const variant = (cfg.variant as string) || 'primary';
        const style = variant === 'primary' ? { backgroundColor: primary, color: '#fff' } : undefined;
        const cls = variant === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' :
            variant === 'secondary' ? 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300' :
                'hover:opacity-90';
        return (
            <button
                onClick={() => onButtonClick(component.id)}
                className={cn('w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1', cls)}
                style={style}
            >
                {label}
                <MaterialIcon name="chevron_right" size={16} className="size-4" />
            </button>
        );
    }

    if (component.kind === 'guide.checklist') {
        const items = (cfg.items as string[]) || [];
        const requireAll = cfg.requireAll === true;
        const allChecked = items.length > 0 && checkedItems.size === items.length;
        const toggle = (i: number) => {
            const next = new Set(checkedItems);
            if (next.has(i)) next.delete(i); else next.add(i);
            onChecklistToggle(next);
        };
        return (
            <div className="space-y-2">
                {items.map((item, i) => (
                    <button
                        key={i}
                        onClick={() => toggle(i)}
                        className="flex w-full items-start gap-2 rounded-md p-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <span
                            className={cn(
                                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2',
                                checkedItems.has(i) ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-400',
                            )}
                        >
                            {checkedItems.has(i) && <MaterialIcon name="check" size={16} className="size-3" />}
                        </span>
                        <span className={cn(checkedItems.has(i) && 'line-through text-zinc-400')}>{resolveTemplate(item, data)}</span>
                    </button>
                ))}
                {requireAll && !allChecked && (
                    <p className="text-xs text-amber-600">{t('flows.guide_player.bitte_alle_punkte_abhaken_bevor_du_fortf')}</p>
                )}
            </div>
        );
    }

    if (component.kind === 'guide.choice') {
        const question = resolveTemplate((cfg.question as string) || '', data);
        const options = ((cfg.options as Array<{ label: string; value: string }>) || []);
        const outputKey = (cfg.outputKey as string) || 'choice';
        return (
            <div className="space-y-3">
                {question && <p className="text-sm font-medium">{question}</p>}
                <div className="space-y-2">
                    {options.map((o, i) => (
                        <button
                            key={i}
                            onClick={() => onButtonClick(component.id, o.value, outputKey)}
                            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-left text-sm hover:border-blue-500 hover:bg-blue-50"
                        >
                            {resolveTemplate(o.label, data)}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (component.kind === 'guide.callto') {
        const type = (cfg.type as string) || 'phone';
        const target = (cfg.target as string) || '';
        const label = resolveTemplate((cfg.label as string) || target, data);
        const href = type === 'email' ? `mailto:${target}` : type === 'sms' ? `sms:${target}` : `tel:${target}`;
        return (
            <a
                href={href}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700"
            >
                <PhoneIcon className="size-4" />
                {label}
            </a>
        );
    }

    if (component.kind === 'guide.video') {
        const url = (cfg.url as string) || '';
        if (!url) return <div className="aspect-video rounded bg-zinc-200 text-center text-xs text-zinc-500 flex items-center justify-center">{t('flows.guide_player.video_fehlt')}</div>;
        if (url.match(/youtube|youtu\.be/)) {
            const m = url.match(/(?:youtu\.be\/|v=)([^&?]+)/);
            return m ? (
                <iframe className="aspect-video w-full rounded-lg" src={`https://www.youtube.com/embed/${m[1]}`} allowFullScreen />
            ) : null;
        }
        return <video src={url} controls autoPlay={cfg.autoplay === true} className="w-full rounded-lg" />;
    }

    return null;
}

/**
 * Bild mit prilog://-Aufloesung. Externe URLs werden direkt durchgereicht,
 * prilog://file/<id>-Links werden via /files/:id/resolve zur Presigned-URL
 * aufgeloest.
 */
function PrilogAwareImage({ src, alt, caption }: { src: string; alt: string; caption?: string }): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [resolved, setResolved] = useState<string | null>(isPrilogFileLink(src) ? null : src);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!isPrilogFileLink(src)) { setResolved(src); return; }
        if (!jwt) return;
        let cancelled = false;
        resolveImageUrl(src, jwt)
            .then(url => { if (!cancelled) setResolved(url); })
            .catch(() => { if (!cancelled) setError(true); });
        return () => { cancelled = true; };
    }, [src, jwt]);

    if (error) {
        return <div className="aspect-video w-full rounded-lg bg-red-50 flex items-center justify-center text-red-500 text-xs">{t('flows.guide_player.bild_nicht_erreichbar')}</div>;
    }
    if (!resolved) {
        return <div className="aspect-video w-full rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-400"><Loader2 className="size-5 animate-spin" /></div>;
    }
    return (
        <figure>
            <img src={resolved} alt={alt} className="rounded-lg w-full" />
            {caption && <figcaption className="mt-1 text-center text-xs text-zinc-500">{caption}</figcaption>}
        </figure>
    );
}
