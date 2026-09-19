#!/usr/bin/env python3
r"""build_i18n.py — dizionari della config page di Galleria (S10, D35).

Sorgente unica: `apps/galleria/i18n/messages.json`, fuori da `src/pkjs/` perche' webpack non
deve imbarcarlo com'e' (il PKJS carica il modulo generato). Formato:

    {
      "_note": "…",                                       <- campi che iniziano con _ : commenti
      "chiave_parlante": { "it": "…", "en": "…", "de": "…", "fr": "…", "es": "…", "pt": "…" },
      …
    }

Genera due file identici (stesso oggetto, due destinazioni):
  * `apps/galleria/src/pkjs/i18n.js`      — il PKJS lo mette nello stato dell'hash (index.js);
  * `apps/galleria/test/fixture_i18n.js`  — gli stessi dati per i test node.
Entrambi ES5 e **ASCII** (accenti come `\uXXXX`: il bundle e l'hash restano leggibili ovunque):

    module.exports = { keys: [...], en: [...], it: [...], de: [...], fr: [...], es: [...], pt: [...] };

Gli array seguono l'ORDINE DEL FILE (D35): l'indice di una chiave e' la sua posizione, ed e'
quello che `tools/build_config_page.py` scrive nell'artefatto al posto del nome (`T('chiave'` ->
`T(12`). Aggiungere una chiave in mezzo cambia gli indici: va sempre rigenerato tutto insieme
(`make -C apps/galleria/test pagecheck` esegue prima questo --check, poi quello della pagina).

Controlli di `--check` (e di ogni generazione):
  * JSON valido, oggetto in cima, nessuna chiave doppia;
  * nomi delle chiavi in snake_case (`^[a-z][a-z0-9_]*$`), campi `_…` solo commenti;
  * ogni voce ha ESATTAMENTE le 6 lingue nell'ordine it, en, de, fr, es, pt (completezza + ordine);
  * testi non vuoti, senza backtick (la pagina viene inlinata in una stringa) ne' CR;
  * segnaposto: solo `{0}` e `{1}`, e lo STESSO insieme in tutte le lingue della voce;
  * tripwire di lunghezza (D70): le chiavi elencate in OPTIONS (finiscono in una `<option>`)
    e in LABELS (le `lbl_*` della colonna da 9,5 em) stanno nel loro limite di CARATTERI
    (code point, non byte: un testo accentato non «pesa» di piu') in tutte e sei le lingue,
    misurate sul testo RENDERIZZATO (segnaposto sostituiti con il valore piu' lungo che la
    pagina puo' metterci davvero); una chiave in lista che non esiste in messages.json e'
    un errore («lista da aggiornare»);
  * i due file generati coincidono byte a byte con la rigenerazione.

UX-2 (13/09/2026): `opt_auto` non esiste piu' — al suo posto quattro chiavi, una per select
(`opt_clock_auto`, `opt_leading_zero_auto`, `opt_color_auto`, `opt_outline_auto`, U-11) — e su
flint il suffisso `opt_style_no_flint` avvolge anche i due colori spenti (D86): la regola di
rendering della tripwire li misura insieme agli stili.

Uso:
  python3 tools/build_i18n.py                 # rigenera i due file
  python3 tools/build_i18n.py --check         # 0 se sono aggiornati, 1 altrimenti
  python3 tools/build_i18n.py --selftest      # autotest su una cartella temporanea (32 controlli)

Solo stdlib (Python 3.8+). Nessun traceback in uscita: ogni errore e' un messaggio + exit 1.
"""

import argparse
import io
import json
import os
import re
import sys
import tempfile

# S11 (D39): spagnolo e portoghese in coda, in tutte le copie della lista (qui, in
# page_core.js, in index.js, in galleria_devserver.py e nell'enum GalLang dell'orologio).
LANGS = ('it', 'en', 'de', 'fr', 'es', 'pt')        # ordine canonico DENTRO messages.json (D35)
OUT_LANGS = ('en', 'it', 'de', 'fr', 'es', 'pt')    # ordine degli array nel modulo generato
PLACEHOLDERS = ('{0}', '{1}')

# ------------------------------------------------ tripwire di lunghezza (D70) ----
# La config page ha due posti dove un testo lungo rompe il disegno invece di andare a capo:
# le `<option>` delle select (il telefono le tronca o allarga la riga) e le `lbl_*` della
# colonna delle etichette, larga 9,5 em. Le liste sono ESPLICITE (non un prefisso del nome):
# le etichette delle caselle — opt_sunlight, opt_shake_next, opt_info_* — finiscono in un
# <label> a tutta larghezza e NON stanno in lista. Ogni chiave elencata deve esistere in
# messages.json: un nome sbagliato e' un errore, non un controllo che sparisce in silenzio.
# Nessuna tripwire sul francese (D67: «KB» e spazio semplice restano come sono).
OPTION_LIMIT = 28          # <option> normale
OPTION_LIMIT_WIDE = 36     # le tre il cui testo renderizzato e' per forza piu' lungo
LABEL_LIMIT = 22           # `lbl_*` nella colonna da 9,5 em

OPTIONS = {
    'opt_layout_a': OPTION_LIMIT,
    'opt_layout_a_bottom': OPTION_LIMIT,       # S14 (D136): terza voce di «Disposizione»
    'opt_layout_b': OPTION_LIMIT,
    'opt_font_leco': OPTION_LIMIT_WIDE,        # dice anche in quale layout funziona
    'opt_style_solid': OPTION_LIMIT,
    'opt_style_transp': OPTION_LIMIT,
    'opt_style_transp_3d': OPTION_LIMIT,
    'opt_style_solid_3d': OPTION_LIMIT,
    'opt_style_no_flint': OPTION_LIMIT_WIDE,   # {0} = un'altra option per intero (stile o colore)
    # UX-2 (U-11): una chiave «automatico» per select al posto dell'unica `opt_auto`, cosi' ogni
    # riga dice DA DOVE viene il valore. Sono quattro option come le altre: stesso limite.
    'opt_clock_auto': OPTION_LIMIT,
    'opt_leading_zero_auto': OPTION_LIMIT,
    'opt_yes': OPTION_LIMIT,
    'opt_no': OPTION_LIMIT,
    'opt_never': OPTION_LIMIT,
    'opt_minutes': OPTION_LIMIT,
    'opt_hours': OPTION_LIMIT,
    'opt_one_day': OPTION_LIMIT,
    'opt_order_seq': OPTION_LIMIT,
    'opt_order_random': OPTION_LIMIT,
    'opt_color_auto': OPTION_LIMIT,
    'opt_color_white': OPTION_LIMIT,
    'opt_color_black': OPTION_LIMIT,
    'opt_color_yellow': OPTION_LIMIT,
    'opt_color_blue': OPTION_LIMIT,
    'opt_outline_auto': OPTION_LIMIT,
    'opt_outline_always': OPTION_LIMIT,
    'opt_lang_auto': OPTION_LIMIT_WIDE,        # {0} = l'endonimo piu' lungo
    'opt_prev_sun': OPTION_LIMIT,
    'opt_prev_nominal': OPTION_LIMIT,
    'dither_none': OPTION_LIMIT,               # option di #dither, con i nomi propri
}

# lbl_font da UX-2 sta su una riga sua (#fontRow .rlab flex-basis 100%): il limite resta per prudenza.
LABELS = dict.fromkeys((
    'lbl_zoom', 'lbl_gamma', 'lbl_lift', 'lbl_dither', 'lbl_preview', 'lbl_lang',
    'lbl_layout', 'lbl_font', 'lbl_digit_style', 'lbl_clock_mode', 'lbl_leading_zero',
    'lbl_interval', 'lbl_order', 'lbl_text_color', 'lbl_outline', 'lbl_info_row',
), LABEL_LIMIT)

# Come si rende un segnaposto prima di misurarlo: il valore piu' lungo che page.js ci mette.
RENDER_ARGS = {
    'opt_minutes': {'{0}': '60'},                    # page.js: 5 / 15 / 30 / 60
    'opt_hours': {'{0}': '12'},                      # page.js: 3 / 6 / 12 (S14, D139)
    'opt_lang_auto': {'{0}': 'Portugu\u00eas'},      # il piu' lungo dei sei endonimi
}
# …oppure il testo piu' lungo, NELLA STESSA LINGUA, fra altre chiavi del dizionario.
# `opt_style_no_flint` («{0} (non sul Duo)») e' il suffisso che page.js mette attorno alle option
# che su flint non esistono. Da UX-2 (D86) il meccanismo e' UNO solo — `UNAVAIL` in page.js — e
# vale per due select: `digit_style` (le due opzioni con ombra) e `text_color` (giallo e blu, che
# su un display in bianco e nero vengono rimappati su bianco/nero come in `ui_time.c:683-684`).
# Qui sono elencate tutte e quattro le `opt_style_*` e tutti e due i colori spenti: la misura e'
# volutamente CONSERVATIVA — un limite superiore, non il testo esatto — e si tiene cosi' per due
# motivi: (a) oggi non cambia nulla, perche' in tutte e sei le lingue la piu' lunga di queste sei
# e' gia' una delle due 3D («contorno con ombra», «outline with shadow», «gefuellt mit Schatten»,
# «preenchido com sombra»…), quindi conservativo ed esatto coincidono; (b) se domani UNAVAIL
# crescesse (per esempio LECO spento su flint) la tripwire resterebbe giusta senza che nessuno si
# ricordi di aggiornare questa riga. Ridurla alle sole voci davvero avvolte la renderebbe esatta
# ma la legherebbe a una riga di page.js che il tool non legge: un falso VERDE e' peggio di un
# falso rosso di 2-3 caratteri, che comunque nessun testo di UX-1/UX-2 produce.
RENDER_LONGEST = {
    'opt_style_no_flint': ('opt_style_solid', 'opt_style_transp',
                           'opt_style_transp_3d', 'opt_style_solid_3d',
                           'opt_color_yellow', 'opt_color_blue'),
}

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

def load_messages(path, options=OPTIONS, labels=LABELS):
    """[(chiave, {lingua: testo}), …] nell'ordine del file. Lancia I18nError su ogni problema.

    `options`/`labels` sono le liste della tripwire D70 (parametri solo per il selftest, che
    lavora su dizionari di prova senza le chiavi vere).
    """
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
            raise I18nError('chiave «%s»: serve un oggetto con le %d lingue'
                            % (key, len(LANGS)))
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
    check_lengths(out, options, labels)               # tripwire di lunghezza (D70)
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


def _rendered(key, lang, texts):
    """Testo di `key` in `lang` con i segnaposto sostituiti secondo RENDER_ARGS/RENDER_LONGEST."""
    out = texts[key][lang]
    args = dict(RENDER_ARGS.get(key, {}))
    for src in RENDER_LONGEST.get(key, ()):
        if src not in texts:
            raise I18nError('chiave «%s»: la regola di rendering rimanda a «%s», che non e\' '
                            'in messages.json (lista da aggiornare)' % (key, src))
        cand = texts[src][lang]
        if len(cand) > len(args.get('{0}', '')):
            args['{0}'] = cand
    for ph, val in args.items():
        out = out.replace(ph, val)
    left = sorted(set(f for f in _BRACE_RE.findall(out) if f in PLACEHOLDERS))
    if left:
        raise I18nError('chiave «%s», lingua %s: %s senza regola di rendering (D70): aggiungere '
                        'in RENDER_ARGS il valore piu\' lungo che page.js ci mette'
                        % (key, lang, ', '.join(left)))
    return out


def check_lengths(entries, options=OPTIONS, labels=LABELS):
    """Tripwire D70: ogni chiave di OPTIONS/LABELS esiste e sta nel suo limite in ogni lingua.

    Misura i CARATTERI (code point: `len()` di una str Python) del testo renderizzato, lingua
    per lingua, e raccoglie TUTTI gli sforamenti prima di lanciare, cosi' chi riscrive i testi
    li vede in un colpo solo. `options`/`labels` sono parametri solo per il selftest.
    """
    texts = dict(entries)
    both = sorted(set(options) & set(labels))
    if both:                                          # limite ambiguo: le liste sono disgiunte
        raise I18nError('chiavi elencate sia in OPTIONS sia in LABELS: %s' % ', '.join(both))
    limits = {}
    limits.update(options)
    limits.update(labels)

    absent = [k for k in sorted(limits) if k not in texts]
    if absent:
        raise I18nError('OPTIONS/LABELS elencano chiavi che non sono in messages.json '
                        '(lista da aggiornare): %s' % ', '.join(absent))

    bad = []
    for key, _ in entries:                            # ordine del file: report stabile
        if key not in limits:
            continue
        limit = limits[key]
        for lang in LANGS:
            text = _rendered(key, lang, texts)
            if len(text) > limit:
                bad.append('  %s / %s: %d caratteri, limite %d - «%s»'
                           % (key, lang, len(text), limit, text))
    if bad:
        raise I18nError('%d testi oltre il limite (tripwire D70: option %d/%d caratteri, '
                        'etichette %d):\n%s'
                        % (len(bad), OPTION_LIMIT, OPTION_LIMIT_WIDE, LABEL_LIMIT,
                           '\n'.join(bad)))


# ------------------------------------------------------------ generazione ----

def render_module(entries):
    """Testo del modulo ES5 ASCII: keys + un array per lingua, nell'ordine del file."""
    if set(OUT_LANGS) != set(LANGS) or len(OUT_LANGS) != len(LANGS):
        # Refuso in una delle due liste: senza questa riga sarebbe un KeyError con traceback.
        raise I18nError('LANGS %s e OUT_LANGS %s non sono le stesse lingue (S11, D39)'
                        % (list(LANGS), list(OUT_LANGS)))
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


def main(argv=None, options=OPTIONS, labels=LABELS):
    args = build_parser().parse_args(argv)
    if args.selftest:
        return selftest()
    try:
        entries = load_messages(args.messages, options, labels)
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

# Fixture del selftest: sei lingue (S11, D39), un accento e i due segnaposto. NON legge mai
# i file del repo: il selftest deve valere anche mentre messages.json e' a meta' strada.
_T_OK = ('{\n'
         '  "_note": "prova",\n'
         '  "ciao": { "it": "Ciao più", "en": "Hi", "de": "Hallo", "fr": "Salut", '
         '"es": "Hola", "pt": "Olá" },\n'
         '  "kb": { "it": "{0} KB su {1}", "en": "{0} KB of {1}", "de": "{0} KB von {1}", '
         '"fr": "{0} KB sur {1}", "es": "{0} KB de {1}", "pt": "{0} KB de {1}" }\n'
         '}\n')


def _entry(text='x', **over):
    """Voce JSON con TUTTE le lingue di LANGS (nell'ordine giusto), alcune sovrascritte."""
    return '{ %s }' % ', '.join('"%s": "%s"' % (l, over.get(l, text)) for l in LANGS)


# Fixture della tripwire D70: testi ESATTAMENTE al limite (28 / 36 / 22 caratteri renderizzati).
# `opt_minutes` e' 29 caratteri di sorgente ma 28 renderizzato ({0} -> «60»): se qualcuno
# misurasse il testo grezzo, questo caso diventerebbe rosso.
_LIM_OPTIONS = {'opt_layout_a': 28, 'opt_minutes': 28, 'opt_font_leco': 36,
                'opt_style_solid': 28, 'opt_style_transp': 28, 'opt_style_transp_3d': 28,
                'opt_style_solid_3d': 28, 'opt_style_no_flint': 36}
_LIM_LABELS = {'lbl_gamma': 22}


def _limits_json(layout_a='a' * 28, gamma='g' * 22, over=None):
    """messages.json di prova con le chiavi della tripwire ai limiti (sei lingue).

    `over` = {chiave: {lingua: testo}} sovrascrive UNA lingua di UNA chiave: serve al caso in
    cui a sforare e' una sola colonna (la misura e' per lingua, non solo sull'italiano).
    """
    rows = [('opt_layout_a', layout_a),
            ('opt_minutes', '{0} ' + 'm' * 25),       # «60 mmm…» = 28 caratteri
            ('opt_font_leco', 'L' * 36),
            ('opt_style_solid', 'p' * 5),
            ('opt_style_transp', 'c' * 9),
            ('opt_style_transp_3d', 's' * 28),        # la piu' lunga: entra in no_flint
            ('opt_style_solid_3d', 'd' * 7),
            ('opt_style_no_flint', '{0}' + 'x' * 8),  # 28 + 8 = 36 renderizzato
            # UX-2 (D86): il suffisso avvolge anche i due colori spenti su flint. Non hanno un
            # limite proprio in _LIM_OPTIONS, ma DEVONO esistere: se RENDER_LONGEST rimanda a una
            # chiave assente il tool lancia «lista da aggiornare» (ed e' giusto cosi').
            ('opt_color_yellow', 'y' * 12),
            ('opt_color_blue', 'b' * 10),
            ('lbl_gamma', gamma)]
    over = over or {}
    return '{\n%s\n}\n' % ',\n'.join('  "%s": %s' % (k, _entry(t, **over.get(k, {})))
                                       for k, t in rows)


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

    def fails(label, text, needle, options=None, labels=None):
        with tempfile.TemporaryDirectory() as d:
            p = write(d, text)
            try:
                load_messages(p, options or {}, labels or {})
                check(label, False, 'nessun errore')
            except I18nError as exc:
                check(label, needle in str(exc), '«%s» non contiene «%s»' % (exc, needle))

    with tempfile.TemporaryDirectory() as d:
        p = write(d, _T_OK)
        entries = load_messages(p, {}, {})
        check('due chiavi nell\'ordine del file', keys_of(entries) == ['ciao', 'kb'], str(keys_of(entries)))
        text = render_module(entries)
        check('modulo ASCII', all(ord(c) < 128 for c in text))
        check('accento come \\u00f9', '\\u00f9' in text)
        check('array per lingua', all(('\n  %s: [\n' % l) in text for l in OUT_LANGS))
        check('sei lingue, es e pt in coda (S11, D39)',
              LANGS == ('it', 'en', 'de', 'fr', 'es', 'pt')
              and OUT_LANGS == ('en', 'it', 'de', 'fr', 'es', 'pt'),
              '%s / %s' % (list(LANGS), list(OUT_LANGS)))
        check('nessun backtick', '`' not in text)
        out = os.path.join(d, 'i18n.js')
        fix = os.path.join(d, 'fixture.js')
        rc = main(['--messages', p, '--out', out, '--fixture', fix], {}, {})
        check('generazione rc 0', rc == 0, 'rc %s' % rc)
        check('i due file coincidono',
              io.open(out, encoding='utf-8').read() == io.open(fix, encoding='utf-8').read())
        rc = main(['--messages', p, '--out', out, '--fixture', fix, '--check'], {}, {})
        check('--check dopo la generazione', rc == 0, 'rc %s' % rc)
        with io.open(fix, 'a', encoding='utf-8') as fh:
            fh.write('\n')
        rc = main(['--messages', p, '--out', out, '--fixture', fix, '--check'], {}, {})
        check('--check vede la fixture stantia', rc == 1, 'rc %s' % rc)
        rc = main(['--messages', os.path.join(d, 'manca.json'), '--out', out, '--fixture', fix],
                  {}, {})
        check('sorgente assente = rc 1', rc == 1, 'rc %s' % rc)

    fails('chiave doppia', _T_OK.replace('"kb"', '"ciao"'), 'chiave doppia')
    fails('lingua mancante (5 su 6: manca pt)',
          '{ "a": { "it": "x", "en": "y", "de": "z", "fr": "w", "es": "v" } }',
          'completezza e ordine')
    fails('lingue fuori ordine',
          '{ "a": { "en": "x", "it": "y", "de": "z", "fr": "w", "es": "v", "pt": "u" } }',
          'completezza e ordine')
    fails('segnaposto diverso', '{ "a": %s }' % _entry('{0}', en='{1}'), 'segnaposto diversi')
    fails('segnaposto sconosciuto', '{ "a": %s }' % _entry('{2}'), 'segnaposto sconosciuto')
    fails('backtick', '{ "a": %s }' % _entry(it='`x`'), 'backtick')
    fails('testo vuoto', '{ "a": %s }' % _entry(it=''), 'assente o vuoto')
    fails('chiave non snake_case', '{ "Ciao": %s }' % _entry(), 'snake_case')
    fails('JSON rotto', '{ "a": ', 'non e\' JSON valido')
    fails('niente chiavi', '{ "_note": "solo commento" }', 'non ha nessuna chiave')

    # --- tripwire di lunghezza (D70) ---
    # I casi qui sotto provano il COMPORTAMENTO della tripwire con liste di prova: senza questo
    # controllo si potrebbe alzare un limite o togliere una chiave dalle liste vere e il selftest
    # resterebbe verde. I numeri sono quelli del contratto D70 (28 / 36 / 22, 16 lbl) con le
    # liste di UX-2 piu' S14: 30 option = 26 di UX-1 - `opt_auto` + le quattro «automatico» di
    # U-11 + `opt_layout_a_bottom` (D136).
    # Cambiarli e' una decisione, non una svista, e va fatta anche qui e in tools/README.md Sec.18.
    check('limiti e liste della tripwire D70',
          OPTION_LIMIT == 28 and OPTION_LIMIT_WIDE == 36 and LABEL_LIMIT == 22
          and len(OPTIONS) == 30 and len(LABELS) == 16
          and sorted(k for k, v in OPTIONS.items() if v == OPTION_LIMIT_WIDE)
          == ['opt_font_leco', 'opt_lang_auto', 'opt_style_no_flint'],
          '%d option (%d a %d), %d etichette, limiti %d/%d/%d'
          % (len(OPTIONS), sum(1 for v in OPTIONS.values() if v == OPTION_LIMIT_WIDE),
             OPTION_LIMIT_WIDE, len(LABELS), OPTION_LIMIT, OPTION_LIMIT_WIDE, LABEL_LIMIT))
    # UX-2 (U-11): `opt_auto` era una sola chiave per quattro select. Se qualcuno la rimettesse
    # in lista senza rimetterla in messages.json la tripwire morirebbe con «lista da aggiornare»;
    # se invece togliesse una delle quattro nuove, quella option smetterebbe di essere misurata
    # in silenzio — ed e' il caso che questo pin copre.
    check('le quattro «automatico» di U-11 in OPTIONS, `opt_auto` fuori',
          'opt_auto' not in OPTIONS
          and all(k in OPTIONS for k in ('opt_clock_auto', 'opt_leading_zero_auto',
                                         'opt_color_auto', 'opt_outline_auto')),
          'opt_auto %s, mancano %s'
          % ('presente' if 'opt_auto' in OPTIONS else 'assente',
             [k for k in ('opt_clock_auto', 'opt_leading_zero_auto', 'opt_color_auto',
                          'opt_outline_auto') if k not in OPTIONS] or 'nessuna'))
    # UX-2 (D86): il suffisso «(non sul Duo)» avvolge stili E colori. Accorciare questa tupla
    # renderebbe la misura meno conservativa senza che nessun test se ne accorga.
    check('opt_style_no_flint misurato su stili e colori (D86)',
          sorted(RENDER_LONGEST.get('opt_style_no_flint', ()))
          == ['opt_color_blue', 'opt_color_yellow', 'opt_style_solid', 'opt_style_solid_3d',
              'opt_style_transp', 'opt_style_transp_3d']
          and len(RENDER_LONGEST) == 1,
          '%s' % (sorted(RENDER_LONGEST.get('opt_style_no_flint', ())),))
    with tempfile.TemporaryDirectory() as d:
        p = write(d, _limits_json())
        try:
            load_messages(p, _LIM_OPTIONS, _LIM_LABELS)
            check('testi esattamente ai limiti: nessun errore (D70)', True)
        except I18nError as exc:
            check('testi esattamente ai limiti: nessun errore (D70)', False, str(exc))
    fails('option oltre il limite', _limits_json(layout_a='a' * 29),
          'opt_layout_a / it: 29 caratteri, limite 28', _LIM_OPTIONS, _LIM_LABELS)
    fails('etichetta oltre il limite', _limits_json(gamma='g' * 23),
          'lbl_gamma / it: 23 caratteri, limite 22', _LIM_OPTIONS, _LIM_LABELS)
    fails('chiave in lista assente da messages.json', _limits_json(),
          'lista da aggiornare', dict(_LIM_OPTIONS, opt_mai_esistita=28), _LIM_LABELS)
    # Sforamento in UNA sola lingua: chi misurasse solo l'italiano (o solo la prima colonna)
    # resterebbe verde qui. Il messaggio deve nominare la lingua colpevole.
    fails('option oltre il limite solo in tedesco',
          _limits_json(over={'opt_layout_a': {'de': 'a' * 29}}),
          'opt_layout_a / de: 29 caratteri, limite 28', _LIM_OPTIONS, _LIM_LABELS)
    # Accenti: il limite e' in CARATTERI (code point), non in byte. Questo testo sta nel limite
    # ma pesa il doppio in UTF-8: deve passare (misurarlo in byte lo boccerebbe).
    with tempfile.TemporaryDirectory() as d:
        acc = '\u00e0' * LABEL_LIMIT                 # 22 caratteri, 44 byte UTF-8
        p = write(d, _limits_json(gamma=acc))
        label = ('accenti: %d caratteri ma %d byte UTF-8 passano (si misurano i code point)'
                 % (len(acc), len(acc.encode('utf-8'))))
        try:
            load_messages(p, _LIM_OPTIONS, _LIM_LABELS)
            check(label, len(acc.encode('utf-8')) > LABEL_LIMIT, 'fixture non oltre il limite in byte')
        except I18nError as exc:
            check(label, False, str(exc))
    fails('segnaposto senza regola di rendering', _limits_json(layout_a='{1} corto'),
          'senza regola di rendering', _LIM_OPTIONS, _LIM_LABELS)
    _st = {'opt_style_solid': {'it': 'pieno', 'en': 'solid'},
           'opt_style_transp': {'it': 'contorno lungo', 'en': 'x'},
           'opt_style_transp_3d': {'it': 'c', 'en': 'outline with shadow'},
           'opt_style_solid_3d': {'it': 'd', 'en': 'y'},
           'opt_color_yellow': {'it': 'giallo', 'en': 'light yellow'},
           'opt_color_blue': {'it': 'blu', 'en': 'dark blue'},
           'opt_style_no_flint': {'it': '{0} (no Duo)', 'en': '{0} (no Duo)'}}
    check('opt_style_no_flint prende la piu\' lunga della STESSA lingua',
          _rendered('opt_style_no_flint', 'it', _st) == 'contorno lungo (no Duo)'
          and _rendered('opt_style_no_flint', 'en', _st) == 'outline with shadow (no Duo)',
          '%s / %s' % (_rendered('opt_style_no_flint', 'it', _st),
                       _rendered('opt_style_no_flint', 'en', _st)))

    print('build_i18n --selftest: %d ok%s' % (ok[0], '' if not fail else ', %d FALLITI' % len(fail)))
    for f in fail:
        print('  FAIL ' + f)
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main())
