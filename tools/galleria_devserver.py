#!/usr/bin/env python3
r"""galleria_devserver.py — dev server della watchface Galleria (S5b).

In emulatore (`Pebble.platform === 'pypkjs'`) NON c'è la config page del telefono: questo
server locale ne fa le veci. Converte le foto passate con `--album` nei due formati raw di
`apps/galleria/src/c/photo_codec.h` (via `tools/photo_prep.py`), le tiene in memoria ed
espone al PKJS (`src/pkjs/devserver.js`) lo stato completo dell'album — impostazioni,
ordine di rotazione, foto con `url` al posto dei byte — più una pagina di prova HTML per
scegliere foto, ordine e impostazioni dal browser del PC.

Specifica: `docs/design/galleria.md` §5.1 ("Modalità dev") e §6 ("Emulatore"); documentazione
d'uso in `tools/README.md` §11.

Endpoint (JSON UTF-8, `Cache-Control: no-store`, CORS `*`):

    GET  /                      302 -> /config.html
    GET  /config.html           pagina di prova, il file di --page, o la config page vera
                                inlinata da --page-dir (S6, build_config_page.py)
    GET  /state.json            modalita' pool (--album): payload completo {v, full, seq,
                                settings, order, deleted, photos: [una voce per FORMATO],
                                hooks: {scenario}};  modalita' relay (S6, senza --album):
                                {v, seq, settings?, hooks} SENZA `full` (delta vuoto: il
                                PKJS non cancella niente)
    GET  /save.json             payload dell'ultimo Save della config page vera (senza
                                `full`); prima di quello, alias di /state.json
    GET  /pool.json             foto disponibili (--album) con anteprime
    GET  /photo/<k>.raw6|raw1   byte dello slot k (?b64=1 -> base64url senza padding, testo)
    GET  /preview/<i>.png       anteprima x2 della foto i del pool (?flint=1 -> versione B/N)
    POST /save  =  POST /state.json    due corpi diversi sullo stesso endpoint:
                                pagina di prova {v?: 1, settings?, order?,
                                photos?: [{slot, src}], scenario?} -> stato sostituito;
                                config page vera (S6, riconosciuta da `deleted`; anche un
                                {v, settings, order} senza `deleted` viene trattato come suo
                                e respinto con 400, invece di passare per meta' — M2-bis F2)
                                {v, settings (10), order, deleted, photos?: [{slot,
                                photo_id, fmt, len, crc, data, name, thumb?}]} -> tenuto
                                da parte per /save.json. In tutti e due: seq+1,
                                {"ok": true, "seq": N} (campo sconosciuto a QUALSIASI
                                livello: 400)

Uso:

    # due foto, slot 0 e 1, rotazione ogni 5 minuti
    python3 tools/galleria_devserver.py --album foto1.jpg foto2.png \
            --settings '{"interval_min": 5, "layout": 1}'

    # slot e ordine espliciti, guasto "crc" iniettato nel motore di sync
    python3 tools/galleria_devserver.py --album a.jpg b.jpg c.jpg \
            --slots 3,7,11 --order 11,3,7 --scenario crc

    # dall'altro terminale: apre la pagina nel browser con ?return_to=...
    pebble emu-app-config --emulator emery

    # S6: config page vera inlinata a ogni richiesta, nessun album (modalita' relay)
    python3 tools/galleria_devserver.py --page-dir apps/galleria/src/pkjs/config

    # autotest completo (nessuna rete esterna, immagini sintetiche)
    python3 tools/galleria_devserver.py --selftest

Solo stdlib (Pillow serve unicamente al `--selftest`, per generare le immagini di prova, e a
`photo_prep.py`). Nessuno stato su disco: chiudendo il server si perde tutto (è voluto — il
percorso "riavvio senza dev server" è quello del telefono).
"""

import argparse
import base64
import contextlib
import http.client
import io
import json
import os
import re
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import zlib

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# ---------------------------------------------------------------- costanti ---

HERE = os.path.dirname(os.path.abspath(__file__))              # tools/
REPO_DIR = os.path.dirname(HERE)                               # radice del repo
PHOTO_PREP = os.path.join(HERE, 'photo_prep.py')

RAW6_BYTES = 34200          # photo_codec.h: 150 B/riga x 228 righe (emery 200x228)
RAW1_BYTES = 3024           # photo_codec.h:  18 B/riga x 168 righe (flint 144x168)
MAX_SLOTS = 12              # design §4.2: 12 slot foto

FMT_RAW6 = 1                # gal_types.h: GAL_FMT_RAW6
FMT_RAW1 = 2                # gal_types.h: GAL_FMT_RAW1

SCENARIOS = ('photo', 'seq', 'dup', 'crc', 'interrupt', 'none')

# Campi ammessi nel corpo di POST /save. La validazione e' severa allo stesso modo dentro
# `settings` e al livello superiore: un campo sconosciuto (refuso della pagina) e' un 400,
# non un save silenziosamente a meta'.
SAVE_ALLOWED = ('v', 'settings', 'order', 'photos', 'scenario')
PHOTO_ENTRY_ALLOWED = ('slot', 'src')        # chiavi di una voce di `photos`

# Corpo del POST /save della CONFIG PAGE vera (S6, docs/design/galleria-s6-config-page.md §3).
# Si riconosce da `deleted`, che la pagina manda sempre (anche vuoto) e la pagina di prova non
# manda mai. `photos` puo' mancare (nessuna foto nuova); gli altri quattro ci sono sempre.
PAGE_SAVE_REQUIRED = ('v', 'settings', 'order', 'deleted')
PAGE_SAVE_ALLOWED = PAGE_SAVE_REQUIRED + ('photos',)
PAGE_PHOTO_REQUIRED = ('slot', 'photo_id', 'fmt', 'len', 'crc', 'data', 'name')
PAGE_PHOTO_ALLOWED = PAGE_PHOTO_REQUIRED + ('thumb',)
MAX_NAME_CHARS = 64          # §3: nome del file troncato dalla pagina (album.js tronca comunque)
MAX_THUMB_CHARS = 6000       # §4.6: oltre, la pagina omette la miniatura
FMT_LEN = {FMT_RAW6: RAW6_BYTES, FMT_RAW1: RAW1_BYTES}

# Impostazioni: nome, valori ammessi, descrizione dell'intervallo, default.
# Stessi intervalli di settings_validate() in apps/galleria/src/c/settings.c e stessi default
# di settings_set_defaults(). L'ordine è quello dei campi di GalSettings (design §4.1).
SETTINGS_SPEC = (
    ('layout',       tuple(range(0, 2)),                     '0..1',    0),
    ('font',         tuple(range(0, 4)),                     '0..3',    0),
    ('clock_mode',   tuple(range(0, 3)),                     '0..2',    0),
    ('leading_zero', tuple(range(0, 3)),                     '0..2',    0),
    ('text_color',   tuple(range(0, 5)),                     '0..4',    0),
    ('outline',      tuple(range(0, 3)),                     '0..2',    0),
    ('interval_min', (0, 5, 15, 30, 60, 180, 1440),          '0/5/15/30/60/180/1440', 30),
    ('order',        tuple(range(0, 2)),                     '0..1',    0),
    ('shake_next',   tuple(range(0, 2)),                     '0..1',    1),
    ('info_row',     tuple(range(0, 16)),                    '0..15',  15),
)
SETTINGS_ALLOWED = {name: values for name, values, _d, _v in SETTINGS_SPEC}
SETTINGS_RANGE_TEXT = {name: desc for name, _values, desc, _v in SETTINGS_SPEC}
SETTINGS_DEFAULTS = {name: default for name, _values, _d, default in SETTINGS_SPEC}

B64URL_OK = re.compile(r'^[A-Za-z0-9_-]*$')
# Come sopra ma senza la scappatoia di `$`, che accetta anche un '\n' finale: i 45.600
# caratteri di una foto arrivano da un JSON, non da una riga di testo.
B64URL_STRICT = re.compile(r'\A[A-Za-z0-9_-]*\Z')
# Numeri canonici: `/photo/00.raw6` non e' un URL che il server generi mai (404), come
# per un percorso qualsiasi. Il PKJS e la pagina usano solo quelli di state.json/pool.json.
RE_PHOTO = re.compile(r'^/photo/(0|[1-9]\d{0,2})\.(raw6|raw1)$')
RE_PREVIEW = re.compile(r'^/preview/(0|[1-9]\d{0,3})\.png$')


# ----------------------------------------------------------------- utilità ---

def b64url(blob):
    """base64url SENZA padding (alfabeto A-Z a-z 0-9 '-' '_'), come nel payload del PKJS."""
    return base64.urlsafe_b64encode(blob).decode('ascii').rstrip('=')


def b64url_decode(text):
    """Inverso di b64url(): rimette il padding e decodifica."""
    return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))


def query_flag(query, name):
    """`?x=1|true|yes|on` e anche `?x` da solo (parse_qs con keep_blank_values) = vero."""
    if name not in query:
        return False
    value = (query[name][0] or '1').strip().lower()
    return value in ('1', 'true', 'yes', 'on')


def default_settings():
    return dict(SETTINGS_DEFAULTS)


def validate_settings_patch(patch):
    """Valida un dizionario PARZIALE di impostazioni.

    Ritorna (dict_valido, None) oppure (None, 'messaggio d'errore'). Gli intervalli sono
    quelli di settings_validate(): un valore fuori intervallo è un errore (non viene
    silenziosamente sostituito dal default: qui vogliamo accorgercene subito).
    """
    if not isinstance(patch, dict):
        return None, 'settings: serve un oggetto JSON'
    out = {}
    for key, value in patch.items():
        if key not in SETTINGS_ALLOWED:
            return None, 'settings: campo sconosciuto "%s"' % key
        if isinstance(value, bool) or not isinstance(value, int):
            return None, 'settings.%s: serve un intero' % key
        if value not in SETTINGS_ALLOWED[key]:
            return None, 'settings.%s: %d fuori intervallo (%s)' % (key, value, SETTINGS_RANGE_TEXT[key])
        out[key] = value
    return out, None


def normalize_order(order, slots):
    """Ordine di rotazione ripulito: solo slot dell'album, senza doppioni, mancanti in coda.

    `slots` = slot con una foto. Gli slot sconosciuti (o ripetuti) vengono scartati, quelli
    dell'album che mancano si accodano in ordine crescente — così l'ordine è sempre una
    permutazione degli slot pieni, che è ciò che ALBUM_ORDER si aspetta (design §5).
    """
    present = set(slots)
    seen = set()
    out = []
    for slot in order:
        if isinstance(slot, bool) or not isinstance(slot, int):
            continue
        if slot in present and slot not in seen:
            seen.add(slot)
            out.append(slot)
    out.extend(sorted(present - seen))
    return out


def parse_int_list(text, what):
    """"3,7,11" -> [3, 7, 11]. ValueError con messaggio in italiano se non torna.

    Un pezzo vuoto ("0,,1", "3,") e' un ERRORE, non viene saltato in silenzio: sulla riga
    di comando un refuso va segnalato, non corretto di nascosto (il ripulisci-e-tira-avanti
    vale solo per l'`order` che arriva dal POST, dove e' comportamento documentato).
    Il messaggio lo stampa `ap.error()` in main(), cosi' TUTTI gli errori di riga di comando
    escono allo stesso modo (usage + uscita 2).
    """
    values = []
    for piece in text.split(','):
        piece = piece.strip()
        if not piece:
            raise ValueError('%s: elenco malformato ("%s")' % (what, text))
        if not re.match(r'^\d+$', piece):
            raise ValueError('%s: "%s" non è un numero intero' % (what, piece))
        values.append(int(piece))
    return values


def port_arg(text):
    """--port: intero 0..65535 (0 = porta libera scelta dal sistema).

    Senza questo controllo un refuso come `--port 87653` arriverebbe fino a socket.bind(),
    che lancia OverflowError (non OSError): traceback nudo invece di un messaggio.
    """
    try:
        value = int(text, 10)
    except ValueError:
        raise argparse.ArgumentTypeError('"%s" non è un numero intero' % text)
    if not 0 <= value <= 65535:
        raise argparse.ArgumentTypeError(
            '%d fuori intervallo (0..65535; 0 = porta libera)' % value)
    return value


# ------------------------------------------- config page vera (S6, --page-dir) ---

class PageInlineError(Exception):
    """Inlining della config page fallito: messaggio in italiano, una riga sola."""


_PAGE_BUILDER = None                 # tools/build_config_page.py, importato alla prima pagina
_PAGE_BUILDER_WARN = None            # True se inline_page() accetta warn=...


def _load_page_builder():
    """Importa `build_config_page` dal `tools/` accanto. Import PIGRO: il dev server di S5b
    funziona anche senza quel file (e un suo errore di sintassi non impedisce di avviarlo)."""
    global _PAGE_BUILDER, _PAGE_BUILDER_WARN
    if _PAGE_BUILDER is None:
        if HERE not in sys.path:
            sys.path.insert(0, HERE)
        import build_config_page      # noqa: E402 (pigro apposta)
        _PAGE_BUILDER = build_config_page
        try:
            import inspect
            _PAGE_BUILDER_WARN = 'warn' in inspect.signature(build_config_page.inline_page).parameters
        except (ImportError, TypeError, ValueError):        # pragma: no cover
            _PAGE_BUILDER_WARN = False
    return _PAGE_BUILDER


def inline_page_dir(dir_path, warn=None):
    """HTML della config page inlinato da `dir_path` (bytes UTF-8).

    Lancia PageInlineError con un messaggio in chiaro su una riga: il handler lo mette
    nel corpo del 500, `--dump-page` su stderr. Mai un traceback.
    """
    try:
        mod = _load_page_builder()
    except Exception as exc:
        raise PageInlineError('build_config_page.py non importabile da %s (%s: %s)'
                              % (HERE, exc.__class__.__name__, exc))
    fn = getattr(mod, 'inline_page', None)
    if fn is None:
        raise PageInlineError('build_config_page.py non espone inline_page(dir): tool troppo vecchio?')
    build_error = getattr(mod, 'PageBuildError', None)
    try:
        html = fn(dir_path, warn=warn) if (warn is not None and _PAGE_BUILDER_WARN) else fn(dir_path)
    except Exception as exc:
        if build_error is not None and isinstance(exc, build_error):
            raise PageInlineError(str(exc))                  # gia' in italiano, una riga
        raise PageInlineError('%s: %s' % (exc.__class__.__name__, exc))
    if isinstance(html, bytes):
        return html
    if not isinstance(html, str):                            # pragma: no cover
        raise PageInlineError('inline_page() ha reso %s invece di una stringa'
                              % type(html).__name__)
    return html.encode('utf-8')


# ------------------------------- payload della config page vera (POST /save) ---

def _page_int(value, label):
    """None se `value` e' un intero JSON (True/False esclusi), altrimenti il messaggio."""
    if isinstance(value, bool) or not isinstance(value, int):
        return '%s: serve un intero' % label
    return None


def _bad_surrogate(value, label):
    """Messaggio se `value` non e' codificabile in UTF-8, altrimenti None.

    `json.loads` accetta gli escape `\\udXXX` isolati e ne fa surrogati spaiati: stringhe
    Python legali che pero' **non** sono testo UTF-8 (una meta' di emoji persa da un `slice`
    della pagina). Passavano il validatore e avvelenavano il payload tenuto in memoria
    (finding M7 #3). Qui si fermano, con 400 e un messaggio che dice cosa e' successo.
    """
    try:
        value.encode('utf-8')
    except UnicodeEncodeError:
        return ('%s: contiene un surrogato spaiato (\\udXXX, metà di un carattere non BMP): '
                'non è testo UTF-8 valido' % label)
    return None


def _bad_version(value):
    """Messaggio se `v` non è esattamente l'intero 1, altrimenti None.

    `True` vale 1 in Python e `1.0 == 1`: due refusi che non devono passare per "versione 1"
    (M2-bis F3). Tutti gli altri interi passano da `_page_int`, che i float li rifiuta: `v`
    era l'unica maglia larga di un validatore dichiarato severo a ogni livello.
    """
    if isinstance(value, bool) or not isinstance(value, int) or value != 1:
        return 'v: versione %s sconosciuta (attesa 1)' % json.dumps(value)
    return None


def looks_like_page_save(body):
    """Vero se il corpo di POST /save è (o vuole essere) quello della config page vera (S6 §3).

    Il discriminante della specifica è `deleted`, che la pagina manda sempre — anche vuoto —
    e che la pagina di prova non manda mai. Se però `deleted` mancasse per un refuso della
    pagina, il corpo scivolerebbe nel validatore della pagina di prova, che con {v, settings,
    order} e nessuna foto lo accetta con 200 e azzera `last_payload`: /save.json torna al
    delta vuoto della relay e la Save è persa senza un errore (M2-bis F2). Riconoscendolo
    anche così, `validate_page_payload` risponde 400 «manca "deleted"».

    Restano alla pagina di prova i corpi con `scenario` (che la config page non manda mai) e
    quelli con `photos: [{slot, src}]` (indici del pool, non byte).
    """
    if not isinstance(body, dict):
        return False
    if 'deleted' in body:
        return True
    if 'scenario' in body:
        return False
    if not ('v' in body and 'settings' in body and 'order' in body):
        return False
    photos = body.get('photos')
    if isinstance(photos, list) and photos:
        first = photos[0]
        if isinstance(first, dict) and 'src' in first:
            return False
    return True


def _page_slot_list(value, label):
    """Lista di slot 0..11 senza doppioni -> (lista, None) oppure (None, 'errore')."""
    if not isinstance(value, list):
        return None, '%s: serve una lista di slot' % label
    seen = set()
    for item in value:
        err = _page_int(item, label)
        if err:
            return None, err
        if item < 0 or item >= MAX_SLOTS:
            return None, '%s: slot %d fuori intervallo (0..%d)' % (label, item, MAX_SLOTS - 1)
        if item in seen:
            return None, '%s: slot %d ripetuto' % (label, item)
        seen.add(item)
    return list(value), None


def _page_photo(entry):
    """Valida una voce di `photos` (S6 §3). Ritorna None oppure il messaggio d'errore."""
    if not isinstance(entry, dict):
        return 'photos: ogni voce è un oggetto'
    unknown = sorted(k for k in entry if k not in PAGE_PHOTO_ALLOWED)
    if unknown:
        return 'photos: campo sconosciuto "%s" (ammessi: %s)' % (
            unknown[0], ', '.join(PAGE_PHOTO_ALLOWED))
    for label in PAGE_PHOTO_REQUIRED:
        if label not in entry:
            return 'photos: manca "%s" in una voce' % label
    for label in ('slot', 'photo_id', 'fmt', 'len', 'crc'):
        err = _page_int(entry[label], 'photos.%s' % label)
        if err:
            return err

    slot = entry['slot']
    if slot < 0 or slot >= MAX_SLOTS:
        return 'photos.slot: %d fuori intervallo (0..%d)' % (slot, MAX_SLOTS - 1)
    if not 1 <= entry['photo_id'] <= 0x7FFFFFFF:
        return 'photos.photo_id: %d fuori intervallo (1..2^31-1)' % entry['photo_id']
    fmt = entry['fmt']
    if fmt not in FMT_LEN:
        return 'photos.fmt: %d sconosciuto (1 = raw6 emery, 2 = raw1 flint)' % fmt
    if entry['len'] != FMT_LEN[fmt]:
        return 'photos.len: %d invece di %d (fmt %d)' % (entry['len'], FMT_LEN[fmt], fmt)
    if not 0 <= entry['crc'] <= 0xFFFFFFFF:
        return 'photos.crc: %d fuori intervallo (0..2^32-1)' % entry['crc']

    data = entry['data']
    if not isinstance(data, str):
        return 'photos.data: serve una stringa base64url'
    want = -(-entry['len'] * 4 // 3)                 # ceil(len * 4 / 3), senza padding
    if len(data) != want:
        return 'photos.data: %d caratteri invece di %d (%d byte in base64url senza padding)' % (
            len(data), want, entry['len'])
    if not B64URL_STRICT.match(data):
        return 'photos.data: fuori dall\'alfabeto base64url (A-Z a-z 0-9 - _, senza padding)'
    try:
        raw = b64url_decode(data)
    except (ValueError, TypeError) as exc:
        return 'photos.data: base64url non decodificabile (%s)' % exc
    if len(raw) != entry['len']:
        return 'photos.data: decodifica a %d byte invece di %d' % (len(raw), entry['len'])
    got = zlib.crc32(raw) & 0xFFFFFFFF
    if got != entry['crc']:
        return 'photos.crc: dichiarato %08X, calcolato %08X' % (entry['crc'], got)

    if not isinstance(entry['name'], str):
        return 'photos.name: serve una stringa'
    err = _bad_surrogate(entry['name'], 'photos.name')
    if err:
        return err
    if len(entry['name']) > MAX_NAME_CHARS:
        return 'photos.name: %d caratteri, il massimo è %d' % (len(entry['name']), MAX_NAME_CHARS)
    if 'thumb' in entry:
        thumb = entry['thumb']
        if not isinstance(thumb, str):
            return 'photos.thumb: serve una stringa "data:image/…"'
        err = _bad_surrogate(thumb, 'photos.thumb')
        if err:
            return err
        if not thumb.startswith('data:image/'):
            return 'photos.thumb: deve iniziare con "data:image/" (data-URL della miniatura)'
        if len(thumb) > MAX_THUMB_CHARS:
            return 'photos.thumb: %d caratteri, il massimo è %d' % (len(thumb), MAX_THUMB_CHARS)
    return None


def empty_full_warning(relay, n_photos):
    """Righe d'allarme per il caso «`full` con zero foto», o [] se non c'e' pericolo (M2-bis F1).

    Senza `--album` e senza relay, /state.json e' un payload `full: true` con `photos: []`:
    il PKJS lo applica come stato completo e, non trovandoci nessuno slot elencato, CANCELLA
    tutto l'album (`album.js applyPayload`, ramo `full`). E' il caso F10 che la relay chiude.
    La forma del payload non si tocca qui — `--dump-json state` "nudo" e' il `full` anche a
    vuoto (test_devpage.js lo pretende) e cambiarla e' una decisione d'insieme, non di questo
    tool — ma chi avvia il server in quella configurazione deve vederlo scritto.
    """
    if relay or n_photos:
        return []
    return ['  \u26a0 ATTENZIONE: /state.json \xe8 un payload `full: true` con 0 foto: applicato '
            'dal PKJS',
            "    CANCELLA TUTTI gli slot dell'album. Per fare solo da tramite alla config page: "
            '--relay']


def validate_page_payload(body):
    """Valida il payload della config page vera (S6 §3). (body, None) oppure (None, 'errore').

    Severa quanto quella della pagina di prova, e per gli stessi motivi: quel che passa di
    qui il PKJS lo applica come delta all'album (`applyPayload`), e un refuso della pagina
    non deve diventare mezza sincronizzazione. Il corpo torna com'e' (lo rende /save.json:
    il PKJS deve leggere ESATTAMENTE quel che la pagina ha mandato).
    """
    unknown = sorted(k for k in body if k not in PAGE_SAVE_ALLOWED)
    if unknown:
        return None, 'campo sconosciuto "%s" (ammessi: %s)' % (
            unknown[0], ', '.join(PAGE_SAVE_ALLOWED))
    for key in PAGE_SAVE_REQUIRED:
        if key not in body:
            return None, 'manca "%s" (la config page lo manda sempre, anche vuoto)' % key
    err = _bad_version(body['v'])
    if err:
        return None, err

    settings, err = validate_settings_patch(body['settings'])
    if err:
        return None, err
    missing = [name for name, _v, _d, _x in SETTINGS_SPEC if name not in settings]
    if missing:
        return None, 'settings: mancano %s (la pagina manda tutti e 10 i campi)' % ', '.join(missing)

    _deleted, err = _page_slot_list(body['deleted'], 'deleted')
    if err:
        return None, err
    _order, err = _page_slot_list(body['order'], 'order')
    if err:
        return None, err

    photos = body.get('photos', [])
    if not isinstance(photos, list):
        return None, 'photos: serve una lista'
    if len(photos) > MAX_SLOTS:
        return None, 'photos: %d voci, il massimo è %d' % (len(photos), MAX_SLOTS)
    used = set()
    for entry in photos:
        err = _page_photo(entry)
        if err:
            return None, err
        # Uno slot appena eliminato puo' ospitare una foto nuova nello stesso Save (§3):
        # il doppione si controlla solo DENTRO `photos`.
        if entry['slot'] in used:
            return None, 'photos.slot: %d ripetuto' % entry['slot']
        used.add(entry['slot'])
    return body, None


# ------------------------------------------------------- pool (photo_prep) ---

def build_pool(paths, work_dir, prep_args=(), verbose=True):
    """Converte le foto con photo_prep.py e ritorna il pool in memoria.

    Ogni voce: {i, name, raw6, raw1, crc6, crc1, photo_id, preview_emery, preview_flint}.
    `photo_id` = (crc32(raw6) & 0x7FFFFFFF) or 1: uint32 != 0 (il campo dell'orologio è
    senza segno, ma il JS lo maneggia come int32 — restare sotto 2^31 evita ogni ambiguità).
    ⚠️ docs/design/galleria.md §6 riporta ancora `crc32(raw6) | 1`: le due formule danno id
    diversi per ~metà delle foto (bit 31 acceso). Va allineata la riga del design PRIMA della
    config page vera di S6 — se la pagina di S6 usasse `| 1`, la stessa foto avrebbe due id
    e l'orologio ritrasmetterebbe 34 KB invece di riconoscerla (sync_proto.c "già committato").
    """
    if not os.path.exists(PHOTO_PREP):
        raise SystemExit('manca %s' % PHOTO_PREP)
    try:
        os.makedirs(work_dir, exist_ok=True)
    except OSError as exc:      # --work su un percorso non scrivibile: messaggio, non traceback
        raise SystemExit('cartella di lavoro non utilizzabile (--work): %s' % exc)

    pool = []
    for i, path in enumerate(paths):
        if not os.path.exists(path):
            raise SystemExit('foto non trovata: %s' % path)
        base = 'pool%d' % i
        t0 = time.perf_counter()
        cmd = [sys.executable, PHOTO_PREP, '--out', work_dir, '--name', base,
               '--preview', '--preview-dir', work_dir]
        cmd += list(prep_args)
        cmd.append(path)
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            sys.stderr.write(proc.stdout)
            sys.stderr.write(proc.stderr)
            raise SystemExit('photo_prep.py è uscito con %d su %s' % (proc.returncode, path))

        blobs = {}
        for ext, expected in (('raw6', RAW6_BYTES), ('raw1', RAW1_BYTES)):
            fpath = os.path.join(work_dir, '%s.%s' % (base, ext))
            with open(fpath, 'rb') as fh:
                blobs[ext] = fh.read()
            if len(blobs[ext]) != expected:
                raise SystemExit('%s: %d byte invece di %d' % (fpath, len(blobs[ext]), expected))

        previews = {}
        for key, suffix in (('emery', '_emery_x2.png'), ('flint', '_flint_x2.png')):
            ppath = os.path.join(work_dir, base + suffix)
            if not os.path.exists(ppath):
                raise SystemExit("manca l'anteprima %s (photo_prep.py --preview)" % ppath)
            with open(ppath, 'rb') as fh:
                previews[key] = fh.read()

        crc6 = zlib.crc32(blobs['raw6']) & 0xFFFFFFFF
        crc1 = zlib.crc32(blobs['raw1']) & 0xFFFFFFFF
        # photo_id: CRC-32 del raw6 ridotto a 31 bit e mai 0 — stessa convenzione di
        # newPhotoId() in src/pkjs/album.js (`((t ^ r) >>> 0) || 1` su valori gia' & 0x7FFFFFFF):
        # il JS maneggia gli interi come int32, sopra 2**31 l'id tornerebbe negativo.
        # (docs/design/galleria.md §6 riporta ancora la formula vecchia `crc32(raw6) | 1`:
        #  e' la riga del design a dover essere allineata, prima della config page vera di S6.)
        photo_id = (crc6 & 0x7FFFFFFF) or 1
        name = os.path.splitext(os.path.basename(path))[0]
        pool.append({
            'i': i, 'name': name,
            'raw6': blobs['raw6'], 'raw1': blobs['raw1'],
            'crc6': crc6, 'crc1': crc1, 'photo_id': photo_id,
            'preview_emery': previews['emery'], 'preview_flint': previews['flint'],
        })
        if verbose:
            print('pool[%2d]  %-28s  crc6 %08X  crc1 %08X  photo_id %-10u  %5d ms'
                  % (i, name[:28], crc6, crc1, photo_id, (time.perf_counter() - t0) * 1000.0),
                  flush=True)
    return pool


# -------------------------------------------------------------- stato dev ---

class DevState(object):
    """Stato del server (album, ordine, impostazioni, scenario), protetto da un Lock."""

    def __init__(self, pool, photos, order, settings, scenario, settings_set=False,
                 relay=False):
        self.lock = threading.Lock()
        self.pool = pool                     # sola lettura dopo la costruzione
        self.photos = list(photos)           # [{slot, src}] — src = indice nel pool
        self.order = list(order)             # [slot…]
        self.settings = dict(settings)       # tutti e 10 i campi
        # `settings` entra in /state.json solo se l'utente le ha espresse (--settings o un Save):
        # altrimenti il PKJS (album.settingsSet) non deve sovrascrivere quelle dell'orologio (design §5.1).
        self.settings_set = bool(settings_set)
        self.scenario = scenario
        # Modalita' relay (S6): niente album sul server, /state.json e' un delta vuoto.
        # In pool (S5b, --album) resta il payload `full: true`.
        self.relay = bool(relay)
        # Ultimo payload della CONFIG PAGE vera (S6): lo rende /save.json finche' un Save
        # della pagina di prova non rimette in gioco il pool (README §11).
        self.last_payload = None
        self.seq = 1                         # cresce a ogni POST riuscito

    # --- helper (chiamare con il lock preso) ---

    def _by_slot(self):
        return {entry['slot']: self.pool[entry['src']] for entry in self.photos}

    def state_dict(self):
        """Payload letto dal PKJS.

        Pool (--album): payload COMPLETO `full: true`, una voce per FORMATO, slot crescenti.
        Relay (S6): solo {v, seq, settings?, hooks} — SENZA `full` e senza photos/order/
        deleted, cosi' il PKJS lo applica come delta vuoto e non cancella niente (F10):
        li' l'album vive nel suo localStorage e le foto arrivano dalla config page.
        """
        with self.lock:
            if self.relay:
                out = {'v': 1, 'seq': self.seq}
                if self.settings_set:
                    out['settings'] = dict(self.settings)
                out['hooks'] = {'scenario': self.scenario}
                return out
            by_slot = self._by_slot()
            photos = []
            for slot in sorted(by_slot):
                item = by_slot[slot]
                photos.append({'slot': slot, 'photo_id': item['photo_id'], 'name': item['name'],
                               'fmt': FMT_RAW6, 'len': len(item['raw6']), 'crc': item['crc6'],
                               'url': '/photo/%d.raw6?b64=1' % slot})
                photos.append({'slot': slot, 'photo_id': item['photo_id'], 'name': item['name'],
                               'fmt': FMT_RAW1, 'len': len(item['raw1']), 'crc': item['crc1'],
                               'url': '/photo/%d.raw1?b64=1' % slot})
            out = {'v': 1, 'full': True, 'seq': self.seq, 'order': list(self.order),
                   'deleted': [], 'photos': photos,
                   'hooks': {'scenario': self.scenario}}
            if self.settings_set:
                out['settings'] = dict(self.settings)
            return out

    def save_dict(self):
        """/save.json: quel che il PKJS legge dopo un Save.

        Dopo un Save della CONFIG PAGE vera e' il payload della pagina, con `seq` e `hooks`
        aggiunti e senza `full` (il PKJS lo applica come delta: design §5.1). Prima di
        quello — e dopo un Save della pagina di prova, che rimette in gioco il pool — resta
        l'alias di /state.json, come in S5b.
        """
        with self.lock:
            payload = None if self.last_payload is None else dict(self.last_payload)
            if payload is not None:
                payload['v'] = 1
                payload['seq'] = self.seq
                payload['hooks'] = {'scenario': self.scenario}
        return payload if payload is not None else self.state_dict()

    def pool_dict(self):
        return {'pool': [{'i': it['i'], 'name': it['name'], 'photo_id': it['photo_id'],
                          'crc6': it['crc6'], 'crc1': it['crc1'],
                          'preview': '/preview/%d.png' % it['i'],
                          'preview_flint': '/preview/%d.png?flint=1' % it['i']}
                         for it in self.pool],
                'slots_max': MAX_SLOTS,
                # Default delle impostazioni per la pagina: /state.json le omette finche'
                # l'utente non le esprime (--settings o un Save), ma i campi vanno mostrati
                # lo stesso. Unica fonte: SETTINGS_SPEC (= settings_set_defaults() in C).
                'settings_defaults': dict(SETTINGS_DEFAULTS)}

    def photo_bytes(self, slot, fmt):
        """Byte dello slot (o None se vuoto). fmt = 'raw6' | 'raw1'."""
        with self.lock:
            item = self._by_slot().get(slot)
            return item[fmt] if item else None

    def preview_bytes(self, index, flint):
        if index < 0 or index >= len(self.pool):
            return None
        return self.pool[index]['preview_flint' if flint else 'preview_emery']

    def apply_save(self, body):
        """Applica un POST /save. Ritorna (seq, None) oppure (None, 'errore').

        Due corpi diversi sullo stesso endpoint: quello della CONFIG PAGE vera (S6) si
        riconosce da `deleted`, che la pagina manda sempre — anche vuoto — e che la pagina
        di prova non manda mai. Il payload della pagina non tocca il pool (le sue foto sono
        byte, non indici di --album): viene tenuto da parte per /save.json.
        """
        if not isinstance(body, dict):
            return None, 'serve un oggetto JSON'

        if looks_like_page_save(body):
            return self._apply_page_save(body)

        unknown = sorted(k for k in body if k not in SAVE_ALLOWED)
        if unknown:
            return None, 'campo sconosciuto "%s" (ammessi: %s)' % (unknown[0], ', '.join(SAVE_ALLOWED))
        if 'v' in body:
            # in Python True == 1 e 1.0 == 1, ma {"v": true} e {"v": 1.0} restano refusi
            err = _bad_version(body['v'])
            if err:
                return None, err

        photos = None
        if 'photos' in body:
            raw = body['photos']
            if not isinstance(raw, list):
                return None, 'photos: serve una lista'
            if len(raw) > MAX_SLOTS:
                return None, 'photos: %d voci, il massimo è %d' % (len(raw), MAX_SLOTS)
            photos = []
            used = set()
            for entry in raw:
                if not isinstance(entry, dict):
                    return None, 'photos: ogni voce è un oggetto {slot, src}'
                # Severi anche qui, non solo in cima e dentro `settings` (README §11): un
                # refuso della pagina non deve diventare un save a metà a nessun livello.
                unknown = sorted(k for k in entry if k not in PHOTO_ENTRY_ALLOWED)
                if unknown:
                    return None, 'photos: campo sconosciuto "%s" (ammessi: %s)' % (
                        unknown[0], ', '.join(PHOTO_ENTRY_ALLOWED))
                for label in PHOTO_ENTRY_ALLOWED:
                    if label not in entry:
                        return None, 'photos: manca "%s" in una voce' % label
                slot, src = entry.get('slot'), entry.get('src')
                for label, value in (('slot', slot), ('src', src)):
                    if isinstance(value, bool) or not isinstance(value, int):
                        return None, 'photos.%s: serve un intero' % label
                if slot < 0 or slot >= MAX_SLOTS:
                    return None, 'photos.slot: %d fuori intervallo (0..%d)' % (slot, MAX_SLOTS - 1)
                if slot in used:
                    return None, 'photos.slot: %d ripetuto' % slot
                if src < 0 or src >= len(self.pool):
                    return None, 'photos.src: %d non è nel pool (0..%d)' % (src, len(self.pool) - 1)
                used.add(slot)
                photos.append({'slot': slot, 'src': src})

        order = None
        if 'order' in body:
            if not isinstance(body['order'], list):
                return None, 'order: serve una lista di slot'
            order = body['order']

        settings_patch = None
        if 'settings' in body:
            settings_patch, err = validate_settings_patch(body['settings'])
            if err:
                return None, err

        scenario = None
        if 'scenario' in body:
            scenario = body['scenario']
            if scenario not in SCENARIOS:
                return None, 'scenario: "%s" sconosciuto (%s)' % (scenario, '|'.join(SCENARIOS))

        with self.lock:
            if photos is not None:
                self.photos = photos
            if settings_patch:            # {} non esprime nulla: non promuove il server ad autorita' (revisione 29/08)
                self.settings.update(settings_patch)
                self.settings_set = True
            if scenario is not None:
                self.scenario = scenario
            slots = [entry['slot'] for entry in self.photos]
            self.order = normalize_order(order if order is not None else self.order, slots)
            # Un Save della pagina di prova riporta /save.json allo stato del pool (README §11).
            self.last_payload = None
            self.seq += 1
            return self.seq, None

    def _apply_page_save(self, body):
        """POST /save della config page vera: valida tutto e tiene il payload per /save.json.

        Accettato anche in modalita' pool (comodo per i test): li' pero' /state.json resta
        il `full` dell'album di --album, che al riavvio del PKJS torna autorita' (README §11).
        """
        payload, err = validate_page_payload(body)
        if err:
            return None, err
        with self.lock:
            self.last_payload = payload
            self.seq += 1
            return self.seq, None


# ----------------------------------------------------------- pagina di prova ---
# Pagina di prova di S5b (in S6 la sostituirà la config page vera, servita dallo stesso
# server con --page). Nessuna dipendenza esterna, nessun localStorage (sul telefono la
# pagina gira da un URL `data:`, cioè da un'origine opaca dove localStorage lancia).

PAGE_HTML = """<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Galleria — dev server</title>
<style>
:root { color-scheme: light dark; }
body { font: 14px/1.45 system-ui, "Segoe UI", Roboto, sans-serif; margin: 0 auto; padding: 16px;
       max-width: 900px; min-width: 380px; }
h1 { font-size: 20px; margin: 0 0 2px; }
h2 { font-size: 15px; margin: 22px 0 8px; border-bottom: 1px solid #8886; padding-bottom: 4px; }
p.sub { color: #777; margin: 0 0 6px; font-size: 12px; }
.row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid #8883; }
.row img { width: 100px; height: 114px; object-fit: contain; background: #8882; flex: none; }
.grow { flex: 1; min-width: 0; }
.name { font-weight: 600; word-break: break-all; }
.meta { color: #888; font-size: 12px; }
label.slot { font-size: 12px; color: #888; display: flex; flex-direction: column; gap: 2px; flex: none; }
input[type=number] { width: 4.5em; font-size: 14px; padding: 3px; }
.set { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px 16px; }
.set label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: #888; }
.set select, .set input { font-size: 14px; padding: 4px; }
ol.ord { padding-left: 0; margin: 0; list-style: none; }
ol.ord li { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #8882; }
ol.ord .pos { color: #888; font-size: 12px; width: 2em; flex: none; }
.actions { margin: 24px 0 48px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
button { font-size: 15px; padding: 7px 16px; cursor: pointer; }
button.mini { font-size: 12px; padding: 2px 8px; }
#err { display: none; background: #c0392b; color: #fff; padding: 8px 12px; border-radius: 4px;
       margin: 10px 0; white-space: pre-wrap; }
#msg { color: #2a8f5a; font-weight: 600; }
.empty { color: #888; font-style: italic; padding: 6px 0; }
</style>
</head>
<body>
<h1>Galleria — dev server</h1>
<p class="sub" id="head">caricamento…</p>
<div id="err"></div>

<h2>Foto disponibili (pool)</h2>
<p class="sub">Spunta "in album" e scegli lo slot (0–11). Le anteprime sono ×2 con la resa del vetro.</p>
<div id="pool"></div>

<h2>Ordine di rotazione</h2>
<ol class="ord" id="order"></ol>

<h2>Impostazioni</h2>
<div class="set" id="settings"></div>

<h2>Scenario (guasti iniettati nella sync)</h2>
<div class="set"><label>Scenario<select id="scenario"></select></label></div>

<div class="actions">
  <button id="save">Salva</button>
  <button id="cancel">Annulla</button>
  <span id="msg"></span>
</div>

<script>
"use strict";

/* return_to è aggiunto da `pebble emu-app-config` (…/config.html?return_to=http://…/close?):
   dopo il salvataggio ci si torna con il token JSON percent-encoded in coda. */
var RT = "";
(function () {
  var m = /[?&]return_to=([^&]*)/.exec(location.search);
  if (m) { try { RT = decodeURIComponent(m[1]); } catch (e) { RT = m[1]; } }
})();

var SETTINGS_FIELDS = [
  { key: "layout", label: "Layout", opts: [[0, "A — ora in alto"], [1, "B — a tutto schermo"]] },
  { key: "font", label: "Font", opts: [[0, "Anton"], [1, "Bebas"], [2, "Barlow"], [3, "LECO"]] },
  { key: "clock_mode", label: "Formato ora", opts: [[0, "automatico"], [1, "12 h"], [2, "24 h"]] },
  { key: "leading_zero", label: "Zero iniziale", opts: [[0, "automatico"], [1, "sempre"], [2, "mai"]] },
  { key: "text_color", label: "Colore del testo",
    opts: [[0, "automatico"], [1, "bianco"], [2, "nero"], [3, "giallo"], [4, "Oxford"]] },
  { key: "outline", label: "Contorno", opts: [[0, "automatico"], [1, "sempre"], [2, "mai"]] },
  { key: "interval_min", label: "Rotazione (minuti)",
    opts: [[0, "mai"], [5, "5"], [15, "15"], [30, "30"], [60, "60"], [180, "180"], [1440, "1440 (giornaliera)"]] },
  { key: "order", label: "Ordine", opts: [[0, "sequenziale"], [1, "casuale"]] },
  { key: "shake_next", label: "Shake = foto successiva", opts: [[0, "no"], [1, "sì"]] },
  { key: "info_row", label: "Riga info (bit 1 passi, 2 batteria, 4 data, 8 BT)", number: [0, 15] }
];
var SCENARIOS = ["photo", "seq", "dup", "crc", "interrupt", "none"];
var MAX_SLOTS = 12;

var POOL = null;     /* /pool.json */
var MODEL = null;    /* { entries: [{i, slot}], order: [slot…], settings, scenario, seq } */

function el(id) { return document.getElementById(id); }

function showErr(text) {
  var e = el("err");
  e.textContent = text || "";
  e.style.display = text ? "block" : "none";
}

function getJSON(url, cb) {
  var x = new XMLHttpRequest();
  x.open("GET", url, true);
  x.onreadystatechange = function () {
    if (x.readyState !== 4) { return; }
    if (x.status !== 200) { showErr("GET " + url + " → HTTP " + x.status); return; }
    var data = null;
    try { data = JSON.parse(x.responseText); } catch (e) { showErr("GET " + url + ": risposta non JSON"); return; }
    cb(data);
  };
  x.send();
}

/* --- modello ------------------------------------------------------------- */

function usedSlots(skipIndex) {
  var out = {};
  for (var k = 0; k < MODEL.entries.length; k++) {
    if (k !== skipIndex) { out[MODEL.entries[k].slot] = true; }
  }
  return out;
}

function firstFree(used) {
  for (var s = 0; s < MAX_SLOTS; s++) { if (!used[s]) { return s; } }
  return -1;
}

function entryFor(i) {
  for (var k = 0; k < MODEL.entries.length; k++) { if (MODEL.entries[k].i === i) { return k; } }
  return -1;
}

function syncOrder() {
  var present = {}, k;
  for (k = 0; k < MODEL.entries.length; k++) { present[MODEL.entries[k].slot] = true; }
  var seen = {}, out = [];
  for (k = 0; k < MODEL.order.length; k++) {
    var s = MODEL.order[k];
    if (present[s] && !seen[s]) { seen[s] = true; out.push(s); }
  }
  var rest = [];
  for (k = 0; k < MAX_SLOTS; k++) { if (present[k] && !seen[k]) { rest.push(k); } }
  MODEL.order = out.concat(rest);
}

function initModel(state) {
  /* Lo stesso photo_id puo' toccare a piu' righe del pool (la stessa foto passata due volte
     in --album): si tiene la LISTA degli indici e se ne consuma uno per slot, cosi' due slot
     con la stessa foto spuntano due righe diverse invece della stessa. Se la lista finisce
     (piu' slot che puntano allo stesso src) si ricade sulla prima riga, come prima. */
  var byId = {}, firstById = {}, k;
  for (k = 0; k < POOL.pool.length; k++) {
    var id = POOL.pool[k].photo_id;
    if (byId[id] === undefined) { byId[id] = []; firstById[id] = k; }
    byId[id].push(k);
  }
  var entries = [], seen = {};
  for (k = 0; k < state.photos.length; k++) {
    var ph = state.photos[k];
    if (seen[ph.slot]) { continue; }
    var free = byId[ph.photo_id];
    if (free === undefined) { continue; }
    seen[ph.slot] = true;
    entries.push({ i: free.length ? free.shift() : firstById[ph.photo_id], slot: ph.slot });
  }
  /* Senza --settings ne' Save /state.json NON porta `settings` (README §11): la pagina parte
     dai default del server (pool.json.settings_defaults) e lo dice in #head; il primo Salva li
     manda e da li' in poi il dev server e' l'autorita' delle impostazioni (design §5.1). */
  MODEL = { entries: entries, order: state.order.slice(),
            settings: state.settings || (POOL.settings_defaults || {}),
            settingsSet: !!state.settings,
            scenario: (state.hooks && state.hooks.scenario) || "photo", seq: state.seq };
  syncOrder();
}

/* --- rendering ----------------------------------------------------------- */

function renderPool() {
  var box = el("pool");
  box.textContent = "";
  if (!POOL.pool.length) {
    var p = document.createElement("div");
    p.className = "empty";
    p.textContent = "nessuna foto: avvia il server con --album foto1.jpg foto2.png …";
    box.appendChild(p);
    return;
  }
  var proposed = usedSlots(-1);
  for (var k = 0; k < POOL.pool.length; k++) {
    box.appendChild(poolRow(POOL.pool[k], proposed));
  }
}

function poolRow(item, proposed) {
  var row = document.createElement("div");
  row.className = "row";

  var idx = entryFor(item.i);
  var chk = document.createElement("input");
  chk.type = "checkbox";
  chk.checked = idx >= 0;
  chk.title = "in album";

  var img = document.createElement("img");
  img.src = item.preview;
  img.alt = item.name;

  var mid = document.createElement("div");
  mid.className = "grow";
  var nm = document.createElement("div");
  nm.className = "name";
  nm.textContent = item.name;
  var meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = "pool " + item.i + " · photo_id " + item.photo_id +
                     " · crc6 " + item.crc6.toString(16) + " · crc1 " + item.crc1.toString(16);
  mid.appendChild(nm);
  mid.appendChild(meta);

  var lab = document.createElement("label");
  lab.className = "slot";
  lab.appendChild(document.createTextNode("slot"));
  var num = document.createElement("input");
  num.type = "number";
  num.min = 0;
  num.max = MAX_SLOTS - 1;
  if (idx >= 0) {
    num.value = MODEL.entries[idx].slot;
  } else {
    var free = firstFree(proposed);
    if (free >= 0) { proposed[free] = true; }
    num.value = free >= 0 ? free : 0;
  }
  lab.appendChild(num);

  chk.onchange = function () {
    showErr("");
    var here = entryFor(item.i);
    if (chk.checked) {
      var slot = parseInt(num.value, 10);
      if (isNaN(slot) || slot < 0 || slot >= MAX_SLOTS) { showErr("slot non valido (0–11)"); chk.checked = false; return; }
      if (usedSlots(-1)[slot]) { showErr("slot " + slot + " già occupato"); chk.checked = false; return; }
      if (MODEL.entries.length >= MAX_SLOTS) { showErr("massimo " + MAX_SLOTS + " foto"); chk.checked = false; return; }
      MODEL.entries.push({ i: item.i, slot: slot });
      MODEL.order.push(slot);
    } else if (here >= 0) {
      MODEL.entries.splice(here, 1);
    }
    syncOrder();
    render();
  };

  num.onchange = function () {
    showErr("");
    var here = entryFor(item.i);
    if (here < 0) { return; }
    var slot = parseInt(num.value, 10);
    if (isNaN(slot) || slot < 0 || slot >= MAX_SLOTS) { showErr("slot non valido (0–11)"); render(); return; }
    if (usedSlots(here)[slot]) { showErr("slot " + slot + " già occupato"); render(); return; }
    var old = MODEL.entries[here].slot;
    MODEL.entries[here].slot = slot;
    for (var k = 0; k < MODEL.order.length; k++) { if (MODEL.order[k] === old) { MODEL.order[k] = slot; } }
    syncOrder();
    render();
  };

  row.appendChild(chk);
  row.appendChild(img);
  row.appendChild(mid);
  row.appendChild(lab);
  return row;
}

function renderOrder() {
  var box = el("order");
  box.textContent = "";
  if (!MODEL.order.length) {
    var li = document.createElement("li");
    li.className = "empty";
    li.textContent = "album vuoto (l'orologio mostra le foto demo)";
    box.appendChild(li);
    return;
  }
  var bySlot = {};
  for (var k = 0; k < MODEL.entries.length; k++) { bySlot[MODEL.entries[k].slot] = MODEL.entries[k].i; }
  for (var n = 0; n < MODEL.order.length; n++) {
    box.appendChild(orderRow(n, MODEL.order[n], bySlot));
  }
}

function orderRow(pos, slot, bySlot) {
  var li = document.createElement("li");
  var num = document.createElement("span");
  num.className = "pos";
  num.textContent = (pos + 1) + ".";
  var txt = document.createElement("span");
  txt.className = "grow";
  var item = POOL.pool[bySlot[slot]];
  txt.textContent = "slot " + slot + " — " + (item ? item.name : "?");
  var up = document.createElement("button");
  up.className = "mini";
  up.textContent = "↑";
  up.disabled = pos === 0;
  up.onclick = function () { swapOrder(pos, pos - 1); };
  var down = document.createElement("button");
  down.className = "mini";
  down.textContent = "↓";
  down.disabled = pos === MODEL.order.length - 1;
  down.onclick = function () { swapOrder(pos, pos + 1); };
  li.appendChild(num);
  li.appendChild(txt);
  li.appendChild(up);
  li.appendChild(down);
  return li;
}

function swapOrder(a, b) {
  var tmp = MODEL.order[a];
  MODEL.order[a] = MODEL.order[b];
  MODEL.order[b] = tmp;
  render();
}

function fieldDefault(f) {
  var d = POOL.settings_defaults;
  if (d && d[f.key] !== undefined) { return d[f.key]; }
  return f.number ? f.number[0] : f.opts[0][0];
}

function renderSettings() {
  var box = el("settings");
  if (box.dataset.built) { return; }        /* costruito una volta sola: i valori si leggono al Salva */
  box.textContent = "";                     /* un tentativo fallito a meta' non lascia campi doppi */
  for (var k = 0; k < SETTINGS_FIELDS.length; k++) {
    var f = SETTINGS_FIELDS[k];
    var lab = document.createElement("label");
    lab.appendChild(document.createTextNode(f.label));
    var input;
    if (f.number) {
      input = document.createElement("input");
      input.type = "number";
      input.min = f.number[0];
      input.max = f.number[1];
    } else {
      input = document.createElement("select");
      for (var o = 0; o < f.opts.length; o++) {
        var opt = document.createElement("option");
        opt.value = f.opts[o][0];
        opt.textContent = f.opts[o][1];
        input.appendChild(opt);
      }
    }
    input.id = "s_" + f.key;
    var v = MODEL.settings[f.key];
    input.value = v !== undefined ? v : fieldDefault(f);
    lab.appendChild(input);
    box.appendChild(lab);
  }
  var sc = el("scenario");
  sc.textContent = "";
  for (var s = 0; s < SCENARIOS.length; s++) {
    var so = document.createElement("option");
    so.value = SCENARIOS[s];
    so.textContent = SCENARIOS[s];
    sc.appendChild(so);
  }
  sc.value = MODEL.scenario;
  box.dataset.built = "1";                  /* solo a costruzione finita: un errore sopra non blocca il re-render */
}

function readSettings() {
  var out = {};
  for (var k = 0; k < SETTINGS_FIELDS.length; k++) {
    var f = SETTINGS_FIELDS[k];
    var v = parseInt(el("s_" + f.key).value, 10);
    if (isNaN(v)) { throw new Error("valore non numerico in « " + f.label + " »"); }
    out[f.key] = v;
  }
  return out;
}

function render() {
  el("head").textContent = "seq " + MODEL.seq + " · " + MODEL.entries.length + " foto in album · " +
                           POOL.pool.length + " nel pool" +
                           (MODEL.settingsSet ? "" : " · impostazioni: default (non ancora salvate)") +
                           (RT ? " · ritorno a " + RT : " · nessun return_to");
  renderPool();
  renderOrder();
  renderSettings();
}

/* --- salva / annulla ----------------------------------------------------- */

function save() {
  /* Il bottone e' agganciato subito, ma pool.json/state.json arrivano dopo: senza questa
     guardia un clic in quella finestra fa un TypeError su un campo che non esiste ancora. */
  if (!POOL || !MODEL) { showErr("attendere: pool e stato non sono ancora arrivati"); return; }
  showErr("");
  el("msg").textContent = "";
  var settings;
  try { settings = readSettings(); } catch (e) { showErr(e.message); return; }
  var photos = [];
  for (var k = 0; k < MODEL.entries.length; k++) {
    photos.push({ slot: MODEL.entries[k].slot, src: MODEL.entries[k].i });
  }
  var body = { settings: settings, order: MODEL.order.slice(), photos: photos,
               scenario: el("scenario").value };
  var x = new XMLHttpRequest();
  x.open("POST", "/save", true);
  x.setRequestHeader("Content-Type", "application/json");
  x.onreadystatechange = function () {
    if (x.readyState !== 4) { return; }
    var r = null;
    try { r = JSON.parse(x.responseText); } catch (e) { r = null; }
    if (x.status === 200 && r && r.ok) {
      MODEL.seq = r.seq;
      MODEL.settingsSet = true;             /* il POST portava `settings`: da ora le esprime il server */
      if (RT) {
        location.href = RT + encodeURIComponent(JSON.stringify({ v: 1, dev: true, seq: r.seq }));
      } else {
        el("msg").textContent = "salvato (seq " + r.seq + ")";
        render();
      }
    } else {
      showErr("salvataggio fallito: " + ((r && r.error) || ("HTTP " + x.status)));
    }
  };
  x.send(JSON.stringify(body));
}

function cancel() {
  if (RT) { location.href = RT; } else { location.reload(); }
}

el("save").onclick = save;
el("cancel").onclick = cancel;

getJSON("/pool.json", function (pool) {
  POOL = pool;
  MAX_SLOTS = pool.slots_max || MAX_SLOTS;
  getJSON("/state.json", function (state) {
    initModel(state);
    render();
  });
});
</script>
</body>
</html>
"""


# ------------------------------------------------------------------ HTTP ----

class DevHandler(BaseHTTPRequestHandler):
    """Gestore delle richieste. Lo stato sta in `self.server.state` (condiviso, con Lock)."""

    protocol_version = 'HTTP/1.1'
    server_version = 'GalleriaDevServer/1.0'
    # Letture con scadenza (socketserver la passa a socket.settimeout): un client che
    # dichiara un Content-Length piu' grande del corpo che manda davvero non lascia il
    # thread appeso per sempre sul socket (e una keep-alive inattiva si chiude da sola).
    timeout = 15

    # --- log -----------------------------------------------------------------

    def parse_request(self):
        # Un solo punto in cui far partire il cronometro e azzerare il flag del log: qui
        # passa OGNI richiesta, comprese quelle a cui risponde send_error() (metodo non
        # gestito, riga di richiesta malformata) senza arrivare ai nostri handler.
        self._t0 = time.perf_counter()
        self._own_response = False
        return BaseHTTPRequestHandler.parse_request(self)

    def log_message(self, fmt, *args):      # zittisce il log di BaseHTTPRequestHandler
        pass

    def log_request(self, code='-', size='-'):
        # Le risposte che passano da _send() si loggano da sole (byte e tempo reali). Qui
        # restano quelle di send_error() di BaseHTTPRequestHandler — metodo non gestito
        # (HEAD, PUT: 501), riga di richiesta malformata (400) — che altrimenti non
        # comparirebbero: tools/README.md §11 promette una riga per OGNI richiesta.
        if getattr(self, '_own_response', False):
            return
        self._log_line(code if isinstance(code, int) else 0,
                       size if isinstance(size, int) else 0)

    def _log_line(self, code, nbytes):
        if getattr(self.server, 'quiet', False):     # --selftest: niente rumore
            return
        now = time.time()
        stamp = '%s.%03d' % (time.strftime('%H:%M:%S', time.localtime(now)), int(now * 1000) % 1000)
        ms = (time.perf_counter() - getattr(self, '_t0', time.perf_counter())) * 1000.0
        sys.stdout.write('%s  %-7s %s -> %d  %d B  %.1f ms\n'
                         % (stamp, getattr(self, 'command', None) or '?',
                            getattr(self, 'path', None) or '?', code, nbytes, ms))
        sys.stdout.flush()

    # --- invio ---------------------------------------------------------------

    def _send(self, code, ctype, body, extra=None):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self._own_response = True        # la riga di log la scrive _log_line() qui sotto
        self.send_response(code)
        if ctype:
            self.send_header('Content-Type', ctype)
        if code != 204:
            # RFC 7230 §3.3.2: una 204 non porta Content-Length (ne' corpo). Alla OPTIONS
            # restano i soli header CORS, come promette tools/README.md §11.
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
        if self.close_connection:
            # Chi chiude (411, 408, 400 per Content-Length non valido, 404 su POST) lo dice
            # anche al client: una keep-alive (http.client, curl) riapre da se' alla
            # richiesta dopo invece di leggere EOF a meta' strada.
            self.send_header('Connection', 'close')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        for key, value in (extra or ()):
            self.send_header(key, value)
        self.end_headers()
        if body:
            self.wfile.write(body)
        self._log_line(code, len(body))

    def _json(self, code, obj):
        # `ensure_ascii=True`: nessuna stringa puo' far fallire l'encode. Con ensure_ascii=False
        # bastava un surrogato spaiato (un "\ud83d" nel JSON della pagina, meta' emoji) dentro
        # `name`/`thumb` perche' .encode('utf-8') lanciasse e /save.json rispondesse 500 **per
        # sempre** (il payload resta in memoria): finding M7 #3. Gli escape \uXXXX li rilegge
        # qualunque client JSON (json.loads, JSON.parse); il payload della pagina cresce di poco
        # (i dati delle foto sono base64url, gia' ASCII).
        blob = json.dumps(obj, ensure_ascii=True, separators=(',', ':')).encode('utf-8')
        self._send(code, 'application/json; charset=utf-8', blob)

    def _not_found(self):
        self._json(404, {'ok': False, 'error': 'not found'})

    def _page_html(self):
        """HTML di /config.html. Con --page il file viene RILETTO a ogni richiesta: in S6
        basta salvare la config page e ricaricare il browser, senza riavviare il server
        (cioe' senza riconvertire tutto l'album, ~300 ms per foto). File sparito o
        illeggibile: si serve l'ultima copia buona, con un avviso su stderr."""
        path = getattr(self.server, 'page_path', None)
        if not path:
            return self.server.page_html
        try:
            with open(path, 'rb') as fh:
                blob = fh.read()
        except OSError as exc:
            sys.stderr.write('--page: %s illeggibile (%s): servo l\'ultima copia buona\n'
                             % (path, exc))
            return self.server.page_html
        self.server.page_html = blob             # ultima copia buona
        return blob

    def _page_warn(self, message):
        """Avviso non fatale di build_config_page: una riga sola per messaggio, non a ogni GET."""
        seen = getattr(self.server, 'page_warned', None)
        if seen is None:
            seen = self.server.page_warned = set()
        if message in seen:
            return
        seen.add(message)
        sys.stderr.write('--page-dir: %s\n' % message)
        sys.stderr.flush()

    def _serve_page(self):
        """GET /config.html: --page-dir (config page vera inlinata a ogni richiesta, S6),
        --page (file riletto a ogni richiesta) o la pagina di prova incorporata (S5b).

        Con --page-dir un errore di inlining e' un 500 con il messaggio in chiaro (piu' una
        riga su stderr): niente ultima-copia-buona, che nasconderebbe una pagina rotta
        proprio mentre la si sta scrivendo.
        """
        page_dir = getattr(self.server, 'page_dir', None)
        if not page_dir:
            self._send(200, 'text/html; charset=utf-8', self._page_html())
            return
        try:
            blob = inline_page_dir(page_dir, warn=self._page_warn)
        except PageInlineError as exc:
            sys.stderr.write('--page-dir: %s\n' % exc)
            sys.stderr.flush()
            self._send(500, 'text/plain; charset=utf-8',
                       'config page non generabile da %s\n%s\n' % (page_dir, exc))
            return
        self._send(200, 'text/html; charset=utf-8', blob)

    # --- metodi --------------------------------------------------------------

    def do_OPTIONS(self):
        self._send(204, None, b'')

    def do_GET(self):
        try:
            self._route_get()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:                                     # pragma: no cover
            self._json(500, {'ok': False, 'error': 'errore interno: %s' % exc})

    def do_POST(self):
        try:
            self._route_post()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:                                     # pragma: no cover
            self._json(500, {'ok': False, 'error': 'errore interno: %s' % exc})

    # --- instradamento -------------------------------------------------------

    def _route_get(self):
        state = self.server.state
        parsed = urlparse(self.path)
        # keep_blank_values: `?b64` da solo e' un flag acceso come `?b64=1`
        path, query = parsed.path, parse_qs(parsed.query, keep_blank_values=True)

        if path == '/':
            self._send(302, None, b'', extra=[('Location', '/config.html')])
            return

        if path == '/config.html':
            self._serve_page()
            return

        if path == '/state.json':
            self._json(200, state.state_dict())
            return

        if path == '/save.json':
            self._json(200, state.save_dict())
            return

        if path == '/pool.json':
            self._json(200, state.pool_dict())
            return

        match = RE_PHOTO.match(path)
        if match:
            slot, ext = int(match.group(1)), match.group(2)
            if slot >= MAX_SLOTS:
                self._not_found()
                return
            blob = state.photo_bytes(slot, ext)
            if blob is None:
                self._json(404, {'ok': False, 'error': 'slot %d vuoto' % slot})
                return
            if query_flag(query, 'b64'):
                self._send(200, 'text/plain; charset=utf-8', b64url(blob))
            else:
                self._send(200, 'application/octet-stream', blob)
            return

        match = RE_PREVIEW.match(path)
        if match:
            index = int(match.group(1))
            flint = query_flag(query, 'flint')
            blob = state.preview_bytes(index, flint)
            if blob is None:
                self._json(404, {'ok': False, 'error': 'foto %d non nel pool' % index})
                return
            self._send(200, 'image/png', blob)
            return

        self._not_found()

    def _route_post(self):
        state = self.server.state
        path = urlparse(self.path).path
        if path not in ('/save', '/state.json'):
            # Il corpo non viene letto: se restasse nel socket, la keep-alive lo scambierebbe
            # per la riga della richiesta successiva (501 "Unsupported method ('{}GET')").
            self.close_connection = True
            self._not_found()
            return

        if self.headers.get('Transfer-Encoding'):
            # Il corpo a pezzi non lo sappiamo rimontare: meglio dirlo (411) che leggere
            # zero byte e dare la colpa al JSON. La connessione si chiude: quello che resta
            # nel socket sono i chunk non letti, non la richiesta successiva.
            self.close_connection = True
            self._json(411, {'ok': False,
                             'error': 'Transfer-Encoding non supportato: serve Content-Length'})
            return

        cl = self.headers.get('Content-Length')
        try:
            length = int(cl) if cl is not None else -1   # assente -> 400 + chiusura (README §11; revisione 29/08)
        except ValueError:
            length = -1
        if length < 0 or length > 8 * 1024 * 1024:
            # Come per 411/408: il corpo (se c'e') resta nel socket non letto, quindi la
            # connessione si chiude invece di servirlo come richiesta successiva.
            self.close_connection = True
            self._json(400, {'ok': False, 'error': 'Content-Length assente o fuori misura'})
            return
        try:
            raw = self.rfile.read(length) if length else b''
        except TimeoutError:
            # Content-Length piu' grande del corpo davvero inviato: la lettura scade
            # (DevHandler.timeout) invece di restare appesa. La connessione si chiude:
            # quello che resta nel socket non e' una richiesta.
            self.close_connection = True
            self._json(408, {'ok': False,
                             'error': 'corpo incompleto (Content-Length dichiarato: %d B)' % length})
            return
        try:
            body = json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, ValueError) as exc:
            self._json(400, {'ok': False, 'error': 'corpo non JSON: %s' % exc})
            return

        seq, err = state.apply_save(body)
        if err:
            self._json(400, {'ok': False, 'error': err})
            return
        self._json(200, {'ok': True, 'seq': seq})


def make_server(state, page_html, bind, port, page_path=None, page_dir=None):
    """ThreadingHTTPServer pronto (non ancora avviato): la porta e' gia' presa.

    `state` puo' essere None se lo si assegna a `httpd.state` prima di `serve_forever()`
    (main() lega la porta prima di convertire le foto: vedi il commento la'). OSError qui
    significa una cosa sola: non si riesce ad ascoltare su bind:port.
    """
    httpd = ThreadingHTTPServer((bind, port), DevHandler)
    httpd.daemon_threads = True
    httpd.state = state
    httpd.page_html = page_html if isinstance(page_html, bytes) else page_html.encode('utf-8')
    httpd.page_path = page_path          # != None con --page: riletto a ogni GET /config.html
    httpd.page_dir = page_dir            # != None con --page-dir: inlinata a ogni GET (S6)
    httpd.page_warned = set()            # avvisi di build_config_page gia' stampati
    return httpd


# -------------------------------------------------------------- selftest ----

def _synthetic_png(path, k):
    """Immagine 400×456 (= 2× 200×228) deterministica e diversa per ogni k. Serve solo al
    --selftest: nessun file esterno, nessuna licenza da citare."""
    from PIL import Image, ImageDraw          # Pillow: solo qui e dentro photo_prep.py
    w, h = 400, 456
    data = bytearray()
    for y in range(h):
        gy = (y * 255) // (h - 1)
        for x in range(w):
            gx = (x * 255) // (w - 1)
            chan = (gx, gy, (k * 97 + 40) % 256)
            data += bytes((chan[k % 3], chan[(k + 1) % 3], chan[(k + 2) % 3]))
    img = Image.frombytes('RGB', (w, h), bytes(data))
    draw = ImageDraw.Draw(img)
    draw.rectangle((40, 40 + k * 30, 160, 160 + k * 30), fill=(255, 255, 255))
    draw.rectangle((240, 260, 360, 400), fill=(0, 0, 0))
    img.save(path)


# Harness per eseguire lo <script> della pagina incorporata sotto node con un DOM finto
# (solo getElementById/createElement/appendChild/textContent/value/dataset: quello che la
# pagina usa) e un XMLHttpRequest sincrono che risponde con pool/state dati. Legge un JSON
# {page, pool, state, return_to} dal file in argv[2] e stampa un JSON con quanto osservato:
# il selftest lo fa girare in tre varianti (senza `settings`, con, senza return_to). Lo
# stesso schema, piu' esteso, sta in apps/galleria/test/test_devpage.js (che usa --dump-page).
PAGE_CHECK_JS = r"""
"use strict";
var fs = require("fs"), vm = require("vm");
var inp = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
var m = /<script>([\s\S]*?)<\/script>/.exec(inp.page);
if (!m) { process.stdout.write(JSON.stringify({ load_error: "nessun <script> nella pagina" })); process.exit(0); }

var byId = {};
function mk(tag) {
  var e = { tag: tag, children: [], dataset: {}, style: {}, _tc: "", _val: "", _id: "" };
  e.appendChild = function (c) { e.children.push(c); if (c._id) { byId[c._id] = c; } return c; };
  Object.defineProperty(e, "textContent", {
    get: function () { return e._tc; },
    set: function (v) { e._tc = String(v); e.children = []; } });
  Object.defineProperty(e, "value", {
    get: function () { return e._val; },
    set: function (v) {
      v = String(v);
      if (e.tag === "select") {           /* come nel browser: valore senza <option> → "" */
        var ok = false;
        for (var k = 0; k < e.children.length; k++) { if (e.children[k]._val === v) { ok = true; } }
        e._val = ok ? v : "";
      } else { e._val = v; }
    } });
  Object.defineProperty(e, "id", { get: function () { return e._id; }, set: function (v) { e._id = String(v); } });
  return e;
}
["err", "msg", "head", "pool", "order", "settings", "save", "cancel"].forEach(function (id) {
  var e = mk("div"); e.id = id; byId[id] = e;
});
var scen = mk("select"); scen.id = "scenario"; byId.scenario = scen;

var posts = [], hrefs = [], reloads = 0;
function XHR() {
  var x = this;
  x.readyState = 0; x.status = 0; x.responseText = "";
  x.open = function (method, url) { x.method = method; x.url = url; };
  x.setRequestHeader = function () {};
  x.send = function (body) {
    var resp = null;
    if (x.method === "GET" && x.url === "/pool.json") { resp = inp.pool; }
    else if (x.method === "GET" && x.url === "/state.json") { resp = inp.state; }
    else if (x.method === "POST" && x.url === "/save") {
      posts.push({ url: x.url, body: body });
      inp.state.seq += 1;
      resp = { ok: true, seq: inp.state.seq };
    }
    x.status = resp ? 200 : 404;
    x.responseText = JSON.stringify(resp);
    x.readyState = 4;
    if (x.onreadystatechange) { x.onreadystatechange(); }
  };
}
var location = { search: inp.return_to ? "?return_to=" + encodeURIComponent(inp.return_to) : "",
                 reload: function () { reloads += 1; } };
Object.defineProperty(location, "href", {
  get: function () { return hrefs.length ? hrefs[hrefs.length - 1] : ""; },
  set: function (v) { hrefs.push(String(v)); } });
var sandbox = {
  document: { getElementById: function (id) { return byId[id] || null; },
              createElement: mk,
              createTextNode: function (t) { return { text: String(t) }; } },
  XMLHttpRequest: XHR, location: location, console: console };

function snap() {
  var s = byId.settings, sc = byId.scenario, vals = {};
  for (var id in byId) { if (id.indexOf("s_") === 0) { vals[id.slice(2)] = byId[id]._val; } }
  return { settings_children: s.children.length, built: s.dataset.built || null,
           scenario_options: sc.children.length, scenario_value: sc._val, values: vals,
           head: byId.head._tc, err: byId.err._tc,
           pool_children: byId.pool.children.length, order_children: byId.order.children.length };
}
function errText(e) { return (e && e.name ? e.name + ": " + e.message : String(e)); }

var out = { load_error: null, rerender_error: null, save_error: null, cancel_error: null };
try { vm.runInNewContext(m[1], sandbox, { filename: "config.html" }); } catch (e) { out.load_error = errText(e); }
out.loaded = snap();
/* un campo modificato + secondo render() (come dopo ↑/↓ nell'ordine): niente doppioni, valore tenuto */
if (byId.s_font) { byId.s_font.value = "2"; }
try { sandbox.render(); } catch (e) { out.rerender_error = errText(e); }
out.rerender = snap();
try { byId.save.onclick(); } catch (e) { out.save_error = errText(e); }
out.save = { posts: posts.map(function (p) {
               var b = null; try { b = JSON.parse(p.body); } catch (e) { b = null; }
               return { url: p.url, body: b }; }),
             hrefs: hrefs.slice(), err: byId.err._tc, msg: byId.msg._tc, head: byId.head._tc };
hrefs.length = 0;
try { byId.cancel.onclick(); } catch (e) { out.cancel_error = errText(e); }
out.cancel = { hrefs: hrefs.slice(), reloads: reloads };
process.stdout.write(JSON.stringify(out));
"""


def selftest():
    """Esercita ogni endpoint su un server vero, in un thread, senza rete esterna."""
    results = []

    def check(label, cond, detail=''):
        results.append((label, bool(cond), detail))

    tmp = tempfile.mkdtemp(prefix='galleria_devtest_')
    httpd = None
    thread = None
    try:
        paths = []
        for k in range(3):
            png = os.path.join(tmp, 'prova%d.png' % k)
            _synthetic_png(png, k)
            paths.append(png)

        # --- errori di riga di comando: messaggio, mai traceback ---
        def cli(argv):
            """main(argv) con stderr catturato: ritorna (codice, testo dell'errore)."""
            buf = io.StringIO()
            try:
                with contextlib.redirect_stderr(buf):
                    return main(argv), buf.getvalue()
            except SystemExit as exc:
                text = buf.getvalue()
                if isinstance(exc.code, int):
                    return exc.code, text
                return 1, text + str(exc.code)

        code, msg = cli(['--page', tmp])                     # una directory, non un file
        check('--page su una directory → errore, non traceback',
              code == 2 and 'impossibile leggere' in msg, 'code=%s msg=%s' % (code, msg.strip()[-90:]))
        code, msg = cli(['--page', os.path.join(tmp, 'manca.html')])
        check('--page inesistente → errore', code == 2 and 'non esiste' in msg,
              'code=%s' % code)
        code, msg = cli(['--slots', '0,,1'])
        check('--slots "0,,1" → errore (pezzo vuoto), uscita 2 come ogni errore di CLI',
              code == 2 and 'malformato' in msg and 'usage:' in msg,
              'code=%s msg=%s' % (code, msg.strip()[-60:]))
        code, msg = cli(['--port', '99999'])
        check('--port 99999 → errore, non il traceback di OverflowError',
              code == 2 and 'fuori intervallo' in msg, 'code=%s msg=%s' % (code, msg.strip()[-90:]))
        code, msg = cli(['--port', '-1'])
        check('--port -1 → errore', code == 2 and 'fuori intervallo' in msg, 'code=%s' % code)
        code, msg = cli(['--port', 'otto'])
        check('--port non numerico → errore', code == 2 and 'intero' in msg, 'code=%s' % code)
        code, msg = cli(['--album', 'a.jpg', 'b.jpg', '--order', '0,0'])
        check('--order "0,0" → errore (slot ripetuti)', code == 2 and 'ripetuti' in msg,
              'code=%s msg=%s' % (code, msg.strip()[-60:]))
        code, msg = cli(['--settings', '{"pippo": 1}'])
        check('--settings con campo ignoto → errore', code == 2 and 'sconosciuto' in msg,
              'code=%s' % code)
        # --work dentro un file: OSError di os.makedirs, non del socket (e nemmeno un traceback)
        code, msg = cli(['--port', '0', '--work', os.path.join(paths[0], 'sub')])
        check('--work non utilizzabile → errore che nomina --work, non la porta',
              code == 1 and '--work' in msg and 'ascoltare' not in msg,
              'code=%s msg=%s' % (code, msg.strip()[-90:]))

        work = os.path.join(tmp, 'work')
        pool = build_pool(paths, work, verbose=False)
        check('pool: 3 foto convertite', len(pool) == 3)
        check('pool: raw6 da %d B' % RAW6_BYTES, all(len(p['raw6']) == RAW6_BYTES for p in pool))
        check('pool: raw1 da %d B' % RAW1_BYTES, all(len(p['raw1']) == RAW1_BYTES for p in pool))
        check('pool: photo_id != 0 e distinti',
              all(p['photo_id'] for p in pool) and len({p['photo_id'] for p in pool}) == 3)

        state = DevState(pool,
                         photos=[{'slot': k, 'src': k} for k in range(3)],
                         order=[0, 1, 2],
                         settings=default_settings(),
                         scenario='photo')
        httpd = make_server(state, PAGE_HTML, '127.0.0.1', 0)
        httpd.quiet = True
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, kwargs={'poll_interval': 0.05})
        thread.daemon = True
        thread.start()

        def req(method, path, body=None, headers=None):
            conn = http.client.HTTPConnection('127.0.0.1', port, timeout=15)
            try:
                conn.request(method, path, body=body, headers=headers or {})
                resp = conn.getresponse()
                blob = resp.read()
                return resp.status, {k.lower(): v for k, v in resp.getheaders()}, blob
            finally:
                conn.close()

        def get_json(path):
            code, head, blob = req('GET', path)
            try:
                return code, head, json.loads(blob.decode('utf-8'))
            except ValueError:
                return code, head, None

        # --- radice e pagina ---
        code, head, _ = req('GET', '/')
        check('GET / → 302 verso /config.html', code == 302 and head.get('location') == '/config.html',
              'code=%s location=%s' % (code, head.get('location')))

        code, head, blob = req('GET', '/config.html')
        page = blob.decode('utf-8')
        check('GET /config.html → 200 text/html',
              code == 200 and head.get('content-type', '').startswith('text/html'),
              'code=%s ct=%s' % (code, head.get('content-type')))
        check('config.html contiene "return_to"', 'return_to' in page)
        check('config.html contiene "/save"', '/save' in page)
        check('config.html senza localStorage', 'localStorage' not in page)
        check('config.html: "Salva" protetto finche\' pool/stato non sono arrivati',
              'if (!POOL || !MODEL)' in page)
        check('config.html: senza `settings` in state.json ricade su pool.json.settings_defaults (F13)',
              'state.settings || (POOL.settings_defaults' in page and 'settingsSet: !!state.settings' in page
              and 'impostazioni: default (non ancora salvate)' in page)

        # --- stato iniziale ---
        code, head, st = get_json('/state.json')
        check('GET /state.json → 200 JSON', code == 200 and st is not None)
        check('state.json: header CORS + no-store',
              head.get('access-control-allow-origin') == '*' and head.get('cache-control') == 'no-store')
        check('state.json: content-type json',
              head.get('content-type') == 'application/json; charset=utf-8', head.get('content-type'))
        check('state.json: v/full/seq/deleted',
              st['v'] == 1 and st['full'] is True and st['seq'] == 1 and st['deleted'] == [])
        check('state.json: ordine iniziale', st['order'] == [0, 1, 2], str(st['order']))
        check('state.json: senza --settings/Save le impostazioni NON compaiono (album.settingsSet)',
              'settings' not in st)
        check('state.json: hooks.scenario', st['hooks']['scenario'] == 'photo')
        check('state.json: 2 voci per slot (una per formato)', len(st['photos']) == 6)
        check('state.json: slot crescenti',
              [p['slot'] for p in st['photos']] == [0, 0, 1, 1, 2, 2],
              str([p['slot'] for p in st['photos']]))
        check('state.json: fmt 1/2 alternati',
              [p['fmt'] for p in st['photos']] == [1, 2, 1, 2, 1, 2])
        check('state.json: len per formato',
              all(p['len'] == (RAW6_BYTES if p['fmt'] == 1 else RAW1_BYTES) for p in st['photos']))
        check('state.json: crc senza segno',
              all(0 <= p['crc'] <= 0xFFFFFFFF for p in st['photos']))
        check('state.json: crc = quello del pool',
              all(p['crc'] == (pool[p['slot']]['crc6'] if p['fmt'] == 1 else pool[p['slot']]['crc1'])
                  for p in st['photos']))
        check('state.json: url coerenti',
              all(p['url'] == '/photo/%d.%s?b64=1' % (p['slot'], 'raw6' if p['fmt'] == 1 else 'raw1')
                  for p in st['photos']))
        check('state.json: photo_id e name',
              all(p['photo_id'] == pool[p['slot']]['photo_id'] and p['name'] == pool[p['slot']]['name']
                  for p in st['photos']))

        code, _h, alias = get_json('/save.json')
        check('GET /save.json = alias di /state.json', code == 200 and alias == st)

        # --- pool ---
        code, _h, pj = get_json('/pool.json')
        check('GET /pool.json → 200', code == 200 and pj is not None)
        check('pool.json: 3 voci e slots_max 12', len(pj['pool']) == 3 and pj['slots_max'] == MAX_SLOTS)
        check('pool.json: campi e url anteprime',
              all(item['i'] == k and item['preview'] == '/preview/%d.png' % k
                  and item['preview_flint'] == '/preview/%d.png?flint=1' % k
                  and item['photo_id'] == pool[k]['photo_id']
                  and item['crc6'] == pool[k]['crc6'] and item['crc1'] == pool[k]['crc1']
                  for k, item in enumerate(pj['pool'])))
        check('pool.json: settings_defaults = i 10 default di SETTINGS_SPEC (F13)',
              pj.get('settings_defaults') == SETTINGS_DEFAULTS and len(pj['settings_defaults']) == 10
              and set(pj['settings_defaults']) == set(SETTINGS_ALLOWED),
              str(pj.get('settings_defaults')))

        # --- foto: byte grezzi e base64url ---
        for ext, size, crckey in (('raw6', RAW6_BYTES, 'crc6'), ('raw1', RAW1_BYTES, 'crc1')):
            code, head, blob = req('GET', '/photo/1.%s' % ext)
            check('GET /photo/1.%s → 200 octet-stream' % ext,
                  code == 200 and head.get('content-type') == 'application/octet-stream')
            check('/photo/1.%s: %d byte' % (ext, size), len(blob) == size, str(len(blob)))
            check('/photo/1.%s: CRC32 = quello dichiarato' % ext,
                  (zlib.crc32(blob) & 0xFFFFFFFF) == pool[1][crckey])

            code, head, b64blob = req('GET', '/photo/1.%s?b64=1' % ext)
            text = b64blob.decode('ascii')
            check('GET /photo/1.%s?b64=1 → 200 text/plain' % ext,
                  code == 200 and head.get('content-type', '').startswith('text/plain'))
            check('/photo/1.%s?b64=1: alfabeto base64url senza padding' % ext,
                  bool(B64URL_OK.match(text)) and '=' not in text)
            decoded = b64url_decode(text)
            check('/photo/1.%s?b64=1: decodifica a %d byte' % (ext, size), len(decoded) == size,
                  str(len(decoded)))
            check('/photo/1.%s?b64=1: CRC32 identico' % ext,
                  (zlib.crc32(decoded) & 0xFFFFFFFF) == pool[1][crckey] and decoded == blob)

        code, head, bare = req('GET', '/photo/1.raw6?b64')
        check('GET /photo/1.raw6?b64 (flag senza valore) → base64url come ?b64=1',
              code == 200 and head.get('content-type', '').startswith('text/plain')
              and bare.decode('ascii') == b64url(pool[1]['raw6']), 'code=%s' % code)

        # --- anteprime ---
        code, head, png = req('GET', '/preview/0.png')
        check('GET /preview/0.png → PNG',
              code == 200 and head.get('content-type') == 'image/png' and png[:8] == b'\x89PNG\r\n\x1a\n')
        code, head, png_f = req('GET', '/preview/0.png?flint=1')
        check('GET /preview/0.png?flint=1 → PNG diverso',
              code == 200 and png_f[:8] == b'\x89PNG\r\n\x1a\n' and png_f != png)

        # --- 404 ---
        code, _h, body = get_json('/photo/11.raw6')
        check('GET /photo/11.raw6 (slot vuoto) → 404', code == 404 and body and body['ok'] is False)
        code, _h, body = get_json('/photo/12.raw6')
        check('GET /photo/12.raw6 (slot inesistente) → 404', code == 404)
        code, _h, body = get_json('/photo/01.raw6')
        check('GET /photo/01.raw6 (numero non canonico) → 404', code == 404)
        code, _h, body = get_json('/preview/00.png')
        check('GET /preview/00.png (numero non canonico) → 404', code == 404)
        code, _h, body = get_json('/preview/9.png')
        check('GET /preview/9.png (fuori pool) → 404', code == 404 and body and body['ok'] is False)
        code, _h, body = get_json('/pippo')
        check('GET /pippo → 404 JSON', code == 404 and body == {'ok': False, 'error': 'not found'})
        code, _h, _b = req('POST', '/pippo', body=b'{}', headers={'Content-Type': 'application/json'})
        check('POST /pippo → 404', code == 404)

        # --- OPTIONS (CORS) ---
        code, head, _b = req('OPTIONS', '/state.json')
        check('OPTIONS /state.json → 204 + CORS',
              code == 204 and head.get('access-control-allow-origin') == '*'
              and 'POST' in head.get('access-control-allow-methods', ''),
              'code=%s' % code)
        check('OPTIONS: 204 senza Content-Length (RFC 7230 §3.3.2)',
              'content-length' not in head and _b == b'', str(sorted(head)))

        # --- POST valido ---
        payload = {'photos': [{'slot': 5, 'src': 2}, {'slot': 0, 'src': 0}],
                   'order': [9, 5],                       # 9 sconosciuto → scartato; 0 → accodato
                   'settings': {'layout': 1, 'interval_min': 5},
                   'scenario': 'crc'}
        code, _h, res = req('POST', '/save', body=json.dumps(payload).encode('utf-8'),
                            headers={'Content-Type': 'application/json'})
        res = json.loads(res.decode('utf-8'))
        check('POST /save valido → 200 {ok, seq}', code == 200 and res == {'ok': True, 'seq': 2}, str(res))

        code, _h, st2 = get_json('/state.json')
        check('dopo il save: seq = 2', st2['seq'] == 2)
        check('primo Save senza --settings: `settings` compare in state.json con tutti i 10 campi '
              '(da qui il dev server è l\'autorità delle impostazioni)',
              'settings' in st2 and set(st2['settings']) == set(SETTINGS_ALLOWED), str(st2.get('settings')))
        check('dopo il save: 2 foto (4 voci) negli slot 0 e 5',
              [p['slot'] for p in st2['photos']] == [0, 0, 5, 5], str([p['slot'] for p in st2['photos']]))
        check('dopo il save: order ripulito e completato', st2['order'] == [5, 0], str(st2['order']))
        check('dopo il save: settings parziali applicati sui default',
              st2['settings']['layout'] == 1 and st2['settings']['interval_min'] == 5
              and st2['settings']['font'] == 0 and st2['settings']['shake_next'] == 1,
              str(st2['settings']))
        check('dopo il save: scenario aggiornato', st2['hooks']['scenario'] == 'crc')
        check('dopo il save: la foto 2 del pool è nello slot 5',
              [p['crc'] for p in st2['photos'] if p['slot'] == 5] == [pool[2]['crc6'], pool[2]['crc1']])
        code, _h, blob = req('GET', '/photo/5.raw6')
        check('dopo il save: /photo/5.raw6 = raw6 della foto 2', blob == pool[2]['raw6'])
        code, _h, _b = get_json('/photo/1.raw6')
        check('dopo il save: lo slot 1 è vuoto → 404', code == 404)

        # --- POST non validi (stato invariato) ---
        bad = [
            ('slot ripetuto', json.dumps({'photos': [{'slot': 3, 'src': 0}, {'slot': 3, 'src': 1}]})),
            ('src fuori pool', json.dumps({'photos': [{'slot': 3, 'src': 9}]})),
            ('slot fuori 0..11', json.dumps({'photos': [{'slot': 12, 'src': 0}]})),
            ('settings fuori intervallo', json.dumps({'settings': {'layout': 7}})),
            ('interval_min non ammesso', json.dumps({'settings': {'interval_min': 7}})),
            ('settings campo ignoto', json.dumps({'settings': {'pippo': 1}})),
            ('scenario ignoto', json.dumps({'scenario': 'boh'})),
            ('campo top-level ignoto', json.dumps({'pippo': 1})),
            ('v sconosciuta', json.dumps({'v': 2})),
            ('v: true (in Python True == 1)', json.dumps({'v': True})),
            ('v: 1.0 (float, in Python 1.0 == 1)', json.dumps({'v': 1.0})),
            ('photos: campo ignoto nella voce', json.dumps({'photos': [{'slot': 0, 'src': 0, 'x': 1}]})),
            ('photos: voce senza src', json.dumps({'photos': [{'slot': 0}]})),
            ('order non lista', json.dumps({'order': 3})),
            ('corpo non JSON', 'questo non è JSON'),
            ('corpo JSON ma non oggetto', json.dumps([1, 2, 3])),
        ]
        for label, raw in bad:
            code, _h, res = req('POST', '/save', body=raw.encode('utf-8'),
                                headers={'Content-Type': 'application/json'})
            try:
                res = json.loads(res.decode('utf-8'))
            except ValueError:
                res = None
            check('POST /save non valido (%s) → 400' % label,
                  code == 400 and res and res.get('ok') is False and res.get('error'),
                  'code=%s res=%s' % (code, res))

        code, _h, st3 = get_json('/state.json')
        check('dopo i POST non validi: stato invariato', st3 == st2)

        # --- POST senza Content-Length (Transfer-Encoding: chunked) ---
        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=15)
        try:
            conn.putrequest('POST', '/save')
            conn.putheader('Content-Type', 'application/json')
            conn.putheader('Transfer-Encoding', 'chunked')
            conn.endheaders()
            conn.send(b'2\r\n{}\r\n0\r\n\r\n')
            resp = conn.getresponse()
            code, blob = resp.status, resp.read()
            conn_hdr = resp.getheader('Connection')
        finally:
            conn.close()
        try:
            res = json.loads(blob.decode('utf-8'))
        except ValueError:
            res = None
        check('POST chunked → 411 (serve Content-Length)',
              code == 411 and res and res.get('ok') is False, 'code=%s res=%s' % (code, res))
        check('411: dichiara Connection: close (F15)', conn_hdr == 'close', repr(conn_hdr))

        # --- alias POST /state.json ---
        code, _h, res = req('POST', '/state.json', body=b'{}',
                            headers={'Content-Type': 'application/json'})
        res = json.loads(res.decode('utf-8'))
        check('POST /state.json (alias) → seq 3', code == 200 and res == {'ok': True, 'seq': 3}, str(res))

        # --- corpo troncato (Content-Length > byte inviati): 408, niente thread appeso ---
        old_timeout = DevHandler.timeout
        DevHandler.timeout = 0.4                  # vale per le connessioni aperte da qui in poi
        try:
            conn = http.client.HTTPConnection('127.0.0.1', port, timeout=20)
            started = time.perf_counter()
            try:
                conn.putrequest('POST', '/save')
                conn.putheader('Content-Type', 'application/json')
                conn.putheader('Content-Length', '4096')
                conn.endheaders()
                conn.send(b'{"v":1}')             # molti meno byte di quelli dichiarati
                resp = conn.getresponse()
                code, blob = resp.status, resp.read()
                conn_hdr = resp.getheader('Connection')
            except Exception as exc:               # connessione caduta: sarebbe comunque un fallimento
                code, blob, conn_hdr = None, repr(exc).encode('utf-8'), None
            finally:
                conn.close()
            waited = time.perf_counter() - started
        finally:
            DevHandler.timeout = old_timeout
        check('POST con Content-Length > corpo → 408 (lettura con scadenza, thread libero)',
              code == 408 and waited < 10.0, 'code=%s dopo %.2f s' % (code, waited))
        check('408: dichiara Connection: close (F15)', conn_hdr == 'close', repr(conn_hdr))
        code, _h, st4 = get_json('/state.json')
        check('dopo il corpo troncato: il server risponde ancora e lo stato è invariato',
              code == 200 and st4 is not None and st4['seq'] == 3, 'code=%s' % code)

        # --- keep-alive (F15): 400 per Content-Length non valido e 404 su POST chiudono la
        #     connessione, cosi' il corpo non letto non diventa la "richiesta" successiva ---
        def raw_exchange(payload):
            """`payload` su un socket nuovo, poi si legge fino a EOF: (righe di stato, close, eof, tutto)."""
            sock = socket.create_connection(('127.0.0.1', port), timeout=5)
            buf, eof = b'', False
            try:
                sock.sendall(payload)
                while True:
                    try:
                        chunk = sock.recv(65536)
                    except ConnectionResetError:  # RST: il server ha chiuso con byte non letti
                        eof = True
                        break
                    if not chunk:
                        eof = True
                        break
                    buf += chunk
            except socket.timeout:
                pass                              # eof resta False: il server NON ha chiuso
            finally:
                sock.close()
            statuses = [line for line in buf.split(b'\r\n') if line.startswith(b'HTTP/1.')]
            closing = b'\r\nconnection: close\r\n' in buf.lower()
            return statuses, closing, eof, buf

        tail = b'GET /config.html HTTP/1.1\r\nHost: x\r\n\r\n'
        for label, payload, want in (
                ('Content-Length: 9000000 + corpo',
                 b'POST /save HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n'
                 b'Content-Length: 9000000\r\n\r\n{}' + tail, b'400'),
                ('Content-Length: abc + corpo',
                 b'POST /save HTTP/1.1\r\nHost: x\r\nContent-Length: abc\r\n\r\n{}' + tail, b'400'),
                ('Content-Length: -1 senza corpo',
                 b'POST /save HTTP/1.1\r\nHost: x\r\nContent-Length: -1\r\n\r\n' + tail, b'400'),
                ('Content-Length assente + corpo',
                 b'POST /save HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n\r\n{"v":1}' + tail, b'400'),
                ('POST /nope (404) + corpo',
                 b'POST /nope HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\n\r\n{}' + tail, b'404')):
            statuses, closing, eof, buf = raw_exchange(payload)
            # La seconda risposta del server NON corretto e' incollata al corpo JSON della prima senza
            # CRLF (`...}HTTP/1.1 501 ...`): va contata sul flusso intero, non sulle righe (revisione 29/08).
            n_resp = buf.count(b'HTTP/1.1 ')
            check('keep-alive: %s poi GET nello stesso invio → una sola risposta %s, '
                  'Connection: close, socket chiuso (niente 501 dal corpo residuo)'
                  % (label, want.decode('ascii')),
                  len(statuses) == 1 and n_resp == 1 and statuses[0].startswith(b'HTTP/1.1 ' + want)
                  and closing and eof and b'501' not in buf,
                  'stati=%r risposte=%d close=%s eof=%s 501=%s' % (statuses, n_resp, closing, eof, b'501' in buf))

        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=15)
        try:
            conn.request('POST', '/save', body=b'{}',
                         headers={'Content-Type': 'application/json', 'Content-Length': '9000000'})
            resp = conn.getresponse()
            resp.read()
            code1, conn_hdr = resp.status, resp.getheader('Connection')
            # http.client vede `Connection: close`, chiude e alla richiesta dopo riapre da se':
            # la GET viene servita su un socket nuovo, non scambiata per il corpo residuo.
            try:
                conn.request('GET', '/state.json')
                resp2 = conn.getresponse()
                blob2 = resp2.read()
                code2 = resp2.status
            except (http.client.HTTPException, ConnectionError) as exc:
                code2, blob2 = 'chiusa: %s' % exc.__class__.__name__, b''
        finally:
            conn.close()
        check('keep-alive (http.client riusato): POST con Content-Length 9000000 → 400 con Connection: close',
              code1 == 400 and conn_hdr == 'close', 'code=%s Connection=%r' % (code1, conn_hdr))
        check('keep-alive (http.client riusato): la GET dopo il 400 è servita (200 su socket nuovo), non 501',
              code2 == 200 and json.loads(blob2.decode('utf-8'))['seq'] == 3, 'code=%s' % (code2,))
        code, _h, st5 = get_json('/state.json')
        check('dopo i casi keep-alive: server vivo e seq invariato', code == 200 and st5['seq'] == 3,
              'code=%s' % code)

        # --- metodo non gestito: 501 CON la sua riga di log (README §11) ---
        buf = io.StringIO()
        httpd.quiet = False
        try:
            with contextlib.redirect_stdout(buf):
                code, _h, _b = req('HEAD', '/state.json')
        finally:
            httpd.quiet = True
        logged = buf.getvalue()
        check('HEAD (metodo non gestito) → 501 e una riga di log',
              code == 501 and 'HEAD' in logged and '501' in logged,
              'code=%s log=%r' % (code, logged.strip()[:80]))

        # --- --page riletto a ogni GET /config.html (S6: salva e ricarica, niente riavvio) ---
        page_file = os.path.join(tmp, 'pagina.html')
        with io.open(page_file, 'w', encoding='utf-8') as fh:
            fh.write('<!doctype html><p>uno')
        old_page_html = httpd.page_html        # _page_html() ci tiene l'ultima copia buona
        httpd.page_path = page_file
        try:
            _c, _h, first = req('GET', '/config.html')
            with io.open(page_file, 'w', encoding='utf-8') as fh:
                fh.write('<!doctype html><p>due')
            _c, _h, second = req('GET', '/config.html')
            check('--page: il file viene riletto a ogni GET /config.html',
                  b'uno' in first and b'due' in second and b'uno' not in second,
                  '%r / %r' % (first[-6:], second[-6:]))
            os.remove(page_file)
            errbuf = io.StringIO()
            with contextlib.redirect_stderr(errbuf):
                code, _h, third = req('GET', '/config.html')
            check('--page: file sparito → ultima copia buona e avviso su stderr',
                  code == 200 and b'due' in third and '--page' in errbuf.getvalue(),
                  'code=%s stderr=%r' % (code, errbuf.getvalue().strip()[:60]))
        finally:
            httpd.page_path = None
            httpd.page_html = old_page_html
        code, _h, page = req('GET', '/config.html')
        check('senza --page torna la pagina incorporata',
              code == 200 and b'dev server' in page, 'code=%s' % code)

        # --- --dump-page / --dump-json: senza server, per apps/galleria/test/test_devpage.js ---
        me = [sys.executable, os.path.abspath(__file__)]

        def run_cli(argv):
            proc = subprocess.run(me + argv, capture_output=True, encoding='utf-8', timeout=60)
            return proc.returncode, proc.stdout, proc.stderr

        rc, out, err = run_cli(['--dump-page'])
        check('--dump-page: stampa la pagina incorporata ed esce 0',
              rc == 0 and out == PAGE_HTML, 'rc=%s len=%d err=%s' % (rc, len(out), err.strip()[-80:]))
        dump_file = os.path.join(tmp, 'dump_page.html')
        with io.open(dump_file, 'w', encoding='utf-8') as fh:
            fh.write('<!doctype html><p>pagina di --page, è →')
        rc, out, err = run_cli(['--dump-page', '--page', dump_file])
        check('--dump-page --page FILE: stampa il file di --page (UTF-8 intatto)',
              rc == 0 and out == '<!doctype html><p>pagina di --page, è →', 'rc=%s out=%r' % (rc, out[:60]))
        rc, out, err = run_cli(['--dump-json', 'pool'])
        try:
            dj = json.loads(out)
        except ValueError:
            dj = None
        check('--dump-json pool (senza --album): pool vuoto, slots_max, settings_defaults',
              rc == 0 and dj == {'pool': [], 'slots_max': MAX_SLOTS, 'settings_defaults': SETTINGS_DEFAULTS},
              'rc=%s out=%s' % (rc, out.strip()[:80]))
        rc, out, err = run_cli(['--dump-json', 'state'])
        try:
            dj = json.loads(out)
        except ValueError:
            dj = None
        check('--dump-json state (senza --settings): payload full senza `settings`',
              rc == 0 and dj is not None and 'settings' not in dj and dj['full'] is True
              and dj['photos'] == [] and dj['seq'] == 1, 'rc=%s out=%s' % (rc, out.strip()[:80]))
        rc, out, err = run_cli(['--dump-json', 'state', '--settings', '{"layout": 1}', '--scenario', 'dup'])
        try:
            dj = json.loads(out)
        except ValueError:
            dj = None
        check('--dump-json state --settings/--scenario: settings completi (10) e hooks.scenario',
              rc == 0 and dj is not None and set(dj.get('settings', {})) == set(SETTINGS_ALLOWED)
              and dj['settings']['layout'] == 1 and dj['hooks']['scenario'] == 'dup',
              'rc=%s out=%s' % (rc, out.strip()[:80]))
        rc, out, err = run_cli(['--dump-json', 'pool', '--album', paths[1], '--slots', '4'])
        try:
            dj = json.loads(out)                      # SOLO JSON su stdout: niente righe "pool[..]"
        except ValueError:
            dj = None
        check('--dump-json pool --album: converte la foto e stampa solo JSON (photo_id del pool)',
              rc == 0 and dj is not None and len(dj['pool']) == 1
              and dj['pool'][0]['photo_id'] == pool[1]['photo_id'] and dj['pool'][0]['i'] == 0,
              'rc=%s out=%s err=%s' % (rc, out.strip()[:60], err.strip()[-60:]))
        rc, out, err = run_cli(['--dump-json', 'boh'])
        check('--dump-json con valore ignoto → errore di argparse (2)', rc == 2 and 'usage:' in err,
              'rc=%s' % rc)

        # --------------------------------------------------------------- S6 ---
        # Modalita' relay, --page-dir e POST /save della CONFIG PAGE vera. Su un SECONDO
        # server: il primo e' in modalita' pool e deve restare quello di S5b.
        page_dir = os.path.join(tmp, 'config_s6')
        os.makedirs(page_dir, exist_ok=True)

        def write_page_src(name, text):
            with io.open(os.path.join(page_dir, name), 'w', encoding='utf-8') as fh:
                fh.write(text)

        write_page_src('page.html',
                       '<!doctype html><html lang="it"><head><meta charset="utf-8">\n'
                       '<link rel="stylesheet" href="page.css">\n</head><body>\n'
                       '<p>config page (finta) per il selftest\n'
                       '<script src="pipeline.js"></script>\n'
                       '<script src="previews.js" data-optional="1"></script>\n'
                       '</body></html>\n')
        write_page_src('page.css', 'body { color: #123456; }\n')
        write_page_src('pipeline.js', 'var GalPipeline = { marchio: "PIPELINE-UNO" };\n')

        relay_state = DevState([], photos=[], order=[], settings=default_settings(),
                               scenario='photo', relay=True)
        relay_httpd = make_server(relay_state, PAGE_HTML, '127.0.0.1', 0, page_dir=page_dir)
        relay_httpd.quiet = True
        rport = relay_httpd.server_address[1]
        rthread = threading.Thread(target=relay_httpd.serve_forever, kwargs={'poll_interval': 0.05})
        rthread.daemon = True
        rthread.start()
        try:
            def rreq(method, path, body=None):
                conn = http.client.HTTPConnection('127.0.0.1', rport, timeout=20)
                try:
                    headers = {'Content-Type': 'application/json'} if body is not None else {}
                    conn.request(method, path, body=body, headers=headers)
                    resp = conn.getresponse()
                    blob = resp.read()
                    return resp.status, {k.lower(): v for k, v in resp.getheaders()}, blob
                finally:
                    conn.close()

            def rjson(method, path, obj=None):
                body = None if obj is None else json.dumps(obj).encode('utf-8')
                code, head, blob = rreq(method, path, body)
                try:
                    return code, json.loads(blob.decode('utf-8'))
                except ValueError:
                    return code, None

            # --- relay: /state.json e' un delta vuoto (F10) ---
            code, st6 = rjson('GET', '/state.json')
            check('relay: /state.json = {v, seq, hooks}, senza `full`/photos/order/deleted (F10)',
                  code == 200 and st6 == {'v': 1, 'seq': 1, 'hooks': {'scenario': 'photo'}}, str(st6))
            code, sv6 = rjson('GET', '/save.json')
            check('relay: /save.json prima di ogni Save = /state.json',
                  code == 200 and sv6 == st6, str(sv6))

            rc, out, err = run_cli(['--dump-json', 'state', '--relay'])
            try:
                dj = json.loads(out)
            except ValueError:
                dj = None
            check('--dump-json state --relay: {v, seq, hooks}, senza `full`',
                  rc == 0 and dj == {'v': 1, 'seq': 1, 'hooks': {'scenario': 'photo'}},
                  'rc=%s out=%s' % (rc, out.strip()[:90]))
            rc, out, err = run_cli(['--dump-json', 'state', '--relay',
                                    '--settings', '{"layout": 1}', '--scenario', 'crc'])
            try:
                dj = json.loads(out)
            except ValueError:
                dj = None
            check('--dump-json state --relay --settings: 10 impostazioni, ancora senza `full`',
                  rc == 0 and dj is not None and 'full' not in dj and 'photos' not in dj
                  and set(dj.get('settings', {})) == set(SETTINGS_ALLOWED)
                  and dj['settings']['layout'] == 1 and dj['hooks']['scenario'] == 'crc',
                  'rc=%s out=%s' % (rc, out.strip()[:90]))
            rc, out, err = run_cli(['--dump-json', 'state', '--page-dir', page_dir])
            try:
                dj = json.loads(out)
            except ValueError:
                dj = None
            check('--page-dir senza --album accende la relay anche in --dump-json',
                  rc == 0 and dj is not None and 'full' not in dj, 'rc=%s out=%s' % (rc, out.strip()[:90]))
            code, msg = cli(['--relay', '--album', paths[0]])
            check('--relay con --album → errore di CLI (2), non un server a metà',
                  code == 2 and 'relay' in msg, 'code=%s msg=%s' % (code, msg.strip()[-90:]))
            code, msg = cli(['--page', dump_file, '--page-dir', page_dir])
            check('--page e --page-dir insieme → errore di CLI (2)',
                  code == 2 and 'esclusive' in msg, 'code=%s msg=%s' % (code, msg.strip()[-90:]))
            code, msg = cli(['--page-dir', os.path.join(tmp, 'non_esiste')])
            check('--page-dir su una cartella inesistente → errore di CLI (2)',
                  code == 2 and 'non è una cartella' in msg, 'code=%s msg=%s' % (code, msg.strip()[-90:]))
            code, msg = cli(['--page-dir', dump_file])
            check('--page-dir su un file → errore di CLI (2)',
                  code == 2 and 'non è una cartella' in msg, 'code=%s' % code)

            # --- --page-dir: inlining a ogni GET /config.html ---
            code, head, blob = rreq('GET', '/config.html')
            page6 = blob.decode('utf-8')
            check('--page-dir: GET /config.html → 200 text/html con CSS e JS inlinati',
                  code == 200 and head.get('content-type', '').startswith('text/html')
                  and 'PIPELINE-UNO' in page6 and '#123456' in page6,
                  'code=%s len=%d' % (code, len(page6)))
            check('--page-dir: niente più <script src>/<link rel=stylesheet> nella pagina servita',
                  '<script src=' not in page6 and 'href="page.css"' not in page6, page6[:80])
            check('--page-dir: <script data-optional> senza file → tag rimosso',
                  'previews.js' not in page6)
            write_page_src('pipeline.js', 'var GalPipeline = { marchio: "PIPELINE-DUE" };\n')
            _c, _h, blob = rreq('GET', '/config.html')
            check('--page-dir: sorgente modificata → pagina rigenerata senza riavviare il server',
                  b'PIPELINE-DUE' in blob and b'PIPELINE-UNO' not in blob, str(blob[:40]))
            write_page_src('previews.js', 'var GalPreviews = { a: "ANTEPRIME-OK" };\n')
            _c, _h, blob = rreq('GET', '/config.html')
            check('--page-dir: data-optional con il file presente → inlinato',
                  b'ANTEPRIME-OK' in blob)
            os.remove(os.path.join(page_dir, 'pipeline.js'))
            errbuf = io.StringIO()
            with contextlib.redirect_stderr(errbuf):
                code, head, blob = rreq('GET', '/config.html')
            check('--page-dir: sorgente mancante → 500 con il messaggio in chiaro e una riga su stderr',
                  code == 500 and head.get('content-type', '').startswith('text/plain')
                  and b'pipeline.js' in blob and '--page-dir' in errbuf.getvalue(),
                  'code=%s body=%r stderr=%r' % (code, blob[:70], errbuf.getvalue().strip()[:70]))
            write_page_src('pipeline.js', 'var GalPipeline = { marchio: "PIPELINE-UNO" };\n')
            code, _h, blob = rreq('GET', '/config.html')
            check('--page-dir: sorgente rimessa a posto → 200 senza riavviare il server',
                  code == 200 and b'PIPELINE-UNO' in blob, 'code=%s' % code)
            rc, out, err = run_cli(['--dump-page', '--page-dir', page_dir])
            check('--dump-page --page-dir: stampa la pagina inlinata ed esce 0',
                  rc == 0 and 'PIPELINE-UNO' in out and '<script src=' not in out,
                  'rc=%s len=%d err=%s' % (rc, len(out), err.strip()[-70:]))
            rc, out, err = run_cli(['--dump-page', '--page-dir', tmp])
            check('--dump-page --page-dir senza page.html → uscita 1 con messaggio, mai traceback',
                  rc == 1 and 'page.html' in err and 'Traceback' not in err,
                  'rc=%s err=%s' % (rc, err.strip()[-90:]))

            # build_config_page.py assente/rotto: 500 con il messaggio in chiaro, mai un traceback
            # (il modulo si sostituisce a mano: qui il tool vero c'e' ed e' sano).
            import types as _types
            saved_builder = _PAGE_BUILDER
            globals()['_PAGE_BUILDER'] = _types.SimpleNamespace(
                inline_page=lambda _d, warn=None: (_ for _ in ()).throw(RuntimeError('esplosione finta')))
            try:
                errbuf = io.StringIO()
                with contextlib.redirect_stderr(errbuf):
                    code, _h, blob = rreq('GET', '/config.html')
                check('--page-dir: build_config_page che esplode → 500 con il messaggio, non un traceback',
                      code == 500 and b'RuntimeError: esplosione finta' in blob and b'Traceback' not in blob,
                      'code=%s body=%r' % (code, blob[:90]))
                globals()['_PAGE_BUILDER'] = _types.SimpleNamespace()      # senza inline_page()
                with contextlib.redirect_stderr(io.StringIO()):
                    code, _h, blob = rreq('GET', '/config.html')
                check('--page-dir: build_config_page senza inline_page() → 500 con il messaggio',
                      code == 500 and b'inline_page' in blob, 'code=%s body=%r' % (code, blob[:90]))
            finally:
                globals()['_PAGE_BUILDER'] = saved_builder
            code, _h, blob = rreq('GET', '/config.html')
            check('--page-dir: rimesso il tool vero, /config.html torna 200', code == 200, 'code=%s' % code)

            # --- POST /save della config page vera ---
            raw1 = bytes(((k * 37 + 11) & 0xFF) for k in range(RAW1_BYTES))
            data1, crc1v = b64url(raw1), zlib.crc32(raw1) & 0xFFFFFFFF

            def photo_entry(**over):
                entry = {'slot': 3, 'photo_id': 12345, 'fmt': FMT_RAW1, 'len': RAW1_BYTES,
                         'crc': crc1v, 'data': data1, 'name': 'vacanza.jpg',
                         'thumb': 'data:image/jpeg;base64,AAAA'}
                entry.update(over)
                return entry

            def page_body(**over):
                body = {'v': 1, 'settings': default_settings(), 'order': [3, 0], 'deleted': [0],
                        'photos': [photo_entry()]}
                body.update(over)
                return body

            def dict_senza(body, key):
                out = dict(body)
                out.pop(key, None)
                return out

            code, res = rjson('POST', '/save', page_body())
            check('POST /save della config page (riconosciuta da `deleted`) → 200 {ok, seq 2}',
                  code == 200 and res == {'ok': True, 'seq': 2}, str(res))
            code, sj = rjson('GET', '/save.json')
            check('/save.json in modalità pagina: il payload della pagina + seq + hooks, senza `full`',
                  code == 200 and sj is not None and 'full' not in sj and sj['seq'] == 2
                  and sj['hooks'] == {'scenario': 'photo'} and sj['deleted'] == [0]
                  and sj['order'] == [3, 0] and sj['settings'] == default_settings()
                  and len(sj['photos']) == 1 and sj['photos'][0]['data'] == data1
                  and sj['photos'][0]['crc'] == crc1v, str(sj)[:120])
            code, st6 = rjson('GET', '/state.json')
            check('relay: dopo il Save della pagina /state.json resta {v, seq, hooks} (seq 2)',
                  code == 200 and st6 == {'v': 1, 'seq': 2, 'hooks': {'scenario': 'photo'}}, str(st6))
            code, res = rjson('POST', '/save',
                              page_body(deleted=[3], order=[3], photos=[photo_entry(slot=3)]))
            check('POST pagina: foto nuova su uno slot appena eliminato → 200 (design §3)',
                  code == 200 and res == {'ok': True, 'seq': 3}, str(res))
            raw6 = bytes(((k * 91 + 5) & 0xFF) for k in range(RAW6_BYTES))
            big = {'slot': 1, 'photo_id': 0x7FFFFFFF, 'fmt': FMT_RAW6, 'len': RAW6_BYTES,
                   'crc': zlib.crc32(raw6) & 0xFFFFFFFF, 'data': b64url(raw6), 'name': 'grande.jpg'}
            code, res = rjson('POST', '/save', page_body(photos=[big], deleted=[], order=[1]))
            check('POST pagina: foto raw6 (34.200 B = 45.600 caratteri) senza `thumb` → 200',
                  code == 200 and res == {'ok': True, 'seq': 4}, str(res))
            code, sj = rjson('GET', '/save.json')
            check("/save.json: rende l'ultimo payload (la foto raw6, seq 4)",
                  code == 200 and sj['seq'] == 4 and sj['photos'][0]['len'] == RAW6_BYTES
                  and sj['photos'][0]['data'] == b64url(raw6), str(sj)[:100])

            # Save "pieno": 12 foto raw6 = ~550 KB di corpo (il tetto di lettura e' 8 MiB)
            piene = [{'slot': k, 'photo_id': 1000 + k, 'fmt': FMT_RAW6, 'len': RAW6_BYTES,
                      'crc': zlib.crc32(raw6) & 0xFFFFFFFF, 'data': b64url(raw6),
                      'name': 'foto%d.jpg' % k} for k in range(MAX_SLOTS)]
            body_pieno = json.dumps(page_body(photos=piene, deleted=[],
                                              order=list(range(MAX_SLOTS)))).encode('utf-8')
            code, res = rjson('POST', '/save', page_body(photos=piene, deleted=[],
                                                         order=list(range(MAX_SLOTS))))
            check('POST pagina: 12 foto raw6 (%d KB di corpo) → 200 seq 5' % (len(body_pieno) // 1024),
                  code == 200 and res == {'ok': True, 'seq': 5}, str(res))
            code, sj = rjson('GET', '/save.json')
            check('/save.json: rende le 12 foto per intero (seq 5)',
                  code == 200 and sj['seq'] == 5 and len(sj['photos']) == MAX_SLOTS
                  and sj['photos'][11]['data'] == b64url(raw6), str(sj)[:90])

            senza_name = dict(photo_entry())
            del senza_name['name']
            bad_page = [
                ('CRC sbagliato', page_body(photos=[photo_entry(crc=crc1v ^ 1)])),
                ('len sbagliato', page_body(photos=[photo_entry(len=RAW6_BYTES)])),
                ('data troppo corta', page_body(photos=[photo_entry(data=data1[:-4])])),
                ('data fuori alfabeto base64url', page_body(photos=[photo_entry(data='+' + data1[1:])])),
                ('data con un a capo', page_body(photos=[photo_entry(data=data1[:-1] + '\n')])),
                ('thumb troppo lunga', page_body(photos=[photo_entry(
                    thumb='data:image/png;base64,' + 'A' * MAX_THUMB_CHARS)])),
                ('thumb non data:image/', page_body(photos=[photo_entry(thumb='http://x/y.png')])),
                ('name troppo lungo', page_body(photos=[photo_entry(name='n' * (MAX_NAME_CHARS + 1))])),
                # M7 #3: mezza emoji (surrogato spaiato) in `name`/`thumb`. Prima passava, e
                # poi /save.json rispondeva 500 per sempre: ora si ferma qui, con 400.
                ('name con un surrogato spaiato', page_body(photos=[photo_entry(name='foto\ud83d.jpg')])),
                ('thumb con un surrogato spaiato',
                 page_body(photos=[photo_entry(thumb='data:image/png;base64,AA\udc00A')])),
                ('slot ripetuto in photos', page_body(photos=[photo_entry(slot=5),
                                                              photo_entry(slot=5, photo_id=7)])),
                ('slot fuori 0..11', page_body(photos=[photo_entry(slot=MAX_SLOTS)])),
                ('photo_id 0', page_body(photos=[photo_entry(photo_id=0)])),
                ('photo_id oltre 2^31-1', page_body(photos=[photo_entry(photo_id=0x80000000)])),
                ('fmt sconosciuto', page_body(photos=[photo_entry(fmt=3)])),
                ('campo sconosciuto nella foto', page_body(photos=[photo_entry(extra=1)])),
                ('foto senza `name`', page_body(photos=[senza_name])),
                ('13 foto', page_body(photos=[photo_entry(slot=k, photo_id=k + 1)
                                              for k in range(MAX_SLOTS)] + [photo_entry(slot=0)])),
                ('campo sconosciuto in cima', page_body(scenario='crc')),
                ('deleted con 12', page_body(deleted=[MAX_SLOTS])),
                ('deleted con doppioni', page_body(deleted=[1, 1])),
                ('deleted non lista', page_body(deleted=3)),
                ('order con doppioni', page_body(order=[2, 2])),
                ('order con true (bool, non intero)', page_body(order=[True])),
                ('settings incomplete', page_body(settings={'layout': 1})),
                ('settings fuori intervallo', page_body(settings=dict(default_settings(), font=9))),
                ('v mancante', {'settings': default_settings(), 'order': [], 'deleted': []}),
                ('v = 2', page_body(v=2)),
                ('v = 1.0 (float)', page_body(v=1.0)),
                ('v = true', page_body(v=True)),
                ('settings mancanti', {'v': 1, 'order': [], 'deleted': []}),
                # M2-bis F2: senza `deleted` il corpo finiva nel validatore della pagina di
                # prova, che lo accettava con 200 azzerando /save.json (Save persa in silenzio).
                ('deleted mancante, con foto', dict_senza(page_body(), 'deleted')),
                ('deleted mancante, solo settings + order (il caso silenzioso)',
                 {'v': 1, 'settings': default_settings(), 'order': [0]}),
                ('deleted mancante, photos vuoto',
                 dict_senza(page_body(photos=[]), 'deleted')),
            ]
            for label, body in bad_page:
                code, res = rjson('POST', '/save', body)
                check('POST pagina non valido (%s) → 400' % label,
                      code == 400 and res and res.get('ok') is False and res.get('error'),
                      'code=%s res=%s' % (code, str(res)[:90]))
            code, sj2 = rjson('GET', '/save.json')
            check('dopo i POST non validi: /save.json invariato (l\'ultimo Save buono)',
                  sj2 == sj, str(sj2)[:80])
            code, res = rjson('GET', '/save.json')
            check('e /save.json risponde ancora 200 (il payload buono non è stato avvelenato)',
                  code == 200 and res is not None, 'code=%s' % code)

            # M7 #3 (seconda meta'): anche se un surrogato spaiato arrivasse comunque nello
            # stato (payload messo li' a mano), la risposta JSON non deve piu' andare in 500
            # «per sempre»: `_json` usa ensure_ascii=True e lo scrive come escape.
            buono = relay_state.last_payload
            avvelenato = json.loads(json.dumps(buono))
            avvelenato['photos'][0]['name'] = 'mezza\ud83demoji.jpg'
            relay_state.last_payload = avvelenato
            try:
                code, _h, blob = rreq('GET', '/save.json')
                letto = json.loads(blob.decode('utf-8'))
                check('_json: un surrogato spaiato nello stato non fa più 500 (escape \\uXXXX, '
                      'JSON rileggibile)',
                      code == 200 and blob.isascii()
                      and letto['photos'][0]['name'] == 'mezza\ud83demoji.jpg',
                      'code=%s body=%r' % (code, blob[:60]))
            finally:
                relay_state.last_payload = buono
            code, sj2b = rjson('GET', '/save.json')
            check('e lo stato buono torna intatto dopo la prova', sj2b == sj2, str(sj2b)[:60])
            check('_bad_surrogate: passa il testo normale, ferma il surrogato spaiato',
                  _bad_surrogate('città 👍.jpg', 'x') is None
                  and 'surrogato spaiato' in (_bad_surrogate('a\ud83db', 'photos.name') or ''),
                  repr(_bad_surrogate('a\ud83db', 'photos.name')))

            # --- M2-bis F2: il corpo della PAGINA DI PROVA non deve finire nel ramo pagina ---
            code, res = rjson('POST', '/save', {'v': 1, 'settings': {'layout': 1}, 'order': [0],
                                                'scenario': 'crc'})
            check('POST della pagina di prova (con `scenario`) resta al suo validatore → 200',
                  code == 200 and res.get('ok') is True, str(res))
            code, sj3 = rjson('GET', '/save.json')
            check('e riporta /save.json allo stato del server (relay: senza `full`)',
                  code == 200 and 'full' not in sj3 and 'photos' not in sj3
                  and sj3.get('settings', {}).get('layout') == 1, str(sj3)[:90])
            check('looks_like_page_save: `deleted` presente → pagina vera',
                  looks_like_page_save({'deleted': []}) is True)
            check('looks_like_page_save: v+settings+order senza deleted → pagina vera (400 chiaro)',
                  looks_like_page_save({'v': 1, 'settings': {}, 'order': []}) is True)
            check('looks_like_page_save: `scenario` → pagina di prova',
                  looks_like_page_save({'v': 1, 'settings': {}, 'order': [],
                                        'scenario': 'crc'}) is False)
            check('looks_like_page_save: photos [{slot, src}] → pagina di prova',
                  looks_like_page_save({'v': 1, 'settings': {}, 'order': [],
                                        'photos': [{'slot': 0, 'src': 0}]}) is False)
            check('looks_like_page_save: corpo vuoto o parziale → pagina di prova',
                  looks_like_page_save({}) is False
                  and looks_like_page_save({'settings': {}, 'order': []}) is False
                  and looks_like_page_save([1, 2]) is False)

            # --- M2-bis F1: l'avviso «`full` con zero foto» (il payload NON cambia) ---
            avviso = empty_full_warning(False, 0)
            check('senza --album e senza relay: avviso che il `full` vuoto svuota l\'album',
                  len(avviso) == 2 and 'CANCELLA TUTTI' in avviso[1] and '--relay' in avviso[1],
                  repr(avviso))
            check('con relay o con foto: nessun avviso',
                  empty_full_warning(True, 0) == [] and empty_full_warning(False, 3) == [])

            # --- modalita' pool: il POST della pagina vera passa lo stesso (§6.5) ---
            code, _h, blob = req('POST', '/save',
                                 body=json.dumps(page_body(photos=[], deleted=[], order=[0])).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'})
            res = json.loads(blob.decode('utf-8'))
            check('pool: il POST della config page vera è accettato lo stesso (utile ai test)',
                  code == 200 and res.get('ok') is True, str(res))
            _c, _h, sjp = get_json('/save.json')
            _c, _h, stp = get_json('/state.json')
            check('pool: dopo quel POST /save.json rende il payload della pagina (senza `full`)',
                  'full' not in sjp and sjp.get('deleted') == [] and sjp.get('order') == [0], str(sjp)[:90])
            check('pool: /state.json resta il `full` del pool (autorità al riavvio del PKJS)',
                  stp.get('full') is True and len(stp['photos']) == 4, str(stp)[:80])
            code, _h, blob = req('POST', '/save', body=b'{}',
                                 headers={'Content-Type': 'application/json'})
            _c, _h, sjp2 = get_json('/save.json')
            check('pool: un Save della pagina di prova riporta /save.json allo stato del pool',
                  code == 200 and sjp2.get('full') is True and sjp2 == get_json('/state.json')[2],
                  str(sjp2)[:80])
        finally:
            relay_httpd.shutdown()
            relay_httpd.server_close()
            rthread.join(timeout=5)

        # --- la pagina incorporata ESEGUITA (node): senza `settings`, con, senza return_to (F13) ---
        node = shutil.which('node')
        if node is None:
            print('selftest: `node` non trovato → pagina non eseguita (node non è una dipendenza '
                  "dell'SDK; la esegue apps/galleria/test/test_devpage.js)")
        else:
            harness = os.path.join(tmp, 'page_check.js')
            with io.open(harness, 'w', encoding='utf-8') as fh:
                fh.write(PAGE_CHECK_JS)
            two = [{'slot': 0, 'src': 0}, {'slot': 1, 'src': 1}]
            custom = default_settings()
            custom.update({'layout': 1, 'interval_min': 5, 'info_row': 3})
            variants = {
                'no': (DevState(pool, two, [0, 1], default_settings(), 'photo', settings_set=False),
                       'http://localhost:5555/close?'),
                'yes': (DevState(pool, two, [1, 0], custom, 'crc', settings_set=True),
                        'http://localhost:5555/close?'),
                'nort': (DevState(pool, two, [0, 1], default_settings(), 'photo', settings_set=False),
                         ''),
            }
            token = '%7B%22v%22%3A1%2C%22dev%22%3Atrue%2C%22seq%22%3A2%7D'   # {"v":1,"dev":true,"seq":2}
            expect_defaults = dict((k, str(v)) for k, v in SETTINGS_DEFAULTS.items())
            expect_custom = dict((k, str(v)) for k, v in custom.items())
            for label, (dstate, return_to) in variants.items():
                inp = os.path.join(tmp, 'page_%s.json' % label)
                with io.open(inp, 'w', encoding='utf-8') as fh:
                    json.dump({'page': PAGE_HTML, 'pool': dstate.pool_dict(), 'state': dstate.state_dict(),
                               'return_to': return_to}, fh)
                proc = subprocess.run([node, harness, inp], capture_output=True, encoding='utf-8', timeout=60)
                try:
                    res = json.loads(proc.stdout) if proc.returncode == 0 else None
                except ValueError:
                    res = None
                check('pagina/%s: node esegue lo script e riporta JSON' % label, res is not None,
                      'rc=%s stderr=%s' % (proc.returncode, proc.stderr.strip()[-160:]))
                if res is None:
                    continue
                ld = res['loaded']
                check('pagina/%s: nessuna eccezione al caricamento' % label, res['load_error'] is None,
                      str(res['load_error']))
                check('pagina/%s: 10 campi impostazioni, dataset.built, 6 scenari, pool e ordine resi' % label,
                      ld['settings_children'] == 10 and ld['built'] == '1' and ld['scenario_options'] == 6
                      and ld['pool_children'] == 3 and ld['order_children'] == 2,
                      'campi=%s built=%s scenari=%s pool=%s ordine=%s' % (
                          ld['settings_children'], ld['built'], ld['scenario_options'],
                          ld['pool_children'], ld['order_children']))
                if label == 'yes':
                    check('pagina/yes: i campi valgono le impostazioni di state.json e lo scenario "crc"',
                          ld['values'] == expect_custom and ld['scenario_value'] == 'crc',
                          '%s %s' % (ld['values'], ld['scenario_value']))
                    check('pagina/yes: #head NON dice "impostazioni: default"',
                          'impostazioni: default' not in ld['head'], ld['head'])
                else:
                    check('pagina/%s: senza `settings` i campi valgono pool.json.settings_defaults' % label,
                          ld['values'] == expect_defaults and ld['scenario_value'] == 'photo',
                          '%s %s' % (ld['values'], ld['scenario_value']))
                    check('pagina/%s: #head dice "impostazioni: default (non ancora salvate)"' % label,
                          'impostazioni: default (non ancora salvate)' in ld['head'], ld['head'])
                rr = res['rerender']
                check('pagina/%s: secondo render(): nessun doppione e il campo modificato resta' % label,
                      res['rerender_error'] is None and rr['settings_children'] == 10
                      and rr['scenario_options'] == 6 and rr['values'].get('font') == '2',
                      'err=%s campi=%s scenari=%s font=%s' % (res['rerender_error'], rr['settings_children'],
                                                               rr['scenario_options'], rr['values'].get('font')))
                sv = res['save']
                want_settings = dict(custom if label == 'yes' else SETTINGS_DEFAULTS)
                want_settings['font'] = 2
                body = sv['posts'][0]['body'] if len(sv['posts']) == 1 and sv['posts'][0]['body'] else {}
                check('pagina/%s: Salva → un solo POST /save con settings (10), order, photos, scenario' % label,
                      res['save_error'] is None and len(sv['posts']) == 1 and sv['posts'][0]['url'] == '/save'
                      and body.get('settings') == want_settings
                      and body.get('order') == dstate.order and body.get('photos') == two
                      and body.get('scenario') == dstate.scenario and sv['err'] == '',
                      'err=%s posts=%d body=%s #err=%s' % (res['save_error'], len(sv['posts']),
                                                           json.dumps(body)[:120], sv['err']))
                if return_to:
                    check('pagina/%s: dopo il Salva torna a return_to + token {"v":1,"dev":true,"seq":2}' % label,
                          sv['hrefs'] == [return_to + token], str(sv['hrefs']))
                    check('pagina/%s: Annulla → return_to senza query' % label,
                          res['cancel_error'] is None and res['cancel']['hrefs'] == [return_to],
                          str(res['cancel']))
                else:
                    check('pagina/nort: senza return_to → "salvato (seq 2)", nessun redirect, #head senza "default"',
                          sv['hrefs'] == [] and sv['msg'] == 'salvato (seq 2)'
                          and 'impostazioni: default' not in sv['head'] and sv['head'].startswith('seq 2 '),
                          'hrefs=%s msg=%s head=%s' % (sv['hrefs'], sv['msg'], sv['head']))
                    check('pagina/nort: Annulla senza return_to → location.reload()',
                          res['cancel_error'] is None and res['cancel']['reloads'] == 1
                          and res['cancel']['hrefs'] == [], str(res['cancel']))

        # --- SIGTERM: la temporanea viene rimossa come con Ctrl-C (README §11) ---
        # Album vuoto: nessuna conversione, il server e' su in poche decine di ms.
        proc = subprocess.Popen([sys.executable, os.path.abspath(__file__), '--port', '0'],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True)
        work_dir = None
        try:
            deadline = time.time() + 20.0
            while time.time() < deadline:
                line = proc.stdout.readline()
                if not line:
                    break
                found = re.search(r'raw e anteprime in (\S+) \(temporanea\)', line)
                if found:
                    work_dir = found.group(1)
                    break
            check('SIGTERM: il server annuncia la cartella temporanea', work_dir is not None)
            if work_dir:
                check('SIGTERM: la temporanea esiste mentre il server gira', os.path.isdir(work_dir),
                      work_dir)
                proc.send_signal(signal.SIGTERM)
                proc.wait(timeout=15)
                check('SIGTERM: uscita pulita (0)', proc.returncode == 0, 'rc=%s' % proc.returncode)
                check('SIGTERM: temporanea rimossa', not os.path.exists(work_dir), work_dir)
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=5)
            if proc.stdout is not None:
                proc.stdout.close()

    except Exception as exc:                                          # pragma: no cover
        import traceback
        traceback.print_exc()
        check('selftest senza eccezioni', False, str(exc))
    finally:
        if httpd is not None:
            httpd.shutdown()
            httpd.server_close()
        if thread is not None:
            thread.join(timeout=5)
        shutil.rmtree(tmp, ignore_errors=True)

    ok = sum(1 for _l, good, _d in results if good)
    bad_n = len(results) - ok
    for label, good, detail in results:
        if not good:
            print('FALLITO  %s%s' % (label, ('  [%s]' % detail) if detail else ''))
    print('devserver selftest: %d ok, %d falliti' % (ok, bad_n))
    return 0 if bad_n == 0 else 1


# ------------------------------------------------------------------ main ----

class Terminated(Exception):
    """SIGTERM ricevuto: sale fino al `finally` di main(), che ripulisce la temporanea."""


def _on_sigterm(_signum, _frame):
    raise Terminated()


def install_sigterm_handler():
    """SIGTERM (`kill`, `timeout 60 ...`, `pkill`) trattato come Ctrl-C.

    Senza questo la cartella temporanea di --work sopravviveva a ogni `timeout ... ` —
    contro quanto promette tools/README.md §11 ("rimossa all'uscita"), e le convenzioni del
    progetto usano `timeout` per i comandi lunghi. `signal.signal` funziona solo nel thread
    principale: altrove (import da un test) si lascia perdere in silenzio.
    """
    try:
        signal.signal(signal.SIGTERM, _on_sigterm)
    except (ValueError, AttributeError, OSError):            # pragma: no cover
        pass


def build_parser():
    ap = argparse.ArgumentParser(
        prog='galleria_devserver.py',
        description="Dev server della watchface Galleria (S5b): in emulatore fa le veci della "
                    "config page del telefono (album, impostazioni, ordine, scenari di guasto).",
        epilog="Esempi:\n"
               "  %(prog)s --album a.jpg b.png --settings '{\"interval_min\": 5}'\n"
               "  %(prog)s --album a.jpg b.jpg c.jpg --slots 3,7,11 --order 11,3,7 --scenario crc\n"
               "  %(prog)s --album a.jpg --photo-prep-args=\"--sunlight\"\n"
               "  %(prog)s --page-dir apps/galleria/src/pkjs/config      (S6: config page vera, relay)\n"
               "  %(prog)s --selftest\n"
               "Poi, da un altro terminale: pebble emu-app-config --emulator emery\n"
               "Documentazione: tools/README.md §11 · specifica: docs/design/galleria.md §5.1 e §6.",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', type=port_arg, default=8765, metavar='N',
                    help='porta di ascolto, 0..65535 (default: 8765; 0 = porta libera scelta dal sistema)')
    ap.add_argument('--bind', default='127.0.0.1',
                    help="indirizzo di ascolto (default: 127.0.0.1, solo questo PC)")
    ap.add_argument('--album', nargs='*', metavar='FOTO', default=[],
                    help='foto del pool (max %d): convertite con photo_prep.py in raw6 + raw1' % MAX_SLOTS)
    ap.add_argument('--slots', metavar='k,k,…',
                    help='slot delle foto di --album (default: 0,1,2,… ; valori 0..%d, unici)' % (MAX_SLOTS - 1))
    ap.add_argument('--order', metavar='k,k,…',
                    help="ordine di rotazione (default: gli slot nell'ordine dato); "
                         'slot senza foto o ripetuti = errore')
    ap.add_argument('--settings', metavar='JSON',
                    help='impostazioni iniziali, anche parziali, p.es. \'{"layout": 1, "interval_min": 5}\' '
                         '(campi: %s)' % ', '.join('%s %s' % (n, SETTINGS_RANGE_TEXT[n]) for n, _v, _d, _x in SETTINGS_SPEC))
    ap.add_argument('--scenario', choices=SCENARIOS, default='photo',
                    help='guasto iniettato nella sync del PKJS (default: photo = nessun guasto)')
    ap.add_argument('--work', metavar='DIR',
                    help='cartella dei raw e delle anteprime (default: temporanea, rimossa in '
                         'uscita sia con Ctrl-C sia con SIGTERM)')
    ap.add_argument('--page', metavar='FILE',
                    help='serve questo HTML su /config.html al posto della pagina incorporata (S6)')
    ap.add_argument('--page-dir', metavar='DIR',
                    help='config page vera (S6): inlinata da questa cartella con '
                         'tools/build_config_page.py a OGNI GET /config.html (si salva un file '
                         'e si ricarica il browser); esclusiva con --page. Senza --album accende '
                         'anche la modalità relay')
    ap.add_argument('--relay', action='store_true',
                    help='modalità relay (S6): /state.json senza `full` (solo v/seq/settings?/hooks), '
                         'nessun album sul server — le foto arrivano dalla config page con POST /save '
                         'e il PKJS le tiene nel suo localStorage. Automatica con --page-dir senza '
                         '--album; non si usa con --album')
    ap.add_argument('--photo-prep-args', metavar='"…"', default='',
                    help='opzioni extra passate a photo_prep.py; serve la forma con l\'uguale, '
                         'p.es. --photo-prep-args="--sunlight --gamma 0.9" (senza "=" argparse '
                         'scambierebbe --sunlight per una propria opzione)')
    ap.add_argument('--selftest', action='store_true',
                    help='autotest di tutti gli endpoint su immagini sintetiche, poi esce (0/1)')
    ap.add_argument('--dump-page', action='store_true',
                    help='stampa su stdout la pagina di /config.html (quella incorporata, il file '
                         'di --page o la pagina inlinata da --page-dir) ed esce senza avviare il '
                         'server: serve al test node della pagina (apps/galleria/test/test_devpage.js)')
    ap.add_argument('--dump-json', choices=('pool', 'state'), metavar='pool|state',
                    help='stampa su stdout /pool.json o /state.json costruiti dalle opzioni date '
                         '(--album, --slots, --order, --settings, --scenario, --relay) ed esce senza '
                         'avviare il server')
    return ap


def _write_stdout(text):
    """Testo UTF-8 su stdout anche con un locale non UTF-8 (la pagina ha «è», «→», «×»)."""
    raw = getattr(sys.stdout, 'buffer', None)
    if raw is not None:
        raw.write(text if isinstance(text, bytes) else text.encode('utf-8'))
        raw.flush()
    else:                                    # stdout sostituito (StringIO nel selftest)
        sys.stdout.write(text.decode('utf-8') if isinstance(text, bytes) else text)
        sys.stdout.flush()


def build_state(args, slots, order, settings, work, prep_args, verbose=True):
    """Pool (photo_prep.py) + DevState dalle opzioni gia' validate: lo usano il server e --dump-json."""
    n = len(args.album)
    pool = build_pool(args.album, work, prep_args, verbose=verbose)
    return DevState(pool,
                    photos=[{'slot': slots[i], 'src': i} for i in range(n)],
                    order=normalize_order(order, slots),
                    settings=settings,
                    scenario=args.scenario,
                    settings_set=getattr(args, 'settings_set', bool(args.settings)),
                    relay=getattr(args, 'relay_mode', False))


def main(argv=None):
    ap = build_parser()
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()

    if len(args.album) > MAX_SLOTS:
        ap.error('--album: %d foto, il massimo è %d' % (len(args.album), MAX_SLOTS))

    if args.page and args.page_dir:
        ap.error('--page e --page-dir sono esclusive: o si serve un HTML già inlinato (--page) '
                 'o lo si inlina dalle sorgenti a ogni richiesta (--page-dir)')
    if args.page_dir and not os.path.isdir(args.page_dir):
        ap.error('--page-dir: %s non è una cartella' % args.page_dir)
    if args.relay and args.album:
        ap.error('--relay non si usa con --album: in relay il server non ha un album '
                 '(le foto arrivano dalla config page con POST /save)')
    # Relay esplicita, oppure automatica quando si serve la config page vera senza album:
    # è lì che un /state.json `full` vuoto cancellerebbe l'album del PKJS (F10).
    args.relay_mode = bool(args.relay) or (bool(args.page_dir) and not args.album)

    n = len(args.album)
    if args.slots:
        try:
            slots = parse_int_list(args.slots, '--slots')
        except ValueError as exc:
            ap.error(str(exc))
        if len(slots) != n:
            ap.error('--slots: %d valori per %d foto' % (len(slots), n))
        if any(s >= MAX_SLOTS for s in slots):
            ap.error('--slots: valori ammessi 0..%d' % (MAX_SLOTS - 1))
        if len(set(slots)) != len(slots):
            ap.error('--slots: slot ripetuti')
    else:
        slots = list(range(n))

    if args.order:
        try:
            order = parse_int_list(args.order, '--order')
        except ValueError as exc:
            ap.error(str(exc))
        unknown = [s for s in order if s not in slots]
        if unknown:
            ap.error('--order: slot senza foto: %s' % ','.join(str(s) for s in unknown))
        if len(set(order)) != len(order):
            ap.error('--order: slot ripetuti')
    else:
        order = list(slots)

    settings = default_settings()
    if args.settings:
        try:
            patch = json.loads(args.settings)
        except ValueError as exc:
            ap.error('--settings: JSON non valido (%s)' % exc)
        patch, err = validate_settings_patch(patch)
        if err:
            ap.error('--settings: %s' % err)
        settings.update(patch)
        args.settings_set = bool(patch)      # '{}' non esprime nulla: /state.json resta senza `settings` (revisione 29/08)
    else:
        args.settings_set = False

    page_html = PAGE_HTML
    if args.page:
        if not os.path.exists(args.page):
            ap.error('--page: %s non esiste' % args.page)
        try:
            with open(args.page, 'rb') as fh:
                page_html = fh.read()
        except OSError as exc:            # directory, permessi, I/O: messaggio, non traceback
            ap.error('--page: impossibile leggere %s (%s)' % (args.page, exc))

    prep_args = shlex.split(args.photo_prep_args) if args.photo_prep_args else []

    if args.dump_page:
        if args.page_dir:
            try:
                page_html = inline_page_dir(args.page_dir)
            except PageInlineError as exc:
                sys.stderr.write('--page-dir: %s\n' % exc)
                return 1
        _write_stdout(page_html)
        return 0

    if args.dump_json:
        # Stesso stato del server, ma senza porta ne' serve_forever: il pool si converte in
        # una temporanea (rimossa subito) e su stdout esce SOLO il JSON (niente righe "pool[..]").
        temp_work = None
        try:
            if args.work:
                work = os.path.abspath(args.work)
            else:
                temp_work = tempfile.mkdtemp(prefix='galleria_dev_')
                work = temp_work
            state = build_state(args, slots, order, settings, work, prep_args, verbose=False)
            out = state.pool_dict() if args.dump_json == 'pool' else state.state_dict()
            _write_stdout(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
        finally:
            if temp_work:
                shutil.rmtree(temp_work, ignore_errors=True)
        return 0

    temp_work = None
    httpd = None
    try:
        if args.work:
            work = os.path.abspath(args.work)
        else:
            temp_work = tempfile.mkdtemp(prefix='galleria_dev_')
            work = temp_work
        install_sigterm_handler()

        # La porta si prende PRIMA di convertire le foto: cosi' l'`except OSError` resta
        # stretto attorno al bind (un guaio di --work o di photo_prep.py non viene piu'
        # scambiato per "porta occupata") e con la porta gia' in uso non si pagano ~300 ms
        # per foto prima di scoprirlo.
        try:
            httpd = make_server(None, page_html, args.bind, args.port, page_path=args.page,
                                page_dir=args.page_dir)
        except (OSError, OverflowError) as exc:
            # OverflowError: porta fuori 0..65535 — port_arg() la ferma prima, ma make_server()
            # e' usabile anche da fuori main(), e un traceback nudo non e' un messaggio.
            sys.stderr.write('impossibile ascoltare su %s:%d — %s\n' % (args.bind, args.port, exc))
            return 1

        state = build_state(args, slots, order, settings, work, prep_args)
        httpd.state = state               # nessuna richiesta puo' arrivare prima di qui
        host, port = httpd.server_address[0], httpd.server_address[1]
        if host in ('0.0.0.0', '::', ''):
            host = '127.0.0.1'           # --bind su tutte le interfacce: 0.0.0.0 non si apre
        base = 'http://%s:%d' % ('[%s]' % host if ':' in host else host, port)
        page_note = ''
        if args.page:
            page_note = '  (--page %s)' % args.page
        elif args.page_dir:
            # Un giro di inlining subito, per dirlo ORA e non al primo GET: non è fatale,
            # con le sorgenti rotte il server parte lo stesso e /config.html risponde 500.
            def _startup_warn(message):
                # Segnati come gia' visti: il handler non li ripetera' a ogni GET.
                httpd.page_warned.add(message)
                sys.stderr.write('--page-dir: %s\n' % message)

            try:
                inlined = inline_page_dir(args.page_dir, warn=_startup_warn)
                page_note = '  (--page-dir %s, %d B inlinati a ogni richiesta)' % (
                    args.page_dir, len(inlined))
            except PageInlineError as exc:
                sys.stderr.write('--page-dir: %s\n  → /config.html risponderà 500 finché non '
                                 'si corregge (il server parte lo stesso)\n' % exc)
                page_note = '  (--page-dir %s: non inlinabile, vedi sopra)' % args.page_dir
        print('')
        print('dev server Galleria  %s/' % base)
        print('  pagina    %s/config.html%s' % (base, page_note))
        print('  stato     %s/state.json%s' % (
            base, '   (alias %s/save.json)' % base if not state.relay else ''))
        print('  pool      %s/pool.json' % base)
        if state.relay:
            print('  modalità RELAY: /state.json senza `full` (delta vuoto: il PKJS non cancella '
                  'niente) · scenario %s · seq %d' % (args.scenario, state.seq))
            print('  le foto arrivano dalla config page (POST /save) e il PKJS le rilegge da '
                  '%s/save.json' % base)
        else:
            print('  %d foto negli slot %s · ordine %s · scenario %s · seq %d'
                  % (n, ','.join(str(s) for s in slots) or '—',
                     ','.join(str(s) for s in state.order) or '—', args.scenario, state.seq))
            for line in empty_full_warning(state.relay, n):
                print(line)
            if empty_full_warning(state.relay, n):
                sys.stderr.write('attenzione: server senza --album e senza --relay: /state.json '
                                 '`full` con 0 foto svuota l\'album del PKJS (usare --relay)\n')
        print('  raw e anteprime in %s%s' % (work, ' (temporanea)' if temp_work else ''))
        print("in un altro terminale:  pebble emu-app-config --emulator emery")
        print('Ctrl-C per fermare.')
        print('', flush=True)
        httpd.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        print('\nchiuso.')
    except Terminated:
        print('\nchiuso (SIGTERM).')
    finally:
        if httpd is not None:
            httpd.server_close()
        if temp_work:
            shutil.rmtree(temp_work, ignore_errors=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
