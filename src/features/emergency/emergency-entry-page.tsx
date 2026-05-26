/**
 * EmergencyEntryPage — gewidmete URL fuer Schnellzugriff /notfall
 *
 * Zweck: Auslöser-Pattern fuer iOS-Shortcut, Android Quick-Tile,
 * Lockscreen-Bookmark. User landet hier → Panic-Picker oeffnet sofort.
 * Direkt danach Redirect auf "/" damit die URL nicht in der History bleibt.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { openPanic } from './panic-button';
import { useEnabledModules } from '@/core/permissions';

export function EmergencyEntryPage() {
    const navigate = useNavigate();
    const crisisAppEnabled = useEnabledModules().has('crisis-management');

    useEffect(() => {
        if (crisisAppEnabled) openPanic();
        navigate('/', { replace: true });
    }, [navigate, crisisAppEnabled]);

    return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {crisisAppEnabled ? 'Notfall wird geöffnet …' : 'Krisenmanagement-App ist nicht aktiviert.'}
        </div>
    );
}
