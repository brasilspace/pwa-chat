/**
 * <FileIcon> — rendert das passende DMS-Icon fuer eine Datei.
 *
 * Faellt auf das uebergebene `fallback`-Lucide-Icon zurueck wenn keine
 * Endung/MIME-Kombination matcht. So bleibt der visuelle Stil konsistent
 * (eckige SVGs der prilog-infra/docs/icons).
 */

import { type JSX, type ComponentType } from 'react';
import { File as FileLucide } from 'lucide-react';
import { getFileIcon } from './file-icons';
import { cn } from '@/lib/utils';

interface Props {
    fileName?: string | null;
    mimeType?: string | null;
    /** Icon-Groesse — kommt als CSS class. Default: size-4 */
    className?: string;
    /** Lucide-Fallback wenn nichts matcht. Default: File. */
    fallback?: ComponentType<{ className?: string }>;
}

export function FileIcon({ fileName, mimeType, className, fallback: Fallback = FileLucide }: Props): JSX.Element {
    const icon = getFileIcon(fileName, mimeType);
    if (!icon) return <Fallback className={cn('text-muted-foreground', className)} />;
    return (
        <img
            src={icon.url}
            alt={icon.label}
            title={icon.label}
            className={cn('object-contain', className)}
            draggable={false}
        />
    );
}
