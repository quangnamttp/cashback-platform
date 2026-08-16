# API architecture

## Goals

- provide a clear domain split for users, links, orders, commissions, and cashback
- support future production integration with official partner APIs
- preserve a strict separation between raw input URLs and generated tracking links
- maintain audit-friendly transaction records without assuming all commissions are paid

## Resource groups

### Users

- `POST /api/v1/users/register`
- `POST /api/v1/users/login`
- `GET /api/v1/users/me`
- `GET /api/v1/users/:id`
- `PATCH /api/v1/users/:id`

### Product links

- `POST /api/v1/affiliate-links/inspect`
- `POST /api/v1/affiliate-links/generate`
- `GET /api/v1/affiliate-links`
- `GET /api/v1/affiliate-links/:id`

### Orders

- `POST /api/v1/orders`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:id`
- `PATCH /api/v1/orders/:id/status`

### Commissions

- `GET /api/v1/commissions`
- `GET /api/v1/commissions/:id`
- `PATCH /api/v1/commissions/:id/status`

### Cashback

- `GET /api/v1/cashback/history`
- `POST /api/v1/cashback/recalculate`
- `POST /api/v1/cashback/payouts`

## Domain responsibilities

### Link normalization service

Responsible for:

- parsing raw URLs
- detecting marketplace by hostname and URL patterns
- extracting product identifiers when available
- returning a normalized payload for downstream generation logic

### Affiliate generation service

Responsible for:

- generating tracking/affiliate URLs according to the marketplace's supported method
- storing generated URLs against a user and product link
- keeping a record of the method used, such as official redirect flow or partner API call

### Order ingestion service

Responsible for:

- receiving click and order events
- storing status transitions such as pending, confirmed, cancelled, and refunded
- evaluating whether the order is eligible for commission processing

### Commission processor

Responsible for:

- applying configured commission rules
- determining commission amount using configured rates and minimum thresholds
- handling confirmed, rejected, refunded, and cancelled states carefully

### Cashback engine

Responsible for:

- calculating cashback based on valid commission data
- checking whether cashback should be pending, eligible, or rejected
- preserving a full transaction history for audit and user-facing reporting

## Data integrity controls

- every generated link must belong to a real user and product link
- every order must belong to an affiliate link
- every cashback row must align with a valid user and, when available, an order/commission
- all payout-sensitive calculations should be based on confirmed data, never assumed revenue

## Future integration pattern

The architecture is designed to accept a provider adapter per platform:

- `ShopeeAffiliateAdapter`
- `TikTokAffiliateAdapter`
- `LazadaAffiliateAdapter`

Each adapter can implement a common contract for:

- validate credentials
- normalize product URL
- generate affiliate URL
- fetch order status or commission validation
- map provider status to internal domain statuses

This keeps platform differences isolated and avoids hard-coding provider logic across the app.
