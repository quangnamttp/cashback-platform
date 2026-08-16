import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ orders });
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      affiliateLinkId: z.string(),
      platform: z.enum(['SHOPEE', 'TIKTOK_SHOP', 'LAZADA']),
      orderTotal: z.number().min(0),
      externalOrderId: z.string().optional(),
      status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED']).optional(),
    });

    const parsed = schema.parse(req.body);
    const order = await prisma.order.create({
      data: {
        userId: req.user!.id,
        affiliateLinkId: parsed.affiliateLinkId,
        platform: parsed.platform,
        externalOrderId: parsed.externalOrderId || null,
        orderTotal: parsed.orderTotal.toString(),
        status: parsed.status || 'PENDING',
      },
    });

    return res.status(201).json({ order });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid order payload' });
  }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const schema = z.object({ status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED']) });

  try {
    const parsed = schema.parse(req.body);
    const orderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: parsed.status,
        confirmedAt: parsed.status === 'CONFIRMED' ? new Date() : undefined,
      },
    });

    return res.json({ order });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not update order status' });
  }
});

export default router;
