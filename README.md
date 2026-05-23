# 💊 Pharmacy Backend API

Production-ready REST API for a full-featured online pharmacy built with **Node.js**, **Express 5**, and **MongoDB**. Supports the complete customer journey — from browsing and ordering to prescription verification and payment — plus a full admin panel with analytics and inventory management.

---

## Features

### Authentication & Identity
- **Email + password** login with 5-attempt lockout (15-min cooldown)
- **Phone OTP** login via Twilio SMS (6-digit, 5-min expiry, 60-sec resend cooldown)
- **Saudi National ID (Nafath)** authentication via elm.sa API with dev mock
- **Biometric** login (Face ID / Fingerprint) — server-side token stored in device Keychain/Keystore
- **PIN** fallback (4–8 digits, per device, 5-attempt lockout)
- **Social login** — Google and Apple
- **Guest mode** — browse and cart without an account; convert to full account with cart merge
- **Multi-device sessions** — one Session record per deviceId with refresh-token rotation
- **JWT** access tokens (15 min) + refresh tokens (7 days)

### Medicines & Catalogue
- Full-text search, filter, sort, paginate across 100k+ products
- Prescription-required flag with upload flow
- Drug interaction warnings, dosage info, active ingredients
- Stock tracking with configurable low-stock thresholds and alerts
- Cloudinary image hosting (multi-image per product)
- Category and brand hierarchy with slugs

### Shopping & Orders
- Cart with quantity validation and coupon application
- Wishlist
- Full order lifecycle: `pending → confirmed → processing → shipped → out_for_delivery → delivered`
- Order cancellation, reorder, and tracking
- Scheduled delivery and delivery zone management

### Payments
- **Stripe** credit/debit card payments with webhook handling
- **In-app wallet** — top-up, spend, refund, transaction history
- Coupon system: percentage or fixed-amount discounts with usage limits

### Healthcare Features
- Prescription upload (Cloudinary), pharmacist review and approval/rejection flow
- Flash sales with automatic price application and per-user quantity limits
- Loyalty points awarded on orders, redeemable at checkout
- Referral codes — both referrer and referee earn points

### Notifications
- **Push notifications** via Firebase Cloud Messaging (FCM) — multicast + topic broadcast
- **SMS** via Twilio (order updates, OTP)
- **Email** — bilingual (Arabic/English) HTML templates for welcome, OTP, password reset, order confirmation, order status updates, and low-stock alerts
- In-app notification centre with read/unread state

### Admin Panel
- KPI dashboard: revenue, orders, users, top products, trend charts
- Inventory management: low-stock alerts, expiry warnings, bulk stock updates
- Order status management and driver assignment
- User management (activate/deactivate, role changes)
- Content management: articles, flash sales, delivery zones

### Developer Experience
- **Swagger UI** at `/api-docs` and `/api/docs` — full OpenAPI 3.0 spec
- **Joi validators** for all routes with bilingual Arabic/English error messages
- **AppError** class with factory helpers for consistent error responses
- Structured **Winston** logging with daily log rotation
- **Morgan** HTTP request logging
- Rate limiting: 10 req/15 min on auth routes, 200 req/15 min globally

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 5 |
| Database | MongoDB + Mongoose 8 |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Validation | Joi 17, express-validator |
| Payments | Stripe |
| File uploads | Cloudinary + Multer |
| Email | Nodemailer (SMTP) |
| SMS | Twilio |
| Push | Firebase Admin SDK (FCM) |
| Logging | Winston + Morgan |
| API Docs | Swagger UI + swagger-jsdoc |
| Testing | Jest + Supertest |

---

## Installation

### Prerequisites
- Node.js 18 or higher
- MongoDB Atlas account (or local MongoDB 6+)
- A `.env` file (see [Environment Variables](#environment-variables))

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-org/pharmacy-backend.git
cd pharmacy-backend

# 2. Install dependencies
npm install

# 3. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your credentials

# 4. Start in development mode (nodemon)
npm run dev

# 5. Start in production
npm start
```

The server starts on **http://localhost:5000** by default.
API docs are available at **http://localhost:5000/api-docs**.

### Running Tests

```bash
npm test                # run all tests
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values below.

### Required

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `PORT` | Server port (default `5000`) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | Secret key for refresh tokens (min 32 chars, different from above) |
| `JWT_EXPIRE` | Access token expiry (default `15m`) |
| `CLIENT_URL` | Frontend URL — used in CORS and password reset links |
| `ADMIN_REGISTRATION_SECRET` | Required to register users with `admin` or `delivery` role |

### Email (Nodemailer)

| Variable | Description |
|---|---|
| `EMAIL_HOST` | SMTP host (e.g. `smtp.gmail.com`) |
| `EMAIL_PORT` | SMTP port (`587` for TLS, `465` for SSL) |
| `EMAIL_USER` | SMTP username / sender address |
| `EMAIL_PASS` | SMTP password or app password |
| `EMAIL_FROM_NAME` | Sender display name (default `Pharmacy`) |
| `APP_NAME` | Displayed in email headers (default `صيدليتي \| Pharmacy`) |

### Cloudinary (Image Uploads)

| Variable | Description |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

### Stripe (Payments)

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |

### Twilio (SMS — Optional)

Leave blank to use console-log fallback in development.

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Twilio sender number in E.164 format (e.g. `+12015551234`) |

### Firebase (Push Notifications — Optional)

Leave blank to use console-log fallback in development. Install `firebase-admin` to enable.

| Variable | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON string of the Firebase service account key |

### Nafath (Saudi NIC — Optional)

Leave blank to use the built-in dev mock (auto-approves after 5 seconds).

| Variable | Description |
|---|---|
| `NAFATH_APP_ID` | Application ID from elm.sa |
| `NAFATH_APP_KEY` | Application API key from elm.sa |
| `NAFATH_BASE_URL` | API base URL (default `https://nafath.api.elm.sa`) |
| `NAFATH_SERVICE_ID` | Service identifier (default `PHARMACY_APP`) |

### Other

| Variable | Description |
|---|---|
| `LOG_LEVEL` | Winston log level (default `info`) |
| `BIOMETRIC_TOKEN_EXPIRY_DAYS` | Biometric token validity in days (default `30`) |

---

## API Summary

Full interactive documentation is available at **`/api-docs`** once the server is running.

### System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns status, environment, timestamp |

### Authentication — `POST /api/auth/...`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Register with name, email, password |
| `POST` | `/api/auth/login` | — | Login with email + password |
| `POST` | `/api/auth/login/phone/send` | — | Send phone OTP |
| `POST` | `/api/auth/login/phone/verify` | — | Verify OTP → receive tokens |
| `POST` | `/api/auth/login/phone/resend` | — | Resend OTP (60-sec cooldown) |
| `POST` | `/api/auth/nafath/initiate` | — | Start Nafath (Saudi NIC) auth |
| `GET` | `/api/auth/nafath/status/:txId` | — | Poll Nafath result |
| `POST` | `/api/auth/nafath/callback` | — | Nafath webhook |
| `POST` | `/api/auth/social` | — | Google / Apple login |
| `POST` | `/api/auth/refresh` | — | Rotate refresh token |
| `POST` | `/api/auth/logout` | ✓ | Logout current device |
| `POST` | `/api/auth/logout/all` | ✓ | Logout all devices |
| `GET` | `/api/auth/me` | ✓ | Get current user |
| `GET` | `/api/auth/session` | ✓ | Get session info (biometric, PIN, language…) |
| `POST` | `/api/auth/verify-email` | ✓ | Verify email with OTP |
| `POST` | `/api/auth/resend-otp` | ✓ | Resend email verification OTP |
| `POST` | `/api/auth/forgot-password` | — | Request password reset link |
| `PUT` | `/api/auth/reset-password/:token` | — | Reset password with email token |
| `PUT` | `/api/auth/change-password` | ✓ | Change password (requires current password) |

### Biometric & PIN

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/biometric/enable` | ✓ | Enable biometric for device |
| `POST` | `/api/auth/biometric/verify` | — | Authenticate with biometric token |
| `POST` | `/api/auth/biometric/disable` | ✓ | Disable biometric for device |
| `POST` | `/api/auth/pin/set` | ✓ | Set PIN for device |
| `POST` | `/api/auth/pin/verify` | — | Authenticate with PIN |
| `DELETE` | `/api/auth/pin` | ✓ | Remove PIN |

### Guest Mode

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/guest/session` | Create guest session (returns `guestId`) |
| `GET` | `/api/auth/guest/:guestId` | Get session + cart |
| `POST` | `/api/auth/guest/:guestId/cart` | Add item to guest cart |
| `PUT` | `/api/auth/guest/:guestId/cart/:medicineId` | Update quantity (0 = remove) |
| `DELETE` | `/api/auth/guest/:guestId/cart/:medicineId` | Remove item |
| `POST` | `/api/auth/guest/convert` | Convert guest → user + merge cart |

### Device Management

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/user/devices` | ✓ | List all active sessions |
| `GET` | `/api/user/devices/current` | ✓ | Get current device session |
| `PUT` | `/api/user/devices/:deviceId` | ✓ | Update language / timezone / FCM token |
| `DELETE` | `/api/user/devices/:deviceId` | ✓ | Revoke a specific device |
| `DELETE` | `/api/user/devices` | ✓ | Revoke all devices (logout everywhere) |

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users/profile` | ✓ | Get own profile |
| `PUT` | `/api/users/profile` | ✓ | Update profile |
| `PUT` | `/api/users/avatar` | ✓ | Upload avatar |
| `POST` | `/api/users/addresses` | ✓ | Add delivery address |
| `PUT` | `/api/users/addresses/:id` | ✓ | Update address |
| `DELETE` | `/api/users/addresses/:id` | ✓ | Delete address |
| `GET` | `/api/users` | Admin | List all users |
| `PUT` | `/api/users/:id/status` | Admin | Activate / deactivate user |

### Medicines

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/medicines` | — | List + search (filter, sort, paginate) |
| `GET` | `/api/medicines/:id` | — | Get medicine detail |
| `POST` | `/api/medicines` | Admin/Pharm | Create medicine |
| `PUT` | `/api/medicines/:id` | Admin/Pharm | Update medicine |
| `DELETE` | `/api/medicines/:id` | Admin | Delete medicine |
| `PUT` | `/api/medicines/:id/stock` | Admin/Pharm | Update stock |
| `GET` | `/api/medicines/low-stock` | Admin/Pharm | Low-stock alert list |

### Categories & Brands

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/categories` | — | List categories (with children) |
| `POST` | `/api/categories` | Admin | Create category |
| `PUT` | `/api/categories/:id` | Admin | Update category |
| `DELETE` | `/api/categories/:id` | Admin | Delete category |
| `GET` | `/api/brands` | — | List brands |
| `POST` | `/api/brands` | Admin | Create brand |

### Cart & Wishlist

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/cart` | ✓ | Get cart with totals |
| `POST` | `/api/cart` | ✓ | Add item |
| `PUT` | `/api/cart/:medicineId` | ✓ | Update quantity |
| `DELETE` | `/api/cart/:medicineId` | ✓ | Remove item |
| `DELETE` | `/api/cart` | ✓ | Clear cart |
| `POST` | `/api/cart/coupon` | ✓ | Apply coupon code |
| `DELETE` | `/api/cart/coupon` | ✓ | Remove coupon |
| `GET` | `/api/wishlist` | ✓ | Get wishlist |
| `POST` | `/api/wishlist/:medicineId` | ✓ | Add to wishlist |
| `DELETE` | `/api/wishlist/:medicineId` | ✓ | Remove from wishlist |

### Orders

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/orders` | ✓ | Place order |
| `GET` | `/api/orders` | ✓ | My orders (paginated) |
| `GET` | `/api/orders/:id` | ✓ | Order detail + tracking |
| `PUT` | `/api/orders/:id/cancel` | ✓ | Cancel order |
| `POST` | `/api/orders/:id/reorder` | ✓ | Reorder (clone to cart) |
| `GET` | `/api/orders/admin` | Admin | All orders |
| `PUT` | `/api/orders/:id/status` | Admin/Pharm | Update order status |

### Payments & Wallet

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/payments/create-intent` | ✓ | Create Stripe PaymentIntent |
| `POST` | `/api/payments/webhook` | — | Stripe webhook handler |
| `GET` | `/api/payments/history` | ✓ | Payment history |
| `POST` | `/api/payments/:id/refund` | Admin | Issue refund |
| `GET` | `/api/wallet` | ✓ | Wallet balance + transactions |
| `POST` | `/api/wallet/top-up` | ✓ | Top up wallet |

### Prescriptions

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/prescriptions` | ✓ | Upload prescription image |
| `GET` | `/api/prescriptions` | ✓ | My prescriptions |
| `GET` | `/api/prescriptions/:id` | ✓ | Prescription detail |
| `PUT` | `/api/prescriptions/:id/status` | Admin/Pharm | Approve / reject |

### Reviews

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/medicines/:id/reviews` | — | Reviews for a medicine |
| `POST` | `/api/medicines/:id/reviews` | ✓ | Submit review (must have purchased) |
| `PUT` | `/api/reviews/:id` | ✓ | Edit own review |
| `DELETE` | `/api/reviews/:id` | ✓ | Delete own review |

### Flash Sales, Coupons, Referrals

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/flash-sales` | — | Active flash sales |
| `POST` | `/api/flash-sales` | Admin | Create flash sale |
| `GET` | `/api/coupons/validate/:code` | ✓ | Validate coupon code |
| `POST` | `/api/coupons` | Admin | Create coupon |
| `GET` | `/api/referrals/my-code` | ✓ | Get my referral code |
| `POST` | `/api/referrals/apply` | ✓ | Apply referral code |

### Notifications & Articles

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/notifications` | ✓ | My notifications (with unread count) |
| `PATCH` | `/api/notifications/read-all` | ✓ | Mark all as read |
| `PATCH` | `/api/notifications/:id/read` | ✓ | Mark one as read |
| `DELETE` | `/api/notifications` | ✓ | Clear all |
| `POST` | `/api/notifications/send` | Admin | Broadcast to users |
| `GET` | `/api/articles` | — | Published articles |
| `POST` | `/api/articles` | Admin/Pharm | Create article |

### Admin — Dashboard, Inventory & Reports

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/dashboard/stats` | Admin | KPIs: revenue, orders, users, stock |
| `GET` | `/api/admin/dashboard/revenue` | Admin | Monthly revenue chart |
| `GET` | `/api/admin/dashboard/top-products` | Admin | Best-selling medicines |
| `GET` | `/api/admin/dashboard/order-breakdown` | Admin | Order count by status |
| `GET` | `/api/admin/inventory/summary` | Admin | Stock value + alert counts |
| `GET` | `/api/admin/inventory/low-stock` | Admin | Medicines below threshold |
| `GET` | `/api/admin/inventory/expiry` | Admin | Expiring / expired medicines |
| `POST` | `/api/admin/inventory/bulk-stock` | Admin | Bulk stock update |
| `GET` | `/api/admin/reports/sales` | Admin | Sales report |
| `GET` | `/api/admin/reports/inventory` | Admin | Inventory report |
| `GET` | `/api/admin/reports/low-stock` | Admin | Low-stock report |
| `GET` | `/api/admin/reports/revenue` | Admin | Revenue by period |
| `GET` | `/api/admin/reports/top-medicines` | Admin | Top-selling medicines |

---

## Folder Structure

```
pharmacy-backend/
├── index.js                        # Entry point — connects DB, starts server
├── .env.example                    # Environment variable template
│
└── src/
    ├── app.js                      # Express app factory (middleware + routes)
    ├── db.js                       # Mongoose connection
    │
    ├── config/
    │   ├── cors.config.js          # CORS origins
    │   ├── logger.config.js        # Winston logger with daily rotation
    │   ├── swagger.config.js       # OpenAPI 3.0 spec (~1100 lines)
    │   └── index.js                # Barrel export
    │
    ├── controllers/
    │   ├── auth/                    # Authentication & identity domain
    │   │   ├── auth.controller.js      # Register, login, tokens, session
    │   │   ├── biometric.controller.js # Enable/verify/disable biometric
    │   │   ├── pin.controller.js       # Set/verify/remove PIN
    │   │   ├── phoneOtp.controller.js  # Send/verify phone OTP
    │   │   ├── nafath.controller.js    # Saudi NIC (elm.sa) auth
    │   │   ├── guest.controller.js     # Guest sessions + cart
    │   │   └── device.controller.js    # Multi-device management
    │   ├── user.controller.js      # Profiles, addresses, loyalty
    │   ├── medicine.controller.js  # Catalogue CRUD + stock
    │   ├── category.controller.js
    │   ├── brand.controller.js
    │   ├── cart.controller.js
    │   ├── wishlist.controller.js
    │   ├── order.controller.js     # Order lifecycle + notifications
    │   ├── payment.controller.js   # Stripe + wallet
    │   ├── wallet.controller.js
    │   ├── prescription.controller.js
    │   ├── coupon.controller.js
    │   ├── review.controller.js
    │   ├── flashsale.controller.js
    │   ├── referral.controller.js
    │   ├── delivery.controller.js
    │   ├── notification.controller.js
    │   ├── article.controller.js
    │   ├── report.controller.js
    │   └── admin/
    │       ├── dashboard.controller.js
    │       └── inventory.controller.js
    │
    ├── middleware/
    │   ├── auth.middleware.js       # JWT protect + populate req.user
    │   ├── role.middleware.js       # Role-based authorisation
    │   ├── error.middleware.js      # Global error handler (AppError)
    │   ├── validate.middleware.js   # express-validator result handler
    │   ├── joiValidate.middleware.js# Joi schema validation factory
    │   ├── rateLimiter.middleware.js# authLimiter + generalLimiter
    │   ├── logger.middleware.js     # Morgan HTTP logging
    │   └── index.js                # Barrel export
    │
    ├── models/
    │   ├── User.model.js           # Auth, loyalty, Nafath, OTP fields
    │   ├── Session.model.js        # Per-device sessions (biometric, PIN, FCM)
    │   ├── GuestSession.model.js   # Guest cart sessions (7-day TTL)
    │   ├── Medicine.model.js       # Catalogue, stock, interactions
    │   ├── Category.model.js
    │   ├── Brand.model.js
    │   ├── Cart.model.js
    │   ├── Wishlist.model.js
    │   ├── Order.model.js
    │   ├── Payment.model.js
    │   ├── Wallet.model.js
    │   ├── Prescription.model.js
    │   ├── Review.model.js
    │   ├── Coupon.model.js
    │   ├── FlashSale.model.js
    │   ├── LoyaltyTransaction.model.js
    │   ├── Notification.model.js
    │   ├── DeliveryZone.model.js
    │   ├── Article.model.js
    │   └── index.js                # Barrel export (all 19 models)
    │
    ├── routes/
    │   ├── index.js                # Central router — mounts all routes onto app
    │   ├── auth.routes.js          # All auth routes with Joi validators
    │   ├── device.routes.js
    │   ├── user.routes.js
    │   ├── medicine.routes.js
    │   ├── category.routes.js
    │   ├── brand.routes.js
    │   ├── cart.routes.js
    │   ├── wishlist.routes.js
    │   ├── order.routes.js
    │   ├── payment.routes.js
    │   ├── wallet.routes.js
    │   ├── prescription.routes.js
    │   ├── coupon.routes.js
    │   ├── review.routes.js
    │   ├── flashsale.routes.js
    │   ├── referral.routes.js
    │   ├── delivery.routes.js
    │   ├── notification.routes.js
    │   ├── article.routes.js
    │   ├── report.routes.js
    │   └── admin/
    │       ├── dashboard.routes.js
    │       └── inventory.routes.js
    │
    ├── utils/
    │   ├── AppError.js             # Operational error class + factory helpers
    │   ├── token.util.js           # generateAccessToken / generateRefreshToken
    │   ├── session.util.js         # extractDeviceInfo / upsertSession
    │   ├── email.util.js           # sendEmail + named template shortcuts
    │   ├── email.templates.js      # RTL HTML email templates (6 types)
    │   ├── sms.util.js             # Twilio SMS with dev console fallback
    │   ├── push.util.js            # Firebase FCM (single, multicast, topic)
    │   ├── notification.util.js    # createNotification / bulkNotify (DB + push + SMS)
    │   ├── cloudinary.util.js      # Image upload/delete + multer memory storage
    │   ├── apiFeatures.util.js     # APIFeatures class (filter/sort/paginate)
    │   └── index.js                # Barrel export
    │
    └── validators/
        ├── joi.validators.js       # Joi schemas for ALL routes, bilingual messages
        ├── auth.validator.js       # express-validator chains (legacy)
        ├── medicine.validator.js
        ├── category.validator.js
        ├── order.validator.js
        ├── prescription.validator.js
        └── index.js                # Barrel export (schemas + legacy chains)
```

---

## Error Response Format

All errors follow a consistent shape:

```json
{
  "success": false,
  "status": "fail",
  "message": "Email already registered",
  "messageAr": "البريد الإلكتروني مستخدم بالفعل",
  "code": "DUPLICATE_KEY"
}
```

Validation errors include a field-level breakdown:

```json
{
  "success": false,
  "status": "fail",
  "message": "Validation failed | فشل التحقق من البيانات",
  "errors": [
    { "field": "email", "message": "Invalid email address", "messageAr": "البريد الإلكتروني غير صالح" },
    { "field": "password", "message": "Password must be at least 8 characters", "messageAr": "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }
  ]
}
```

In `NODE_ENV=development`, a `stack` trace is appended to all error responses.

---

## Authentication Flow

```
App launch
  └─ Has stored token?
       ├─ Yes → GET /api/auth/session → route to dashboard
       └─ No  →
            ├─ Returning user + biometric enabled? → POST /api/auth/biometric/verify
            ├─ Returning user + PIN set?           → POST /api/auth/pin/verify
            └─ Login screen:
                 ├─ Email + Password  → POST /api/auth/login
                 ├─ Phone OTP         → POST /api/auth/login/phone/send
                 │                      POST /api/auth/login/phone/verify
                 ├─ Nafath (Saudi NIC)→ POST /api/auth/nafath/initiate
                 │                      GET  /api/auth/nafath/status/:txId  (poll every 3s)
                 └─ Guest             → POST /api/auth/guest/session → browse
                                        POST /api/auth/guest/convert → register + merge cart
```

---

## User Roles

| Role | Access |
|---|---|
| `customer` | Browse, cart, orders, prescriptions, wallet, wishlist |
| `pharmacist` | Above + manage medicines, verify prescriptions, update order status |
| `admin` | Full access including user management, analytics, inventory, coupons |
| `delivery` | View assigned orders, mark as delivered |

---

## License

MIT
