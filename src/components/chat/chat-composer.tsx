import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Send, Smile, X, FileText, Image as ImageIcon, Film, Music, Mic, Square } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { EmojiPicker } from './emoji-picker';
import { useUploadLimit, formatBytes } from '@/features/chat/use-upload-limit';
import { toast } from '@/components/ui/toast';
import { useVoiceRecorder } from './use-voice-recorder';
import { sessionStore } from '@/core/session/session-store';
import { RichEditor, type RichEditorHandle } from '@/components/editor/rich-editor';
import { InlineFormattingToolbar } from '@/components/editor/inline-formatting-toolbar';
import { isPlainTextHtml } from '@/components/editor/sanitize';
import { useT } from "@/lib/i18n/use-t";

interface ChatComposerProps {
    /** text = Plain-Text-Body. html = formatted_body (nur gesetzt wenn echte Formatierung vorhanden). */
    onSend?: (text: string, html?: string) => void;
    /**
     * Wenn der Caller die mxc-URI vom Synapse-Upload zurueckgibt, kann
     * der Composer fuer Sprachnachrichten den Flurfunk-Heartbeat
     * `synapse_upload_done` schicken. Caller darf weiterhin `void` returnen
     * — dann entfaellt der dritte Heartbeat, der Match-Pfad funktioniert
     * trotzdem ueber sender+roomId+60s.
     */
    onSendFile?: (file: File) => void | Promise<{ mxcUri: string } | null | void>;
    onTyping?: () => void;
    onCollabText?: () => void;
    placeholder?: string;
    className?: string;
    /** Matrix-Room-ID — wird fuer Flurfunk-Heartbeat-Tracking gebraucht. */
    roomId?: string;
}

const FILE_ICONS: Record<string, typeof FileText> = {
    'image': ImageIcon,
    'video': Film,
    'audio': Music,
};

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Kategorien fuer den Plus-Button. Jede Kategorie setzt ein passendes
// accept-Attribut am versteckten file-input, damit der System-Dialog
// bereits gefiltert aufgeht. Drag-and-Drop nimmt weiterhin alles an.
// Die Dokument-Liste ist bewusst lang gehalten — lieber zu viele als
// zu wenige, damit niemand am Dateipicker scheitert.
const FILE_CATEGORIES = [
    { key: 'image', label: 'Bild', icon: ImageIcon, accept: 'image/*' },
    { key: 'video', label: 'Video', icon: Film, accept: 'video/*' },
    { key: 'audio', label: 'Audio', icon: Music, accept: 'audio/*' },
    {
        key: 'document', label: 'Dokument', icon: FileText,
        accept: '.pdf,.doc,.docx,.odt,.rtf,.txt,.md,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    { key: 'any', label: 'Andere', icon: FileText, accept: '' },
] as const;

type FileCategory = typeof FILE_CATEGORIES[number]['key'];

export function ChatComposer({ onSend, onSendFile, onTyping, onCollabText, placeholder = 'Nachricht schreiben...', className, roomId }: ChatComposerProps) {
    const t = useT();
    const [text, setText] = useState('');
    const [html, setHtml] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const editorRef = useRef<RichEditorHandle>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingCategoryRef = useRef<FileCategory | null>(null);
    const attachMenuRef = useRef<HTMLDivElement>(null);
    const uploadLimitBytes = useUploadLimit();

    // Flurfunk: Sprachnachrichten via MediaRecorder. Nur sichtbar wenn der
    // angemeldete Benutzer canUseTranscription hat (Lehrer/Verwaltung).
    // Tenant-seitig wird transcriptionEnabled ohnehin auf der Server-
    // Seite gepruefft — wir zeigen den Button hier defensive nur wenn
    // der User-Type das Recht hat, alles weitere passiert async.
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const canFlurfunk = session.permissions?.canUseTranscription ?? false;
    // Whisper-Server-Health (alle 30s vom Backend gecacht). Wenn down, wird
    // der Mic-Button ausgegraut + Tooltip aendert — verhindert 3min-Spinner-
    // ohne-Antwort UX wenn der GPU-Server nicht erreichbar ist.
    const whisperAvailable = session.permissions?.whisperAvailable ?? false;

    // Flurfunk-Diagnose-Heartbeats: pro Aufnahme generieren wir eine
    // clientAttemptId und schicken zwei Heartbeats (recording_started bei
    // Klick, recording_stopped bei Stop/Auto-Stop). Backend matched die mit
    // dem spaeteren Connector-Trigger ueber sender+roomId+60s-Fenster, damit
    // der Detail-Pfad in /admin/flurfunk sichtbar ist.
    const clientAttemptIdRef = useRef<string | null>(null);

    const sendFlurfunkHeartbeat = useCallback(async (
        phase: 'recording_started' | 'recording_stopped' | 'synapse_upload_done',
        extras: Record<string, unknown> = {},
    ) => {
        const id = clientAttemptIdRef.current;
        if (!id) return;
        const platformToken = session.platform?.token;
        if (!platformToken) return;
        try {
            await fetch('/api/platform/v1/flurfunk/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${platformToken}` },
                body: JSON.stringify({
                    clientAttemptId: id,
                    phase,
                    roomId: roomId ?? 'unknown',
                    ...extras,
                }),
            });
        } catch {
            // Diagnose darf den Voice-Flow nie blockieren.
        }
    }, [session.platform?.token, roomId]);

    const maxRecordingSeconds = session.bootstrap?.voice?.maxRecordingSeconds ?? 30;
    const voiceRecorder = useVoiceRecorder({
        maxSeconds: maxRecordingSeconds,
        onComplete: async (file, durationSec) => {
            // Heartbeat #2: Aufnahme beendet, Audio-Blob liegt vor Upload.
            void sendFlurfunkHeartbeat('recording_stopped', {
                durationSec,
                mimetype: file.type || undefined,
                filename: file.name,
            });
            // Direkt senden — Flurfunk soll keine Vorschau-Phase haben,
            // analog zu WhatsApp/Signal: Stop = Senden.
            const result = await onSendFile?.(file);
            // Heartbeat #3 (synapse_upload_done) — nur wenn Caller die
            // mxc-URI zurueckgibt. Damit kommt im Diagnose-Detail-Panel der
            // dritte gruene Browser-Tick, und der Connector-Match wird
            // robuster (Match-Logik nimmt sender+roomId, aber bei zwei
            // Aufnahmen in 60s im selben Raum hilft das mxc als Tiebreaker
            // — heute aber nur Cosmetik, der erste Match gewinnt).
            if (result && 'mxcUri' in result && result.mxcUri) {
                void sendFlurfunkHeartbeat('synapse_upload_done', {
                    mxcUri: result.mxcUri,
                    durationSec,
                    mimetype: file.type || undefined,
                    filename: file.name,
                });
            }
        },
        onError: (err) => {
            toast.error(`Mikrofon-Fehler: ${err.message}`);
        },
    });

    const startFlurfunkRecording = useCallback(() => {
        // ID *einmal* pro Aufnahme generieren — beide Heartbeats teilen sie.
        clientAttemptIdRef.current = `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        void sendFlurfunkHeartbeat('recording_started');
        void voiceRecorder.start();
    }, [sendFlurfunkHeartbeat, voiceRecorder]);
    const isRecording = voiceRecorder.state.isRecording;

    /**
     * Filtert eine File-Liste gegen das Upload-Limit. Zu grosse Dateien
     * werden rausgeworfen und einzeln per Toast gemeldet, sodass der User
     * weiss, warum nur ein Teil seiner Auswahl im Preview landet.
     * Wenn der Limit noch nicht geladen ist, werden alle Dateien
     * durchgelassen — der Server wuerde mit HTTP 413 antworten, aber
     * besser als gar nichts.
     */
    const filterBySize = useCallback((files: File[]): File[] => {
        if (!uploadLimitBytes) return files;
        const accepted: File[] = [];
        for (const f of files) {
            if (f.size <= uploadLimitBytes) {
                accepted.push(f);
            } else {
                toast.error(
                    `"${f.name}" ist zu gross (${formatBytes(f.size)}). ` +
                    `Maximale Upload-Groesse: ${formatBytes(uploadLimitBytes)}.`,
                );
            }
        }
        return accepted;
    }, [uploadLimitBytes]);

    // Click-outside schliesst das Kategorie-Menu
    useEffect(() => {
        if (!showAttachMenu) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
                setShowAttachMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAttachMenu]);

    const openFilePicker = useCallback((category: typeof FILE_CATEGORIES[number]) => {
        if (!fileInputRef.current) return;
        fileInputRef.current.accept = category.accept;
        pendingCategoryRef.current = category.key;
        fileInputRef.current.click();
        setShowAttachMenu(false);
    }, []);

    const handleSend = useCallback(() => {
        // Send pending files first
        for (const file of pendingFiles) {
            onSendFile?.(file);
        }
        setPendingFiles([]);

        // Send text if any
        const trimmed = text.trim();
        if (trimmed) {
            // formatted_body nur senden wenn echte Formatierung da ist —
            // sonst zaehlt es als reiner Plain-Text und matrix akzeptiert das
            // sparsamer.
            const formatted = isPlainTextHtml(html) ? undefined : html;
            onSend?.(trimmed, formatted);
            setText('');
            setHtml('');
            editorRef.current?.clear();
        }
    }, [text, html, pendingFiles, onSend, onSendFile]);

    // Drag & Drop
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);

        const raw = filterBySize(Array.from(e.dataTransfer.files));
        if (raw.length === 0) return;
        // Gleiche Stabilisierung wie beim File-Picker — Drop-Refs sind
        // genauso fragil wie Picker-Refs auf manchen Browsern.
        const stable: File[] = [];
        for (const f of raw) {
            try {
                const buf = await f.arrayBuffer();
                stable.push(new File([buf], f.name, { type: f.type || 'application/octet-stream', lastModified: f.lastModified }));
            } catch {
                stable.push(f);
            }
        }
        setPendingFiles(prev => [...prev, ...stable]);
    };

    // File picker
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = filterBySize(Array.from(e.target.files ?? []));
        if (raw.length === 0) {
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        // iOS Safari invalidiert File-Referenzen aus dem Picker oft
        // bevor wir sie senden koennen — symptomatisch: broken-icon im
        // Preview, leerer Upload-Body. Workaround: ArrayBuffer SOFORT
        // lesen und damit eine in-memory File neu bauen, die stabil bleibt.
        const stable: File[] = [];
        for (const f of raw) {
            try {
                const buf = await f.arrayBuffer();
                stable.push(new File([buf], f.name, { type: f.type || 'application/octet-stream', lastModified: f.lastModified }));
            } catch {
                // Fallback: Original-Referenz, vielleicht klappts ja doch
                stable.push(f);
            }
        }
        setPendingFiles(prev => [...prev, ...stable]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removePendingFile = (index: number) => {
        setPendingFiles(prev => prev.filter((_, i) => i !== index));
    };

    const canSend = text.trim().length > 0 || pendingFiles.length > 0;

    return (
        <div
            className={cn(
                'border-t bg-[var(--chat-composer)] px-4 py-3 transition-colors',
                dragOver && 'bg-primary/5 border-t-primary/30',
                className,
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="mx-auto max-w-[var(--content-reading-width)]">
                <div className={cn(
                    'rounded-2xl border border-[var(--chat-composer-border)] bg-[var(--chat-composer)] shadow-[var(--shadow-xs)] transition-all focus-within:shadow-[var(--shadow-sm)] focus-within:ring-1 focus-within:ring-ring',
                    dragOver && 'ring-2 ring-primary/40 border-primary/30',
                )}>
                    {/* Drag overlay */}
                    {dragOver && (
                        <div className="flex items-center justify-center px-4 py-3 text-sm text-primary font-medium">
                            {t('app.misc.dateien_hier_ablegen')}
                        </div>
                    )}

                    {/* Pending files preview */}
                    {pendingFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-4 pt-3">
                            {pendingFiles.map((file, i) => (
                                <PendingFilePreview
                                    key={`${file.name}-${i}-${file.size}`}
                                    file={file}
                                    onRemove={() => removePendingFile(i)}
                                />
                            ))}
                        </div>
                    )}

                    {/* Editor (Tiptap mit BubbleMenu fuer Inline-Formatierung) */}
                    {!dragOver && (
                        <div className="px-4 pt-3 pb-1 text-[15px] leading-relaxed">
                            <RichEditor
                                ref={editorRef}
                                profile="chat-composer"
                                placeholder={placeholder}
                                onChange={({ text: t, html: h }) => {
                                    setText(t);
                                    setHtml(h);
                                    onTyping?.();
                                }}
                                onEnter={handleSend}
                                className="min-h-[1.5rem] max-h-[200px] overflow-y-auto"
                            >
                                {(editor) => <InlineFormattingToolbar editor={editor} />}
                            </RichEditor>
                        </div>
                    )}

                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-2 pb-2 pt-1">
                        <div className="flex items-center gap-0.5">
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                            <div className="relative" ref={attachMenuRef}>
                                <button
                                    type="button"
                                    title={t('app.misc.anhang_hinzufuegen')}
                                    onClick={() => setShowAttachMenu((v) => !v)}
                                    className={cn(
                                        'flex size-11 items-center justify-center rounded-md transition-all md:size-9',
                                        showAttachMenu
                                            ? 'bg-muted text-foreground rotate-45'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                    )}
                                >
                                    <MaterialIcon name="add" size={16} className="size-5 md:size-4" />
                                </button>
                                {showAttachMenu && (
                                    <div className="absolute bottom-full left-0 z-50 mb-2 min-w-[180px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                                        {onCollabText && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowAttachMenu(false); onCollabText(); }}
                                                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                                                >
                                                    <MaterialIcon name="edit" size={16} className="size-4 shrink-0 text-primary" />
                                                    <span className="font-medium">{t('app.misc.gemeinsamer_text')}</span>
                                                </button>
                                                <div className="border-b border-border" />
                                            </>
                                        )}
                                        {FILE_CATEGORIES.map((cat) => {
                                            const Icon = cat.icon;
                                            return (
                                                <button
                                                    key={cat.key}
                                                    type="button"
                                                    onClick={() => openFilePicker(cat)}
                                                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                                                >
                                                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                                                    <span>{cat.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="relative">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="size-11 p-0 text-muted-foreground hover:text-foreground md:size-9"
                                            onClick={() => setShowEmoji(!showEmoji)}
                                        >
                                            <Smile className="size-5 md:size-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('app.misc.emoji')}</TooltipContent>
                                </Tooltip>
                                {showEmoji && (
                                    <EmojiPicker
                                        onSelect={(emoji) => {
                                            const ed = editorRef.current?.getEditor?.();
                                            if (ed) ed.chain().focus().insertContent(emoji).run();
                                        }}
                                        onClose={() => setShowEmoji(false)}
                                    />
                                )}
                            </div>
                            {/* Flurfunk — Sprachnachricht aufnehmen. Nur sichtbar
                                wenn der UserType canUseTranscription hat. Klick
                                startet sofort die Aufnahme; Klick auf den
                                Stopp-Button (oder Auto-Stop nach 30s) sendet. */}
                            {canFlurfunk && !isRecording && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                'size-11 p-0 md:size-9',
                                                whisperAvailable
                                                    ? 'text-muted-foreground hover:text-foreground'
                                                    : 'text-muted-foreground/40 hover:text-muted-foreground/40 cursor-not-allowed',
                                            )}
                                            disabled={!whisperAvailable}
                                            onClick={() => whisperAvailable && startFlurfunkRecording()}
                                        >
                                            <Mic className="size-5 md:size-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {whisperAvailable
                                            ? 'Flurfunk — Sprachnachricht'
                                            : 'Flurfunk gerade nicht verfuegbar (Whisper-Server nicht erreichbar)'}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </div>

                        {isRecording ? (
                            <FlurfunkRecordingBar
                                remainingSec={voiceRecorder.state.remainingSec}
                                onStop={voiceRecorder.stop}
                                onCancel={voiceRecorder.cancel}
                            />
                        ) : (
                            <Button
                                variant="primary"
                                size="sm"
                                className="size-11 rounded-lg p-0 md:size-9"
                                disabled={!canSend}
                                onClick={handleSend}
                            >
                                <MaterialIcon name="send" size={16} className="size-5 md:size-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * FlurfunkRecordingBar — UI-State waehrend einer aktiven Sprachaufnahme.
 *
 * Ersetzt den Send-Button durch einen Stop-Button mit Countdown und
 * pulsierendem Mic-Indikator. Klick auf Stop sendet die Aufnahme; X
 * verwirft sie.
 */
function FlurfunkRecordingBar({
    remainingSec,
    onStop,
    onCancel,
}: {
    remainingSec: number;
    onStop: () => void;
    onCancel: () => void;
}) {
    const t = useT();
    // Restzeit-Format: <60s als reine Sekunden, sonst m:ss. Absolute Schwellen
    // fuer Warnfarben (10s/5s) — User-Wahrnehmung "letzte Sekunden" ist
    // konstant unabhaengig vom konfigurierten Limit.
    const countdown = remainingSec < 60
        ? `${remainingSec}s`
        : `${Math.floor(remainingSec / 60)}:${(remainingSec % 60).toString().padStart(2, '0')}`;
    const isCritical = remainingSec <= 5;
    const isWarning = !isCritical && remainingSec <= 10;
    const bgClass = isCritical
        ? 'bg-red-500/15'
        : isWarning ? 'bg-amber-500/15' : 'bg-red-500/10';
    const numberClass = isCritical
        ? 'text-red-600 dark:text-red-400 animate-pulse'
        : isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-foreground';
    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={onCancel}
                className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                title={t('app.misc.aufnahme_verwerfen')}
            >
                <MaterialIcon name="close" size={16} className="size-4" />
            </button>
            <div className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 ${bgClass}`}>
                <span className="size-2 animate-pulse rounded-full bg-red-500" />
                <span className={`font-mono text-xs tabular-nums ${numberClass}`}>
                    {countdown}
                </span>
                <span className="text-[10px] text-muted-foreground">noch</span>
            </div>
            <Button
                variant="primary"
                size="sm"
                className="size-11 rounded-lg p-0 md:size-9"
                onClick={onStop}
                title={t('app.misc.aufnahme_stoppen_und_senden')}
            >
                <Square className="size-5 fill-current md:size-4" />
            </Button>
        </div>
    );
}

function ComposerAction({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="size-8 p-0 text-muted-foreground hover:text-foreground">
                    {icon}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

/**
 * PendingFilePreview — Vorschau eines im Composer wartenden Files.
 *
 * Stable blob: URL pro Mount via useEffect — NICHT bei jedem Render
 * URL.createObjectURL aufrufen, sonst orphans/broken-icons. Bei Unmount
 * (oder File-Wechsel) wird die URL sauber revoked.
 */
function PendingFilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
    const isImage = file.type.startsWith('image/');
    const typeKey = file.type.split('/')[0];
    const Icon = FILE_ICONS[typeKey] ?? FileText;
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!isImage) return;
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => { URL.revokeObjectURL(url); };
    }, [file, isImage]);

    return (
        <div className="relative group flex items-center gap-2 rounded-lg border bg-muted/50 px-2.5 py-1.5">
            {isImage && previewUrl ? (
                <img
                    src={previewUrl}
                    alt={file.name}
                    className="size-8 rounded object-cover"
                />
            ) : (
                <Icon className="size-4 text-muted-foreground" />
            )}
            <div className="min-w-0">
                <p className="text-xs font-medium truncate max-w-[120px]">{file.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatSize(file.size)}</p>
            </div>
            <button
                onClick={onRemove}
                className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
            >
                <MaterialIcon name="close" size={16} className="size-2.5" />
            </button>
        </div>
    );
}
