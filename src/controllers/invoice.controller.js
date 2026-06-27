const Order = require("../models/Order.model");
const AppError = require("../utils/AppError");
const { generateInvoice } = require("../utils/zatca.util");

/**
 * GET /api/orders/:id/invoice
 * Returns ZATCA Phase 1 invoice data (JSON + QR + XML) for an order.
 * Accessible by the order owner or admin/pharmacist.
 */
exports.getOrderInvoice = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) return next(new AppError("Order not found", 404));

    const isOwner = order.user._id.toString() === req.user._id.toString();
    const isStaff = ["admin", "pharmacist"].includes(req.user.role);
    if (!isOwner && !isStaff) return next(new AppError("Access denied", 403));

    const buyer = { name: order.user.name, email: order.user.email };
    const invoice = generateInvoice(order, buyer);

    res.json({
      success: true,
      invoice: {
        invoiceUUID:  invoice.invoiceUUID,
        orderNumber:  order.orderNumber,
        issueDate:    (order.createdAt || new Date()).toISOString().slice(0, 10),
        sellerName:   process.env.ZATCA_SELLER_NAME || "Al-Shifaa Pharmacy",
        vatNumber:    process.env.ZATCA_VAT_NUMBER  || "300000000000003",
        buyer:        { name: buyer.name },
        pretaxTotal:  invoice.pretaxTotal,
        vatRate:      15,
        vatAmount:    invoice.vatAmount,
        grandTotal:   invoice.grandTotal,
        currency:     "SAR",
        qrCode:       invoice.qrCode,
        xml:          invoice.xml,
      },
    });
  } catch (err) {
    next(err);
  }
};
