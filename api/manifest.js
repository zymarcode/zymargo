const S = require('../lib/server');

// Manifest de la app instalable (PWA). Usa el nombre de marca configurado.
module.exports = async function (req, res) {
  let name = 'STREAMFLIX';
  try {
    const brand = await S.getBrandConfig();
    if (brand && brand.brandName) name = String(brand.brandName);
  } catch (e) {}
  const short = name.length > 12 ? name.slice(0, 12) : name;
  const manifest = {
    name: name,
    short_name: short,
    description: name,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#141414',
    theme_color: '#141414',
    lang: 'es',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(JSON.stringify(manifest));
};
