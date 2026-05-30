import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { customAlphabet } from 'nanoid';
import prisma from '../lib/prisma';
import {
  signAccessToken, signRefreshToken, verifyToken,
  refreshExpiresAt, requireAuth,
} from '../lib/auth';

const router = Router();
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

// ─── Schemas ──────────────────────────────────────────────────────
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(40),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// ─── Helper: build token pair + store refresh token ──────────────
async function issueTokens(userId: string, role: string, email?: string | null) {
  const payload = { userId, role, email: email ?? undefined };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId, expiresAt: refreshExpiresAt() },
  });
  return { accessToken, refreshToken };
}

// ─── POST /api/auth/register ──────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const data = RegisterSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        displayName: data.displayName,
        role: 'VIEWER',
        provider: 'LOCAL',
      },
    });

    const tokens = await issueTokens(user.id, user.role, user.email);
    res.status(201).json({
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, avatarUrl: user.avatarUrl },
      ...tokens,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const data = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.bannedAt) return res.status(403).json({ error: 'Account suspended' });

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const tokens = await issueTokens(user.id, user.role, user.email);
    res.json({
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, avatarUrl: user.avatarUrl },
      ...tokens,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
  try {
    const payload = verifyToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Refresh token expired or invalid' });
    }

    // Rotate: delete old, issue new pair
    await prisma.refreshToken.delete({ where: { token: refreshToken } });
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.bannedAt) return res.status(403).json({ error: 'Account suspended' });

    const tokens = await issueTokens(user.id, user.role, user.email);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } }).catch(() => {});
  }
  res.json({ success: true });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true, email: true, displayName: true, role: true,
      avatarUrl: true, bio: true, twitterHandle: true, githubHandle: true,
      createdAt: true,
      _count: { select: { followers: true, following: true, streams: true } },
    },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ─── OAuth: Google ────────────────────────────────────────────────
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env
// Uses manual exchange to avoid passport dependency overhead
router.get('/google', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: `${process.env.API_URL || 'http://localhost:4000'}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query as { code: string };
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, grant_type: 'authorization_code',
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${process.env.API_URL || 'http://localhost:4000'}/api/auth/google/callback`,
      }),
    });
    const { access_token } = await tokenRes.json() as { access_token: string };

    // Fetch user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileRes.json() as { id: string; email: string; name: string; picture: string };

    let user = await prisma.user.findFirst({ where: { oauthId: profile.id, provider: 'GOOGLE' } });
    if (!user) {
      // Check if email already registered via LOCAL
      const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { oauthId: profile.id, provider: 'GOOGLE', avatarUrl: profile.picture },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email: profile.email, displayName: profile.name,
            avatarUrl: profile.picture, oauthId: profile.id,
            provider: 'GOOGLE', role: 'VIEWER',
          },
        });
      }
    }

    const tokens = await issueTokens(user.id, user.role, user.email);
    res.redirect(`${clientUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  } catch (err) {
    console.error('[oauth/google]', err);
    res.redirect(`${clientUrl}/auth/callback?error=oauth_failed`);
  }
});

// ─── OAuth: GitHub ────────────────────────────────────────────────
router.get('/github', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID || '',
    redirect_uri: `${process.env.API_URL || 'http://localhost:4000'}/api/auth/github/callback`,
    scope: 'read:user user:email',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.get('/github/callback', async (req, res) => {
  const { code } = req.query as { code: string };
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const { access_token } = await tokenRes.json() as { access_token: string };

    const [profileRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${access_token}` } }),
      fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${access_token}` } }),
    ]);
    const profile = await profileRes.json() as { id: number; login: string; name: string; avatar_url: string };
    const emails = await emailsRes.json() as { email: string; primary: boolean; verified: boolean }[];
    const primaryEmail = emails.find(e => e.primary && e.verified)?.email;

    let user = await prisma.user.findFirst({ where: { oauthId: String(profile.id), provider: 'GITHUB' } });
    if (!user) {
      const byEmail = primaryEmail ? await prisma.user.findUnique({ where: { email: primaryEmail } }) : null;
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { oauthId: String(profile.id), provider: 'GITHUB', githubHandle: profile.login },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email: primaryEmail, displayName: profile.name || profile.login,
            avatarUrl: profile.avatar_url, oauthId: String(profile.id),
            provider: 'GITHUB', role: 'VIEWER', githubHandle: profile.login,
          },
        });
      }
    }

    const tokens = await issueTokens(user.id, user.role, user.email);
    res.redirect(`${clientUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  } catch (err) {
    console.error('[oauth/github]', err);
    res.redirect(`${clientUrl}/auth/callback?error=oauth_failed`);
  }
});

export default router;
