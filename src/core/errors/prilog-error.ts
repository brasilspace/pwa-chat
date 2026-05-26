export type PrilogErrorCode =
    | 'INVALID_MATRIX_TOKEN'
    | 'USER_NOT_FOUND'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'INTERNAL_ERROR'
    | 'RATE_LIMITED';

export interface PrilogErrorPayload {
    code: PrilogErrorCode;
    message: string;
    details?: Record<string, unknown>;
    retryable: boolean;
    correlationId?: string;
}

export class PrilogApiError extends Error {
    public readonly status: number;
    public readonly payload: PrilogErrorPayload;
    public readonly target: 'matrix' | 'platform';

    public constructor(
        message: string,
        status: number,
        payload: PrilogErrorPayload,
        target: 'matrix' | 'platform',
    ) {
        super(message);
        this.name = 'PrilogApiError';
        this.status = status;
        this.payload = payload;
        this.target = target;
    }
}
