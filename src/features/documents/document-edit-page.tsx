/**
 * DocumentEditPage — Full-Page Live-Multi-User-Editor fuer Markdown-Dokumente.
 *
 * Flow:
 *   1. Document-Id aus URL → POST /collab-docs/from-document/:id
 *      (idempotent — gibt bestehende offene Session zurueck wenn vorhanden).
 *   2. Editor (Y.js + Tiptap) laeuft fuer alle Beteiligten in Echtzeit.
 *   3. "Speichern" schreibt zurueck ins DMS-Document (selbe Datei).
 *   4. Titel ist oben editierbar — wird mit dem Document gespeichert.
 */

import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionStore } from '@/core/session/session-store';
import { env } from '@/core/config/env';
import { CollabEditorView } from '@/features/cascade/collab-editor';
import { Loader2 } from 'lucide-react';
import { useT } from "@/lib/i18n/use-t";

export function DocumentEditPage(): JSX.Element {
    const t = useT();
    const { id: documentId } = useParams();
    const navigate = useNavigate();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [collabDocId, setCollabDocId] = useState<string | null>(null);
    const [spaceId, setSpaceId] = useState<string>('');
    const [title, setTitle] = useState<string>('');
    const [titleSaving, setTitleSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jwt || !documentId) return;
        let aborted = false;
        (async () => {
            try {
                const res = await fetch(`${env.platformBaseUrl}/platform/v1/collab-docs/from-document/${encodeURIComponent(documentId)}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                    body: '{}',
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
                }
                const data = await res.json();
                if (aborted) return;
                if (!data?.docId) throw new Error('Keine Editor-Session erhalten');
                if (data.spaceId) setSpaceId(data.spaceId);
                if (data.title) setTitle(data.title.replace(/\.md$/, ''));
                setCollabDocId(data.docId);
            } catch (e) {
                if (!aborted) setError(e instanceof Error ? e.message : String(e));
            }
        })();
        return () => { aborted = true; };
    }, [jwt, documentId]);

    const saveTitle = async (newTitle: string) => {
        if (!jwt || !documentId) return;
        const trimmed = newTitle.trim();
        if (!trimmed || trimmed === title) return;
        setTitle(trimmed);
        setTitleSaving(true);
        try {
            const fileName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
            await fetch(`${env.platformBaseUrl}/platform/v1/spaces/${encodeURIComponent(spaceId)}/documents/${encodeURIComponent(documentId)}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: fileName }),
            });
        } finally {
            setTitleSaving(false);
        }
    };

    if (!jwt || !documentId) {
        return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('documents.document_edit_page.anmeldung_erforderlich')}</div>;
    }
    if (error) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-destructive">{t('documents.document_edit_page.editor_konnte_nicht_geladen_werden')} {error}</p>
                <button onClick={() => navigate(-1)} className="rounded border px-3 py-1.5 text-xs hover:bg-muted">{t('documents.document_edit_page.zurueck')}</button>
            </div>
        );
    }
    if (!collabDocId) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b bg-background px-4 py-2 shrink-0">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={(e) => saveTitle(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                    }}
                    placeholder={t('documents.document_edit_page.titel')}
                    className="flex-1 bg-transparent text-lg font-semibold outline-none focus:border-b focus:border-primary"
                />
                {titleSaving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="min-h-0 flex-1">
                <CollabEditorView
                    documentId={collabDocId}
                    jwt={jwt}
                    userId={session.matrix?.userId ?? 'unknown'}
                    displayName={session.bootstrap?.user?.displayName ?? session.matrix?.userId ?? 'Unbekannt'}
                    spaceId={spaceId}
                    onClose={() => navigate(-1)}
                    onDelete={() => navigate(-1)}
                    hasSource
                />
            </div>
        </div>
    );
}

export default DocumentEditPage;
