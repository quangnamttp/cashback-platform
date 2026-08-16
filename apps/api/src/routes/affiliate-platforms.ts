import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAdmin } from '../lib/auth';

const router = Router();

router.get('/', async (_req, res) => {
  const platforms = await prisma.affiliateNetwork.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return res.json({ platforms });
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const schema = z.object({
      code: z.string().min(2),
      name: z.string().min(2),
      platform: z.enum(['SHOPEE', 'TIKTOK_SHOP', 'LAZADA']),
      isEnabled: z.boolean().optional(),
      apiBaseUrl: z.string().url().optional().or(z.literal('')),
      notes: z.string().optional(),
    });

    const parsed = schema.parse(req.body);
    const platform = await prisma.affiliateNetwork.create({
      data: {
        code: parsed.code,
        name: parsed.name,
        platform: parsed.platform,
        isEnabled: parsed.isEnabled ?? true,
        apiBaseUrl: parsed.apiBaseUrl || null,
        notes: parsed.notes || null,
      },
    });

    return res.status(201).json({ platform });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid platform payload' });
  }
});

export default router;
