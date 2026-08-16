import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return res.json({ user });
});

router.get('/', requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return res.json({ users });
});

router.patch('/:id/role', requireAuth, async (req, res) => {
  const schema = z.object({ role: z.enum(['USER', 'ADMIN']) });

  try {
    const parsed = schema.parse(req.body);
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role: parsed.role },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });

    return res.json({ user });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid role update' });
  }
});

export default router;
