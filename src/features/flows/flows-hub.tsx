/**
 * FlowsHub — Liste aller Process-Templates des Tenants (Phase 5).
 *
 * Zeigt alle Templates aller appKinds. "Neuer Flow" oeffnet ein Modal mit
 * Name + appKind-Picker.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { sessionStore } from '../../core/session/session-store';
import { toast } from '../../components/ui/toast';
import { flowsGateway, type ProcessTemplate, type AppKind } from './flows-gateway';
import { audioGuideApi, type AudioGuideListItem } from '../audio-guide/use-audio-guide';
import { AudioGuidePickerDialog } from '../../components/editor/audio-guide-picker-dialog';
import { useT } from "@/lib/i18n/use-t";

const APP_KIND_LABELS: Record<AppKind, string> = {
    flow: 'Logik',
    concept: 'Konzept',
    crisis: 'Krise',
    n8n: 'n8n',
    custom: 'Custom',
    guide: 'Anleitung',
};

const APP_KIND_BADGE_COLORS: Record<AppKind, string> = {
    flow: 'bg-blue-100 text-blue-700',
    concept: 'bg-emerald-100 text-emerald-700',
    crisis: 'bg-red-100 text-red-700',
    n8n: 'bg-purple-100 text-purple-700',
    custom: 'bg-gray-100 text-gray-700',
    guide: 'bg-emerald-100 text-emerald-700',
};

export function FlowsHub() {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();

    const [templates, setTemplates] = useState<ProcessTemplate[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [showImport, setShowImport] = useState(false);

    // AudioGuides — Doku-mit-Cues, im selben Hub gelistet damit
    // User keine zweite "kreative Ecke" suchen muessen.
    const [audioGuides, setAudioGuides] = useState<AudioGuideListItem[] | null>(null);
    const [showAudioPicker, setShowAudioPicker] = useState(false);

    useEffect(() => {
        if (!jwt) return;
        flowsGateway.listTemplates(jwt)
            .then(r => setTemplates(r.templates))
            .catch(err => setError(err instanceof Error ? err.message : String(err)));
        audioGuideApi.list(jwt)
            .then(r => setAudioGuides(r.audioGuides))
            .catch(() => setAudioGuides([])); // still rendern, leere Liste
    }, [jwt]);

    // Soft-Delete: Status auf 'archived'. Flow bleibt in der Liste, sichtbar als
    // archiviert. Bereits archivierte Flows koennen mit erneutem Klick endgueltig
    // weg — mit deutlichem Hinweis, dass dann auch die Audit-Daten verloren sind.
    const handleDelete = async (tpl: ProcessTemplate) => {
        if (!jwt) return;
        if (tpl.status !== 'archived') {
            if (!confirm(`"${tpl.name}" archivieren?\n\nDer Flow wird ausgeblendet. Audit-Daten und gelaufene Instanzen bleiben erhalten. Reaktivieren ist jederzeit moeglich.`)) return;
            try {
                await flowsGateway.deleteTemplate(jwt, tpl.id);
                setTemplates(_t => _t?.map(x => x.id === tpl.id ? { ...x, status: 'archived' as const, showOnDashboard: false } : x) ?? null);
                toast.success('Flow archiviert');
            } catch (err) {
                toast.error('Archivieren fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
            }
            return;
        }
        // Bereits archiviert -> endgueltige Loeschung anbieten
        if (!confirm(`"${tpl.name}" ENDGUELTIG loeschen?\n\nAlle gelaufenen Instanzen, Audit-Events und der Flow selbst werden geloescht. Nicht umkehrbar.`)) return;
        try {
            await flowsGateway.hardDeleteTemplate(jwt, tpl.id);
            setTemplates(_t => _t?.filter(x => x.id !== tpl.id) ?? null);
            toast.success('Flow endgueltig geloescht');
        } catch (err) {
            toast.error('Loeschen fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    // Reaktivieren: archivierten Flow wieder auf 'draft' setzen
    const handleRestore = async (tpl: ProcessTemplate) => {
        if (!jwt) return;
        try {
            const r = await flowsGateway.updateTemplate(jwt, tpl.id, { status: 'draft' });
            setTemplates(_t => _t?.map(x => x.id === tpl.id ? r.template : x) ?? null);
            toast.success('Flow reaktiviert');
        } catch (err) {
            toast.error('Reaktivieren fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    const handleClone = async (id: string) => {
        if (!jwt) return;
        try {
            const r = await flowsGateway.cloneTemplate(jwt, id);
            setTemplates(_t => [r.template, ...(_t ?? [])]);
            toast.success(`Kopiert: ${r.template.name}`);
        } catch (err) {
            toast.error('Kopieren fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <MaterialIcon name="schema" size={28} className="text-blue-600" />
                        {t('flows.flows_hub.flows')}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {t('flows.flows_hub.eigene_workflows_trigger_aktion_ergebnis')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('/settings/plugins')}
                        className="px-3 py-2 border border-blue-300 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-2 text-sm text-blue-700"
                    >
                        {t('flows.flows_hub.plugin-store')}
                    </button>
                    <button
                        onClick={() => setShowImport(true)}
                        title={t('common.import')}
                        aria-label={t('common.import')}
                        className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <MaterialIcon name="upload" size={16} />
                    </button>
                    <button
                        onClick={() => setShowCreate(true)}
                        title={t('flows.flows_hub.neu')}
                        aria-label={t('flows.flows_hub.neu')}
                        className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        <MaterialIcon name="add" size={18} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                </div>
            )}

            {templates === null && !error && (
                <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 size={24} className="animate-spin" />
                </div>
            )}

            {templates && templates.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
                    <MaterialIcon name="schema" size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">{t('flows.flows_hub.noch_keine_flows_klick_quotneuer_flowquo')}</p>
                </div>
            )}

            {templates && templates.length > 0 && (
                <div className="grid gap-3">
                    {templates.map(tpl => (
                        <div
                            key={tpl.id}
                            className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow flex items-center gap-4"
                        >
                            <button
                                onClick={() => navigate(`/flows/${tpl.id}`)}
                                className="flex-1 text-left"
                            >
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="font-medium">{tpl.name}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${APP_KIND_BADGE_COLORS[tpl.appKind]}`}>
                                        {APP_KIND_LABELS[tpl.appKind]}
                                    </span>
                                    {tpl.status !== 'active' && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                            {tpl.status}
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-400">v{tpl.version}</span>
                                </div>
                                {tpl.description && (
                                    <div className="text-sm text-gray-500">{tpl.description}</div>
                                )}
                            </button>
                            <button
                                onClick={() => handleClone(tpl.id)}
                                className="p-2 text-gray-400 hover:text-blue-600"
                                title={t('flows.flows_hub.duplizieren')}
                            >
                                <MaterialIcon name="content_copy" size={16} />
                            </button>
                            {tpl.status === 'archived' && (
                                <button
                                    onClick={() => handleRestore(tpl)}
                                    className="p-2 text-gray-400 hover:text-emerald-600"
                                    title={t('flows.flows_hub.reaktivieren')}
                                >
                                    <MaterialIcon name="restart_alt" size={16} />
                                </button>
                            )}
                            <button
                                onClick={() => handleDelete(tpl)}
                                className="p-2 text-gray-400 hover:text-red-600"
                                title={tpl.status === 'archived' ? 'Endgueltig loeschen' : 'Archivieren'}
                            >
                                <MaterialIcon name="delete" size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── AudioGuides ────────────────────────────────────────── */}
            <div className="mt-10">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <MaterialIcon name="headphones" size={20} className="text-emerald-600" />
                            {t('flows.flows_hub.audioguides')}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            {t('flows.flows_hub.audio-dateien_mit_zeitmarken_hoermi-styl')}
                        </p>
                    </div>
                    <button
                        onClick={() => setShowAudioPicker(true)}
                        title={t('flows.flows_hub.neu')}
                        aria-label={t('flows.flows_hub.neu')}
                        className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        <MaterialIcon name="add" size={18} />
                    </button>
                </div>

                {audioGuides === null && (
                    <div className="flex items-center justify-center py-6 text-gray-400">
                        <Loader2 size={20} className="animate-spin" />
                    </div>
                )}

                {audioGuides && audioGuides.length === 0 && (
                    <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
                        <MaterialIcon name="headphones" size={36} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500 text-sm">
                            {t('flows.flows_hub.noch_kein_audioguide_klick_quotneuer_aud')}
                        </p>
                    </div>
                )}

                {audioGuides && audioGuides.length > 0 && (
                    <div className="grid gap-2">
                        {audioGuides.map(g => (
                            <button
                                key={g.documentId}
                                onClick={() => navigate(`/audio-guides/${g.documentId}`)}
                                className="p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow flex items-center gap-3 text-left"
                            >
                                <MaterialIcon name="headphones" size={18} className="text-emerald-600 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{g.title}</div>
                                    <div className="text-xs text-gray-400 mt-0.5">
                                        {g.cueCount} {t('flows.flows_hub.cue')}{g.cueCount === 1 ? '' : 's'} · {g.scope === 'PERSONAL' ? 'Mein Fach' : 'Space'}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {showAudioPicker && (
                <AudioGuidePickerDialog
                    onPick={(docId) => navigate(`/audio-guides/${docId}`)}
                    onClose={() => setShowAudioPicker(false)}
                />
            )}

            {/* ── Lehrgaenge ─────────────────────────────────────────── */}
            <div className="mt-10">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">{t('flows.flows_hub.lehrgaenge_tutorials')}</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            {t('flows.flows_hub.mehrere_audioguides_als_geordnete_sequen')}
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/audio-guide-courses')}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 text-sm text-emerald-700"
                    >
                        {t('flows.flows_hub.lehrgaenge_verwalten')}
                    </button>
                </div>
            </div>

            {showCreate && jwt && (
                <CreateFlowModal
                    jwt={jwt}
                    onClose={() => setShowCreate(false)}
                    onCreated={tpl => {
                        setTemplates(_t => [tpl, ...(_t ?? [])]);
                        setShowCreate(false);
                        navigate(`/flows/${tpl.id}`);
                    }}
                />
            )}

            {showImport && jwt && (
                <ImportFlowModal
                    jwt={jwt}
                    onClose={() => setShowImport(false)}
                    onImported={tpl => {
                        setTemplates(_t => [tpl, ...(_t ?? [])]);
                        setShowImport(false);
                        navigate(`/flows/${tpl.id}`);
                    }}
                />
            )}

        </div>
    );
}

// ─── ImportFlowModal ───────────────────────────────────────────────────────

function ImportFlowModal({ jwt, onClose, onImported }: { jwt: string; onClose: () => void; onImported: (t: ProcessTemplate) => void }) {
    const t = useT();
    const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleFile = async (file: File) => {
        setParseError(null);
        try {
            const text = await file.text();
            const obj = JSON.parse(text) as Record<string, unknown>;
            if (obj.format !== 'prilog.process-engine/v1') {
                throw new Error(`Falsches Format: ${obj.format ?? '(fehlt)'}`);
            }
            setParsed(obj);
        } catch (err) {
            setParsed(null);
            setParseError(err instanceof Error ? err.message : 'Ungueltige Datei');
        }
    };

    const handleSubmit = async () => {
        if (!parsed) return;
        setSubmitting(true);
        try {
            const r = await flowsGateway.importTemplate(jwt, parsed);
            toast.success(`Importiert: ${r.template.name} (${r.componentsImported} Components, ${r.edgesImported} Edges)`);
            onImported(r.template);
        } catch (err) {
            toast.error('Import fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
            setSubmitting(false);
        }
    };

    const tpl = parsed?.template as { name?: string; appKind?: string; description?: string } | undefined;
    const compCount = Array.isArray(parsed?.components) ? parsed.components.length : 0;
    const edgeCount = Array.isArray(parsed?.edges) ? parsed.edges.length : 0;

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h2 className="text-lg font-semibold mb-4">{t('flows.flows_hub.flow_importieren')}</h2>
                <p className="text-xs text-gray-500 mb-4">
                    {t('flows.flows_hub.lade_eine_flowjson-datei_hoch_von_export')}
                </p>
                <input
                    type="file"
                    accept="application/json,.json"
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) void handleFile(f);
                    }}
                    className="block w-full text-sm border border-gray-300 rounded-lg p-2"
                />
                {parseError && (
                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{parseError}</div>
                )}
                {parsed && tpl && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                        <div className="font-medium">{tpl.name}</div>
                        <div className="text-xs text-gray-600">{tpl.appKind} · {compCount} {t('flows.flows_hub.components')} {edgeCount} {t('flows.flows_hub.edges')}</div>
                        {tpl.description && <div className="text-xs text-gray-600 mt-1">{tpl.description}</div>}
                    </div>
                )}
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg" disabled={submitting}>
                        {t('flows.flows_hub.abbrechen')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!parsed || submitting}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                    >
                        {submitting ? 'Importiere…' : t('common.import')}
                    </button>
                </div>
            </div>
        </div>
    );
}

interface CreateFlowModalProps {
    jwt: string;
    onClose: () => void;
    onCreated: (template: ProcessTemplate) => void;
}

function CreateFlowModal({ jwt, onClose, onCreated }: CreateFlowModalProps) {
    const t = useT();
    const [name, setName] = useState('');
    // "Designer-Typ": logic = generischer Process-Engine-Editor (React-Flow);
    // guide = Anleitungs-Designer (Phone/Tablet-Mockup mit Bausteinen drauf)
    const [designer, setDesigner] = useState<'logic' | 'guide'>('logic');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!name.trim()) {
            setError('Name erforderlich');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            // appKind bleibt als technische Klassifikation, aber wird vom
            // Designer-Typ abgeleitet: 'logic'→'flow', 'guide'→'guide'.
            const appKind: AppKind = designer === 'guide' ? ('guide' as AppKind) : 'flow';
            const r = await flowsGateway.createTemplate(jwt, {
                appKind,
                name: name.trim(),
                description: description.trim() || undefined,
            });
            onCreated(r.template);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen');
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                <h2 className="text-lg font-semibold mb-4">{t('flows.flows_hub.neuer_flow')}</h2>
                <div className="space-y-5">
                    <div>
                        <label className="text-sm font-medium block mb-1.5">{t('common.name')}</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('flows.flows_hub.zb_stripe-zahlung_benachrichtigen')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium block mb-1.5">{t('flows.flows_hub.mit_welchem_designer_arbeiten')}</label>
                        <p className="text-xs text-gray-500 mb-2">
                            {t('flows.flows_hub.beide_designer_fuehren_zur_gleichen_engi')}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <ArtCard
                                value="logic"
                                current={designer}
                                onPick={setDesigner}
                                iconName="schema"
                                title={t('flows.flows_hub.logik-flow')}
                                tagline="Webhooks, Bedingungen, Automation"
                                bullets={['Trigger · Bedingungen', 'HTTP · E-Mail · Matrix', 'Aufgaben · DMS · Loop', 'Fuer technisch-versierte User']}
                                accent="blue"
                            />
                            <ArtCard
                                value="guide"
                                current={designer}
                                onPick={setDesigner}
                                iconName="menu_book"
                                title={t('flows.flows_hub.anleitung')}
                                tagline="Bildschirm-Schritte fuer Nutzer"
                                bullets={['Phone/Tablet-Mockup', 'Drag-Drop von Bausteinen', 'Schritt-fuer-Schritt Anleitung', 'Notfall- und Info-Flows']}
                                accent="emerald"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium block mb-1.5">{t('flows.flows_hub.beschreibung_optional')}</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={2}
                            placeholder={t('flows.flows_hub.worum_gehts_wer_loest_diesen_flow_aus')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                    </div>
                    {error && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                            {error}
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                        disabled={submitting}
                    >
                        {t('flows.flows_hub.abbrechen')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                        disabled={submitting}
                    >
                        {submitting ? t('common.creating') : t('common.create')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── ArtCard — Picker-Card fuer den appKind ────────────────────────────────

const ACCENT_CLASSES: Record<string, { selected: string; idle: string; iconBg: string }> = {
    blue: { selected: 'border-blue-500 bg-blue-50 ring-2 ring-blue-200', idle: 'border-gray-200 hover:border-blue-300', iconBg: 'bg-blue-100 text-blue-600' },
    red: { selected: 'border-red-500 bg-red-50 ring-2 ring-red-200', idle: 'border-gray-200 hover:border-red-300', iconBg: 'bg-red-100 text-red-600' },
    emerald: { selected: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200', idle: 'border-gray-200 hover:border-emerald-300', iconBg: 'bg-emerald-100 text-emerald-600' },
    gray: { selected: 'border-gray-500 bg-gray-50 ring-2 ring-gray-200', idle: 'border-gray-200 hover:border-gray-400', iconBg: 'bg-gray-100 text-gray-600' },
};

function ArtCard<T extends string>({
    value, current, onPick, iconName, title, tagline, bullets, accent,
}: {
    value: T;
    current: T;
    onPick: (v: T) => void;
    iconName: string;
    title: string;
    tagline: string;
    bullets: string[];
    accent: 'blue' | 'red' | 'emerald' | 'gray';
}) {
    const isSelected = current === value;
    const cls = ACCENT_CLASSES[accent];
    return (
        <button
            type="button"
            onClick={() => onPick(value)}
            className={`text-left p-3 border-2 rounded-lg transition-all ${isSelected ? cls.selected : cls.idle}`}
        >
            <div className="flex items-center gap-2 mb-1.5">
                <span className={`p-1.5 rounded ${cls.iconBg}`}><MaterialIcon name={iconName} size={14} /></span>
                <span className="font-semibold text-sm">{title}</span>
            </div>
            <div className="text-xs text-gray-600 mb-1.5">{tagline}</div>
            <ul className="text-[11px] text-gray-500 space-y-0.5">
                {bullets.map((b, i) => <li key={i}>· {b}</li>)}
            </ul>
        </button>
    );
}
