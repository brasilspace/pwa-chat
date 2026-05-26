/**
 * MaterialIcon — Wrapper um Google Material Symbols Rounded.
 *
 * Wir laden die Variable-Font-Variante in index.html. Der Browser rastert
 * die Glyphen mit Hinting → bei kleinen Groessen schaerfer als jedes
 * SVG-Icon.
 *
 * Verwendung: <MaterialIcon name="description" size={24} />
 *
 * Liste aller Icon-Namen: https://fonts.google.com/icons
 */

import { type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface Props {
    name: string;
    size?: number;
    /** 100..700, default 400 */
    weight?: number;
    /** 0 = outline, 1 = filled */
    fill?: 0 | 1;
    className?: string;
    title?: string;
    style?: CSSProperties;
    'aria-hidden'?: boolean;
}

export function MaterialIcon({
    name,
    size = 24,
    weight = 400,
    fill = 0,
    className,
    title,
    style,
    'aria-hidden': ariaHidden = true,
}: Props) {
    return (
        <span
            className={cn('material-symbols-rounded', className)}
            title={title}
            aria-hidden={ariaHidden}
            style={{
                fontSize: `${size}px`,
                fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
                ...style,
            }}
        >
            {name}
        </span>
    );
}
