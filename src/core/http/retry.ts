export interface RetryOptions {
    attempts: number;
    baseDelayMs: number;
}

const sleep = async (ms: number): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, ms));
};

export const withRetry = async <T>(
    operation: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean,
    options: RetryOptions = { attempts: 2, baseDelayMs: 300 },
): Promise<T> => {
    let currentAttempt = 0;

    while (true) {
        try {
            return await operation();
        } catch (error) {
            currentAttempt += 1;

            if (currentAttempt >= options.attempts || !shouldRetry(error)) {
                throw error;
            }

            await sleep(options.baseDelayMs * currentAttempt);
        }
    }
};