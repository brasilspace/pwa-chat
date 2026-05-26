/**
 * MessengerShell — Vereinfachtes Layout fuer Eltern und Schueler.
 *
 * Statt Workspace mit Sidebar/Hubs/Tabs zeigt der Messenger:
 * - Flache Space-Liste mit Previews und Badges
 * - Vollbild-Chat beim Tap auf einen Space
 * - Abwesenheit-melden als Top-Level-Aktion
 * - Minimale Einstellungen
 *
 * Die Entscheidung ob Messenger oder Workspace gerendert wird
 * trifft App.tsx basierend auf der Visibility-Matrix.
 */

import { type JSX, useState, useSyncExternalStore, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { sessionMachine } from '@/core/session/session-machine';
import { useSpaces } from '@/features/spaces/use-spaces';
import { useWorkflowEvents } from '@/features/workflow/use-workflow-events';
import { PaymentSuspensionBanner } from '@/features/payment/payment-suspension-banner';
import { cn } from '@/lib/utils';
import { Settings } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from "@/lib/i18n/use-t";

const LazyChatModule = lazy(() =>
    import('../modules/chat-module').then(m => ({ default: m.ChatModule })),
);
const LazySettings = lazy(() =>
    import('../settings/settings-page').then(m => ({ default: m.SettingsPage })),
);

// ─── Space-Liste ────────────────────────────────────────────────────────────

function MessengerSpaceList(): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const { spaces, loading } = useSpaces();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);

    return (
        <div className="flex h-full flex-col bg-background">
            {/* Header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
                <div>
                    <span className="text-base font-semibold">
                        <span className="text-foreground">{t('messenger.messenger_shell.prilog')}</span>
                        <span className="text-primary">team</span>
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => navigate('/settings')}
                        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MaterialIcon name="settings" size={16} className="size-4" />
                    </button>
                    <button onClick={() => sessionMachine.logout()}
                        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MaterialIcon name="logout" size={16} className="size-4" />
                    </button>
                </div>
            </div>

            <PaymentSuspensionBanner />

            {/* Abwesenheit melden */}
            <button
                onClick={() => navigate('/absence-report')}
                className="mx-4 mt-3 flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-600 transition-colors"
            >
                <MaterialIcon name="person_off" size={16} className="size-4" />
                {t('messenger.messenger_shell.kind_abwesend_melden')}
            </button>

            {/* Space-Liste */}
            <div className="flex-1 overflow-y-auto mt-3">
                {loading ? (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">{t('messenger.messenger_shell.laden')}</div>
                ) : spaces.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <MaterialIcon name="chat" size={16} className="size-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground">{t('messenger.messenger_shell.noch_keine_spaces')}</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">{t('messenger.messenger_shell.sie_werden_eingeladen_sobald_ihre_einric')}</p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {spaces.map(space => (
                            <button
                                key={space.id}
                                onClick={() => navigate(`/spaces/${space.id}/chat`)}
                                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors"
                            >
                                <div
                                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                                    style={{ backgroundColor: space.color || '#6366f1' }}
                                >
                                    {space.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium truncate">{space.name}</span>
                                    </div>
                                    {space.description && (
                                        <p className="text-xs text-muted-foreground truncate mt-0.5">{space.description}</p>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Messenger Chat (Vollbild) ──────────────────────────────────────────────

function MessengerChat(): JSX.Element {
    const t = useT();
    const { spaceId } = useParams<{ spaceId: string }>();
    const navigate = useNavigate();
    const { spaces } = useSpaces();
    const space = spaces.find(s => s.id === spaceId);

    return (
        <div className="flex h-full flex-col bg-background">
            {/* Header mit Zurueck-Button */}
            <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
                <button
                    onClick={() => navigate('/')}
                    className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <MaterialIcon name="chevron_left" size={16} className="size-5" />
                </button>
                {space && (
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div
                            className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                            style={{ backgroundColor: space.color || '#6366f1' }}
                        >
                            {space.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold truncate">{space.name}</span>
                    </div>
                )}
            </div>

            {/* Chat Vollbild */}
            <div className="flex-1 min-h-0">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-muted-foreground">{t('messenger.messenger_shell.laden')}</div>}>
                    <LazyChatModule compact />
                </Suspense>
            </div>
        </div>
    );
}

// ─── Messenger Settings (minimal) ───────────────────────────────────────────

function MessengerSettingsPage(): JSX.Element {
    const t = useT();
    const navigate = useNavigate();

    return (
        <div className="flex h-full flex-col bg-background">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
                <button onClick={() => navigate('/')}
                    className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                    <MaterialIcon name="chevron_left" size={16} className="size-5" />
                </button>
                <span className="text-sm font-semibold">{t('messenger.messenger_shell.einstellungen')}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
                <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">{t('messenger.messenger_shell.laden')}</div>}>
                    <LazySettings />
                </Suspense>
            </div>
        </div>
    );
}

// ─── Messenger Shell (Routing) ──────────────────────────────────────────────

// ─── Abwesenheit melden (Vollbild) ──────────────────────────────────────────

function MessengerAbsenceReport(): JSX.Element {
    const t = useT();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [name, setName] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('sick');
    const [reasonText, setReasonText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    const REASONS = [
        { key: 'sick', label: 'Krank' },
        { key: 'family', label: 'Familiaer' },
        { key: 'appointment', label: 'Arzttermin' },
        { key: 'other', label: 'Sonstiges' },
    ];

    const handleSubmit = async () => {
        if (!jwt || !name.trim()) return;
        setSubmitting(true);
        try {
            await fetch('/api/platform/v1/absences', {
                method: 'POST',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentUserId: `@${name.toLowerCase().replace(/\s+/g, '-')}:prilog`,
                    studentName: name.trim(),
                    date, endDate: endDate || null,
                    reason, reasonText: reasonText.trim() || null,
                }),
            });
            setDone(true);
        } finally { setSubmitting(false); }
    };

    return (
        <div className="flex h-full flex-col bg-background">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
                <button onClick={() => navigate('/')}
                    className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                    <MaterialIcon name="chevron_left" size={16} className="size-5" />
                </button>
                <span className="text-sm font-semibold">{t('messenger.messenger_shell.kind_abwesend_melden')}</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
                {done ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-4">
                            <MaterialIcon name="person_off" size={16} className="size-7 text-emerald-600" />
                        </div>
                        <h2 className="text-lg font-semibold">{t('messenger.messenger_shell.abwesenheit_gemeldet')}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{t('messenger.messenger_shell.die_klassenlehrerin_wird_benachrichtigt')}</p>
                        <button onClick={() => navigate('/')}
                            className="mt-6 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                            {t('messenger.messenger_shell.zurueck')}
                        </button>
                    </div>
                ) : (
                    <div className="max-w-md mx-auto space-y-4">
                        <div>
                            <label className="text-sm font-medium">{t('messenger.messenger_shell.name_des_kindes')}</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('messenger.messenger_shell.vor-_und_nachname')}
                                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" autoFocus />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm font-medium">{t('messenger.messenger_shell.von')}</label>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                                    className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
                            </div>
                            <div>
                                <label className="text-sm font-medium">{t('messenger.messenger_shell.bis_optional')}</label>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                                    className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium">{t('messenger.messenger_shell.grund')}</label>
                            <div className="mt-1 flex flex-wrap gap-2">
                                {REASONS.map(r => (
                                    <button key={r.key} onClick={() => setReason(r.key)}
                                        className={cn('rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-colors',
                                            reason === r.key ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30')}>
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium">{t('messenger.messenger_shell.anmerkung_optional')}</label>
                            <input type="text" value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder={t('messenger.messenger_shell.zb_ab_11_uhr_wieder_da')}
                                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
                        </div>

                        <button onClick={handleSubmit} disabled={!name.trim() || submitting}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50">
                            <MaterialIcon name="person_off" size={16} className="size-4" />{submitting ? 'Wird gemeldet...' : 'Abwesenheit melden'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export function MessengerShell(): JSX.Element {
    return (
        <div className="h-dvh w-full">
            <Routes>
                <Route index element={<MessengerSpaceList />} />
                <Route path="spaces/:spaceId/*" element={<MessengerChat />} />
                <Route path="settings" element={<MessengerSettingsPage />} />
                <Route path="absence-report" element={<MessengerAbsenceReport />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}
