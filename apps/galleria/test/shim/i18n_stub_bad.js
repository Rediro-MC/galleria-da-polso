/* i18n_stub_bad.js — src/pkjs/i18n.js MALFORMATO (una lingua che non è un array) per i test node:
 * index.js deve accorgersene, loggarlo e mettere `i18n: null` nello stato della config page
 * (la pagina resta in inglese minimo) invece di spedire un dizionario rotto. */
module.exports = {
  keys: ['save', 'add_photo'],
  en: ['Save', 'Add photo'],
  it: 'Salva',                       /* <- rotto: stringa invece di array */
  de: ['Speichern', 'Foto hinzufügen'],
  fr: ['Enregistrer', 'Ajouter une photo']
};
