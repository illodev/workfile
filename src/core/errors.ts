export interface ProtocolErrorOptions {
    cause?: unknown;
    status?: number;
    details?: unknown;
    exitCode?: number;
}

export class ProtocolError extends Error {
    readonly code: string;
    readonly status: number;
    details: unknown;
    readonly exitCode: number;

    constructor(
        code: string,
        message: string,
        options: ProtocolErrorOptions = {}
    ) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.name = "ProtocolError";
        this.code = code;
        this.status = options.status || 400;
        this.details = options.details || null;
        this.exitCode = options.exitCode || (this.status === 409 ? 3 : 1);
    }
}

export class ConfigError extends ProtocolError {
    constructor(code: string, message: string, details: unknown = null) {
        super(code, message, { status: 400, details, exitCode: 2 });
        this.name = "ConfigError";
    }
}

export class ValidationError extends ProtocolError {
    constructor(code: string, message: string, details: unknown = null) {
        super(code, message, { status: 400, details, exitCode: 1 });
        this.name = "ValidationError";
    }
}

export class NotFoundError extends ProtocolError {
    constructor(code: string, message: string, details: unknown = null) {
        super(code, message, { status: 404, details, exitCode: 1 });
        this.name = "NotFoundError";
    }
}

export class ForbiddenError extends ProtocolError {
    constructor(code: string, message: string, details: unknown = null) {
        super(code, message, { status: 403, details, exitCode: 1 });
        this.name = "ForbiddenError";
    }
}

export class UnsupportedMediaTypeError extends ProtocolError {
    constructor(code: string, message: string, details: unknown = null) {
        super(code, message, { status: 415, details, exitCode: 1 });
        this.name = "UnsupportedMediaTypeError";
    }
}

export class ConflictError extends ProtocolError {
    constructor(code: string, message: string, details: unknown = null) {
        super(code, message, { status: 409, details, exitCode: 3 });
        this.name = "ConflictError";
    }
}

export function normalizeError(error: unknown): ProtocolError {
    if (error instanceof ProtocolError) return error;
    return new ProtocolError(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : String(error),
        { status: 500, exitCode: 2, cause: error }
    );
}
