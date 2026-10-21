/* SQUAD SOUND — чтение тегов и обложек без сторонних библиотек.
 * ID3v1/ID3v2.2–2.4 (MP3), FLAC, Ogg Vorbis/Opus, MP4/M4A.
 * Источник: { size, read(start, length) → Promise<Uint8Array> }.
 */
(function () {
  'use strict';

  const GENRES = ['Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal',
    'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska',
    'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion', 'Trance',
    'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise', 'Alternative Rock', 'Bass',
    'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave',
    'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult', 'Gangsta',
    'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American', 'Cabaret', 'New Wave', 'Psychedelic', 'Rave',
    'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock'];

  const dec = (enc) => { try { return new TextDecoder(enc); } catch (_) { return new TextDecoder('utf-8'); } };
  const UTF8 = dec('utf-8'), U16LE = dec('utf-16le'), U16BE = dec('utf-16be'), CP1251 = dec('windows-1251'), LATIN1 = dec('latin1');

  // В «latin1»-тегах русских MP3 почти всегда на самом деле cp1251.
  function decodeSingle(b) {
    for (let i = 0; i < b.length; i++) if (b[i] > 0x7f) return CP1251.decode(b);
    return LATIN1.decode(b);
  }
  const clean = (s) => (s || '').replace(/\0.*$/s, '').trim();
  const ascii = (b, o, n) => String.fromCharCode.apply(null, b.subarray(o, o + n));
  const u32be = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  const u32le = (b, o) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + ((b[o + 3] << 24) >>> 0);
  const syncsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];

  function genreName(g) {
    g = clean(g);
    const m = /^\(?(\d+)\)?$/.exec(g) || /^\((\d+)\)(.*)$/.exec(g);
    if (m) return m[2] ? m[2].trim() || GENRES[+m[1]] || '' : GENRES[+m[1]] || '';
    return g;
  }

  // ---------- ID3v2 ----------
  function decodeText(enc, b) {
    if (enc === 0) return decodeSingle(b);
    if (enc === 3) return UTF8.decode(b);
    if (enc === 1) {
      if (b[0] === 0xfe && b[1] === 0xff) return U16BE.decode(b.subarray(2));
      if (b[0] === 0xff && b[1] === 0xfe) return U16LE.decode(b.subarray(2));
      return U16LE.decode(b);
    }
    return U16BE.decode(b);
  }
  // Конец строки с учётом кодировки (для UTF-16 — двойной ноль на чётной позиции)
  function strEnd(b, o, enc) {
    if (enc === 1 || enc === 2) {
      for (let i = o; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
      return b.length;
    }
    const i = b.indexOf(0, o);
    return i < 0 ? b.length : i;
  }
  const strStep = (enc) => (enc === 1 || enc === 2 ? 2 : 1);

  function unsync(b) {
    const out = new Uint8Array(b.length);
    let j = 0;
    for (let i = 0; i < b.length; i++) {
      out[j++] = b[i];
      if (b[i] === 0xff && b[i + 1] === 0) i++;
    }
    return out.subarray(0, j);
  }

  function parseId3v2(b, res) {
    const ver = b[3];
    const flags = b[5];
    let tag = b.subarray(10, 10 + syncsafe(b, 6));
    if (ver < 4 && (flags & 0x80)) tag = unsync(tag);
    let p = 0;
    if (flags & 0x40) p = ver === 3 ? 4 + u32be(tag, 0) : syncsafe(tag, 0);
    const idLen = ver === 2 ? 3 : 4;
    const hdrLen = ver === 2 ? 6 : 10;
    let pics = [];
    while (p + hdrLen <= tag.length) {
      const id = ascii(tag, p, idLen);
      if (!/^[A-Z0-9]+$/.test(id)) break;
      let size;
      if (ver === 2) size = (tag[p + 3] << 16) | (tag[p + 4] << 8) | tag[p + 5];
      else if (ver === 4) {
        // iTunes иногда пишет в 2.4 обычный размер вместо syncsafe
        size = (tag[p + 4] | tag[p + 5] | tag[p + 6] | tag[p + 7]) & 0x80 ? u32be(tag, p + 4) : syncsafe(tag, p + 4);
      } else size = u32be(tag, p + 4);
      const fflags = ver === 2 ? 0 : tag[p + 9];
      let data = tag.subarray(p + hdrLen, p + hdrLen + size);
      p += hdrLen + size;
      if (!size) continue;
      if (ver === 4) {
        if (fflags & 0x0c) continue; // сжатие/шифрование не поддерживаем
        if (fflags & 0x01) data = data.subarray(4); // data length indicator
        if (fflags & 0x02) data = unsync(data);
      } else if (ver === 3 && (fflags & 0xc0)) continue;

      const key = id.length === 3 ? { TT2: 'TIT2', TP1: 'TPE1', TP2: 'TPE2', TAL: 'TALB', TCO: 'TCON', TRK: 'TRCK', TYE: 'TYER', PIC: 'APIC', ULT: 'USLT' }[id] || id : id;
      if (key[0] === 'T' && key !== 'TXXX') {
        const v = clean(decodeText(data[0], data.subarray(1)));
        if (!v) continue;
        if (key === 'TIT2') res.title = res.title || v;
        else if (key === 'TPE1') res.artist = res.artist || v;
        else if (key === 'TPE2') res.albumArtist = res.albumArtist || v;
        else if (key === 'TALB') res.album = res.album || v;
        else if (key === 'TCON') res.genre = res.genre || genreName(v);
        else if (key === 'TRCK') res.no = res.no || parseInt(v, 10) || 0;
        else if (key === 'TPOS') res.disc = res.disc || parseInt(v, 10) || 0;
        else if (key === 'TYER' || key === 'TDRC') res.year = res.year || parseInt(v, 10) || 0;
      } else if (key === 'USLT' && !res.lyrics && data.length > 5) {
        // текст песни: кодировка, язык (3), описание, текст
        const enc = data[0];
        const o = strEnd(data, 4, enc) + strStep(enc);
        const v = decodeText(enc, data.subarray(o)).replace(/\0+$/, '').trim();
        if (v) res.lyrics = v;
      } else if (key === 'SYLT' && !res.syncedLyrics && data.length > 7 && data[4] === 2) {
        // синхронизированный текст (метки в миллисекундах) → LRC
        const enc = data[0];
        let o = strEnd(data, 6, enc) + strStep(enc);
        const out = [];
        while (o < data.length) {
          const e = strEnd(data, o, enc);
          if (e + strStep(enc) + 4 > data.length) break;
          const text = decodeText(enc, data.subarray(o, e)).replace(/^\n/, '').trim();
          const ms = u32be(data, e + strStep(enc));
          o = e + strStep(enc) + 4;
          const m = Math.floor(ms / 60000), sec = ((ms % 60000) / 1000).toFixed(2).padStart(5, '0');
          out.push('[' + String(m).padStart(2, '0') + ':' + sec + ']' + text);
        }
        if (out.length) res.syncedLyrics = out.join('\n');
      } else if (key === 'APIC') {
        const enc = data[0];
        let o = 1, mime;
        if (id === 'PIC') { mime = 'image/' + ascii(data, 1, 3).toLowerCase().replace('jpg', 'jpeg'); o = 4; }
        else { const e = data.indexOf(0, 1); mime = ascii(data, 1, e - 1).toLowerCase(); o = e + 1; }
        const type = data[o++];
        o = strEnd(data, o, enc) + strStep(enc);
        if (mime && !mime.includes('/')) mime = 'image/' + mime.replace('jpg', 'jpeg');
        pics.push({ type, mime: mime || 'image/jpeg', data: data.subarray(o) });
      }
    }
    if (pics.length && !res.picture) res.picture = pics.find((x) => x.type === 3) || pics[0];
  }

  function parseId3v1(b, res) {
    if (ascii(b, 0, 3) !== 'TAG') return;
    const f = (o, n) => clean(decodeSingle(b.subarray(o, o + n)).replace(/\0+$/, ''));
    res.title = res.title || f(3, 30);
    res.artist = res.artist || f(33, 30);
    res.album = res.album || f(63, 30);
    res.year = res.year || parseInt(f(93, 4), 10) || 0;
    if (b[125] === 0 && b[126]) res.no = res.no || b[126];
    if (!res.genre && b[127] < GENRES.length) res.genre = GENRES[b[127]];
  }

  // ---------- Vorbis comment / FLAC picture ----------
  function parseVorbis(b, o, res) {
    const vlen = u32le(b, o); o += 4 + vlen;
    const n = u32le(b, o); o += 4;
    for (let i = 0; i < n && o + 4 <= b.length; i++) {
      const len = u32le(b, o); o += 4;
      const s = UTF8.decode(b.subarray(o, o + len)); o += len;
      const eq = s.indexOf('=');
      if (eq < 0) continue;
      const k = s.slice(0, eq).toUpperCase(), v = s.slice(eq + 1).trim();
      if (!v) continue;
      if (k === 'TITLE') res.title = res.title || v;
      else if (k === 'ARTIST') res.artist = res.artist || v;
      else if (k === 'ALBUMARTIST' || k === 'ALBUM ARTIST') res.albumArtist = res.albumArtist || v;
      else if (k === 'ALBUM') res.album = res.album || v;
      else if (k === 'GENRE') res.genre = res.genre || v;
      else if (k === 'TRACKNUMBER') res.no = res.no || parseInt(v, 10) || 0;
      else if (k === 'DISCNUMBER') res.disc = res.disc || parseInt(v, 10) || 0;
      else if (k === 'DATE' || k === 'YEAR') res.year = res.year || parseInt(v, 10) || 0;
      else if (k === 'LYRICS' || k === 'UNSYNCEDLYRICS' || k === 'SYNCEDLYRICS') {
        if (/\[\d+:\d+/.test(v)) res.syncedLyrics = res.syncedLyrics || v; else res.lyrics = res.lyrics || v;
      }
      else if (k === 'METADATA_BLOCK_PICTURE' && !res.picture) {
        try {
          const bin = atob(v);
          const pb = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) pb[j] = bin.charCodeAt(j);
          parseFlacPicture(pb, res);
        } catch (_) {}
      }
    }
  }

  function parseFlacPicture(b, res) {
    let o = 0;
    const type = u32be(b, o); o += 4;
    const ml = u32be(b, o); o += 4;
    const mime = ascii(b, o, ml); o += ml;
    const dl = u32be(b, o); o += 4 + dl + 16;
    const len = u32be(b, o); o += 4;
    const pic = { type, mime: mime || 'image/jpeg', data: b.subarray(o, o + len) };
    if (!res.picture || (type === 3 && res.picture.type !== 3)) res.picture = pic;
  }

  async function parseFlac(src, start, res) {
    let o = start + 4;
    for (let guard = 0; guard < 64 && o + 4 <= src.size; guard++) {
      const h = await src.read(o, 4);
      const last = h[0] & 0x80, type = h[0] & 0x7f;
      const len = (h[1] << 16) | (h[2] << 8) | h[3];
      if (type === 4 || type === 6) {
        const body = await src.read(o + 4, len);
        if (type === 4) parseVorbis(body, 0, res); else parseFlacPicture(body, res);
      }
      o += 4 + len;
      if (last) break;
    }
  }

  // ---------- Ogg ----------
  async function parseOgg(src, res) {
    // Комментарии лежат во втором пакете, обычно в первых килобайтах. Читаем с 64 КБ и удваиваем до 4 МБ
    // только если пакет с обложкой не влез (раньше сразу читали 4 МБ на каждый файл)
    const cap = Math.min(src.size, 4 * 1024 * 1024);
    for (let len = Math.min(cap, 64 * 1024); ; len = Math.min(cap, len * 2)) {
      const c = oggComments(await src.read(0, len));
      if (c) {
        if (ascii(c, 0, 7) === '\x03vorbis') parseVorbis(c, 7, res);
        else if (ascii(c, 0, 8) === 'OpusTags') parseVorbis(c, 8, res);
        return;
      }
      if (c === null || len >= cap) return; // null — это не Ogg с комментариями, больше читать незачем
    }
  }
  // второй пакет потока; undefined — данных не хватило, null — его нет
  function oggComments(b) {
    const packets = [];
    let cur = [], o = 0;
    while (packets.length < 2) {
      if (o + 27 > b.length) return undefined;
      if (ascii(b, o, 4) !== 'OggS') return null;
      const nseg = b[o + 26];
      if (o + 27 + nseg > b.length) return undefined;
      let d = o + 27 + nseg;
      for (let i = 0; i < nseg; i++) {
        const l = b[o + 27 + i];
        if (d + l > b.length) return undefined; // страница обрезана концом прочитанного куска
        cur.push(b.subarray(d, d + l));
        d += l;
        if (l < 255) {
          const total = cur.reduce((s, x) => s + x.length, 0);
          const pk = new Uint8Array(total);
          let q = 0;
          for (const x of cur) { pk.set(x, q); q += x.length; }
          packets.push(pk); cur = [];
          if (packets.length >= 2) break;
        }
      }
      o = d;
    }
    return packets[1];
  }

  // ---------- MP4 / M4A ----------
  async function parseMp4(src, res) {
    let o = 0, moov = null;
    for (let guard = 0; guard < 200 && o + 8 <= src.size; guard++) {
      const h = await src.read(o, 16);
      let size = u32be(h, 0);
      const type = ascii(h, 4, 4);
      let hl = 8;
      if (size === 1) { size = u32be(h, 8) * 4294967296 + u32be(h, 12); hl = 16; }
      else if (size === 0) size = src.size - o;
      if (size < hl) return;
      if (type === 'moov') { if (size > 64 * 1024 * 1024) return; moov = await src.read(o + hl, size - hl); break; }
      o += size;
    }
    if (!moov) return;
    const find = (b, path) => {
      let s = 0, e = b.length;
      for (const name of path) {
        let found = false;
        let p = s;
        while (p + 8 <= e) {
          const sz = u32be(b, p);
          const t = ascii(b, p + 4, 4);
          if (sz < 8) return null;
          if (t === name) { s = p + 8 + (name === 'meta' ? 4 : 0); e = p + sz; found = true; break; }
          p += sz;
        }
        if (!found) return null;
      }
      return b.subarray(s, e);
    };
    const ilst = find(moov, ['udta', 'meta', 'ilst']);
    if (!ilst) return;
    let p = 0;
    while (p + 8 <= ilst.length) {
      const sz = u32be(ilst, p);
      if (sz < 8) break;
      const name = LATIN1.decode(ilst.subarray(p + 4, p + 8));
      const item = ilst.subarray(p + 8, p + sz);
      p += sz;
      if (item.length < 16 || ascii(item, 4, 4) !== 'data') continue;
      const dtype = u32be(item, 8) & 0xffffff;
      const data = item.subarray(16, u32be(item, 0));
      const txt = () => clean(UTF8.decode(data));
      switch (name) {
        case '©nam': res.title = res.title || txt(); break;
        case '©ART': res.artist = res.artist || txt(); break;
        case 'aART': res.albumArtist = res.albumArtist || txt(); break;
        case '©alb': res.album = res.album || txt(); break;
        case '©gen': res.genre = res.genre || txt(); break;
        case 'gnre': if (!res.genre && data.length >= 2) res.genre = GENRES[((data[0] << 8) | data[1]) - 1] || ''; break;
        case '©day': res.year = res.year || parseInt(txt(), 10) || 0; break;
        case 'trkn': if (data.length >= 4) res.no = res.no || ((data[2] << 8) | data[3]); break;
        case 'disk': if (data.length >= 4) res.disc = res.disc || ((data[2] << 8) | data[3]); break;
        case '©lyr': { const v = UTF8.decode(data).trim(); if (v && !res.lyrics) res.lyrics = v; break; }
        case 'covr':
          if (!res.picture) res.picture = { type: 3, mime: dtype === 14 ? 'image/png' : 'image/jpeg', data };
          break;
      }
    }
  }

  async function read(src) {
    const res = {};
    if (!src || !src.size) return res;
    const head = await src.read(0, Math.min(src.size, 64 * 1024));
    let o = 0;
    try {
      if (ascii(head, 0, 3) === 'ID3') {
        const total = 10 + syncsafe(head, 6) + (head[5] & 0x10 ? 10 : 0);
        const tag = total <= head.length ? head : await src.read(0, Math.min(total, 32 * 1024 * 1024));
        parseId3v2(tag, res);
        o = total;
      }
      const magic = o ? ascii(await src.read(o, 4), 0, 4) : ascii(head, 0, 4);
      if (magic === 'fLaC') await parseFlac(src, o, res);
      else if (ascii(head, 0, 4) === 'OggS') await parseOgg(src, res);
      else if (ascii(head, 4, 4) === 'ftyp') await parseMp4(src, res);
      else if (!res.title && src.size > 128) parseId3v1(await src.read(src.size - 128, 128), res);
    } catch (e) {
      console.warn('Теги не прочитаны', e);
    }
    return res;
  }

  // Источники данных
  function fromBlob(blob) {
    return {
      size: blob.size,
      read: (start, len) => blob.slice(start, start + len).arrayBuffer().then((ab) => new Uint8Array(ab)),
    };
  }

  // ---------- Обложка: миниатюра и цвет ----------
  async function loadImage(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch (_) {}
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  // Самый «яркий» оттенок обложки → акцент темы (HSL с поднятой насыщенностью)
  function accentFrom(ctx, w, h) {
    const px = ctx.getImageData(0, 0, w, h).data;
    const buckets = new Array(36).fill(0).map(() => ({ wt: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < px.length; i += 16) {
      const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const s = max ? (max - min) / max : 0;
      if (s < 0.3 || max < 0.25) continue;
      let hue;
      if (max === r) hue = ((g - b) / (max - min) + 6) % 6;
      else if (max === g) hue = (b - r) / (max - min) + 2;
      else hue = (r - g) / (max - min) + 4;
      const k = Math.floor(hue * 6) % 36;
      const wt = s * s * max;
      const bk = buckets[k];
      bk.wt += wt; bk.r += r * wt; bk.g += g * wt; bk.b += b * wt;
    }
    let best = null;
    for (let k = 0; k < 36; k++) {
      // соседние корзины вместе, чтобы не дробить один цвет
      const wt = buckets[k].wt + 0.5 * (buckets[(k + 1) % 36].wt + buckets[(k + 35) % 36].wt);
      if (!best || wt > best.wt) best = { wt, k };
    }
    if (!best || best.wt < 0.5) return null;
    const bk = buckets[best.k];
    if (!bk.wt) return null;
    const r = bk.r / bk.wt, g = bk.g / bk.wt, b = bk.b / bk.wt;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let hh = 0;
    if (max !== min) {
      if (max === r) hh = ((g - b) / (max - min) + 6) % 6;
      else if (max === g) hh = (b - r) / (max - min) + 2;
      else hh = (r - g) / (max - min) + 4;
    }
    return { h: Math.round(hh * 60), s: 80, l: 58 };
  }

  const hsl = (c, dl) => {
    const s = c.s / 100, l = Math.max(0, Math.min(1, (c.l + (dl || 0)) / 100));
    const k = (n) => (n + c.h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return '#' + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('');
  };

  // {thumb: dataURL 160px, accent: '#rrggbb', accent2: '#rrggbb'} или null
  async function coverInfo(picture) {
    if (!picture || !picture.data || !picture.data.length) return null;
    try {
      const img = await loadImage(new Blob([picture.data], { type: picture.mime }));
      const S = 160;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const iw = img.width, ih = img.height, side = Math.min(iw, ih);
      ctx.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, S, S);
      if (img.close) img.close();
      const col = accentFrom(ctx, S, S);
      return {
        thumb: c.toDataURL('image/jpeg', 0.82),
        accent: col ? hsl(col) : null,
        accent2: col ? hsl(col, -14) : null,
      };
    } catch (e) {
      return null;
    }
  }

  window.SquadTags = { read, fromBlob, coverInfo };
})();
