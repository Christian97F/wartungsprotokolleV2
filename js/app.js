import { route, starteRouter } from './core/router.js';
import { icon } from './core/icons.js';
import { toast } from './core/ui.js';
import { migriereDatenbank } from './core/migration.js';
import { themaEinrichten } from './core/thema.js';

const NAV = [
  { pfad: '/anlagen', label: 'Anlagen', icon: 'anlage', muster: ['/anlagen', '/anlage/:id'] },
  { pfad: '/protokolle', label: 'Protokolle', icon: 'protokoll', muster: ['/protokolle', '/protokoll/:id', '/bericht/:id'] },
  { pfad: '/vorlagen', label: 'Vorlagen', icon: 'vorlage', muster: ['/vorlagen', '/vorlage/:id'] },
  { pfad: '/daten', label: 'Daten', icon: 'daten', muster: ['/daten'] },
];

route('/anlagen', () => import('./screens/anlagen.js'));
route('/anlage/:id', () => import('./screens/anlage.js'));
route('/protokolle', () => import('./screens/protokolle.js'));
route('/protokoll/:id', () => import('./screens/protokoll.js'));
route('/bericht/:id', () => import('./screens/bericht.js'));
route('/vorlagen', async () => ({ render: (await import('./screens/vorlagen.js')).renderListe }));
route('/vorlage/:id', async () => {
  const m = await import('./screens/vorlagen.js');
  return { render: m.renderEditor, verlassen: m.verlassen, ungespeichert: m.ungespeichert };
});
route('/daten', () => import('./screens/daten.js'));

function navAufbauen() {
  const html = NAV.map(n => `<a href="#${n.pfad}" class="nav-link" data-nav="${n.pfad}">${icon(n.icon)}<span>${n.label}</span></a>`).join('');
  document.getElementById('seiten-nav').innerHTML = html;
  document.getElementById('unten-nav').innerHTML = html;
  document.addEventListener('routenwechsel', e => {
    const aktiv = NAV.find(n => n.muster.includes(e.detail.muster));
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('aktiv', a.dataset.nav === aktiv?.pfad));
    document.body.dataset.bereich = e.detail.muster.split('/')[1];
  });
}

// Dateien irgendwo ins Fenster ziehen → Import
function globalerDrop() {
  let zaehler = 0;
  const zeige = (an) => document.body.classList.toggle('drop-aktiv', an);
  window.addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { zaehler++; zeige(true); } });
  window.addEventListener('dragleave', () => { if (--zaehler <= 0) { zaehler = 0; zeige(false); } });
  window.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', async e => {
    zaehler = 0;
    zeige(false);
    if (e.defaultPrevented || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    const { importDialog } = await import('./screens/daten.js');
    if (await importDialog([...e.dataTransfer.files])) window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

async function start() {
  navAufbauen();
  themaEinrichten();
  globalerDrop();

  try {
    const m = await migriereDatenbank();
    if (m && (m.anlagen || m.protokolle)) {
      toast(`Daten übernommen: ${m.anlagen} Anlagen, ${m.protokolle} Protokolle`, 'success', 5000);
    }
  } catch (e) {
    console.error(e);
    toast(`Datenbank: ${e.message}`, 'error', 8000);
  }

  starteRouter(document.getElementById('inhalt'));
  import('./screens/erinnerung.js').then(m => {
    m.hintergrundUeberwachen();
    return m.taeglicheErinnerung();
  }).catch(e => console.warn('Erinnerung:', e));

  if ('serviceWorker' in navigator) {
    const hatteVersion = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const neu = reg.installing;
        neu?.addEventListener('statechange', () => {
          if (neu.state === 'activated' && hatteVersion) {
            toast('Update installiert – wird beim nächsten Start aktiv', 'info', 5000);
          }
        });
      });
    }).catch(err => console.warn('Service Worker:', err));
  }
}

start();
