#!/usr/bin/env python3
r"""build_i18n.py — dizionari della config page di Galleria (S10, D35).

Sorgente unica: `apps/galleria/i18n/messages.json`, fuori da `src/pkjs/` perche' webpack non
deve imbarcarlo com'e' (il PKJS carica il modulo generato). Formato:

    {
      "_note": "…",                                       <- campi che iniziano con _ : commenti
      "chiave_parlante": { "it": "…", "en": "…", "de": "…", "fr": "…" },
      …
    }

Genera due file identici (stesso oggetto, due destinazioni):
  * `apps/galleria/src/pkjs/i18n.js`      — il PKJS lo mette nello stato dell'hash (index.js);
  * `apps/galleria/test/fixture_i18n.js`  — gli stessi dati per i test node.
Entrambi ES5 e **ASCII** (accenti come `\uXXXX`: il bundle e l'hash restano leggibili ovunque):

    module.exports = { keys: [...], en: [...], it: [...], de: [...], fr: [...] };

Gli array seguono l'ORDINE DEL FILE (D35): l'indice di una chiave e' la sua posizione, ed e'
quello che `tools/build_config_page.py` scrive nell'artefatto al posto del nome (`T('chiave'` ->
`T(12`). Aggiungere una chiave in mezzo cambia gli indici: va sempre rigenerato tutto insieme
(`make -C apps/galleria/test pagecheck` esegue prima questo --check, poi quello della pagina).

Controlli di `--check` (e di ogni generazione):
  * JSON valido, oggetto in cima, nessuna chiave doppia;
  * nomi delle chiavi in snake_case (`^[a-z][a-z0-9_]*$`), campi `_…` solo commenti;
  * ogni voce ha ESATTAMENTE le 4 lingue nell'ordine it, en, de, fr (completezza + ordine);
  * testi non vuoti, senza backtick (la pagina viene inlinata in una stringa) ne' CR;
  * segnaposto: solo `{0}` e `{1}`, e lo STESSO insieme in tutte le lingue della voce;
  * i due file generati coincidono byte a byte con la rigenerazione.

Uso:
  python3 tools/build_i18n.py                 # rigenera i due file
  python3 tools/build_i18n.py --check         # 0 se sono aggiornati, 1 altrimenti
  python3 tools/build_i18n.py --selftest      # autotest su una cartella temporanea

Solo stdlib (Python 3.8+). Nessun traceback in uscita: ogni errore e' un messaggio + exit 1.
"""

import argparse
import io
import json
import os
import re
import sys
import tempfile

LANGS = ('it', 'en', 'de', 'fr')            # ordine canonico DENTRO messages.json (D35)
OUT_LANGS = ('en', 'it', 'de', 'fr')        # ordine degli array nel modulo generato
PLACEHOLDERS = ('{0}', '{1}')

_HERE = os.path.dirname(os.path.abspath(__file__))
_APP = os.path.normpath(os.path.join(_HERE, '..', 'apps', 'galleria'))
DEFAULT_MESSAGES = os.path.join(_APP, 'i18n', 'messages.json')
DEFAULT_OUT = os.path.join(_APP, 'src', 'pkjs', 'i18n.js')
DEFAULT_FIXTURE = os.path.join(_APP, 'test', 'fixture_i18n.js')

_KEY_RE = re.compile(r'^[a-z][a-z0-9_]*$')
_BRACE_RE = re.compile(r'\{[^}]*\}')

HEADER = ('/* GENERATO da tools/build_i18n.py (S10): non modificare a mano.\n'
          ' * Sorgente: apps/galleria/i18n/messages.json (%d chiavi, lingue %s).\n'
          ' * ES5 e ASCII (accenti in \\uXXXX). L\'indice di una chiave e\' la sua posizione\n'
          ' * negli array: e\' quello che build_config_page.py scrive nell\'artefatto. */\n')


class I18nError(Exception):
    """Errore nei dizionari: il chiamante stampa il messaggio, mai un traceback."""


# ------------------------------------------------------------- lettura ----

def load_messages(path):
    """[(chiave, {lingua: testo}), …] nell'ordine del file. Lancia I18nError su ogni problema."""
    try:
        with io.open(path, encoding='utf-8') as fh:
            raw = fh.read()
    except OSError as exc:
        raise I18nError('non riesco a leggere %s (%s)' % (path, exc))
    try:
        pairs = json.loads(raw, object_pairs_hook=lambda p: p)
    except ValueError as exc:
        raise I18nError('%s non e\' JSON valido: %s' % (os.path.basename(path), exc))
    if not isinstance(pairs, list):
        raise I18nError('%s: in cima serve un oggetto { "chiave": {…} }' % os.path.basename(path))

    out, seen = [], set()
    for key, val in pairs:
        if key in seen:
            raise I18nError('chiave doppia: «%s» (il JSON terrebbe solo l\'ultima)' % key)
        seen.add(key)
        if key.startswith('_'):                       # campo di servizio (_note): solo commento
            if not isinstance(val, str):
                raise I18nError('il campo di servizio «%s» deve essere una stringa' % key)
            continue
        if not _KEY_RE.match(key):
            raise I18nError('chiave «%s»: serve snake_case (^[a-z][a-z0-9_]*$)' % key)
        if not isinstance(val, list):
            raise I18nError('chiave «%s»: serve un oggetto con le 4 lingue' % key)
        langs = [k for k, _ in val]
        if langs != list(LANGS):
            raise I18nError('chiave «%s»: lingue %s invece di %s (completezza e ordine)'
                            % (key, langs or '[]', list(LANGS)))
        texts = {}
        for lang, text in val:
            if not isinstance(text, str) or not text:
                raise I18nError('chiave «%s», lingua %s: testo assente o vuoto' % (key, lang))
            if '`' in text:
                raise I18nError('chiave «%s», lingua %s: backtick vietato (la pagina viene '
                                'inlinata in una stringa)' % (key, lang))
            if '\r' in text or '\n' in text:
                raise I18nError('chiave «%s», lingua %s: a capo vietato nel testo' % (key, lang))
            texts[lang] = text
        _check_placeholders(key, texts)
        out.append((key, texts))
    if not out:
        raise I18nError('%s non ha nessuna chiave' % os.path.basename(path))
    return out


def _check_placeholders(key, texts):
    """Solo {0}/{1}, e lo stesso insieme in tutte le lingue della voce (D35)."""
    ref = None
    for lang in LANGS:
        found = _BRACE_RE.findall(texts[lang])
        bad = [f for f in found if f not in PLACEHOLDERS]
        if bad:
            raise I18nError('chiave «%s», lingua %s: segnaposto sconosciuto %s (solo {0} e {1})'
                            % (key, lang, ', '.join(bad)))
        got = set(found)
        if ref is None:
            ref = got
        elif got != ref:
            raise I18nError('chiave «%s»: segnaposto diversi fra it (%s) e %s (%s)'
                            % (key, ', '.join(sorted(ref)) or 'nessuno', lang,
                               ', '.join(sorted(got)) or 'nessuno'))


# ------------------------------------------------------------ generazione ----

def render_module(entries):
    """Testo del modulo ES5 ASCII: keys + un array per lingua, nell'ordine del file."""
    parts = [HEADER % (len(entries), '/'.join(OUT_LANGS)), 'module.exports = {\n']
    parts.append('  keys: [\n')
    parts.append(''.join('    %s,\n' % json.dumps(k) for k, _ in entries))
    parts.append('  ],\n')
    for i, lang in enumerate(OUT_LANGS):
        parts.append('  %s: [\n' % lang)
        parts.append(''.join('    %s,\n' % json.dumps(t[lang], ensure_ascii=True)
                             for _, t in entries))
        parts.append('  ]%s\n' % ('' if i == len(OUT_LANGS) - 1 else ','))
    parts.append('};\n')
    text = ''.join(parts)
    try:
        text.encode('ascii')
    except UnicodeEncodeError as exc:                 # non deve succedere: json.dumps e' ASCII
        raise I18nError('modulo non ASCII: %s' % exc)
    return text


def keys_of(entries):
    return [k for k, _ in entries]


def _short(path):
    try:
        rel = os.path.relpath(path)
    except ValueError:
        return path
    return rel if len(rel) < len(path) else path


def _write_text(path, text):
    d = os.path.dirname(os.path.abspath(path))
    if d and not os.path.isdir(d):
        raise I18nError('cartella di destinazione inesistente: %s' % d)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)


def _same(path, text):
    """(uguale?, dettaglio) fra il file su disco e il testo rigenerato."""
    try:
        with open(path, 'rb') as fh:
            cur = fh.read()
    except OSError:
        return False, 'manca %s' % _short(path)
    want = text.encode('utf-8')
    if cur == want:
        return True, ''
    n = min(len(cur), len(want))
    off = next((k for k in range(n) if cur[k] != want[k]), n)
    return False, ('%s NON e\' aggiornato (%d B su disco, %d B rigenerati, prima differenza a %d B)'
                   % (_short(path), len(cur), len(want), off))


# --------------------------------------------------------------------- CLI ----

def build_parser():
    ap = argparse.ArgumentParser(
        prog='build_i18n.py',
        description='Genera i dizionari della config page di Galleria (S10) da '
                    'apps/galleria/i18n/messages.json.',
        epilog="Esempi:\n"
               "  %(prog)s\n"
               "  %(prog)s --check      # make -C apps/galleria/test pagecheck\n"
               "  %(prog)s --selftest\n"
               "Specifica: docs/design/galleria-s10-i18n.md D35.",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--messages', default=DEFAULT_MESSAGES, metavar='FILE',
                    help='sorgente JSON (default: %(default)s)')
    ap.add_argument('--out', default=DEFAULT_OUT, metavar='FILE',
                    help='modulo per il PKJS (default: %(default)s)')
    ap.add_argument('--fixture', default=DEFAULT_FIXTURE, metavar='FILE',
                    help='copia per i test node (default: %(default)s)')
    ap.add_argument('--check', action='store_true',
                    help='non scrive nulla: 0 se i due file coincidono con la rigenerazione')
    ap.add_argument('--selftest', action='store_true',
                    help='autotest su una cartella temporanea, poi esce')
    return ap


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.selftest:
        return selftest()
    try:
        entries = load_messages(args.messages)
        text = render_module(entries)
    except I18nError as exc:
        sys.stderr.write('build_i18n: errore: %s\n' % exc)
        return 1

    if args.check:
        bad = []
        for path in (args.out, args.fixture):
            ok, detail = _same(path, text)
            if not ok:
                bad.append(detail)
        if bad:
            for detail in bad:
                sys.stderr.write('build_i18n --check: %s\n' % detail)
            sys.stderr.write('build_i18n --check: esegui «python3 tools/build_i18n.py»\n')
            return 1
        print('build_i18n --check: %d chiavi × %d lingue aggiornate (%s, %s)'
              % (len(entries), len(OUT_LANGS), _short(args.out), _short(args.fixture)))
        return 0

    try:
        _write_text(args.out, text)
        _write_text(args.fixture, text)
    except I18nError as exc:
        sys.stderr.write('build_i18n: errore: %s\n' % exc)
        return 1
    except OSError as exc:
        sys.stderr.write('build_i18n: errore: scrittura fallita: %s\n' % exc)
        return 1
    print('build_i18n: %d chiavi × %d lingue (%d B) -> %s, %s'
          % (len(entries), len(OUT_LANGS), len(text.encode('utf-8')),
             _short(args.out), _short(args.fixture)))
    return 0


# ---------------------------------------------------------------- selftest ----

_T_OK = ('{\n'
         '  "_note": "prova",\n'
         '  "ciao": { "it": "Ciao più", "en": "Hi", "de": "Hallo", "fr": "Salut" },\n'
         '  "kb": { "it": "{0} KB su {1}", "en": "{0} KB of {1}", "de": "{0} KB von {1}", '
         '"fr": "{0} KB sur {1}" }\n'
         '}\n')


def selftest():
    ok = [0]
    fail = []

    def check(label, cond, detail=''):
        if cond:
            ok[0] += 1
        else:
            fail.append(label + ((': ' + detail) if detail else ''))

    def write(d, text, name='messages.json'):
        p = os.path.join(d, name)
        with io.open(p, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(text)
        return p

    def fails(label, text, needle):
        with tempfile.TemporaryDirectory() as d:
            p = write(d, text)
            try:
                load_messages(p)
                check(label, False, 'nessun errore')
            except I18nError as exc:
                check(label, needle in str(exc), '«%s» non contiene «%s»' % (exc, needle))

    with tempfile.TemporaryDirectory() as d:
        p = write(d, _T_OK)
        entries = load_messages(p)
        check('due chiavi nell\'ordine del file', keys_of(entries) == ['ciao', 'kb'], str(keys_of(entries)))
        text = render_module(entries)
        check('modulo ASCII', all(ord(c) < 128 for c in text))
        check('accento come \\u00f9', '\\u00f9' in text)
        check('array per lingua', all(('\n  %s: [\n' % l) in text for l in OUT_LANGS))
        check('nessun backtick', '`' not in text)
        out = os.path.join(d, 'i18n.js')
        fix = os.path.join(d, 'fixture.js')
        rc = main(['--messages', p, '--out', out, '--fixture', fix])
        check('generazione rc 0', rc == 0, 'rc %s' % rc)
        check('i due file coincidono',
              io.open(out, encoding='utf-8').read() == io.open(fix, encoding='utf-8').read())
        rc = main(['--messages', p, '--out', out, '--fixture', fix, '--check'])
        check('--check dopo la generazione', rc == 0, 'rc %s' % rc)
        with io.open(fix, 'a', encoding='utf-8') as fh:
            fh.write('\n')
        rc = main(['--messages', p, '--out', out, '--fixture', fix, '--check'])
        check('--check vede la fixture stantia', rc == 1, 'rc %s' % rc)
        rc = main(['--messages', os.path.join(d, 'manca.json'), '--out', out, '--fixture', fix])
        check('sorgente assente = rc 1', rc == 1, 'rc %s' % rc)

    fails('chiave doppia', _T_OK.replace('"kb"', '"ciao"'), 'chiave doppia')
    fails('lingua mancante', '{ "a": { "it": "x", "en": "y", "de": "z" } }', 'completezza e ordine')
    fails('lingue fuori ordine', '{ "a": { "en": "x", "it": "y", "de": "z", "fr": "w" } }',
          'completezza e ordine')
    fails('segnaposto diverso',
          '{ "a": { "it": "{0}", "en": "{1}", "de": "{0}", "fr": "{0}" } }', 'segnaposto diversi')
    fails('segnaposto sconosciuto',
          '{ "a": { "it": "{2}", "en": "{2}", "de": "{2}", "fr": "{2}" } }', 'segnaposto sconosciuto')
    fails('backtick', '{ "a": { "it": "`x`", "en": "y", "de": "z", "fr": "w" } }', 'backtick')
    fails('testo vuoto', '{ "a": { "it": "", "en": "y", "de": "z", "fr": "w" } }', 'assente o vuoto')
    fails('chiave non snake_case',
          '{ "Ciao": { "it": "x", "en": "y", "de": "z", "fr": "w" } }', 'snake_case')
    fails('JSON rotto', '{ "a": ', 'non e\' JSON valido')
    fails('niente chiavi', '{ "_note": "solo commento" }', 'non ha nessuna chiave')

    print('build_i18n --selftest: %d ok%s' % (ok[0], '' if not fail else ', %d FALLITI' % len(fail)))
    for f in fail:
        print('  FAIL ' + f)
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main())
