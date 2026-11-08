'use strict';

const $ = (sel) => document.querySelector(sel);

const logCard = $('#logCard');
const logEl = $('#log');
const runBtn = $('#run');
const toastEl = $('#toast');

let toastTimer = null;
function toast(msg, kind = 'info') {
  toastEl.textContent = msg;
  toastEl.className = 'toast ' + kind;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 4000);
}

function logLine(msg, kind) {
  logCard.classList.remove('hidden');
  const div = document.createElement('div');
  if (kind) div.className = 'l-' + kind;
  div.textContent = msg;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function collect() {
  return {
    vanityurl: $('#url').value.trim(),
    serverid: $('#server').value.trim(),
    deletetoken: $('#dtoken').value.trim(),
    deletepassword: $('#dpass').value,
    claimtoken: $('#ctoken').value.trim(),
    claimpassword: $('#cpass').value,
  };
}

async function runSwap() {
  const data = collect();

  if (!data.vanityurl || !data.serverid || !data.deletetoken ||
      !data.deletepassword || !data.claimtoken || !data.claimpassword) {
    toast('Lütfen tüm alanları doldur.', 'err');
    return;
  }

  logEl.innerHTML = '';
  logCard.classList.remove('hidden');
  runBtn.disabled = true;
  const originalText = runBtn.textContent;
  runBtn.textContent = 'İşlem başlatılıyor...';
  toast('İşlem başlatılıyor...', 'info');

  try {
    const res = await fetch('/api/swapper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok || !res.body) {
      throw new Error('Sunucuya ulaşılamadı (HTTP ' + res.status + ')');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // NDJSON akışını satır satır oku.
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) handleEvent(line);
      }
    }
    if (buffer.trim()) handleEvent(buffer.trim());
  } catch (err) {
    logLine('❌ ' + err.message, 'err');
    toast('Swap başarısız: ' + err.message, 'err');
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = originalText;
  }
}

function handleEvent(line) {
  let ev;
  try {
    ev = JSON.parse(line);
  } catch {
    return;
  }

  if (ev.type === 'step') {
    logLine(ev.msg);
  } else if (ev.type === 'done') {
    if (ev.ok) {
      logLine('✅ Swap başarılı! URL aktarıldı.', 'ok');
      toast('Swap başarılı! URL aktarıldı.', 'ok');
    } else {
      logLine('❌ ' + (ev.error || 'Bilinmeyen hata'), 'err');
      toast('Swap başarısız: ' + (ev.error || ''), 'err');
    }
  }
}

runBtn.addEventListener('click', runSwap);
