/**
 * Joi Validators — All Routes
 *
 * Usage:
 *   const { joiValidate } = require("../middleware/joiValidate.middleware");
 *   const { schemas } = require("../validators/joi.validators");
 *
 *   router.post("/register", joiValidate(schemas.auth.register), register);
 */

const Joi = require("joi");

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** MongoDB ObjectId */
const objectId = () =>
  Joi.string()
    .pattern(/^[a-f\d]{24}$/i)
    .messages({
      "string.pattern.base": "Invalid ID format",
      "string.empty":        "ID is required",
      "any.required":        "ID is required",
    });

/** Saudi / international phone  */
const phone = () =>
  Joi.string()
    .pattern(/^\+?[0-9]{7,15}$/)
    .messages({
      "string.pattern.base": "Invalid phone number",
      "string.empty":        "Phone is required",
    });

/** Password — min 8 chars, at least one letter and one number */
const strongPassword = () =>
  Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .messages({
      "string.min":          "Password must be at least 8 characters",
      "string.pattern.base": "Password must contain at least one letter and one number",
      "string.empty":        "Password is required",
      "any.required":        "Password is required",
    });

const paginationSchema = {
  page:  Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort:  Joi.string().max(100).optional(),
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
const auth = {
  register: Joi.object({
    name: Joi.string().trim().min(2).max(60).required().messages({
      "string.min":   "Name must be at least 2 characters",
      "string.max":   "Name must not exceed 60 characters",
      "string.empty": "Name is required",
      "any.required": "Name is required",
    }),
    email: Joi.string().trim().email().required().messages({
      "string.email":  "Invalid email address",
      "string.empty":  "Email is required",
      "any.required":  "Email is required",
    }),
    password: strongPassword().required(),
    phone:    phone().optional(),
    role:     Joi.string().valid("customer", "pharmacist").default("customer").messages({
      "any.only": "Role must be customer or pharmacist",
    }),
    referralCode:  Joi.string().trim().uppercase().alphanum().length(8).optional(),
    adminSecret:   Joi.string().optional(),
    deviceId:      Joi.string().optional(),
    deviceName:    Joi.string().optional(),
    deviceOS:      Joi.string().optional(),
    deviceType:    Joi.string().valid("mobile", "tablet", "web", "other").optional(),
    fcmToken:      Joi.string().optional(),
    language:      Joi.string().valid("ar", "en").default("ar").optional(),
    timezone:      Joi.string().optional(),
  }),

  login: Joi.object({
    email:    Joi.string().trim().email().required().messages({
      "string.email":  "Invalid email address",
      "any.required":  "Email is required",
    }),
    password: Joi.string().required().messages({
      "any.required": "Password is required",
    }),
    deviceId:   Joi.string().optional(),
    deviceName: Joi.string().optional(),
    deviceOS:   Joi.string().optional(),
    deviceType: Joi.string().valid("mobile", "tablet", "web", "other").optional(),
    fcmToken:   Joi.string().optional(),
    language:   Joi.string().valid("ar", "en").optional(),
    timezone:   Joi.string().optional(),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().trim().email().required().messages({
      "string.email":  "Invalid email address",
      "any.required":  "Email is required",
    }),
  }),

  resetPassword: Joi.object({
    password: strongPassword().required(),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required().messages({
      "any.required": "Current password is required",
    }),
    newPassword: strongPassword().required()
      .invalid(Joi.ref("currentPassword"))
      .messages({
        "any.invalid": "New password must be different from current password",
      }),
  }),

  verifyEmail: Joi.object({
    otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      "string.length":       "OTP must be 6 digits",
      "string.pattern.base": "OTP must contain digits only",
      "any.required":        "OTP is required",
    }),
  }),

  refreshToken: Joi.object({
    token:      Joi.string().optional(),
    refreshToken: Joi.string().optional(),
    deviceId:   Joi.string().optional(),
  }).or("token", "refreshToken", "deviceId").messages({
    "object.missing": "Provide token, refreshToken, or deviceId",
  }),
};

// ─── Phone OTP ────────────────────────────────────────────────────────────────
const phoneOtp = {
  send: Joi.object({
    phone: phone().required().messages({
      "any.required": "Phone number is required",
    }),
  }),

  verify: Joi.object({
    phone: phone().required().messages({
      "any.required": "Phone number is required",
    }),
    otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      "string.length":       "OTP must be 6 digits",
      "string.pattern.base": "OTP must contain digits only",
      "any.required":        "OTP is required",
    }),
    deviceId:   Joi.string().optional(),
    fcmToken:   Joi.string().optional(),
    language:   Joi.string().valid("ar", "en").optional(),
    timezone:   Joi.string().optional(),
  }),
};

// ─── Nafath ───────────────────────────────────────────────────────────────────
const nafath = {
  initiate: Joi.object({
    nationalId: Joi.string().pattern(/^\d{10}$/).required().messages({
      "string.pattern.base": "National ID must be exactly 10 digits",
      "any.required":        "National ID is required",
    }),
  }),
};

// ─── Biometric ────────────────────────────────────────────────────────────────
const biometric = {
  enable: Joi.object({
    deviceId: Joi.string().required().messages({
      "any.required": "Device ID is required",
    }),
  }),

  verify: Joi.object({
    deviceId:       Joi.string().required().messages({
      "any.required": "Device ID is required",
    }),
    biometricToken: Joi.string().required().messages({
      "any.required": "Biometric token is required",
    }),
  }),

  disable: Joi.object({
    deviceId: Joi.string().required().messages({
      "any.required": "Device ID is required",
    }),
  }),
};

// ─── PIN ──────────────────────────────────────────────────────────────────────
const pin = {
  set: Joi.object({
    deviceId: Joi.string().required().messages({
      "any.required": "Device ID is required",
    }),
    pin: Joi.string().pattern(/^\d{4,8}$/).required().messages({
      "string.pattern.base": "PIN must be 4-8 digits",
      "any.required":        "PIN is required",
    }),
  }),

  verify: Joi.object({
    deviceId: Joi.string().required().messages({
      "any.required": "Device ID is required",
    }),
    pin: Joi.string().pattern(/^\d{4,8}$/).required().messages({
      "string.pattern.base": "PIN must be 4-8 digits",
      "any.required":        "PIN is required",
    }),
  }),

  remove: Joi.object({
    deviceId: Joi.string().required().messages({
      "any.required": "Device ID is required",
    }),
  }),
};

// ─── Guest Session ────────────────────────────────────────────────────────────
const guest = {
  createSession: Joi.object({
    deviceId: Joi.string().optional(),
  }),

  addToCart: Joi.object({
    medicineId: objectId().required().messages({
      "any.required": "Medicine ID is required",
    }),
    quantity: Joi.number().integer().min(1).max(99).default(1).messages({
      "number.min": "Quantity must be at least 1",
      "number.max": "Quantity cannot exceed 99",
    }),
  }),

  updateCartItem: Joi.object({
    quantity: Joi.number().integer().min(0).max(99).required().messages({
      "number.min":   "Quantity cannot be negative",
      "number.max":   "Quantity cannot exceed 99",
      "any.required": "Quantity is required",
    }),
  }),

  convert: Joi.object({
    guestId:  Joi.string().required().messages({ "any.required": "Guest ID is required" }),
    name:     Joi.string().trim().min(2).max(60).required().messages({ "any.required": "Name is required" }),
    email:    Joi.string().trim().email().required().messages({ "any.required": "Email is required" }),
    password: strongPassword().required(),
    phone:    phone().optional(),
    referralCode: Joi.string().trim().uppercase().alphanum().length(8).optional(),
    deviceId: Joi.string().optional(),
    fcmToken: Joi.string().optional(),
    language: Joi.string().valid("ar", "en").optional(),
  }),
};

// ─── Device Management ────────────────────────────────────────────────────────
const device = {
  update: Joi.object({
    language:   Joi.string().valid("ar", "en").optional(),
    timezone:   Joi.string().max(60).optional(),
    fcmToken:   Joi.string().optional(),
    deviceName: Joi.string().max(100).optional(),
    appVersion: Joi.string().max(20).optional(),
  }).min(1).messages({
    "object.min": "Provide at least one field to update",
  }),
};

// ─── Medicine ─────────────────────────────────────────────────────────────────
const medicine = {
  create: Joi.object({
    name:               Joi.string().trim().min(2).max(200).required().messages({ "any.required": "Medicine name is required" }),
    nameAr:             Joi.string().trim().max(200).optional(),
    description:        Joi.string().max(2000).optional(),
    price:              Joi.number().positive().required().messages({ "any.required": "Price is required", "number.positive": "Price must be positive" }),
    salePrice:          Joi.number().positive().optional(),
    stock:              Joi.number().integer().min(0).required().messages({ "any.required": "Stock is required" }),
    category:           objectId().required().messages({ "any.required": "Category is required" }),
    brand:              objectId().optional(),
    sku:                Joi.string().trim().max(50).optional(),
    barcode:            Joi.string().trim().max(50).optional(),
    requiresPrescription: Joi.boolean().default(false),
    expiryDate:         Joi.date().greater("now").optional().messages({ "date.greater": "Expiry date must be in the future" }),
    lowStockThreshold:  Joi.number().integer().min(0).default(10),
    dosageForm:         Joi.string().max(50).optional(),
    strength:           Joi.string().max(50).optional(),
    activeIngredients:  Joi.array().items(Joi.string()).optional(),
    sideEffects:        Joi.string().max(2000).optional(),
    storageConditions:  Joi.string().max(500).optional(),
    isActive:           Joi.boolean().default(true),
  }),

  update: Joi.object({
    name:               Joi.string().trim().min(2).max(200).optional(),
    nameAr:             Joi.string().trim().max(200).optional(),
    description:        Joi.string().max(2000).optional(),
    price:              Joi.number().positive().optional(),
    salePrice:          Joi.number().positive().allow(null).optional(),
    stock:              Joi.number().integer().min(0).optional(),
    category:           objectId().optional(),
    brand:              objectId().optional(),
    requiresPrescription: Joi.boolean().optional(),
    expiryDate:         Joi.date().optional(),
    lowStockThreshold:  Joi.number().integer().min(0).optional(),
    dosageForm:         Joi.string().max(50).optional(),
    strength:           Joi.string().max(50).optional(),
    activeIngredients:  Joi.array().items(Joi.string()).optional(),
    sideEffects:        Joi.string().max(2000).optional(),
    storageConditions:  Joi.string().max(500).optional(),
    isActive:           Joi.boolean().optional(),
  }),

  updateStock: Joi.object({
    quantity:  Joi.number().integer().required().messages({ "any.required": "Quantity is required" }),
    operation: Joi.string().valid("set", "add", "subtract").default("set"),
    reason:    Joi.string().max(200).optional(),
  }),

  list: Joi.object({
    ...paginationSchema,
    search:      Joi.string().max(100).optional(),
    category:    objectId().optional(),
    brand:       objectId().optional(),
    minPrice:    Joi.number().min(0).optional(),
    maxPrice:    Joi.number().min(0).optional(),
    inStock:     Joi.boolean().optional(),
    prescription: Joi.boolean().optional(),
    isActive:    Joi.boolean().optional(),
  }),
};

// ─── Category ─────────────────────────────────────────────────────────────────
const category = {
  create: Joi.object({
    name:        Joi.string().trim().min(2).max(100).required().messages({ "any.required": "Category name is required" }),
    nameAr:      Joi.string().trim().max(100).optional(),
    description: Joi.string().max(500).optional(),
    parent:      objectId().optional(),
    isActive:    Joi.boolean().default(true),
  }),

  update: Joi.object({
    name:        Joi.string().trim().min(2).max(100).optional(),
    nameAr:      Joi.string().trim().max(100).optional(),
    description: Joi.string().max(500).optional(),
    parent:      objectId().allow(null).optional(),
    isActive:    Joi.boolean().optional(),
  }),
};

// ─── Order ────────────────────────────────────────────────────────────────────
const order = {
  create: Joi.object({
    items: Joi.array().items(
      Joi.object({
        medicine: objectId().required(),
        quantity: Joi.number().integer().min(1).required().messages({ "any.required": "Quantity is required" }),
      })
    ).min(1).required().messages({
      "array.min":    "Order must have at least one item",
      "any.required": "Order items are required",
    }),
    paymentMethod:   Joi.string().valid("cash", "card", "wallet", "insurance").required().messages({
      "any.only":     "Payment method must be cash, card, wallet, or insurance",
      "any.required": "Payment method is required",
    }),
    deliveryAddress: Joi.object({
      fullName:   Joi.string().required(),
      phone:      phone().required(),
      street:     Joi.string().required(),
      city:       Joi.string().required(),
      region:     Joi.string().optional(),
      postalCode: Joi.string().optional(),
      lat:        Joi.number().optional(),
      lng:        Joi.number().optional(),
    }).optional(),
    couponCode:      Joi.string().trim().uppercase().optional(),
    prescriptionId:  objectId().optional(),
    notes:           Joi.string().max(500).optional(),
    isScheduled:     Joi.boolean().optional(),
    scheduledFor:    Joi.date().when("isScheduled", { is: true, then: Joi.required() }).optional(),
  }),

  updateStatus: Joi.object({
    status: Joi.string()
      .valid("pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered", "cancelled", "refunded")
      .required()
      .messages({
        "any.only":     "Invalid order status",
        "any.required": "Status is required",
      }),
    notes:          Joi.string().max(500).optional(),
    trackingNumber: Joi.string().max(100).optional(),
  }),

  cancel: Joi.object({
    reason: Joi.string().max(500).optional(),
  }),
};

// ─── Cart ─────────────────────────────────────────────────────────────────────
const cart = {
  addItem: Joi.object({
    medicineId: objectId().required().messages({ "any.required": "Medicine ID is required" }),
    quantity:   Joi.number().integer().min(1).max(99).default(1),
  }),

  updateItem: Joi.object({
    quantity: Joi.number().integer().min(0).max(99).required().messages({
      "any.required": "Quantity is required",
    }),
  }),

  applyCoupon: Joi.object({
    code: Joi.string().trim().uppercase().required().messages({
      "any.required": "Coupon code is required",
    }),
  }),
};

// ─── Review ───────────────────────────────────────────────────────────────────
const review = {
  create: Joi.object({
    medicine: objectId().required().messages({ "any.required": "Medicine ID is required" }),
    rating:   Joi.number().integer().min(1).max(5).required().messages({
      "number.min":   "Rating must be at least 1",
      "number.max":   "Rating must not exceed 5",
      "any.required": "Rating is required",
    }),
    comment: Joi.string().min(5).max(1000).optional().messages({
      "string.min": "Comment must be at least 5 characters",
      "string.max": "Comment must not exceed 1000 characters",
    }),
  }),

  update: Joi.object({
    rating:  Joi.number().integer().min(1).max(5).optional(),
    comment: Joi.string().min(5).max(1000).optional(),
  }),
};

// ─── Prescription ─────────────────────────────────────────────────────────────
const prescription = {
  create: Joi.object({
    doctorName: Joi.string().trim().min(2).max(100).required().messages({ "any.required": "Doctor name is required" }),
    medicines:  Joi.array().items(Joi.string()).min(1).optional(),
    notes:      Joi.string().max(500).optional(),
    expiryDate: Joi.date().greater("now").optional(),
  }),

  updateStatus: Joi.object({
    status:          Joi.string().valid("pending", "approved", "rejected", "expired").required().messages({
      "any.only":     "Invalid prescription status",
      "any.required": "Status is required",
    }),
    pharmacistNotes: Joi.string().max(500).optional(),
    rejectionReason: Joi.string().max(500).when("status", { is: "rejected", then: Joi.required() }).messages({
      "any.required": "Rejection reason is required when rejecting",
    }),
  }),
};

// ─── Coupon ───────────────────────────────────────────────────────────────────
const coupon = {
  create: Joi.object({
    code:             Joi.string().trim().uppercase().alphanum().min(4).max(20).required().messages({ "any.required": "Coupon code is required" }),
    type:             Joi.string().valid("percentage", "fixed").required().messages({ "any.required": "Discount type is required" }),
    value:            Joi.number().positive().required().messages({ "any.required": "Discount value is required" }),
    minOrderAmount:   Joi.number().min(0).default(0),
    maxDiscount:      Joi.number().positive().optional(),
    usageLimit:       Joi.number().integer().positive().optional(),
    expiresAt:        Joi.date().greater("now").optional(),
    isActive:         Joi.boolean().default(true),
  }),
};

// ─── User Profile ─────────────────────────────────────────────────────────────
const user = {
  updateProfile: Joi.object({
    name:      Joi.string().trim().min(2).max(60).optional(),
    phone:     phone().optional(),
    gender:    Joi.string().valid("male", "female").optional(),
    birthDate: Joi.date().less("now").optional().messages({ "date.less": "Birth date must be in the past" }),
    language:  Joi.string().valid("ar", "en").optional(),
    timezone:  Joi.string().max(60).optional(),
  }),

  addAddress: Joi.object({
    label:      Joi.string().valid("home", "work", "other").default("home"),
    fullName:   Joi.string().trim().required().messages({ "any.required": "Full name is required" }),
    phone:      phone().required(),
    street:     Joi.string().trim().required().messages({ "any.required": "Street address is required" }),
    city:       Joi.string().trim().required().messages({ "any.required": "City is required" }),
    region:     Joi.string().trim().optional(),
    postalCode: Joi.string().trim().optional(),
    country:    Joi.string().length(2).uppercase().default("SA"),
    lat:        Joi.number().min(-90).max(90).optional(),
    lng:        Joi.number().min(-180).max(180).optional(),
    isDefault:  Joi.boolean().default(false),
  }),
};

// ─── Delivery Zone ────────────────────────────────────────────────────────────
const deliveryZone = {
  create: Joi.object({
    name:           Joi.string().trim().required().messages({ "any.required": "Zone name is required" }),
    nameAr:         Joi.string().trim().optional(),
    cities:         Joi.array().items(Joi.string()).min(1).required().messages({ "any.required": "At least one city is required" }),
    deliveryFee:    Joi.number().min(0).required().messages({ "any.required": "Delivery fee is required" }),
    freeDeliveryAt: Joi.number().positive().optional(),
    minDeliveryDays: Joi.number().integer().min(1).default(1),
    maxDeliveryDays: Joi.number().integer().min(1).default(3),
    isActive:       Joi.boolean().default(true),
  }),
};

// ─── Notification ─────────────────────────────────────────────────────────────
const notification = {
  send: Joi.object({
    userIds:  Joi.array().items(objectId()).optional(),
    type:     Joi.string().valid("order", "prescription", "promotion", "reminder", "system", "delivery").required().messages({ "any.required": "Notification type is required" }),
    title:    Joi.string().trim().max(200).required().messages({ "any.required": "Title is required" }),
    body:     Joi.string().trim().max(1000).required().messages({ "any.required": "Body is required" }),
    data:     Joi.object().optional(),
    channels: Joi.array().items(Joi.string().valid("push", "email", "sms")).default(["push"]),
  }),
};

// ─── Flash Sale ───────────────────────────────────────────────────────────────
const flashSale = {
  create: Joi.object({
    name:      Joi.string().trim().required().messages({ "any.required": "Flash sale name is required" }),
    medicines: Joi.array().items(
      Joi.object({
        medicine:        objectId().required(),
        discountPercent: Joi.number().min(1).max(99).required(),
        maxQuantity:     Joi.number().integer().positive().optional(),
      })
    ).min(1).required(),
    startAt:   Joi.date().required().messages({ "any.required": "Start date is required" }),
    endAt:     Joi.date().greater(Joi.ref("startAt")).required().messages({
      "any.required":  "End date is required",
      "date.greater":  "End date must be after start date",
    }),
    isActive:  Joi.boolean().default(true),
  }),
};

// ─── Wallet ───────────────────────────────────────────────────────────────────
const wallet = {
  topUp: Joi.object({
    amount:          Joi.number().positive().max(10000).required().messages({
      "any.required": "Amount is required",
      "number.max":   "Maximum top-up amount is SAR 10,000",
    }),
    paymentIntentId: Joi.string().required().messages({ "any.required": "Payment intent ID is required" }),
  }),
};

// ─── Article ──────────────────────────────────────────────────────────────────
const article = {
  create: Joi.object({
    title:    Joi.string().trim().min(5).max(200).required().messages({ "any.required": "Title is required" }),
    content:  Joi.string().min(50).required().messages({ "any.required": "Content is required" }),
    excerpt:  Joi.string().max(500).optional(),
    category: Joi.string().valid("health_tips", "medicine_info", "nutrition", "wellness", "news").optional(),
    tags:     Joi.string().max(500).optional(), // comma-separated
    status:   Joi.string().valid("draft", "published").default("draft"),
    featured: Joi.boolean().default(false),
  }),
};

// ─── Params & Query shared validators ────────────────────────────────────────
const params = {
  id: Joi.object({ id: objectId().required() }),
  idAndMedicineId: Joi.object({ id: objectId().required(), medicineId: objectId().required() }),
  guestAndMedicineId: Joi.object({ guestId: Joi.string().required(), medicineId: objectId().required() }),
};

// ─── Export all ───────────────────────────────────────────────────────────────
module.exports = {
  schemas: {
    auth,
    phoneOtp,
    nafath,
    biometric,
    pin,
    guest,
    device,
    medicine,
    category,
    order,
    cart,
    review,
    prescription,
    coupon,
    user,
    deliveryZone,
    notification,
    flashSale,
    wallet,
    article,
    params,
  },
};
