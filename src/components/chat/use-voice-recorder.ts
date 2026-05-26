import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useVoiceRecorder — kapselt MediaRecorder fuer Sprachnachrichten ("Flurfunk").
 *
 * UX-Vertrag:
 * - start() oeffnet das Mikrofon, beginnt aufzunehmen, startet einen Countdown
 * - Aufnahme stoppt automatisch nach `maxSeconds` ODER manuell via stop()
 * - Bei Stop liefert es einen `File` mit dem fertigen Audio-Blob (m4a/webm)
 * - Bei cancel() wird die Aufnahme verworfen, ohne onComplete-Callback
 * - Nach jedem Stop wird das Microphone-Stream sauber freigegeben
 *
 * Format-Auswahl: wir bevorzugen audio/webm (Opus) — funktioniert auf
 * Chrome/Firefox/Edge perfekt. Auf iOS Safari faellt MediaRecorder zurueck
 * auf audio/mp4 (AAC). Beides versteht faster-whisper direkt, kein Re-Encode
 * noetig.
 */

export interface VoiceRecorderOptions {
    /** Auto-Stop nach N Sekunden. Default 30. */
    maxSeconds?: number;
    /** Callback wenn Aufnahme fertig ist (entweder Auto-Stop oder manuell) */
    onComplete: (file: File, durationSec: number) => void;
    /** Callback bei Fehler (Permission denied, kein Mic, etc.) */
    onError?: (error: Error) => void;
}

export interface VoiceRecorderState {
    isRecording: boolean;
    /** Vergangene Sekunden seit Aufnahmestart */
    elapsedSec: number;
    /** Restliche Sekunden bis Auto-Stop */
    remainingSec: number;
    /** Aktuell laufende Lautstaerke (0-1) fuer Visualisierung. Optional. */
    level: number;
}

export interface VoiceRecorderControls {
    state: VoiceRecorderState;
    start(): Promise<void>;
    stop(): void;
    cancel(): void;
}

function pickMimeType(): string {
    // iOS Safari unterstuetzt audio/mp4 nativ; webm nicht.
    // Andere Browser bevorzugen webm/opus (kleiner, besser).
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/mp4;codecs=mp4a.40.2',
    ];
    for (const type of candidates) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

function extensionForMime(mime: string): string {
    if (mime.startsWith('audio/webm')) return 'webm';
    if (mime.startsWith('audio/mp4')) return 'm4a';
    if (mime.startsWith('audio/ogg')) return 'ogg';
    return 'bin';
}

export function useVoiceRecorder(opts: VoiceRecorderOptions): VoiceRecorderControls {
    const maxSeconds = opts.maxSeconds ?? 30;
    const [state, setState] = useState<VoiceRecorderState>({
        isRecording: false,
        elapsedSec: 0,
        remainingSec: maxSeconds,
        level: 0,
    });

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedAtRef = useRef<number>(0);
    const tickIntervalRef = useRef<number | null>(null);
    const cancelledRef = useRef<boolean>(false);
    // Callbacks in refs damit sich der hook nicht bei jedem Render neu aufbaut
    const onCompleteRef = useRef(opts.onComplete);
    const onErrorRef = useRef(opts.onError);
    onCompleteRef.current = opts.onComplete;
    onErrorRef.current = opts.onError;

    const cleanup = useCallback(() => {
        if (tickIntervalRef.current !== null) {
            window.clearInterval(tickIntervalRef.current);
            tickIntervalRef.current = null;
        }
        const stream = streamRef.current;
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        mediaRecorderRef.current = null;
    }, []);

    const start = useCallback(async () => {
        if (state.isRecording) return;
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            onErrorRef.current?.(new Error('Mikrofon-Zugriff wird vom Browser nicht unterstuetzt.'));
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            streamRef.current = stream;

            const mimeType = pickMimeType();
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];
            cancelledRef.current = false;
            startedAtRef.current = Date.now();

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                const cancelled = cancelledRef.current;
                const recordedMime = recorder.mimeType || mimeType || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: recordedMime });
                const elapsedMs = Date.now() - startedAtRef.current;
                const durationSec = Math.max(0, Math.round(elapsedMs / 100) / 10);

                setState({
                    isRecording: false,
                    elapsedSec: 0,
                    remainingSec: maxSeconds,
                    level: 0,
                });
                cleanup();

                if (cancelled || blob.size === 0) return;

                const ext = extensionForMime(recordedMime);
                const filename = `flurfunk-${Date.now()}.${ext}`;
                const file = new File([blob], filename, { type: recordedMime, lastModified: Date.now() });
                onCompleteRef.current(file, durationSec);
            };

            // 100ms timeslice damit ondataavailable regelmaessig feuert
            recorder.start(100);

            // Tick fuer Countdown + Auto-Stop
            tickIntervalRef.current = window.setInterval(() => {
                const elapsedSec = Math.floor((Date.now() - startedAtRef.current) / 1000);
                const remainingSec = Math.max(0, maxSeconds - elapsedSec);
                setState((prev) => ({ ...prev, elapsedSec, remainingSec }));
                if (elapsedSec >= maxSeconds) {
                    // Auto-Stop bei Erreichen der Max-Dauer
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                        mediaRecorderRef.current.stop();
                    }
                }
            }, 200);

            setState({
                isRecording: true,
                elapsedSec: 0,
                remainingSec: maxSeconds,
                level: 0,
            });
        } catch (err) {
            cleanup();
            const error = err instanceof Error ? err : new Error('Mikrofon-Zugriff fehlgeschlagen');
            onErrorRef.current?.(error);
            setState({
                isRecording: false,
                elapsedSec: 0,
                remainingSec: maxSeconds,
                level: 0,
            });
        }
    }, [state.isRecording, maxSeconds, cleanup]);

    const stop = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            cancelledRef.current = false;
            recorder.stop();
        }
    }, []);

    const cancel = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        cancelledRef.current = true;
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
        } else {
            cleanup();
            setState({
                isRecording: false,
                elapsedSec: 0,
                remainingSec: maxSeconds,
                level: 0,
            });
        }
    }, [maxSeconds, cleanup]);

    // Sicherheits-Cleanup bei Unmount
    useEffect(() => {
        return () => {
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state !== 'inactive') {
                cancelledRef.current = true;
                recorder.stop();
            }
            cleanup();
        };
    }, [cleanup]);

    return { state, start, stop, cancel };
}
