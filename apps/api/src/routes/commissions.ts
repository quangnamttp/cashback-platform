import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const commissions = await prisma.commission.findMany({
    include: { order: true },
    where: { order: { userId: req.user!.id } },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ commissions });
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      orderId: z.string(),
      amount: z.number().min(0),
      rate: z.number().min(0),
      status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'REFUNDED']).optional(),
      source: z.string().optional(),
    });

    const parsed = schema.parse(req.body);
    const commission = await prisma.commission.create({
      data: {
        orderId: parsed.orderId,
        amount: parsed.amount.toString(),
        rate: parsed.rate.toString(),
        status: parsed.status || 'PENDING',
        source: parsed.source || 'manual',
      },
    });

    return res.status(201).json({ commission });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid commission payload' });
  }
});

export default router;
