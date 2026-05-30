import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import prisma from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES = '15m';
const REFRESH_EXPIRES_DAYS = 30;

export interface JwtPayload {
  userId: string;
  role: string;
  email?: string;
}

// Extend Express Request to carry the authed user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ── Token generation ──────────────────────────────────────────────
export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${REFRESH_EXPIRES_DAYS}d` });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function refreshExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
}

// ── Middleware: require valid JWT ─────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Middleware: optional auth (attaches user if token present) ────
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyToken(header.slice(7));
    } catch { /* ignore */ }
  }
  next();
}

// ── Middleware factory: require specific role(s) ──────────────────
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Required role: ${roles.join(' or ')}` });
    }
    next();
  };
}

// ── Check if user is banned ───────────────────────────────────────
export async function checkBanned(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next();
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { bannedAt: true },
  });
  if (user?.bannedAt) {
    return res.status(403).json({ error: 'Account suspended' });
  }
  next();
}
