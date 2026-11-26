import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getUserById, type UserRole } from './db.ts';

const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

export function verifyModeratorPasscode(passcode: string): boolean {
  const expected = (process.env.MODERATOR_PASSCODE || '').trim();
  if (!expected) return false;
  const a = Buffer.from(passcode);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isModeratorPasscodeConfigured(): boolean {
  return Boolean((process.env.MODERATOR_PASSCODE || '').trim());
}

export interface TokenPayload {
  userId: number;
  username: string;
  role: UserRole;
  exp: number;
}

export function signToken(userId: number, username: string, role: UserRole = 'user'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      username,
      role,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 14,
    } satisfies TokenPayload)
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenPayload;
    if (!decoded || typeof decoded.userId !== 'number' || decoded.exp < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  authUser?: TokenPayload;
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const payload = verifyToken(token);
    if (payload) {
      req.authUser = payload;
    }
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }

  // Re-verify account existence and active status against database
  if (payload.userId > 0) {
    const dbUser = getUserById(payload.userId);
    if (!dbUser) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    if (dbUser.account_status === 'suspended') {
      res.status(403).json({ error: 'This account has been suspended by a moderator.' });
      return;
    }
    payload.role = dbUser.role;
  }

  req.authUser = payload;
  next();
}

export function requireModerator(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.authUser || req.authUser.role !== 'moderator') {
      res.status(403).json({ error: 'Moderator access required.' });
      return;
    }
    next();
  });
}
