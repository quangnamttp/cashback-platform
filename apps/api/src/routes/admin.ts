import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAdmin } from '../lib/auth';

const router = Router();

router.get('/dashboard', requireAdmin, async (_req, res) => {
  const [users, links, orders, commissions, cashback, frauds] = await Promise.all([
    prisma.user.count(),
    prisma.productLink.count(),
    prisma.order.count(),
    prisma.commission.count(),
    prisma.cashbackHistory.count(),
    prisma.fraudSignal.count(),
  ]);

  return res.json({
    stats: {
      users,
      links,
      orders,
      commissions,
      cashback,
      frauds,
    },
  });
});

router.get('/fraud-signals', requireAdmin, async (_req, res) => {
  const frauds = await prisma.fraudSignal.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ frauds });
});

export default router;
