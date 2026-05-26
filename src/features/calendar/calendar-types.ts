export interface CalendarLayer {
    id: string;
    tenantId: string;
    spaceId: string | null;
    userId: string | null;
    level: number;
    name: string;
    color: string;
    isPublic: boolean;
    publicToken: string | null;
    eventCount: number;
    subscribed: boolean;
    isConcept?: boolean;
    createdAt: string;
}

export interface CalendarEvent {
    id: string;
    layerId: string;
    tenantId: string;
    uid: string;
    title: string;
    description: string | null;
    location: string | null;
    dtstart: string;
    dtend: string | null;
    allDay: boolean;
    rrule: string | null;
    exdates: string[];
    status: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
    transparency: string;
    color: string | null;
    categories: string[];
    organizerId: string;
    attendees: string[];
    version: number;
    createdAt: string;
    updatedAt: string;
    layer: {
        color: string;
        name: string;
        level: number;
    };
}
