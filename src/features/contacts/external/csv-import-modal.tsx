/**
 * CsvImportModal — Drei-Stufen-Wizard fuer CSV-Bulk-Import.
 *
 * 1. Datei waehlen (Drag-Drop oder Klick)
 * 2. Spalten-Mapping (Smart-Erkennung der Header)
 * 3. Resultate (created + errors)
 */

import { type JSX, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { externalContactsApi } from '@/gateways/platform/external-contacts-gateway';
import { toast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpaces } from '@/features/spaces/use-spaces';
import { sessionStore } from '@/core/session/session-store';
import { useT } from "@/lib/i18n/use-t";

interface UserTypeOption { key: string; label: string; audience?: string }

const FIELDS: { key: string; label: string; aliases: string[]; memberOnly?: boolean }[] = [
    { key: 'firstName', label: 'Vorname', aliases: ['vorname', 'first', 'firstname', 'first name', 'given', 'given name'] },
    { key: 'lastName', label: 'Nachname', aliases: ['nachname', 'last', 'lastname', 'last name', 'surname', 'family', 'family name'] },
    { key: 'fullName', label: 'Voller Name', aliases: ['name', 'fullname', 'full name', 'voller name', 'displayname', 'display name', 'anzeigename'] },
    { key: 'email', label: 'E-Mail', aliases: ['email', 'e-mail', 'mail', 'e_mail', 'emailadresse', 'e-mailadresse', 'email-adresse'] },
    { key: 'phone', label: 'Telefon', aliases: ['telefon', 'tel', 'phone', 'mobil', 'handy', 'mobilfunk', 'telefonnummer'] },
    { key: 'street', label: 'Straße', aliases: ['straße', 'strasse', 'street', 'address', 'adresse'] },
    { key: 'postalCode', label: 'PLZ', aliases: ['plz', 'postcode', 'postal', 'zip', 'postleitzahl', 'zip code'] },
    { key: 'city', label: 'Ort', aliases: ['ort', 'stadt', 'city', 'town'] },
    { key: 'country', label: 'Land', aliases: ['land', 'country', 'state'] },
    { key: 'organization', label: 'Organisation', aliases: ['organisation', 'firma', 'company', 'org', 'arbeitgeber', 'unternehmen'] },
    { key: 'notes', label: 'Notizen', aliases: ['notizen', 'notes', 'kommentar', 'memo', 'remark', 'bemerkung', 'bemerkungen'] },
    { key: 'birthDate', label: 'Geburtstag', aliases: ['geburtstag', 'geburtsdatum', 'birthday', 'birthdate', 'birth date', 'bday', 'geburt'] },
    { key: 'username', label: 'Benutzername (Login)', aliases: ['username', 'user name', 'login', 'benutzer', 'benutzername', 'nutzername', 'kuerzel', 'kürzel'], memberOnly: true },
    { key: 'password', label: 'Passwort (Initial)', aliases: ['password', 'passwort', 'pw', 'kennwort'], memberOnly: true },
    { key: 'expiresAt', label: 'Gültig bis', aliases: ['expiresat', 'expires at', 'gueltigbis', 'gültig bis', 'gueltig bis', 'gueltig_bis', 'valid until', 'expires', 'ablaufdatum', 'enddatum'], memberOnly: true },
    { key: 'admin', label: 'Admin (true/false)', aliases: ['admin', 'isadmin', 'administrator'], memberOnly: true },
];

const SCHOOL_TEMPLATES: { name: string; csv: string }[] = [
    {
        name: 'Lehrkräfte',
        csv: 'username;fullName;email;phone;birthDate;expiresAt;admin\nm.meyer;Maria Meyer;maria.meyer@schule.de;+49 171 123;1980-05-14;2027-07-31;false\nh.schmidt;Hans Schmidt;hans.schmidt@schule.de;;;2027-07-31;false',
    },
    {
        name: 'Klasse (Schüler)',
        csv: 'username;fullName;email;birthDate;expiresAt\nl.schueler;Leon Schüler;leon.schueler@schule.de;2010-09-01;2027-07-31\nm.muster;Mira Muster;mira.muster@schule.de;2010-11-15;2027-07-31',
    },
    {
        name: 'Eltern',
        csv: 'firstName;lastName;email;phone;street;postalCode;city\nFrau;Müller;mueller@example.de;+49 171;Hauptstr. 1;80000;München\nHerr;Schmidt;schmidt@example.de;;;Hauptstr. 2;80000;München',
    },
];

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    // Auto-detect delimiter — Komma ist Standard, aber DE-Excel exportiert oft mit Semikolon
    const candidate = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';

    const splitRow = (line: string): string[] => {
        const out: string[] = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if (ch === candidate && !inQ) {
                out.push(cur); cur = '';
            } else {
                cur += ch;
            }
        }
        out.push(cur);
        return out.map(s => s.trim());
    };

    const headers = splitRow(lines[0]);
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = splitRow(lines[i]);
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) row[headers[j]] = cells[j] ?? '';
        rows.push(row);
    }
    return { headers, rows };
}

/**
 * Header-Normalisierung fuer den Autodetect — fuer maximale Toleranz
 * bei Schul-CSVs aus Excel/Untis/etc.
 *
 * Schritte:
 *   - lowercase + trim
 *   - Klammer-Anhaengsel wie "(Login)" entfernen (Schul-Templates haben oft so was)
 *   - Umlaute normalisieren (ä→ae, ö→oe, ü→ue, ß→ss)
 *   - Diakritika strippen (é→e, ñ→n)
 *   - Sonderzeichen (außer Buchstaben/Ziffern/Leerzeichen) entfernen
 *   - Mehrfache Leerzeichen kollabieren
 */
function normalizeHeader(h: string): string {
    return h
        .toLowerCase()
        .trim()
        .replace(/\s*\(.*?\)\s*/g, ' ')
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function autoDetectMapping(headers: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const f of FIELDS) {
        const normalizedAliases = new Set(
            [...f.aliases, f.label].map(normalizeHeader),
        );
        const found = headers.find((h) => normalizedAliases.has(normalizeHeader(h)));
        if (found) result[f.key] = found;
    }
    return result;
}

type Stage = 'upload' | 'mapping' | 'done';
type Target = 'external' | 'member';

export function CsvImportModal({ onClose, onDone, defaultSpaceId }: {
    onClose: () => void; onDone: () => void; defaultSpaceId?: string;
}): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const { spaces } = useSpaces();
    const [stage, setStage] = useState<Stage>('upload');
    const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [target, setTarget] = useState<Target>(defaultSpaceId ? 'member' : 'external');
    const [kind, setKind] = useState<'person' | 'organization'>('person');
    const [visibility, setVisibility] = useState<'tenant' | 'private'>('tenant');
    const [targetSpaceId, setTargetSpaceId] = useState<string>(defaultSpaceId ?? '');
    const [defaultUserTypeKey, setDefaultUserTypeKey] = useState<string>('');
    const [userTypes, setUserTypes] = useState<UserTypeOption[]>([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ created: number; errors: { row: number; error: string }[]; raw?: unknown } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!jwt) return;
        fetch('/api/platform/v1/workspace/user-types', { headers: { Authorization: `Bearer ${jwt}` } })
            .then(r => r.ok ? r.json() : { userTypes: [] })
            .then((d: { userTypes: UserTypeOption[] }) => setUserTypes(d.userTypes ?? []))
            .catch(() => { });
    }, [jwt]);

    const sortedSpaces = spaces.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));

    const handleFile = async (file: File) => {
        try {
            const text = await file.text();
            const p = parseCsv(text);
            if (p.rows.length === 0) {
                toast.error('Keine Datenzeilen in der Datei');
                return;
            }
            setParsed(p);
            setMapping(autoDetectMapping(p.headers));
            setStage('mapping');
        } catch {
            toast.error('Datei konnte nicht gelesen werden');
        }
    };

    const handleImport = async () => {
        if (!parsed) return;
        setImporting(true);
        try {
            if (target === 'external') {
                const res = await externalContactsApi.importCsv({
                    rows: parsed.rows, mapping, kind, visibility,
                });
                setResult(res);
            } else {
                // Member-Import via /workspace/users/bulk-import
                const get = (row: Record<string, string>, k: string): string | undefined => {
                    const col = mapping[k];
                    return col ? (row[col]?.trim() || undefined) : undefined;
                };
                const users = parsed.rows.map((row) => {
                    const fullName = get(row, 'fullName') ?? `${get(row, 'firstName') ?? ''} ${get(row, 'lastName') ?? ''}`.trim();
                    return {
                        username: get(row, 'username') ?? '',
                        password: get(row, 'password'),
                        fullName,
                        email: get(row, 'email') ?? '',
                        phone: get(row, 'phone'),
                        street: get(row, 'street'),
                        postalCode: get(row, 'postalCode'),
                        city: get(row, 'city'),
                        country: get(row, 'country'),
                        birthDate: get(row, 'birthDate'),
                        expiresAt: get(row, 'expiresAt'),
                        admin: ['1', 'true', 'ja', 'yes'].includes((get(row, 'admin') ?? '').toLowerCase()),
                        userTypeKey: defaultUserTypeKey || undefined,
                        spaceId: targetSpaceId || undefined,
                    };
                });
                const session = (await import('@/core/session/session-store')).sessionStore.getSnapshot();
                const jwt = session.platform?.token;
                const r = await fetch('/api/platform/v1/workspace/users/bulk-import', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ users }),
                });
                if (!r.ok) throw new Error(await r.text());
                const data = await r.json() as {
                    imported: number; failed: number;
                    results: Array<{ username: string; ok: boolean; error?: string }>;
                };
                setResult({
                    created: data.imported,
                    errors: data.results.filter(r => !r.ok).map((r, i) => ({ row: i, error: `${r.username}: ${r.error ?? 'Fehler'}` })),
                });
            }
            setStage('done');
        } catch (e) {
            toast.error('Import fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-background shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                    <h2 className="text-sm font-semibold">{t('contacts.external.csv_import_modal.kontakte_importieren_csv')}</h2>
                    <button onClick={onClose} className="rounded p-1 hover:bg-muted"><MaterialIcon name="close" size={18} /></button>
                </div>

                <div className="overflow-y-auto p-4">
                    {stage === 'upload' && (
                        <div className="space-y-4">
                            {/* Target Toggle: External vs Member */}
                            <div>
                                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t('contacts.external.csv_import_modal.was_importieren')}</div>
                                <div className="flex gap-1 rounded-md bg-muted p-1">
                                    <button
                                        onClick={() => setTarget('external')}
                                        className={cn('flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs',
                                            target === 'external' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
                                    >
                                        <MaterialIcon name="contacts" size={14} className="size-3.5" />
                                        {t('contacts.external.csv_import_modal.externe_kontakte')}
                                    </button>
                                    <button
                                        onClick={() => setTarget('member')}
                                        className={cn('flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs',
                                            target === 'member' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
                                    >
                                        <MaterialIcon name="verified_user" size={14} className="size-3.5" />
                                        {t('contacts.external.csv_import_modal.mitglieder_mit_login')}
                                    </button>
                                </div>
                                {target === 'member' && (
                                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                                        {t('contacts.external.csv_import_modal.es_werden_logins_erstellt_matrix-account')} <code>username</code>, <code>fullName</code>, <code>email</code>.
                                    </p>
                                )}
                            </div>

                            {/* Ziel-Space + Benutzertyp — prominent, BEVOR die Datei hochgeladen wird */}
                            {target === 'member' && (
                                <div className={cn('rounded-md border p-3',
                                    targetSpaceId ? 'border-primary/40 bg-primary/5' : 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30')}>
                                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
                                        <MaterialIcon name={targetSpaceId ? 'check_circle' : 'tips_and_updates'}
                                            size={14} className={targetSpaceId ? 'text-primary' : 'text-amber-600'} />
                                        {targetSpaceId
                                            ? <>{t('contacts.external.csv_import_modal.mitglieder_werden_in')} <strong>{sortedSpaces.find(s => s.id === targetSpaceId)?.name}</strong> aufgenommen</>
                                            : 'Wohin sollen die Mitglieder?'}
                                    </div>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <label className="text-[11px]">
                                            <span className="text-muted-foreground">{t('contacts.external.csv_import_modal.ziel-space')}</span>
                                            <select value={targetSpaceId} onChange={e => setTargetSpaceId(e.target.value)}
                                                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs">
                                                <option value="">{t('contacts.external.csv_import_modal.kein_space_nur_user_anlegen')}</option>
                                                {sortedSpaces.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="text-[11px]">
                                            <span className="text-muted-foreground">{t('contacts.external.csv_import_modal.standard-benutzertyp')}</span>
                                            <select value={defaultUserTypeKey} onChange={e => setDefaultUserTypeKey(e.target.value)}
                                                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs">
                                                <option value="">{t('contacts.external.csv_import_modal.keiner')}</option>
                                                {userTypes.map(ut => (
                                                    <option key={ut.key} value={ut.key}>{ut.label}{ut.audience ? ` (${ut.audience})` : ''}</option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Upload-Bereich */}
                            <div
                                className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-10 text-center"
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                            >
                                <MaterialIcon name="upload_file" size={48} className="text-muted-foreground/40" />
                                <div>
                                    <p className="text-sm font-medium">{t('contacts.external.csv_import_modal.datei_hier_ablegen')}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">oder</p>
                                </div>
                                <input
                                    ref={inputRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                                />
                                <button onClick={() => inputRef.current?.click()}
                                    className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                                    {t('contacts.external.csv_import_modal.datei_auswaehlen')}
                                </button>
                                <p className="text-[10px] text-muted-foreground">
                                    {t('contacts.external.csv_import_modal.csv_mit_header-zeile_getrennt_mit_komma_')}
                                </p>
                            </div>

                            {/* Vorlagen */}
                            {target === 'member' && (
                                <div className="rounded-md border bg-muted/30 p-3">
                                    <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t('contacts.external.csv_import_modal.schul-vorlagen_herunterladen')}</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {SCHOOL_TEMPLATES.map(_t => (
                                            <button
                                                key={_t.name}
                                                type="button"
                                                onClick={() => {
                                                    const blob = new Blob([_t.csv], { type: 'text/csv' });
                                                    const a = document.createElement('a');
                                                    a.href = URL.createObjectURL(blob);
                                                    a.download = `vorlage_${_t.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`;
                                                    a.click();
                                                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                                                }}
                                                className="rounded border bg-background px-2 py-1 text-[11px] hover:bg-muted"
                                            >
                                                <MaterialIcon name="download" size={12} className="mr-1 inline-block size-3" />
                                                {_t.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {stage === 'mapping' && parsed && (
                        <div className="space-y-3">
                            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                                <strong>{parsed.rows.length}</strong> {t('contacts.external.csv_import_modal.zeilen_erkannt_mit')} {parsed.headers.length} {t('contacts.external.csv_import_modal.spalten_ordne_die_spalten_den_prilog-fel')}
                            </div>

                            {(() => {
                                // Pflichtfeld-Check: warne wenn Member-Pflichtfelder ungemappt
                                if (target !== 'member') return null;
                                const missing: string[] = [];
                                if (!mapping.username) missing.push('Benutzername');
                                if (!mapping.email) missing.push('E-Mail');
                                if (!mapping.fullName && (!mapping.firstName || !mapping.lastName)) {
                                    missing.push('Voller Name (oder Vorname + Nachname)');
                                }
                                if (missing.length === 0) return null;
                                return (
                                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-700 dark:bg-amber-950/30">
                                        <div className="font-medium text-amber-900 dark:text-amber-200">
                                            <MaterialIcon name="warning" size={13} className="-mt-0.5 mr-1 inline" />
                                            {t('contacts.external.csv_import_modal.missing_required_title', { defaultValue: 'Pflichtfelder nicht zugeordnet:' })}
                                        </div>
                                        <ul className="mt-1 list-disc pl-5 text-amber-900 dark:text-amber-200">
                                            {missing.map((m) => <li key={m}>{m}</li>)}
                                        </ul>
                                        <p className="mt-2 text-amber-800 dark:text-amber-300">
                                            {t('contacts.external.csv_import_modal.missing_required_hint', { defaultValue: 'Ohne diese Zuordnungen wird der Import 0 Datensätze anlegen. Wähle unten die passenden Spalten Deiner CSV.' })}
                                        </p>
                                    </div>
                                );
                            })()}

                            {target === 'external' && (
                                <div className="grid gap-2 md:grid-cols-2">
                                    <label className="text-xs">
                                        <span className="text-muted-foreground">{t('common.type')}</span>
                                        <select value={kind} onChange={e => setKind(e.target.value as 'person' | 'organization')}
                                            className="mt-0.5 w-full rounded border bg-background px-2 py-1 text-xs">
                                            <option value="person">{t('contacts.external.csv_import_modal.person')}</option>
                                            <option value="organization">{t('contacts.external.csv_import_modal.organisation')}</option>
                                        </select>
                                    </label>
                                    <label className="text-xs">
                                        <span className="text-muted-foreground">{t('contacts.external.csv_import_modal.sichtbarkeit')}</span>
                                        <select value={visibility} onChange={e => setVisibility(e.target.value as 'tenant' | 'private')}
                                            className="mt-0.5 w-full rounded border bg-background px-2 py-1 text-xs">
                                            <option value="tenant">{t('contacts.external.csv_import_modal.alle_im_tenant')}</option>
                                            <option value="private">{t('contacts.external.csv_import_modal.nur_ich')}</option>
                                        </select>
                                    </label>
                                </div>
                            )}

                            {target === 'member' && (targetSpaceId || defaultUserTypeKey) && (
                                <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px]">
                                    <MaterialIcon name="check_circle" size={14} className="mt-0.5 shrink-0 text-primary" />
                                    <div className="flex-1">
                                        {t('contacts.external.csv_import_modal.alle')} <strong>{parsed.rows.length}</strong> {t('common.members')}
                                        {targetSpaceId && <> {t('contacts.external.csv_import_modal.werden_in')} <strong>{sortedSpaces.find(s => s.id === targetSpaceId)?.name}</strong> aufgenommen</>}
                                        {targetSpaceId && defaultUserTypeKey && <> · </>}
                                        {defaultUserTypeKey && <>als <strong>{userTypes.find(u => u.key === defaultUserTypeKey)?.label}</strong></>}
                                        .
                                    </div>
                                    <button type="button" onClick={() => setStage('upload')}
                                        className="text-[10px] text-primary hover:underline">aendern</button>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                {FIELDS.filter(f => target === 'member' ? true : !f.memberOnly).map(f => (
                                    <div key={f.key} className="flex items-center gap-2 rounded border px-3 py-2">
                                        <span className="w-44 shrink-0 text-xs font-medium">{f.label}</span>
                                        <span className="text-muted-foreground">→</span>
                                        <select
                                            value={mapping[f.key] ?? ''}
                                            onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                                            className="flex-1 rounded border bg-background px-2 py-1 text-xs"
                                        >
                                            <option value="">{t('contacts.external.csv_import_modal.ignorieren')}</option>
                                            {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>

                            <details className="rounded border bg-muted/30 p-2 text-xs">
                                <summary className="cursor-pointer text-muted-foreground">{t('contacts.external.csv_import_modal.vorschau_erste_3_zeilen')}</summary>
                                <pre className="mt-2 overflow-x-auto text-[10px]">
                                    {JSON.stringify(parsed.rows.slice(0, 3), null, 2)}
                                </pre>
                            </details>
                        </div>
                    )}

                    {stage === 'done' && result && (
                        <div className="space-y-3">
                            <div className={cn('rounded-md p-3 text-sm',
                                result.errors.length === 0
                                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                                    : 'border border-amber-200 bg-amber-50 text-amber-900',
                            )}>
                                <strong>{result.created}</strong> {t('contacts.external.csv_import_modal.kontakte_erstellt')}
                                {result.errors.length > 0 && <span> {result.errors.length} {t('contacts.external.csv_import_modal.zeilen_uebersprungen')}</span>}
                            </div>
                            {result.errors.length > 0 && (
                                <details className="rounded border bg-muted/30 p-2 text-xs">
                                    <summary className="cursor-pointer text-muted-foreground">{t('contacts.external.csv_import_modal.fehler-details')}</summary>
                                    <ul className="mt-2 space-y-1">
                                        {result.errors.slice(0, 30).map((err, i) => (
                                            <li key={i}>{t('contacts.external.csv_import_modal.zeile')} {err.row + 2}: {err.error}</li>
                                        ))}
                                        {result.errors.length > 30 && <li>{t('contacts.external.csv_import_modal.und')} {result.errors.length - 30} weitere</li>}
                                    </ul>
                                </details>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t px-4 py-3">
                    {stage === 'mapping' && (
                        <button onClick={() => setStage('upload')} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
                            {t('contacts.external.csv_import_modal.zurueck')}
                        </button>
                    )}
                    {stage === 'mapping' && (
                        <button onClick={handleImport} disabled={importing}
                            className="flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {importing && <Loader2 className="size-3 animate-spin" />}
                            {t('contacts.external.csv_import_modal.importieren')}{parsed?.rows.length ?? 0})
                        </button>
                    )}
                    {stage === 'done' && (
                        <button onClick={() => { onDone(); }}
                            className="rounded-md bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                            {t('contacts.external.csv_import_modal.fertig')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
