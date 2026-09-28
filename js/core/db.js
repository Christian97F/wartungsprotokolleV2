// IndexedDB-Zugriff. Version 2 ergänzt die Stores für das generische Modell;
// der alte Store "aggregate" bleibt als Sicherung erhalten.

const DB_NAME = 'NotstromWartungDB';
const DB_VERSION = 2;

let dbPromise = null;

function oeffnen() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('aggregate')) {
        db.createObjectStore('aggregate', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('protokolle')) {
        const s = db.createObjectStore('protokolle', { keyPath: 'id' });
        s.createIndex('aggregatId', 'aggregatId');
      }
      const prot = req.transaction.objectStore('protokolle');
      if (!prot.indexNames.contains('anlageId')) prot.createIndex('anlageId', 'anlageId');
      if (!db.objectStoreNames.contains('anlagen')) db.createObjectStore('anlagen', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('vorlagen')) db.createObjectStore('vorlagen', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('einstellungen')) db.createObjectStore('einstellungen');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank ist in einem anderen Tab geöffnet. Bitte andere Tabs schließen.'));
  });
  return dbPromise;
}

function anfrage(store, modus, fn) {
  return oeffnen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, modus);
    const req = fn(tx.objectStore(store));
    let ergebnis;
    if (req) req.onsuccess = () => { ergebnis = req.result; };
    tx.oncomplete = () => resolve(ergebnis);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

function crud(store) {
  return {
    alle: () => anfrage(store, 'readonly', s => s.getAll()),
    hole: (id) => anfrage(store, 'readonly', s => s.get(id)),
    speichere: (obj) => anfrage(store, 'readwrite', s => s.put(obj)),
    loesche: (id) => anfrage(store, 'readwrite', s => s.delete(id)),
    speichereViele: (liste) => anfrage(store, 'readwrite', s => { liste.forEach(o => s.put(o)); }),
  };
}

export const DB = {
  anlagen: crud('anlagen'),
  protokolle: {
    ...crud('protokolle'),
    vonAnlage: (anlageId) => anfrage('protokolle', 'readonly', s => s.index('anlageId').getAll(anlageId)),
  },
  vorlagen: crud('vorlagen'),
  legacyAggregate: () => anfrage('aggregate', 'readonly', s => s.getAll()),

  einstellung: (key, standard = null) =>
    anfrage('einstellungen', 'readonly', s => s.get(key)).then(v => v ?? standard),
  setzeEinstellung: (key, wert) => anfrage('einstellungen', 'readwrite', s => s.put(wert, key)),
};
