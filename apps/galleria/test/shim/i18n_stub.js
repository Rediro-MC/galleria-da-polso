/* i18n_stub.js — dizionari FINTI al posto di src/pkjs/i18n.js (S10/D35) nei test node del PKJS.
 *
 * index.js fa un `require('./i18n')` pigro del modulo generato da tools/build_i18n.py: i test non
 * devono dipendere da quel file generato (né dal suo contenuto, che cambia a ogni traduzione), così
 * lo dirottano qui con Module._resolveFilename. Stessa FORMA del vero — { keys, en, it, de, fr },
 * array paralleli nell'ordine delle chiavi — con tre chiavi e un segnaposto {0}, e accenti veri
 * (i testi non finiscono mai in un log: F-S8-2). */
module.exports = {
  keys: ['save', 'add_photo', 'photos_n'],
  en: ['Save', 'Add photo', 'Photos: {0}'],
  it: ['Salva', 'Aggiungi foto', 'Foto: {0}'],
  de: ['Speichern', 'Foto hinzufügen', 'Fotos: {0}'],
  fr: ['Enregistrer', 'Ajouter une photo', 'Photos : {0}']
};
