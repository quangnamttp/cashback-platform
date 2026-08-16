# Cashback Platform

A production-ready starter for a multi-marketplace affiliate cashback platform focused on Shopee, TikTok Shop, and Lazada.

## Executive summary

This project is designed as a scalable monorepo for:

- user account management
- product link intake from multiple marketplaces
- platform detection and URL normalization
- affiliate/tracking link generation via official or API-based partner flows
- order ingestion and status tracking
- commission and cashback calculation
- admin review, fraud signal handling, and payout workflows

The architecture intentionally avoids assumptions that affiliate payouts will always be successful. Every order and commission can remain in statuses such as pending, confirmed, cancelled, or refunded until they are explicitly validated by the marketplace or partner system.

## Tech stack

- Frontend: Next.js 14 + React + TypeScript
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma ORM
- Cache/queue support: Redis (optional for future rate limiting and async jobs)
- Containerization: Docker Compose for database and local infrastructure
- Deployment orientation: container-friendly and cloud-ready for Vercel, Railway, Render, or Docker-hosted production

## Repository structure

```text
cashback-platform/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/
│       ├── app/
│       ├── package.json
│       └── tsconfig.json
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── docs/
│   └── api-architecture.md
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json
├── tsconfig.base.json
└── README.md
```

## Platform detection and affiliate flow

The project includes an initial URL recognition layer for known marketplaces:

- Shopee
- TikTok Shop
- Lazada

The backend contains a normalization helper that identifies a marketplace from a product URL and returns a structured payload. This is intentionally a seed implementation and does not claim to use live affiliate APIs or production credential flows without provider credentials.

## Database model overview

Core entities include:

- User
- AffiliateNetwork
- ProductLink
- AffiliateLink
- Order
- Commission
- CashbackPayout
- FraudSignal

These models are defined in Prisma and provide a base for future production migration work.

## Local setup

### 1. Clone the repo

```bash
git clone https://github.com/quangnamttp/cashback-platform.git
cd cashback-platform
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set environment variables

```bash
cp .env.example .env
```

Then adjust values for your local environment.

### 4. Launch local database

```bash
docker compose up -d postgres redis
```

### 5. Create and apply Prisma schema

```bash
npx prisma migrate dev --name init
npm run db:seed
```

### 6. Start the app

```bash
npm run dev
```

This starts:

- API at http://localhost:4000
- Web app at http://localhost:3000

## API architecture

The backend exposes versioned endpoints under /api/v1 with area-specific modules:

- /api/v1/users
- /api/v1/affiliate-links
- /api/v1/orders
- /api/v1/commissions
- /api/v1/cashback

Each route follows a straightforward REST pattern, with domain logic isolated to route handlers and service layers.

## Security and compliance notes

- No secrets are committed into source code.
- Environment variables are expected to live in .env or deployment secret stores.
- Provider API tokens and platform credentials are intentionally not hard-coded.
- Fraud checks are modeled but kept intentionally lightweight for initial implementation.

## Production-readiness direction

This scaffold is designed to be ready for future upgrades:

- PostgreSQL in production
- Redis for async workers and rate mitigation
- worker jobs for webhook processing and payout reconciliation
- integration adapters for each marketplace
- audit logs and admin review screens
- webhook verification and signed request validation

## Git workflow

Use the following commands when you are ready to commit and push:

```bash
git add .
git commit -m "feat: initialize cashback platform scaffold"
git push origin main
```

> This repository is intentionally left uncommitted and unpushed at this stage until you review the project structure.

## Notes

This project intentionally does not invent affiliate APIs or platform-specific endpoints. It provides a sound architecture and safe starter implementation for later integration with real marketplace credentials and official partner APIs.
