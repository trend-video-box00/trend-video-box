const en = require('./locales/en.json');
const bn = require('./locales/bn.json');
const ur = require('./locales/ur.json');

const dict = { en, bn, ur };

function t(lang, key, vars = {}) {
  const table = dict[lang] || dict.en;
  let str = table[key] || dict.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return str;
}

function convert(amountUSD, currency, rates) {
  if (currency === 'USD') return amountUSD.toFixed(2);
  const rate = rates?.[currency] || 1;
  return (amountUSD * rate).toFixed(2);
}

const currencySymbol = { USD: '$', BDT: '৳', PKR: '₨' };

module.exports = { t, convert, currencySymbol };
