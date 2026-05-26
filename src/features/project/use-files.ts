import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { createProjectGateway } from '@/gateways/platform/project-gateway';
import { logger } from '@/core/logging/logger';
import type { FileFolder, FileItem, StorageUsage } from './project-types';

const gateway = createProjectGateway();

export function useFiles(spaceId: string | undefined) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;

    const [folders, setFolders] = useState<FileFolder[]>([]);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [usage, setUsage] = useState<StorageUsage | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const mountedRef = useRef(true);

    const load = useCallback(async (folderId: string | null) => {
        if (!jwt || !spaceId) return;
        setLoading(true);
        try {
            const [foldersRes, usageRes] = await Promise.all([
                gateway.listFolders(jwt, spaceId),
                gateway.getUsage(jwt, spaceId),
            ]);
            if (!mountedRef.current) return;
            setFolders(foldersRes.folders);
            setUsage(usageRes);

            // Load files for current folder (default = first root folder)
            const targetFolder = folderId ?? foldersRes.folders.find(f => !f.parentId)?.id;
            if (targetFolder) {
                const filesRes = await gateway.listFilesInFolder(jwt, spaceId, targetFolder);
                if (mountedRef.current) {
                    setFiles(filesRes.files);
                    setCurrentFolderId(targetFolder);
                }
            } else {
                setFiles([]);
            }
        } catch (err) {
            logger.error('Failed to load files', { error: err });
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [jwt, spaceId]);

    useEffect(() => {
        mountedRef.current = true;
        if (session.state === 'ready' && spaceId) load(null);
        return () => { mountedRef.current = false; };
    }, [session.state, spaceId, load]);

    const navigateToFolder = useCallback((folderId: string | null) => {
        load(folderId);
    }, [load]);

    const uploadFile = useCallback(async (file: File) => {
        if (!jwt || !spaceId) return;
        // Use current folder, or fall back to first available folder
        const targetFolder = currentFolderId ?? folders.find(f => !f.parentId)?.id ?? folders[0]?.id;
        console.log('[Files] Upload start', { jwt: !!jwt, spaceId, targetFolder, fileName: file.name, size: file.size });
        if (!targetFolder) { console.error('[Files] No target folder'); return; }
        setUploading(true);
        try {
            // 1. Request presigned URL
            console.log('[Files] Requesting presigned URL...');
            const { uploadUrl, storageKey } = await gateway.requestUpload(jwt, spaceId, {
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
                folderId: targetFolder,
            });
            console.log('[Files] Got presigned URL, uploading to S3...', { uploadUrl: uploadUrl.slice(0, 80), storageKey });
            // 2. Upload directly to S3
            const s3Res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
            console.log('[Files] S3 upload response:', s3Res.status);
            // 3. Confirm upload
            await gateway.confirmUpload(jwt, spaceId, {
                storageKey,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
                folderId: targetFolder,
            });
            // 4. Refresh
            await load(targetFolder);
        } catch (err) {
            logger.error('File upload failed', { error: err });
            const { showUploadError } = await import('@/core/upload/upload-error');
            showUploadError(err, 'Datei-Upload fehlgeschlagen');
            throw err;
        } finally {
            if (mountedRef.current) setUploading(false);
        }
    }, [jwt, spaceId, currentFolderId, folders, load]);

    const downloadFile = useCallback(async (fileId: string) => {
        if (!jwt || !spaceId) return;
        try {
            const { downloadUrl, fileName } = await gateway.getDownloadUrl(jwt, spaceId, fileId);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileName;
            a.click();
        } catch (err) {
            logger.error('Download failed', { error: err });
        }
    }, [jwt, spaceId]);

    const deleteFile = useCallback(async (fileId: string) => {
        if (!jwt || !spaceId) return;
        try {
            await gateway.deleteFile(jwt, spaceId, fileId);
            await load(currentFolderId);
        } catch (err) {
            logger.error('Delete failed', { error: err });
        }
    }, [jwt, spaceId, currentFolderId, load]);

    const createFolder = useCallback(async (name: string) => {
        if (!jwt || !spaceId) return;
        try {
            await gateway.createFolder(jwt, spaceId, { name, parentId: currentFolderId ?? undefined });
            await load(currentFolderId);
        } catch (err) {
            logger.error('Create folder failed', { error: err });
        }
    }, [jwt, spaceId, currentFolderId, load]);

    const deleteFolder = useCallback(async (folderId: string) => {
        if (!jwt || !spaceId) return;
        try {
            // Recursive: delete all files in this folder, then child folders, then the folder itself
            const filesRes = await gateway.listFilesInFolder(jwt, spaceId, folderId);
            for (const file of filesRes.files) {
                await gateway.deleteFile(jwt, spaceId, file.id);
            }
            const childFolders = folders.filter(f => f.parentId === folderId);
            for (const child of childFolders) {
                await deleteFolder(child.id);
            }
            await gateway.deleteFolder(jwt, spaceId, folderId);
            await load(currentFolderId);
        } catch (err) {
            logger.error('Delete folder failed', { error: err });
        }
    }, [jwt, spaceId, currentFolderId, folders, load]);

    return {
        folders, files, currentFolderId, usage, loading, uploading,
        navigateToFolder, uploadFile, downloadFile, deleteFile, createFolder, deleteFolder,
        refresh: () => load(currentFolderId),
    };
}
