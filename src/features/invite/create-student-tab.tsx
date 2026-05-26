/**
 * CreateStudentTab — Schüler direkt anlegen (ohne Email).
 *
 * Name eingeben → Backend generiert Username + Passwort → QR-Code anzeigen.
 * QR enthält die Login-URL mit Credentials. Druckbare Zugangskarte.
 */

import { type JSX, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import QRCode from 'qrcode';
import { useT } from "@/lib/i18n/use-t";

interface CreatedStudent {
    fullName: string;
    username: string;
    password: string;
    loginUrl: string;
    qrDataUrl: string;
}

export function CreateStudentTab(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [fullName, setFullName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [students, setStudents] = useState<CreatedStudent[]>([]);

    // UserType "Schueler" finden
    const [studentTypeId, setStudentTypeId] = useState<string | null>(null);
    useEffect(() => {
        if (!jwt) return;
        fetch('/api/platform/v1/user-types', { headers: { Authorization: `Bearer ${jwt}` } })
            .then(r => r.json())
            .then(d => {
                const types = d.userTypes ?? [];
                const student = types.find((_t: { key: string }) =>
                    _t.key.toLowerCase().includes('schüler') || _t.key.toLowerCase().includes('schueler') || _t.key.toLowerCase().includes('student')
                );
                if (student) setStudentTypeId(student.id);
            })
            .catch(() => { });
    }, [jwt]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!jwt || !fullName.trim() || saving) return;

        setSaving(true);
        setError('');

        try {
            const res = await fetch('/api/platform/v1/users/create-direct', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fullName: fullName.trim(),
                    userTypeId: studentTypeId ?? undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error ?? 'Fehler beim Anlegen.');
                return;
            }

            // QR-Code generieren
            const qrContent = `${data.user.loginUrl}\nBenutzer: ${data.user.username}\nPasswort: ${data.user.password}`;
            const qrDataUrl = await QRCode.toDataURL(qrContent, {
                width: 200,
                margin: 1,
                color: { dark: '#000000', light: '#ffffff' },
            });

            setStudents(prev => [{
                fullName: data.user.fullName,
                username: data.user.username,
                password: data.user.password,
                loginUrl: data.user.loginUrl,
                qrDataUrl,
            }, ...prev]);

            setFullName('');
        } catch {
            setError('Verbindung fehlgeschlagen.');
        } finally {
            setSaving(false);
        }
    }

    function handlePrint(student: CreatedStudent) {
        const printWindow = window.open('', '_blank', 'width=400,height=500');
        if (!printWindow) return;
        printWindow.document.write(`
            <html>
            <head><title>Zugangskarte - ${student.fullName}</title></head>
            <body style="font-family:-apple-system,sans-serif;padding:24px;text-align:center;max-width:350px;margin:0 auto">
                <h2 style="margin:0 0 4px">${student.fullName}</h2>
                <p style="color:#666;margin:0 0 16px;font-size:13px">Deine Prilog-Zugangsdaten</p>
                <img src="${student.qrDataUrl}" style="width:180px;height:180px;margin:0 auto 16px" />
                <div style="text-align:left;background:#f5f5f5;border-radius:8px;padding:12px 16px;font-size:14px">
                    <div style="margin-bottom:6px"><strong>Adresse:</strong> ${student.loginUrl}</div>
                    <div style="margin-bottom:6px"><strong>Benutzer:</strong> <code>${student.username}</code></div>
                    <div><strong>Passwort:</strong> <code>${student.password}</code></div>
                </div>
                <p style="color:#999;font-size:11px;margin-top:16px">Bitte bewahre diese Karte sicher auf.</p>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
                {t('invite.create_student_tab.schueler-konto_direkt_anlegen_benutzerna')}
            </p>

            <form onSubmit={handleCreate} className="flex gap-3">
                <div className="flex-1">
                    <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={t('invite.create_student_tab.vor-_und_nachname')}
                        autoFocus
                        maxLength={255}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                <button
                    type="submit"
                    disabled={!fullName.trim() || saving}
                    className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <MaterialIcon name="person_add" size={16} className="size-4" />}
                    {t('invite.create_student_tab.anlegen')}
                </button>
            </form>

            {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}

            {/* Angelegte Schüler */}
            {students.map((s, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-5">
                    <div className="flex gap-4">
                        <img src={s.qrDataUrl} alt={t('invite.create_student_tab.qr-code')} className="size-32 shrink-0 rounded-lg" />
                        <div className="min-w-0 flex-1">
                            <h3 className="text-base font-semibold">{s.fullName}</h3>
                            <dl className="mt-2 space-y-1 text-sm">
                                <div className="flex gap-2">
                                    <dt className="text-muted-foreground shrink-0">{t('invite.create_student_tab.benutzer')}</dt>
                                    <dd className="font-mono font-medium">{s.username}</dd>
                                </div>
                                <div className="flex gap-2">
                                    <dt className="text-muted-foreground shrink-0">{t('invite.create_student_tab.passwort')}</dt>
                                    <dd className="font-mono font-medium">{s.password}</dd>
                                </div>
                                <div className="flex gap-2">
                                    <dt className="text-muted-foreground shrink-0">{t('invite.create_student_tab.login')}</dt>
                                    <dd className="truncate text-xs text-muted-foreground">{s.loginUrl}</dd>
                                </div>
                            </dl>
                            <button
                                onClick={() => handlePrint(s)}
                                className="mt-3 flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                            >
                                <MaterialIcon name="print" size={16} className="size-3.5" />
                                {t('invite.create_student_tab.zugangskarte_drucken')}
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
