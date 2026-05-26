export interface LogContext {
    target?: 'matrix' | 'platform';
    path?: string;
    correlationId?: string;
    status?: number;
    [key: string]: unknown;
}

const format = (level: 'info' | 'warn' | 'error', message: string, context?: LogContext): void => {
    const payload = {
        level,
        message,
        timestamp: new Date().toISOString(),
        ...context,
    };

    if (level === 'error') {
        console.error(payload);
        return;
    }

    if (level === 'warn') {
        console.warn(payload);
        return;
    }

    console.info(payload);
};

export const logger = {
    info: (message: string, context?: LogContext) => format('info', message, context),
    warn: (message: string, context?: LogContext) => format('warn', message, context),
    error: (message: string, context?: LogContext) => format('error', message, context),
};