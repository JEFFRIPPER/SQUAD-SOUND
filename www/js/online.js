/* Поиск музыки в открытых источниках (Openverse: Jamendo, Wikimedia, Freesound, ccMixter — лицензии Creative Commons).
 * Найденный трек скачивается в кэш приложения (IndexedDB) и живёт в медиатеке как обычный.
 * Сеть идёт мимо CORS: в .exe — через главный процесс (IPC http-get), на Android — через нативный CapacitorHttp.
 */
(function () {
  'use strict';

  const API = 'https://api.openverse.org/v1/audio/';
  const native = window.squadNative || null;
  const cap = window.Capacitor;
  const isAndroid = !!(cap && cap.getPlatform && cap.getPlatform() === 'android' && cap.nativePromise);

  // ---------- Сеть ----------
  async function get(url, binary) {
    if (native && native.httpGet) {
      const data = await native.httpGet(url, !!binary);
      return binary ? new Blob([data]) : JSON.parse(data);
    }
    if (isAndroid) {
      const r = await cap.nativePromise('CapacitorHttp', 'request', {
        url, method: 'GET', responseType: binary ? 'arraybuffer' : 'json', headers: { Accept: binary ? '*/*' : 'application/json' },
      });
      if (r.status >= 400) throw new Error('HTTP ' + r.status);
      if (!binary) return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      return (await fetch('data:application/octet-stream;base64,' + String(r.data).replace(/\s+/g, ''))).blob();
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return binary ? r.blob() : r.json();
  }

  // ---------- Кэш скачанных треков ----------
  const cache = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('squad-web', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('audio');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction('audio', mode);
        const req = fn(tx.objectStore('audio'));
        tx.oncomplete = () => res(req && req.result);
        tx.onerror = () => rej(tx.error);
      });
    };
    return {
      get: (k) => run('readonly', (s) => s.get(k)).catch(() => null),
      put: (k, v) => run('readwrite', (s) => s.put(v, k)),
      del: (k) => run('readwrite', (s) => s.delete(k)).catch(() => {}),
    };
  })();

  const LS = 'squad.web.tracks';
  const saved = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (_) { return []; } };
  const save = (list) => { try { localStorage.setItem(LS, JSON.stringify(list)); } catch (_) {} };

  // ---------- Поиск ----------
  const LICENSES = { by: 'CC BY', 'by-sa': 'CC BY-SA', 'by-nc': 'CC BY-NC', 'by-nd': 'CC BY-ND', 'by-nc-sa': 'CC BY-NC-SA', 'by-nc-nd': 'CC BY-NC-ND', cc0: 'CC0', pdm: 'Общественное достояние', sampling: 'CC Sampling+', 'nc-sampling': 'CC NC-Sampling+' };
  const SOURCES = { jamendo: 'Jamendo', wikimedia_audio: 'Wikimedia', freesound: 'Freesound', ccmixter: 'ccMixter' };

  function toResult(a) {
    if (!a || !a.url) return null;
    return {
      key: 'web:' + a.id,
      id: a.id,
      title: a.title || 'Без названия',
      artist: a.creator || '',
      duration: a.duration ? Math.round(a.duration / 1000) : 0,
      url: a.url,
      thumb: a.thumbnail || '',
      license: (LICENSES[a.license] || ('CC ' + String(a.license || '').toUpperCase())) + (a.license_version && !/cc0|pdm/.test(a.license) ? ' ' + a.license_version : ''),
      source: SOURCES[a.source] || SOURCES[a.provider] || a.source || a.provider || '',
      page: a.foreign_landing_url || '',
      ext: a.filetype || '',
    };
  }

  // → {results, more}
  async function search(q, page) {
    const url = API + '?q=' + encodeURIComponent(q) + '&category=music&page_size=30&page=' + (page || 1);
    const r = await get(url, false);
    const results = (r.results || []).map(toResult).filter(Boolean);
    return { results, more: (r.page_count || 0) > (page || 1) };
  }

  // ---------- Добавление ----------
  const loading = new Map();
  function add(res) {
    if (loading.has(res.key)) return loading.get(res.key);
    const p = (async () => {
      const b = await get(res.url, true);
      if (!b || !b.size) throw new Error('Пустой файл');
      await cache.put(res.key, b);
      const d = { key: res.key, title: res.title, artist: res.artist, duration: res.duration, license: res.license, source: res.source, page: res.page, ext: res.ext };
      save(saved().filter((x) => x.key !== d.key).concat(d));
      return d;
    })();
    loading.set(res.key, p);
    p.finally(() => loading.delete(res.key)).catch(() => {});
    return p;
  }

  async function blob(key) {
    const b = await cache.get(key);
    if (!b) throw new Error('Файл трека пропал из кэша, добавьте его заново');
    return b;
  }

  async function remove(key) {
    save(saved().filter((x) => x.key !== key));
    await cache.del(key);
  }

  window.SquadOnline = { search, add, blob, remove, saved, has: (key) => saved().some((x) => x.key === key), cached: async (key) => !!(await cache.get(key)) };
})();
