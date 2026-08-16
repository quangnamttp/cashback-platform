import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { requireAuth } from './lib/auth';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import affiliatePlatformRoutes from './routes/affiliate-platforms';
import linkRoutes from './routes/links';
import orderRoutes from './routes/orders';
import commissionRoutes from './routes/commissions';
import cashbackRoutes from './routes/cashback';
import adminRoutes from './routes/admin';

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cashback-api' });
});

app.get('/api/v1', (_req, res) => {
  res.json({
    name: 'Cashback Platform API',
    version: 'v1',
    status: 'ready',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/affiliate-platforms', affiliatePlatformRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/cashback', cashbackRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/protected', requireAuth, (req, res) => {
  res.json({ message: 'Protected resource', user: req.user });
});

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
