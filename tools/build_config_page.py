#!/usr/bin/env python3
r"""build_config_page.py — inliner della config page di Galleria (S6).

Prende le sorgenti di `apps/galleria/src/pkjs/config/` (page.html + page.css + i .js) e
produce un unico HTML autosufficiente — nessuna risorsa esterna: la pagina viaggia dentro un
`data:` URL (telefono) o viene servita dal dev server (emulatore) — piu' il modulo
`apps/galleria/src/pkjs/config_page.js` che il PKJS carica con `require('./config_page')`.

Specifica: `docs/design/galleria-s6-config-page.md` §1 (contratto di inlining) e §7 (questo tool).

Regole di inlining:
  * `<link rel="stylesheet" href="X">`  ->  `<style>…</style>`
  * `<script src="X"></script>`         ->  `<script>…</script>`
  * X = file nella STESSA cartella (niente sottocartelle, niente URL, niente query/fragment);
  * file mancante = errore, salvo `data-optional="1"` (il tag sparisce, senza lasciare la riga vuota);
  * il contenuto inlinato non puo' contenere il marcatore che chiuderebbe il SUO tag
    (`</script` in un .js, `</style` in un .css; l'incrocio e' innocuo), ne' — nei .js — un
    `<!--` seguito da un `<script` (il parser entra in «script data double escaped»);
  * l'ordine dei tag resta quello di page.html (atteso: pipeline -> page_core -> previews -> page);
  * passo i18n (S10, D35): nell'HTML finito il NOME di ogni chiave di traduzione diventa il suo
    INDICE in `apps/galleria/i18n/messages.json` — nelle chiamate a T dei .js e negli attributi
    `data-i18n`/`data-i18n-title` del markup — cosi' l'artefatto non porta nessun testo e nessun
    nome di chiave; una chiave che non esiste e' un errore;
  * oltre 64 KB (65.536 B) di HTML inlinato = errore (obiettivo: < 60 KB, avviso oltre);
  * output riproducibile: nessuna data, nessun percorso assoluto, fine riga sempre \n.
Gli `<script>`/`<style>` gia' inline e i commenti HTML non vengono toccati (e il loro corpo
non viene scansionato: un `<link>` dentro un commento CSS resta dov'e').

Uso:
  python3 tools/build_config_page.py                          # rigenera src/pkjs/config_page.js
  python3 tools/build_config_page.py --check                  # 0 se e' aggiornato, 1 altrimenti (make pagecheck)
  python3 tools/build_config_page.py --html-out /tmp/page.html  # anche l'HTML, per aprirlo nel browser
  python3 tools/build_config_page.py --selftest               # autotest su una cartella temporanea

Solo stdlib (Python 3.8+). Nessun traceback in uscita: ogni errore e' un messaggio + exit 1.
"""

import argparse
import contextlib
import io
import json
import os
import re
import shutil
import sys
import tempfile

ENTRY = 'page.html'
MAX_BYTES = 64 * 1024                      # tetto duro dell'HTML inlinato: oltre = errore
SOFT_BYTES = 60 * 1024                     # obiettivo di budget: oltre = avviso
SCRIPT_ORDER = ('pipeline.js', 'page_core.js', 'previews.js', 'page.js')

_HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIR = os.path.normpath(os.path.join(_HERE, '..', 'apps', 'galleria', 'src', 'pkjs', 'config'))
DEFAULT_OUT = os.path.normpath(os.path.join(_HERE, '..', 'apps', 'galleria', 'src', 'pkjs', 'config_page.js'))
DEFAULT_MESSAGES = os.path.normpath(os.path.join(_HERE, '..', 'apps', 'galleria', 'i18n', 'messages.json'))

HEADER = ('/* GENERATO da tools/build_config_page.py (S6): non modificare a mano. '
          'Sorgenti: src/pkjs/config/. Dimensione HTML: %d B. */\n')


class PageBuildError(Exception):
    """Errore di inlining: il chiamante stampa il messaggio, mai un traceback."""


# ------------------------------------------------------- scanner di page.html ----
# Niente parser HTML: servono solo <script>, <style>, <link> e i commenti (da saltare).
# Gli attributi possono contenere «>» dentro le virgolette (data-t="a>b"): il tag finisce al
# primo «>» FUORI dalle virgolette, non al primo «>» in assoluto (M2-bis F6a).
_TAG_ATTRS = r'(?:"[^"]*"|\'[^\']*\'|[^>"\'])*'
_SCAN_RE = re.compile(r'<!--.*?-->'
                      r'|<(?:script|style|link)\b' + _TAG_ATTRS + r'>'
                      r'|<(?:script|style|link)\b',       # tag mal formato: virgoletta non chiusa
                      re.I | re.S)
_CLOSE_SCRIPT_RE = re.compile(r'</\s*script\s*>', re.I)
_CLOSE_STYLE_RE = re.compile(r'</\s*style\s*>', re.I)
_ATTR_RE = re.compile(r'([A-Za-z_:][-A-Za-z0-9_:.]*)\s*(?:=\s*("[^"]*"|\'[^\']*\'|[^\s"\'=<>`]+))?')
# Cio' che chiuderebbe il tag inlinato: SOLO il marcatore dello stesso tipo (M2-bis F5).
# In HTML un «</style>» dentro uno <script> e un «</script>» dentro uno <style> sono innocui.
_MARKER_RE = {'script': re.compile(r'</\s*script\b', re.I),
              'style': re.compile(r'</\s*style\b', re.I)}
# Trappola del parser HTML (M2-bis F9): dentro uno <script>, un «<!--» seguito da un «<script»
# porta in «script data double escaped», dove il </script> di chiusura NON chiude piu' il tag.
_HTML_COMMENT_OPEN = '<!--'
_SCRIPT_OPEN_RE = re.compile(r'<script\b', re.I)
_NAME_RE = re.compile(r'^[A-Za-z0-9_][A-Za-z0-9._-]*$')
# Riferimento non locale: uno schema («http:», «data:», «mailto:») o «//host». Attenzione:
# un file che si CHIAMA http2.js e' locale e va inlinato (M2-bis F4): conta il «:», non il prefisso.
_URL_RE = re.compile(r'^(?:[A-Za-z][A-Za-z0-9+.\-]*:|//)')
_BLANK_TAIL_RE = re.compile(r'[ \t]*\r?\n')
# Attributi che l'inlining puo' scartare senza cambiare il significato del tag; tutti gli altri
# spariscono con un avviso (M2-bis F7: «defer», «type=module», «media=print» cambiano semantica).
_SCRIPT_KEEP = ('src', 'data-optional')
_LINK_KEEP = ('href', 'rel', 'data-optional')
_NOOP_SCRIPT_TYPE = ('', 'text/javascript', 'application/javascript',
                     'text/ecmascript', 'application/ecmascript')
_NOOP_LINK_TYPE = ('', 'text/css')
# Controlli non fatali sulla pagina finita (§1 e §5 della specifica): solo avvisi.
_EXTERNAL_RE = re.compile(r'(?:src|href)=["\'](?:https?:)?//', re.I)
_IMPORT_RE = re.compile(r'@import\b', re.I)
_STORAGE_RE = re.compile(r'\b(?:localStorage|sessionStorage)\s*[.\[]|document\s*\.\s*cookie')


# S10 (D35): `T('chiave'` -> `T(7`; `data-i18n="chiave"` -> `data-i18n="7"`. Il lookbehind
# evita di prendere un identificatore che finisce per T (es. `INT('x')` o `obj.T('x')`).
_T_CALL_RE = re.compile(r'''(?<![A-Za-z0-9_$.])(T\(\s*)(['"])([A-Za-z0-9_]+)\2''')
_I18N_ATTR_RE = re.compile(r'(data-i18n(?:-title)?=")([A-Za-z0-9_]+)(")')


def messages_path(dir_path):
    """messages.json accanto alle sorgenti (src/pkjs/config -> ../../../i18n), o quello di default."""
    cand = os.path.normpath(os.path.join(dir_path, '..', '..', '..', 'i18n', 'messages.json'))
    return cand if os.path.isfile(cand) else DEFAULT_MESSAGES


def load_message_keys(path):
    """Nomi delle chiavi nell'ordine del file (i campi `_…` sono commenti). L'indice e' la
    posizione: lo stesso che build_i18n.py mette negli array di i18n.js."""
    try:
        with io.open(path, encoding='utf-8') as fh:
            pairs = json.load(fh, object_pairs_hook=lambda p: p)
    except OSError as exc:
        raise PageBuildError('non riesco a leggere i messaggi %s (%s)' % (_short(path), exc))
    except ValueError as exc:
        raise PageBuildError('%s non e\' JSON valido: %s' % (_short(path), exc))
    if not isinstance(pairs, list):
        raise PageBuildError('%s: in cima serve un oggetto { "chiave": {…} }' % _short(path))
    keys = [k for k, _ in pairs if not k.startswith('_')]
    if len(set(keys)) != len(keys):
        raise PageBuildError('%s ha chiavi doppie: esegui «python3 tools/build_i18n.py --check»'
                             % _short(path))
    return keys


_I18N_KEYS_RE = re.compile(r'keys:\s*\[(.*?)\]', re.S)


def _check_i18n_module(messages, keys, warn=None):
    """Revisione S10: l'artefatto scrive INDICI, il PKJS spedisce gli array di src/pkjs/i18n.js: se
    i due nascono da messages.json diversi (pebble build senza `make -C test pagecheck`) la pagina
    mostrerebbe testi sbagliati senza errori. Qui si pretende che l'elenco `keys` del modulo
    generato coincida con messages.json; il rimedio e' `python3 tools/build_i18n.py`."""
    module = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(messages))), 'src', 'pkjs', 'i18n.js')
    if not os.path.isfile(module):
        # Nessun modulo accanto (copie di prova, selftest): niente da confrontare. Nel repo il modulo c'e' sempre
        # (index.js lo richiede) e build_i18n.py --check nel pagecheck lo tiene aggiornato.
        (warn or _default_warn)('avviso: %s assente, salto il confronto artefatto/dizionari' % _short(module))
        return
    try:
        with io.open(module, 'r', encoding='utf-8') as fh:
            text = fh.read()
        m = _I18N_KEYS_RE.search(text)
        found = json.loads('[' + m.group(1).strip().rstrip(',') + ']') if m else None
    except (OSError, ValueError) as exc:
        raise PageBuildError('%s illeggibile (%s): eseguire python3 tools/build_i18n.py' % (_short(module), exc))
    if found != list(keys):
        raise PageBuildError('%s non e\' allineato a %s (%d chiavi contro %d): eseguire python3 tools/build_i18n.py'
                             % (_short(module), _short(messages), len(found or []), len(keys)))


def i18n_pass(html, messages, warn=None):
    """(HTML con gli indici al posto dei nomi, quante sostituzioni). Se non c'e' niente da
    convertire torna l'HTML com'e' senza nemmeno aprire messages.json."""
    warn = warn or _default_warn
    if not (_T_CALL_RE.search(html) or _I18N_ATTR_RE.search(html)):
        return html, 0
    if not os.path.isfile(messages):
        raise PageBuildError('la pagina usa chiavi di traduzione ma manca %s (S10, D35)'
                             % _short(messages))
    keys = load_message_keys(messages)
    _check_i18n_module(messages, keys, warn)
    index = dict((k, i) for i, k in enumerate(keys))
    count = [0]

    def sub(name, text, pos):
        if name not in index:
            raise PageBuildError('riga %d: la chiave di traduzione «%s» non esiste in %s '
                                 '(aggiungerla e rilanciare build_i18n.py)'
                                 % (text.count('\n', 0, pos) + 1, name, _short(messages)))
        count[0] += 1
        return str(index[name])

    out = _T_CALL_RE.sub(lambda m: m.group(1) + sub(m.group(3), html, m.start()), html)
    src = out                                     # gli indici sono piu' corti dei nomi: nuove posizioni
    out = _I18N_ATTR_RE.sub(lambda m: m.group(1) + sub(m.group(2), src, m.start()) + m.group(3), src)
    return out, count[0]


def _default_warn(msg):
    sys.stderr.write('build_config_page: avviso: %s\n' % msg)


def _parse_attrs(tag):
    """Attributi di un tag di apertura -> dict minuscolo->valore (senza virgolette)."""
    inner = tag[1:-1]
    if inner.endswith('/'):
        inner = inner[:-1]
    parts = inner.split(None, 1)                       # via il nome del tag
    if len(parts) < 2:
        return {}
    attrs = {}
    for m in _ATTR_RE.finditer(parts[1]):
        val = m.group(2) or ''
        if val[:1] in ('"', "'"):
            val = val[1:-1]
        attrs[m.group(1).lower()] = val
    return attrs


def _is_optional(attrs):
    """data-optional presente e diverso da "0" -> il tag puo' sparire se il file manca."""
    if 'data-optional' not in attrs:
        return False
    return attrs['data-optional'].strip() not in ('0', 'false', 'no')


def _asset_name(ref, attr, entry):
    """Valida il riferimento: solo un nome di file nella stessa cartella."""
    ref = (ref or '').strip()
    if not ref:
        raise PageBuildError('%s: tag con %s vuoto' % (entry, attr))
    if _URL_RE.match(ref):
        raise PageBuildError('%s: %s="%s" e\' un URL: la pagina non puo\' caricare risorse esterne '
                             '(tutto inlinato)' % (entry, attr, ref))
    if '/' in ref or '\\' in ref:
        raise PageBuildError('%s: %s="%s": niente sottocartelle o percorsi, solo file nella stessa '
                             'cartella' % (entry, attr, ref))
    if '?' in ref or '#' in ref:
        raise PageBuildError('%s: %s="%s": niente query o fragment' % (entry, attr, ref))
    if not _NAME_RE.match(ref):
        raise PageBuildError('%s: %s="%s": nome di file non ammesso (lettere, cifre, «.», «-», «_»)'
                             % (entry, attr, ref))
    return ref


def _read_text(path, name):
    """File di testo UTF-8 senza BOM, fine riga normalizzata a \\n (output riproducibile)."""
    try:
        with open(path, 'rb') as fh:
            data = fh.read()
    except OSError as exc:
        raise PageBuildError('impossibile leggere %s: %s' % (name, exc.strerror or exc))
    if data.startswith(b'\xef\xbb\xbf'):
        data = data[3:]
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise PageBuildError('%s non e\' UTF-8 valido (byte %d)' % (name, exc.start))
    return text.replace('\r\n', '\n').replace('\r', '\n')


_JS_LINE_COMMENT = ('//',)


def _continued(line):
    """True se la riga finisce con un numero dispari di backslash: in JS/CSS una stringa (o un
    valore) continua sulla riga dopo, che quindi NON va toccata (revisione S6 #32)."""
    n = 0
    i = len(line) - 1
    while i >= 0 and line[i] == '\\':
        n += 1
        i -= 1
    return (n % 2) == 1


def _strip_text(text, kind):
    """S6 (A4): toglie SOLO le righe di commento intere, le righe vuote e l'indentazione (js/css),
    cosi' la pagina inlinata resta sotto il budget senza un minificatore vero. Sicuro per
    costruzione: in ES5 una stringa attraversa una riga solo con un backslash finale (riga
    seguente emessa verbatim, _continued), quindi una riga che INIZIA con `//` o `/*` e' un
    commento (un commento aperto a meta' riga non si tocca: resta com'era, con le righe che
    seguono). kind: 'js' | 'css' | 'html' (html: solo righe vuote e commenti
    senza toccare commenti e indentazione)."""
    out = []
    inblock = False
    for line in text.split('\n'):
        t = line.strip()
        if out and _continued(out[-1]):
            out.append(line)                 # riga che continua una stringa/valore con '\\' finale: verbatim
            continue
        if inblock:
            if '*/' in t:
                inblock = False
                rest = t.split('*/', 1)[1].strip()
                if rest:
                    out.append(rest)
            continue
        if t == '':
            continue
        if kind == 'html':
            out.append(line.rstrip())        # solo righe vuote: commenti e indentazione restano
            continue
        if kind == 'js' and t.startswith('//'):
            continue
        if t.startswith('/*'):
            if '*/' in t:
                rest = t.split('*/', 1)[1].strip()
                if rest:
                    out.append(rest)
                continue
            inblock = True
            continue
        out.append(t)
    return '\n'.join(out) + '\n'


def _marker_check(text, name, kind):
    """Cio' che troncherebbe il tag inlinato = errore, con la riga. kind = 'script' | 'style'.

    Solo il marcatore dello stesso tipo (M2-bis F5): un «</style>» dentro uno <script> — o un
    «</script>» dentro uno <style> — in HTML non chiude niente, e bloccarlo era un falso positivo.
    Per gli script c'e' in piu' la trappola «<!--» + «<script» (F9).
    """
    m = _MARKER_RE[kind].search(text)
    if m is not None:
        line = text.count('\n', 0, m.start()) + 1
        hint = ("spezzarlo (p.es. '<\\/script>')" if kind == 'script' else
                'spezzarlo (in CSS: «\\00003c/style», o toglierlo dal commento)')
        raise PageBuildError('%s riga %d: contiene «%s», che chiuderebbe il tag inlinato: %s'
                             % (name, line, m.group(0), hint))
    if kind != 'script':
        return
    cpos = text.find(_HTML_COMMENT_OPEN)
    if cpos < 0:
        return
    m = _SCRIPT_OPEN_RE.search(text, cpos)
    if m is None:
        return
    line = text.count('\n', 0, m.start()) + 1
    raise PageBuildError('%s riga %d: «%s» dopo un «<!--» (riga %d): il parser HTML entra in '
                         '«script data double escaped» e il </script> di chiusura non chiude piu\' '
                         'il tag. Spezzarne uno (p.es. \'<\\!--\' oppure \'<\' + \'script\').'
                         % (name, line, m.group(0), text.count('\n', 0, cpos) + 1))


def _attr_warn(attrs, keep, noop_type, what, tail, warn):
    """Avvisa sugli attributi che l'inlining scarta cambiando la semantica del tag (F7)."""
    dropped = []
    for key in sorted(attrs):
        if key in keep:
            continue
        if key == 'type' and attrs[key].strip().lower() in noop_type:
            continue
        dropped.append(key if attrs[key] == '' else '%s="%s"' % (key, attrs[key]))
    if dropped:
        warn('%s: attributi persi nell\'inlining (%s): %s' % (what, ', '.join(dropped), tail))


def _drop_tag(out, html, start, end):
    """Rimuove un tag opzionale: se era da solo sulla riga, sparisce anche la riga. -> nuovo indice."""
    line_start = html.rfind('\n', 0, start) + 1
    indent = html[line_start:start]
    tail = _BLANK_TAIL_RE.match(html, end)
    if tail is not None and indent.strip(' \t') == '':
        if indent and out:
            last = out[-1]
            out[-1] = last[:len(last) - len(indent)]
        return tail.end()
    return end


def page_size_check(html):
    """None se l'HTML inlinato sta nel tetto, altrimenti il messaggio d'errore."""
    n = len(html.encode('utf-8'))
    if n > MAX_BYTES:
        return ('pagina inlinata di %d B (%.1f KB): oltre il tetto di %d B (64 KB). Ridurre CSS/JS '
                '(obiettivo < 60 KB) o togliere qualcosa dalle sorgenti.' % (n, n / 1024.0, MAX_BYTES))
    return None


def _page_lint(html, warn):
    """Avvisi (mai errori) su cio' che la specifica vieta nella pagina: risorse esterne e storage."""
    m = _EXTERNAL_RE.search(html)
    if m is not None:
        line = html.count('\n', 0, m.start()) + 1
        warn('riga %d: riferimento a una risorsa esterna (%s…): la pagina deve essere '
             'autosufficiente' % (line, m.group(0)))
    m = _IMPORT_RE.search(html)
    if m is not None:
        line = html.count('\n', 0, m.start()) + 1
        warn('riga %d: @import nel CSS: non viene inlinato, il file non sarebbe raggiungibile' % line)
    m = _STORAGE_RE.search(html)
    if m is not None:
        line = html.count('\n', 0, m.start()) + 1
        warn('riga %d: uso di %s: nella pagina «data:» l\'origine e\' opaca e l\'accesso lancia '
             'SecurityError' % (line, m.group(0).strip()))


def _order_check(used, warn):
    """L'ordine degli script noti deve essere pipeline -> page_core -> previews -> page."""
    known = [n for n in used if n in SCRIPT_ORDER]
    expected = [n for n in SCRIPT_ORDER if n in known]
    if known != expected:
        warn('ordine degli script diverso da quello previsto (%s): in page.html sono %s'
             % (' -> '.join(expected), ' -> '.join(known)))


def inline_page(dir_path, entry=ENTRY, warn=None, strip=True, messages=None):
    """HTML autosufficiente dalle sorgenti in dir_path. Lancia PageBuildError su ogni errore.
    strip=True (default): righe di commento intere, righe vuote e indentazione tolte dagli asset
    (S6, _strip_text); l'HTML perde solo righe vuote e commenti su una riga.
    messages: messages.json del passo i18n (default: quello accanto alle sorgenti, S10 D35)."""
    warn = warn or _default_warn
    dir_path = os.path.abspath(dir_path)
    if not os.path.isdir(dir_path):
        raise PageBuildError('cartella delle sorgenti inesistente: %s' % dir_path)
    entry_path = os.path.join(dir_path, entry)
    if not os.path.isfile(entry_path):
        raise PageBuildError('manca %s in %s' % (entry, dir_path))
    html = _read_text(entry_path, entry)
    if strip:
        html = _strip_text(html, 'html')

    out = []
    used = []                                   # nomi inlinati, nell'ordine di page.html
    i = 0
    while True:
        m = _SCAN_RE.search(html, i)
        if m is None:
            out.append(html[i:])
            break
        out.append(html[i:m.start()])
        tok = m.group(0)

        if tok.startswith('<!--'):               # commento: intatto
            out.append(tok)
            i = m.end()
            continue

        if not tok.endswith('>'):                # il tag non si chiude: virgoletta aperta (F6a)
            line = html.count('\n', 0, m.start()) + 1
            raise PageBuildError('%s riga %d: tag «%s…» mal formato (una virgoletta non chiusa?): '
                                 'non so dove finisce' % (entry, line, tok))

        tag = tok[1:].split(None, 1)[0].rstrip('>/').lower()

        if tag == 'style':                       # <style> gia' inline: corpo intatto, non scansionato
            close = _CLOSE_STYLE_RE.search(html, m.end())
            if close is None:
                line = html.count('\n', 0, m.start()) + 1
                raise PageBuildError('%s riga %d: <style> senza </style>' % (entry, line))
            out.append(html[m.start():close.end()])
            i = close.end()
            continue

        if tag == 'script':                      # <script …>
            close = _CLOSE_SCRIPT_RE.search(html, m.end())
            if close is None:
                line = html.count('\n', 0, m.start()) + 1
                raise PageBuildError('%s riga %d: <script> senza </script>' % (entry, line))
            attrs = _parse_attrs(tok)
            if 'src' not in attrs:               # script gia' inline: lasciato com'e'
                out.append(html[m.start():close.end()])
                i = close.end()
                continue
            if html[m.end():close.start()].strip():
                raise PageBuildError('%s: <script src="%s"> ha anche del contenuto: usare due tag'
                                     % (entry, attrs['src']))
            name = _asset_name(attrs['src'], 'src', entry)
            path = os.path.join(dir_path, name)
            if not os.path.isfile(path):
                if _is_optional(attrs):
                    i = _drop_tag(out, html, m.start(), close.end())
                    continue
                raise PageBuildError('%s: manca il file %s (<script src="%s">). Se e\' facoltativo '
                                     'aggiungere data-optional="1" al tag.' % (entry, name, name))
            text = _read_text(path, name)
            if strip:
                text = _strip_text(text, 'js')
            _marker_check(text, name, 'script')
            _attr_warn(attrs, _SCRIPT_KEEP, _NOOP_SCRIPT_TYPE, '<script src="%s">' % name,
                       'lo script inlinato e\' classico, bloccante ed eseguito subito', warn)
            out.append('<script>\n' + text.strip('\n') + '\n</script>')
            used.append(name)
            i = close.end()
            continue

        # <link …>
        attrs = _parse_attrs(tok)
        if 'stylesheet' not in attrs.get('rel', '').lower().split():
            out.append(tok)                      # link non-stylesheet: non e' compito nostro
            i = m.end()
            continue
        name = _asset_name(attrs.get('href', ''), 'href', entry)
        path = os.path.join(dir_path, name)
        if not os.path.isfile(path):
            if _is_optional(attrs):
                i = _drop_tag(out, html, m.start(), m.end())
                continue
            raise PageBuildError('%s: manca il file %s (<link rel="stylesheet" href="%s">). Se e\' '
                                 'facoltativo aggiungere data-optional="1" al tag.' % (entry, name, name))
        text = _read_text(path, name)
        if strip:
            text = _strip_text(text, 'css')
        _marker_check(text, name, 'style')
        _attr_warn(attrs, _LINK_KEEP, _NOOP_LINK_TYPE,
                   '<link rel="stylesheet" href="%s">' % name,
                   'il CSS inlinato si applica sempre e senza condizioni', warn)
        out.append('<style>\n' + text.strip('\n') + '\n</style>')
        used.append(name)
        i = m.end()

    result = ''.join(out)
    result, _ = i18n_pass(result, messages or messages_path(dir_path), warn)
    _order_check(used, warn)
    _page_lint(result, warn)
    err = page_size_check(result)
    if err is not None:
        raise PageBuildError(err)
    n = len(result.encode('utf-8'))
    if n > SOFT_BYTES:
        warn('pagina inlinata di %d B (%.1f KB): sopra l\'obiettivo di 60 KB (tetto %d B)'
             % (n, n / 1024.0, MAX_BYTES))
    return result


def render_module(html):
    """Testo di config_page.js: intestazione + module.exports = stringa JSON ASCII."""
    return (HEADER % len(html.encode('utf-8'))
            + 'module.exports = ' + json.dumps(html, ensure_ascii=True) + ';\n')


def build_module(dir_path, entry=ENTRY, warn=None, strip=True, messages=None):
    """(html, testo del modulo) dalle sorgenti."""
    html = inline_page(dir_path, entry=entry, warn=warn, strip=strip, messages=messages)
    return html, render_module(html)


# ------------------------------------------------------------------- CLI ----

def _short(path):
    """Percorso relativo alla cwd se piu' corto (messaggi leggibili, mai un traceback)."""
    try:
        rel = os.path.relpath(path)
    except ValueError:
        return path
    return rel if len(rel) < len(path) else path


def _write_text(path, text):
    d = os.path.dirname(os.path.abspath(path))
    if d and not os.path.isdir(d):
        raise PageBuildError('cartella di destinazione inesistente: %s' % d)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)


def build_parser():
    ap = argparse.ArgumentParser(
        prog='build_config_page.py',
        description="Inlina le sorgenti della config page di Galleria (S6) in un unico HTML e "
                    "genera src/pkjs/config_page.js (module.exports = \"<html>\").",
        epilog="Esempi:\n"
               "  %(prog)s\n"
               "  %(prog)s --check                     # make pagecheck: 0 se e' aggiornato\n"
               "  %(prog)s --html-out /tmp/page.html   # per aprirla nel browser\n"
               "  %(prog)s --selftest\n"
               "Specifica: docs/design/galleria-s6-config-page.md §1 e §7.",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dir', default=DEFAULT_DIR, metavar='DIR',
                    help='cartella delle sorgenti, con page.html (default: %(default)s)')
    ap.add_argument('--out', default=DEFAULT_OUT, metavar='FILE',
                    help='modulo JS da scrivere (default: %(default)s)')
    ap.add_argument('--html-out', metavar='FILE',
                    help="scrive anche l'HTML inlinato (per aprirlo nel browser o darlo a --page)")
    ap.add_argument('--check', action='store_true',
                    help='non scrive nulla: 0 se --out coincide con la rigenerazione, 1 se manca o differisce')
    ap.add_argument('--messages', default=None, metavar='FILE',
                    help='messages.json del passo i18n (default: quello accanto alle sorgenti)')
    ap.add_argument('--no-strip', action='store_true',
                    help='non togliere righe di commento/vuote e indentazione dagli asset (default: le toglie)')
    ap.add_argument('--selftest', action='store_true',
                    help='autotest su una cartella temporanea (inlining, ordine, errori, riproducibilita\'), poi esce')
    return ap


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.selftest:
        return selftest()
    try:
        html, js = build_module(args.dir, strip=not args.no_strip, messages=args.messages)
    except PageBuildError as exc:
        sys.stderr.write('build_config_page: errore: %s\n' % exc)
        # M2-bis F8: l'output NON viene toccato, quindi resta la versione precedente. Senza
        # questa riga un «pebble build» lanciato da solo imbarcherebbe una config page vecchia
        # senza che si veda niente (make pagecheck lo prende, ma solo se lo si esegue).
        if not args.check and os.path.isfile(args.out):
            sys.stderr.write('build_config_page: attenzione: %s NON e\' stato aggiornato e resta '
                             'la versione PRECEDENTE (il .pbw imbarcherebbe una config page '
                             'vecchia): correggere l\'errore e rilanciare.\n' % _short(args.out))
        return 1
    html_b = len(html.encode('utf-8'))
    js_b = len(js.encode('utf-8'))

    if args.check:
        try:
            with open(args.out, 'rb') as fh:
                cur = fh.read()
        except OSError:
            sys.stderr.write('build_config_page --check: manca %s: esegui «python3 '
                             'tools/build_config_page.py»\n' % _short(args.out))
            return 1
        want = js.encode('utf-8')
        if cur != want:
            n = min(len(cur), len(want))
            off = next((k for k in range(n) if cur[k] != want[k]), n)
            sys.stderr.write('build_config_page --check: %s NON e\' aggiornato (%d B su disco, %d B '
                             'rigenerati, prima differenza a %d B): esegui «python3 '
                             'tools/build_config_page.py»\n' % (_short(args.out), len(cur), len(want), off))
            return 1
        print('build_config_page --check: %s aggiornato (HTML %d B, modulo %d B)'
              % (_short(args.out), html_b, js_b))
        return 0

    try:
        _write_text(args.out, js)
        if args.html_out:
            _write_text(args.html_out, html)
    except PageBuildError as exc:
        sys.stderr.write('build_config_page: errore: %s\n' % exc)
        return 1
    except OSError as exc:
        sys.stderr.write('build_config_page: errore: scrittura fallita: %s\n' % exc)
        return 1

    print('build_config_page: HTML inlinato %d B (%.1f KB, tetto %d B) -> %s, modulo %d B'
          % (html_b, html_b / 1024.0, MAX_BYTES, _short(args.out), js_b))
    if args.html_out:
        print('build_config_page: HTML anche in %s' % _short(args.html_out))
    return 0


# -------------------------------------------------------------- selftest ----

_T_HTML = (
    '<!doctype html>\n'
    '<html lang="it">\n'
    '<head>\n'
    '<meta charset="utf-8">\n'
    '<title>Prova città</title>\n'
    '<link rel="icon" href="dati.ico">\n'
    '<link rel="stylesheet" href="page.css">\n'
    '</head>\n'
    '<body>\n'
    '<!-- commento con <script src="finto.js"></script> dentro -->\n'
    '<p id="p">Città — prova</p>\n'
    '<script src="pipeline.js"></script>\n'
    '<script src="page_core.js"></script>\n'
    '<script src="previews.js" data-optional="1"></script>\n'
    '<script src="page.js"></script>\n'
    '<script>window.INLINE = \'<script src="altro.js"><\\/script>\';</script>\n'
    '</body>\n'
    '</html>\n')

_T_FILES = {
    'page.css': '/* città */\n#p { color: #123456; }\n',
    'pipeline.js': 'var GalPipeline = { n: 1 };\n',
    'page_core.js': 'var GalPageCore = { n: 2 };\n',
    'page.js': 'var GalPage = { n: 3 };\n',
}


def _mkpage(dir_path, html=None, files=None, extra=None):
    """Scrive una pagina di prova nella cartella data."""
    if not os.path.isdir(dir_path):
        os.makedirs(dir_path)
    _write_text(os.path.join(dir_path, ENTRY), _T_HTML if html is None else html)
    for name, text in (_T_FILES if files is None else files).items():
        _write_text(os.path.join(dir_path, name), text)
    for name, text in (extra or {}).items():
        _write_text(os.path.join(dir_path, name), text)
    return dir_path


def selftest():
    """Autotest su cartelle temporanee: nessun file del progetto viene toccato."""
    results = []

    def check(label, cond, detail=''):
        results.append((label, bool(cond), detail))

    def fails(label, dir_path, needle):
        """inline_page deve fallire con PageBuildError contenente `needle`."""
        try:
            inline_page(dir_path, warn=lambda _m: None)
        except PageBuildError as exc:
            check(label, needle in str(exc), 'messaggio=%s' % exc)
        except Exception as exc:                                   # pragma: no cover
            check(label, False, 'eccezione sbagliata: %r' % exc)
        else:
            check(label, False, 'nessun errore')

    def cli(argv):
        """main(argv) con stdout/stderr catturati -> (codice, testo)."""
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
                return main(argv), buf.getvalue()
        except SystemExit as exc:
            return (exc.code if isinstance(exc.code, int) else 1), buf.getvalue()
        except Exception as exc:                                   # pragma: no cover
            return 99, buf.getvalue() + repr(exc)

    tmp = tempfile.mkdtemp(prefix='galleria_page_')
    try:
        # --- 1. inlining di base -------------------------------------------------
        base = _mkpage(os.path.join(tmp, 'base'))
        warns = []
        html = inline_page(base, warn=warns.append)
        check('CSS inlinato in <style>', '<style>\n' in html and '</style>' in html, html[:0])
        check('CSS con UTF-8 intatto (strip=False)',
              '<style>\n/* città */' in inline_page(base, warn=lambda _m: None, strip=False))
        check('nessun href/src residuo verso le sorgenti',
              'href="page.css"' not in html and 'src="pipeline.js"' not in html)
        check('link non-stylesheet lasciato com\'e\'', '<link rel="icon" href="dati.ico">' in html)
        check('commento HTML non toccato', '<!-- commento con <script src="finto.js">' in html)
        check('script gia\' inline non toccato', 'window.INLINE' in html and 'altro.js' in html)
        check('contenuto dei tre .js presente',
              'GalPipeline' in html and 'GalPageCore' in html and 'GalPage = { n: 3 }' in html)
        check('nessun avviso sulla pagina di prova', warns == [], repr(warns))
        check('niente ritorni a capo Windows', '\r' not in html)

        # --- 2. ordine conservato ------------------------------------------------
        check('ordine pipeline -> page_core -> page',
              html.index('n: 1') < html.index('n: 2') < html.index('n: 3'))

        # --- 3. data-optional: file assente -> tag rimosso, riga compresa --------
        check('previews.js assente: tag rimosso',
              'previews.js' not in html and 'data-optional' not in html)
        check('nessuna riga vuota lasciata dal tag opzionale',
              '</script>\n<script>\nvar GalPage = { n: 3 }' in html)

        # --- 4. data-optional: file presente -> inlinato -------------------------
        opt = _mkpage(os.path.join(tmp, 'opt'), extra={'previews.js': 'var GalPreviews = {};\n'})
        html_opt = inline_page(opt, warn=lambda _m: None)
        check('previews.js presente: inlinato', 'GalPreviews' in html_opt)
        check('previews inlinato fra page_core e page',
              html_opt.index('n: 2') < html_opt.index('GalPreviews') < html_opt.index('n: 3'))

        # --- 5. file mancante = errore -------------------------------------------
        miss = _mkpage(os.path.join(tmp, 'miss'))
        os.remove(os.path.join(miss, 'page_core.js'))
        fails('file mancante (non opzionale) -> errore', miss, 'page_core.js')
        miss_css = _mkpage(os.path.join(tmp, 'miss_css'))
        os.remove(os.path.join(miss_css, 'page.css'))
        fails('CSS mancante -> errore', miss_css, 'page.css')

        # --- 6. </script> e </style> nel contenuto = errore ----------------------
        bad_js = _mkpage(os.path.join(tmp, 'bad_js'),
                         extra={'page.js': 'var s = "</script>";\n'})
        fails('</script> nel JS -> errore', bad_js, 'page.js')
        bad_js2 = _mkpage(os.path.join(tmp, 'bad_js2'),
                          extra={'page.js': 'var s = "</ SCRIPT >";\n'})
        fails('</ SCRIPT > (spazi/maiuscole) -> errore', bad_js2, 'page.js')
        bad_css = _mkpage(os.path.join(tmp, 'bad_css'),
                          extra={'page.css': '#p::after { content: "</style>"; }\n'})
        fails('</style> nel CSS -> errore', bad_css, 'page.css')
        okesc = _mkpage(os.path.join(tmp, 'okesc'),
                        extra={'page.js': 'var s = "<\\/script>";\n'})
        try:
            check('<\\/script> (gia\' spezzato) ammesso',
                  '<\\/script>' in inline_page(okesc, warn=lambda _m: None))
        except PageBuildError as exc:
            check('<\\/script> (gia\' spezzato) ammesso', False, str(exc))

        # --- 6b. M2-bis F5: il marcatore INCROCIATO e' innocuo, non deve bloccare -
        xs = _mkpage(os.path.join(tmp, 'x_style_in_js'),
                     extra={'page.js': 'var s = "</style>";\n'})
        try:
            check('</style> dentro un .js: ammesso (in HTML non chiude lo <script>)',
                  '"</style>"' in inline_page(xs, warn=lambda _m: None))
        except PageBuildError as exc:
            check('</style> dentro un .js: ammesso', False, str(exc))
        xc = _mkpage(os.path.join(tmp, 'x_script_in_css'),
                     extra={'page.css': '/* </script> */\n#p{}\n'})
        try:
            check('</script> dentro un .css: ammesso (in HTML non chiude lo <style>)',
                  '#p{}' in inline_page(xc, warn=lambda _m: None))
            check('</script> dentro un .css (senza strip): il commento resta',
                  '/* </script> */' in inline_page(xc, warn=lambda _m: None, strip=False))
        except PageBuildError as exc:
            check('</script> dentro un .css: ammesso', False, str(exc))

        # --- 6c. M2-bis F9: «<!--» + «<script» nel JS = tag che non si chiude piu' -
        dbl = _mkpage(os.path.join(tmp, 'dblesc'),
                      extra={'page.js': 'var a = "<!--";\nvar b = "<script>";\n'})
        fails('«<!--» seguito da «<script» nel JS -> errore', dbl, 'double escaped')
        dbl2 = _mkpage(os.path.join(tmp, 'dblesc_ok'),
                       extra={'page.js': 'var b = "<script>";\nvar a = "<!--";\n'})
        try:
            check('«<script» PRIMA di «<!--»: ammesso (non entra in double escaped)',
                  '"<script>"' in inline_page(dbl2, warn=lambda _m: None))
        except PageBuildError as exc:
            check('«<script» PRIMA di «<!--»: ammesso', False, str(exc))

        # --- 7. tetto di 64 KB ----------------------------------------------------
        big = _mkpage(os.path.join(tmp, 'big'),
                      extra={'page.js': 'var big = "' + 'x' * 70000 + '";\n'})
        fails('oltre 64 KB -> errore', big, '64 KB')
        soft = _mkpage(os.path.join(tmp, 'soft'),
                       extra={'page.js': 'var big = "' + 'x' * 62000 + '";\n'})
        w2 = []
        html_soft = inline_page(soft, warn=w2.append)
        check('fra 60 e 64 KB: avviso ma nessun errore',
              len(w2) == 1 and '60 KB' in w2[0] and len(html_soft.encode('utf-8')) > SOFT_BYTES,
              repr(w2))

        # --- 7b. S6/A4: strip delle righe di commento (default) -------------------
        strip_js = ('// riga di commento\n'
                    '/* blocco\n   su piu\' righe */\n'
                    '  var a = "http://x/y"; // commento in coda (resta)\n'
                    '/* una riga */ var b = 2;\n'
                    '\n'
                    '  var c = 1; /* aperto a meta\' riga\n'
                    '  dentro il commento */ var d = 3;\n'
                    '  function f() {\n'
                    '    return "/* non e\' un commento */";\n'
                    '  }\n')
        strip_css = '/* c */\n\n  #p { color: red; } /* coda */\n'
        sp = _mkpage(os.path.join(tmp, 'strip'), extra={'page.js': strip_js, 'page.css': strip_css})
        hs = inline_page(sp, warn=lambda _m: None)
        hn = inline_page(sp, warn=lambda _m: None, strip=False)
        check('strip: righe di commento intere tolte',
              '// riga di commento' not in hs and 'blocco' not in hs and '/* c */' not in hs)
        check('strip: codice e commenti in coda intatti',
              'var a = "http://x/y"; // commento in coda (resta)' in hs and 'var b = 2;' in hs
              and '#p { color: red; } /* coda */' in hs)
        check('strip: commento aperto a meta\' riga non toccato',
              'var c = 1; /* aperto a meta\' riga' in hs and 'dentro il commento */ var d = 3;' in hs)
        check('strip: stringa che sembra un commento intatta',
              'return "/* non e\' un commento */";' in hs)
        check('strip: indentazione tolta e righe vuote via',
              '\n  var a' not in hs and '\n\n' not in hs.split('<script>')[1].split('</script>')[0])
        check('strip=False: tutto intatto', '// riga di commento' in hn and '  var a = ' in hn)
        check('strip: piu\' piccolo di strip=False', len(hs) < len(hn))
        check('strip: idempotente', _strip_text(_strip_text(strip_js, 'js'), 'js') == _strip_text(strip_js, 'js'))
        cont_js = 'var s = "a\\\n// non e un commento";\nvar t = "b\\\\";\n// commento vero\nvar u = 1;\n'
        cont_out = _strip_text(cont_js, 'js')
        check('strip: riga dopo un backslash finale emessa verbatim (#32)',
              '// non e un commento' in cont_out and '// commento vero' not in cont_out and 'var u = 1;' in cont_out,
              repr(cont_out))
        check('strip html: solo righe vuote via (commenti e indentazione tenuti)',
              _strip_text('<p>\n\n  <!-- x -->\n  <b>a</b>\n', 'html') == '<p>\n  <!-- x -->\n  <b>a</b>\n')

        # --- 8. URL / sottocartelle / nomi strani --------------------------------
        url = _mkpage(os.path.join(tmp, 'url'),
                      html=_T_HTML.replace('href="page.css"',
                                           'href="https://cdn.example/x.css"'))
        fails('URL nello stylesheet -> errore', url, 'URL')
        sub = _mkpage(os.path.join(tmp, 'sub'),
                      html=_T_HTML.replace('src="page.js"', 'src="sub/page.js"'))
        fails('sottocartella -> errore', sub, 'sottocartelle')
        qs = _mkpage(os.path.join(tmp, 'qs'),
                     html=_T_HTML.replace('src="page.js"', 'src="page.js?v=2"'))
        fails('query nel src -> errore', qs, 'query')
        empty = _mkpage(os.path.join(tmp, 'empty'),
                        html=_T_HTML.replace('src="page.js"', 'src=""'))
        fails('src vuoto -> errore', empty, 'vuoto')
        both = _mkpage(os.path.join(tmp, 'both'),
                       html=_T_HTML.replace('<script src="page.js"></script>',
                                            '<script src="page.js">var x;</script>'))
        fails('src + contenuto -> errore', both, 'contenuto')
        noclose = _mkpage(os.path.join(tmp, 'noclose'),
                          html='<html><body><script src="page.js"></body></html>\n')
        fails('<script> senza </script> -> errore', noclose, '</script>')

        # --- 8b. M2-bis F4: un file locale che si CHIAMA http… non e' un URL ------
        for fname in ('http2.js', 'https_util.js'):
            hp = _mkpage(os.path.join(tmp, 'name_' + fname.replace('.', '_')),
                         html=_T_HTML.replace('src="page.js"', 'src="%s"' % fname),
                         extra={fname: 'var LOCALE = 4;\n'})
            try:
                check('%s (file locale) inlinato, non scambiato per un URL' % fname,
                      'var LOCALE = 4;' in inline_page(hp, warn=lambda _m: None))
            except PageBuildError as exc:
                check('%s (file locale) inlinato' % fname, False, str(exc))
        for k, ref in enumerate(('data:text/css,a', '//cdn.example/x.js', 'mailto:x@y.z')):
            up = _mkpage(os.path.join(tmp, 'url_%d' % k),
                         html=_T_HTML.replace('src="page.js"', 'src="%s"' % ref))
            fails('src="%s" -> errore (non e\' un file locale)' % ref, up, 'URL')

        # --- 8c. M2-bis F6a: «>» dentro il valore di un attributo -----------------
        gt = _mkpage(os.path.join(tmp, 'attr_gt'),
                     html=_T_HTML.replace('<script src="page.js">',
                                          '<script src="page.js" data-t="a>b">'))
        w_gt = []
        try:
            html_gt = inline_page(gt, warn=w_gt.append)
            check('attributo con «>» nel valore: tag riconosciuto e inlinato',
                  'var GalPage = { n: 3 }' in html_gt and 'data-t' not in html_gt, repr(w_gt))
        except PageBuildError as exc:
            check('attributo con «>» nel valore: tag riconosciuto e inlinato', False, str(exc))
        badq = _mkpage(os.path.join(tmp, 'badquote'),
                       html='<html><body>\n<script src="page.js></script>\n</body></html>\n')
        fails('virgoletta non chiusa nel tag -> errore (non un inlining sbagliato)',
              badq, 'mal formato')

        # --- 8d. M2-bis F6b: il corpo di uno <style> inline non si scansiona ------
        instyle = _mkpage(os.path.join(tmp, 'in_style'),
                          html=_T_HTML.replace('<p id="p">',
                                               '<style>/* <link rel="stylesheet" href="manca.css"> */\n'
                                               '#q { color: red; }</style>\n<p id="p">'))
        try:
            html_is = inline_page(instyle, warn=lambda _m: None)
            check('<link> dentro un blocco <style> inline: lasciato com\'e\'',
                  '/* <link rel="stylesheet" href="manca.css"> */' in html_is)
        except PageBuildError as exc:
            check('<link> dentro un blocco <style> inline: lasciato com\'e\'', False, str(exc))
        nostyle = _mkpage(os.path.join(tmp, 'nostyle'),
                          html='<html><head><style>#p{}</head><body></body></html>\n')
        fails('<style> senza </style> -> errore', nostyle, '</style>')

        # --- 8e. M2-bis F7: attributi persi nell'inlining -> avviso ---------------
        att = _mkpage(os.path.join(tmp, 'attrs'),
                      html=_T_HTML.replace('<script src="page.js">',
                                           '<script type="module" defer src="page.js">')
                                  .replace('<link rel="stylesheet" href="page.css">',
                                           '<link rel="stylesheet" media="print" href="page.css">'))
        w_att = []
        inline_page(att, warn=w_att.append)
        check('type="module"/defer e media="print" -> due avvisi (nessun errore)',
              len(w_att) == 2
              and 'media="print"' in w_att[0] and 'href="page.css"' in w_att[0]
              and 'type="module"' in w_att[1] and 'defer' in w_att[1],
              repr(w_att))
        noop = _mkpage(os.path.join(tmp, 'attrs_noop'),
                       html=_T_HTML.replace('<script src="page.js">',
                                            '<script type="text/javascript" src="page.js">')
                                   .replace('<link rel="stylesheet" href="page.css">',
                                            '<link rel="stylesheet" type="text/css" href="page.css">'))
        w_noop = []
        inline_page(noop, warn=w_noop.append)
        check('type="text/javascript"/"text/css": nessun avviso (non cambiano nulla)',
              w_noop == [], repr(w_noop))

        # --- 9. cartella o page.html assenti -------------------------------------
        fails('cartella inesistente -> errore', os.path.join(tmp, 'non_esiste'), 'inesistente')
        nohtml = os.path.join(tmp, 'nohtml')
        os.makedirs(nohtml)
        fails('page.html assente -> errore', nohtml, 'page.html')

        # --- 10. ordine sbagliato -> avviso, non errore --------------------------
        swapped = _mkpage(os.path.join(tmp, 'swapped'),
                          html=_T_HTML.replace('<script src="pipeline.js"></script>\n', '')
                                      .replace('<script src="page.js"></script>',
                                               '<script src="page.js"></script>\n'
                                               '<script src="pipeline.js"></script>'))
        w3 = []
        inline_page(swapped, warn=w3.append)
        check('ordine sbagliato -> avviso (non errore)',
              len(w3) == 1 and 'ordine' in w3[0], repr(w3))

        # --- 10b. avvisi non fatali: risorsa esterna, @import, storage ----------
        ext = _mkpage(os.path.join(tmp, 'ext'),
                      html=_T_HTML.replace('<p id="p">', '<img src="https://x.example/a.png"><p id="p">'),
                      extra={'page.css': '@import url(altro.css);\n#p{}\n',
                             'page.js': 'try { localStorage.getItem("x"); } catch (e) {}\n'})
        w4 = []
        inline_page(ext, warn=w4.append)
        check('avvisi: risorsa esterna + @import + localStorage (nessun errore)',
              len(w4) == 3 and 'esterna' in w4[0] and '@import' in w4[1] and 'SecurityError' in w4[2],
              repr(w4))
        w5 = []
        inline_page(base, warn=w5.append)
        check('pagina pulita: nessun avviso di lint', w5 == [], repr(w5))

        # --- 10c. passo i18n (S10, D35): chiavi -> indici ------------------------
        msg = os.path.join(tmp, 'messages.json')
        _write_text(msg, '{\n  "_note": "commento",\n'
                         '  "uno": { "it": "Uno", "en": "One", "de": "Eins", "fr": "Un" },\n'
                         '  "due": { "it": "Due {0}", "en": "Two {0}", "de": "Zwei {0}", "fr": "Deux {0}" }\n}\n')
        i18n_dir = _mkpage(os.path.join(tmp, 'i18n'),
                           html=_T_HTML.replace('<p id="p">Città — prova</p>',
                                                '<p id="p" data-i18n="uno" data-i18n-title="due"></p>'),
                           extra={'page.js': 'var GalPage = { a: T(\'uno\'), b: T("due", 1), c: obj.T(\'uno\') };\n'})
        hi = inline_page(i18n_dir, warn=lambda _m: None, messages=msg)
        check('T(\'chiave\') -> indice', 'a: T(0)' in hi, hi[hi.find('GalPage'):][:70])
        check('T("chiave") -> indice (anche doppi apici)', 'b: T(1, 1)' in hi)
        check('obj.T(\'x\') non viene toccato', "c: obj.T('uno')" in hi)
        check('data-i18n -> indice', 'data-i18n="0"' in hi and 'data-i18n-title="1"' in hi)
        check('nessun nome di chiave rimasto nel markup ne\' nelle chiamate a T',
              "a: T('uno'" not in hi and 'data-i18n="uno"' not in hi and 'data-i18n-title="due"' not in hi)
        try:
            inline_page(_mkpage(os.path.join(tmp, 'i18n_bad'),
                                extra={'page.js': 'var x = T(\'manca\');\n'}),
                        warn=lambda _m: None, messages=msg)
            check('chiave inesistente -> errore', False, 'nessun errore')
        except PageBuildError as exc:
            check('chiave inesistente -> errore', 'manca' in str(exc) and 'non esiste' in str(exc), str(exc))
        try:
            inline_page(i18n_dir, warn=lambda _m: None, messages=os.path.join(tmp, 'nessun_messaggio.json'))
            check('messages.json assente con chiavi in pagina -> errore', False, 'nessun errore')
        except PageBuildError as exc:
            check('messages.json assente con chiavi in pagina -> errore', 'manca' in str(exc), str(exc))
        check('pagina senza chiavi: messages.json non serve',
              isinstance(inline_page(base, warn=lambda _m: None,
                                     messages=os.path.join(tmp, 'nessun_messaggio.json')), str))

        # --- 11. riproducibilita' (anche con CRLF e BOM nelle sorgenti) ----------
        a = inline_page(base, warn=lambda _m: None)
        b = inline_page(base, warn=lambda _m: None)
        check('due esecuzioni -> stesso HTML', a == b)
        check('due esecuzioni -> stesso modulo byte a byte', render_module(a) == render_module(b))
        crlf = _mkpage(os.path.join(tmp, 'crlf'))
        for name in (ENTRY, 'page.css', 'pipeline.js', 'page_core.js', 'page.js'):
            p = os.path.join(crlf, name)
            with open(p, 'rb') as fh:
                raw = fh.read()
            with open(p, 'wb') as fh:
                fh.write(b'\xef\xbb\xbf' + raw.replace(b'\n', b'\r\n'))
        check('CRLF + BOM nelle sorgenti -> stesso output di LF',
              inline_page(crlf, warn=lambda _m: None) == a)

        # --- 12. modulo JS: ASCII, JSON valido, round trip -----------------------
        js = render_module(a)
        check('intestazione con la dimensione dell\'HTML',
              js.startswith('/* GENERATO da tools/build_config_page.py (S6)')
              and ('Dimensione HTML: %d B' % len(a.encode('utf-8'))) in js.splitlines()[0])
        check('modulo tutto ASCII su una riga di export',
              all(ord(c) < 128 for c in js) and js.count('\n') == 2)
        body = js.split('module.exports = ', 1)[1].rstrip('\n').rstrip(';')
        check('round trip JSON -> HTML identico (accenti compresi)', json.loads(body) == a)
        check('nessuna data nel modulo', not re.search(r'20\d\d-\d\d-\d\d', js))

        # --- 13. CLI: scrittura, --html-out, --check -----------------------------
        out_js = os.path.join(tmp, 'out', 'config_page.js')
        os.makedirs(os.path.dirname(out_js))
        out_html = os.path.join(tmp, 'out', 'page_inline.html')
        code, msg = cli(['--dir', base, '--out', out_js, '--html-out', out_html])
        check('CLI scrive il modulo', code == 0 and os.path.isfile(out_js), 'code=%s %s' % (code, msg))
        with open(out_js, 'rb') as fh:
            first = fh.read()
        check('CLI: file identico a render_module', first == render_module(a).encode('utf-8'))
        with io.open(out_html, encoding='utf-8') as fh:
            check('--html-out scrive l\'HTML inlinato', fh.read() == a)
        check('stampa le dimensioni', 'HTML inlinato' in msg and 'modulo' in msg, msg.strip())
        code, msg = cli(['--dir', base, '--out', out_js])
        with open(out_js, 'rb') as fh:
            second = fh.read()
        check('due esecuzioni della CLI -> file identico', first == second)
        code, msg = cli(['--dir', base, '--out', out_js, '--check'])
        check('--check su file aggiornato -> 0', code == 0 and 'aggiornato' in msg,
              'code=%s %s' % (code, msg.strip()))
        with io.open(out_js, 'a', encoding='utf-8') as fh:
            fh.write('/* toccato a mano */\n')
        code, msg = cli(['--dir', base, '--out', out_js, '--check'])
        check('--check su file diverso -> 1 con messaggio',
              code == 1 and 'NON e\'' in msg, 'code=%s %s' % (code, msg.strip()))
        code, msg = cli(['--dir', base, '--out', os.path.join(tmp, 'out', 'manca.js'), '--check'])
        check('--check su file assente -> 1 con messaggio', code == 1 and 'manca' in msg,
              'code=%s %s' % (code, msg.strip()))
        code, msg = cli(['--dir', os.path.join(tmp, 'non_esiste'), '--out', out_js])
        check('CLI su cartella inesistente -> 1, messaggio senza traceback',
              code == 1 and 'errore' in msg and 'Traceback' not in msg, 'code=%s %s' % (code, msg.strip()))
        code, msg = cli(['--dir', bad_js, '--out', out_js])
        check('CLI su </script> nel JS -> 1, messaggio chiaro',
              code == 1 and 'page.js' in msg and 'Traceback' not in msg, 'code=%s %s' % (code, msg.strip()))
        code, msg = cli(['--dir', base, '--out', os.path.join(tmp, 'non_esiste', 'x.js')])
        check('CLI: cartella di destinazione assente -> 1', code == 1 and 'errore' in msg,
              'code=%s %s' % (code, msg.strip()))

        # --- 13b. M2-bis F8: build fallita -> l'--out resta il VECCHIO, e si dice -
        stale = os.path.join(tmp, 'out', 'stale.js')
        code, _msg = cli(['--dir', base, '--out', stale])
        with open(stale, 'rb') as fh:
            before = fh.read()
        code, msg = cli(['--dir', big, '--out', stale])          # oltre 64 KB: errore
        with open(stale, 'rb') as fh:
            after = fh.read()
        check('CLI fallita: l\'output precedente NON viene toccato', code == 1 and before == after,
              'code=%s' % code)
        check('CLI fallita con --out esistente: avvisa che resta la versione precedente',
              'PRECEDENTE' in msg, msg.strip())
        code, msg = cli(['--dir', big, '--out', os.path.join(tmp, 'out', 'mai_scritto.js')])
        check('CLI fallita senza --out sul disco: nessun avviso di file vecchio',
              code == 1 and 'PRECEDENTE' not in msg, 'code=%s %s' % (code, msg.strip()))
        code, msg = cli(['--dir', big, '--out', stale, '--check'])
        check('--check su sorgenti che non si inlinano -> 1 senza l\'avviso del file vecchio',
              code == 1 and 'PRECEDENTE' not in msg, 'code=%s %s' % (code, msg.strip()))

        # --- 14. page_size_check -------------------------------------------------
        check('page_size_check: None sotto il tetto', page_size_check('x' * MAX_BYTES) is None)
        check('page_size_check: messaggio sopra il tetto',
              isinstance(page_size_check('x' * (MAX_BYTES + 1)), str))

    except Exception as exc:                                       # pragma: no cover
        import traceback
        traceback.print_exc()
        check('selftest senza eccezioni', False, str(exc))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    ok = sum(1 for _l, good, _d in results if good)
    bad = len(results) - ok
    for label, good, detail in results:
        if not good:
            print('FALLITO  %s%s' % (label, ('  [%s]' % detail) if detail else ''))
    print('build_config_page selftest: %d ok, %d falliti' % (ok, bad))
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
