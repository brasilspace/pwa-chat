/**
 * DocumentRelationsPanel — zeigt im Doc-Detail Beziehungen beidseitig.
 * Outgoing: was zeigt dieses Doc auf. Incoming: was zeigt auf dieses Doc.
 * Plus Picker zum Hinzufuegen.
 */

import { type JSX, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { useDocumentRelations, documentRelationsApi, RELATION_LABELS, type RelationType } from './use-document-relations';
import { FilePickerDialog } from '@/features/flows/file-picker-dialog';
import { parsePrilogFileLink } from '@/lib/prilog-link';
import { FileIcon } from './file-icon';
import { Plus, Loader2, Link as LinkIcon } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/ui/section-header';
import { useT } from "@/lib/i18n/use-t";

interface Props {
    documentId: string;
    onChange?: () => void;
}

export function DocumentRelationsPanel({ documentId, onChange }: Props): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const navigate = useNavigate();
    const { outgoing, incoming, loading, refresh } = useDocumentRelations(documentId);
    const [picking, setPicking] = useState(false);
    const [pickedTarget, setPickedTarget] = useState<{ id: string; title: string; mimeType: string } | null>(null);
    const [relationType, setRelationType] = useState<RelationType>('RELATED_TO');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const remove = async (relationId: string) => {
        if (!jwt) return;
        try {
            await documentRelationsApi.delete(jwt, documentId, relationId);
            refresh();
            onChange?.();
        } catch (e) {
            alert('Entfernen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        }
    };

    const create = async () => {
        if (!jwt || !pickedTarget) return;
        setSaving(true);
        try {
            await documentRelationsApi.create(jwt, documentId, {
                toId: pickedTarget.id,
                relationType,
                note: note.trim() || undefined,
            });
            setPickedTarget(null);
            setNote('');
            setRelationType('RELATED_TO');
            refresh();
            onChange?.();
        } catch (e) {
            alert('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <SectionHeader
                action={
                    <button
                        onClick={() => setPicking(true)}
                        className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted"
                    >
                        <MaterialIcon name="add" size={16} className="size-3" /> {t('dms.document_relations.verknuepfen')}
                    </button>
                }
            >
                {t('dms.document_relations.beziehungen')}
            </SectionHeader>

            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}

            {!loading && outgoing.length === 0 && incoming.length === 0 && !pickedTarget && (
                <p className="text-[11px] text-muted-foreground italic">{t('dms.document_relations.keine_beziehungen')}</p>
            )}

            {/* Picker waehlt nur das Ziel-Doc, danach Form fuer Type+Note */}
            {pickedTarget && (
                <div className="rounded border border-primary/40 bg-background p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-medium">{t('dms.document_relations.beziehung_anlegen')}</p>
                        <button onClick={() => setPickedTarget(null)} className="rounded p-0.5 hover:bg-muted">
                            <MaterialIcon name="close" size={16} className="size-3" />
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5 rounded bg-muted/30 px-1.5 py-1 text-[11px]">
                        <FileIcon fileName={pickedTarget.title} mimeType={pickedTarget.mimeType} className="size-3 shrink-0" />
                        <span className="truncate">{pickedTarget.title}</span>
                    </div>
                    <select
                        value={relationType}
                        onChange={e => setRelationType(e.target.value as RelationType)}
                        className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]"
                    >
                        {Object.entries(RELATION_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                                {label.icon} {t('dms.document_relations.dieses_doc')} {label.outgoing} {t('dms.document_relations.ziel')}
                            </option>
                        ))}
                    </select>
                    <input
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder={t('dms.document_relations.notiz_optional_zb_anhang_3')}
                        className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]"
                    />
                    <button
                        onClick={create}
                        disabled={saving}
                        className="w-full rounded bg-primary py-1 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {saving ? t('common.saving') : t('common.create')}
                    </button>
                </div>
            )}

            {/* Outgoing */}
            {outgoing.length > 0 && (
                <div className="mt-2 space-y-1">
                    <p className="text-[10px] font-medium uppercase text-muted-foreground/70">{t('dms.document_relations.verweist_auf')}</p>
                    <ul className="space-y-1">
                        {outgoing.map(r => (
                            <li key={r.id} className="group flex items-center gap-1.5 rounded border border-border bg-muted/20 px-1.5 py-1 text-xs">
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                    {RELATION_LABELS[r.relationType].icon} {RELATION_LABELS[r.relationType].outgoing}
                                </span>
                                <MaterialIcon name="arrow_forward" size={16} className="size-3 text-muted-foreground shrink-0" />
                                <button
                                    onClick={() => navigate(`/dms?docId=${r.target.id}`)}
                                    className="flex flex-1 items-center gap-1 min-w-0 hover:underline text-left"
                                >
                                    <FileIcon fileName={r.target.title} mimeType={r.target.mimeType} className="size-3 shrink-0" />
                                    <span className="truncate font-medium">{r.target.title}</span>
                                </button>
                                {r.note && <span className="text-[10px] text-muted-foreground italic truncate">"{r.note}"</span>}
                                <button
                                    onClick={() => remove(r.id)}
                                    className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                                    title={t('dms.document_relations.beziehung_entfernen')}
                                >
                                    <MaterialIcon name="close" size={16} className="size-3" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Incoming */}
            {incoming.length > 0 && (
                <div className="mt-2 space-y-1">
                    <p className="text-[10px] font-medium uppercase text-muted-foreground/70">{t('dms.document_relations.wird_verwiesen_von')}</p>
                    <ul className="space-y-1">
                        {incoming.map(r => (
                            <li key={r.id} className="group flex items-center gap-1.5 rounded border border-border bg-muted/20 px-1.5 py-1 text-xs">
                                <MaterialIcon name="arrow_back" size={16} className="size-3 text-muted-foreground shrink-0" />
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                    {RELATION_LABELS[r.relationType].icon} {RELATION_LABELS[r.relationType].incoming}
                                </span>
                                <button
                                    onClick={() => navigate(`/dms?docId=${r.source.id}`)}
                                    className="flex flex-1 items-center gap-1 min-w-0 hover:underline text-left"
                                >
                                    <FileIcon fileName={r.source.title} mimeType={r.source.mimeType} className="size-3 shrink-0" />
                                    <span className="truncate font-medium">{r.source.title}</span>
                                </button>
                                {r.note && <span className="text-[10px] text-muted-foreground italic truncate">"{r.note}"</span>}
                                <button
                                    onClick={() => remove(r.id)}
                                    className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                                    title={t('dms.document_relations.beziehung_entfernen')}
                                >
                                    <MaterialIcon name="close" size={16} className="size-3" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {picking && (
                <FilePickerDialog
                    onClose={() => setPicking(false)}
                    onSelect={(prilogLink, meta) => {
                        const id = parsePrilogFileLink(prilogLink);
                        if (!id) return;
                        if (id === documentId) {
                            alert('Selbst-Verknuepfung nicht erlaubt');
                            return;
                        }
                        setPickedTarget({ id, title: meta.fileName, mimeType: meta.mimeType });
                        setPicking(false);
                    }}
                />
            )}
        </div>
    );
}

// Markiere LinkIcon als used (falls Linter klagen sollte)
void LinkIcon;
