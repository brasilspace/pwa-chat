import { useCallback, useState, type DragEvent } from 'react';

/**
 * Hook fuer Drag&Drop von Dateien aus dem System (Finder, Explorer, Mail-Anhang).
 * Liefert die Event-Handler + einen Boolean, der zeigt ob aktuell etwas
 * ueber dem Bereich schwebt — fuer Hover-Highlight im UI.
 *
 * Counter-Trick: dragenter/leave feuern bei jedem Kind-Element, deshalb
 * zaehlen wir die Tiefe statt nur on/off zu setzen.
 *
 * Multi-File: onDrop bekommt File[] — der Aufrufer entscheidet ob er
 * mehrere zulaesst oder nur das erste verwendet.
 *
 * Nutzung:
 *   const { isDragging, dragHandlers } = useFileDrop({ onDrop: (files) => {...} });
 *   <div {...dragHandlers} className={cn(isDragging && 'ring-2 ring-primary')} />
 */
export function useFileDrop({
    onDrop,
    accept,
    disabled,
}: {
    onDrop: (files: File[]) => void;
    /** Optional MIME-Filter, z.B. ['application/pdf', 'image/*']. Nicht-passende werden verworfen. */
    accept?: string[];
    /** Wenn true, ignoriert Dropzone alle Events (z.B. waehrend Upload laeuft). */
    disabled?: boolean;
}) {
    const [depth, setDepth] = useState(0);

    const matchesAccept = useCallback((file: File): boolean => {
        if (!accept || accept.length === 0) return true;
        return accept.some((pattern) => {
            if (pattern.endsWith('/*')) {
                const prefix = pattern.slice(0, -1); // 'image/'
                return file.type.startsWith(prefix);
            }
            return file.type === pattern;
        });
    }, [accept]);

    const onDragEnter = useCallback((e: DragEvent) => {
        if (disabled) return;
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        setDepth((d) => d + 1);
    }, [disabled]);

    const onDragOver = useCallback((e: DragEvent) => {
        if (disabled) return;
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    }, [disabled]);

    const onDragLeave = useCallback((e: DragEvent) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        setDepth((d) => Math.max(0, d - 1));
    }, [disabled]);

    const onDropEvent = useCallback((e: DragEvent) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        setDepth(0);
        const all = Array.from(e.dataTransfer.files ?? []);
        const filtered = all.filter(matchesAccept);
        if (filtered.length > 0) onDrop(filtered);
    }, [disabled, onDrop, matchesAccept]);

    return {
        isDragging: depth > 0,
        dragHandlers: {
            onDragEnter,
            onDragOver,
            onDragLeave,
            onDrop: onDropEvent,
        },
    };
}
