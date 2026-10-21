/* SQUAD SOUND — «Поделиться»: картинка-карточка трека для сторис и Telegram и «Слушать вместе».
 * Карточка рисуется на canvas (1080×1920): обложка, название, исполнитель и строка текста на выбор.
 * «Слушать вместе» — приглашение с кодом: в нём трек, позиция и время отправки. Друг вставляет его,
 * плеер находит этот трек у себя (или ищет онлайн) и включает с того же места. Синхронизируется только старт:
 * общего сервера нет, дальше каждый слушает сам.
 */
(function () {
  'use strict';
  const S = window.SquadApp;
  if (!S) return;
  const $ = (id) => document.getElementById(id);
  const esc = S.esc;
  const cap = window.Capacitor;
  const android = !!(cap && cap.getPlatform && cap.getPlatform() === 'android' && cap.nativePromise);
  const desk = !!window.squadNative;
  const W = 1080, H = 1920;

  // ---------- Отправка: Android — системное «Поделиться», иначе Web Share, буфер или файл ----------
  const blobB64 = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(b); });
  async function nativeShare(text, blob) {
    await cap.nativePromise('SquadUpdater', 'share', { text: text || '', data: blob ? await blobB64(blob) : '', title: 'Поделиться' });
  }
  const webShare = (o) => !android && !desk && navigator.share && (!o.files || (navigator.canShare && navigator.canShare(o)));
  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); return true; } catch (_) {}
    const ta = document.createElement('textarea');
    ta.value = s; ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
    return ok;
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // ---------- Карточка ----------
  const loadImg = (url) => new Promise((res) => {
    if (!url) { res(null); return; }
    const i = new Image();
    if (/^https?:/.test(url)) i.crossOrigin = 'anonymous';
    i.onload = () => res(i.naturalWidth ? i : null);
    i.onerror = () => res(null);
    i.src = url;
  });
  function wrapLines(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean), out = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const w = words[i], tryL = line ? line + ' ' + w : w;
      if (ctx.measureText(tryL).width <= maxW || !line) { line = tryL; continue; }
      out.push(line); line = w;
      if (out.length === maxLines) { line = ''; out[out.length - 1] = cut(ctx, out[out.length - 1] + ' ' + words.slice(i).join(' '), maxW); break; }
    }
    if (line) out.push(line);
    return out.map((l) => (ctx.measureText(l).width > maxW ? cut(ctx, l, maxW) : l));
  }
  function cut(ctx, s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const accentOf = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b5cf6';

  async function drawCard(t, line, img) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const a1 = t.accent || accentOf(), a2 = t.accent2 || '#111';
    // фон: размытая обложка (или цвета трека), сверху затемнение
    const g0 = ctx.createLinearGradient(0, 0, W, H);
    g0.addColorStop(0, a1); g0.addColorStop(1, a2);
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
    if (img) {
      const k = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.25;
      const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
      ctx.save();
      if ('filter' in ctx) ctx.filter = 'blur(70px) saturate(1.3)';
      ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
      ctx.restore();
    }
    const g1 = ctx.createLinearGradient(0, 0, 0, H);
    g1.addColorStop(0, 'rgba(0,0,0,.25)'); g1.addColorStop(.55, 'rgba(0,0,0,.45)'); g1.addColorStop(1, 'rgba(0,0,0,.8)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

    const pad = 110, maxW = W - pad * 2;
    const font = (w, px, fam) => w + ' ' + px + 'px ' + (fam || "'Squad', system-ui, sans-serif");
    ctx.font = font('400', 76);
    const tl = wrapLines(ctx, t.title || 'Без названия', maxW, 2);
    ctx.font = font('500', 46, 'system-ui, sans-serif');
    const al = wrapLines(ctx, t.artist || '', maxW, 1);
    ctx.font = font('600', 56, 'system-ui, sans-serif');
    const ll = line ? wrapLines(ctx, '«' + line + '»', maxW - 40, 4) : [];
    const size = ll.length ? 680 : 820;
    const textH = tl.length * 90 + (al.length ? 66 : 0) + (ll.length ? 70 + ll.length * 72 : 0);
    const top = Math.max(140, Math.round((H - 160 - size - 80 - textH) / 2));
    const x = (W - size) / 2;
    // обложка с тенью
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
    rrect(ctx, x, top, size, size, 48); ctx.fillStyle = '#1a1a1a'; ctx.fill();
    ctx.restore();
    ctx.save();
    rrect(ctx, x, top, size, size, 48); ctx.clip();
    if (img) {
      const k = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
      ctx.drawImage(img, x + (size - iw) / 2, top + (size - ih) / 2, iw, ih);
    } else {
      const g = ctx.createLinearGradient(x, top, x + size, top + size);
      g.addColorStop(0, a1); g.addColorStop(1, a2);
      ctx.fillStyle = g; ctx.fillRect(x, top, size, size);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = font('400', 300);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♪', W / 2, top + size / 2);
    }
    ctx.restore();

    let y = top + size + 80;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#fff';
    ctx.font = font('400', 76);
    tl.forEach((l) => { ctx.fillText(l, pad, y); y += 90; });
    if (al.length) {
      ctx.font = font('500', 46, 'system-ui, sans-serif'); ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText(al[0], pad, y + 6); y += 66;
    }
    if (ll.length) {
      y += 50;
      ctx.fillStyle = a1;
      rrect(ctx, pad, y + 6, 10, ll.length * 72 - 14, 5); ctx.fill();
      ctx.font = font('600', 56, 'system-ui, sans-serif'); ctx.fillStyle = '#fff';
      ll.forEach((l) => { ctx.fillText(l, pad + 40, y); y += 72; });
    }
    // подпись внизу
    ctx.font = font('400', 38); ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
    ctx.fillText('SQUAD SOUND', W / 2, H - 110);
    return c;
  }
  const toBlob = (c, type, q) => new Promise((res, rej) => {
    try { c.toBlob((b) => (b ? res(b) : rej(new Error('Пустая картинка'))), type, q); } catch (e) { rej(e); }
  });

  // ---------- Окно ----------
  const wrap = document.createElement('div');
  wrap.className = 'dialog-wrap share-wrap';
  wrap.innerHTML = '<div class="dialog share-dlg" role="dialog" aria-modal="true"><h3>Поделиться</h3>' +
    '<div class="sh-seg"><button data-tab="card">Картинка</button><button data-tab="together">Слушать вместе</button></div>' +
    '<div class="sh-pane" data-pane="card"><div class="sh-prev"><img alt="Карточка трека"><span class="sh-busy">Рисую…</span></div>' +
      '<label class="sf sh-line"><span>Строка из текста песни</span><select class="select"></select></label>' +
      '<div class="row sh-acts"><button class="btn" data-a="save">Сохранить</button><button class="btn" data-a="copy">Копировать</button><button class="btn primary" data-a="share">Поделиться</button></div></div>' +
    '<div class="sh-pane" data-pane="together"><p class="hint sh-tg-hint"></p>' +
      '<div class="row sh-acts"><button class="btn" data-a="inv-copy">Копировать</button><button class="btn primary" data-a="invite">Пригласить друга</button></div>' +
      '<label class="sf sh-join"><span>Приглашение от друга</span><textarea class="search" rows="3" placeholder="Вставьте сюда сообщение с кодом SQ1…" spellcheck="false"></textarea></label>' +
      '<div class="row sh-acts"><button class="btn" data-a="paste">Вставить</button><button class="btn primary" data-a="join">Присоединиться</button></div></div>' +
    '<div class="row"><button class="btn ghost" data-x>Закрыть</button></div></div>';
  document.body.appendChild(wrap);
  const prev = wrap.querySelector('.sh-prev img'), busyEl = wrap.querySelector('.sh-busy'), sel = wrap.querySelector('.sh-line select');
  const joinTa = wrap.querySelector('.sh-join textarea');
  const btn = (a) => wrap.querySelector('[data-a="' + a + '"]');
  if (android) { btn('save').hidden = true; btn('copy').hidden = true; }
  if (desk) btn('share').hidden = true; // на ПК «Сохранить» и «Копировать» — системного «Поделиться» нет
  if (!android && !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write)) btn('copy').hidden = true;
  const st = { t: null, img: null, own: null, canvas: null, job: 0, tab: 'card' };

  function setTab(tab) {
    st.tab = tab;
    wrap.querySelectorAll('.sh-seg button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    wrap.querySelectorAll('.sh-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    if (tab === 'together') syncTogether();
  }
  function syncTogether() {
    const t = S.cur();
    wrap.querySelector('.sh-tg-hint').textContent = t
      ? 'Отправьте другу приглашение на «' + (t.artist ? t.artist + ' — ' : '') + t.title + '». Он вставит его в SQUAD SOUND, и трек включится у него с того же места, где сейчас у вас.'
      : 'Включите трек, чтобы пригласить друга. А если приглашение прислали вам, вставьте его ниже.';
    btn('invite').disabled = btn('inv-copy').disabled = !t;
    btn('inv-copy').hidden = android;
    btn('invite').textContent = android || webShare({ text: 'x' }) ? 'Пригласить друга' : 'Отправить в Telegram';
  }

  async function lyricLines(t) {
    if (!window.SquadLyrics) return { lines: [], cur: '' };
    let r = null;
    try { r = await SquadLyrics.get(t, { heavy: t === S.cur(), online: false }); } catch (_) {}
    if (!r || r.none) return { lines: [], cur: '' };
    const synced = r.synced ? SquadLyrics.parse(r.synced) : [];
    const src = synced.length ? synced.map((x) => x.text) : String(r.plain || '').split(/\r?\n/);
    const seen = new Set(), lines = [];
    src.forEach((s) => { s = s.trim(); if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); lines.push(s); } });
    let cur = '';
    if (synced.length && t === S.cur()) {
      const now = S.time().cur;
      for (const x of synced) { if (x.t <= now + 0.3) { if (x.text.trim()) cur = x.text.trim(); } else break; }
    }
    return { lines: lines.slice(0, 200), cur };
  }

  async function render() {
    const job = ++st.job, t = st.t;
    busyEl.hidden = false;
    btn('save').disabled = btn('copy').disabled = btn('share').disabled = true;
    try {
      let c;
      try { c = await drawCard(t, sel.value, st.img); c.getContext('2d').getImageData(0, 0, 1, 1); } catch (_) { c = await drawCard(t, sel.value, null); } // чужая обложка без CORS — без неё
      if (job !== st.job) return;
      st.canvas = c;
      prev.src = c.toDataURL('image/jpeg', 0.8);
    } catch (e) {
      console.warn('Карточка:', e);
      if (job === st.job) S.toast('Не получилось нарисовать карточку');
    } finally {
      if (job === st.job) { busyEl.hidden = true; btn('save').disabled = btn('copy').disabled = btn('share').disabled = !st.canvas; }
    }
  }

  async function open(t, tab) {
    t = t || S.cur();
    close();
    st.t = t; st.canvas = null; prev.removeAttribute('src');
    joinTa.value = '';
    wrap.querySelector('.sh-seg [data-tab="card"]').disabled = !t;
    setTab(t && tab !== 'together' ? 'card' : 'together');
    wrap.classList.add('show');
    if (!t) return;
    const job = ++st.job;
    busyEl.hidden = false;
    sel.innerHTML = '<option value="">Без текста</option>';
    sel.disabled = true;
    try { await document.fonts.load("400 76px 'Squad'", 'Аа'); } catch (_) {}
    const [art, ly] = await Promise.all([S.art ? S.art(t) : null, lyricLines(t)]);
    if (job !== st.job || st.t !== t) { if (art && art.own) URL.revokeObjectURL(art.url); return; }
    st.own = art && art.own ? art.url : null;
    st.img = await loadImg(art && art.url);
    if (job !== st.job) return;
    sel.innerHTML = '<option value="">Без текста</option>' + ly.lines.map((l) => '<option' + (l === ly.cur ? ' selected' : '') + '>' + esc(l.length > 90 ? l.slice(0, 90) + '…' : l) + '</option>').join('');
    // в option хранится обрезанная подпись — значение берём полное
    [...sel.options].slice(1).forEach((o, i) => { o.value = ly.lines[i]; });
    sel.disabled = !ly.lines.length;
    sel.parentElement.querySelector('span').textContent = ly.lines.length ? 'Строка из текста песни' : 'Текста песни нет (откройте «Текст», чтобы найти)';
    render();
  }
  function close() {
    if (!wrap.classList.contains('show')) return false;
    wrap.classList.remove('show');
    st.job++;
    if (st.own) { URL.revokeObjectURL(st.own); st.own = null; }
    st.img = null; st.canvas = null;
    return true;
  }
  sel.onchange = render;

  const fileName = () => 'SQUAD SOUND - ' + String((st.t.artist ? st.t.artist + ' - ' : '') + st.t.title).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80).trim();
  async function act(a) {
    const c = st.canvas;
    try {
      if (a === 'save' && c) { download(await toBlob(c, 'image/png'), fileName() + '.png'); S.toast('Картинка сохранена'); }
      else if (a === 'copy' && c) { await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(c, 'image/png') })]); S.toast('Картинка скопирована, вставьте её в чат'); }
      else if (a === 'share' && c) {
        const text = (st.t.artist ? st.t.artist + ' — ' : '') + st.t.title;
        if (android) { await nativeShare(text, await toBlob(c, 'image/jpeg', 0.92)); return; }
        const file = new File([await toBlob(c, 'image/png')], fileName() + '.png', { type: 'image/png' });
        if (webShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
        if (!btn('copy').hidden) { await act('copy'); return; }
        download(file, file.name); S.toast('Картинка сохранена');
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // закрыли окно «Поделиться»
      console.warn('Поделиться:', e);
      S.toast(a === 'copy' ? 'Не получилось скопировать, сохраните картинку' : 'Не получилось поделиться');
    }
  }

  // ---------- Слушать вместе ----------
  const PFX = 'SQ1.';
  const b64e = (s) => { const u = new TextEncoder().encode(s); let b = ''; u.forEach((x) => { b += String.fromCharCode(x); }); return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const b64d = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(b, (ch) => ch.charCodeAt(0))); };
  function inviteText() {
    const t = S.cur();
    if (!t) return null;
    const tm = S.time();
    const d = { t: t.title || '', a: t.artist && t.artist !== 'Неизвестный исполнитель' ? t.artist : '', p: Math.round((tm.cur || 0) * 10) / 10,
      d: Math.round(tm.dur || t.duration || 0), at: Date.now(), r: S.rate(), s: S.playing() ? 1 : 0 };
    return '🎧 Слушаем вместе в SQUAD SOUND: ' + (d.a ? d.a + ' — ' : '') + d.t + '\n' +
      'Вставь это сообщение в SQUAD SOUND в окне «Слушать вместе», и трек включится с того же места.\n' + PFX + b64e(JSON.stringify(d));
  }
  function parseInvite(s) {
    const m = String(s || '').match(/SQ1\.([A-Za-z0-9_+/=-]{8,})/);
    if (!m) return null;
    try {
      const d = JSON.parse(b64d(m[1]));
      if (!d || typeof d.t !== 'string' || !d.t || !isFinite(d.p) || !isFinite(d.at)) return null;
      return { t: d.t.slice(0, 300), a: String(d.a || '').slice(0, 300), p: Math.max(0, +d.p), d: Math.max(0, +d.d || 0), at: +d.at, r: Math.min(4, Math.max(0.25, +d.r || 1)), s: d.s !== 0 };
    } catch (_) { return null; }
  }
  // название без «(feat. …)», «[Remastered]» и знаков — чтобы «Song (Official Audio)» совпало с «Song»
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s*[([][^)\]]*[)\]]/g, ' ').replace(/\b(feat|ft)\.?\s.*$/, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function findTrack(d) {
    const nt = norm(d.t), na = norm(d.a);
    if (!nt) return null;
    let best = null, bs = 0;
    for (const t of S.tracks) {
      if (norm(t.title) !== nt) continue;
      const ta = norm(t.artist);
      const sc = !na ? 2 : ta === na ? 3 : ta && (ta.includes(na) || na.includes(ta)) ? 2 : ta === norm('Неизвестный исполнитель') || !ta ? 1 : 0;
      if (sc > bs) { best = t; bs = sc; }
    }
    return best;
  }
  // позиция друга сейчас; если он ставил паузу — та же точка
  const posNow = (d) => d.p + (d.s ? Math.max(0, (Date.now() - d.at) / 1000) * d.r : 0);
  const fmtPos = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function syncTo(d) {
    const dur = S.time().dur || d.d;
    const pos = posNow(d);
    if (dur && pos > dur - 2) { S.toast('У друга этот трек уже доиграл, включаю с начала'); return; }
    S.seek(pos);
    if (!S.playing()) S.togglePlay();
    S.toast('Слушаете вместе с ' + fmtPos(pos));
  }
  // ждём, пока трек заиграет (свой — сразу, найденный онлайн — когда его включат), и перематываем
  let pending = null; // { d, key | null, until }
  S.on('start', () => {
    const pd = pending, t = S.cur();
    if (!pd || !t) return;
    if (Date.now() > pd.until) { pending = null; return; }
    if (pd.key ? t.key !== pd.key : norm(t.title) !== norm(pd.d.t)) return;
    pending = null;
    syncTo(pd.d);
  });
  function join(text) {
    const d = parseInvite(text);
    if (!d) { S.toast('Не вижу кода приглашения: нужна строка, которая начинается с SQ1.'); return false; }
    const t = findTrack(d);
    close();
    if (t) {
      const cur = S.cur();
      if (cur && cur.key === t.key && S.time().dur > 0) { pending = null; syncTo(d); return true; }
      pending = { d, key: t.key, until: Date.now() + 5 * 60e3 };
      S.play([t.key], 0, false);
      return true;
    }
    pending = { d, key: null, until: Date.now() + 15 * 60e3 };
    const q = (d.a ? d.a + ' ' : '') + d.t;
    S.toast('«' + d.t + '» нет в медиатеке, ищу онлайн. Включите найденный трек, и он встанет на место друга');
    if (window.SquadApkGo) { SquadApkGo('search'); setTimeout(() => $('search').blur(), 150); }
    S.openLib('online');
    $('search').value = q;
    S.webSearch(q);
    return true;
  }

  async function invite(copyOnly) {
    const s = inviteText();
    if (!s) return;
    try {
      if (!copyOnly && android) { await nativeShare(s, null); return; }
      if (!copyOnly && webShare({ text: s })) { await navigator.share({ text: s }); return; }
      const ok = await copyText(s);
      if (copyOnly) { S.toast(ok ? 'Приглашение скопировано' : 'Не получилось скопировать'); return; }
      // ПК: Telegram откроет выбор чата, текст уже вставлен
      window.open('https://t.me/share/url?url=' + encodeURIComponent(s.split('\n').pop()) + '&text=' + encodeURIComponent(s.split('\n').slice(0, -1).join('\n')), '_blank', 'noopener');
      S.toast(ok ? 'Открываю Telegram. Приглашение ещё и скопировано' : 'Открываю Telegram');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('Приглашение:', e);
      S.toast('Не получилось отправить приглашение');
    }
  }

  wrap.addEventListener('click', async (e) => {
    if (e.target === wrap || e.target.closest('[data-x]')) { close(); return; }
    const tb = e.target.closest('[data-tab]');
    if (tb) { setTab(tb.dataset.tab); return; }
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a === 'invite' || a === 'inv-copy') invite(a === 'inv-copy');
    else if (a === 'paste') { try { joinTa.value = await navigator.clipboard.readText(); } catch (_) { S.toast('Вставьте долгим нажатием в поле'); joinTa.focus(); } }
    else if (a === 'join') join(joinTa.value);
    else act(a);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && close()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  // ПК: Ctrl+V с приглашением в любом месте окна (не в поле ввода)
  document.addEventListener('paste', (e) => {
    const el = e.target;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    const s = e.clipboardData && e.clipboardData.getData('text');
    if (s && parseInvite(s)) { e.preventDefault(); join(s); }
  });

  // ---------- Кнопка в плеере на ПК ----------
  const acts = document.querySelector('.np-actions');
  if (acts && !document.documentElement.classList.contains('apk')) {
    const b = document.createElement('button');
    b.className = 'chip dk-chip';
    b.title = 'Картинка трека или «Слушать вместе»';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>Поделиться';
    b.onclick = () => open(S.cur());
    acts.appendChild(b);
  }

  window.SquadShare = { open, close, join, isOpen: () => wrap.classList.contains('show'), parseInvite, inviteText };
})();
