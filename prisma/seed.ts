import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@cashback.local' },
    update: {},
    create: {
      email: 'admin@cashback.local',
      passwordHash: 'change-me-before-production',
      fullName: 'System Admin',
      role: 'ADMIN',
      isActive: true,
    },
  });

  await prisma.affiliateNetwork.upsert({
    where: { code: 'shopee' },
    update: {},
    create: {
      code: 'shopee',
      name: 'Shopee',
      platform: 'SHOPEE',
      isEnabled: true,
      notes: 'Seed network entry. Replace with actual credentials and API docs when available.',
    },
  });

  await prisma.affiliateNetwork.upsert({
    where: { code: 'tiktok-shop' },
    update: {},
    create: {
      code: 'tiktok-shop',
      name: 'TikTok Shop',
      platform: 'TIKTOK_SHOP',
      isEnabled: true,
      notes: 'Seed network entry. Replace with actual credentials and API docs when available.',
    },
  });

  await prisma.affiliateNetwork.upsert({
    where: { code: 'lazada' },
    update: {},
    create: {
      code: 'lazada',
      name: 'Lazada',
      platform: 'LAZADA',
      isEnabled: true,
      notes: 'Seed network entry. Replace with actual credentials and API docs when available.',
    },
  });

  console.log('Seed complete.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
