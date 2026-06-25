const XLSX = require('xlsx');
const fs = require('fs');

const filePath = '/Users/AmalAlSari/Downloads/Quants (stock.quant) (45).xlsx';
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

const productMap = {};
rows.forEach(row => {
  const name = row['Product'];
  if (!name || name.length < 3) return;
  const price = parseFloat(row['Product S.Price']) || 0;
  const qty = parseFloat(row['Available Quantity']) || 0;
  if (!productMap[name]) {
    productMap[name] = { name, price, quantity: 0, unit: row['Unit of Measure'] || 'Units' };
  }
  productMap[name].quantity += qty;
});

const products = Object.values(productMap).filter(p => p.price > 0);
console.log('Total:', products.length);
console.log('Sample:', JSON.stringify(products.slice(0,2), null, 2));
const fs2 = require('fs');
fs2.writeFileSync('/Users/AmalAlSari/Downloads/pharmacy-backend-main/products-import.json', JSON.stringify(products, null, 2));
console.log('Done: products-import.json');
