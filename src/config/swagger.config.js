const swaggerJsdoc = require("swagger-jsdoc");

// ─── Reusable Component Schemas ───────────────────────────────────────────────
const components = {
  securitySchemes: {
    bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
  },
  schemas: {
    // ── Primitives ──────────────────────────────────────────────────────────
    Pagination: {
      type: "object",
      properties: {
        page:  { type: "integer", example: 1 },
        limit: { type: "integer", example: 20 },
        total: { type: "integer", example: 100 },
        pages: { type: "integer", example: 5 },
      },
    },
    Success: {
      type: "object",
      properties: { success: { type: "boolean", example: true } },
    },
    Error: {
      type: "object",
      properties: {
        success: { type: "boolean", example: false },
        message: { type: "string", example: "Something went wrong" },
      },
    },
    ValidationError: {
      type: "object",
      properties: {
        success: { type: "boolean", example: false },
        errors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field:   { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    // ── Address ─────────────────────────────────────────────────────────────
    Address: {
      type: "object",
      required: ["fullName", "phone", "street", "city"],
      properties: {
        _id:        { type: "string" },
        label:      { type: "string", enum: ["home", "work", "other"], default: "home" },
        fullName:   { type: "string", example: "Sara Ahmed" },
        phone:      { type: "string", example: "0501234567" },
        street:     { type: "string", example: "123 King Fahd Road" },
        city:       { type: "string", example: "Riyadh" },
        region:     { type: "string", example: "Riyadh Region" },
        postalCode: { type: "string", example: "12271" },
        country:    { type: "string", default: "SA" },
        lat:        { type: "number" },
        lng:        { type: "number" },
        isDefault:  { type: "boolean", default: false },
      },
    },
    // ── User ────────────────────────────────────────────────────────────────
    UserPublic: {
      type: "object",
      properties: {
        _id:             { type: "string" },
        name:            { type: "string", example: "Sara Ahmed" },
        email:           { type: "string", example: "sara@example.com" },
        phone:           { type: "string", example: "0501234567" },
        role:            { type: "string", enum: ["customer", "pharmacist", "admin", "delivery"] },
        avatar:          { type: "string", nullable: true },
        isEmailVerified: { type: "boolean" },
        loyaltyPoints:   { type: "integer", example: 120 },
        referralCode:    { type: "string", example: "A3F9B2C1" },
        addresses:       { type: "array", items: { $ref: "#/components/schemas/Address" } },
        createdAt:       { type: "string", format: "date-time" },
      },
    },
    // ── Auth tokens ──────────────────────────────────────────────────────────
    AuthTokens: {
      type: "object",
      properties: {
        success:      { type: "boolean", example: true },
        accessToken:  { type: "string" },
        refreshToken: { type: "string" },
        user:         { $ref: "#/components/schemas/UserPublic" },
      },
    },
    // ── Medicine ─────────────────────────────────────────────────────────────
    MedicineImage: {
      type: "object",
      properties: {
        url:       { type: "string" },
        public_id: { type: "string" },
        isMain:    { type: "boolean" },
      },
    },
    Medicine: {
      type: "object",
      properties: {
        _id:                  { type: "string" },
        name:                 { type: "string", example: "Paracetamol 500mg" },
        nameAr:               { type: "string" },
        slug:                 { type: "string", example: "paracetamol-500mg" },
        description:          { type: "string" },
        images:               { type: "array", items: { $ref: "#/components/schemas/MedicineImage" } },
        category:             { type: "object", properties: { _id: { type: "string" }, name: { type: "string" }, slug: { type: "string" } } },
        brand:                { type: "object", properties: { _id: { type: "string" }, name: { type: "string" } } },
        price:                { type: "number", example: 15.0 },
        comparePrice:         { type: "number", example: 20.0 },
        discount:             { type: "number", example: 10, description: "Percentage 0-100" },
        finalPrice:           { type: "number", example: 13.5 },
        stock:                { type: "integer", example: 200 },
        lowStockThreshold:    { type: "integer", example: 10 },
        requiresPrescription: { type: "boolean", example: false },
        dosageForm:           { type: "string", enum: ["tablet", "capsule", "syrup", "injection", "cream", "drops", "inhaler", "patch", "other"] },
        strength:             { type: "string", example: "500mg" },
        usage:                { type: "string" },
        sideEffects:          { type: "string" },
        warnings:             { type: "string" },
        ingredients:          { type: "array", items: { type: "string" } },
        expiryDate:           { type: "string", format: "date" },
        manufacturer:         { type: "string" },
        sku:                  { type: "string" },
        barcode:              { type: "string" },
        rating:               { type: "number", example: 4.5 },
        reviewCount:          { type: "integer" },
        soldCount:            { type: "integer" },
        isActive:             { type: "boolean" },
        isFeatured:           { type: "boolean" },
        isFlashSale:          { type: "boolean" },
        flashSalePrice:       { type: "number", nullable: true },
        flashSaleEnd:         { type: "string", format: "date-time", nullable: true },
        tags:                 { type: "array", items: { type: "string" } },
        createdAt:            { type: "string", format: "date-time" },
      },
    },
    MedicineInput: {
      type: "object",
      required: ["name", "price", "stock"],
      properties: {
        name:                 { type: "string" },
        nameAr:               { type: "string" },
        description:          { type: "string" },
        category:             { type: "string", description: "Category ObjectId" },
        brand:                { type: "string", description: "Brand ObjectId" },
        price:                { type: "number" },
        comparePrice:         { type: "number" },
        discount:             { type: "number", minimum: 0, maximum: 100 },
        stock:                { type: "integer", minimum: 0 },
        lowStockThreshold:    { type: "integer" },
        requiresPrescription: { type: "boolean" },
        dosageForm:           { type: "string" },
        strength:             { type: "string" },
        usage:                { type: "string" },
        sideEffects:          { type: "string" },
        warnings:             { type: "string" },
        ingredients:          { type: "array", items: { type: "string" } },
        expiryDate:           { type: "string", format: "date" },
        manufacturer:         { type: "string" },
        sku:                  { type: "string" },
        barcode:              { type: "string" },
        tags:                 { type: "array", items: { type: "string" } },
        isFeatured:           { type: "boolean" },
      },
    },
    // ── Category ─────────────────────────────────────────────────────────────
    Category: {
      type: "object",
      properties: {
        _id:         { type: "string" },
        name:        { type: "string", example: "Analgesics" },
        nameAr:      { type: "string" },
        slug:        { type: "string" },
        description: { type: "string" },
        image:       { type: "string", nullable: true },
        parent:      { type: "string", nullable: true, description: "Parent category ObjectId" },
        isFeatured:  { type: "boolean" },
        isActive:    { type: "boolean" },
      },
    },
    // ── Order ────────────────────────────────────────────────────────────────
    OrderItem: {
      type: "object",
      required: ["medicine", "quantity"],
      properties: {
        medicine:             { type: "string", description: "Medicine ObjectId" },
        quantity:             { type: "integer", minimum: 1, example: 2 },
        price:                { type: "number" },
        name:                 { type: "string" },
        requiresPrescription: { type: "boolean" },
      },
    },
    Order: {
      type: "object",
      properties: {
        _id:             { type: "string" },
        orderNumber:     { type: "string", example: "ORD-1711234567890-42" },
        user:            { $ref: "#/components/schemas/UserPublic" },
        items:           { type: "array", items: { $ref: "#/components/schemas/OrderItem" } },
        shippingAddress: { $ref: "#/components/schemas/Address" },
        status:          { type: "string", enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"] },
        paymentMethod:   { type: "string", enum: ["cash", "card", "wallet"] },
        paymentStatus:   { type: "string", enum: ["pending", "paid", "failed", "refunded"] },
        subtotal:        { type: "number" },
        deliveryFee:     { type: "number" },
        discount:        { type: "number" },
        couponDiscount:  { type: "number" },
        total:           { type: "number", example: 47.5 },
        loyaltyPointsEarned: { type: "integer" },
        loyaltyPointsUsed:   { type: "integer" },
        trackingHistory: {
          type: "array",
          items: {
            type: "object",
            properties: {
              status:    { type: "string" },
              note:      { type: "string" },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    CreateOrderInput: {
      type: "object",
      required: ["items", "shippingAddress", "paymentMethod"],
      properties: {
        items:            { type: "array", items: { $ref: "#/components/schemas/OrderItem" } },
        shippingAddress:  { $ref: "#/components/schemas/Address" },
        paymentMethod:    { type: "string", enum: ["cash", "card", "wallet"] },
        prescriptionId:   { type: "string", nullable: true },
        couponCode:       { type: "string", nullable: true },
        deliveryZone:     { type: "string", nullable: true },
        deliverySlot:     { type: "object", properties: { date: { type: "string" }, from: { type: "string" }, to: { type: "string" } } },
        useLoyaltyPoints: { type: "boolean", default: false },
        useWallet:        { type: "boolean", default: false },
        notes:            { type: "string" },
      },
    },
    // ── Cart ─────────────────────────────────────────────────────────────────
    CartItem: {
      type: "object",
      properties: {
        _id:      { type: "string" },
        medicine: { $ref: "#/components/schemas/Medicine" },
        quantity: { type: "integer" },
        price:    { type: "number" },
        name:     { type: "string" },
      },
    },
    Cart: {
      type: "object",
      properties: {
        _id:            { type: "string" },
        items:          { type: "array", items: { $ref: "#/components/schemas/CartItem" } },
        subtotal:       { type: "number" },
        couponDiscount: { type: "number" },
        total:          { type: "number" },
        itemCount:      { type: "integer" },
        coupon:         { type: "string", nullable: true },
      },
    },
    // ── Review ───────────────────────────────────────────────────────────────
    Review: {
      type: "object",
      properties: {
        _id:                { type: "string" },
        medicine:           { type: "string" },
        user:               { type: "object", properties: { name: { type: "string" }, avatar: { type: "string" } } },
        rating:             { type: "integer", minimum: 1, maximum: 5, example: 4 },
        title:              { type: "string", example: "Great product" },
        comment:            { type: "string" },
        isVerifiedPurchase: { type: "boolean" },
        helpfulCount:       { type: "integer" },
        status:             { type: "string", enum: ["pending", "approved", "rejected"] },
        createdAt:          { type: "string", format: "date-time" },
      },
    },
    // ── Coupon ───────────────────────────────────────────────────────────────
    Coupon: {
      type: "object",
      properties: {
        _id:          { type: "string" },
        code:         { type: "string", example: "SAVE20" },
        type:         { type: "string", enum: ["percentage", "fixed"] },
        value:        { type: "number", example: 20 },
        minOrderAmount: { type: "number" },
        maxDiscount:  { type: "number", nullable: true },
        usageLimit:   { type: "integer", nullable: true },
        perUserLimit: { type: "integer", default: 1 },
        validFrom:    { type: "string", format: "date-time" },
        validUntil:   { type: "string", format: "date-time" },
        isActive:     { type: "boolean" },
      },
    },
    // ── Flash Sale ───────────────────────────────────────────────────────────
    FlashSale: {
      type: "object",
      properties: {
        _id:         { type: "string" },
        name:        { type: "string", example: "Weekend Mega Sale" },
        discount:    { type: "integer", example: 30, description: "Percentage 1-99" },
        startDate:   { type: "string", format: "date-time" },
        endDate:     { type: "string", format: "date-time" },
        medicines:   { type: "array", items: { $ref: "#/components/schemas/Medicine" } },
        banner:      { type: "object", properties: { url: { type: "string" } } },
        isActive:    { type: "boolean" },
        isLive:      { type: "boolean", readOnly: true },
      },
    },
    // ── Notification ─────────────────────────────────────────────────────────
    Notification: {
      type: "object",
      properties: {
        _id:       { type: "string" },
        type:      { type: "string", enum: ["order", "prescription", "promotion", "reminder", "system", "delivery"] },
        title:     { type: "string" },
        body:      { type: "string" },
        isRead:    { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    // ── Delivery Zone ────────────────────────────────────────────────────────
    DeliveryZone: {
      type: "object",
      properties: {
        _id:                   { type: "string" },
        name:                  { type: "string", example: "Riyadh Central" },
        cities:                { type: "array", items: { type: "string" } },
        deliveryFee:           { type: "number", example: 15 },
        freeDeliveryThreshold: { type: "number", example: 200 },
        minDeliveryTime:       { type: "integer", example: 1 },
        maxDeliveryTime:       { type: "integer", example: 4 },
        slots: {
          type: "array",
          items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, isActive: { type: "boolean" } } },
        },
        isActive: { type: "boolean" },
      },
    },
    // ── Wallet ───────────────────────────────────────────────────────────────
    WalletTransaction: {
      type: "object",
      properties: {
        type:         { type: "string", enum: ["credit", "debit", "refund"] },
        amount:       { type: "number" },
        description:  { type: "string" },
        balanceAfter: { type: "number" },
        createdAt:    { type: "string", format: "date-time" },
      },
    },
    // ── Article ──────────────────────────────────────────────────────────────
    Article: {
      type: "object",
      properties: {
        _id:       { type: "string" },
        title:     { type: "string" },
        slug:      { type: "string" },
        excerpt:   { type: "string" },
        content:   { type: "string" },
        image:     { type: "object", properties: { url: { type: "string" } } },
        author:    { type: "object", properties: { name: { type: "string" } } },
        category:  { type: "string", enum: ["health_tips", "medicine_info", "nutrition", "wellness", "news"] },
        tags:      { type: "array", items: { type: "string" } },
        views:     { type: "integer" },
        isFeatured: { type: "boolean" },
        publishedAt: { type: "string", format: "date-time" },
      },
    },
  },
  responses: {
    Unauthorized: {
      description: "Missing or invalid token",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    },
    Forbidden: {
      description: "Insufficient permissions",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    },
    NotFound: {
      description: "Resource not found",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    },
    ValidationError: {
      description: "Validation failed",
      content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } },
    },
  },
  parameters: {
    PageParam:  { name: "page",  in: "query", schema: { type: "integer", default: 1 } },
    LimitParam: { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
    IdParam:    { name: "id",    in: "path",  required: true, schema: { type: "string" } },
  },
};

// ─── Full Path Definitions ─────────────────────────────────────────────────────
const paths = {

  // ── Health ──────────────────────────────────────────────────────────────────
  "/health": {
    get: {
      tags: ["System"],
      summary: "Health check",
      security: [],
      responses: {
        200: { description: "Service is running", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, status: { type: "string", example: "ok" }, environment: { type: "string" }, timestamp: { type: "string" } } } } } },
      },
    },
  },

  // ── Auth ────────────────────────────────────────────────────────────────────
  "/api/auth/register": {
    post: {
      tags: ["Auth"],
      summary: "Register a new user",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "email", "password"],
              properties: {
                name:         { type: "string", example: "Sara Ahmed" },
                email:        { type: "string", format: "email", example: "sara@example.com" },
                password:     { type: "string", minLength: 6, example: "secret123" },
                phone:        { type: "string", example: "0501234567" },
                role:         { type: "string", enum: ["customer", "pharmacist"], default: "customer" },
                referralCode: { type: "string", example: "A3F9B2C1", description: "Optional referral code from another user" },
                adminSecret:  { type: "string", description: "Required to register role: admin or delivery" },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Registered successfully", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } } },
        400: { $ref: "#/components/responses/ValidationError" },
      },
    },
  },
  "/api/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Login with email and password",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email:    { type: "string", format: "email" },
                password: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Logged in", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } } },
        401: { description: "Invalid credentials" },
        403: { description: "Account deactivated" },
      },
    },
  },
  "/api/auth/refresh": {
    post: {
      tags: ["Auth"],
      summary: "Rotate refresh token → new access + refresh token",
      security: [],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } } },
      responses: {
        200: { description: "New tokens issued", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, accessToken: { type: "string" }, refreshToken: { type: "string" } } } } } },
        403: { description: "Refresh token expired or invalid" },
      },
    },
  },
  "/api/auth/logout": {
    post: {
      tags: ["Auth"],
      summary: "Logout (invalidate refresh token)",
      responses: { 200: { description: "Logged out" }, 401: { $ref: "#/components/responses/Unauthorized" } },
    },
  },
  "/api/auth/me": {
    get: {
      tags: ["Auth"],
      summary: "Get current authenticated user",
      responses: {
        200: { description: "Current user", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, user: { $ref: "#/components/schemas/UserPublic" } } } } } },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  },
  "/api/auth/verify-email": {
    post: {
      tags: ["Auth"],
      summary: "Verify email with OTP sent after registration",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["otp"], properties: { otp: { type: "string", example: "483920" } } } } } },
      responses: { 200: { description: "Email verified" }, 400: { description: "Invalid or expired OTP" } },
    },
  },
  "/api/auth/resend-otp": {
    post: {
      tags: ["Auth"],
      summary: "Resend email verification OTP",
      responses: { 200: { description: "OTP sent" } },
    },
  },
  "/api/auth/forgot-password": {
    post: {
      tags: ["Auth"],
      summary: "Request password reset link",
      security: [],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } } },
      responses: { 200: { description: "Reset link sent (always 200 to prevent enumeration)" } },
    },
  },
  "/api/auth/reset-password/{token}": {
    put: {
      tags: ["Auth"],
      summary: "Reset password using token from email",
      security: [],
      parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["password"], properties: { password: { type: "string", minLength: 6 } } } } } },
      responses: { 200: { description: "Password reset" }, 400: { description: "Token invalid or expired" } },
    },
  },
  "/api/auth/social": {
    post: {
      tags: ["Auth"],
      summary: "Social login / register (Google, Apple)",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["provider", "socialId", "email"],
              properties: {
                provider: { type: "string", enum: ["google", "apple"] },
                socialId: { type: "string" },
                email:    { type: "string", format: "email" },
                name:     { type: "string" },
                avatar:   { type: "string" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Logged in / registered via social", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } } } },
    },
  },

  // ── Users ───────────────────────────────────────────────────────────────────
  "/api/users/me": {
    get:  { tags: ["Users"], summary: "Get my profile", responses: { 200: { description: "Profile with wallet balance" }, 401: { $ref: "#/components/responses/Unauthorized" } } },
    put:  { tags: ["Users"], summary: "Update my profile", requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, fcmToken: { type: "string" } } } } } }, responses: { 200: { description: "Updated" } } },
  },
  "/api/users/me/avatar": {
    post: { tags: ["Users"], summary: "Upload avatar image", requestBody: { content: { "multipart/form-data": { schema: { type: "object", properties: { avatar: { type: "string", format: "binary" } } } } } }, responses: { 200: { description: "Avatar updated" } } },
  },
  "/api/users/me/change-password": {
    put: { tags: ["Users"], summary: "Change password", requestBody: { content: { "application/json": { schema: { type: "object", required: ["currentPassword", "newPassword"], properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 6 } } } } } }, responses: { 200: { description: "Password changed, all sessions invalidated" }, 400: { description: "Wrong current password" } } },
  },
  "/api/users/me/loyalty": {
    get: { tags: ["Users"], summary: "Get loyalty points balance and history", parameters: [{ $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "Balance and transactions" } } },
  },
  "/api/users/me/addresses": {
    get:  { tags: ["Users"], summary: "List my saved addresses", responses: { 200: { description: "Address list" } } },
    post: { tags: ["Users"], summary: "Add a new address", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Address" } } } }, responses: { 201: { description: "Address added" } } },
  },
  "/api/users/me/addresses/{addressId}": {
    put:    { tags: ["Users"], summary: "Update address", parameters: [{ name: "addressId", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Address" } } } }, responses: { 200: { description: "Updated" } } },
    delete: { tags: ["Users"], summary: "Delete address", parameters: [{ name: "addressId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Deleted" } } },
  },
  "/api/users/me/addresses/{addressId}/default": {
    patch: { tags: ["Users"], summary: "Set address as default", parameters: [{ name: "addressId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Default updated" } } },
  },
  "/api/users": {
    get: { tags: ["Users"], summary: "List all users (admin)", parameters: [{ name: "role", in: "query", schema: { type: "string" } }, { name: "search", in: "query", schema: { type: "string" } }, { name: "isActive", in: "query", schema: { type: "boolean" } }, { $ref: "#/components/parameters/PageParam" }, { $ref: "#/components/parameters/LimitParam" }], responses: { 200: { description: "User list" }, 403: { $ref: "#/components/responses/Forbidden" } } },
  },
  "/api/users/{id}/status": {
    patch: { tags: ["Users"], summary: "Ban / unban user (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { isActive: { type: "boolean" }, blockedReason: { type: "string" } } } } } }, responses: { 200: { description: "Status updated" } } },
  },
  "/api/users/{id}/role": {
    patch: { tags: ["Users"], summary: "Change user role (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["customer", "pharmacist", "admin", "delivery"] } } } } } }, responses: { 200: { description: "Role updated" } } },
  },

  // ── Medicines ───────────────────────────────────────────────────────────────
  "/api/medicines": {
    get: {
      tags: ["Medicines"],
      summary: "List medicines",
      security: [],
      parameters: [
        { name: "search",               in: "query", schema: { type: "string" }, description: "Full-text search" },
        { name: "category",             in: "query", schema: { type: "string" }, description: "Category ObjectId" },
        { name: "brand",                in: "query", schema: { type: "string" } },
        { name: "minPrice",             in: "query", schema: { type: "number" } },
        { name: "maxPrice",             in: "query", schema: { type: "number" } },
        { name: "requiresPrescription", in: "query", schema: { type: "boolean" } },
        { name: "inStock",              in: "query", schema: { type: "boolean" } },
        { name: "featured",             in: "query", schema: { type: "boolean" } },
        { name: "flashSale",            in: "query", schema: { type: "boolean" } },
        { name: "dosageForm",           in: "query", schema: { type: "string" } },
        { name: "tags",                 in: "query", schema: { type: "string" }, description: "Comma-separated tags" },
        { name: "sort",                 in: "query", schema: { type: "string", enum: ["price_asc", "price_desc", "rating", "bestseller", "newest", "name"] } },
        { $ref: "#/components/parameters/PageParam" },
        { $ref: "#/components/parameters/LimitParam" },
      ],
      responses: {
        200: {
          description: "Paginated medicine list",
          content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, medicines: { type: "array", items: { $ref: "#/components/schemas/Medicine" } }, pagination: { $ref: "#/components/schemas/Pagination" } } } } },
        },
      },
    },
    post: {
      tags: ["Medicines"],
      summary: "Create medicine (admin/pharmacist)",
      requestBody: { required: true, content: { "multipart/form-data": { schema: { allOf: [{ $ref: "#/components/schemas/MedicineInput" }, { type: "object", properties: { images: { type: "array", items: { type: "string", format: "binary" }, description: "Up to 5 images" } } }] } } } },
      responses: { 201: { description: "Created" }, 403: { $ref: "#/components/responses/Forbidden" } },
    },
  },
  "/api/medicines/alerts/low-stock": {
    get: { tags: ["Medicines"], summary: "Medicines at or below reorder threshold (admin/pharmacist)", responses: { 200: { description: "Low stock list" } } },
  },
  "/api/medicines/alerts/expiring": {
    get: { tags: ["Medicines"], summary: "Medicines expiring soon (admin/pharmacist)", parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 30 } }], responses: { 200: { description: "Expiring medicines" } } },
  },
  "/api/medicines/check-interactions": {
    post: { tags: ["Medicines"], summary: "Basic drug interaction check", requestBody: { content: { "application/json": { schema: { type: "object", required: ["medicineIds"], properties: { medicineIds: { type: "array", minItems: 2, items: { type: "string" } } } } } } }, responses: { 200: { description: "Interaction results" } } },
  },
  "/api/medicines/slug/{slug}": {
    get: { tags: ["Medicines"], summary: "Get medicine by URL slug", security: [], parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Medicine detail" }, 404: { $ref: "#/components/responses/NotFound" } } },
  },
  "/api/medicines/{id}": {
    get:    { tags: ["Medicines"], summary: "Get medicine by ID (with alternatives & related)", security: [], parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Medicine detail", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, medicine: { $ref: "#/components/schemas/Medicine" } } } } } }, 404: { $ref: "#/components/responses/NotFound" } } },
    put:    { tags: ["Medicines"], summary: "Update medicine (admin/pharmacist)", parameters: [{ $ref: "#/components/parameters/IdParam" }], requestBody: { content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/MedicineInput" } } } }, responses: { 200: { description: "Updated" } } },
    delete: { tags: ["Medicines"], summary: "Soft-delete medicine (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Deactivated" } } },
  },
  "/api/medicines/{id}/stock": {
    patch: { tags: ["Medicines"], summary: "Update stock (admin/pharmacist)", parameters: [{ $ref: "#/components/parameters/IdParam" }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["quantity"], properties: { quantity: { type: "integer" }, operation: { type: "string", enum: ["set", "add", "subtract"], default: "set" } } } } } }, responses: { 200: { description: "Stock updated" } } },
  },

  // ── Categories ──────────────────────────────────────────────────────────────
  "/api/categories": {
    get:  { tags: ["Categories"], summary: "List categories", security: [], parameters: [{ name: "parent", in: "query", schema: { type: "string" } }, { name: "topLevel", in: "query", schema: { type: "boolean", default: true } }, { name: "featured", in: "query", schema: { type: "boolean" } }], responses: { 200: { description: "Category list" } } },
    post: { tags: ["Categories"], summary: "Create category (admin)", requestBody: { content: { "multipart/form-data": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, nameAr: { type: "string" }, description: { type: "string" }, parent: { type: "string" }, image: { type: "string", format: "binary" } } } } } }, responses: { 201: { description: "Created" } } },
  },
  "/api/categories/{id}": {
    get:    { tags: ["Categories"], summary: "Get category with subcategories", security: [], parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Category + subcategories" } } },
    put:    { tags: ["Categories"], summary: "Update category (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Updated" } } },
    delete: { tags: ["Categories"], summary: "Deactivate category (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Deactivated" } } },
  },

  // ── Brands ──────────────────────────────────────────────────────────────────
  "/api/brands": {
    get:  { tags: ["Brands"], summary: "List brands", security: [], parameters: [{ name: "search", in: "query", schema: { type: "string" } }, { name: "featured", in: "query", schema: { type: "boolean" } }], responses: { 200: { description: "Brand list" } } },
    post: { tags: ["Brands"], summary: "Create brand (admin)", requestBody: { content: { "multipart/form-data": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, logo: { type: "string", format: "binary" }, country: { type: "string" }, website: { type: "string" } } } } } }, responses: { 201: { description: "Created" } } },
  },
  "/api/brands/{id}": {
    get:    { tags: ["Brands"], security: [], summary: "Get brand", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Brand" } } },
    put:    { tags: ["Brands"], summary: "Update brand (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Updated" } } },
    delete: { tags: ["Brands"], summary: "Deactivate brand (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Deactivated" } } },
  },

  // ── Cart ────────────────────────────────────────────────────────────────────
  "/api/cart": {
    get:    { tags: ["Cart"], summary: "Get cart (refreshes prices)", responses: { 200: { description: "Cart", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, cart: { $ref: "#/components/schemas/Cart" } } } } } } } },
    delete: { tags: ["Cart"], summary: "Clear entire cart", responses: { 200: { description: "Cleared" } } },
  },
  "/api/cart/items": {
    post: { tags: ["Cart"], summary: "Add item to cart", requestBody: { content: { "application/json": { schema: { type: "object", required: ["medicineId", "quantity"], properties: { medicineId: { type: "string" }, quantity: { type: "integer", minimum: 1, default: 1 } } } } } }, responses: { 200: { description: "Cart updated" }, 400: { description: "Insufficient stock" }, 404: { description: "Medicine not found" } } },
  },
  "/api/cart/items/{itemId}": {
    put:    { tags: ["Cart"], summary: "Update item quantity (0 = remove)", parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["quantity"], properties: { quantity: { type: "integer", minimum: 0 } } } } } }, responses: { 200: { description: "Updated" } } },
    delete: { tags: ["Cart"], summary: "Remove item from cart", parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Removed" } } },
  },
  "/api/cart/coupon": {
    post:   { tags: ["Cart"], summary: "Apply coupon code", requestBody: { content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string", example: "SAVE20" } } } } } }, responses: { 200: { description: "Discount applied" }, 400: { description: "Invalid coupon or below minimum order" } } },
    delete: { tags: ["Cart"], summary: "Remove applied coupon", responses: { 200: { description: "Coupon removed" } } },
  },

  // ── Wishlist ─────────────────────────────────────────────────────────────────
  "/api/wishlist": {
    get:    { tags: ["Wishlist"], summary: "Get my wishlist", responses: { 200: { description: "Wishlist items" } } },
    post:   { tags: ["Wishlist"], summary: "Add medicine to wishlist", requestBody: { content: { "application/json": { schema: { type: "object", required: ["medicineId"], properties: { medicineId: { type: "string" } } } } } }, responses: { 201: { description: "Added" }, 400: { description: "Already in wishlist" } } },
    delete: { tags: ["Wishlist"], summary: "Clear entire wishlist", responses: { 200: { description: "Cleared" } } },
  },
  "/api/wishlist/move-to-cart": {
    post: { tags: ["Wishlist"], summary: "Move item from wishlist to cart", requestBody: { content: { "application/json": { schema: { type: "object", required: ["medicineId"], properties: { medicineId: { type: "string" } } } } } }, responses: { 200: { description: "Moved to cart" } } },
  },
  "/api/wishlist/{medicineId}": {
    delete: { tags: ["Wishlist"], summary: "Remove specific medicine from wishlist", parameters: [{ name: "medicineId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Removed" } } },
  },

  // ── Orders ──────────────────────────────────────────────────────────────────
  "/api/orders": {
    get:  { tags: ["Orders"], summary: "List all orders (admin/pharmacist)", parameters: [{ name: "status", in: "query", schema: { type: "string" } }, { name: "userId", in: "query", schema: { type: "string" } }, { name: "startDate", in: "query", schema: { type: "string", format: "date" } }, { name: "endDate", in: "query", schema: { type: "string", format: "date" } }, { $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "Order list" }, 403: { $ref: "#/components/responses/Forbidden" } } },
    post: { tags: ["Orders"], summary: "Create order from cart items", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateOrderInput" } } } }, responses: { 201: { description: "Order created", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, order: { $ref: "#/components/schemas/Order" } } } } } }, 400: { description: "Insufficient stock or missing prescription" } } },
  },
  "/api/orders/my-orders": {
    get: { tags: ["Orders"], summary: "Get my order history", parameters: [{ name: "status", in: "query", schema: { type: "string" } }, { $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "My orders" } } },
  },
  "/api/orders/{id}": {
    get: { tags: ["Orders"], summary: "Get order detail", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Order", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, order: { $ref: "#/components/schemas/Order" } } } } } }, 403: { $ref: "#/components/responses/Forbidden" } } },
  },
  "/api/orders/{id}/track": {
    get: { tags: ["Orders"], summary: "Get tracking history and driver info", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Tracking data" } } },
  },
  "/api/orders/{id}/status": {
    put: { tags: ["Orders"], summary: "Update order status (admin/pharmacist)", parameters: [{ $ref: "#/components/parameters/IdParam" }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["confirmed", "processing", "shipped", "delivered", "cancelled"] }, note: { type: "string" }, driverId: { type: "string" } } } } } }, responses: { 200: { description: "Status updated and user notified" } } },
  },
  "/api/orders/{id}/cancel": {
    put: { tags: ["Orders"], summary: "Cancel order (customer before processing, admin anytime)", parameters: [{ $ref: "#/components/parameters/IdParam" }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string" } } } } } }, responses: { 200: { description: "Cancelled and stock restored" }, 400: { description: "Cannot cancel at this stage" } } },
  },
  "/api/orders/{id}/reorder": {
    post: { tags: ["Orders"], summary: "Re-add all items from a past order to cart", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Items added to cart" } } },
  },

  // ── Payments ─────────────────────────────────────────────────────────────────
  "/api/payments/create-intent": {
    post: { tags: ["Payments"], summary: "Create Stripe payment intent", requestBody: { content: { "application/json": { schema: { type: "object", required: ["orderId"], properties: { orderId: { type: "string" } } } } } }, responses: { 200: { description: "Stripe clientSecret", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, clientSecret: { type: "string" } } } } } } } },
  },
  "/api/payments/history": {
    get: { tags: ["Payments"], summary: "My payment history", parameters: [{ $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "Payment records" } } },
  },
  "/api/payments/refund": {
    post: { tags: ["Payments"], summary: "Request refund for a cancelled/delivered order", requestBody: { content: { "application/json": { schema: { type: "object", required: ["orderId"], properties: { orderId: { type: "string" }, reason: { type: "string" } } } } } }, responses: { 200: { description: "Refund processed" }, 400: { description: "Order not eligible" } } },
  },
  "/api/payments/webhook": {
    post: { tags: ["Payments"], summary: "Stripe webhook receiver (raw body)", security: [], requestBody: { content: { "application/json": { schema: { type: "object" } } } }, responses: { 200: { description: "Event received" } } },
  },

  // ── Wallet ──────────────────────────────────────────────────────────────────
  "/api/wallet": {
    get: { tags: ["Wallet"], summary: "Get wallet balance", responses: { 200: { description: "Balance and status" } } },
  },
  "/api/wallet/transactions": {
    get: { tags: ["Wallet"], summary: "Get transaction history", parameters: [{ $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "Transactions" } } },
  },
  "/api/wallet/credit": {
    post: { tags: ["Wallet"], summary: "Credit wallet (admin)", requestBody: { content: { "application/json": { schema: { type: "object", required: ["amount"], properties: { userId: { type: "string" }, amount: { type: "number" }, description: { type: "string" } } } } } }, responses: { 200: { description: "Credited" } } },
  },

  // ── Prescriptions ────────────────────────────────────────────────────────────
  "/api/prescriptions": {
    get:  { tags: ["Prescriptions"], summary: "All prescriptions (admin/pharmacist)", parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["pending", "under_review", "approved", "rejected"] } }, { $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "Prescription list" } } },
    post: { tags: ["Prescriptions"], summary: "Upload prescription", requestBody: { content: { "multipart/form-data": { schema: { type: "object", required: ["doctor"], properties: { doctor: { type: "string" }, hospitalClinic: { type: "string" }, medicines: { type: "string", description: "JSON string: [{name, dosage, frequency}]" }, expiryDate: { type: "string", format: "date" }, images: { type: "array", items: { type: "string", format: "binary" }, description: "Up to 3 images" } } } } } }, responses: { 201: { description: "Uploaded and pending review" } } },
  },
  "/api/prescriptions/my-prescriptions": {
    get: { tags: ["Prescriptions"], summary: "My prescriptions", parameters: [{ name: "status", in: "query", schema: { type: "string" } }, { $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "My prescriptions" } } },
  },
  "/api/prescriptions/{id}": {
    get: { tags: ["Prescriptions"], summary: "Get prescription by ID", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Prescription detail" }, 403: { $ref: "#/components/responses/Forbidden" } } },
  },
  "/api/prescriptions/{id}/status": {
    put: { tags: ["Prescriptions"], summary: "Approve / reject prescription (pharmacist/admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["under_review", "approved", "rejected"] }, rejectionReason: { type: "string" }, notes: { type: "string" } } } } } }, responses: { 200: { description: "Status updated, user notified" } } },
  },

  // ── Reviews ──────────────────────────────────────────────────────────────────
  "/api/medicines/{medicineId}/reviews": {
    get:  { tags: ["Reviews"], summary: "Get reviews for a medicine", security: [], parameters: [{ name: "medicineId", in: "path", required: true, schema: { type: "string" } }, { name: "rating", in: "query", schema: { type: "integer", minimum: 1, maximum: 5 } }, { name: "sort", in: "query", schema: { type: "string", enum: ["newest", "helpful"] } }, { $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "Reviews with rating distribution" } } },
    post: { tags: ["Reviews"], summary: "Submit a review (verified purchase badge auto-assigned)", parameters: [{ name: "medicineId", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["rating"], properties: { rating: { type: "integer", minimum: 1, maximum: 5 }, title: { type: "string" }, comment: { type: "string" } } } } } }, responses: { 201: { description: "Review submitted" }, 400: { description: "Already reviewed" } } },
  },
  "/api/reviews/{id}/helpful": {
    post: { tags: ["Reviews"], summary: "Toggle helpful vote on a review", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Vote toggled" } } },
  },
  "/api/reviews/admin/all": {
    get: { tags: ["Reviews"], summary: "All reviews for moderation (admin)", parameters: [{ name: "status", in: "query", schema: { type: "string" } }, { $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "All reviews" } } },
  },
  "/api/reviews/{id}/moderate": {
    patch: { tags: ["Reviews"], summary: "Approve / reject review and optionally reply (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["approved", "rejected"] }, reply: { type: "string" } } } } } }, responses: { 200: { description: "Moderated" } } },
  },

  // ── Coupons ──────────────────────────────────────────────────────────────────
  "/api/coupons/validate": {
    post: { tags: ["Coupons"], summary: "Validate coupon and preview discount", requestBody: { content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string" }, orderAmount: { type: "number" } } } } } }, responses: { 200: { description: "Coupon is valid with discount amount" }, 400: { description: "Invalid or expired" } } },
  },
  "/api/coupons": {
    get:  { tags: ["Coupons"], summary: "List all coupons (admin)", parameters: [{ name: "isActive", in: "query", schema: { type: "boolean" } }], responses: { 200: { description: "Coupon list" } } },
    post: { tags: ["Coupons"], summary: "Create coupon (admin)", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Coupon" } } } }, responses: { 201: { description: "Created" } } },
  },
  "/api/coupons/{id}": {
    put:    { tags: ["Coupons"], summary: "Update coupon (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Updated" } } },
    delete: { tags: ["Coupons"], summary: "Deactivate coupon (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Deactivated" } } },
  },

  // ── Flash Sales ──────────────────────────────────────────────────────────────
  "/api/flash-sales/active": {
    get: { tags: ["Flash Sales"], summary: "Get current live flash sale with medicines and countdown timer", security: [], responses: { 200: { description: "Active sale or null", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, sale: { $ref: "#/components/schemas/FlashSale" }, timeLeftMs: { type: "integer" } } } } } } } },
  },
  "/api/flash-sales": {
    get:  { tags: ["Flash Sales"], summary: "All flash sales (admin/pharmacist)", parameters: [{ name: "live", in: "query", schema: { type: "boolean" } }, { name: "isActive", in: "query", schema: { type: "boolean" } }], responses: { 200: { description: "Flash sale list" } } },
    post: { tags: ["Flash Sales"], summary: "Create flash sale (admin/pharmacist)", requestBody: { content: { "multipart/form-data": { schema: { type: "object", required: ["name", "discount", "startDate", "endDate"], properties: { name: { type: "string" }, description: { type: "string" }, discount: { type: "integer", minimum: 1, maximum: 99 }, startDate: { type: "string", format: "date-time" }, endDate: { type: "string", format: "date-time" }, medicineIds: { type: "array", items: { type: "string" } }, banner: { type: "string", format: "binary" } } } } } }, responses: { 201: { description: "Created, flash sale prices applied to medicines" } } },
  },
  "/api/flash-sales/{id}": {
    get:    { tags: ["Flash Sales"], summary: "Get flash sale by ID", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Flash sale" } } },
    put:    { tags: ["Flash Sales"], summary: "Update flash sale", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Updated" } } },
    delete: { tags: ["Flash Sales"], summary: "Delete flash sale (restores medicine prices)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Deleted" } } },
  },
  "/api/flash-sales/{id}/toggle": {
    patch: { tags: ["Flash Sales"], summary: "Activate or deactivate flash sale", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Toggled" } } },
  },
  "/api/flash-sales/{id}/medicines": {
    post:   { tags: ["Flash Sales"], summary: "Add medicines to flash sale", parameters: [{ $ref: "#/components/parameters/IdParam" }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["medicineIds"], properties: { medicineIds: { type: "array", items: { type: "string" } } } } } } }, responses: { 200: { description: "Added" } } },
    delete: { tags: ["Flash Sales"], summary: "Remove medicines from flash sale", parameters: [{ $ref: "#/components/parameters/IdParam" }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["medicineIds"], properties: { medicineIds: { type: "array", items: { type: "string" } } } } } } }, responses: { 200: { description: "Removed" } } },
  },

  // ── Referrals ────────────────────────────────────────────────────────────────
  "/api/referrals/validate/{code}": {
    get: { tags: ["Referrals"], summary: "Validate a referral code (show referrer name + reward info)", security: [], parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" }, example: "A3F9B2C1" }], responses: { 200: { description: "Code is valid" }, 404: { description: "Invalid code" } } },
  },
  "/api/referrals/me": {
    get: { tags: ["Referrals"], summary: "My referral code, share link, and stats", responses: { 200: { description: "Referral dashboard" } } },
  },
  "/api/referrals/me/referred-users": {
    get: { tags: ["Referrals"], summary: "List users I have referred with order status", parameters: [{ $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "Referred users" } } },
  },
  "/api/referrals/admin/stats": {
    get: { tags: ["Referrals"], summary: "Platform-wide referral statistics + top referrers (admin)", responses: { 200: { description: "Stats and leaderboard" } } },
  },

  // ── Delivery ─────────────────────────────────────────────────────────────────
  "/api/delivery/zones": {
    get:  { tags: ["Delivery"], summary: "List active delivery zones", security: [], responses: { 200: { description: "Zones with slots" } } },
    post: { tags: ["Delivery"], summary: "Create delivery zone (admin)", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/DeliveryZone" } } } }, responses: { 201: { description: "Created" } } },
  },
  "/api/delivery/calculate-fee": {
    post: { tags: ["Delivery"], summary: "Calculate delivery fee for a city and order amount", security: [], requestBody: { content: { "application/json": { schema: { type: "object", required: ["city", "orderAmount"], properties: { city: { type: "string", example: "Riyadh" }, orderAmount: { type: "number", example: 150 } } } } } }, responses: { 200: { description: "Fee, availability, and available slots" } } },
  },
  "/api/delivery/zones/{id}": {
    put:    { tags: ["Delivery"], summary: "Update delivery zone (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Updated" } } },
    delete: { tags: ["Delivery"], summary: "Deactivate zone (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Deactivated" } } },
  },
  "/api/delivery/assign-driver": {
    post: { tags: ["Delivery"], summary: "Assign driver to order (admin/pharmacist)", requestBody: { content: { "application/json": { schema: { type: "object", required: ["orderId", "driverId"], properties: { orderId: { type: "string" }, driverId: { type: "string" } } } } } }, responses: { 200: { description: "Driver assigned, order moved to shipped" } } },
  },
  "/api/delivery/my-deliveries": {
    get: { tags: ["Delivery"], summary: "Driver: get assigned orders", parameters: [{ name: "status", in: "query", schema: { type: "string" } }], responses: { 200: { description: "Orders" } } },
  },
  "/api/delivery/orders/{orderId}/delivered": {
    patch: { tags: ["Delivery"], summary: "Driver: mark order as delivered", parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Order delivered" } } },
  },

  // ── Notifications ────────────────────────────────────────────────────────────
  "/api/notifications": {
    get:    { tags: ["Notifications"], summary: "Get my notifications with unread count", parameters: [{ name: "type", in: "query", schema: { type: "string" } }, { name: "unread", in: "query", schema: { type: "boolean" } }, { $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "Notifications" } } },
    delete: { tags: ["Notifications"], summary: "Clear all notifications", responses: { 200: { description: "Cleared" } } },
  },
  "/api/notifications/read-all": {
    patch: { tags: ["Notifications"], summary: "Mark all as read", responses: { 200: { description: "All read" } } },
  },
  "/api/notifications/{id}/read": {
    patch: { tags: ["Notifications"], summary: "Mark single notification as read", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Read" } } },
  },
  "/api/notifications/send": {
    post: { tags: ["Notifications"], summary: "Broadcast notification (admin)", requestBody: { content: { "application/json": { schema: { type: "object", required: ["type", "title", "body"], properties: { userIds: { type: "array", items: { type: "string" }, description: "Optional; omit to send to all users" }, type: { type: "string" }, title: { type: "string" }, body: { type: "string" } } } } } }, responses: { 200: { description: "Sent" } } },
  },

  // ── Articles ─────────────────────────────────────────────────────────────────
  "/api/articles": {
    get:  { tags: ["Articles"], summary: "List published articles", security: [], parameters: [{ name: "category", in: "query", schema: { type: "string", enum: ["health_tips", "medicine_info", "nutrition", "wellness", "news"] } }, { name: "featured", in: "query", schema: { type: "boolean" } }, { name: "search", in: "query", schema: { type: "string" } }, { $ref: "#/components/parameters/PageParam" }], responses: { 200: { description: "Article list (no content body, excerpt only)" } } },
    post: { tags: ["Articles"], summary: "Create article (admin/pharmacist)", requestBody: { content: { "multipart/form-data": { schema: { type: "object", required: ["title", "content"], properties: { title: { type: "string" }, content: { type: "string" }, excerpt: { type: "string" }, category: { type: "string" }, tags: { type: "string", description: "Comma-separated" }, status: { type: "string", enum: ["draft", "published"] }, image: { type: "string", format: "binary" } } } } } }, responses: { 201: { description: "Created" } } },
  },
  "/api/articles/slug/{slug}": {
    get: { tags: ["Articles"], summary: "Get article by slug (increments view count)", security: [], parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Full article" } } },
  },
  "/api/articles/{id}": {
    put:    { tags: ["Articles"], summary: "Update article (admin/pharmacist)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Updated" } } },
    delete: { tags: ["Articles"], summary: "Delete article (admin)", parameters: [{ $ref: "#/components/parameters/IdParam" }], responses: { 200: { description: "Deleted" } } },
  },

  // ── Admin Dashboard ───────────────────────────────────────────────────────────
  "/api/admin/dashboard/stats": {
    get: { tags: ["Admin – Dashboard"], summary: "KPI overview: orders, revenue, users, stock", responses: { 200: { description: "Stats object with current and comparison periods" } } },
  },
  "/api/admin/dashboard/revenue": {
    get: { tags: ["Admin – Dashboard"], summary: "Monthly revenue chart data", parameters: [{ name: "months", in: "query", schema: { type: "integer", default: 12 } }], responses: { 200: { description: "Array of {year, month, revenue, orders}" } } },
  },
  "/api/admin/dashboard/top-products": {
    get: { tags: ["Admin – Dashboard"], summary: "Best selling medicines in period", parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 10 } }, { name: "since", in: "query", schema: { type: "string", format: "date" } }], responses: { 200: { description: "Top products with revenue and quantity" } } },
  },
  "/api/admin/dashboard/order-breakdown": {
    get: { tags: ["Admin – Dashboard"], summary: "Order count by status", responses: { 200: { description: "Status distribution" } } },
  },
  "/api/admin/dashboard/user-trend": {
    get: { tags: ["Admin – Dashboard"], summary: "Daily customer registrations", parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 30 } }], responses: { 200: { description: "Registration trend" } } },
  },
  "/api/admin/dashboard/recent-orders": {
    get: { tags: ["Admin – Dashboard"], summary: "Latest N orders", parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 10 } }], responses: { 200: { description: "Recent orders" } } },
  },
  "/api/admin/dashboard/sales-report": {
    get: { tags: ["Admin – Dashboard"], summary: "Revenue breakdown by category", parameters: [{ name: "startDate", in: "query", schema: { type: "string", format: "date" } }, { name: "endDate", in: "query", schema: { type: "string", format: "date" } }], responses: { 200: { description: "Sales summary and per-category breakdown" } } },
  },

  // ── Admin Inventory ───────────────────────────────────────────────────────────
  "/api/admin/inventory/summary": {
    get: { tags: ["Admin – Inventory"], summary: "Total items, stock value, and alert counts", responses: { 200: { description: "Inventory summary by category" } } },
  },
  "/api/admin/inventory/low-stock": {
    get: { tags: ["Admin – Inventory"], summary: "All medicines at or below reorder threshold", responses: { 200: { description: "Low stock list sorted by quantity ASC" } } },
  },
  "/api/admin/inventory/expiry": {
    get: { tags: ["Admin – Inventory"], summary: "Expiring and already-expired medicines", parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 30 } }], responses: { 200: { description: "Expiring and expired arrays" } } },
  },
  "/api/admin/inventory/movement": {
    get: { tags: ["Admin – Inventory"], summary: "Units sold per medicine in period", parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 30 } }], responses: { 200: { description: "Stock movement data" } } },
  },
  "/api/admin/inventory/bulk-stock": {
    post: { tags: ["Admin – Inventory"], summary: "Update stock for multiple medicines in one call", requestBody: { content: { "application/json": { schema: { type: "object", required: ["updates"], properties: { updates: { type: "array", items: { type: "object", required: ["medicineId", "quantity"], properties: { medicineId: { type: "string" }, quantity: { type: "integer" }, operation: { type: "string", enum: ["set", "add", "subtract"], default: "set" } } } } } } } } }, responses: { 200: { description: "Results per medicine" } } },
  },

  // ── Auth – Phone OTP ──────────────────────────────────────────────────────────
  "/api/auth/login/phone/send": {
    post: {
      tags: ["Auth – Phone OTP"], summary: "Send OTP to phone number", security: [],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["phone"], properties: { phone: { type: "string", example: "0501234567" } } } } } },
      responses: { 200: { description: "OTP sent (60-second cooldown enforced)" }, 429: { description: "Cooldown active — seconds remaining returned" } },
    },
  },
  "/api/auth/login/phone/verify": {
    post: {
      tags: ["Auth – Phone OTP"], summary: "Verify OTP → receive tokens", security: [],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", required: ["phone", "otp"], properties: { phone: { type: "string" }, otp: { type: "string", example: "482910" }, deviceId: { type: "string" }, fcmToken: { type: "string" }, language: { type: "string", enum: ["ar", "en"] } } } } },
      },
      responses: { 200: { description: "Tokens issued", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } } }, 400: { description: "Invalid or expired OTP" } },
    },
  },
  "/api/auth/login/phone/resend": {
    post: {
      tags: ["Auth – Phone OTP"], summary: "Resend OTP (same 60-second cooldown)", security: [],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["phone"], properties: { phone: { type: "string" } } } } } },
      responses: { 200: { description: "OTP resent" }, 429: { description: "Cooldown active" } },
    },
  },

  // ── Auth – Nafath (Saudi NIC) ─────────────────────────────────────────────────
  "/api/auth/nafath/initiate": {
    post: {
      tags: ["Auth – Nafath"], summary: "Initiate Nafath authentication (Saudi National ID)", security: [],
      description: "Calls the elm.sa Nafath API. Returns a transactionId and a random number the user must confirm in the Nafath mobile app. Poll `/api/auth/nafath/status/{transactionId}` every 3 seconds.",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["nationalId"], properties: { nationalId: { type: "string", pattern: "^\\d{10}$", example: "1012345678" } } } } } },
      responses: {
        200: { description: "Transaction started", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, transactionId: { type: "string" }, randomNumber: { type: "string", description: "2-digit number to confirm in Nafath app" }, expiresIn: { type: "integer", example: 300 }, pollInterval: { type: "integer", example: 3 } } } } } },
        400: { description: "Invalid national ID" },
      },
    },
  },
  "/api/auth/nafath/status/{transactionId}": {
    get: {
      tags: ["Auth – Nafath"], summary: "Poll Nafath authentication status", security: [],
      parameters: [{ name: "transactionId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "pending | approved | rejected | expired", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, status: { type: "string", enum: ["pending", "approved", "rejected", "expired"] }, accessToken: { type: "string" }, refreshToken: { type: "string" } } } } } },
        404: { description: "Transaction not found or expired" },
      },
    },
  },
  "/api/auth/nafath/callback": {
    post: {
      tags: ["Auth – Nafath"], summary: "Webhook — Nafath pushes result (optional)", security: [],
      description: "Called by elm.sa Nafath servers. Verifies `x-nafath-signature` HMAC-SHA256 header.",
      responses: { 200: { description: "Acknowledged" }, 401: { description: "Invalid signature" } },
    },
  },

  // ── Auth – Biometric ──────────────────────────────────────────────────────────
  "/api/auth/biometric/enable": {
    post: {
      tags: ["Auth – Biometric"], summary: "Enable biometric login for device (authenticated)",
      description: "Generates a secure random token. Store it in device hardware-backed storage (iOS Keychain / Android Keystore). Send it back via `/api/auth/biometric/verify` — the biometric unlock happens on the device, not the server.",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["deviceId"], properties: { deviceId: { type: "string" } } } } } },
      responses: { 200: { description: "Biometric enabled. Returns biometricToken to store on device.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, biometricToken: { type: "string", description: "Store securely — treat like a password" }, expiresAt: { type: "string", format: "date-time" } } } } } } },
    },
  },
  "/api/auth/biometric/verify": {
    post: {
      tags: ["Auth – Biometric"], summary: "Verify biometric token → receive tokens (unauthenticated)", security: [],
      description: "App retrieves token from device Keychain/Keystore after biometric passes, then calls this endpoint. Token is rotated on each successful call.",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["deviceId", "biometricToken"], properties: { deviceId: { type: "string" }, biometricToken: { type: "string" } } } } } },
      responses: {
        200: { description: "Tokens issued + new biometricToken returned for rotation", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } } },
        401: { description: "Invalid or expired biometric token" },
      },
    },
  },
  "/api/auth/biometric/disable": {
    post: {
      tags: ["Auth – Biometric"], summary: "Disable biometric for device (authenticated)",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["deviceId"], properties: { deviceId: { type: "string" } } } } } },
      responses: { 200: { description: "Biometric disabled" } },
    },
  },

  // ── Auth – PIN ────────────────────────────────────────────────────────────────
  "/api/auth/pin/set": {
    post: {
      tags: ["Auth – PIN"], summary: "Set PIN for device (authenticated)",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["deviceId", "pin"], properties: { deviceId: { type: "string" }, pin: { type: "string", minLength: 4, maxLength: 8, pattern: "^\\d+$", example: "1234" } } } } } },
      responses: { 200: { description: "PIN set" }, 400: { description: "Invalid PIN format" }, 404: { description: "No active session for device" } },
    },
  },
  "/api/auth/pin/verify": {
    post: {
      tags: ["Auth – PIN"], summary: "Verify PIN → receive tokens (unauthenticated)", security: [],
      description: "5 failed attempts → 15-minute lockout. 3 consecutive lockouts → session deactivated (must re-login).",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["deviceId", "pin"], properties: { deviceId: { type: "string" }, pin: { type: "string" } } } } } },
      responses: {
        200: { description: "Tokens issued", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } } },
        401: { description: "Incorrect PIN — remaining attempts shown" },
        429: { description: "PIN locked — lockedUntil timestamp returned" },
      },
    },
  },
  "/api/auth/pin": {
    delete: {
      tags: ["Auth – PIN"], summary: "Remove PIN from device (authenticated)",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["deviceId"], properties: { deviceId: { type: "string" } } } } } },
      responses: { 200: { description: "PIN removed" } },
    },
  },

  // ── Auth – Session ────────────────────────────────────────────────────────────
  "/api/auth/logout/all": {
    post: {
      tags: ["Auth"], summary: "Logout from ALL devices",
      responses: { 200: { description: "All sessions revoked" }, 401: { $ref: "#/components/responses/Unauthorized" } },
    },
  },
  "/api/auth/session": {
    get: {
      tags: ["Auth"], summary: "Get current session info (biometricEnabled, pinEnabled, language…)",
      responses: { 200: { description: "Session and user info" }, 401: { $ref: "#/components/responses/Unauthorized" } },
    },
  },
  "/api/auth/change-password": {
    put: {
      tags: ["Auth"], summary: "Change password (authenticated — requires current password)",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["currentPassword", "newPassword"], properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 8 } } } } } },
      responses: { 200: { description: "Password changed" }, 401: { description: "Current password incorrect" } },
    },
  },

  // ── Guest Session ─────────────────────────────────────────────────────────────
  "/api/auth/guest/session": {
    post: {
      tags: ["Guest"], summary: "Create guest session — returns guestId", security: [],
      description: "Allows unauthenticated users to browse and add items to cart. Guest session expires in 7 days. On account creation, call `/api/auth/guest/convert` to merge the cart.",
      requestBody: { content: { "application/json": { schema: { type: "object", properties: { deviceId: { type: "string" } } } } } },
      responses: { 201: { description: "Session created", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, guestId: { type: "string", format: "uuid" }, expiresIn: { type: "string", example: "7 days" } } } } } } },
    },
  },
  "/api/auth/guest/convert": {
    post: {
      tags: ["Guest"], summary: "Convert guest → registered user + merge cart", security: [],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", required: ["guestId", "name", "email", "password"], properties: { guestId: { type: "string" }, name: { type: "string" }, email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 }, phone: { type: "string" }, referralCode: { type: "string" } } } } },
      },
      responses: { 201: { description: "Account created + cart merged", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthTokens" } } } } },
    },
  },
  "/api/auth/guest/{guestId}": {
    get: {
      tags: ["Guest"], summary: "Get guest session + populated cart", security: [],
      parameters: [{ name: "guestId", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Guest session with cart totals" }, 404: { description: "Session not found or expired" } },
    },
  },
  "/api/auth/guest/{guestId}/cart": {
    post: {
      tags: ["Guest"], summary: "Add item to guest cart", security: [],
      parameters: [{ name: "guestId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["medicineId"], properties: { medicineId: { type: "string" }, quantity: { type: "integer", default: 1 } } } } } },
      responses: { 200: { description: "Item added" }, 400: { description: "Insufficient stock or prescription required" } },
    },
  },
  "/api/auth/guest/{guestId}/cart/{medicineId}": {
    put: {
      tags: ["Guest"], summary: "Update guest cart item quantity (0 = remove)", security: [],
      parameters: [{ name: "guestId", in: "path", required: true, schema: { type: "string" } }, { name: "medicineId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["quantity"], properties: { quantity: { type: "integer", minimum: 0 } } } } } },
      responses: { 200: { description: "Cart updated" } },
    },
    delete: {
      tags: ["Guest"], summary: "Remove item from guest cart", security: [],
      parameters: [{ name: "guestId", in: "path", required: true, schema: { type: "string" } }, { name: "medicineId", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Item removed" } },
    },
  },

  // ── Device Management ─────────────────────────────────────────────────────────
  "/api/user/devices": {
    get: {
      tags: ["Devices"], summary: "List all active sessions / devices",
      description: "Returns all registered devices with biometricEnabled, pinEnabled, lastUsed. The `isCurrent` flag is set based on the `x-device-id` header or body.deviceId.",
      responses: { 200: { description: "Device list", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, count: { type: "integer" }, devices: { type: "array", items: { type: "object", properties: { deviceId: { type: "string" }, deviceName: { type: "string" }, deviceOS: { type: "string" }, biometricEnabled: { type: "boolean" }, pinEnabled: { type: "boolean" }, lastUsed: { type: "string", format: "date-time" }, isCurrent: { type: "boolean" } } } } } } } } },
      401: { $ref: "#/components/responses/Unauthorized" } },
    },
    delete: {
      tags: ["Devices"], summary: "Revoke ALL device sessions (logout everywhere)",
      responses: { 200: { description: "All sessions revoked + revokedCount" }, 401: { $ref: "#/components/responses/Unauthorized" } },
    },
  },
  "/api/user/devices/current": {
    get: {
      tags: ["Devices"], summary: "Get current device session (requires x-device-id header or body.deviceId)",
      responses: { 200: { description: "Current device session" }, 404: { description: "Session not found for this device" } },
    },
  },
  "/api/user/devices/{deviceId}": {
    put: {
      tags: ["Devices"], summary: "Update device preferences (language, timezone, fcmToken, deviceName)",
      parameters: [{ name: "deviceId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { content: { "application/json": { schema: { type: "object", properties: { language: { type: "string", enum: ["ar", "en"] }, timezone: { type: "string", example: "Asia/Riyadh" }, fcmToken: { type: "string" }, deviceName: { type: "string" }, appVersion: { type: "string" } } } } } },
      responses: { 200: { description: "Device updated" }, 404: { description: "Device session not found" } },
    },
    delete: {
      tags: ["Devices"], summary: "Revoke a specific device session",
      parameters: [{ name: "deviceId", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Session revoked" }, 404: { description: "Device session not found" } },
    },
  },
};

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Pharmacy API",
      version: "2.0.0",
      description: "Production-ready REST API for a full-featured online pharmacy. Supports authentication, medicines, orders, prescriptions, payments, delivery, loyalty points, flash sales, referrals, and more.\n\n**Quick Start:**\n1. `POST /api/auth/register` → get `accessToken`\n2. Click **Authorize** and paste the token\n3. Explore the endpoints\n\n**Roles:** `customer` · `pharmacist` · `admin` · `delivery`",
      contact: { name: "Pharmacy API Support", email: "support@pharmacy.sa" },
      license: { name: "MIT" },
    },
    servers: [
      { url: "http://localhost:5000", description: "Local development" },
      { url: "https://api.pharmacy.sa", description: "Production" },
    ],
    components,
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "System",            description: "Health check" },
      { name: "Auth",              description: "Registration, login, tokens, OTP, social login" },
      { name: "Users",             description: "Profiles, addresses, loyalty points" },
      { name: "Medicines",         description: "Catalogue, search, stock, drug interactions" },
      { name: "Categories",        description: "Hierarchical product categories" },
      { name: "Brands",            description: "Medicine brands / manufacturers" },
      { name: "Cart",              description: "Shopping cart with coupon support" },
      { name: "Wishlist",          description: "Saved items" },
      { name: "Orders",            description: "Order lifecycle, tracking, reorder" },
      { name: "Payments",          description: "Stripe, wallet, refunds" },
      { name: "Wallet",            description: "In-app wallet balance and transactions" },
      { name: "Prescriptions",     description: "Upload and pharmacist verification flow" },
      { name: "Reviews",           description: "Product ratings, moderation, helpful votes" },
      { name: "Coupons",           description: "Discount codes (% or fixed)" },
      { name: "Flash Sales",       description: "Time-limited sales with auto price application" },
      { name: "Referrals",         description: "Referral codes and loyalty point rewards" },
      { name: "Delivery",          description: "Zones, fees, slots, driver assignment" },
      { name: "Notifications",     description: "In-app notifications and broadcasts" },
      { name: "Articles",          description: "Health articles and blog posts" },
      { name: "Admin – Dashboard", description: "KPIs, revenue analytics, reports" },
      { name: "Admin – Inventory", description: "Stock management, expiry, bulk updates" },
      { name: "Auth – Phone OTP",  description: "Phone-number login via 6-digit OTP (Twilio)" },
      { name: "Auth – Nafath",     description: "Saudi National Digital ID authentication (elm.sa)" },
      { name: "Auth – Biometric",  description: "Face ID / Fingerprint login via device-stored token" },
      { name: "Auth – PIN",        description: "4-8 digit PIN fallback authentication" },
      { name: "Guest",             description: "Unauthenticated browsing, guest cart, conversion to account" },
      { name: "Devices",           description: "Multi-device session management and preferences" },
    ],
    paths,
  },
  apis: [], // All paths defined inline above
};

module.exports = swaggerJsdoc(options);
