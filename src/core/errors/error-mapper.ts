import { PrilogApiError, type PrilogErrorCode } from './prilog-error';

export type ErrorAction =
    | 'logout'
    | 'invalidate_session'
    | 'retry'
    | 'show_ui_error'
    | 'ignore';

export interface MappedError {
    action: ErrorAction;
    reason: string;
    code?: PrilogErrorCode;
    correlationId?: string;
}

export const mapError = (error: unknown): MappedError => {
    if (!(error instanceof PrilogApiError)) {
        return {
            action: 'retry',
            reason: 'Unexpected or network error',
        };
    }

    const { code, correlationId, retryable } = error.payload;

    switch (code) {
        case 'INVALID_MATRIX_TOKEN':
        case 'USER_NOT_FOUND':
            return {
                action: 'logout',
                reason: code,
                code,
                correlationId,
            };

        case 'FORBIDDEN':
            return {
                action: 'invalidate_session',
                reason: code,
                code,
                correlationId,
            };

        case 'VALIDATION_ERROR':
        case 'NOT_FOUND':
            return {
                action: 'show_ui_error',
                reason: code,
                code,
                correlationId,
            };

        case 'INTERNAL_ERROR':
        case 'RATE_LIMITED':
            return {
                action: retryable ? 'retry' : 'show_ui_error',
                reason: code,
                code,
                correlationId,
            };

        default:
            return {
                action: 'show_ui_error',
                reason: 'Unknown error',
            };
    }
};
