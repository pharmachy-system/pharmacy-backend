/**
 * Email HTML Templates
 *
 * All templates use table-based inline CSS for maximum email-client compatibility.
 * Primary colour: #1a7f64  (pharmacy green)
 * Accent colour:  #f4b400  (gold)
 */

const APP_NAME    = process.env.APP_NAME    || "صيدليتي | Pharmacy";
const APP_URL     = process.env.CLIENT_URL  || "https://pharmacy.sa";
const SUPPORT_EMAIL = process.env.EMAIL_USER || "support@pharmacy.sa";

// ─── Shared layout wrapper ────────────────────────────────────────────────────
const layout = (title, contentHtml) => `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a7f64 0%,#0d5c47 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:0.5px;">💊 ${APP_NAME}</h1>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding:40px;">
            ${contentHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafb;padding:24px 40px;border-top:1px solid #e8edf2;text-align:center;">
            <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
              إذا لم تطلب هذه الرسالة، يمكنك تجاهلها بأمان.
            </p>
            <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
              If you did not request this email, you can safely ignore it.
            </p>
            <p style="margin:0;color:#9ca3af;font-size:12px;">
              © ${new Date().getFullYear()} ${APP_NAME} &nbsp;|&nbsp;
              <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a7f64;text-decoration:none;">${SUPPORT_EMAIL}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ─── Button helper ────────────────────────────────────────────────────────────
const btn = (href, labelEn, labelAr = "") => `
  <table cellpadding="0" cellspacing="0" style="margin:28px auto;">
    <tr>
      <td style="background:#1a7f64;border-radius:8px;padding:14px 36px;text-align:center;">
        <a href="${href}" style="color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;display:block;">
          ${labelAr ? `${labelAr} &nbsp;|&nbsp; ` : ""}${labelEn}
        </a>
      </td>
    </tr>
  </table>`;

// ─── Divider helper ───────────────────────────────────────────────────────────
const divider = () => `<hr style="border:none;border-top:1px solid #e8edf2;margin:24px 0;" />`;

// ─── 1. Welcome Email ─────────────────────────────────────────────────────────
exports.welcomeEmail = ({ name, verificationLink = null }) =>
  layout("مرحباً بك | Welcome", `
    <h2 style="margin:0 0 16px;color:#111827;font-size:22px;">مرحباً ${name} 👋</h2>
    <h3 style="margin:0 0 8px;color:#374151;font-size:17px;font-weight:500;direction:ltr;">Welcome to ${APP_NAME}!</h3>

    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:16px 0;">
      نحن سعداء بانضمامك إلينا. يمكنك الآن تصفح آلاف المنتجات الصيدلانية، وطلب أدويتك بسهولة، وتتبع طلباتك في الوقت الفعلي.
    </p>
    <p style="color:#4b5563;font-size:14px;line-height:1.7;margin:0 0 20px;direction:ltr;">
      We're thrilled to have you on board. Browse thousands of pharmacy products, order your medicines easily, and track your orders in real time.
    </p>

    ${verificationLink ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 8px;color:#166534;font-size:14px;font-weight:600;">⚠️ تأكيد البريد الإلكتروني مطلوب | Email Verification Required</p>
        <p style="margin:0;color:#15803d;font-size:13px;">يرجى تأكيد بريدك الإلكتروني لتفعيل حسابك كاملاً.</p>
      </div>
      ${btn(verificationLink, "Verify Email", "تأكيد البريد الإلكتروني")}
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:8px 0 0;">
        ينتهي الرابط خلال 24 ساعة | Link expires in 24 hours
      </p>
    ` : `
      ${btn(APP_URL, "Start Shopping", "ابدأ التسوق")}
    `}

    ${divider()}
    <p style="color:#6b7280;font-size:13px;margin:0;">
      هل تحتاج مساعدة؟ تواصل معنا على
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a7f64;">${SUPPORT_EMAIL}</a>
    </p>
  `);

// ─── 2. Password Reset Email ──────────────────────────────────────────────────
exports.passwordResetEmail = ({ name, resetLink, expiresInMinutes = 10 }) =>
  layout("إعادة تعيين كلمة المرور | Password Reset", `
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">إعادة تعيين كلمة المرور</h2>
    <h3 style="margin:0 0 20px;color:#374151;font-size:16px;font-weight:400;direction:ltr;">Password Reset Request</h3>

    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 8px;">مرحباً ${name}،</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.7;margin:0 0 20px;">
      لقد تلقينا طلباً لإعادة تعيين كلمة مرور حسابك. انقر على الزر أدناه لإعادة التعيين.
      <br/>
      <span style="direction:ltr;display:block;margin-top:6px;color:#6b7280;">We received a request to reset your account password. Click the button below to reset it.</span>
    </p>

    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <p style="margin:0;color:#9a3412;font-size:13px;">
        ⏱️ ينتهي هذا الرابط خلال <strong>${expiresInMinutes} دقيقة</strong>.
        This link expires in <strong>${expiresInMinutes} minutes</strong>.
      </p>
    </div>

    ${btn(resetLink, "Reset Password", "إعادة تعيين كلمة المرور")}

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:24px 0 0;">
      <p style="margin:0;color:#991b1b;font-size:13px;">
        🔒 إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد أو التواصل معنا فوراً.
        <br/>
        If you did not request a password reset, please ignore this email or contact us immediately.
      </p>
    </div>
  `);

// ─── 3. Order Confirmation Email ──────────────────────────────────────────────
exports.orderConfirmationEmail = ({ name, order }) => {
  const itemsRows = (order.items || []).map((item) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px;">
        ${item.name || item.medicine?.name || "—"}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;text-align:center;">
        ×${item.quantity}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827;font-size:14px;text-align:left;direction:ltr;">
        ${order.currency || "SAR"} ${((item.price || 0) * item.quantity).toFixed(2)}
      </td>
    </tr>`).join("");

  return layout(`تأكيد الطلب #${order.orderNumber || order._id} | Order Confirmation`, `
    <h2 style="margin:0 0 6px;color:#111827;font-size:22px;">تم تأكيد طلبك ✅</h2>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;direction:ltr;">Your order has been confirmed!</p>

    <p style="color:#4b5563;font-size:15px;margin:0 0 20px;">مرحباً ${name}،<br/>شكراً لثقتك بنا. سيتم معالجة طلبك وإرساله في أقرب وقت.</p>

    <!-- Order info box -->
    <div style="background:#f8fafb;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color:#6b7280;font-size:13px;padding:4px 0;">رقم الطلب | Order #</td>
          <td style="color:#111827;font-size:14px;font-weight:600;text-align:left;direction:ltr;">${order.orderNumber || order._id}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;font-size:13px;padding:4px 0;">طريقة الدفع | Payment</td>
          <td style="color:#374151;font-size:14px;text-align:left;direction:ltr;">${order.paymentMethod || "—"}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;font-size:13px;padding:4px 0;">الحالة | Status</td>
          <td style="padding:4px 0;">
            <span style="background:#dcfce7;color:#166534;font-size:12px;padding:3px 10px;border-radius:20px;font-weight:600;">
              ${order.status || "Pending"}
            </span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Items table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:10px 12px;text-align:right;color:#6b7280;font-size:13px;font-weight:600;">المنتج</th>
          <th style="padding:10px 12px;text-align:center;color:#6b7280;font-size:13px;font-weight:600;">الكمية</th>
          <th style="padding:10px 12px;text-align:left;color:#6b7280;font-size:13px;font-weight:600;direction:ltr;">السعر</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
        ${order.discount ? `
        <tr>
          <td colspan="2" style="padding:10px 12px;color:#6b7280;font-size:13px;text-align:right;">خصم الكوبون</td>
          <td style="padding:10px 12px;color:#16a34a;font-size:14px;text-align:left;direction:ltr;">- ${order.currency || "SAR"} ${order.discount.toFixed(2)}</td>
        </tr>` : ""}
        ${order.deliveryFee !== undefined ? `
        <tr>
          <td colspan="2" style="padding:10px 12px;color:#6b7280;font-size:13px;text-align:right;">رسوم التوصيل</td>
          <td style="padding:10px 12px;color:#374151;font-size:14px;text-align:left;direction:ltr;">${order.currency || "SAR"} ${(order.deliveryFee || 0).toFixed(2)}</td>
        </tr>` : ""}
        <tr style="background:#f8fafb;">
          <td colspan="2" style="padding:12px;color:#111827;font-size:15px;font-weight:700;text-align:right;">الإجمالي</td>
          <td style="padding:12px;color:#1a7f64;font-size:16px;font-weight:700;text-align:left;direction:ltr;">${order.currency || "SAR"} ${(order.totalAmount || 0).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    ${order.trackingUrl ? btn(order.trackingUrl, "Track Order", "تتبع الطلب") : btn(`${APP_URL}/orders/${order._id}`, "View Order", "عرض الطلب")}
  `);
};

// ─── 4. OTP / Email Verification Email ───────────────────────────────────────
exports.otpEmail = ({ name, otp, purpose = "التحقق من البريد الإلكتروني", expiresInMinutes = 5 }) =>
  layout("رمز التحقق | Verification Code", `
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">رمز التحقق الخاص بك</h2>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;direction:ltr;">Your Verification Code</p>

    <p style="color:#4b5563;font-size:15px;margin:0 0 6px;">مرحباً ${name}،</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.7;margin:0 0 24px;">
      رمز التحقق الخاص بـ <strong>${purpose}</strong> هو:
    </p>

    <!-- OTP Display -->
    <div style="text-align:center;margin:0 0 24px;">
      <div style="display:inline-block;background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;padding:20px 48px;">
        <p style="margin:0;font-size:40px;font-weight:800;letter-spacing:12px;color:#15803d;font-family:monospace;">${otp}</p>
      </div>
    </div>

    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 18px;text-align:center;">
      <p style="margin:0;color:#9a3412;font-size:13px;">
        ⏱️ ينتهي هذا الرمز خلال <strong>${expiresInMinutes} دقائق</strong> | Expires in <strong>${expiresInMinutes} minutes</strong>
      </p>
    </div>

    <p style="color:#9ca3af;font-size:12px;margin:20px 0 0;text-align:center;">
      لا تشارك هذا الرمز مع أي شخص. | Never share this code with anyone.
    </p>
  `);

// ─── 5. Order Status Update Email ─────────────────────────────────────────────
const STATUS_CONFIG = {
  confirmed:   { ar: "تم التأكيد",     en: "Confirmed",    bg: "#dcfce7", color: "#166534", icon: "✅" },
  processing:  { ar: "قيد المعالجة",   en: "Processing",   bg: "#dbeafe", color: "#1e40af", icon: "⚙️" },
  shipped:     { ar: "تم الشحن",        en: "Shipped",      bg: "#ede9fe", color: "#6d28d9", icon: "🚚" },
  out_for_delivery: { ar: "خارج للتسليم", en: "Out for Delivery", bg: "#fef9c3", color: "#854d0e", icon: "🛵" },
  delivered:   { ar: "تم التسليم",     en: "Delivered",    bg: "#dcfce7", color: "#166534", icon: "📦" },
  cancelled:   { ar: "ملغي",           en: "Cancelled",    bg: "#fee2e2", color: "#991b1b", icon: "❌" },
  refunded:    { ar: "مسترد",          en: "Refunded",     bg: "#f3f4f6", color: "#374151", icon: "💳" },
};

exports.orderStatusEmail = ({ name, order, newStatus }) => {
  const cfg = STATUS_CONFIG[newStatus] || { ar: newStatus, en: newStatus, bg: "#f3f4f6", color: "#374151", icon: "📋" };
  return layout(`تحديث الطلب #${order.orderNumber || order._id}`, `
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">تحديث حالة طلبك ${cfg.icon}</h2>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;direction:ltr;">Order Status Update</p>

    <p style="color:#4b5563;font-size:15px;margin:0 0 20px;">مرحباً ${name}،<br/>
    لقد تم تحديث حالة طلبك رقم <strong>${order.orderNumber || order._id}</strong>.</p>

    <div style="text-align:center;margin:0 0 24px;">
      <span style="background:${cfg.bg};color:${cfg.color};font-size:18px;font-weight:700;padding:12px 32px;border-radius:24px;display:inline-block;">
        ${cfg.icon} &nbsp; ${cfg.ar} &nbsp;|&nbsp; ${cfg.en}
      </span>
    </div>

    ${newStatus === "shipped" && order.trackingNumber ? `
      <div style="background:#f8fafb;border-radius:8px;padding:14px 18px;text-align:center;margin:0 0 20px;">
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">رقم التتبع | Tracking Number</p>
        <p style="margin:0;color:#111827;font-size:18px;font-weight:700;font-family:monospace;">${order.trackingNumber}</p>
      </div>
    ` : ""}

    ${btn(`${APP_URL}/orders/${order._id}`, "View Order Details", "عرض تفاصيل الطلب")}
  `);
};

// ─── 6. Low Stock Alert (internal / admin) ────────────────────────────────────
exports.lowStockAlertEmail = ({ items }) => {
  const rows = items.map((item) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:14px;">${item.name}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">
        <span style="background:#fee2e2;color:#991b1b;font-size:12px;padding:3px 10px;border-radius:12px;font-weight:600;">${item.stock}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;text-align:center;">${item.threshold || "—"}</td>
    </tr>`).join("");

  return layout("تنبيه المخزون المنخفض | Low Stock Alert", `
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">⚠️ تنبيه مخزون منخفض</h2>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;direction:ltr;">Low Stock Alert — Action Required</p>
    <p style="color:#4b5563;font-size:14px;margin:0 0 20px;">المنتجات التالية وصلت إلى حد المخزون المنخفض:</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#fef2f2;">
          <th style="padding:10px 12px;text-align:right;color:#6b7280;font-size:13px;">المنتج</th>
          <th style="padding:10px 12px;text-align:center;color:#6b7280;font-size:13px;">المخزون الحالي</th>
          <th style="padding:10px 12px;text-align:center;color:#6b7280;font-size:13px;">الحد الأدنى</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    ${btn(`${APP_URL}/admin/inventory`, "Manage Inventory", "إدارة المخزون")}
  `);
};
