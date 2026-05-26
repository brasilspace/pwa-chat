import { type JSX, useState, useCallback, useRef } from 'react';
import { Upload } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { toast } from '@/components/ui/toast';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { requestJson } from '@/core/http/http-client';
import { cn } from '@/lib/utils';
import { useFileDrop } from './use-file-drop';
import { useT } from "@/lib/i18n/use-t";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_NOTE_LENGTH = 140;

interface SendDropDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    recipientUserId: string;
    recipientDisplayName: string;
    /** Optional: vorbelegte Datei (z.B. wenn aus Eigenes-Dokument heraus geteilt). */
    presetFile?: File | null;
    /** Callback nach erfolgreichem Senden. */
    onSent?: (dropId: string) => void;
}

interface UploadUrlResponse {
    storageKey: string;
    uploadUrl: { url: string };
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function SendDropDialog({
    open,
    onOpenChange,
    recipientUserId,
    recipientDisplayName,
    presetFile,
    onSent,
}: SendDropDialogProps): JSX.Element {
    const t = useT();
    const [file, setFile] = useState<File | null>(presetFile ?? null);
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const reset = useCallback(() => {
        setFile(null);
        setNote('');
        setSending(false);
    }, []);

    const handleClose = useCallback(() => {
        if (sending) return;
        reset();
        onOpenChange(false);
    }, [sending, reset, onOpenChange]);

    const handleFilePick = useCallback((picked: File | null) => {
        if (!picked) return;
        if (picked.size > MAX_FILE_SIZE) {
            toast.error(`Datei zu gross: max. ${formatBytes(MAX_FILE_SIZE)}.`);
            return;
        }
        setFile(picked);
    }, []);

    const { isDragging, dragHandlers } = useFileDrop({
        onDrop: (files) => handleFilePick(files[0] ?? null),
        disabled: sending,
    });

    const handleSend = useCallback(async () => {
        if (!file) return;
        const jwt = sessionStore.getSnapshot().platform?.token;
        if (!jwt) {
            toast.error('Nicht eingeloggt.');
            return;
        }

        setSending(true);
        try {
            // 1. Upload-URL anfordern (mit Privacy/Quota-Check serverseitig)
            const uploadInfo = await requestJson<UploadUrlResponse>({
                target: 'platform',
                baseUrl: env.platformBaseUrl,
                path: '/platform/v1/personal-fach/drops/upload-url',
                method: 'POST',
                bearerToken: jwt,
                body: JSON.stringify({
                    recipientUserId,
                    fileName: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    sizeBytes: file.size,
                }),
            });

            if (!uploadInfo?.uploadUrl?.url) {
                toast.error('Datei-Speicher ist gerade nicht verfuegbar. Bitte wende dich an den Schul-Admin.');
                return;
            }

            // 2. Datei direkt zu S3 (presigned PUT)
            const putRes = await fetch(uploadInfo.uploadUrl.url, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                body: file,
            });
            if (!putRes.ok) throw new Error(`Upload fehlgeschlagen (${putRes.status})`);

            // 3. Drop persistieren
            const drop = await requestJson<{ dropId: string }>({
                target: 'platform',
                baseUrl: env.platformBaseUrl,
                path: '/platform/v1/personal-fach/drops',
                method: 'POST',
                bearerToken: jwt,
                body: JSON.stringify({
                    recipientUserId,
                    storageKey: uploadInfo.storageKey,
                    fileName: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    sizeBytes: file.size,
                    senderNote: note.trim() || null,
                }),
            });

            toast.success(`An ${recipientDisplayName} zugestellt.`);
            onSent?.(drop.dropId);
            reset();
            onOpenChange(false);
        } catch (err) {
            const msg = (err as Error).message ?? 'Unbekannter Fehler';
            // Spezifische Fehler-Codes erkennen und freundlich melden
            if (msg.includes('DROP_NOT_ALLOWED')) {
                toast.error(`${recipientDisplayName} erlaubt keine Drops von dir.`);
            } else if (msg.includes('RECIPIENT_INBOX_FULL')) {
                toast.error(`Postfach von ${recipientDisplayName} ist voll.`);
            } else if (msg.includes('QUOTA_EXCEEDED')) {
                toast.error('Quota ueberschritten.');
            } else if (msg.includes('RATE_LIMIT')) {
                toast.error('Zu viele Drops in kurzer Zeit. Bitte warte etwas.');
            } else if (msg.includes('S3_NOT_CONFIGURED') || msg.includes('503')) {
                toast.error('Datei-Speicher ist gerade nicht verfuegbar. Bitte wende dich an den Schul-Admin.');
            } else {
                toast.error(`Senden fehlgeschlagen: ${msg}`);
            }
        } finally {
            setSending(false);
        }
    }, [file, note, recipientUserId, recipientDisplayName, onSent, reset, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md" {...dragHandlers}>
                {isDragging && (
                    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-primary/10 backdrop-blur-[2px]">
                        <div className="flex flex-col items-center gap-2 rounded-lg bg-background px-6 py-4 shadow-lg ring-2 ring-primary">
                            <MaterialIcon name="upload" size={16} className="size-8 text-primary" />
                            <p className="text-sm font-medium">{t('mein-fach.send_drop_dialog.datei_hier_ablegen')}</p>
                        </div>
                    </div>
                )}
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MaterialIcon name="inbox" size={16} className="size-4" />
                        {t('mein-fach.send_drop_dialog.ins_fach_legen')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('mein-fach.send_drop_dialog.datei_wird_im_postfach_des_empfaengers_a')}
                    </DialogDescription>
                </DialogHeader>

                {/* Empfaenger */}
                <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
                    <UserAvatar displayName={recipientDisplayName} size="sm" />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{recipientDisplayName}</div>
                        <div className="truncate text-xs text-muted-foreground">{recipientUserId}</div>
                    </div>
                </div>

                {/* Datei-Auswahl */}
                <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('mein-fach.send_drop_dialog.datei')}</label>
                    {!file ? (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 px-4 py-6 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        >
                            <MaterialIcon name="attach_file" size={16} className="size-4" />
                            {t('mein-fach.send_drop_dialog.datei_waehlen_max_50_mb')}
                        </button>
                    ) : (
                        <div className="mt-1 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                            <MaterialIcon name="attach_file" size={16} className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{file.name}</div>
                                <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setFile(null)}
                                disabled={sending}
                                className="rounded p-1 hover:bg-muted disabled:opacity-50"
                            >
                                <MaterialIcon name="close" size={16} className="size-4" />
                            </button>
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                            handleFilePick(e.target.files?.[0] ?? null);
                            e.target.value = '';
                        }}
                    />
                </div>

                {/* Begleitnotiz */}
                <div>
                    <label className="text-xs font-medium text-muted-foreground">
                        {t('mein-fach.send_drop_dialog.begleitnotiz')} <span className="text-muted-foreground/60">{t('mein-fach.send_drop_dialog.optional_max')} {MAX_NOTE_LENGTH} {t('mein-fach.send_drop_dialog.zeichen')}</span>
                    </label>
                    <textarea
                        className="mt-1 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        rows={2}
                        maxLength={MAX_NOTE_LENGTH}
                        placeholder={t('mein-fach.send_drop_dialog.zb_hausaufgabe_fuer_donnerstag_bitte_bis')}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        disabled={sending}
                    />
                    <div className={cn(
                        'mt-1 text-right text-[10px] tabular-nums',
                        note.length > MAX_NOTE_LENGTH * 0.9 ? 'text-amber-500' : 'text-muted-foreground',
                    )}>
                        {note.length} / {MAX_NOTE_LENGTH}
                    </div>
                </div>

                {/* Aktionen */}
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={handleClose} disabled={sending}>
                        {t('mein-fach.send_drop_dialog.abbrechen')}
                    </Button>
                    <Button onClick={handleSend} disabled={!file || sending}>
                        {sending ? 'Zustellen…' : t('common.send')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
