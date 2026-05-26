import type { JSX } from 'react';
import { VisibilitySettings } from '../visibility-settings';

// Sichtbarkeit: Wrapper um die UserType-Matrix. Der Header steht schon im
// Component selbst, daher hier nur der Wrapper.
export function VisibilitySection(): JSX.Element {
    return <VisibilitySettings />;
}
