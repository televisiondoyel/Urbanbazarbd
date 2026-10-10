# Urban Bazar — Grocery E-commerce Starter

A runnable first-version grocery storefront and admin dashboard for Urban Bazar. It uses Node.js, Express, SQLite, and a responsive Bengali frontend.

## Included features

- Bengali, mobile-responsive storefront
- Product search and category filters
- Cart with quantity controls
- Checkout with customer name, phone, delivery area/address, notes, and Cash on Delivery
- Server-side product price and stock validation
- Order storage in SQLite and stock decrement on successful order
- Admin login with bcrypt-hashed password and rate limiting
- Admin product create/edit/hide, stock management, order status updates, delivery fee and area settings
- Cancelling an order restores stock
- Starter products are inserted into an empty database on first launch

## Requirements

- Node.js 20 or later
- npm

## Run locally

1. Extract this folder.
2. Copy `.env.example` to `.env`.
3. Change `SESSION_SECRET` to a long random secret and set a unique `ADMIN_PASSWORD`.
4. In this folder, run:

   ```bash
   npm install
   npm start
   ```

5. Open `http://localhost:3000` for the storefront and `http://localhost:3000/admin` for the admin panel.

The initial admin username/password come from `.env` (`admin` and the value of `ADMIN_PASSWORD`). The app creates the admin user the first time it starts. If you change `ADMIN_USERNAME` after the admin user has already been created in the database, the new username will not automatically replace the existing one.

## Important before public launch

- Use HTTPS and a production-grade Node hosting service.
- Set `NODE_ENV=production`, a unique `SESSION_SECRET` (32+ characters), and a strong admin password.
- The default Express memory session store is for local/small testing only. Configure a persistent production session store before a real launch.
- Back up `data/urban-bazar.sqlite` securely and test restoring backups.
- Configure privacy/terms/refund policies and the real business contact details.
- Starter prices and images are demonstration data. Confirm all prices, units, image rights, and stock before publishing.
- Online payment gateway, SMS/WhatsApp notifications, image uploads, delivery-zone-specific rules, customer accounts, refunds, and invoice/receipt printing are not integrated in this starter. Add and test these before claiming those features are live.
- Do not commit `.env`, database files, or credentials to a public repository.

## API overview

- `GET /api/store`, `GET /api/products`, `GET /api/categories`
- `POST /api/orders`
- `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`
- `GET/POST /api/admin/products`, `PUT/DELETE /api/admin/products/:id`
- `GET /api/admin/orders`, `PATCH /api/admin/orders/:id/status`
- `GET/PUT /api/admin/settings`

## Production notes

This is a functional starter project, not a payment-certified or audited production platform. Review security, session storage, privacy, hosting, payment integrations, and local legal/business requirements before handling real customer data at scale.
