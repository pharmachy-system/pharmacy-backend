/**
 * ZATCA Phase 1 e-invoicing utilities.
 *
 * Phase 1 (Fatoorah) requirements:
 *  - Simplified tax invoice in XML (UBL 2.1 subset)
 *  - QR code encoded as TLV (Tag-Length-Value) base64
 *  - 15% VAT (standard rate, Saudi Arabia)
 *
 * Phase 2 (integration) requires ZATCA portal submission and cryptographic
 * signing — those hooks are marked TODO throughout this file.
 */

const crypto = require("crypto");

const VAT_RATE = 0.15;
const VAT_NUMBER = process.env.ZATCA_VAT_NUMBER || "300000000000003";
const SELLER_NAME = process.env.ZATCA_SELLER_NAME || "Al-Shifaa Pharmacy";

/** Compute VAT amount from a pre-tax total. */
function calcVat(pretaxTotal) {
  return parseFloat((pretaxTotal * VAT_RATE).toFixed(2));
}

/** Compute the pre-tax base from the order totals (excludes VAT). */
function orderPretaxTotal(order) {
  const gross = (order.subtotal || 0) + (order.deliveryFee || 0)
    - (order.discount || 0) - (order.couponDiscount || 0);
  return parseFloat(Math.max(gross, 0).toFixed(2));
}

/**
 * Build the ZATCA Phase 1 QR payload as a base64-encoded TLV string.
 *
 * Tags:
 *  1 → Seller name
 *  2 → VAT registration number
 *  3 → Invoice timestamp (ISO 8601)
 *  4 → Invoice total WITH VAT
 *  5 → VAT amount
 */
function buildQrTlv({ sellerName, vatNumber, timestamp, totalWithVat, vatAmount }) {
  function tlv(tag, value) {
    const valueBuf = Buffer.from(String(value), "utf8");
    const tagBuf   = Buffer.alloc(1);
    const lenBuf   = Buffer.alloc(1);
    tagBuf[0] = tag;
    lenBuf[0] = valueBuf.length;
    return Buffer.concat([tagBuf, lenBuf, valueBuf]);
  }

  const payload = Buffer.concat([
    tlv(1, sellerName),
    tlv(2, vatNumber),
    tlv(3, timestamp),
    tlv(4, totalWithVat.toFixed(2)),
    tlv(5, vatAmount.toFixed(2)),
  ]);

  return payload.toString("base64");
}

/**
 * Generate simplified ZATCA Phase 1 XML invoice.
 * Returns an XML string.
 */
function buildInvoiceXml({ invoiceUUID, issueDate, issueTime, order, buyer }) {
  const pretax   = orderPretaxTotal(order);
  const vat      = calcVat(pretax);
  const grandTotal = parseFloat((pretax + vat).toFixed(2));

  const items = (order.items || []).map((item) => {
    const lineTotal = parseFloat((item.price * item.quantity).toFixed(2));
    const lineVat   = calcVat(lineTotal);
    return `
    <cac:InvoiceLine>
      <cbc:ID>${item._id || crypto.randomUUID()}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="EA">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="SAR">${lineTotal.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name>${escapeXml(item.name)}</cbc:Name>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="SAR">${item.price.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="SAR">${lineVat.toFixed(2)}</cbc:TaxAmount>
      </cac:TaxTotal>
    </cac:InvoiceLine>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${order.orderNumber || invoiceUUID}</cbc:ID>
  <cbc:UUID>${invoiceUUID}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(SELLER_NAME)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${VAT_NUMBER}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(buyer.name || "Customer")}</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${vat.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${pretax.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${vat.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${pretax.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${pretax.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${grandTotal.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${grandTotal.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${items}
</Invoice>`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate all ZATCA Phase 1 artefacts for an order.
 * Returns { invoiceUUID, pretaxTotal, vatAmount, grandTotal, qrCode, xml }
 */
function generateInvoice(order, buyer = {}) {
  const now = new Date(order.createdAt || Date.now());
  const issueDate = now.toISOString().slice(0, 10);
  const issueTime = now.toISOString().slice(11, 19);
  const invoiceUUID = order.invoiceUUID || crypto.randomUUID();

  const pretaxTotal = orderPretaxTotal(order);
  const vatAmount   = calcVat(pretaxTotal);
  const grandTotal  = parseFloat((pretaxTotal + vatAmount).toFixed(2));

  const qrCode = buildQrTlv({
    sellerName:   SELLER_NAME,
    vatNumber:    VAT_NUMBER,
    timestamp:    now.toISOString(),
    totalWithVat: grandTotal,
    vatAmount,
  });

  const xml = buildInvoiceXml({ invoiceUUID, issueDate, issueTime, order, buyer });

  return { invoiceUUID, pretaxTotal, vatAmount, grandTotal, qrCode, xml };
}

module.exports = { generateInvoice, calcVat, orderPretaxTotal, buildQrTlv, VAT_RATE };
