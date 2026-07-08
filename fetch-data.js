const fs = require('fs');

const API_KEY = process.env.VINOSMITH_API_KEY;
if (!API_KEY) { console.error('Missing VINOSMITH_API_KEY'); process.exit(1); }

const BASE = 'https://vinosmith.com/api/distributor';
const HEADERS = { Authorization: 'oauth ' + API_KEY };

const PRICE_TIERS = {
  FL: 'NY Frontline',
  T2: 'NY 2 Case Solid (5%)',
  T3: 'NY 3 Case Solid (10%)'
};

const LABEL_ALIASES = {
  'NY 2 Case Solid': 'NY 2 Case Solid (5%)',
  'NY 3 Case Solid': 'NY 3 Case Solid (10%)'
};

const TARGET_WAREHOUSES = [
  'Fond du Lac - New Jersey',
  'Zephyr Express - Benicia',
  'MHW Fond du Lac'
];

const WH_CODES = {
  'Fond du Lac - New Jersey': 'FDL',
  'Zephyr Express - Benicia': 'ZPH',
  'MHW Fond du Lac': 'MHW'
};

async function fetchJSON(path) {
  const res = await fetch(BASE + path, { headers: HEADERS });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

async function main() {
  const [invData, wineData, priceData] = await Promise.all([
    fetchJSON('/inventory'),
    fetchJSON('/wines'),
    fetchJSON('/prices')
  ]);

  const inventory = invData.data.inventory;
  const winesRaw = wineData.data.wines;
  const pricesRaw = priceData.data.prices;

  const winesMap = {};
  winesRaw.forEach(w => { winesMap[w.id] = w; });

  const pricesMap = {};
  pricesRaw.forEach(entry => {
    const id = String(entry.wine.id);
    const label = LABEL_ALIASES[entry.price.label] || entry.price.label;
    const cents = entry.price.price_cents || 0;
    if (!pricesMap[id]) pricesMap[id] = {};
    pricesMap[id][label] = cents;
  });

  const wines = [];

  inventory.forEach(item => {
    const wine = item.wine || {};
    const inv = item.inventory || {};
    const wh = item.warehouse || {};

    const onHand = parseFloat(inv.on_hand || 0);
    if (onHand <= 0) return;
    if (!TARGET_WAREHOUSES.includes(wh.name)) return;

    const grower = (wine.name || '').split(',')[0].trim();
    if (grower === 'Brandini') return;

    const w = winesMap[wine.id] || {};
    if (w.active === false) return;

    const p = pricesMap[String(wine.id)] || {};
    const unitSet = parseFloat(w.unit_set) || 1;

    const toCase = (tierLabel) => {
      const cents = p[tierLabel];
      if (!cents || cents <= 0) return 0;
      return Math.round(cents) / 100;
    };

    const p1 = toCase(PRICE_TIERS.FL);
    if (!p1) return;

    wines.push({
      c: wine.code,
      g: grower,
      w: (w.name || wine.name || '').replace(grower + ', ', '').replace(grower + ',', ''),
      v: w.vintage || '',
      co: w.country || '',
      r: w.region || '',
      wh: WH_CODES[wh.name] || wh.name,
      s: parseFloat(onHand.toFixed(1)),
      p1: p1,
      p2: toCase(PRICE_TIERS.T2),
      p3: toCase(PRICE_TIERS.T3)
    });
  });

  wines.sort((a, b) => a.g.localeCompare(b.g) || a.w.localeCompare(b.w));

  fs.writeFileSync('data.json', JSON.stringify(wines));
  console.log(`Wrote ${wines.length} wines to data.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
