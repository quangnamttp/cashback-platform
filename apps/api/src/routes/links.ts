import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { createAffiliateLinkResult, detectPlatform } from '../modules/affiliate/platforms';

const router = Router();

router.post('/inspect', requireAuth, async (req, res) => {
  try {
    const schema = z.object({ url: z.string().url() });
    const parsed = schema.parse(req.body);
    const result = detectPlatform(parsed.url);

    return res.json({ result });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid URL' });
  }
});

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const schema = z.object({ url: z.string().url() });
    const parsed = schema.parse(req.body);
    const result = createAffiliateLinkResult(parsed.url);

    const productLink = await prisma.productLink.create({
      data: {
        userId: req.user!.id,
        originalUrl: parsed.url,
        normalizedUrl: result.normalizedUrl,
        platform: result.platform === 'tiktok-shop' ? 'TIKTOK_SHOP' : result.platform === 'lazada' ? 'LAZADA' : 'SHOPEE',
        productIdentifier: result.productIdentifier || null,
        sourceHost: result.normalizedUrl ? new URL(result.normalizedUrl).hostname : null,
        isValid: result.isValid,
      },
    });

    const affiliateLink = await prisma.affiliateLink.create({
      data: {
        userId: req.user!.id,
        productLinkId: productLink.id,
        generatedUrl: result.trackingUrl,
        officialMethod: 'adapter-based',
        trackingCode: `track_${productLink.id}`,
      },
    });

    return res.status(201).json({
      productLink,
      affiliateLink,
      result,
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not generate affiliate link' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const items = await prisma.affiliateLink.findMany({
    where: { userId: req.user!.id },
    include: { productLink: true },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ items });
});

export default router;
