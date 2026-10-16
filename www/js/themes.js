/* Темы SQUAD SOUND. Первая — тема Сквада, она по умолчанию.
 * Чтобы поменять фирменные цвета — правьте объект `squad`. */
(function () {
  'use strict';

  window.SQUAD_THEMES = [
    {
      // Тема Фини / SQUAD VPN: кроваво-красная со свечением (FINYA-HELPER-TG/serverless/webapp)
      id: 'squad', name: 'Сквад',
      vars: {
        bg: '#070203', bg2: '#140507', card: '#1e080b', line: '#3a0d14',
        text: '#f8e9ea', muted: '#b9999c',
        accent: '#ff2d48', accent2: '#d10f2a', onAccent: '#ffffff',
      },
    },
    {
      id: 'stellio', name: 'Мята',
      vars: {
        bg: '#141414', bg2: '#1c1c1c', card: '#242424', line: '#333333',
        text: '#f5f5f5', muted: '#9a9a9a',
        accent: '#1de9b6', accent2: '#00bfa5', onAccent: '#08201a',
      },
    },
    {
      id: 'amoled', name: 'AMOLED',
      vars: {
        bg: '#000000', bg2: '#060606', card: '#101010', line: '#222222',
        text: '#ffffff', muted: '#7d7d7d',
        accent: '#ffffff', accent2: '#9e9e9e', onAccent: '#000000',
      },
    },
    {
      id: 'neon', name: 'Неон',
      vars: {
        bg: '#07040f', bg2: '#0f0a1f', card: '#16102b', line: '#2c2250',
        text: '#efeaff', muted: '#8e84b8',
        accent: '#b44cff', accent2: '#2ef2ff', onAccent: '#ffffff',
      },
    },
    {
      id: 'ocean', name: 'Океан',
      vars: {
        bg: '#06121c', bg2: '#0a1b29', card: '#0f2537', line: '#1d3a52',
        text: '#e6f3ff', muted: '#7d9bb5',
        accent: '#2f9bff', accent2: '#3ce0c8', onAccent: '#ffffff',
      },
    },
    {
      id: 'toxic', name: 'Токсик',
      vars: {
        bg: '#0a0d07', bg2: '#11160c', card: '#182011', line: '#2a361e',
        text: '#f0ffe0', muted: '#90a37a',
        accent: '#a6ff00', accent2: '#ffe600', onAccent: '#0b1200',
      },
    },
    {
      id: 'sunset', name: 'Закат',
      vars: {
        bg: '#160b10', bg2: '#201018', card: '#2b1520', line: '#462234',
        text: '#fff0f3', muted: '#b88a9a',
        accent: '#ff6b6b', accent2: '#ffd166', onAccent: '#2b0a12',
      },
    },
    {
      id: 'light', name: 'Светлая',
      vars: {
        bg: '#f4f4f8', bg2: '#ffffff', card: '#ffffff', line: '#e0e0ea',
        text: '#15151c', muted: '#6c6c80',
        accent: '#ff2d48', accent2: '#d10f2a', onAccent: '#ffffff',
      },
    },
  ];

  window.applyTheme = function (id, customAccent) {
    const t = window.SQUAD_THEMES.find((x) => x.id === id) || window.SQUAD_THEMES[0];
    const root = document.documentElement;
    const v = Object.assign({}, t.vars);
    if (customAccent) { v.accent = customAccent; v.accent2 = customAccent; }
    root.dataset.theme = t.id;
    root.style.setProperty('--bg', v.bg);
    root.style.setProperty('--bg2', v.bg2);
    root.style.setProperty('--card', v.card);
    root.style.setProperty('--line', v.line);
    root.style.setProperty('--text', v.text);
    root.style.setProperty('--muted', v.muted);
    root.style.setProperty('--accent', v.accent);
    root.style.setProperty('--accent2', v.accent2);
    root.style.setProperty('--on-accent', v.onAccent);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', v.bg);
    return t;
  };
})();
