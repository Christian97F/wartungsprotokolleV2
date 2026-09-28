// Farbschema: 'auto' (folgt dem Gerät), 'light' oder 'dark'. Gespeichert in localStorage,
// damit index.html es vor dem ersten Rendern setzen kann.
import { icon } from './icons.js';

const systemDunkel = matchMedia('(prefers-color-scheme: dark)');

export function thema() {
  try { return localStorage.getItem('thema') || 'auto'; } catch { return 'auto'; }
}

export const istDunkel = () => thema() === 'dark' || (thema() === 'auto' && systemDunkel.matches);

function anwenden() {
  const t = thema();
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').content = istDunkel() ? '#10151C' : '#F2F5F7';
  const knopf = document.getElementById('thema');
  if (knopf) knopf.innerHTML = icon(istDunkel() ? 'sonne' : 'mond') + `<span>${istDunkel() ? 'Hell' : 'Dunkel'}</span>`;
  document.dispatchEvent(new CustomEvent('themawechsel'));
}

export function setzeThema(t) {
  try {
    if (t === 'auto') localStorage.removeItem('thema');
    else localStorage.setItem('thema', t);
  } catch { /* privater Modus */ }
  anwenden();
}

export function themaEinrichten() {
  anwenden();
  systemDunkel.addEventListener('change', anwenden);
  document.getElementById('thema')?.addEventListener('click', () => setzeThema(istDunkel() ? 'light' : 'dark'));
}
