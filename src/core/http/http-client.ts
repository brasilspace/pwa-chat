import { logger } from '../logging/logger';
import { PrilogApiError, type PrilogErrorPayload } from '../errors/prilog-error';
import { withRetry } from './retry';
import { toast } from '../../components/ui/toast';

export interface RequestOptions extends RequestInit {
    target: 'matrix' | 'platform';
    path: string;
    baseUrl: string;
    bearerToken?: string;
}

const isRetryable = (error: unknown): boolean => {
    if (error instanceof TypeError) {
        return true;
    }

    if (error instanceof PrilogApiError) {
        return error.payload.retryable === true;
    }

    return false;
};

export const requestJson = async <T>(options: RequestOptions): Promise<T> =>
    withRetry(
        async () => {
            const url = `${options.baseUrl}${options.path}`;

            logger.info(`HTTP ${options.method ?? 'GET'} ${options.path}`, {
                target: options.target,
                path: options.path,
            });

            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.bearerToken ? { Authorization: `Bearer ${options.bearerToken}` } : {}),
                    ...(options.headers ?? {}),
                },
            });

            if (!response.ok) {
                let payload: PrilogErrorPayload;

                try {
                    payload = (await response.json()) as PrilogErrorPayload;
                } catch {
                    payload = {
                        code: 'INTERNAL_ERROR',
                        message: response.statusText,
                        retryable: response.status >= 500,
                    };
                }

                logger.error(`HTTP ${response.status} ${options.path}`, {
                    target: options.target,
                    path: options.path,
                    status: response.status,
                });

                const error = new PrilogApiError(
                    payload.message ?? response.statusText,
                    response.status,
                    payload,
                    options.target,
                );

                // Show user-facing error toast (skip 401 — handled by session)
                if (response.status !== 401 && options.target === 'platform') {
                    toast.error(payload.message ?? `Fehler ${response.status}: ${response.statusText}`);
                }

                throw error;
            }

            if (response.status === 204 || response.headers.get('content-length') === '0') {
                return undefined as T;
            }

            return (await response.json()) as T;
        },
        isRetryable,
    );
