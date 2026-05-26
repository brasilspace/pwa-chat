import { type JSX, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { MaterialIcon } from '@/components/ui/material-icon';

interface Toast {
    id: string;
    message: string;
    type: 'error' | 'success';
}

const listeners = new Set<() => void>();
let toasts: Toast[] = [];
let counter = 0;

function emit() {
    for (const fn of listeners) fn();
}

export const toast = {
    error(message: string) {
        const id = String(++counter);
        toasts = [...toasts, { id, message, type: 'error' }];
        emit();
        setTimeout(() => { toasts = toasts.filter(t => t.id !== id); emit(); }, 5000);
    },
    success(message: string) {
        const id = String(++counter);
        toasts = [...toasts, { id, message, type: 'success' }];
        emit();
        setTimeout(() => { toasts = toasts.filter(t => t.id !== id); emit(); }, 3000);
    },
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    getSnapshot(): Toast[] {
        return toasts;
    },
};

export function ToastContainer(): JSX.Element {
    const [items, setItems] = useState<Toast[]>([]);

    useEffect(() => {
        const unsub = toast.subscribe(() => setItems([...toast.getSnapshot()]));
        return unsub;
    }, []);

    if (items.length === 0) return <></>;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            {items.map(t => (
                <div key={t.id} className={cn(
                    'flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-right',
                    t.type === 'error' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
                )}>
                    {t.type === 'error' ? <MaterialIcon name="error" size={16} className="size-4 shrink-0" /> : <MaterialIcon name="check_circle" size={16} className="size-4 shrink-0" />}
                    <span className="text-sm">{t.message}</span>
                    <button onClick={() => { toasts = toasts.filter(x => x.id !== t.id); emit(); }}
                        className="ml-2 shrink-0 text-muted-foreground hover:text-foreground">
                        <MaterialIcon name="close" size={16} className="size-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
}
