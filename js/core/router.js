// Hash-Router: #/pfad/param?x=y → Screen-Modul.
// Screens: { render(el, params, query) → cleanup?, verlassen?() → Promise<boolean> }

const routen = [];
let aktiv = null;
let ignoriereNaechstes = false;
let letzterHash = '';
let wurzel;
let besuche = 0;

export function route(muster, laden) {
  const namen = [];
  const re = new RegExp('^' + muster.replace(/:(\w+)/g, (_, n) => { namen.push(n); return '([^/]+)'; }) + '$');
  routen.push({ re, namen, laden, muster });
}

export function navigiere(pfad, { ersetzen = false } = {}) {
  const hash = '#' + pfad;
  if (ersetzen) {
    history.replaceState(null, '', hash);
    aufloesen();
  } else if (location.hash === hash) {
    aufloesen();
  } else {
    location.hash = hash;
  }
}

export function zurueck(fallback = '/anlagen') {
  if (besuche > 1) history.back();
  else navigiere(fallback, { ersetzen: true });
}

export const aktuellerPfad = () => location.hash.slice(1).split('?')[0] || '/anlagen';

async function aufloesen() {
  if (ignoriereNaechstes) { ignoriereNaechstes = false; return; }
  const [pfad, qs] = (location.hash.slice(1) || '/anlagen').split('?');

  if (aktiv?.screen.verlassen && location.hash !== letzterHash) {
    const ok = await aktiv.screen.verlassen();
    if (!ok) {
      ignoriereNaechstes = true;
      location.hash = letzterHash;
      return;
    }
  }

  const treffer = routen.map(r => ({ r, m: pfad.match(r.re) })).find(x => x.m);
  if (!treffer) { navigiere('/anlagen', { ersetzen: true }); return; }

  aktiv?.cleanup?.();
  const params = Object.fromEntries(treffer.r.namen.map((n, i) => [n, decodeURIComponent(treffer.m[i + 1])]));
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const screen = await treffer.r.laden();
  letzterHash = location.hash;
  besuche++;

  // Jeder Screen bekommt ein frisches Element, damit keine Listener überleben
  const bereich = document.createElement('div');
  bereich.className = 'screen';
  wurzel.replaceChildren(bereich);
  window.scrollTo(0, 0);
  document.dispatchEvent(new CustomEvent('routenwechsel', { detail: { muster: treffer.r.muster, pfad } }));
  const eintrag = { screen, cleanup: null };
  aktiv = eintrag;
  try {
    eintrag.cleanup = await screen.render(bereich, params, query);
    // Hat der Screen während render() selbst weitergeleitet, sofort aufräumen
    if (aktiv !== eintrag) eintrag.cleanup?.();
  } catch (e) {
    console.error(e);
    bereich.innerHTML = '<div class="fehlerbox"><h2>Fehler</h2><p></p></div>';
    bereich.querySelector('p').textContent = String(e.message || e);
  }
}

export function starteRouter(el) {
  wurzel = el;
  window.addEventListener('hashchange', aufloesen);
  window.addEventListener('beforeunload', e => {
    if (aktiv?.screen.ungespeichert?.()) { e.preventDefault(); e.returnValue = ''; }
  });
  aufloesen();
}
