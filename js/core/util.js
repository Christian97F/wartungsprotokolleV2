export function esc(wert) {
  return String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function erzeugeId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function slug(text, max = 32) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max) || 'x';
}

export function eindeutigeId(basis, vorhandene) {
  const set = new Set(vorhandene);
  const id = slug(basis);
  if (!set.has(id)) return id;
  let i = 2;
  while (set.has(`${id}_${i}`)) i++;
  return `${id}_${i}`;
}

export const klon = (obj) => structuredClone(obj);

export const jetztIso = () => new Date().toISOString();
export const heuteIso = () => new Date().toISOString().slice(0, 10);

export function formatDatum(iso) {
  if (!iso) return '–';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatMonat(yyyyMm) {
  if (!yyyyMm) return '–';
  const [j, m] = yyyyMm.split('-');
  return `${m}/${j}`;
}

export function formatZeit(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function formatZahl(wert) {
  if (wert === null || wert === undefined || wert === '') return '';
  if (typeof wert !== 'number') return String(wert);
  return wert.toLocaleString('de-DE', { maximumFractionDigits: 3 });
}

export const istLeer = (wert) => wert === null || wert === undefined || wert === '';

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function dateiname(...teile) {
  return teile
    .filter(t => !istLeer(t))
    .map(t => String(t).replace(/[^\p{L}\p{N}\-_.]+/gu, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('_');
}

// Monate zwischen heute und einem "YYYY-MM"-Termin (negativ = überfällig)
export function monateBis(yyyyMm) {
  if (!yyyyMm) return null;
  const [j, m] = yyyyMm.split('-').map(Number);
  const heute = new Date();
  return (j - heute.getFullYear()) * 12 + (m - 1 - heute.getMonth());
}

export function plusMonate(isoDatum, monate) {
  const d = new Date((isoDatum || heuteIso()) + 'T00:00:00');
  d.setMonth(d.getMonth() + monate);
  return d.toISOString().slice(0, 7);
}

export function holePfad(obj, pfad) {
  return pfad.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setzePfad(obj, pfad, wert) {
  const teile = pfad.split('.');
  const letzter = teile.pop();
  let ziel = obj;
  for (const k of teile) {
    if (ziel[k] == null || typeof ziel[k] !== 'object') ziel[k] = {};
    ziel = ziel[k];
  }
  ziel[letzter] = wert;
}

export function verschiebe(liste, index, richtung) {
  const ziel = index + richtung;
  if (ziel < 0 || ziel >= liste.length) return false;
  [liste[index], liste[ziel]] = [liste[ziel], liste[index]];
  return true;
}
