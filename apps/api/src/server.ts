import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';

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

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
