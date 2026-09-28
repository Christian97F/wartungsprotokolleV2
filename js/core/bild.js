// Fotos vor dem Speichern verkleinern: lange Kante max. 1280 px, JPEG ~70 %.
// Das reicht für den Druck (~6 cm breit) und hält Datenbank und Exporte klein.
export async function bildVerkleinern(datei, { max = 1280, qualitaet = 0.7 } = {}) {
  const bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });
  const faktor = Math.min(1, max / Math.max(bild.width, bild.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bild.width * faktor);
  canvas.height = Math.round(bild.height * faktor);
  canvas.getContext('2d').drawImage(bild, 0, 0, canvas.width, canvas.height);
  bild.close?.();
  return canvas.toDataURL('image/jpeg', qualitaet);
}
