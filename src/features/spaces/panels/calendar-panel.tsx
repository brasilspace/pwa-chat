import { type JSX, useMemo, useState, useCallback, useEffect } from 'react';
import type { SpaceItem } from '@/gateways/platform/platform-types';
import { useCalendarLayers, useCalendarEvents, useCanManageSchoolCalendar } from '@/features/calendar/use-calendar';
import { expandRecurringEvents, parseRruleEnd, buildRrule, schoolYearEnd, type RecurEnd } from '@/features/calendar/rrule-expand';
import type { CalendarEvent, CalendarLayer } from '@/features/calendar/calendar-types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameMonth, isSameDay, isToday,
    addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
    startOfDay, endOfDay, getHours, differenceInDays,
    startOfYear, endOfYear, addYears, subYears,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { useT } from "@/lib/i18n/use-t";

export type CalendarView = 'year' | 'month' | 'week' | 'day' | 'list' | 'gantt';

const VIEWS: { key: CalendarView; icon: string; label: string }[] = [
    { key: 'year', icon: 'grid_view', label: 'Jahr' },
    { key: 'month', icon: 'calendar_month', label: 'Monat' },
    { key: 'week', icon: 'date_range', label: 'Woche' },
    { key: 'day', icon: 'today', label: 'Tag' },
    { key: 'gantt', icon: 'view_timeline', label: 'Gantt' },
    { key: 'list', icon: 'format_list_bulleted', label: 'Liste' },
];

function getEventColor(event: CalendarEvent): string {
    return event.color ?? event.layer.color;
}

function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    return events.filter(e => {
        const start = new Date(e.dtstart);
        const end = e.dtend ? new Date(e.dtend) : start;
        // Event spans this day if it starts before day ends AND ends after day starts
        return start <= dayEnd && end >= dayStart;
    });
}

/** Check if two events overlap in time */
function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
    if (a.allDay || b.allDay) return false;
    const aStart = new Date(a.dtstart).getTime();
    const aEnd = a.dtend ? new Date(a.dtend).getTime() : aStart + 3600000;
    const bStart = new Date(b.dtstart).getTime();
    const bEnd = b.dtend ? new Date(b.dtend).getTime() : bStart + 3600000;
    return aStart < bEnd && bStart < aEnd;
}

/** Get conflict set for events on a day */
function getConflicts(dayEvents: CalendarEvent[]): Set<string> {
    const conflicts = new Set<string>();
    for (let i = 0; i < dayEvents.length; i++) {
        for (let j = i + 1; j < dayEvents.length; j++) {
            if (eventsOverlap(dayEvents[i], dayEvents[j])) {
                conflicts.add(dayEvents[i].id);
                conflicts.add(dayEvents[j].id);
            }
        }
    }
    return conflicts;
}

/** Calculate drop target hour from mouse position */
function getDropHour(e: React.DragEvent, startHour: number, hourHeight: number): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = startHour + Math.floor(y / hourHeight);
    const minutes = Math.round(((y % hourHeight) / hourHeight) * 4) * 15; // snap to 15min
    return hour + minutes / 60;
}

/** ISO (UTC) → lokales 'YYYY-MM-DDTHH:MM' für datetime-local-Inputs.
 *  Behebt den 2h-Versatz: roher .slice(0,16) zeigt UTC statt Lokalzeit. */
function toLocalInput(iso: string): string {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

// ═══════════════════════════════════════════════════════════════════
//  Layer Toggle Bar
// ═══════════════════════════════════════════════════════════════════

function LayerBar({ layers, onToggle }: { layers: CalendarLayer[]; onToggle: (id: string) => void }) {
    if (layers.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
            {layers.map(l => (
                <button key={l.id} onClick={() => onToggle(l.id)}
                    className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                        l.subscribed ? 'text-white' : 'bg-muted text-muted-foreground')}
                    style={l.subscribed ? { backgroundColor: l.color } : undefined}>
                    {l.subscribed ? <MaterialIcon name="visibility" size={14} /> : <MaterialIcon name="visibility_off" size={14} />}
                    {l.name}
                </button>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Quick Event Creator
// ═══════════════════════════════════════════════════════════════════

// Hilfen für die „flutschigen" Date/Time-Inputs.
function toLocalDateInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toLocalTimeInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function combineDateTime(dateStr: string, timeStr: string): Date {
    return new Date(`${dateStr}T${timeStr || '00:00'}:00`);
}

function QuickEventForm({ layers, date, onClose, onCreate, canManageSchool, spaceId, spaceName }: {
    layers: CalendarLayer[]; date: Date; onClose: () => void;
    onCreate: (data: { layerId: string; title: string; dtstart: string; dtend?: string; allDay?: boolean; description?: string; location?: string; rrule?: string }) => Promise<void>;
    canManageSchool: boolean;
    spaceId?: string;
    spaceName?: string;
}) {
    const t = useT();

    // Layer-Auswahl-Logik:
    //  - Im Space-Kontext: fester Layer = level-2 fuer diesen Space, kein Picker.
    //  - Im Hub-Kontext: subscribierte Layer ausser Schule (wenn !canManageSchool).
    const fixedSpaceLayer = useMemo(
        () => spaceId ? layers.find(l => l.level === 2 && l.spaceId === spaceId) : undefined,
        [layers, spaceId],
    );
    const selectableLayers = useMemo(
        () => layers.filter(l => l.subscribed && (l.level !== 1 || canManageSchool)),
        [layers, canManageSchool],
    );

    const [title, setTitle] = useState('');
    const [layerId, setLayerId] = useState(
        fixedSpaceLayer?.id
        ?? selectableLayers.find(l => l.level <= 2)?.id
        ?? selectableLayers[0]?.id
        ?? '',
    );
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
    const initEndDate = useMemo(() => new Date(date.getTime() + 60 * 60 * 1000), [date]);
    const [dateStart, setDateStart] = useState(toLocalDateInput(date));
    const [dateEnd, setDateEnd] = useState(toLocalDateInput(initEndDate));
    const [timeStart, setTimeStart] = useState(toLocalTimeInput(date));
    const [timeEnd, setTimeEnd] = useState(toLocalTimeInput(initEndDate));
    const [allDay, setAllDay] = useState(!hasTime);
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [rrule, setRrule] = useState('');
    const [saving, setSaving] = useState(false);

    // Falls Space-Kontext aber Layer fehlt: klarer Hinweis statt stiller 404.
    if (spaceId && !fixedSpaceLayer) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <MaterialIcon name="event_busy" size={48} className="text-muted-foreground/40" />
                <h3 className="text-sm font-medium">Space-Kalender noch nicht aktiviert</h3>
                <p className="max-w-xs text-xs text-muted-foreground">
                    Lege im Space-Info-Panel den Space-Kalender an, dann kannst du hier Termine erstellen.
                </p>
                <button onClick={onClose} className="rounded-md border bg-background px-4 py-1.5 text-xs hover:bg-muted">
                    Schliessen
                </button>
            </div>
        );
    }

    const setQuickDate = (offset: number) => {
        const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(allDay ? 0 : date.getHours(), allDay ? 0 : date.getMinutes(), 0, 0);
        setDateStart(toLocalDateInput(d));
        setDateEnd(toLocalDateInput(d));
    };

    const handleSubmit = async () => {
        if (!title.trim() || !layerId) return;
        setSaving(true);
        try {
            const start = allDay ? new Date(`${dateStart}T00:00:00`) : combineDateTime(dateStart, timeStart);
            const end = allDay
                ? new Date(`${dateEnd}T23:59:59`)
                : combineDateTime(dateEnd || dateStart, timeEnd || timeStart);
            await onCreate({
                layerId,
                title: title.trim(),
                dtstart: start.toISOString(),
                dtend: end.toISOString(),
                allDay,
                description: description.trim() || undefined,
                location: location.trim() || undefined,
                rrule: rrule || undefined,
            });
            onClose();
        } finally { setSaving(false); }
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
                <div>
                    <div className="text-base font-semibold">Neuer Termin</div>
                    {spaceName && (
                        <div className="mt-0.5 text-[12px] text-muted-foreground">
                            in <span className="font-medium">{spaceName}</span>
                        </div>
                    )}
                </div>
                <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <MaterialIcon name="close" size={20} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Title */}
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Titel</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus
                        placeholder="z.B. Elternabend"
                        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>

                {/* Date + Time */}
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-[11px] font-medium text-muted-foreground">Datum &amp; Zeit</label>
                        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}
                                className="size-3.5 rounded" />
                            Ganztägig
                        </label>
                    </div>
                    <div className="mb-2 flex gap-1.5">
                        <button onClick={() => setQuickDate(0)} className="rounded-md border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">Heute</button>
                        <button onClick={() => setQuickDate(1)} className="rounded-md border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">Morgen</button>
                        <button onClick={() => setQuickDate(7)} className="rounded-md border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">+1 Woche</button>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="flex gap-1.5">
                            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                                className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                            {!allDay && (
                                <input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)}
                                    className="h-9 w-[90px] rounded-lg border border-border bg-background px-2 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                            )}
                        </div>
                        <span className="text-[12px] text-muted-foreground">bis</span>
                        <div className="flex gap-1.5">
                            <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                                className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                            {!allDay && (
                                <input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)}
                                    className="h-9 w-[90px] rounded-lg border border-border bg-background px-2 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                            )}
                        </div>
                    </div>
                </div>

                {/* Layer (nur ausserhalb Space-Kontext) */}
                {!fixedSpaceLayer && (
                    <div>
                        <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Kalender-Ebene</label>
                        <select value={layerId} onChange={e => setLayerId(e.target.value)}
                            className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                            {selectableLayers.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Location */}
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                        <MaterialIcon name="place" size={12} className="-mt-0.5 inline" /> Ort
                    </label>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                        placeholder="z.B. Aula"
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>

                {/* Recurrence */}
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                        <MaterialIcon name="repeat" size={12} className="-mt-0.5 inline" /> Wiederholung
                    </label>
                    <RecurrencePicker value={rrule} onChange={setRrule} />
                </div>

                {/* Description */}
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Beschreibung</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                        rows={3} placeholder="optional…"
                        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-5 py-3">
                <button onClick={onClose}
                    className="rounded-lg border bg-background px-4 py-2 text-[13px] font-medium hover:bg-muted">
                    Abbrechen
                </button>
                <button onClick={handleSubmit} disabled={saving || !title.trim()}
                    className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? t('common.saving') : 'Termin anlegen'}
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  RRULE Presets
// ═══════════════════════════════════════════════════════════════════

const RRULE_PRESETS: { value: string; label: string }[] = [
    { value: '', label: 'Keine Wiederholung' },
    { value: 'FREQ=DAILY', label: 'Taeglich' },
    { value: 'FREQ=WEEKLY', label: 'Woechentlich' },
    { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Werktags (Mo-Fr)' },
    { value: 'FREQ=MONTHLY', label: 'Monatlich' },
    { value: 'FREQ=YEARLY', label: 'Jaehrlich' },
];

/**
 * RecurrencePicker — zwei Selects + optional Datepicker.
 *
 * value = vollstaendiger RRULE-String (z.B. "FREQ=WEEKLY;COUNT=10"); wir
 * parsen den End-Anteil ab, damit Bearbeiten funktioniert.
 *
 * Aenderungen werden ueber onChange zurueckgegeben — Aufrufer muss nur die
 * State-Variable updaten.
 */
function RecurrencePicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
    const t = useT();
    const { base, end } = parseRruleEnd(value);
    const isRecurring = base !== '';

    const presetMatch = RRULE_PRESETS.find(p => p.value === base);
    // Wenn die rrule eine Kombination ist die kein Preset trifft (z.B.
    // FREQ=WEEKLY;INTERVAL=2), faellt der Select auf "Woechentlich" zurueck —
    // gut genug fuer die haeufigen Faelle, exotische Regeln bleiben gespeichert.
    const presetValue = presetMatch?.value ?? base;

    const setBase = (next: string) => {
        // Beim Wechsel des Patterns das End-Setting beibehalten — sonst muss
        // der User es nach jedem Wechsel neu setzen.
        onChange(buildRrule(next, end));
    };

    const setEnd = (next: RecurEnd) => {
        onChange(buildRrule(base, next));
    };

    return (
        <div className="space-y-2">
            <select value={presetValue} onChange={e => setBase(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                {RRULE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                {!presetMatch && base && <option value={base}>{t('calendar.recurrence_end.custom_label', { pattern: base })}</option>}
            </select>

            {isRecurring && (
                <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-1.5">
                    <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t('calendar.recurrence_end.label')}
                    </label>
                    <select
                        value={endToOption(end)}
                        onChange={e => setEnd(optionToEnd(e.target.value))}
                        className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-primary"
                    >
                        <option value="never">{t('calendar.recurrence_end.never')}</option>
                        <option value="count:5">{t('calendar.recurrence_end.after_5')}</option>
                        <option value="count:10">{t('calendar.recurrence_end.after_10')}</option>
                        <option value="count:25">{t('calendar.recurrence_end.after_25')}</option>
                        <option value="until:school">{t('calendar.recurrence_end.until_school')}</option>
                        <option value="until:custom">{t('calendar.recurrence_end.until_custom')}</option>
                    </select>
                    {end.kind === 'until' && (
                        <input
                            type="date"
                            value={end.date}
                            onChange={e => setEnd({ kind: 'until', date: e.target.value })}
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-primary"
                        />
                    )}
                    {end.kind === 'count' && (
                        <p className="text-[10px] text-muted-foreground">
                            {t('calendar.recurrence_end.count_hint', { count: end.count })}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function endToOption(end: RecurEnd): string {
    if (end.kind === 'never') return 'never';
    if (end.kind === 'count') {
        if (end.count === 5 || end.count === 10 || end.count === 25) return `count:${end.count}`;
        return `count:${end.count}`; // custom count → fallback string
    }
    // until
    if (end.date === schoolYearEnd()) return 'until:school';
    return 'until:custom';
}

function optionToEnd(opt: string): RecurEnd {
    if (opt === 'never') return { kind: 'never' };
    if (opt.startsWith('count:')) return { kind: 'count', count: Number(opt.slice(6)) };
    if (opt === 'until:school') return { kind: 'until', date: schoolYearEnd() };
    if (opt === 'until:custom') {
        // Default = +1 Jahr von heute, User kann dann den Datepicker nutzen.
        const d = new Date();
        d.setFullYear(d.getFullYear() + 1);
        return { kind: 'until', date: d.toISOString().slice(0, 10) };
    }
    return { kind: 'never' };
}

// ═══════════════════════════════════════════════════════════════════
//  Event Detail Editor
// ═══════════════════════════════════════════════════════════════════

function EventDetailEditor({ event, layers, onUpdate, onDelete, onClose, canManageSchool, spaceId, spaceName }: {
    event: CalendarEvent;
    layers: CalendarLayer[];
    onUpdate: (eventId: string, patch: Record<string, unknown>) => Promise<void>;
    onDelete: (eventId: string) => Promise<void>;
    onClose: () => void;
    canManageSchool: boolean;
    spaceId?: string;
    spaceName?: string;
}) {
    const t = useT();
    const [title, setTitle] = useState(event.title);
    const [description, setDescription] = useState(event.description ?? '');
    const [location, setLocation] = useState(event.location ?? '');
    const startD = new Date(event.dtstart);
    const endD = event.dtend ? new Date(event.dtend) : new Date(startD.getTime() + 60 * 60 * 1000);
    const [dateStart, setDateStart] = useState(toLocalDateInput(startD));
    const [timeStart, setTimeStart] = useState(toLocalTimeInput(startD));
    const [dateEnd, setDateEnd] = useState(toLocalDateInput(endD));
    const [timeEnd, setTimeEnd] = useState(toLocalTimeInput(endD));
    const [allDay, setAllDay] = useState(event.allDay);
    const [rrule, setRrule] = useState(event.rrule ?? '');
    const [status, setStatus] = useState(event.status);
    const [color, setColor] = useState(event.color ?? '');
    const [layerId, setLayerId] = useState(event.layerId);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Im Space-Kontext: kein Layer-Picker. Der Layer ist Space-fix.
    const showLayerPicker = !spaceId;
    const visibleLayersForPicker = useMemo(
        () => layers.filter(l => l.level !== 1 || canManageSchool || l.id === event.layerId),
        [layers, canManageSchool, event.layerId],
    );

    const handleSave = async () => {
        setSaving(true);
        try {
            const start = allDay ? new Date(`${dateStart}T00:00:00`) : combineDateTime(dateStart, timeStart);
            const end = allDay
                ? new Date(`${dateEnd}T23:59:59`)
                : combineDateTime(dateEnd || dateStart, timeEnd || timeStart);
            await onUpdate(event.id, {
                title,
                description: description || null,
                location: location || null,
                dtstart: start.toISOString(),
                dtend: end.toISOString(),
                allDay, rrule: rrule || null, status,
                color: color || null,
                ...(layerId !== event.layerId ? { layerId } : {}),
                version: event.version,
            });
            onClose();
        } catch { /* version conflict handled by hook */ }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        await onDelete(event.id);
        onClose();
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="size-3 shrink-0 rounded-full" style={{ backgroundColor: getEventColor(event) }} />
                    <div>
                        <div className="text-base font-semibold">Termin bearbeiten</div>
                        {spaceName && (
                            <div className="mt-0.5 text-[12px] text-muted-foreground">
                                in <span className="font-medium">{spaceName}</span>
                            </div>
                        )}
                    </div>
                </div>
                <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <MaterialIcon name="close" size={20} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Title */}
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Titel</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>

                {/* Date + Time */}
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-[11px] font-medium text-muted-foreground">Datum &amp; Zeit</label>
                        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}
                                className="size-3.5 rounded" />
                            Ganztägig
                        </label>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="flex gap-1.5">
                            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                                className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                            {!allDay && (
                                <input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)}
                                    className="h-9 w-[90px] rounded-lg border border-border bg-background px-2 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                            )}
                        </div>
                        <span className="text-[12px] text-muted-foreground">bis</span>
                        <div className="flex gap-1.5">
                            <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                                className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                            {!allDay && (
                                <input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)}
                                    className="h-9 w-[90px] rounded-lg border border-border bg-background px-2 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                            )}
                        </div>
                    </div>
                </div>

                {/* Layer-Picker nur ausserhalb Space-Kontext */}
                {showLayerPicker && (
                    <div>
                        <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Kalender-Ebene</label>
                        <select value={layerId} onChange={e => setLayerId(e.target.value)}
                            className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                            {visibleLayersForPicker.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                )}

                {/* Location */}
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                        <MaterialIcon name="place" size={12} className="-mt-0.5 inline" /> Ort
                    </label>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                        placeholder="optional"
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>

                {/* Recurrence */}
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                        <MaterialIcon name="repeat" size={12} className="-mt-0.5 inline" /> Wiederholung
                    </label>
                    <RecurrencePicker value={rrule} onChange={setRrule} />
                </div>

                {/* Color */}
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                        <MaterialIcon name="palette" size={12} className="-mt-0.5 inline" /> Farbe
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'].map(c => (
                            <button key={c} onClick={() => setColor(c === event.layer.color ? '' : c)}
                                className={cn('size-7 rounded-full border-2 transition-transform hover:scale-110',
                                    (color || event.layer.color) === c ? 'border-foreground scale-110' : 'border-transparent')}
                                style={{ backgroundColor: c }} />
                        ))}
                    </div>
                </div>

                {/* Description */}
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Beschreibung</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                        rows={3} placeholder="optional…"
                        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>

                {/* Status */}
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Status</label>
                    <div className="flex flex-wrap gap-1.5">
                        {(['CONFIRMED', 'TENTATIVE', 'CANCELLED'] as const).map(s => (
                            <button key={s} onClick={() => setStatus(s)}
                                className={cn('rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors',
                                    status === s
                                        ? 'border-primary/40 bg-primary/10 text-primary'
                                        : 'border-border bg-background text-muted-foreground hover:bg-muted')}>
                                {s === 'CONFIRMED' ? 'Bestätigt' : s === 'TENTATIVE' ? 'Vorläufig' : 'Abgesagt'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-5 py-3">
                {!confirmDelete ? (
                    <button onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-[12px] font-medium text-destructive hover:bg-destructive/10">
                        <MaterialIcon name="delete" size={14} /> Löschen
                    </button>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[12px] text-destructive">Wirklich löschen?</span>
                        <button onClick={handleDelete}
                            className="rounded-md bg-destructive px-2.5 py-1 text-[11px] font-medium text-destructive-foreground hover:bg-destructive/90">Ja</button>
                        <button onClick={() => setConfirmDelete(false)}
                            className="rounded-md border bg-background px-2.5 py-1 text-[11px] hover:bg-muted">Nein</button>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <button onClick={onClose}
                        className="rounded-lg border bg-background px-4 py-2 text-[13px] font-medium hover:bg-muted">
                        Abbrechen
                    </button>
                    <button onClick={handleSave} disabled={saving || !title.trim()}
                        className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                        {saving ? t('common.saving') : 'Speichern'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Navigation
// ═══════════════════════════════════════════════════════════════════

function NavBar({ label, onPrev, onNext, onToday, view, setView, onAdd }: {
    label: string; onPrev: () => void; onNext: () => void; onToday: () => void;
    view: CalendarView; setView: (v: CalendarView) => void;
    onAdd?: () => void;
}) {
    const t = useT();
    return (
        <div className="flex items-center gap-1.5 border-b px-3 py-1.5 print:hidden">
            <div className="flex items-center gap-0.5">
                {VIEWS.map(v => (
                    <button key={v.key} onClick={() => setView(v.key)} title={v.label}
                        className={cn('flex size-7 items-center justify-center rounded-md transition-colors',
                            view === v.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                        <MaterialIcon name={v.icon} size={16} />
                    </button>
                ))}
            </div>
            <div className="flex-1" />
            {onAdd && (
                <button onClick={onAdd} title={t('calendar.new_event', { defaultValue: 'Neuer Termin' })}
                    className="flex size-6 items-center justify-center rounded-md text-primary hover:bg-primary/10">
                    <MaterialIcon name="add" size={18} />
                </button>
            )}
            <button onClick={() => window.print()} title={t('spaces.panels.calendar.drucken')}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <MaterialIcon name="print" size={16} />
            </button>
            <button onClick={onPrev} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><MaterialIcon name="chevron_left" size={18} /></button>
            <button onClick={onToday} className="rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted">{t('spaces.panels.calendar.heute')}</button>
            <button onClick={onNext} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><MaterialIcon name="chevron_right" size={18} /></button>
            <span className="min-w-[100px] text-right text-xs font-medium">{label}</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Month View
// ═══════════════════════════════════════════════════════════════════

/** Checks if an event spans more than one day */
function isMultiDay(e: CalendarEvent): boolean {
    if (e.allDay) return true;
    if (!e.dtend) return false;
    return !isSameDay(new Date(e.dtstart), new Date(e.dtend));
}

/** Layout spanning events (all-day + multi-day) into rows per week, Google-Calendar-style */
function layoutSpanningEvents(
    events: CalendarEvent[],
    weekStart: Date,
    weekEnd: Date,
): Array<{ event: CalendarEvent; startCol: number; span: number; row: number }> {
    const spanning = events
        .filter((e) => isMultiDay(e))
        .filter((e) => {
            const s = new Date(e.dtstart);
            const end = e.dtend ? new Date(e.dtend) : s;
            return s <= weekEnd && end >= weekStart;
        })
        .sort((a, b) => {
            const diff = new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime();
            if (diff !== 0) return diff;
            const aDur = (a.dtend ? new Date(a.dtend).getTime() : 0) - new Date(a.dtstart).getTime();
            const bDur = (b.dtend ? new Date(b.dtend).getTime() : 0) - new Date(b.dtstart).getTime();
            return bDur - aDur; // longer events first
        });

    const result: Array<{ event: CalendarEvent; startCol: number; span: number; row: number }> = [];
    const rows: Array<number[]> = []; // each row tracks which columns are occupied (end col index)

    for (const event of spanning) {
        const evStart = new Date(event.dtstart);
        const evEnd = event.dtend ? new Date(event.dtend) : evStart;
        const clampedStart = evStart < weekStart ? weekStart : startOfDay(evStart);
        const clampedEnd = evEnd > weekEnd ? weekEnd : endOfDay(evEnd);
        const startCol = Math.max(0, differenceInDays(clampedStart, weekStart));
        const endCol = Math.min(6, differenceInDays(startOfDay(clampedEnd), weekStart));
        const span = endCol - startCol + 1;

        // Find first row where all columns in [startCol, endCol] are free
        let placed = false;
        for (let r = 0; r < rows.length; r++) {
            const free = rows[r]!.every((_, c) => c < startCol || c > endCol || !rows[r]![c]);
            if (free) {
                for (let c = startCol; c <= endCol; c++) rows[r]![c] = 1;
                result.push({ event, startCol, span, row: r });
                placed = true;
                break;
            }
        }
        if (!placed) {
            const newRow = new Array(7).fill(0);
            for (let c = startCol; c <= endCol; c++) newRow[c] = 1;
            rows.push(newRow);
            result.push({ event, startCol, span, row: rows.length - 1 });
        }
    }

    return result;
}

const SPAN_ROW_H = 22; // px per spanning-event row
const MAX_SPAN_ROWS = 3;

// ═══════════════════════════════════════════════════════════════════
//  Year View
// ═══════════════════════════════════════════════════════════════════
//
// Zeigt 12 Mini-Monate als Grid (4 Spalten × 3 Reihen). Tage mit Terminen
// bekommen einen farbigen Punkt (Farbe vom dominanten Layer). Klick auf
// die Monats-Ueberschrift wechselt in die Monats-Ansicht. Klick auf einen
// Tag oeffnet den Schnell-Erstellen-Dialog dieses Tages — wir wollen die
// Jahresansicht maximal nuetzlich machen, nicht nur dekorativ.

function YearView({ events, currentDate, onSelectMonth, onSelectDay }: {
    events: CalendarEvent[];
    currentDate: Date;
    onSelectMonth: (d: Date) => void;
    onSelectDay: (d: Date) => void;
}) {
    const year = currentDate.getFullYear();
    const months = useMemo(() => Array.from({ length: 12 }, (_, i) => new Date(year, i, 1)), [year]);

    // Pro Tag: Liste der dort startenden bzw. den Tag ueberlappenden Events
    // (nur fuer Punkt-Anzeige; Multi-Day spannen wir hier nicht).
    const eventsByDayKey = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const e of events) {
            const start = startOfDay(new Date(e.dtstart));
            const end = e.dtend ? startOfDay(new Date(e.dtend)) : start;
            const days = eachDayOfInterval({ start, end });
            for (const d of days) {
                const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(e);
            }
        }
        return map;
    }, [events]);

    return (
        <ScrollArea className="flex-1">
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {months.map((monthDate) => (
                    <YearMonthCell
                        key={monthDate.getMonth()}
                        monthDate={monthDate}
                        eventsByDayKey={eventsByDayKey}
                        onSelectMonth={onSelectMonth}
                        onSelectDay={onSelectDay}
                    />
                ))}
            </div>
        </ScrollArea>
    );
}

function YearMonthCell({ monthDate, eventsByDayKey, onSelectMonth, onSelectDay }: {
    monthDate: Date;
    eventsByDayKey: Map<string, CalendarEvent[]>;
    onSelectMonth: (d: Date) => void;
    onSelectDay: (d: Date) => void;
}) {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const calStart = startOfWeek(monthStart, { locale: de });
    const calEnd = endOfWeek(monthEnd, { locale: de });
    const days = eachDayOfInterval({ start: calStart, end: calEnd });

    return (
        <div className="rounded-lg border border-border/60 bg-card p-2">
            <button
                type="button"
                onClick={() => onSelectMonth(monthDate)}
                className="mb-1.5 w-full rounded px-1 py-0.5 text-left text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
                {format(monthDate, 'MMMM', { locale: de })}
            </button>

            {/* Day headers */}
            <div className="grid grid-cols-7">
                {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => (
                    <div key={i} className="text-center text-[9px] font-medium text-muted-foreground/70">{d}</div>
                ))}
            </div>

            {/* Day grid — Tage mit Terminen bekommen einen blauen Balken
                am unteren Rand. Der Balken laeuft randlos in den
                Nachbartag, wenn auch dort ein Event liegt — so erscheinen
                Schulferien als ein einziger durchgehender Streifen. */}
            <div className="mt-0.5 grid grid-cols-7">
                {days.map((day) => {
                    const inMonth = isSameMonth(day, monthDate);
                    const today = isToday(day);
                    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                    const dayEvents = eventsByDayKey.get(key) ?? [];
                    const hasEvent = inMonth && dayEvents.length > 0;

                    // Verbindung zum Vor-/Nachbartag pruefen, damit der Balken
                    // ueber Tagesgrenzen weiterlaeuft (kein Spalt). Nur Tage
                    // im selben Monat zaehlen — sonst wuerde der Balken
                    // ausserhalb des Mini-Monats weiterlaufen.
                    const prevDay = subDays(day, 1);
                    const nextDay = addDays(day, 1);
                    const prevKey = `${prevDay.getFullYear()}-${prevDay.getMonth()}-${prevDay.getDate()}`;
                    const nextKey = `${nextDay.getFullYear()}-${nextDay.getMonth()}-${nextDay.getDate()}`;
                    const prevHasEvent = isSameMonth(prevDay, monthDate) && (eventsByDayKey.get(prevKey)?.length ?? 0) > 0;
                    const nextHasEvent = isSameMonth(nextDay, monthDate) && (eventsByDayKey.get(nextKey)?.length ?? 0) > 0;
                    // Wochenende-Wrap: Sonntag (col 6) hat keinen Nachbar in
                    // der naechsten Zelle, weil die naechste Zeile beginnt;
                    // dasselbe fuer Montag (col 0) zum Vorgaenger.
                    const colInWeek = (day.getDay() + 6) % 7; // Mo=0..So=6
                    const connectLeft = hasEvent && prevHasEvent && colInWeek > 0;
                    const connectRight = hasEvent && nextHasEvent && colInWeek < 6;

                    return (
                        <button
                            key={day.toISOString()}
                            type="button"
                            onClick={() => onSelectDay(day)}
                            className={cn(
                                'relative flex aspect-square items-center justify-center rounded-sm text-[10px] transition-colors hover:bg-muted/50',
                                !inMonth && 'opacity-25',
                                today && 'font-bold text-primary',
                            )}
                            title={dayEvents.length > 0 ? dayEvents.map((e) => e.title).join('\n') : undefined}
                        >
                            <span className="z-10">{format(day, 'd')}</span>
                            {hasEvent && (
                                <span
                                    className={cn(
                                        'absolute bottom-0 h-[3px] bg-blue-500',
                                        connectLeft ? 'left-0' : 'left-0.5',
                                        connectRight ? 'right-0' : 'right-0.5',
                                        !connectLeft && 'rounded-l-sm',
                                        !connectRight && 'rounded-r-sm',
                                    )}
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function MonthView({ events, currentDate, onSelectDay, onEventClick }: { events: CalendarEvent[]; currentDate: Date; onSelectDay: (d: Date) => void; onEventClick: (e: CalendarEvent) => void }) {
    const monthStart = startOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { locale: de });
    const calEnd = endOfWeek(endOfMonth(currentDate), { locale: de });
    const days = eachDayOfInterval({ start: calStart, end: calEnd });
    const weeks = Math.ceil(days.length / 7);

    // Pre-compute spanning layout per week
    const weekLayouts = useMemo(() => {
        const layouts: Array<ReturnType<typeof layoutSpanningEvents>> = [];
        for (let w = 0; w < weeks; w++) {
            const ws = addDays(calStart, w * 7);
            const we = addDays(ws, 6);
            layouts.push(layoutSpanningEvents(events, startOfDay(ws), endOfDay(we)));
        }
        return layouts;
    }, [events, weeks, calStart]);

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="flex h-full flex-col p-1">
                {/* Day headers */}
                <div className="grid grid-cols-7">
                    {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                        <div key={d} className="py-1.5 text-center text-xs font-medium text-muted-foreground">{d}</div>
                    ))}
                </div>

                {/* Week rows — fill available height */}
                <div className="grid min-h-0 flex-1" style={{ gridTemplateRows: `repeat(${weeks}, 1fr)` }}>
                    {Array.from({ length: weeks }).map((_, weekIdx) => {
                        const weekDays = days.slice(weekIdx * 7, weekIdx * 7 + 7);
                        const layout = weekLayouts[weekIdx] ?? [];
                        const spanRows = layout.length > 0 ? Math.min(Math.max(...layout.map(l => l.row)) + 1, MAX_SPAN_ROWS) : 0;
                        const hiddenSpans = layout.filter(l => l.row >= MAX_SPAN_ROWS).length;

                        return (
                            <div key={weekIdx} className="grid grid-cols-7 border-b border-border/40" style={{ position: 'relative' }}>
                                {/* Spanning event bars (absolute positioned over the week row) */}
                                {layout.filter(l => l.row < MAX_SPAN_ROWS).map(({ event: e, startCol, span, row }) => {
                                    const color = getEventColor(e);
                                    const evStart = new Date(e.dtstart);
                                    const weekStart = startOfDay(weekDays[0]!);
                                    const isStart = evStart >= weekStart;
                                    const evEnd = e.dtend ? new Date(e.dtend) : evStart;
                                    const weekEnd = endOfDay(weekDays[6]!);
                                    const isEnd = evEnd <= weekEnd;
                                    return (
                                        <div
                                            key={e.id + '-' + weekIdx}
                                            onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                                            className="absolute z-10 flex cursor-pointer items-center overflow-hidden text-white transition-opacity hover:opacity-90"
                                            style={{
                                                top: `${24 + row * SPAN_ROW_H}px`,
                                                left: `calc(${(startCol / 7) * 100}% + 1px)`,
                                                width: `calc(${(span / 7) * 100}% - 2px)`,
                                                height: `${SPAN_ROW_H - 2}px`,
                                                backgroundColor: color,
                                                borderRadius: isStart && isEnd ? '3px' : isStart ? '3px 0 0 3px' : isEnd ? '0 3px 3px 0' : '0',
                                                fontSize: '11px',
                                                fontWeight: 500,
                                                paddingLeft: '6px',
                                                paddingRight: '4px',
                                            }}
                                        >
                                            <span className="truncate">{isStart ? e.title : `↳ ${e.title}`}</span>
                                        </div>
                                    );
                                })}

                                {/* Day cells */}
                                {weekDays.map(day => {
                                    const inMonth = isSameMonth(day, currentDate);
                                    const today = isToday(day);
                                    const dayStart = startOfDay(day);
                                    const dayEnd = endOfDay(day);
                                    // Only timed (non-spanning) events for this day
                                    const timedEvents = events.filter(e => {
                                        if (isMultiDay(e)) return false;
                                        const s = new Date(e.dtstart);
                                        const end = e.dtend ? new Date(e.dtend) : s;
                                        return s <= dayEnd && end >= dayStart;
                                    });

                                    return (
                                        <button
                                            key={day.toISOString()}
                                            onClick={() => onSelectDay(day)}
                                            className={cn(
                                                'flex flex-col border-r border-border/40 p-1 text-left transition-colors hover:bg-muted/30',
                                                !inMonth && 'opacity-30 bg-muted/10',
                                                today && 'bg-primary/5',
                                            )}
                                        >
                                            <span className={cn(
                                                'inline-flex size-6 items-center justify-center text-xs font-medium',
                                                today && 'rounded-full bg-primary text-primary-foreground',
                                                !today && 'text-muted-foreground',
                                            )}>
                                                {format(day, 'd')}
                                            </span>
                                            {/* Spacer for spanning event rows */}
                                            {spanRows > 0 && <div style={{ height: `${spanRows * SPAN_ROW_H}px` }} />}
                                            {/* Timed events below spanning area */}
                                            <div className="mt-0.5 flex-1 space-y-0.5 overflow-hidden">
                                                {timedEvents.slice(0, 3).map(e => (
                                                    <div key={e.id} onClick={ev => { ev.stopPropagation(); onEventClick(e); }}
                                                        className="flex cursor-pointer items-center gap-1 px-0.5 hover:bg-background/50">
                                                        <div className="size-2 shrink-0 rounded-full" style={{ backgroundColor: getEventColor(e) }} />
                                                        <span className="text-[11px] text-muted-foreground">{format(new Date(e.dtstart), 'HH:mm')}</span>
                                                        <span className="truncate text-[11px]">{e.title}</span>
                                                    </div>
                                                ))}
                                                {timedEvents.length > 3 && <span className="text-[11px] text-muted-foreground">+{timedEvents.length - 3}</span>}
                                                {hiddenSpans > 0 && isSameDay(day, weekDays[0]!) && (
                                                    <span className="text-[11px] text-muted-foreground">+{hiddenSpans} mehr</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Week View
// ═══════════════════════════════════════════════════════════════════

function WeekView({ events, currentDate, onSelectDay, onSlotClick, onEventClick, onMoveEvent, onResizeEvent }: {
    events: CalendarEvent[]; currentDate: Date;
    onSelectDay: (d: Date) => void; onSlotClick: (d: Date) => void; onEventClick: (e: CalendarEvent) => void;
    onMoveEvent: (eventId: string, newStart: Date) => void;
    onResizeEvent: (eventId: string, newEnd: Date) => void;
}) {
    const t = useT();
    const weekStart = startOfWeek(currentDate, { locale: de });
    const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
    const allDayEvents = events.filter(e => e.allDay);
    const [resize, setResize] = useState<{ id: string; height: number } | null>(null);

    const startResize = (ev: React.MouseEvent, e: CalendarEvent, day: Date, topPx: number) => {
        ev.preventDefault(); ev.stopPropagation();
        const col = (ev.currentTarget as HTMLElement).closest('[data-daycol]') as HTMLElement | null;
        if (!col) return;
        const rect = col.getBoundingClientRect();
        const onMove = (m: MouseEvent) => {
            const h = Math.max(12, Math.round(((m.clientY - rect.top) - topPx) / 12) * 12);
            setResize({ id: e.id, height: h });
        };
        const onUp = (m: MouseEvent) => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            setResize(null);
            const y = m.clientY - rect.top;
            const hrs = Math.round((7 + y / 48) * 4) / 4; // 15-Min-Raster
            const end = new Date(day); end.setHours(0, 0, 0, 0);
            end.setMinutes(Math.round(hrs * 60));
            onResizeEvent(e.id, end);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div className="flex h-full flex-col">
            {/* Day headers */}
            <div className="flex border-b">
                <div className="w-12 shrink-0" />
                {days.map(day => (
                    <div key={day.toISOString()} onClick={() => onSelectDay(day)}
                        className={cn('flex-1 cursor-pointer border-r py-1.5 text-center hover:bg-muted/50', isToday(day) && 'bg-primary/5')}>
                        <div className="text-[10px] text-muted-foreground">{format(day, 'EEE', { locale: de })}</div>
                        <div className={cn('text-sm font-medium', isToday(day) && 'text-primary')}>{format(day, 'd')}</div>
                    </div>
                ))}
            </div>
            {/* All-day events banner */}
            {allDayEvents.length > 0 && (
                <div className="flex border-b">
                    <div className="w-12 shrink-0 flex items-center justify-end pr-2 text-[9px] text-muted-foreground">{t('spaces.panels.calendar.ganzt')}</div>
                    {days.map(day => {
                        const dayAllDay = allDayEvents.filter(e => isSameDay(new Date(e.dtstart), day));
                        return (
                            <div key={day.toISOString()} className="flex-1 border-r px-0.5 py-0.5 space-y-0.5">
                                {dayAllDay.map(e => (
                                    <div key={e.id} onClick={() => onEventClick(e)}
                                        className="cursor-pointer truncate rounded px-1 py-0.5 text-[8px] text-white"
                                        style={{ backgroundColor: getEventColor(e) }}>{e.title}</div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
            <ScrollArea className="flex-1">
                <div className="flex">
                    <div className="w-12 shrink-0">
                        {HOURS.map(h => <div key={h} className="flex h-12 items-start justify-end pr-2 text-[9px] text-muted-foreground">{String(h).padStart(2, '0')}:00</div>)}
                    </div>
                    {days.map(day => {
                        const dayEvents = getEventsForDay(events, day).filter(e => !e.allDay);
                        const conflicts = getConflicts(dayEvents);
                        return (
                            <div key={day.toISOString()} data-daycol className="relative flex-1 border-r"
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => {
                                    e.preventDefault();
                                    const eventId = e.dataTransfer.getData('calendar-event');
                                    if (!eventId) return;
                                    const hour = getDropHour(e, 7, 48);
                                    const h = Math.floor(hour);
                                    const m = Math.round((hour - h) * 60);
                                    const newDate = new Date(day);
                                    newDate.setHours(h, m, 0, 0);
                                    onMoveEvent(eventId, newDate);
                                }}>
                                {HOURS.map(h => (
                                    <div key={h}
                                        onClick={() => { const d = new Date(day); d.setHours(h, 0, 0, 0); onSlotClick(d); }}
                                        className="h-12 cursor-pointer border-b border-border/30 hover:bg-primary/5" />
                                ))}
                                {dayEvents.map(e => {
                                    const d = new Date(e.dtstart);
                                    const top = Math.max(0, (d.getHours() - 7)) * 48 + (d.getMinutes() / 60) * 48;
                                    const duration = e.dtend ? (new Date(e.dtend).getTime() - d.getTime()) / 3600000 : 1;
                                    const height = Math.max(20, duration * 48);
                                    const isConflict = conflicts.has(e.id);
                                    return (
                                        <div key={e.id} draggable={!e.rrule}
                                            onDragStart={ev => { if (!e.rrule) ev.dataTransfer.setData('calendar-event', e.id); }}
                                            onClick={() => onEventClick(e)}
                                            className={cn('group absolute left-0.5 right-0.5 cursor-grab overflow-hidden rounded px-1 py-0.5 text-[8px] text-white hover:opacity-90 active:cursor-grabbing',
                                                isConflict && 'ring-2 ring-destructive ring-offset-1')}
                                            style={{ top, height: resize?.id === e.id ? resize.height : height, backgroundColor: getEventColor(e) }}>
                                            {e.title}
                                            {isConflict && <span className="ml-1 text-[7px]">⚠</span>}
                                            <div onMouseDown={ev => startResize(ev, e, day, top)}
                                                title={t('calendar.resize', { defaultValue: 'Dauer ändern (ziehen)' })}
                                                className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize bg-black/0 hover:bg-black/20" />
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Day View
// ═══════════════════════════════════════════════════════════════════

function DayView({ events, currentDate, onSlotClick, onEventClick, onMoveEvent, onResizeEvent }: {
    events: CalendarEvent[]; currentDate: Date;
    onSlotClick: (d: Date) => void;
    onEventClick: (e: CalendarEvent) => void;
    onMoveEvent: (eventId: string, newStart: Date) => void;
    onResizeEvent: (eventId: string, newEnd: Date) => void;
}) {
    const t = useT();
    const dayEvents = getEventsForDay(events, currentDate);
    const timedEvents = dayEvents.filter(e => !e.allDay);
    const allDayEvents = dayEvents.filter(e => e.allDay);
    const conflicts = getConflicts(timedEvents);
    const today = isToday(currentDate);
    const [resize, setResize] = useState<{ id: string; height: number } | null>(null);

    const startResize = (ev: React.MouseEvent, e: CalendarEvent, topPx: number) => {
        ev.preventDefault(); ev.stopPropagation();
        const col = (ev.currentTarget as HTMLElement).closest('[data-daycol]') as HTMLElement | null;
        if (!col) return;
        const rect = col.getBoundingClientRect();
        const onMove = (m: MouseEvent) => {
            const h = Math.max(14, Math.round(((m.clientY - rect.top) - topPx) / 14) * 14);
            setResize({ id: e.id, height: h });
        };
        const onUp = (m: MouseEvent) => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            setResize(null);
            const hrs = Math.round((7 + (m.clientY - rect.top) / 56) * 4) / 4;
            const end = new Date(currentDate); end.setHours(0, 0, 0, 0);
            end.setMinutes(Math.round(hrs * 60));
            onResizeEvent(e.id, end);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div className="flex h-full flex-col">
            <div className={cn('border-b px-4 py-2 text-center', today && 'bg-primary/5')}>
                <div className="text-xs text-muted-foreground">{format(currentDate, 'EEEE', { locale: de })}</div>
                <div className={cn('text-lg font-semibold', today && 'text-primary')}>{format(currentDate, 'd. MMMM yyyy', { locale: de })}</div>
            </div>
            {/* All-day banner */}
            {allDayEvents.length > 0 && (
                <div className="flex items-center gap-2 border-b px-4 py-1.5">
                    <span className="text-[9px] text-muted-foreground">{t('spaces.panels.calendar.ganztaegig')}</span>
                    {allDayEvents.map(e => (
                        <div key={e.id} onClick={() => onEventClick(e)}
                            className="cursor-pointer truncate rounded px-2 py-0.5 text-[9px] text-white"
                            style={{ backgroundColor: getEventColor(e) }}>{e.title}</div>
                    ))}
                </div>
            )}
            <ScrollArea className="flex-1">
                <div className="flex">
                    <div className="w-14 shrink-0">
                        {HOURS.map(h => <div key={h} className="flex h-14 items-start justify-end pr-2 text-[10px] text-muted-foreground">{String(h).padStart(2, '0')}:00</div>)}
                    </div>
                    <div className="relative flex-1" data-daycol
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                            e.preventDefault();
                            const eventId = e.dataTransfer.getData('calendar-event');
                            if (!eventId) return;
                            const hour = getDropHour(e, 7, 56);
                            const h = Math.floor(hour);
                            const m = Math.round((hour - h) * 60);
                            const newDate = new Date(currentDate);
                            newDate.setHours(h, m, 0, 0);
                            onMoveEvent(eventId, newDate);
                        }}>
                        {HOURS.map(h => (
                            <div key={h}
                                onClick={() => { const d = new Date(currentDate); d.setHours(h, 0, 0, 0); onSlotClick(d); }}
                                className="h-14 cursor-pointer border-b border-border/30 hover:bg-primary/5" />
                        ))}
                        {today && (() => {
                            const now = new Date();
                            const top = Math.max(0, (now.getHours() - 7)) * 56 + (now.getMinutes() / 60) * 56;
                            return <div className="absolute left-0 right-0 h-px bg-destructive" style={{ top }} />;
                        })()}
                        {timedEvents.map(e => {
                            const d = new Date(e.dtstart);
                            const top = Math.max(0, (d.getHours() - 7)) * 56 + (d.getMinutes() / 60) * 56;
                            const duration = e.dtend ? (new Date(e.dtend).getTime() - d.getTime()) / 3600000 : 1;
                            const height = Math.max(28, duration * 56);
                            const isConflict = conflicts.has(e.id);
                            return (
                                <div key={e.id} draggable={!e.rrule}
                                    onDragStart={ev => { if (!e.rrule) ev.dataTransfer.setData('calendar-event', e.id); }}
                                    onClick={() => onEventClick(e)}
                                    className={cn('absolute left-1 right-1 cursor-grab overflow-hidden rounded-md px-2 py-1 text-white shadow-sm hover:opacity-90 active:cursor-grabbing',
                                        isConflict && 'ring-2 ring-destructive ring-offset-1')}
                                    style={{ top, height: resize?.id === e.id ? resize.height : height, backgroundColor: getEventColor(e) }}>
                                    <div className="text-[10px] font-medium">{e.title}{isConflict && ' ⚠'}</div>
                                    <div className="text-[9px] opacity-80">{format(d, 'HH:mm', { locale: de })}{e.location && ` · ${e.location}`}</div>
                                    <div onMouseDown={ev => startResize(ev, e, top)}
                                        title={t('calendar.resize', { defaultValue: 'Dauer ändern (ziehen)' })}
                                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize bg-black/0 hover:bg-black/20" />
                                </div>
                            );
                        })}
                        {timedEvents.length === 0 && allDayEvents.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><p className="text-xs text-muted-foreground">{t('spaces.panels.calendar.keine_termine')}</p></div>}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  List View
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
//  Gantt View
// ═══════════════════════════════════════════════════════════════════

function CalendarGanttView({ events, currentDate, onEventClick }: {
    events: CalendarEvent[]; currentDate: Date; onEventClick: (e: CalendarEvent) => void;
}) {
    const t = useT();
    // Show events that span multiple days or have dtend
    const ganttEvents = useMemo(() =>
        [...events].sort((a, b) => new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime()),
        [events]);

    // Calculate date range
    const { rangeStart, totalDays } = useMemo(() => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        let min = monthStart;
        let max = monthEnd;
        for (const e of ganttEvents) {
            const s = new Date(e.dtstart);
            const end = e.dtend ? new Date(e.dtend) : s;
            if (s < min) min = s;
            if (end > max) max = end;
        }
        const start = startOfDay(min);
        const days = Math.max(28, differenceInDays(max, start) + 3);
        return { rangeStart: start, totalDays: days };
    }, [ganttEvents, currentDate]);

    const dayWidth = 28;
    const todayOffset = differenceInDays(new Date(), rangeStart);

    // Day headers
    const days = useMemo(() => {
        const result: { date: Date; label: string; isToday: boolean; isWeekend: boolean; isFirstOfMonth: boolean }[] = [];
        for (let i = 0; i < totalDays; i++) {
            const d = addDays(rangeStart, i);
            const dow = d.getDay();
            result.push({
                date: d,
                label: format(d, 'd'),
                isToday: isToday(d),
                isWeekend: dow === 0 || dow === 6,
                isFirstOfMonth: d.getDate() === 1,
            });
        }
        return result;
    }, [rangeStart, totalDays]);

    // Month labels
    const months = useMemo(() => {
        const result: { label: string; offset: number; span: number }[] = [];
        let currentMonth = -1;
        for (let i = 0; i < days.length; i++) {
            const m = days[i].date.getMonth();
            if (m !== currentMonth) {
                if (result.length > 0) result[result.length - 1].span = i - result[result.length - 1].offset;
                result.push({ label: format(days[i].date, 'MMM yyyy', { locale: de }), offset: i, span: 0 });
                currentMonth = m;
            }
        }
        if (result.length > 0) result[result.length - 1].span = days.length - result[result.length - 1].offset;
        return result;
    }, [days]);

    if (ganttEvents.length === 0) {
        return <div className="flex h-full items-center justify-center p-6 text-xs text-muted-foreground">{t('spaces.panels.calendar.keine_termine_fuer_die_gantt-ansicht')}</div>;
    }

    return (
        <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex">
                    {/* Sticky labels */}
                    <div className="sticky left-0 z-10 w-[180px] shrink-0 bg-background">
                        <div className="h-[22px] border-b" />
                        <div className="h-[22px] border-b" />
                        {ganttEvents.map(e => (
                            <div key={e.id} onClick={() => onEventClick(e)}
                                className="flex h-[30px] cursor-pointer items-center gap-2 border-b border-r px-2 hover:bg-muted/50">
                                <div className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: getEventColor(e) }} />
                                <span className="truncate text-[10px] font-medium">{e.title}</span>
                            </div>
                        ))}
                    </div>

                    {/* Timeline */}
                    <div className="min-w-0 flex-1 overflow-x-auto">
                        <div style={{ minWidth: totalDays * dayWidth }}>
                            {/* Month header */}
                            <div className="flex border-b">
                                {months.map((m, i) => (
                                    <div key={i} className="border-r px-1 py-0.5 text-[9px] font-medium text-muted-foreground" style={{ width: m.span * dayWidth }}>
                                        {m.label}
                                    </div>
                                ))}
                            </div>
                            {/* Day header */}
                            <div className="flex border-b">
                                {days.map((d, i) => (
                                    <div key={i} className={cn(
                                        'flex items-center justify-center border-r text-[8px]',
                                        d.isToday ? 'bg-primary/10 font-bold text-primary' : d.isWeekend ? 'bg-muted/50 text-muted-foreground' : 'text-muted-foreground',
                                    )} style={{ width: dayWidth, height: 22 }}>
                                        {d.label}
                                    </div>
                                ))}
                            </div>
                            {/* Event bars */}
                            <div className="relative">
                                {/* Today line */}
                                {todayOffset >= 0 && todayOffset < totalDays && (
                                    <div className="absolute top-0 bottom-0 z-[1] w-px bg-primary/40" style={{ left: todayOffset * dayWidth + dayWidth / 2 }} />
                                )}

                                {ganttEvents.map(e => {
                                    const start = new Date(e.dtstart);
                                    const end = e.dtend ? new Date(e.dtend) : addDays(start, 1);
                                    const leftDays = Math.max(0, differenceInDays(start, rangeStart));
                                    const duration = Math.max(1, differenceInDays(end, start));

                                    return (
                                        <div key={e.id} onClick={() => onEventClick(e)}
                                            className="flex h-[30px] cursor-pointer items-center border-b hover:bg-muted/30">
                                            <div className="h-4 rounded-full"
                                                style={{
                                                    marginLeft: leftDays * dayWidth,
                                                    width: Math.max(duration * dayWidth, dayWidth),
                                                    backgroundColor: getEventColor(e),
                                                    opacity: e.status === 'CANCELLED' ? 0.3 : 1,
                                                }} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  List View
// ═══════════════════════════════════════════════════════════════════

function CalendarListView({ events, onEventClick }: { events: CalendarEvent[]; onEventClick: (e: CalendarEvent) => void }) {
    const t = useT();
    const sorted = useMemo(() =>
        [...events].sort((a, b) => new Date(a.dtstart).getTime() - new Date(b.dtstart).getTime()),
        [events]);

    if (events.length === 0) {
        return <div className="flex h-full items-center justify-center p-6"><MaterialIcon name="calendar_today" size={20} className="mr-2 opacity-30" /><p className="text-xs text-muted-foreground">{t('spaces.panels.calendar.keine_termine')}</p></div>;
    }

    let lastDateKey = '';

    return (
        <ScrollArea className="flex-1">
            <div className="divide-y divide-border/40">
                {sorted.map(e => {
                    const d = new Date(e.dtstart);
                    const dateKey = format(d, 'yyyy-MM-dd');
                    const showDate = dateKey !== lastDateKey;
                    lastDateKey = dateKey;
                    const today = isToday(d);

                    return (
                        <div
                            key={e.id}
                            onClick={() => onEventClick(e)}
                            className={cn(
                                'flex cursor-pointer items-center gap-4 px-3 py-2.5 transition-colors hover:bg-muted/50',
                                today && showDate && 'bg-primary/[0.03]',
                            )}
                        >
                            {/* Date column – compact: weekday / day / month */}
                            <div className="w-12 shrink-0 text-center">
                                {showDate ? (
                                    <div className={cn('flex flex-col items-center leading-none', today && 'text-primary')}>
                                        <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                                            {format(d, 'EEE', { locale: de })}
                                        </span>
                                        <span className={cn(
                                            'mt-0.5 text-lg font-semibold tabular-nums',
                                            today ? 'flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground' : 'text-foreground',
                                        )}>
                                            {format(d, 'd')}
                                        </span>
                                        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                                            {format(d, 'MMM', { locale: de })}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="h-px" />
                                )}
                            </div>

                            {/* Separator line */}
                            <div className="h-9 w-px shrink-0 bg-border/60" />

                            {/* Color dot */}
                            <div className="size-2 shrink-0 rounded-full" style={{ backgroundColor: getEventColor(e) }} />

                            {/* Content – title + metadata */}
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium leading-snug">{e.title}</div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <span className="tabular-nums">{e.allDay ? 'Ganztägig' : format(d, 'HH:mm', { locale: de })}</span>
                                    {!e.allDay && e.dtend && (
                                        <span className="tabular-nums">– {format(new Date(e.dtend), 'HH:mm', { locale: de })}</span>
                                    )}
                                    {e.location && <><span className="text-border">·</span><span className="truncate">{e.location}</span></>}
                                    <span className="text-border">·</span>
                                    <span className="truncate opacity-70">{e.layer.name}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ScrollArea>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  Main Export
// ═══════════════════════════════════════════════════════════════════

export function CalendarPanel({ space, fullscreen, hideLayerBar, initialView, initialDate }: { space?: SpaceItem; fullscreen?: boolean; hideLayerBar?: boolean; initialView?: CalendarView; initialDate?: Date }): JSX.Element {
    const [view, setView] = useState<CalendarView>(initialView ?? (fullscreen ? 'month' : 'list'));
    const [currentDate, setCurrentDate] = useState<Date>(initialDate ?? new Date());

    // Wenn URL-Params (z.B. aus Mini-Kalender-Klick in der Sidebar) den View
    // oder das Datum aendern, ziehen wir den State nach. Identitaets-Vergleich
    // nicht ueber Date-Instanzen, sondern ueber den ISO-Wert.
    useEffect(() => {
        if (initialView && initialView !== view) setView(initialView);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialView]);
    useEffect(() => {
        if (initialDate && initialDate.getTime() !== currentDate.getTime()) setCurrentDate(initialDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialDate?.getTime()]);
    // Termin-Dialog: Erstellen oder Bearbeiten. Das frühere Side-Panel ist
    // entfernt — der Kalender füllt jetzt die ganze Breite, „+" oben in der
    // Toolbar oder Klick auf einen Slot/Termin öffnet das Dialog-Overlay.
    const [addingDate, setAddingDate] = useState<Date | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

    const t = useT();
    const { layers, toggleLayer, subscribedLayerIds } = useCalendarLayers();
    const { canManage: canManageSchool } = useCanManageSchoolCalendar();

    // Range fuer Events: in der Jahresansicht laden wir das ganze Jahr,
    // sonst wie bisher 3 Monate (Vor-/Folge-Monat fuer Mehrtagesevents).
    const from = useMemo(() => {
        if (view === 'year') return startOfYear(currentDate);
        return startOfMonth(subMonths(currentDate, 1));
    }, [currentDate, view]);
    const to = useMemo(() => {
        if (view === 'year') return endOfYear(currentDate);
        return endOfMonth(addMonths(currentDate, 1));
    }, [currentDate, view]);
    const { events: rawEvents, loading, createEvent, updateEvent, deleteEvent } = useCalendarEvents(subscribedLayerIds, from, to);

    // Wiederkehrende Termine (FREQ=WEEKLY etc.) im Frontend expandieren —
    // sonst sieht der User nur die Original-Instanz am Anlege-Tag. Original-
    // Event-Felder werden geklont, dtstart/dtend pro Vorkommnis verschoben.
    // id bleibt gleich → Klick oeffnet den Original-Termin.
    const events = useMemo(() => expandRecurringEvents(rawEvents, from, to), [rawEvents, from, to]);

    // Nach Drag/Resize lädt der Hook neu — den ausgewählten Termin auf die
    // frische Version nachziehen, sonst speichert der Editor mit veralteter
    // Version (Optimistic-Lock → "in der Zwischenzeit geändert"). Lookup auf
    // rawEvents, weil der Editor die ORIGINAL-Serie editieren soll (nicht
    // eine virtuelle Wiederhol-Instanz mit verschobener dtstart).
    useEffect(() => {
        setSelectedEvent(prev => {
            if (!prev) return prev;
            const fresh = rawEvents.find(e => e.id === prev.id);
            if (!fresh) return null; // anderswo gelöscht
            return fresh.version !== prev.version ? fresh : prev;
        });
    }, [rawEvents]);

    const navLabel = useMemo(() => {
        switch (view) {
            case 'year': return format(currentDate, 'yyyy', { locale: de });
            case 'month': return format(currentDate, 'MMMM yyyy', { locale: de });
            case 'week': { const ws = startOfWeek(currentDate, { locale: de }); return `${format(ws, 'd.')} – ${format(addDays(ws, 6), 'd. MMM yyyy', { locale: de })}`; }
            case 'day': return format(currentDate, 'd. MMMM yyyy', { locale: de });
            case 'gantt': return format(currentDate, 'MMMM yyyy', { locale: de });
            case 'list': return format(currentDate, 'MMMM yyyy', { locale: de });
        }
    }, [view, currentDate]);

    const handlePrev = useCallback(() => {
        switch (view) {
            case 'year': setCurrentDate(d => subYears(d, 1)); break;
            case 'month': case 'list': case 'gantt': setCurrentDate(d => subMonths(d, 1)); break;
            case 'week': setCurrentDate(d => subWeeks(d, 1)); break;
            case 'day': setCurrentDate(d => subDays(d, 1)); break;
        }
    }, [view]);
    const handleNext = useCallback(() => {
        switch (view) {
            case 'year': setCurrentDate(d => addYears(d, 1)); break;
            case 'month': case 'list': case 'gantt': setCurrentDate(d => addMonths(d, 1)); break;
            case 'week': setCurrentDate(d => addWeeks(d, 1)); break;
            case 'day': setCurrentDate(d => addDays(d, 1)); break;
        }
    }, [view]);

    /** Click in der Jahresansicht: zur Monats-Ansicht des gewaehlten Monats wechseln. */
    const handleSelectMonth = useCallback((monthDate: Date) => {
        setCurrentDate(monthDate);
        setView('month');
    }, []);

    const handleSelectDay = useCallback((day: Date) => {
        setCurrentDate(day);
        setSelectedEvent(null);
        setAddingDate(day);
    }, []);

    // Klick auf einen Zeit-Slot (Woche/Tag): Termin zu genau dieser
    // Uhrzeit anlegen — Ansicht bleibt, Datum trägt die Stunde.
    const handleSelectSlot = useCallback((d: Date) => {
        setSelectedEvent(null);
        setAddingDate(d);
    }, []);

    const handleEventClick = useCallback((event: CalendarEvent) => {
        // Wenn der User eine virtuelle Wiederhol-Instanz klickt, oeffnen wir
        // den ORIGINAL-Termin (raw). Sonst wuerde der Editor die verschobene
        // dtstart anzeigen und beim Speichern die Serie kaputt machen.
        const original = rawEvents.find(e => e.id === event.id) ?? event;
        setSelectedEvent(original);
        setAddingDate(null);
    }, [rawEvents]);

    // „+"-Button in der Toolbar: leerer Termin zum aktuellen Datum
    // (Stunde = aktuelle Uhrzeit, sodass nicht alles auf 0:00 startet).
    const handleAddClick = useCallback(() => {
        const now = new Date();
        const d = new Date(currentDate);
        d.setHours(now.getHours(), 0, 0, 0);
        setSelectedEvent(null);
        setAddingDate(d);
    }, [currentDate]);

    const handleMoveEvent = useCallback(async (eventId: string, newStart: Date) => {
        const event = events.find(e => e.id === eventId);
        if (!event) return;
        // Calculate duration to preserve it
        const oldStart = new Date(event.dtstart).getTime();
        const oldEnd = event.dtend ? new Date(event.dtend).getTime() : oldStart + 3600000;
        const duration = oldEnd - oldStart;
        const newEnd = new Date(newStart.getTime() + duration);

        await updateEvent(eventId, {
            dtstart: newStart.toISOString(),
            dtend: newEnd.toISOString(),
            version: event.version,
        });
    }, [events, updateEvent]);

    // Termin per unterer Kante zeitlich verlängern/verkürzen (min. 15 Min).
    const handleResizeEvent = useCallback(async (eventId: string, newEnd: Date) => {
        const event = events.find(e => e.id === eventId);
        if (!event) return;
        const start = new Date(event.dtstart).getTime();
        const minEnd = start + 15 * 60000;
        const end = newEnd.getTime() < minEnd ? new Date(minEnd) : newEnd;
        await updateEvent(eventId, { dtend: end.toISOString(), version: event.version });
    }, [events, updateEvent]);

    // Slide-Over-Panel fuer Erstellen/Bearbeiten — kein Modal mit Backdrop
    // (Memory-Regel „keine Modal-Editoren"). Schiebt von rechts rein, volle
    // Hoehe, festes 520px Breite (auf Mobile schluckt es die ganze Breite).
    // Wegklicken nur via X oder ESC, damit halb-getippte Eingaben nicht durch
    // einen versehentlichen Klick außerhalb verloren gehen.
    const panelOpen = addingDate !== null || selectedEvent !== null;
    const closePanel = useCallback(() => { setAddingDate(null); setSelectedEvent(null); }, []);
    // ESC-Listener MUSS vor dem loading-Early-Return stehen, sonst springt
    // die Hook-Anzahl zwischen erstem (loading) und folgendem Render
    // (React Error #310 "Rendered more hooks than during the previous render").
    useEffect(() => {
        if (!panelOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [panelOpen, closePanel]);

    if (loading && events.length === 0) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }

    const grid = (
        <div className="flex h-full min-h-0 flex-col">
            {view === 'year' && <YearView events={events} currentDate={currentDate} onSelectMonth={handleSelectMonth} onSelectDay={handleSelectDay} />}
            {view === 'month' && <MonthView events={events} currentDate={currentDate} onSelectDay={handleSelectDay} onEventClick={handleEventClick} />}
            {view === 'week' && <WeekView events={events} currentDate={currentDate} onSelectDay={handleSelectDay} onSlotClick={handleSelectSlot} onEventClick={handleEventClick} onMoveEvent={handleMoveEvent} onResizeEvent={handleResizeEvent} />}
            {view === 'day' && <DayView events={events} currentDate={currentDate} onSlotClick={handleSelectSlot} onEventClick={handleEventClick} onMoveEvent={handleMoveEvent} onResizeEvent={handleResizeEvent} />}
            {view === 'gantt' && <CalendarGanttView events={events} currentDate={currentDate} onEventClick={handleEventClick} />}
            {view === 'list' && <CalendarListView events={events} onEventClick={handleEventClick} />}
        </div>
    );
    const eventPanel = (
        <div className={cn(
            'fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out print:hidden',
            panelOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}>
            {selectedEvent ? (
                <EventDetailEditor
                    key={`${selectedEvent.id}:${selectedEvent.version}`}
                    event={selectedEvent}
                    layers={layers}
                    onUpdate={updateEvent}
                    onDelete={deleteEvent}
                    onClose={closePanel}
                    canManageSchool={canManageSchool}
                    spaceId={space?.id}
                    spaceName={space?.name}
                />
            ) : addingDate ? (
                <QuickEventForm
                    key={addingDate.toISOString()}
                    layers={layers}
                    date={addingDate}
                    onClose={closePanel}
                    onCreate={createEvent}
                    canManageSchool={canManageSchool}
                    spaceId={space?.id}
                    spaceName={space?.name}
                />
            ) : null}
        </div>
    );

    return (
        <div className="flex h-full flex-col">
            <NavBar label={navLabel} onPrev={handlePrev} onNext={handleNext} onToday={() => setCurrentDate(new Date())} view={view} setView={setView} onAdd={handleAddClick} />
            {!hideLayerBar && <LayerBar layers={layers} onToggle={toggleLayer} />}
            <div className="min-h-0 flex-1">{grid}</div>
            {eventPanel}
        </div>
    );
}
