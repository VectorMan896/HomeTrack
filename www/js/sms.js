/* ============================================================
   HomeTrack — SMS capture (REVIEW MODE)
   Parses transaction texts from APPROVED senders into a review
   queue. Nothing enters the budget until you approve it, so a
   mis-parsed bank/notice SMS can never silently add an entry.
   Active only inside the Android app; a no-op in a browser.
   ============================================================ */
(function (HT) {
  const S = () => HT.state.settings.sms;
  const plugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SmsReader) || null;
  const available = () => !!plugin();

  /* ---------- parsing ---------- */
  // Verbs cover M-Pesa 2nd-person ("Compraste", "Recebeste"), bank 3rd-person, and feminine bank forms ("debitada").
  const EXPENSE_WORDS = ['pagou', 'pagaste', 'comprou', 'compraste', 'compra', 'enviou', 'enviaste', 'transferiu', 'transferiste', 'transferencia', 'retirou', 'retiraste', 'levantou', 'levantaste', 'saque', 'sacaste', 'pagamento', 'debito', 'débito', 'debitado', 'debitada', 'gastaste'];
  const INCOME_WORDS = ['recebeu', 'recebeste', 'recebida', 'recebido', 'depositou', 'depositaste', 'deposito', 'depósito', 'credito', 'crédito', 'creditado', 'creditada'];
  // Texts that look like transactions but aren't — never parse these.
  const EXCLUDE = ['cartoes bancarios', 'cartões bancarios', 'no exterior', 'fraude', 'nao reconhece', 'não reconhece', 'caso nao', 'caso não',
    'codigo', 'código', 'use o codigo', 'para confirmar', 'senha', ' otp', 'pin ', 'promo', 'ganhe', 'bonus', 'bónus', 'publicidade', 'consulte',
    'juros', 'emprestimo', 'empréstimo', 'campanha', 'oferta', 'desconto', 'gratis', 'grátis',
    'teve problemas', 'foi cancelada', 'cancelada e o valor', 'devolvido', 'garanta', 'primeira compra', 'a espera de ti', 'txuna', 'fica on',
    'total pago', 'val energia'];  // last two: Credelec receipt — already tracked in the Power module

  // A money number: grouped thousands ("1,000.00", "1.250,50", "1 500,00") or plain ("300", "30.00").
  // The look-behind stops it starting mid-number, e.g. inside a phone number or reference.
  const NUM = '(?<![\\d.,])(\\d{1,3}(?:[\\s.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)(?![\\d])';

  function parseAmount(raw) {
    if (!raw) return NaN;
    let s = String(raw).replace(/[^\d.,]/g, '');
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) { if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); }
    else if (lastComma >= 0) { s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, ''); }
    else if (/^\d{1,3}\.\d{3}$/.test(s)) { s = s.replace(/\./g, ''); }
    else if ((s.match(/\./g) || []).length > 1) { s = s.replace(/\./g, ''); }
    return parseFloat(s);
  }

  // Returns { type, amount, note, categoryName } or null
  function parse(body, address) {
    if (!body) return null;
    const low = body.toLowerCase();
    if (EXCLUDE.some(w => low.includes(w))) return null;               // notices / fraud alerts / promos
    // Card-purchase notices ("MBIM -Cartao *8438 Usado ... MZN307,00 no LOJA") are spends.
    const isCardUse = /cart[aã]o.*\busad[oa]\b/i.test(low);
    const isIncome = INCOME_WORDS.some(w => low.includes(w));
    const isExpense = isCardUse || EXPENSE_WORDS.some(w => low.includes(w));
    if (!isIncome && !isExpense) return null;                          // no transaction verb → ignore (balance/OTP)

    // Amount: prefer "valor de X MT", then "X MT", then currency-PREFIXED "MZN307,00".
    let m = body.match(new RegExp('valor\\s+(?:de\\s+)?' + NUM + '\\s?(?:MT|MZN|Mt)\\b', 'i'))
         || body.match(new RegExp('valor\\s+(?:de\\s+)?(?:MZN|MT|Mt)\\s?' + NUM, 'i'))
         || body.match(new RegExp(NUM + '\\s?(?:MT|MZN|Mt)\\b', 'i'))
         || body.match(new RegExp('\\b(?:MZN|MT|Mt)\\s?' + NUM, 'i'));
    if (!m) return null;
    const amount = parseAmount(m[1]);
    if (!isFinite(amount) || amount <= 0) return null;

    // A clear receiving verb wins even if an expense-ish word ("pagamento") is also present.
    const strongIncome = /(recebeu|recebeste|recebida|recebido|creditad[oa]|depositou|depositaste|dep[oó]sito)/.test(low);
    const type = strongIncome ? 'income' : 'expense';
    let note = '';
    // Recipient/sender ("para 84… - JOAO", "de MARIA"), then merchant ("no SHOPRITE"). Must start with a
    // letter, so "de 10.00MT" (the fee) or "em 12/09" (a date) are skipped.
    const BAD = /^(valor|saldo|taxa|conta\b|tua\b|teu\b|sua\b|seu\b)/i;
    const pick = (re) => { for (const x of body.matchAll(re)) { const v = x[1].trim(); if (!BAD.test(v)) return v; } return ''; };
    note = pick(/\b(?:para|de)\s+(?:\+?\d[\d\s]{5,}\s*-\s*)?([A-Za-z\u00C0-\u00FF][^.,\n;:]{1,32})/gi)
        || pick(/\b(?:no|na|ao|em|a)\s+([A-Za-z\u00C0-\u00FF][^.,\n;:]{2,32})/gi);
    if (!note && address) note = String(address).trim();
    note = note.replace(/\s+/g, ' ').slice(0, 40);
    return { type, amount, note, categoryName: categoryFor(low) };
  }
  function categoryFor(low) {
    if (/(energia|credelec|edm|electric)/.test(low)) return 'Electricity';
    if (/(agua|água|fipag|water)/.test(low)) return 'Water';
    if (/(\d+\s?mb|\bmegas\b|\binternet\b|\bdados\b|\bbundle\b|airtime)/.test(low)) return 'Airtime / Internet';
    if (/(combust|fuel|gasol|petrol|posto|galp)/.test(low)) return 'Transport / Fuel';
    if (/(supermerc|mercado|shoprite|\bspar\b|woolworth|pick\s*n\s*pay|grocer|game stores)/.test(low)) return 'Groceries';
    return null;
  }

  /* ---------- allowlist + queue ---------- */
  function senderApproved(address) {
    const approved = (S().senders || []).map(x => String(x).toLowerCase().trim()).filter(Boolean);
    if (!approved.length) return false;
    const addr = String(address || '').toLowerCase().trim();
    return !!addr && approved.some(sn => addr === sn || addr.includes(sn) || sn.includes(addr));
  }
  function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; } return h; }
  // Signature = sender+text hash + time. A live text and the same text read from the inbox later have
  // different ids/timestamps, so they're matched by content within a 10-minute window instead.
  const contentKey = (msg) => 'c:' + hash(String(msg.address || '').trim() + '|' + (msg.body || '')) + ':';
  function sigFor(msg) { return contentKey(msg) + (msg.date || 0); }
  function alreadySeen(seen, seenList, msg) {
    if (msg.id && seen.has('id:' + msg.id)) return true;                         // older app versions
    if (seen.has('h:' + msg.date + ':' + hash(msg.body || ''))) return true;      // older app versions
    const k = contentKey(msg), d = msg.date || 0;
    return seenList.some(x => x.startsWith(k) && Math.abs(+x.slice(k.length) - d) < 10 * 60000);
  }
  function catId(name, type) {
    const cats = HT.state.budget.categories;
    let c = name && cats.find(x => x.name === name && x.type === 'expense');
    if (!c) c = cats.find(x => x.type === type && (type === 'income' ? x.name === 'M-Pesa in' || x.name === 'M-Pesa' : x.name === 'Other'));
    if (!c) c = cats.find(x => x.type === type);
    return c ? c.id : null;
  }

  // Queue parsed candidates for review (does NOT touch the budget).
  function importMessages(list) {
    const s = S();
    const seen = new Set(s.importedSig || []), seenList = Array.from(seen);
    const pending = s.pending || (s.pending = []);
    let queued = 0, maxDate = s.lastScan || 0;
    (list || []).forEach(msg => {
      maxDate = Math.max(maxDate, msg.date || 0);
      if (!senderApproved(msg.address)) return;
      if (alreadySeen(seen, seenList, msg)) return;
      const p = parse(msg.body, msg.address);
      if (!p) return;
      const sig = sigFor(msg);
      seen.add(sig); seenList.push(sig);
      pending.push({ sig, t: HT.toLocalInput(new Date(msg.date || Date.now())), address: msg.address || '', body: (msg.body || '').slice(0, 140), type: p.type, amount: p.amount, note: p.note, categoryName: p.categoryName });
      queued++;
    });
    s.importedSig = Array.from(seen).slice(-1200);
    s.pending = pending.slice(-200);
    if (maxDate > (s.lastScan || 0)) s.lastScan = maxDate;
    HT.save();
    if (queued) { if (HT.refresh) HT.refresh(); HT.toast(`${queued} SMS to review`); }
    return queued;
  }

  const pending = () => S().pending || [];
  const defaultCategoryId = (it) => catId(it.categoryName, it.type);
  function approve(sig, categoryId) {
    const it = pending().find(x => x.sig === sig); if (!it) return;
    const cid = categoryId || it.categoryId || catId(it.categoryName, it.type);
    HT.state.budget.transactions.push({ id: HT.uid(), t: it.t, amount: it.amount, type: it.type, categoryId: cid, note: it.note || 'SMS', source: 'sms', auto: true });
    S().pending = pending().filter(x => x.sig !== sig);
    HT.save(); if (HT.refresh) HT.refresh();
  }
  function dismiss(sig) { S().pending = pending().filter(x => x.sig !== sig); HT.save(); if (HT.refresh) HT.refresh(); }
  function approveAll() { pending().slice().forEach(x => approve(x.sig)); HT.toast('All approved'); }
  function dismissAll() { S().pending = []; HT.save(); if (HT.refresh) HT.refresh(); HT.toast('Review queue cleared'); }
  function forgetHistory() { S().importedSig = []; S().pending = []; HT.save(); if (HT.refresh) HT.refresh(); HT.toast('SMS history forgotten — scan to re-review'); }

  // ask=false → just check (automatic scans); ask=true → show the Android prompt (user tapped something).
  async function hasPerm(pl, ask) {
    try { const p = await pl.checkPermissions(); if (p && p.sms === 'granted') return true; } catch (e) {}
    if (!ask) return false;
    try { const r = await pl.requestPermission(); return !!(r && r.granted); } catch (e) { return false; }
  }

  async function listSenders() {
    const pl = plugin(); if (!pl) return [];
    try {
      if (!(await hasPerm(pl, true))) return [];
      const res = await pl.readMessages({ since: 0, max: 500 });
      const map = {};
      ((res && res.messages) || []).forEach(m => { const a = String(m.address || '?').trim(); if (!map[a]) map[a] = { address: a, count: 0, sample: (m.body || '').slice(0, 60) }; map[a].count++; });
      return Object.values(map).sort((a, b) => b.count - a.count);
    } catch (e) { return []; }
  }

  // silent: automatic scan (app start / resume) — no permission prompt, no "nothing found" toast.
  async function scanNow(silent) {
    const pl = plugin(); if (!pl) { if (!silent) HT.toast('SMS capture works in the Android app'); return 0; }
    try {
      if (!(await hasPerm(pl, !silent))) { if (!silent) HT.toast('SMS permission denied'); return 0; }
      const res = await pl.readMessages({ since: Date.now() - 45 * 86400000, max: 400 });
      const n = importMessages((res && res.messages) || []);
      if (!n && !silent) HT.toast((S().senders || []).length ? 'No new transactions found' : 'Add an approved sender first');
      return n;
    } catch (e) { if (!silent) HT.toast('SMS scan failed'); return 0; }
  }

  async function init() {
    const pl = plugin(); if (!pl) return;
    if (S().enabled === false) return;
    try {
      // Prompt on launch only once senders are approved (i.e. you've opted in); otherwise just check.
      const ask = (S().senders || []).length > 0 && !S().asked;
      if (ask) { S().asked = true; HT.save(); }
      if (await hasPerm(pl, ask)) { const res = await pl.readMessages({ since: Date.now() - 45 * 86400000, max: 400 }); importMessages((res && res.messages) || []); }
      pl.addListener('smsReceived', (msg) => { if (S().enabled !== false) importMessages([msg]); });
    } catch (e) { }
    HT.onResume(() => { if (S().enabled !== false) scanNow(true); });
  }

  HT.sms = { available, parse, parseAmount, importMessages, scanNow, listSenders, pending, defaultCategoryId, approve, dismiss, approveAll, dismissAll, forgetHistory, init };
})(window.HT);
