import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';

const router = Router();

router.get('/history', requireAuth, async (req, res) => {
  const history = await prisma.cashbackHistory.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ history });
});

router.post('/recalculate', requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      commissionId: z.string().optional(),
      amount: z.number().min(0),
      rate: z.number().min(0),
      status: z.enum(['PENDING', 'ELIGIBLE', 'REJECTED', 'PAID']).optional(),
      notes: z.string().optional(),
    });

    const parsed = schema.parse(req.body);
    const cashback = await prisma.cashbackHistory.create({
      data: {
        userId: req.user!.id,
        commissionId: parsed.commissionId || null,
        amount: parsed.amount.toString(),
        rate: parsed.rate.toString(),
        status: parsed.status || 'PENDING',
        notes: parsed.notes || 'Calculated by cashback engine',
      },
    });

    return res.status(201).json({ cashback });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid cashback request' });
  }
});

export default router;
