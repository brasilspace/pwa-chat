/**
 * Shared Editor-Header — wird im Logik-Designer (flows-editor) und im
 * Anleitungs-Designer (guide-editor) verwendet, damit beide identischen
 * Look & Feel haben.
 *
 * Bestandteile:
 *  - TemplateHeaderEdit: Inline-Edit fuer Name + Status-Badge mit Dropdown
 *  - StatusBadge:        Pill mit draft|active|archived + Dropdown
 *  - TemplateActionsMenu: ⋮ Menu fuer Duplizieren / Neue Version / Export
 *
 * Convention: alle Komponenten brauchen jwt + template + onUpdated.
 */

import { useEffect, useState, type JSX } from 'react';
import { Edit2, Check, Copy, Download, GitFork, MoreVertical, Home } from 'lucide-react';
import { toast } from '../../components/ui/toast';
import { flowsGateway, type ProcessTemplate } from './flows-gateway';
import { useT } from "@/lib/i18n/use-t";

// ─── TemplateHeaderEdit — Inline-Edit fuer Name + Status ────────────────────

export function TemplateHeaderEdit({
    template, subtitle, jwt, onUpdated,
}: {
    template: ProcessTemplate;
    /** Optionaler Subtitle unterhalb des Names (z.B. "5 Bildschirme · 12 Edges"). */
    subtitle?: string;
    jwt: string;
    onUpdated: (t: ProcessTemplate) => void;
}): JSX.Element {
    const t = useT();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(template.name);
    const [saving, setSaving] = useState(false);

    useEffect(() => { setName(template.name); }, [template]);

    const save = async () => {
        if (!name.trim() || name === template.name) {
            setEditing(false);
            setName(template.name);
            return;
        }
        setSaving(true);
        try {
            const r = await flowsGateway.updateTemplate(jwt, template.id, { name: name.trim() });
            onUpdated(r.template);
            toast.success('Name gespeichert');
        } catch (err) {
            toast.error('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
            setName(template.name);
        } finally {
            setSaving(false);
            setEditing(false);
        }
    };

    const handleStatusChange = async (status: 'draft' | 'active' | 'archived') => {
        if (status === template.status) return;
        try {
            const r = await flowsGateway.updateTemplate(jwt, template.id, { status });
            onUpdated(r.template);
            toast.success(`Status: ${t(STATUS_LABEL_KEYS[status])}`);
        } catch (err) {
            toast.error('Status-Wechsel fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    return (
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                {editing ? (
                    <div className="flex items-center gap-1 flex-1">
                        <input
                            autoFocus
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') void save();
                                if (e.key === 'Escape') { setEditing(false); setName(template.name); }
                            }}
                            onBlur={() => void save()}
                            className="font-semibold px-2 py-0.5 border border-blue-400 rounded text-sm flex-1"
                            disabled={saving}
                        />
                        <button onClick={() => void save()} className="p-1 text-blue-600">
                            <Check size={14} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setEditing(true)}
                        className="group flex items-center gap-1 text-left"
                        title={t('flows.editor_header_shared.klicken_zum_umbenennen')}
                    >
                        <span className="font-semibold">{template.name}</span>
                        <Edit2 size={12} className="text-gray-300 group-hover:text-gray-500" />
                    </button>
                )}
                <StatusBadge currentStatus={template.status} onChange={handleStatusChange} />
            </div>
            {subtitle && (
                <div className="text-xs text-gray-500 truncate">{subtitle}</div>
            )}
        </div>
    );
}

// ─── StatusBadge — Pill mit Dropdown ────────────────────────────────────────

const STATUS_LABEL_KEYS: Record<string, string> = {
    draft: 'app.misc.entwurf',
    active: 'common.active',
    archived: 'app.misc.archiviert',
};

const STATUS_STYLES: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    active: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
    archived: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
};

export function StatusBadge({ currentStatus, onChange }: { currentStatus: string; onChange: (s: 'draft' | 'active' | 'archived') => void }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const cls = STATUS_STYLES[currentStatus] ?? 'bg-gray-100 text-gray-700';
    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                onBlur={() => setTimeout(() => setOpen(false), 100)}
                className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${cls}`}
            >
                {STATUS_LABEL_KEYS[currentStatus] ? t(STATUS_LABEL_KEYS[currentStatus]) : currentStatus}
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                    {(['draft', 'active', 'archived'] as const).map(s => (
                        <button
                            key={s}
                            onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); }}
                            className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${s === currentStatus ? 'font-semibold' : ''}`}
                        >
                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${s === 'draft' ? 'bg-gray-400' : s === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {t(STATUS_LABEL_KEYS[s])}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── TemplateActionsMenu — ⋮ fuer Duplizieren / Neue Version / Export ──────

export function TemplateActionsMenu({
    jwt, template, onUpdated, navigate,
}: {
    jwt: string;
    template: ProcessTemplate;
    onUpdated: (t: ProcessTemplate) => void;
    navigate: (path: string) => void;
}) {
    const t = useT();
    const [open, setOpen] = useState(false);

    const handleClone = async () => {
        setOpen(false);
        try {
            const r = await flowsGateway.cloneTemplate(jwt, template.id);
            toast.success('Kopie angelegt');
            navigate(`/flows/${r.template.id}`);
        } catch (err) {
            toast.error('Kopieren fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    const handleNewVersion = async () => {
        setOpen(false);
        if (!confirm(`Neue Version v${template.version + 1} anlegen?\nDie aktuelle Version wird auf "archiviert" gesetzt.`)) return;
        try {
            const r = await flowsGateway.cloneTemplate(jwt, template.id, { name: template.name, bumpVersion: true });
            await flowsGateway.updateTemplate(jwt, template.id, { status: 'archived' });
            toast.success(`v${r.template.version} angelegt`);
            navigate(`/flows/${r.template.id}`);
            void onUpdated;
        } catch (err) {
            toast.error('Neue Version fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    const handleToggleDashboard = async () => {
        setOpen(false);
        const next = !template.showOnDashboard;
        try {
            const r = await flowsGateway.updateTemplate(jwt, template.id, { showOnDashboard: next });
            onUpdated(r.template);
            toast.success(next ? 'Auf Startseite angezeigt' : 'Von Startseite entfernt');
        } catch (err) {
            toast.error('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    const handleExport = async () => {
        setOpen(false);
        try {
            const { blob, filename } = await flowsGateway.exportTemplate(jwt, template.id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success(`Exportiert: ${filename}`);
        } catch (err) {
            toast.error('Export fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                className="px-2 py-1.5 border border-gray-300 hover:bg-gray-100 rounded-lg text-sm flex items-center"
                title={t('flows.editor_header_shared.mehr')}
            >
                <MoreVertical size={14} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[200px] overflow-hidden">
                    <button onMouseDown={(e) => { e.preventDefault(); void handleClone(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                        <Copy size={14} /> {t('flows.editor_header_shared.duplizieren')}
                    </button>
                    <button onMouseDown={(e) => { e.preventDefault(); void handleNewVersion(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                        <GitFork size={14} /> {t('flows.editor_header_shared.neue_version_v')}{template.version + 1})
                    </button>
                    <button onMouseDown={(e) => { e.preventDefault(); void handleToggleDashboard(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100">
                        <Home size={14} /> {template.showOnDashboard ? 'Von Startseite entfernen' : 'Auf Startseite anzeigen'}
                    </button>
                    <button onMouseDown={(e) => { e.preventDefault(); void handleExport(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100">
                        <Download size={14} /> {t('flows.editor_header_shared.exportieren_json')}
                    </button>
                </div>
            )}
        </div>
    );
}
