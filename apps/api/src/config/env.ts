import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.APP_PORT || 4000),
  baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/cashback_platform?schema=public',
  vercelAiGatewayApiKey: process.env.VERCEL_AI_GATEWAY_API_KEY || '',
  vercelAiGatewayUrl: process.env.VERCEL_AI_GATEWAY_URL || 'https://ai-gateway.vercel.sh',
};
