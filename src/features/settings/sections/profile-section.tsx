import { type JSX, useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { sessionStore } from '@/core/session/session-store';
import { ownProfileStore } from '@/core/session/own-profile-store';
import { createMatrixGateway } from '@/gateways/matrix/matrix-gateway';
import { createPlatformGateway } from '@/gateways/platform/platform-gateway';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useMatrixAvatar } from '@/components/ui/matrix-avatar';
import { ImageCropper } from '@/components/ui/image-cropper';
import { cn } from '@/lib/utils';
import { User, Camera, Loader2 } from 'lucide-react';
import { MaterialIcon } from '@/components/ui/material-icon';
import { useT } from '@/lib/i18n/use-t';

const matrixGateway = createMatrixGateway();

const VISIBILITY_FIELD_KEYS = ['avatar', 'email', 'role', 'phone'] as const;

export function ProfileSection(): JSX.Element {
    return (
        <div className="space-y-10">
            <ProfileBlock />
            <hr className="border-border" />
            <ProfileVisibilityBlock />
        </div>
    );
}

function ProfileBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const profile = useSyncExternalStore(ownProfileStore.subscribe, ownProfileStore.getSnapshot);
    const accessToken = session.matrix?.accessToken;
    const userId = session.matrix?.userId;

    const [displayName, setDisplayName] = useState(profile.displayName ?? '');
    const [avatarLocalUrl, setAvatarLocalUrl] = useState<string | null>(null);
    const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(!profile.loaded);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!accessToken || !userId) return;
        if (!profile.loaded) {
            void ownProfileStore.loadFromMatrix(accessToken, userId);
            return;
        }
        setDisplayName(profile.displayName ?? '');
        setLoading(false);
    }, [accessToken, userId, profile.loaded, profile.displayName]);

    const mxcAvatarUrl = useMatrixAvatar(profile.avatarMxc, accessToken);
    const avatarUrl = avatarLocalUrl ?? mxcAvatarUrl;
    const initials = displayName ? displayName.charAt(0).toUpperCase() : '?';

    const handleSaveName = useCallback(async () => {
        if (!accessToken || !userId || !displayName.trim()) return;
        setSaving(true);
        setMessage(null);
        try {
            await matrixGateway.setDisplayName(accessToken, userId, displayName.trim());
            ownProfileStore.setDisplayName(displayName.trim());
            setMessage(t('settings.profile.saved'));
            setTimeout(() => setMessage(null), 2000);
        } catch {
            setMessage(t('settings.profile.saveFailed'));
        } finally {
            setSaving(false);
        }
    }, [accessToken, userId, displayName, t]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        setCropImageUrl(URL.createObjectURL(file));
    }, []);

    const handleCrop = useCallback(async (blob: Blob) => {
        setCropImageUrl(null);
        if (!accessToken || !userId) return;

        const localUrl = URL.createObjectURL(blob);
        setAvatarLocalUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return localUrl;
        });

        setUploading(true);
        setMessage(null);
        try {
            console.info('[avatar] uploading', { size: blob.size, type: blob.type });
            const uploadRes = await matrixGateway.uploadMedia(accessToken, blob, 'avatar.webp', 'image/webp');
            console.info('[avatar] upload OK, content_uri =', uploadRes.content_uri);
            if (!uploadRes.content_uri) throw new Error('Matrix gab keine content_uri zurueck');

            await matrixGateway.setAvatarUrl(accessToken, userId, uploadRes.content_uri);
            console.info('[avatar] setAvatarUrl OK');

            const verify = await matrixGateway.getProfile(accessToken, userId);
            console.info('[avatar] verify-profile =', verify);
            if (verify.avatar_url !== uploadRes.content_uri) {
                throw new Error(`Matrix hat avatar_url nicht gespeichert (gelesen: ${verify.avatar_url ?? 'null'})`);
            }

            ownProfileStore.setAvatarMxc(uploadRes.content_uri);
            setMessage(t('settings.profile.avatarSaved'));
            setTimeout(() => setMessage(null), 2000);
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            console.error('[avatar] Upload fehlgeschlagen:', err);
            setMessage(t('settings.profile.avatarUploadFailed', { detail }));
        } finally {
            setUploading(false);
        }
    }, [accessToken, userId, t]);

    const handleCropCancel = useCallback(() => {
        if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
        setCropImageUrl(null);
    }, [cropImageUrl]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {t('settings.profile.loading')}
            </div>
        );
    }

    return (
        <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <User className="size-5" /> {t('settings.profile.title')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('settings.profile.subtitle')}</p>

            <div className="mt-6 space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-5">
                    <div className="relative">
                        <Avatar className="size-20">
                            {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
                        </Avatar>
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                    </div>
                    <div className="text-sm text-muted-foreground">
                        <p>{t('settings.profile.avatarHint')}</p>
                        <p className="mt-0.5 text-xs">{t('settings.profile.avatarSizeHint')}</p>
                    </div>
                </div>

                {/* Display Name */}
                <div>
                    <label className="text-sm font-medium">{t('settings.profile.displayName')}</label>
                    <div className="mt-1.5 flex gap-2">
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
                            placeholder={t('settings.profile.displayNamePlaceholder')}
                        />
                        <button
                            onClick={handleSaveName}
                            disabled={saving || !displayName.trim()}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="size-4 animate-spin" /> : t('actions.save')}
                        </button>
                    </div>
                </div>

                {/* User ID (read-only) */}
                <div>
                    <label className="text-sm font-medium">{t('settings.profile.matrixId')}</label>
                    <div className="mt-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{userId}</div>
                </div>

                {message && (
                    <p className={cn('text-sm', /Fehler|fehlgeschlagen/i.test(message) ? 'text-destructive' : 'text-emerald-600')}>
                        {message}
                    </p>
                )}

                {cropImageUrl && (
                    <ImageCropper imageUrl={cropImageUrl} onCrop={handleCrop} onCancel={handleCropCancel} outputSize={256} />
                )}
            </div>
        </div>
    );
}

function ProfileVisibilityBlock(): JSX.Element {
    const t = useT();
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot);
    const jwt = session.platform?.token;
    const [visibility, setVisibility] = useState<Record<string, boolean>>({ avatar: true, email: true, role: true, phone: false });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!jwt) return;
        const gw = createPlatformGateway();
        gw.getProfileVisibility(jwt)
            .then(res => setVisibility(res.visibility))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [jwt]);

    const handleToggle = useCallback(async (key: string) => {
        if (!jwt) return;
        const updated = { ...visibility, [key]: !visibility[key] };
        setVisibility(updated);
        setSaving(true);
        try {
            const gw = createPlatformGateway();
            await gw.setProfileVisibility(jwt, updated);
        } catch {
            setVisibility(visibility);
        } finally {
            setSaving(false);
        }
    }, [jwt, visibility]);

    return (
        <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <MaterialIcon name="visibility" size={16} className="size-5" /> {t('settings.profile.visibility.title')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('settings.profile.visibility.subtitle')}</p>

            {loading ? (
                <div className="py-4 text-sm text-muted-foreground">{t('settings.profile.visibility.loading')}</div>
            ) : (
                <div className="mt-4 space-y-3">
                    {VISIBILITY_FIELD_KEYS.map(fieldKey => (
                        <div key={fieldKey} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                            <div>
                                <p className="text-sm font-medium">{t(`settings.profile.visibility.fields.${fieldKey}.label`)}</p>
                                <p className="text-xs text-muted-foreground">{t(`settings.profile.visibility.fields.${fieldKey}.description`)}</p>
                            </div>
                            <button
                                onClick={() => handleToggle(fieldKey)}
                                disabled={saving}
                                className={cn(
                                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                                    visibility[fieldKey] ? 'bg-emerald-500' : 'bg-muted',
                                    saving && 'opacity-50',
                                )}
                            >
                                <span className={cn(
                                    'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                                    visibility[fieldKey] ? 'translate-x-6' : 'translate-x-1',
                                )} />
                            </button>
                        </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">{t('settings.profile.visibility.alwaysVisible')}</p>
                </div>
            )}
        </div>
    );
}
