/* i18n_stub_missing.js — src/pkjs/i18n.js con una lingua MANCANTE (S11/D39): copia di
 * i18n_stub.js senza `pt`, cioè un modulo generato PRIMA di S11 (quattro/cinque lingue) accanto a
 * un index.js con LANG_ORDER a sei. index.js deve trattarlo come malformato — log della lingua che
 * manca e `i18n: null` nello stato — invece di spedire alla pagina un dizionario incompleto: la
 * pagina resta in inglese minimo. Stessa forma del vero, tre chiavi e un segnaposto {0}. */
module.exports = {
  keys: ['save', 'add_photo', 'photos_n'],
  en: ['Save', 'Add photo', 'Photos: {0}'],
  it: ['Salva', 'Aggiungi foto', 'Foto: {0}'],
  de: ['Speichern', 'Foto hinzufügen', 'Fotos: {0}'],
  fr: ['Enregistrer', 'Ajouter une photo', 'Photos : {0}'],
  es: ['Guardar', 'Añadir foto', 'Fotos: {0}']
  /* pt: assente di proposito */
};
