/**
 * Joi Validators — All Routes
 *
 * Bilingual messages format:  "English message | رسالة عربية"
 * Frontend can split on " | " to display the preferred language.
 *
 * Usage:
 *   const { joiValidate } = require("../middleware/joiValidate.middleware");
 *   const { schemas } = require("../validators/joi.validators");
 *
 *   router.post("/register", joiValidate(schemas.auth.register), register);
 */

const Joi = require("joi");

// ─── Shared helpers ───────────────────────────────────────────────────────────
const m = (en, ar) => `${en} | ${ar}`;

/** MongoDB ObjectId */
const objectId = () =>
  Joi.string()
    .pattern(/^[a-f\d]{24}$/i)
    .messages({
      "string.pattern.base": m("Invalid ID format", "صيغة المعرف غير صالحة"),
      "string.empty":        m("ID is required", "المعرف مطلوب"),
      "any.required":        m("ID is required", "المعرف مطلوب"),
    });

/** Saudi / international phone  */
const phone = () =>
  Joi.string()
    .pattern(/^\+?[0-9]{7,15}$/)
    .messages({
      "string.pattern.base": m("Invalid phone number", "رقم الهاتف غير صالح"),
      "string.empty":        m("Phone is required", "رقم الهاتف مطلوب"),
    });

/** Password — min 8 chars, at least one letter and one number */
const strongPassword = () =>
  Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .messages({
      "string.min":          m("Password must be at least 8 characters", "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
      "string.pattern.base": m("Password must contain at least one letter and one number", "يجب أن تحتوي كلمة المرور على حرف ورقم"),
      "string.empty":        m("Password is required", "كلمة المرور مطلوبة"),
      "any.required":        m("Password is required", "كلمة المرور مطلوبة"),
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
      "string.min":   m("Name must be at least 2 characters", "الاسم يجب أن يكون حرفين على الأقل"),
      "string.max":   m("Name must not exceed 60 characters", "الاسم يجب ألا يتجاوز 60 حرفاً"),
      "string.empty": m("Name is required", "الاسم مطلوب"),
      "any.required": m("Name is required", "الاسم مطلوب"),
    }),
    email: Joi.string().trim().email().required().messages({
      "string.email":  m("Invalid email address", "البريد الإلكتروني غير صالح"),
      "string.empty":  m("Email is required", "البريد الإلكتروني مطلوب"),
      "any.required":  m("Email is required", "البريد الإلكتروني مطلوب"),
    }),
    password: strongPassword().required(),
    phone:    phone().optional(),
    role:     Joi.string().valid("customer", "pharmacist").default("customer").messages({
      "any.only": m("Role must be customer or pharmacist", "الدور يجب أن يكون عميلاً أو صيدلانياً"),
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
      "string.email":  m("Invalid email address", "البريد الإلكتروني غير صالح"),
      "any.required":  m("Email is required", "البريد الإلكتروني مطلوب"),
    }),
    password: Joi.string().required().messages({
      "any.required": m("Password is required", "كلمة المرور مطلوبة"),
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
      "string.email":  m("Invalid email address", "البريد الإلكتروني غير صالح"),
      "any.required":  m("Email is required", "البريد الإلكتروني مطلوب"),
    }),
  }),

  resetPassword: Joi.object({
    password: strongPassword().required(),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required().messages({
      "any.required": m("Current password is required", "كلمة المرور الحالية مطلوبة"),
    }),
    newPassword: strongPassword().required()
      .invalid(Joi.ref("currentPassword"))
      .messages({
        "any.invalid": m("New password must be different from current password", "كلمة المرور الجديدة يجب أن تختلف عن الحالية"),
      }),
  }),

  verifyEmail: Joi.object({
    otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      "string.length":       m("OTP must be 6 digits", "رمز التحقق يجب أن يكون 6 أرقام"),
      "string.pattern.base": m("OTP must contain digits only", "رمز التحقق يجب أن يحتوي على أرقام فقط"),
      "any.required":        m("OTP is required", "رمز التحقق مطلوب"),
    }),
  }),

  refreshToken: Joi.object({
    token:      Joi.string().optional(),
    refreshToken: Joi.string().optional(),
    deviceId:   Joi.string().optional(),
  }).or("token", "refreshToken", "deviceId").messages({
    "object.missing": m("Provide token, refreshToken, or deviceId", "يرجى إرسال token أو refreshToken أو deviceId"),
  }),
};

// ─── Phone OTP ────────────────────────────────────────────────────────────────
const phoneOtp = {
  send: Joi.object({
    phone: phone().required().messages({
      "any.required": m("Phone number is required", "رقم الهاتف مطلوب"),
    }),
  }),

  verify: Joi.object({
    phone: phone().required().messages({
      "any.required": m("Phone number is required", "رقم الهاتف مطلوب"),
    }),
    otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      "string.length":       m("OTP must be 6 digits", "رمز التحقق يجب أن يكون 6 أرقام"),
      "string.pattern.base": m("OTP must contain digits only", "رمز التحقق يجب أن يحتوي على أرقام فقط"),
      "any.required":        m("OTP is required", "رمز التحقق مطلوب"),
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
      "string.pattern.base": m("National ID must be exactly 10 digits", "رقم الهوية يجب أن يكون 10 أرقام"),
      "any.required":        m("National ID is required", "رقم الهوية الوطنية مطلوب"),
    }),
  }),
};

// ─── Biometric ────────────────────────────────────────────────────────────────
const biometric = {
  enable: Joi.object({
    deviceId: Joi.string().required().messages({
      "any.required": m("Device ID is required", "معرّف الجهاز مطلوب"),
    }),
  }),

  verify: Joi.object({
    deviceId:       Joi.string().required().messages({
      "any.required": m("Device ID is required", "معرّف الجهاز مطلوب"),
    }),
    biometricToken: Joi.string().required().messages({
      "any.required": m("Biometric token is required", "رمز البصمة مطلوب"),
    }),
  }),

  disable: Joi.object({
    deviceId: Joi.string().required().messages({
      "any.required": m("Device ID is required", "معرّف الجهاز مطلوب"),
    }),
  }),
};

// ─── PIN ──────────────────────────────────────────────────────────────────────
const pin = {
  set: Joi.object({
    deviceId: Joi.string().required().messages({
      "any.required": m("Device ID is required", "معرّف الجهاز مطلوب"),
    }),
    pin: Joi.string().pattern(/^\d{4,8}$/).required().messages({
      "string.pattern.base": m("PIN must be 4-8 digits", "الرمز السري يجب أن يكون 4 إلى 8 أرقام"),
      "any.required":        m("PIN is required", "الرمز السري مطلوب"),
    }),
  }),

  verify: Joi.object({
    deviceId: Joi.string().required().messages({
      "any.required": m("Device ID is required", "معرّف الجهاز مطلوب"),
    }),
    pin: Joi.string().pattern(/^\d{4,8}$/).required().messages({
      "string.pattern.base": m("PIN must be 4-8 digits", "الرمز السري يجب أن يكون 4 إلى 8 أرقام"),
      "any.required":        m("PIN is required", "الرمز السري مطلوب"),
    }),
  }),

  remove: Joi.object({
    deviceId: Joi.string().required().messages({
      "any.required": m("Device ID is required", "معرّف الجهاز مطلوب"),
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
      "any.required": m("Medicine ID is required", "معرّف الدواء مطلوب"),
    }),
    quantity: Joi.number().integer().min(1).max(99).default(1).messages({
      "number.min": m("Quantity must be at least 1", "الكمية يجب أن تكون على الأقل 1"),
      "number.max": m("Quantity cannot exceed 99", "الكمية لا يمكن أن تتجاوز 99"),
    }),
  }),

  updateCartItem: Joi.object({
    quantity: Joi.number().integer().min(0).max(99).required().messages({
      "number.min":   m("Quantity cannot be negative", "الكمية لا يمكن أن تكون سالبة"),
      "number.max":   m("Quantity cannot exceed 99", "الكمية لا يمكن أن تتجاوز 99"),
      "any.required": m("Quantity is required", "الكمية مطلوبة"),
    }),
  }),

  convert: Joi.object({
    guestId:  Joi.string().required().messages({ "any.required": m("Guest ID is required", "معرّف الضيف مطلوب") }),
    name:     Joi.string().trim().min(2).max(60).required().messages({ "any.required": m("Name is required", "الاسم مطلوب") }),
    email:    Joi.string().trim().email().required().messages({ "any.required": m("Email is required", "البريد الإلكتروني مطلوب") }),
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
    "object.min": m("Provide at least one field to update", "يرجى تحديد حقل واحد على الأقل للتحديث"),
  }),
};

// ─── Medicine ─────────────────────────────────────────────────────────────────
const medicine = {
  create: Joi.object({
    name:               Joi.string().trim().min(2).max(200).required().messages({ "any.required": m("Medicine name is required", "اسم الدواء مطلوب") }),
    nameAr:             Joi.string().trim().max(200).optional(),
    description:        Joi.string().max(2000).optional(),
    price:              Joi.number().positive().required().messages({ "any.required": m("Price is required", "السعر مطلوب"), "number.positive": m("Price must be positive", "السعر يجب أن يكون موجباً") }),
    salePrice:          Joi.number().positive().optional(),
    stock:              Joi.number().integer().min(0).required().messages({ "any.required": m("Stock is required", "المخزون مطلوب") }),
    category:           objectId().required().messages({ "any.required": m("Category is required", "الفئة مطلوبة") }),
    brand:              objectId().optional(),
    sku:                Joi.string().trim().max(50).optional(),
    barcode:            Joi.string().trim().max(50).optional(),
    requiresPrescription: Joi.boolean().default(false),
    expiryDate:         Joi.date().greater("now").optional().messages({ "date.greater": m("Expiry date must be in the future", "تاريخ الانتهاء يجب أن يكون في المستقبل") }),
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
    quantity:  Joi.number().integer().required().messages({ "any.required": m("Quantity is required", "الكمية مطلوبة") }),
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
    name:        Joi.string().trim().min(2).max(100).required().messages({ "any.required": m("Category name is required", "اسم الفئة مطلوب") }),
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
        quantity: Joi.number().integer().min(1).required().messages({ "any.required": m("Quantity is required", "الكمية مطلوبة") }),
      })
    ).min(1).required().messages({
      "array.min":    m("Order must have at least one item", "الطلب يجب أن يحتوي على عنصر واحد على الأقل"),
      "any.required": m("Order items are required", "عناصر الطلب مطلوبة"),
    }),
    paymentMethod:   Joi.string().valid("cash", "card", "wallet", "insurance").required().messages({
      "any.only":     m("Payment method must be cash, card, wallet, or insurance", "طريقة الدفع يجب أن تكون: نقداً، بطاقة، محفظة، أو تأمين"),
      "any.required": m("Payment method is required", "طريقة الدفع مطلوبة"),
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
        "any.only":     m("Invalid order status", "حالة الطلب غير صالحة"),
        "any.required": m("Status is required", "الحالة مطلوبة"),
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
    medicineId: objectId().required().messages({ "any.required": m("Medicine ID is required", "معرّف الدواء مطلوب") }),
    quantity:   Joi.number().integer().min(1).max(99).default(1),
  }),

  updateItem: Joi.object({
    quantity: Joi.number().integer().min(0).max(99).required().messages({
      "any.required": m("Quantity is required", "الكمية مطلوبة"),
    }),
  }),

  applyCoupon: Joi.object({
    code: Joi.string().trim().uppercase().required().messages({
      "any.required": m("Coupon code is required", "كود الخصم مطلوب"),
    }),
  }),
};

// ─── Review ───────────────────────────────────────────────────────────────────
const review = {
  create: Joi.object({
    medicine: objectId().required().messages({ "any.required": m("Medicine ID is required", "معرّف الدواء مطلوب") }),
    rating:   Joi.number().integer().min(1).max(5).required().messages({
      "number.min":   m("Rating must be at least 1", "التقييم يجب أن يكون 1 على الأقل"),
      "number.max":   m("Rating must not exceed 5", "التقييم يجب ألا يتجاوز 5"),
      "any.required": m("Rating is required", "التقييم مطلوب"),
    }),
    comment: Joi.string().min(5).max(1000).optional().messages({
      "string.min": m("Comment must be at least 5 characters", "التعليق يجب أن يكون 5 أحرف على الأقل"),
      "string.max": m("Comment must not exceed 1000 characters", "التعليق يجب ألا يتجاوز 1000 حرف"),
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
    doctorName: Joi.string().trim().min(2).max(100).required().messages({ "any.required": m("Doctor name is required", "اسم الطبيب مطلوب") }),
    medicines:  Joi.array().items(Joi.string()).min(1).optional(),
    notes:      Joi.string().max(500).optional(),
    expiryDate: Joi.date().greater("now").optional(),
  }),

  updateStatus: Joi.object({
    status:          Joi.string().valid("pending", "approved", "rejected", "expired").required().messages({
      "any.only":     m("Invalid prescription status", "حالة الوصفة الطبية غير صالحة"),
      "any.required": m("Status is required", "الحالة مطلوبة"),
    }),
    pharmacistNotes: Joi.string().max(500).optional(),
    rejectionReason: Joi.string().max(500).when("status", { is: "rejected", then: Joi.required() }).messages({
      "any.required": m("Rejection reason is required when rejecting", "سبب الرفض مطلوب عند الرفض"),
    }),
  }),
};

// ─── Coupon ───────────────────────────────────────────────────────────────────
const coupon = {
  create: Joi.object({
    code:             Joi.string().trim().uppercase().alphanum().min(4).max(20).required().messages({ "any.required": m("Coupon code is required", "كود الخصم مطلوب") }),
    type:             Joi.string().valid("percentage", "fixed").required().messages({ "any.required": m("Discount type is required", "نوع الخصم مطلوب") }),
    value:            Joi.number().positive().required().messages({ "any.required": m("Discount value is required", "قيمة الخصم مطلوبة") }),
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
    birthDate: Joi.date().less("now").optional().messages({ "date.less": m("Birth date must be in the past", "تاريخ الميلاد يجب أن يكون في الماضي") }),
    language:  Joi.string().valid("ar", "en").optional(),
    timezone:  Joi.string().max(60).optional(),
  }),

  addAddress: Joi.object({
    label:      Joi.string().valid("home", "work", "other").default("home"),
    fullName:   Joi.string().trim().required().messages({ "any.required": m("Full name is required", "الاسم الكامل مطلوب") }),
    phone:      phone().required(),
    street:     Joi.string().trim().required().messages({ "any.required": m("Street address is required", "عنوان الشارع مطلوب") }),
    city:       Joi.string().trim().required().messages({ "any.required": m("City is required", "المدينة مطلوبة") }),
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
    name:           Joi.string().trim().required().messages({ "any.required": m("Zone name is required", "اسم المنطقة مطلوب") }),
    nameAr:         Joi.string().trim().optional(),
    cities:         Joi.array().items(Joi.string()).min(1).required().messages({ "any.required": m("At least one city is required", "مدينة واحدة على الأقل مطلوبة") }),
    deliveryFee:    Joi.number().min(0).required().messages({ "any.required": m("Delivery fee is required", "رسوم التوصيل مطلوبة") }),
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
    type:     Joi.string().valid("order", "prescription", "promotion", "reminder", "system", "delivery").required().messages({ "any.required": m("Notification type is required", "نوع الإشعار مطلوب") }),
    title:    Joi.string().trim().max(200).required().messages({ "any.required": m("Title is required", "العنوان مطلوب") }),
    body:     Joi.string().trim().max(1000).required().messages({ "any.required": m("Body is required", "النص مطلوب") }),
    data:     Joi.object().optional(),
    channels: Joi.array().items(Joi.string().valid("push", "email", "sms")).default(["push"]),
  }),
};

// ─── Flash Sale ───────────────────────────────────────────────────────────────
const flashSale = {
  create: Joi.object({
    name:      Joi.string().trim().required().messages({ "any.required": m("Flash sale name is required", "اسم العرض مطلوب") }),
    medicines: Joi.array().items(
      Joi.object({
        medicine:        objectId().required(),
        discountPercent: Joi.number().min(1).max(99).required(),
        maxQuantity:     Joi.number().integer().positive().optional(),
      })
    ).min(1).required(),
    startAt:   Joi.date().required().messages({ "any.required": m("Start date is required", "تاريخ البدء مطلوب") }),
    endAt:     Joi.date().greater(Joi.ref("startAt")).required().messages({
      "any.required":  m("End date is required", "تاريخ الانتهاء مطلوب"),
      "date.greater":  m("End date must be after start date", "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء"),
    }),
    isActive:  Joi.boolean().default(true),
  }),
};

// ─── Wallet ───────────────────────────────────────────────────────────────────
const wallet = {
  topUp: Joi.object({
    amount:          Joi.number().positive().max(10000).required().messages({
      "any.required": m("Amount is required", "المبلغ مطلوب"),
      "number.max":   m("Maximum top-up amount is SAR 10,000", "الحد الأقصى للشحن هو 10,000 ريال"),
    }),
    paymentIntentId: Joi.string().required().messages({ "any.required": m("Payment intent ID is required", "معرّف الدفع مطلوب") }),
  }),
};

// ─── Article ──────────────────────────────────────────────────────────────────
const article = {
  create: Joi.object({
    title:    Joi.string().trim().min(5).max(200).required().messages({ "any.required": m("Title is required", "العنوان مطلوب") }),
    content:  Joi.string().min(50).required().messages({ "any.required": m("Content is required", "المحتوى مطلوب") }),
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
