export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const PDF_MIME_TYPES = ['application/pdf'];

export function requireAiCaller(req: Request) {
  const allowedUserIds = parseList(Deno.env.get('AI_ALLOWED_USER_IDS'));
  const allowedEmails = parseList(Deno.env.get('AI_ALLOWED_EMAILS')).map((email) => email.toLowerCase());

  if (allowedUserIds.length === 0 && allowedEmails.length === 0) {
    throw new HttpError('AI access allowlist is not configured', 500);
  }

  const payload = decodeJwtPayload(req.headers.get('authorization'));
  const userId = String(payload.sub ?? '');
  const email = String(payload.email ?? '').toLowerCase();

  if ((userId && allowedUserIds.includes(userId)) || (email && allowedEmails.includes(email))) {
    return { userId, email };
  }

  throw new HttpError('Not allowed to use AI extraction', 403);
}

export function validateBase64Payload(
  fieldName: string,
  value: unknown,
  mimeType: unknown,
  allowedMimeTypes: string[],
  maxBytes: number,
) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(`No ${fieldName} provided`, 400);
  }

  if (typeof mimeType !== 'string' || !allowedMimeTypes.includes(mimeType)) {
    throw new HttpError(`Unsupported ${fieldName} type`, 415);
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new HttpError(`Invalid ${fieldName} payload`, 400);
  }

  if (base64DecodedBytes(value) > maxBytes) {
    throw new HttpError(`${fieldName} is too large`, 413);
  }
}

export function errorResponse(error: unknown, headers: Record<string, string>) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Unknown error';
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function parseList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function decodeJwtPayload(authorization: string | null): Record<string, unknown> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError('Missing bearer token', 401);

  const [, payload] = token.split('.');
  if (!payload) throw new HttpError('Invalid bearer token', 401);

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch (_error) {
    throw new HttpError('Invalid bearer token', 401);
  }
}

function base64DecodedBytes(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}
