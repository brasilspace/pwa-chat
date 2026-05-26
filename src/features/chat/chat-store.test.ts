import { describe, it, expect, vi } from 'vitest';

// We test the emit behavior by importing the store and checking listener calls
// The store must notify listeners SYNCHRONOUSLY — requestAnimationFrame breaks
// useSyncExternalStore which relies on immediate notification.

describe('chat-store emit', () => {
    it('notifies listeners synchronously on setSyncState', async () => {
        // Dynamic import to get a fresh module
        const { chatStore } = await import('./chat-store');
        const listener = vi.fn();
        const unsub = chatStore.subscribe(listener);

        chatStore.setSyncState('syncing');

        // Must be called immediately, not deferred via rAF
        expect(listener).toHaveBeenCalledTimes(1);
        expect(chatStore.getSnapshot().syncState).toBe('syncing');

        unsub();
    });

    it('notifies listeners synchronously on applySync', async () => {
        const { chatStore } = await import('./chat-store');
        const listener = vi.fn();
        const unsub = chatStore.subscribe(listener);

        // Minimal valid sync response with one room
        chatStore.applySync({
            next_batch: 'test_batch_1',
            rooms: {
                join: {
                    '!test:example.com': {
                        timeline: {
                            events: [{
                                type: 'm.room.message',
                                event_id: '$evt1',
                                sender: '@user:example.com',
                                origin_server_ts: Date.now(),
                                content: { msgtype: 'm.text', body: 'hello' },
                            }],
                        },
                        state: { events: [] },
                        ephemeral: { events: [] },
                        unread_notifications: {},
                    },
                },
            },
        });

        // Listener must have been called (possibly multiple times from sub-updates)
        expect(listener).toHaveBeenCalled();

        // Room must have the message
        const room = chatStore.getRoomState('!test:example.com');
        expect(room.messages).toHaveLength(1);
        expect(room.messages[0].body).toBe('hello');

        unsub();
    });
});
