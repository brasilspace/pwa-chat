/**
 * HoermiProgressBar — Hoermi-spezifischer Wrapper um AudioGuideProgressBar.
 *
 * Liest den hoermiPlaybackStore, baut die Hub-Marker-Map auf und rendert
 * die generische ProgressBar absolute am unteren Header-Rand. Erscheint
 * nur, wenn der Hoermi-Player aktiv war.
 */

import { useSyncExternalStore, useMemo, type JSX } from 'react';
import { hoermiPlaybackStore } from './hoermi-playback-store';
import { HUB_ICONS, HUB_LABELS, type CueTarget } from './hoermi-cue-store';
import { AudioGuideProgressBar } from '../audio-guide/audio-guide-progress-bar';
import type { AudioGuideCue, AudioGuideMarkerMap } from '../audio-guide/audio-guide-types';

export function HoermiProgressBar(): JSX.Element | null {
    const state = useSyncExternalStore(hoermiPlaybackStore.subscribe, hoermiPlaybackStore.getSnapshot);

    // Marker-Map aus den globalen Hub-Icons + -Labels.
    const markers = useMemo<AudioGuideMarkerMap<CueTarget>>(() => {
        const map = {} as AudioGuideMarkerMap<CueTarget>;
        for (const k of Object.keys(HUB_ICONS) as CueTarget[]) {
            map[k] = { icon: HUB_ICONS[k], label: HUB_LABELS[k] };
        }
        return map;
    }, []);

    // Hoermi's HoermiCue ist strukturell kompatibel zu AudioGuideCue<CueTarget>
    // — nur das Feld heisst dort `hub` statt `key`. Wir mappen einmalig um.
    const cues = useMemo<AudioGuideCue<CueTarget>[]>(
        () => state.cues.map((c) => ({ at: c.at, duration: c.duration, key: c.hub })),
        [state.cues],
    );

    if (!state.active || !state.duration) return null;

    return (
        <AudioGuideProgressBar
            cues={cues}
            duration={state.duration}
            currentTime={state.currentTime}
            markers={markers}
            onSeek={state.seek ?? undefined}
        />
    );
}
