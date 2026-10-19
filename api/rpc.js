const { API, ensureInit } = require('../lib/server');

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const fn = String(body.fn || '');
    const args = Array.isArray(body.args) ? body.args : [];
    if (!Object.prototype.hasOwnProperty.call(API, fn)) { res.status(404).json({ error: 'Función no encontrada: ' + fn }); return; }
    await ensureInit();
    const result = await API[fn].apply(null, args);
    res.status(200).json({ result: result === undefined ? null : result });
  } catch (e) {
    res.status(200).json({ error: (e && e.message) || String(e) });
  }
};
