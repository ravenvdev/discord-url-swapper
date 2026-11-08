'use strict';

// ───────────────────────────────────────────────────────────────
//  Discord Vanity URL Swapper — core engine
//  HTTP/2 tabanlı, MFA (2FA şifre) akışıyla vanity URL transferi.
//
//  Akış:
//    1) Alma hesabı (claim) için MFA token alınır
//    2) Silme hesabı (delete) için MFA token alınır
//    3) Mevcut URL, sahibi olan sunucudan silinir
//    4) URL hedef sunucuya PATCH ile eklenir
// ───────────────────────────────────────────────────────────────

const http2 = require('http2');

const DISCORD_HOST = 'https://canary.discord.com';

// Discord web istemcisini taklit eden sabit başlıklar.
const BASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) nosniff/1.0.9164 Chrome/124.0.6367.243 Electron/30.2.0 Safari/537.36',
  'Content-Type': 'application/json',
  'X-Super-Properties':
    'eyJvcyI6IkFuZHJvaWQiLCJicm93c2VyIjoiQW5kcm9pZCBDaHJvbWUiLCJkZXZpY2UiOiJBbmRyb2lkIiwic3lzdGVtX2xvY2FsZSI6InRyLVRSIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDYuMDsgTmV4dXMgNSBCdWlsZC9NUkE1OE4pIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMzEuMC4wLjAgTW9iaWxlIFNhZmFyaS81MzcuMzYiLCJicm93c2VyX3ZlcnNpb24iOiIxMzEuMC4wLjAiLCJvc192ZXJzaW9uIjoiNi4wIiwicmVsZWFzZV9jaGFubmVsIjoic3RhYmxlIiwiY2xpZW50X2J1aWxkX251bWJlciI6MzU1NjI0LCJjbGllbnRfZXZlbnRfc291cmNlIjpudWxsLCJoYXNfY2xpZW50X21vZHMiOmZhbHNlfQ==',
};

/**
 * Tek bir HTTP/2 isteği yapar ve gövdeyi string olarak döndürür.
 * Her istek için ayrı bir bağlantı açılır ve kapatılır.
 */
function http2Request(method, path, token, customHeaders = {}, body = null) {
  return new Promise((resolve, reject) => {
    let client;
    try {
      client = http2.connect(DISCORD_HOST);
    } catch (err) {
      reject(err);
      return;
    }

    let settled = false;
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      try { client.close(); } catch { /* yok say */ }
      fn(arg);
    };

    client.on('error', (err) => done(reject, err));

    const reqHeaders = { ...BASE_HEADERS, ...customHeaders };
    if (token) reqHeaders.Authorization = token;

    let req;
    try {
      req = client.request({ ':method': method, ':path': path, ...reqHeaders });
    } catch (err) {
      done(reject, err);
      return;
    }

    // Takılı kalan istekleri 15 sn sonra düşür.
    req.setTimeout(15000, () => {
      req.close(http2.constants.NGHTTP2_CANCEL);
      done(reject, new Error('İstek zaman aşımına uğradı'));
    });

    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => done(resolve, data));
    req.on('error', (err) => done(reject, err));

    if (body) req.write(body);
    req.end();
  });
}

/**
 * http2Request'in JSON parse eden sarmalayıcısı.
 * Hata durumunda null döndürür (çağıran taraf null kontrolü yapar).
 */
async function apiRequest(method, path, token, customHeaders = {}, body = null) {
  try {
    const raw = await http2Request(method, path, token, customHeaders, body);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── MFA (2FA) akışı ───

/**
 * Korunan bir işlem deneyip Discord'un döndürdüğü MFA ticket'ını yakalar.
 */
async function requestMfaTicket(token) {
  const response = await apiRequest('PATCH', '/api/guilds/0/vanity-url', token);
  if (response && response.code === 60003) {
    return (response.mfa && response.mfa.ticket) || null;
  }
  return null;
}

/**
 * Ticket + şifre ile MFA'yı tamamlar ve kısa ömürlü MFA token'ı döndürür.
 */
async function finishMfa(ticket, token, password) {
  const body = JSON.stringify({ ticket, mfa_type: 'password', data: password });
  const response = await apiRequest('POST', '/api/v9/mfa/finish', token, {}, body);
  return (response && response.token) || null;
}

/**
 * Bir hesap için tam MFA akışını çalıştırır. Başarısızsa null.
 */
async function initializeMfa(token, password) {
  const ticket = await requestMfaTicket(token);
  if (!ticket) return null;
  return finishMfa(ticket, token, password);
}

function mfaHeaders(mfaToken) {
  return {
    'X-Discord-MFA-Authorization': mfaToken,
    'Cookie': `__Secure-recent_mfa=${mfaToken}`,
  };
}

// ─── Vanity URL işlemleri ───

function cleanVanity(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^.*\//, ''); // "discord.gg/foo" veya "/foo" → "foo"
}

async function deleteInvite(vanityurl, deleteToken, mfaToken) {
  return apiRequest('DELETE', `/api/invite/${vanityurl}`, deleteToken, mfaHeaders(mfaToken));
}

async function patchVanityUrl(vanityurl, serverId, claimToken, mfaToken) {
  const body = JSON.stringify({ code: vanityurl });
  return apiRequest('PATCH', `/api/guilds/${serverId}/vanity-url`, claimToken, mfaHeaders(mfaToken), body);
}

/**
 * Tam swap işlemini yürütür.
 *
 * @param {object} opts
 * @param {string} opts.vanityurl      Transfer edilecek vanity URL (kod)
 * @param {string} opts.serverid       URL'nin gideceği (alma) sunucu ID'si
 * @param {string} opts.deletetoken    URL'ye şu an sahip olan hesabın tokenı
 * @param {string} opts.deletepassword Silme hesabının 2FA şifresi
 * @param {string} opts.claimtoken     Hedef sunucunun yönetici tokenı
 * @param {string} opts.claimpassword  Alma hesabının 2FA şifresi
 * @param {(msg:string)=>void} [onStep] İlerleme bildirimleri için geri çağırma
 * @returns {Promise<{ok:boolean, error?:string, steps:string[], result?:any}>}
 */
async function runSwap(opts, onStep) {
  const steps = [];
  const log = (msg) => {
    steps.push(msg);
    if (typeof onStep === 'function') {
      try { onStep(msg); } catch { /* yok say */ }
    }
  };

  const vanityurl = cleanVanity(opts.vanityurl);
  const serverid = String(opts.serverid || '').trim();
  const deletetoken = String(opts.deletetoken || '').trim();
  const deletepassword = String(opts.deletepassword || '');
  const claimtoken = String(opts.claimtoken || '').trim();
  const claimpassword = String(opts.claimpassword || '');

  if (!vanityurl || !serverid || !deletetoken || !deletepassword || !claimtoken || !claimpassword) {
    return { ok: false, error: 'Tüm alanlar zorunludur.', steps };
  }

  try {
    log('[1/5] MFA doğrulanıyor (alma hesabı)...');
    const claimMfa = await initializeMfa(claimtoken, claimpassword);
    if (!claimMfa) {
      return { ok: false, error: 'Alma hesabı MFA doğrulaması başarısız. Token/şifreyi kontrol et.', steps };
    }

    log('[2/5] MFA doğrulanıyor (silme hesabı)...');
    const deleteMfa = await initializeMfa(deletetoken, deletepassword);
    if (!deleteMfa) {
      return { ok: false, error: 'Silme hesabı MFA doğrulaması başarısız. Token/şifreyi kontrol et.', steps };
    }

    log(`[3/5] Mevcut URL siliniyor: /${vanityurl}`);
    await deleteInvite(vanityurl, deletetoken, deleteMfa);

    log(`[4/5] URL hedef sunucuya ekleniyor: ${serverid}`);
    const result = await patchVanityUrl(vanityurl, serverid, claimtoken, claimMfa);

    // Başarı: Discord geri dönüşte { code: "<vanity>" } verir.
    if (result && typeof result.code === 'string' && result.code.toLowerCase() === vanityurl) {
      log('[5/5] İşlem tamamlandı ✓');
      return { ok: true, steps, result };
    }

    // Başarısızsa Discord'un hata mesajını yüzeye çıkar.
    const errMsg =
      (result && (result.message || (result.code !== undefined ? `Hata kodu: ${result.code}` : null))) ||
      'URL hedef sunucuya eklenemedi (bilinmeyen yanıt).';
    log(`[5/5] Başarısız: ${errMsg}`);
    return { ok: false, error: errMsg, steps, result };
  } catch (err) {
    const msg = (err && err.message) || 'Bilinmeyen hata';
    log(`[x] Hata: ${msg}`);
    return { ok: false, error: msg, steps };
  }
}

module.exports = {
  runSwap,
  initializeMfa,
  deleteInvite,
  patchVanityUrl,
  cleanVanity,
};
