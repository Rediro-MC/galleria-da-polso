#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Client WebDriver minimale (solo stdlib) per pilotare Firefox headless.

Serve al gate S6 di Galleria (docs/design/galleria-s6-config-page.md §9 e §11): aprire la
config page servita dal dev server (o dall'emulatore, via `pebble emu-app-config`), scegliere
una foto, trascinare/zoomare la cornice, salvare, fare screenshot — senza selenium e senza
alcuna dipendenza esterna (niente pip, niente $HOME sporcato).

Come funziona: `geckodriver` viene avviato su una porta libera (in una sessione a parte, cosi'
alla chiusura si uccide tutto l'albero di Firefox in un colpo) e parlato con il protocollo
W3C WebDriver via HTTP+JSON (urllib). Gli screenshot arrivano in **base64 dentro la risposta**
(nessun file scritto da Firefox).

Tre limiti dello snap Firefox, tutti gestiti dal tool (finding M6-scettico, 29/08):
  * i file per `<input type=file>` devono stare **sotto $HOME e fuori dalle cartelle nascoste**:
    da `~/.cache/…` l'input riceve nome e dimensione giusti ma la pagina legge NotFoundError.
    `set_file` copia da sola il file in ~/galleria-browser-files/ e **verifica** che la pagina
    riesca davvero a leggerne i byte (senza la verifica il gate vedrebbe un falso verde);
  * la finestra non scende sotto 500 px: `--width 400` verrebbe ignorato in silenzio. Il tool
    lo segnala e offre `narrow URL 400` (la pagina dentro un iframe stretto, interagibile);
  * `screenshot` cattura il solo viewport: per la pagina intera serve `screenshot-full`.

Due trappole della config page, chiuse dal tool (finding/gate M7, 30/08):
  * `click` porta prima l'elemento al **centro** del viewport (`into-view`, anche come passo a
    se'): il clic W3C lo scrolla da solo ma ALLINEANDOLO IN BASSO, cioe' sotto il footer
    `position: fixed` della pagina -> «element click intercepted». Dopo un'intercettazione
    riprova una volta e, se non passa, lo dice invece di fingere che il clic sia andato;
  * `open` dello STESSO URL (frammento a parte) passa da `about:blank`: senza, Firefox tratta
    la navigazione come un salto al frammento e non ricarica (dopo un `narrow URL 400` la
    pagina restava dentro la cornice).

Uso rapido:
    tools/galleria_browser.py --url http://127.0.0.1:8765/config.html#AAA screenshot ~/p.png
    tools/galleria_browser.py --url data:text/html,%3Ctitle%3Ex%3C/title%3E title
    tools/galleria_browser.py --script passi.json        # una sessione, tanti passi
    tools/galleria_browser.py emu-url                    # URL scritto da pebble emu-app-config
    tools/galleria_browser.py --selftest                 # prova tutto (exit 0 se manca Firefox)
"""

import argparse
import atexit
import base64
import glob
import html as html_mod
import io
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

VERSION = '1.1'

# Chiave con cui il protocollo W3C identifica un elemento nelle risposte JSON.
ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf'

DEFAULT_TIMEOUT = 30.0          # timeout dei comandi (s)
SESSION_TIMEOUT = 120.0         # avvio di Firefox: la prima volta lo snap ci mette parecchio
DRIVER_READY_TIMEOUT = 20.0     # attesa di /status su geckodriver
EMU_CONFIG_GLOB = '~/pebble-tool-emu-app-config-*.html'
GATE_PHOTOS = '~/.cache/galleria-gate/photos'
MIN_FF_WIDTH = 500              # Firefox/GTK non fa finestre piu' strette: sotto resta 500
DEFAULT_WIDTH = 500             # = il minimo reale (chiederne meno sarebbe ignorato)
DEFAULT_HEIGHT = 900            # finestra; il viewport e' ~86 px piu' basso (chrome del browser)
STAGE_DIR = '~/galleria-browser-files'   # copie leggibili dallo snap per <input type=file>


class BrowserError(Exception):
    """Ogni errore del client: messaggio in chiaro, mai un traceback in faccia all'utente."""


# Sessioni aperte: rete di sicurezza per Ctrl-C e uscite impreviste (niente processi orfani).
_LIVE = []


def _close_all():
    for br in list(_LIVE):
        try:
            br.close()
        except Exception:
            pass


atexit.register(_close_all)


# ------------------------------------------------------------------ utility ----

def free_port(bind='127.0.0.1'):
    """Porta libera scelta dal sistema (il socket viene chiuso subito: resta una finestra
    di corsa piccolissima, accettabile per un tool di test)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((bind, 0))
        return sock.getsockname()[1]
    finally:
        sock.close()


def _json_or_none(raw):
    try:
        return json.loads(raw.decode('utf-8'))
    except (UnicodeDecodeError, ValueError):
        return None


def _first_line(text, limit=300):
    text = (text or '').strip().replace('\r', '')
    line = text.split('\n')[0].strip()
    return line[:limit] + ('…' if len(line) > limit else '')


def _defrag(url):
    """URL senza il frammento (`#…`): quel che decide se Firefox ricarica davvero."""
    return (url or '').split('#', 1)[0]


def _same_document(url, current):
    """Vero se navigare a `url` sarebbe, per Firefox, un salto nel documento gia' aperto."""
    cur = _defrag(current)
    return bool(cur) and cur != 'about:blank' and cur == _defrag(url)


def _wd_error(payload, code, method, path):
    """Messaggio leggibile a partire dall'errore W3C ({value: {error, message, stacktrace}})."""
    if isinstance(payload, dict) and isinstance(payload.get('value'), dict):
        val = payload['value']
        return '%s %s → %s (HTTP %d): %s' % (method, path, val.get('error', 'errore'),
                                             code, _first_line(val.get('message', '')))
    return '%s %s → HTTP %d: %s' % (method, path, code, _first_line(str(payload)))


def _pid_alive(pid):
    """Il processo esiste ancora? (dopo `wait()` il pid e' stato raccolto: os.kill fallisce)."""
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
    except OSError:
        return False
    return True


def _mask_js(text):
    """Copia di `text` con stringhe e commenti sostituiti da spazi: serve a cercare un `return`
    o un `;` veri senza inciampare in `indexOf("return")` o in un punto e virgola dentro una
    stringa (finding M6-scettico: l'avvolgimento saltava in silenzio e il risultato era null)."""
    out = []
    i, n = 0, len(text)
    quote = None
    while i < n:
        ch = text[i]
        if quote is not None:
            if ch == '\\' and i + 1 < n:
                out.append('  ')
                i += 2
                continue
            if ch == quote:
                quote = None
                out.append(ch)
            else:
                out.append('\n' if ch == '\n' else ' ')
            i += 1
            continue
        if ch in '\'"`':
            quote = ch
            out.append(ch)
            i += 1
            continue
        if ch == '/' and i + 1 < n and text[i + 1] == '/':
            j = text.find('\n', i)
            j = n if j < 0 else j
            out.append(' ' * (j - i))
            i = j
            continue
        if ch == '/' and i + 1 < n and text[i + 1] == '*':
            j = text.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(''.join(' ' if c != '\n' else '\n' for c in text[i:j]))
            i = j
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


def _strip_semicolons(text):
    text = text.rstrip()
    while text.endswith(';'):
        text = text[:-1].rstrip()
    return text


def _as_body(script):
    """Il corpo di /execute/sync e' un corpo di funzione: senza `return` non torna nulla.
    Per comodita' da riga di comando una singola espressione viene avvolta in `return (…)`
    (un `;` finale non la rende un corpo, e un `return` dentro una stringa non conta)."""
    text = (script or '').strip()
    if not text:
        return 'return null;'
    masked = _mask_js(text)
    if re.search(r'\breturn\b', masked):
        return text
    if ';' in _strip_semicolons(masked):
        return text
    return 'return (' + _strip_semicolons(text) + ');'


def _needs_stage(path):
    """Firefox snap legge solo i file **sotto $HOME** e **fuori dalle cartelle nascoste**
    (interfaccia snap "home"): altrimenti l'input riceve il file ma la pagina prende
    NotFoundError / "The image could not be decoded". Verificato il 29/08/2026."""
    home = os.path.expanduser('~')
    full = os.path.abspath(os.path.expanduser(path))
    if not full.startswith(home + os.sep):
        return True
    rel = full[len(home) + 1:]
    return any(part.startswith('.') for part in rel.split(os.sep) if part)


# ------------------------------------------------------------------ Browser ----

class Browser(object):
    """Sessione Firefox headless pilotata via geckodriver. Usare come context manager:

        with Browser() as br:
            br.open('http://127.0.0.1:8765/config.html#AAA')
            br.click('#save')
    """

    NARROW_ID = 'galfr'

    def __init__(self, width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT, headless=True,
                 geckodriver=None, firefox=None, timeout=DEFAULT_TIMEOUT, profile=None,
                 verbose=False, driver_log=None):
        self.width = int(width)
        self.height = int(height)
        self.headless = bool(headless)
        self.timeout = float(timeout)
        if self.timeout <= 0:
            raise BrowserError('timeout non valido (%g): deve essere > 0' % self.timeout)
        if self.width <= 0 or self.height <= 0:
            raise BrowserError('dimensioni non valide (%dx%d)' % (self.width, self.height))
        self.verbose = bool(verbose)
        self.geckodriver = geckodriver or 'geckodriver'
        self.firefox = firefox
        self.profile = profile
        self.port = None
        self.base = None
        self.session = None
        self.proc = None
        self.caps = {}
        self.viewport = None        # (larghezza, altezza) reali: Firefox non scende sotto 500
        self.frame_css = None       # iframe in cui stiamo lavorando (comando `narrow`)
        self._driver_log = driver_log
        self._log_file = None
        self._log_path = None
        self._own_log = False
        self._closed = False
        self._staged = []
        self._stage_dir = None
        self._warned_width = False

    # -- ciclo di vita ------------------------------------------------------

    def start(self):
        """Avvia geckodriver e crea la sessione. Idempotente (riparte anche dopo close())."""
        if self.session:
            return self
        self._closed = False
        gd = shutil.which(self.geckodriver)
        if not gd:
            raise BrowserError('geckodriver non trovato (cercato "%s"): installarlo '
                               '(snap install geckodriver) oppure passare --geckodriver PERCORSO'
                               % self.geckodriver)
        if self.firefox:
            ff = shutil.which(self.firefox) or (self.firefox if os.path.exists(self.firefox) else None)
            if not ff:
                raise BrowserError('firefox non trovato in "%s"' % self.firefox)
            self.firefox = ff
        elif not shutil.which('firefox'):
            raise BrowserError('firefox non trovato nel PATH: installarlo oppure passare --firefox PERCORSO')

        if self._driver_log:
            self._log_path = os.path.abspath(os.path.expanduser(self._driver_log))
            self._log_file = io.open(self._log_path, 'wb')
        else:
            fd, self._log_path = tempfile.mkstemp(prefix='galleria_gecko_', suffix='.log')
            os.close(fd)
            self._log_file = io.open(self._log_path, 'wb')
            self._own_log = True

        self.port = free_port()
        self.base = 'http://127.0.0.1:%d' % self.port
        cmd = [gd, '--host', '127.0.0.1', '--port', str(self.port),
               '--log', 'debug' if self.verbose else 'warn']
        try:
            # start_new_session: geckodriver e tutto l'albero di Firefox finiscono in un gruppo
            # a parte, che close() puo' abbattere in blocco.
            self.proc = subprocess.Popen(cmd, stdout=self._log_file, stderr=subprocess.STDOUT,
                                         start_new_session=True)
        except OSError as exc:
            self._cleanup_log()
            raise BrowserError('impossibile avviare geckodriver: %s' % exc)
        except BaseException:
            self._cleanup_log()
            raise
        if self not in _LIVE:
            _LIVE.append(self)
        try:
            self._wait_driver()
            self._new_session()
            self._check_viewport()
        except BaseException:       # anche KeyboardInterrupt: mai lasciare processi orfani
            self.close()
            raise
        return self

    def _wait_driver(self):
        deadline = time.time() + DRIVER_READY_TIMEOUT
        while True:
            if self.proc.poll() is not None:
                raise BrowserError('geckodriver e\' uscito subito (codice %s)%s'
                                   % (self.proc.returncode, self._log_tail()))
            try:
                req = urllib.request.Request(self.base + '/status', method='GET')
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    payload = _json_or_none(resp.read()) or {}
                value = payload.get('value') or {}
                if value.get('ready', True):
                    return
            except (urllib.error.URLError, socket.timeout, OSError, ValueError):
                pass
            if time.time() >= deadline:
                raise BrowserError('geckodriver non risponde su %s dopo %.0f s%s'
                                   % (self.base, DRIVER_READY_TIMEOUT, self._log_tail()))
            time.sleep(0.1)

    def _new_session(self):
        args = ['-width', str(self.width), '-height', str(self.height)]
        if self.headless:
            args.insert(0, '-headless')
        opts = {'args': args}
        if self.firefox:
            opts['binary'] = self.firefox
        if self.profile:
            opts['args'] = ['-profile', os.path.abspath(os.path.expanduser(self.profile))] + args
        body = {'capabilities': {'alwaysMatch': {
            'browserName': 'firefox',
            'acceptInsecureCerts': True,
            'pageLoadStrategy': 'normal',
            'timeouts': {'implicit': 0,
                         'pageLoad': int(max(self.timeout, 10.0) * 1000),
                         'script': int(max(self.timeout, 10.0) * 1000)},
            'moz:firefoxOptions': opts,
        }}}
        value = self._raw('POST', '/session', body, timeout=SESSION_TIMEOUT)
        if not isinstance(value, dict) or not value.get('sessionId'):
            raise BrowserError('risposta inattesa alla creazione della sessione: %s'
                               % _first_line(json.dumps(value)))
        self.session = value['sessionId']
        self.caps = value.get('capabilities') or {}
        return self.session

    def _check_viewport(self):
        """Misura il viewport vero e avvisa se e' piu' largo di quello chiesto: Firefox non fa
        finestre sotto MIN_FF_WIDTH e senza avviso uno screenshot "a 400 px" sarebbe una bugia."""
        try:
            got = self._raw('POST', '/session/' + self.session + '/execute/sync',
                            {'script': 'return [window.innerWidth, window.innerHeight];',
                             'args': []}, timeout=self.timeout)
        except BrowserError:
            return None
        if isinstance(got, list) and len(got) == 2:
            try:
                self.viewport = (int(got[0]), int(got[1]))
            except (TypeError, ValueError):
                return None
            if self.viewport[0] > self.width and not self._warned_width:
                self._warned_width = True
                sys.stderr.write(
                    'attenzione: Firefox non fa finestre sotto %d px, il viewport e\' %dx%d '
                    'invece dei %d px chiesti. Per provare la pagina a %d px: '
                    '`narrow URL %d` (la apre in un iframe stretto).\n'
                    % (MIN_FF_WIDTH, self.viewport[0], self.viewport[1], self.width,
                       self.width, self.width))
        return self.viewport

    def close(self):
        """Chiude sessione, processo e tutto l'albero di Firefox, e cancella le copie dei file.
        Non lancia mai (nemmeno se arriva un Ctrl-C a meta'): e' pensata per il `finally`."""
        self._closed = True
        if self.session:
            try:
                self._raw('DELETE', '/session/' + self.session, timeout=10.0)
            except BaseException:
                pass            # un Ctrl-C qui non deve saltare l'uccisione del processo
            self.session = None
        self.frame_css = None
        if self.proc is not None:
            try:
                self._kill_tree()
            except BaseException:
                pass
            self.proc = None
        self._unstage()
        self._cleanup_log()
        try:
            _LIVE.remove(self)
        except ValueError:
            pass

    def _kill_tree(self):
        """SIGTERM (poi SIGKILL) all'intero gruppo di geckodriver: e' stato avviato con
        start_new_session, quindi il gruppo contiene anche Firefox e i suoi figli."""
        proc = self.proc
        if proc is None:
            return
        pgid = None
        if hasattr(os, 'killpg'):
            try:
                pgid = os.getpgid(proc.pid)
                if pgid == os.getpgid(0):       # non e' un gruppo nostro: mai toccarlo
                    pgid = None
            except OSError:
                pgid = None
        if proc.poll() is None:
            killed = False
            if pgid is not None:
                try:
                    os.killpg(pgid, signal.SIGTERM)
                    killed = True
                except OSError:
                    killed = False
            if not killed:
                proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                if pgid is not None:
                    try:
                        os.killpg(pgid, signal.SIGKILL)
                    except OSError:
                        proc.kill()
                else:
                    proc.kill()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
        else:
            try:
                proc.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
        if pgid is not None:                    # spazza eventuali superstiti (Firefox e figli)
            try:
                os.killpg(pgid, signal.SIGKILL)
            except OSError:
                pass

    def _cleanup_log(self):
        if self._log_file is not None:
            try:
                self._log_file.close()
            except Exception:
                pass
            self._log_file = None
        if self._own_log and self._log_path and os.path.exists(self._log_path):
            try:
                os.unlink(self._log_path)
            except OSError:
                pass
        if self._own_log:
            self._log_path = None

    def _unstage(self):
        for path in self._staged:
            try:
                os.unlink(path)
            except OSError:
                pass
        self._staged = []
        if self._stage_dir:
            for path in (self._stage_dir, os.path.dirname(self._stage_dir)):
                try:
                    os.rmdir(path)
                except OSError:
                    pass
            self._stage_dir = None

    def __enter__(self):
        return self.start()

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False

    def _log_tail(self, lines=3, per_line=160):
        """Coda del log di geckodriver, corta: prima era lunga abbastanza da annegare il
        messaggio d'errore vero (finding M6-scettico)."""
        if not self._log_path or not os.path.exists(self._log_path):
            return ''
        try:
            with io.open(self._log_path, encoding='utf-8', errors='replace') as fh:
                tail = fh.read()[-4000:].strip().split('\n')[-lines:]
        except OSError:
            return ''
        tail = [t.strip()[:per_line] for t in tail if t.strip()]
        return ('\n  log geckodriver: ' + '\n  '.join(tail)) if tail else ''

    # -- trasporto ----------------------------------------------------------

    def _raw(self, method, path, body=None, timeout=None):
        data = json.dumps(body).encode('utf-8') if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={'Content-Type': 'application/json; charset=utf-8',
                                              'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=timeout or self.timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            try:
                payload = _json_or_none(exc.read())
            except Exception:
                payload = None
            raise BrowserError(_wd_error(payload, exc.code, method, path))
        except (urllib.error.URLError, socket.timeout, OSError) as exc:
            reason = getattr(exc, 'reason', exc)
            alive = '' if (self.proc is None or self.proc.poll() is None) else ' (geckodriver e\' morto)'
            raise BrowserError('geckodriver non risponde (%s %s): %s%s%s'
                               % (method, path, reason, alive, self._log_tail(lines=2)))
        payload = _json_or_none(raw)
        if payload is None:
            raise BrowserError('%s %s: risposta non JSON (%d B)' % (method, path, len(raw)))
        return payload.get('value')

    def _call(self, method, path, body=None, timeout=None):
        if not self.session:
            if self._closed:
                raise BrowserError('sessione gia\' chiusa con close(): non la riapro di nascosto '
                                   '(chiamare start() o creare un nuovo Browser)')
            self.start()
        return self._raw(method, '/session/' + self.session + path, body, timeout=timeout)

    # -- comandi ------------------------------------------------------------

    def open(self, url):
        """Naviga (attende il load). `url` puo' essere http:, file: o data:.

        Se l'URL **senza frammento** e' quello gia' aperto, prima si passa da `about:blank`:
        Firefox tratterebbe la navigazione come un salto al frammento e la pagina NON si
        ricaricherebbe (difetto visto nel gate S6: dopo un `narrow URL 400` un `open` dello
        stesso URL lasciava la pagina dentro la cornice, e un `open` di rimedio dopo un
        errore ripartiva dal DOM di prima). Costa una navigazione in piu' solo in quel caso.
        """
        self.frame_top()
        self.frame_css = None
        if self.session and _same_document(url, self._current_url_quiet()):
            self._call('POST', '/url', {'url': 'about:blank'}, timeout=max(self.timeout, 60.0))
        self._call('POST', '/url', {'url': url}, timeout=max(self.timeout, 60.0))
        return url

    def _current_url_quiet(self):
        """URL corrente, '' se non si puo' sapere (sessione appena aperta, errore)."""
        try:
            return self._call('GET', '/url') or ''
        except BrowserError:
            return ''

    def title(self):
        return self._call('GET', '/title')

    def current_url(self):
        return self._call('GET', '/url')

    def exec(self, script, args=None, timeout=None):
        """Esegue uno script sincrono nella pagina. Il corpo e' un corpo di funzione:
        scrivere `return …` (una singola espressione viene avvolta automaticamente)."""
        return self._call('POST', '/execute/sync',
                          {'script': _as_body(script), 'args': list(args or [])}, timeout=timeout)

    execute = exec

    def exec_async(self, script, args=None, timeout=None):
        """Script asincrono: l'ultimo argomento e' la callback da chiamare col risultato."""
        return self._call('POST', '/execute/async',
                          {'script': script, 'args': list(args or [])}, timeout=timeout)

    def find(self, css, required=True, timeout=None):
        """Id dell'elemento W3C per il primo nodo che corrisponde, oppure None."""
        found = self._call('POST', '/elements', {'using': 'css selector', 'value': css},
                           timeout=timeout)
        if isinstance(found, list) and found:
            first = found[0]
            if isinstance(first, dict) and first:
                return first.get(ELEMENT_KEY) or list(first.values())[0]
        if required:
            raise BrowserError('nessun elemento per il selettore %r' % css)
        return None

    def find_all(self, css):
        found = self._call('POST', '/elements', {'using': 'css selector', 'value': css})
        out = []
        for item in found or []:
            if isinstance(item, dict) and item:
                out.append(item.get(ELEMENT_KEY) or list(item.values())[0])
        return out

    def click(self, css):
        """Clic W3C, ma prima l'elemento viene portato al **centro** del viewport.

        Il clic della specifica scrolla da se', pero' allineando l'elemento IN BASSO: nella
        config page, che tiene il footer `position: fixed` (Salva/Annulla), il bottone finiva
        sotto il footer e il clic moriva con «element click intercepted» (finding M7 #7).
        Dopo un'intercettazione si riprova **una volta** (la pagina puo' aver appena spostato
        qualcosa: un banner comparso, un riflusso); se e' ancora intercettato l'errore lo
        dice chiaramente, senza falsi verdi.
        """
        self.into_view(css)
        eid = self.find(css)
        try:
            self._call('POST', '/element/%s/click' % eid, {})
            return css
        except BrowserError as exc:
            if 'intercepted' not in str(exc):
                raise BrowserError('click su %r fallito: %s' % (css, exc))
        time.sleep(0.15)
        self.into_view(css)
        eid = self.find(css)
        try:
            self._call('POST', '/element/%s/click' % eid, {})
        except BrowserError as exc:
            raise BrowserError('click su %r fallito: intercettato anche dopo aver riportato '
                               'l\'elemento al centro del viewport (gli sta davvero sopra '
                               'qualcosa: footer fisso, overlay, banner). %s' % (css, exc))
        return css

    def into_view(self, css):
        """Porta l'elemento nel viewport. Il click lo fa da solo (specifica W3C), le azioni
        pointer/wheel no: senza questo, su una pagina lunga, drag e wheel muoiono con
        "move target out of bounds" (finding M6-scettico)."""
        try:
            return bool(self.exec(SCROLL_INTO_VIEW_JS, [css]))
        except BrowserError:
            return False

    def set_file(self, css, path, stage=True, verify=True):
        """Imposta un <input type=file>. Il file viene copiato in ~/galleria-browser-files/ se
        sta dove lo snap non lo legge (fuori da $HOME o in una cartella nascosta, ~/.cache/…
        compresa) e poi si **verifica** che la pagina riesca a leggerne i byte davvero. Se
        l'input e' nascosto dietro una <label> viene reso visibile al volo (una volta sola)."""
        full = os.path.abspath(os.path.expanduser(path))
        if not os.path.isfile(full):
            raise BrowserError('file non trovato per set_file: %s' % full)
        used = full
        if _needs_stage(full):
            if not stage:
                sys.stderr.write('attenzione: %s non e\' leggibile da Firefox snap (fuori da '
                                 '$HOME o cartella nascosta) e stage=False\n' % full)
            else:
                try:
                    used = self._stage_path(full)
                except OSError as exc:
                    raise BrowserError('impossibile copiare %s sotto %s: %s' % (full, STAGE_DIR, exc))
                sys.stderr.write('nota: %s sta dove Firefox snap non legge: uso la copia %s\n'
                                 % (full, used))
        eid = self.find(css)
        try:
            self._call('POST', '/element/%s/value' % eid, {'text': used})
        except BrowserError as exc:
            if 'interactable' not in str(exc) and 'not visible' not in str(exc):
                raise BrowserError('set_file su %r fallito: %s' % (css, exc))
            self.exec(UNHIDE_JS, [css])
            eid = self.find(css)
            try:
                self._call('POST', '/element/%s/value' % eid, {'text': used})
            except BrowserError as exc2:
                raise BrowserError('set_file su %r fallito anche dopo averlo reso visibile: %s'
                                   % (css, exc2))
        if verify:
            self._verify_readable(css, used)
        return used

    def _stage_path(self, full):
        """Copia il file in una cartella NON nascosta sotto $HOME (cancellata da close())."""
        if self._stage_dir is None:
            self._stage_dir = os.path.join(os.path.expanduser(STAGE_DIR), 'pid%d' % os.getpid())
            os.makedirs(self._stage_dir, exist_ok=True)
        dest = os.path.join(self._stage_dir, os.path.basename(full))
        shutil.copy2(full, dest)
        if dest not in self._staged:
            self._staged.append(dest)
        return dest

    def _verify_readable(self, css, path):
        """L'input puo' avere nome e dimensione giusti e la pagina non riuscire comunque a
        leggere i byte (snap + cartelle nascoste): senza questo controllo il gate vedrebbe un
        falso verde e darebbe la colpa alla pagina."""
        try:
            res = self.exec_async(FILE_READ_JS, [css], timeout=max(self.timeout, 10.0))
        except BrowserError as exc:
            sys.stderr.write('attenzione: lettura del file non verificabile (%s)\n'
                             % _first_line(str(exc), 140))
            return None
        if not isinstance(res, dict):
            return None
        if res.get('ok'):
            return int(res.get('len') or 0)
        if res.get('err') == 'vuoto':
            sys.stderr.write('nota: l\'input %s non contiene (piu\') il file: lettura non '
                             'verificata\n' % css)
            return None
        raise BrowserError('la pagina non riesce a leggere %s (%s): Firefox snap legge solo i '
                           'file sotto $HOME e fuori dalle cartelle nascoste — copiarlo in %s'
                           % (path, res.get('err'), STAGE_DIR))

    def set_value(self, css, value):
        """Scrive `value` (checkbox/radio: `checked`) e lancia gli eventi `input` e `change`,
        come farebbe l'utente. Se un <select> non ha quell'opzione e' un errore (prima restava
        vuoto in silenzio); un valore corretto dal browser (min/max) viene segnalato."""
        out = self.exec(SET_VALUE_JS, [css, value])
        if out is None:
            raise BrowserError('set_value: nessun elemento per il selettore %r' % css)
        if not isinstance(out, dict):
            return out
        eff = out.get('value')
        req = out.get('requested')
        if req is not None and str(eff) != str(req):
            if out.get('tag') == 'select':
                opts = out.get('options') or []
                raise BrowserError('set_value su %r: %r non e\' fra le opzioni (%s); il <select> '
                                   'e\' rimasto su %r'
                                   % (css, req, ', '.join(repr(o) for o in opts) or 'nessuna', eff))
            sys.stderr.write('attenzione: set_value su %s ha dato %r invece di %r (valore '
                             'corretto dal browser: min/max/step?)\n' % (css, eff, req))
        return eff

    def text(self, css):
        """Testo visibile dell'elemento; se e' vuoto ricade su textContent (elementi nascosti)."""
        eid = self.find(css)
        got = self._call('GET', '/element/%s/text' % eid)
        if got:
            return got
        alt = self.exec('var e = document.querySelector(arguments[0]);'
                        ' return e ? (e.textContent || "") : null;', [css])
        return alt if alt is not None else (got or '')

    def wait_for(self, target, timeout=None, poll=0.12):
        """Attende un selettore CSS (presenza) o, con prefisso `js:`, un'espressione vera.
        Restituisce i secondi attesi; lancia BrowserError allo scadere. Ogni tentativo usa il
        tempo che resta (prima un singolo comando lento poteva sforare di 30 s)."""
        limit = float(timeout if timeout is not None else self.timeout)
        start = time.time()
        is_js = target.startswith('js:')
        expr = target[3:] if is_js else None
        last = ''
        while True:
            left = limit - (time.time() - start)
            step = max(1.0, min(self.timeout, left)) if left > 0 else 1.0
            try:
                if is_js:
                    if self.exec(expr, timeout=step):
                        return time.time() - start
                elif self.find(target, required=False, timeout=step) is not None:
                    return time.time() - start
            except BrowserError as exc:
                last = ' (ultimo errore: %s)' % _first_line(str(exc), 140)
            if time.time() - start >= limit:
                raise BrowserError('wait_for(%r) scaduto dopo %.1f s%s' % (target, limit, last))
            time.sleep(max(0.0, min(poll, limit - (time.time() - start))))

    def drag(self, css, dx, dy, steps=4, duration=120):
        """Trascina dal centro dell'elemento di (dx, dy) px con Pointer Events veri."""
        self.into_view(css)
        eid = self.find(css)
        dx, dy = int(dx), int(dy)
        steps = max(1, int(steps))
        moves = []
        done_x = done_y = 0
        for i in range(1, steps + 1):
            nx = int(round(dx * i / float(steps)))
            ny = int(round(dy * i / float(steps)))
            moves.append({'type': 'pointerMove', 'duration': int(duration / steps),
                          'origin': 'pointer', 'x': nx - done_x, 'y': ny - done_y})
            done_x, done_y = nx, ny
        actions = [{'type': 'pointerMove', 'duration': 0,
                    'origin': {ELEMENT_KEY: eid}, 'x': 0, 'y': 0},
                   {'type': 'pointerDown', 'button': 0}]
        actions += moves
        actions.append({'type': 'pointerUp', 'button': 0})
        self._perform([{'type': 'pointer', 'id': 'mouse',
                        'parameters': {'pointerType': 'mouse'}, 'actions': actions}])
        return {'css': css, 'dx': dx, 'dy': dy}

    def wheel(self, css, dy, dx=0, duration=100):
        """Rotellina sopra l'elemento (deltaY < 0 = verso l'alto = zoom + nella pagina S6).
        Se il driver non supporta le azioni `wheel` ricade su un WheelEvent sintetico."""
        self.into_view(css)
        eid = self.find(css)
        try:
            self._perform([{'type': 'wheel', 'id': 'wheel', 'actions': [
                {'type': 'scroll', 'x': 0, 'y': 0, 'origin': {ELEMENT_KEY: eid},
                 'deltaX': int(dx), 'deltaY': int(dy), 'duration': int(duration)}]}])
            return {'css': css, 'deltaY': int(dy), 'via': 'actions'}
        except BrowserError as exc:
            if 'unknown' not in str(exc) and 'invalid argument' not in str(exc):
                raise
            self.exec(WHEEL_JS, [css, int(dx), int(dy)])
            return {'css': css, 'deltaY': int(dy), 'via': 'script'}

    def _perform(self, actions):
        self._call('POST', '/actions', {'actions': actions})
        try:
            self._call('DELETE', '/actions')
        except BrowserError:
            pass

    # -- iframe stretto (la finestra non scende sotto 500 px) ----------------

    def enter_frame(self, css):
        eid = self.find(css)
        self._call('POST', '/frame', {'id': {ELEMENT_KEY: eid}})
        self.frame_css = css
        return css

    def frame_top(self):
        """Torna al documento principale."""
        if self.frame_css is None:
            return None
        css, self.frame_css = self.frame_css, None
        try:
            self._call('POST', '/frame', {'id': None})
        except BrowserError:
            pass
        return css

    def open_narrow(self, url, width, height=None):
        """Apre `url` dentro un iframe largo `width` px e ci entra: e' l'unico modo di provare
        la pagina a 360-400 px (Firefox non fa finestre sotto MIN_FF_WIDTH = 500 px). Da qui in
        poi i comandi agiscono dentro l'iframe; `screenshot` senza selettore inquadra l'iframe.

        La cornice viene costruita **nella pagina stessa** (stessa origine: l'iframe carica
        sempre), non con un data: URL: Firefox vieta la navigazione verso data: da file:// e
        l'iframe resterebbe vuoto in silenzio."""
        w = int(width)
        vp_h = self.viewport[1] if self.viewport else (self.height - 86)
        h = int(height or max(200, vp_h))
        self.frame_top()
        self.open(url)
        self.exec(NARROW_JS, [url, w, h, self.NARROW_ID])
        self.enter_frame('#' + self.NARROW_ID)
        deadline = time.time() + max(self.timeout, 10.0)
        href = ''
        while time.time() < deadline:
            href = self.exec('return location.href;') or ''
            if href and href != 'about:blank':
                break
            time.sleep(0.15)
        if not href or href == 'about:blank':
            self.frame_top()
            raise BrowserError('la cornice da %d px non ha caricato %s (l\'iframe e\' rimasto '
                               'vuoto: la pagina vieta di essere incorniciata?)' % (w, url))
        return {'url': href, 'width': w, 'height': h}

    def screenshot(self, path, css=None, full=False):
        """PNG (base64 nella risposta: nessun file scritto da Firefox).
        `css` = solo quell'elemento; `full` = pagina intera (non il solo viewport).
        Dentro un `narrow` senza selettore inquadra l'iframe (la pagina alla sua larghezza);
        li' `full` non e' possibile (Firefox taglia al viewport) e viene segnalato."""
        restore = None
        if css:
            self.into_view(css)
        elif self.frame_css:
            if full:
                sys.stderr.write('nota: dentro una cornice `narrow` la pagina intera non e\' '
                                 'catturabile (Firefox taglia gli screenshot al viewport): '
                                 'inquadro la cornice. Per la pagina intera: screenshot-full '
                                 'senza narrow.\n')
                full = False
            restore = self.frame_top()
            css = restore
        try:
            if css:
                eid = self.find(css)
                blob = self._call('GET', '/element/%s/screenshot' % eid)
            elif full:
                try:
                    blob = self._call('GET', '/moz/screenshot/full')
                except BrowserError:
                    blob = self._call('GET', '/screenshot')      # driver senza l'estensione Firefox
            else:
                blob = self._call('GET', '/screenshot')
        finally:
            if restore:
                self.enter_frame(restore)
        if not isinstance(blob, str) or not blob:
            raise BrowserError('screenshot: risposta vuota')
        try:
            data = base64.b64decode(blob)
        except Exception as exc:
            raise BrowserError('screenshot: base64 non valido (%s)' % exc)
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise BrowserError('screenshot: i byte non sono un PNG (%d B)' % len(data))
        dest = os.path.abspath(os.path.expanduser(path))
        try:
            parent = os.path.dirname(dest)
            if parent and not os.path.isdir(parent):
                os.makedirs(parent, exist_ok=True)
            with io.open(dest, 'wb') as fh:
                fh.write(data)
        except OSError as exc:
            raise BrowserError('screenshot: impossibile scrivere %s (%s)' % (dest, exc))
        info = {'path': dest, 'bytes': len(data)}
        if len(data) >= 24:
            info['w'] = int.from_bytes(data[16:20], 'big')
            info['h'] = int.from_bytes(data[20:24], 'big')
        return info


NARROW_JS = r"""
/* Sostituisce il corpo della pagina con un iframe largo `w`: la pagina vera ci gira dentro
   alla larghezza chiesta (la finestra di Firefox non scende sotto 500 px). */
var url = arguments[0], w = arguments[1], h = arguments[2], id = arguments[3];
document.documentElement.style.margin = '0';
document.body.innerHTML = '';
document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.background = '#777';
var fr = document.createElement('iframe');
fr.id = id;
fr.setAttribute('style', 'width:' + w + 'px;height:' + h + 'px;border:0;display:block;background:#fff');
fr.src = url;
document.body.appendChild(fr);
return true;
"""

SCROLL_INTO_VIEW_JS = r"""
var el = document.querySelector(arguments[0]);
if (!el) { return false; }
try { el.scrollIntoView({ block: 'center', inline: 'center' }); }
catch (e) { el.scrollIntoView(); }
return true;
"""

UNHIDE_JS = r"""
var el = document.querySelector(arguments[0]);
if (!el) { return false; }
var force = ['display:block', 'visibility:visible', 'opacity:1', 'position:static',
             'width:220px', 'height:36px', 'clip:auto', 'clip-path:none', 'left:auto', 'top:auto'];
for (var i = 0; i < force.length; i++) {
  var kv = force[i].split(':');
  el.style.setProperty(kv[0], kv[1], 'important');
}
el.removeAttribute('hidden');
return true;
"""

# Legge davvero i primi byte del file scelto: e' l'unico modo di sapere se la pagina puo'
# usarlo (con lo snap il nome e la dimensione arrivano anche quando i byte no).
FILE_READ_JS = r"""
var el = document.querySelector(arguments[0]);
var done = arguments[arguments.length - 1];
if (!el || !el.files || !el.files.length) { done({ ok: false, err: 'vuoto' }); return; }
var fr = new FileReader();
fr.onload = function () { done({ ok: true, len: fr.result.byteLength }); };
fr.onerror = function () { done({ ok: false, err: String((fr.error && fr.error.name) || 'errore') }); };
try { fr.readAsArrayBuffer(el.files[0].slice(0, 2048)); }
catch (e) { done({ ok: false, err: String(e) }); }
"""

SET_VALUE_JS = r"""
var el = document.querySelector(arguments[0]);
if (!el) { return null; }
var v = arguments[1];
var tag = (el.tagName || '').toLowerCase();
var isCheck = (el.type === 'checkbox' || el.type === 'radio');
var req = isCheck ? null : String(v);
var opts = null;
if (tag === 'select') {
  opts = [];
  for (var i = 0; i < el.options.length; i++) { opts.push(el.options[i].value); }
}
if (isCheck) {
  el.checked = !(v === false || v === 0 || v === '' || v === '0' || v === 'false' || v === null);
} else {
  el.value = req;
}
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
return { value: isCheck ? el.checked : el.value, requested: req, tag: tag,
         type: el.type || '', options: opts };
"""

WHEEL_JS = r"""
var el = document.querySelector(arguments[0]);
if (!el) { return null; }
var ev;
try {
  ev = new WheelEvent('wheel', { bubbles: true, cancelable: true,
                                 deltaX: arguments[1], deltaY: arguments[2], deltaMode: 0 });
} catch (e) {
  ev = document.createEvent('Event');
  ev.initEvent('wheel', true, true);
  ev.deltaX = arguments[1];
  ev.deltaY = arguments[2];
}
el.dispatchEvent(ev);
return true;
"""


# ------------------------------------------------- URL dell'emulatore ----

def emu_config_url(timeout=20.0, pattern=None, newer_than=None, poll=0.25):
    """URL della config page scritto da `pebble emu-app-config`.

    Il tool salva un file ~/pebble-tool-emu-app-config-<n>.html con dentro
    `<head><meta http-equiv="refresh" content="0;URL=…"></head>` e lo apre nel browser (con
    BROWSER=true non apre nulla: l'URL si legge da li'). Il file vive quanto il comando:
    quando la pagina torna su /close, `pebble emu-app-config` esce e lo cancella — leggerlo
    prima. `newer_than` = timestamp: ignora i file piu' vecchi (per non riprendere l'URL
    della sessione precedente)."""
    pat = os.path.expanduser(pattern or EMU_CONFIG_GLOB)
    deadline = time.time() + float(timeout)
    seen = 0
    while True:
        files = []
        for path in glob.glob(pat):
            try:
                files.append((os.path.getmtime(path), path))
            except OSError:
                continue
        seen = max(seen, len(files))
        for mtime, path in sorted(files, reverse=True):
            if newer_than is not None and mtime < float(newer_than) - 0.001:
                continue
            try:
                with io.open(path, encoding='utf-8', errors='replace') as fh:
                    text = fh.read()
            except OSError:
                continue
            match = re.search(r'''content\s*=\s*["']?\s*\d+\s*;\s*url\s*=\s*([^"'>]+)''',
                              text, re.IGNORECASE)
            if match:
                url = match.group(1).strip()
                # unescape solo se ci sono entita' vere (`&amp;`): html.unescape tradurrebbe
                # anche `&copy` senza punto e virgola, rovinando un parametro di query.
                if re.search(r'&(#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);', url):
                    url = html_mod.unescape(url)
                return url
        if time.time() >= deadline:
            raise BrowserError(
                'URL della config page non trovato in %.1f s (%s, %d file visti): lanciare '
                '`BROWSER=true pebble emu-app-config --emulator emery &` prima di questo comando'
                % (timeout, pat, seen))
        time.sleep(poll)


# ------------------------------------------------------------------- passi ----

def _arg_value(text):
    """Argomenti da riga di comando/JSON: numeri e booleani JSON restano tali."""
    if not isinstance(text, str):
        return text
    try:
        return json.loads(text)
    except ValueError:
        return text


def _num(args, i, usage):
    """Argomento numerico: un refuso deve dare un messaggio chiaro, non un ValueError nudo
    (e nemmeno avviare Firefox per poi morire)."""
    try:
        return float(args[i])
    except (TypeError, ValueError, IndexError):
        raise BrowserError('argomento %d non numerico (%r): %s'
                           % (i + 1, args[i] if i < len(args) else None, usage))


def _opened(url):
    """Conferma breve: un data: URL intero riempirebbe il terminale."""
    return 'aperto: ' + (url if len(url) <= 120 else url[:117] + '…')


def run_step(browser_box, cmd, args, opts):
    """Esegue un passo (CLI o --script). `browser_box` = [Browser|None, chiuso?]: il Browser
    viene creato pigramente (`emu-url` non ha bisogno di Firefox) e messo nella scatola
    **prima** di start(), cosi' un Ctrl-C durante l'avvio trova comunque il processo da
    chiudere; il secondo elemento ricorda un `close` esplicito."""
    cmd = (cmd or '').replace('_', '-')
    args = list(args or [])
    if len(browser_box) < 2:
        browser_box.append(False)

    def br():
        if browser_box[0] is None:
            if browser_box[1]:
                raise BrowserError('la sessione e\' stata chiusa dal passo `close`: non ne apro '
                                   'una nuova di nascosto (usare `open URL` per ripartire)')
            browser_box[0] = Browser(width=opts.width, height=opts.height,
                                     headless=not opts.no_headless,
                                     geckodriver=opts.geckodriver, firefox=opts.firefox,
                                     timeout=opts.timeout, verbose=opts.verbose,
                                     driver_log=opts.driver_log)
        return browser_box[0].start()

    def need(n, usage):
        if len(args) < n:
            raise BrowserError('argomenti mancanti: %s' % usage)

    if cmd in ('open', 'open-emu', 'narrow'):
        browser_box[1] = False          # `open` puo' ripartire dopo un `close`

    if cmd == 'open':
        need(1, 'open URL')
        return _opened(br().open(str(args[0])))
    if cmd == 'emu-url':
        return emu_config_url(timeout=_num(args, 0, 'emu-url [SECONDI]') if args else opts.timeout)
    if cmd == 'open-emu':
        secs = _num(args, 0, 'open-emu [SECONDI]') if args else opts.timeout
        return _opened(br().open(emu_config_url(timeout=secs)))
    if cmd == 'narrow':
        need(2, 'narrow URL LARGHEZZA [ALTEZZA]')
        w = _num(args, 1, 'narrow URL LARGHEZZA [ALTEZZA]')
        h = _num(args, 2, 'narrow URL LARGHEZZA [ALTEZZA]') if len(args) > 2 else None
        return br().open_narrow(str(args[0]), w, h)
    if cmd == 'frame':
        need(1, 'frame CSS')
        return br().enter_frame(str(args[0]))
    if cmd == 'frame-top':
        return br().frame_top() or 'documento principale'
    if cmd == 'title':
        return br().title()
    if cmd == 'current-url':
        return br().current_url()
    if cmd == 'viewport':
        b = br()
        return {'chiesto': [b.width, b.height], 'viewport': list(b.viewport or []),
                'minimo': MIN_FF_WIDTH}
    if cmd == 'exec':
        need(1, 'exec SCRIPT [ARG…]')
        return br().exec(str(args[0]), [_arg_value(a) for a in args[1:]])
    if cmd == 'find':
        need(1, 'find CSS')
        return br().find(str(args[0]), required=False) is not None
    if cmd == 'click':
        need(1, 'click CSS')
        return br().click(str(args[0]))
    if cmd == 'into-view':
        need(1, 'into-view CSS')
        return br().into_view(str(args[0]))
    if cmd == 'set-file':
        need(2, 'set-file CSS PERCORSO')
        return br().set_file(str(args[0]), str(args[1]))
    if cmd == 'set-value':
        need(2, 'set-value CSS VALORE')
        return br().set_value(str(args[0]), _arg_value(args[1]))
    if cmd == 'text':
        need(1, 'text CSS')
        return br().text(str(args[0]))
    if cmd in ('wait', 'wait-for'):
        need(1, 'wait SELETTORE|js:ESPRESSIONE [SECONDI]')
        secs = _num(args, 1, 'wait SELETTORE|js:ESPRESSIONE [SECONDI]') if len(args) > 1 else None
        return round(br().wait_for(str(args[0]), secs), 2)
    if cmd == 'drag':
        need(3, 'drag CSS DX DY')
        dx = _num(args, 1, 'drag CSS DX DY')
        dy = _num(args, 2, 'drag CSS DX DY')
        return br().drag(str(args[0]), dx, dy)
    if cmd == 'wheel':
        need(2, 'wheel CSS DY')
        dy = _num(args, 1, 'wheel CSS DY')
        return br().wheel(str(args[0]), dy)
    if cmd in ('screenshot', 'screenshot-full'):
        need(1, '%s PERCORSO [CSS]' % cmd)
        return br().screenshot(str(args[0]), str(args[1]) if len(args) > 1 else None,
                               full=(cmd == 'screenshot-full'))
    if cmd == 'sleep':
        need(1, 'sleep SECONDI')
        secs = _num(args, 0, 'sleep SECONDI')
        time.sleep(max(0.0, min(secs, 60.0)))
        return secs
    if cmd == 'close':
        if browser_box[0] is not None:
            browser_box[0].close()
            browser_box[0] = None
        browser_box[1] = True
        return 'chiuso'
    raise BrowserError('comando sconosciuto: %r (%s)' % (cmd, ', '.join(COMMANDS)))


COMMANDS = ('open', 'open-emu', 'emu-url', 'narrow', 'frame', 'frame-top', 'title', 'current-url',
            'viewport', 'exec', 'find', 'click', 'into-view', 'set-file', 'set-value', 'text',
            'wait', 'drag', 'wheel', 'screenshot', 'screenshot-full', 'sleep', 'close')


def load_script(path):
    """Lista di passi da un JSON: [{cmd, args}] oppure [["cmd", arg…]] oppure {"steps": […]}."""
    try:
        text = sys.stdin.read() if path == '-' else io.open(path, encoding='utf-8').read()
    except OSError as exc:
        raise BrowserError('impossibile leggere lo script: %s' % exc)
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise BrowserError('script non JSON: %s' % exc)
    if isinstance(data, dict):
        data = data.get('steps')
    if not isinstance(data, list):
        raise BrowserError('lo script deve essere una lista di passi (o {"steps": […]})')
    steps = []
    for i, item in enumerate(data):
        if isinstance(item, dict):
            cmd = item.get('cmd') or item.get('command')
            args = item.get('args', [])
            if not isinstance(args, list):
                args = [args]
        elif isinstance(item, list) and item:
            cmd, args = item[0], list(item[1:])
        elif isinstance(item, str):
            cmd, args = item, []
        else:
            raise BrowserError('passo %d non valido: %r' % (i + 1, item))
        if not cmd:
            raise BrowserError('passo %d senza "cmd"' % (i + 1))
        steps.append((str(cmd), args))
    return steps


def _print_value(value):
    if value is None:
        return
    if isinstance(value, str):
        sys.stdout.write(value + '\n')
    else:
        sys.stdout.write(json.dumps(value, ensure_ascii=False) + '\n')
    sys.stdout.flush()


# ---------------------------------------------------------------- selftest ----

SELFTEST_PAGE = u"""<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Galleria prova</title>
<style>body{font:16px system-ui,sans-serif;margin:12px}#c{border:2px solid #333;touch-action:none}
#spazio{height:1400px;background:linear-gradient(#eee,#ccc)}
.sp{height:900px;background:#eef}
#footer{position:fixed;left:0;right:0;bottom:0;height:56px;background:#fff;border-top:2px solid #333}
#velo{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.4)}</style>
</head><body>
<h1 id="h">pagina di prova</h1>
<p><input type="file" id="f" accept="image/*"></p>
<pre id="out"></pre>
<pre id="ev"></pre>
<div id="spazio">pagina lunga: il canvas sta sotto la piega (drag/wheel devono scrollare da soli)</div>
<canvas id="c" width="200" height="228"></canvas>
<p><select id="sel"><option value="0">zero</option><option value="1">uno</option></select>
<input type="range" id="rg" min="0" max="10" step="1" value="5"></p>
<div class="sp">altro spazio: il bottone qui sotto sta sotto la piega</div>
<p><button type="button" id="sotto">bottone sotto il footer fisso</button></p>
<div class="sp">coda, cosi' il bottone si puo' centrare</div>
<footer id="footer">footer fisso (come quello della config page: copre chi gli finisce sotto)</footer>
<script>
/* Pagina minima del --selftest: scrive l'hash in #out e conta gli eventi sul canvas. */
var out = document.getElementById('out');
out.textContent = location.hash;
window.GalProbe = { down: 0, move: 0, wheel: 0, file: '', click: 0 };
var c = document.getElementById('c');
function bump(k) {
  window.GalProbe[k] += 1;
  document.getElementById('ev').textContent =
    'down=' + window.GalProbe.down + ' move=' + window.GalProbe.move +
    ' wheel=' + window.GalProbe.wheel;
}
c.addEventListener('pointerdown', function () { bump('down'); });
c.addEventListener('pointermove', function () { bump('move'); });
c.addEventListener('mousedown', function () { bump('down'); });
c.addEventListener('mousemove', function () { bump('move'); });
c.addEventListener('wheel', function (e) { e.preventDefault(); bump('wheel'); }, { passive: false });
document.getElementById('sotto').addEventListener('click', function () {
  window.GalProbe.click += 1;
});
document.getElementById('f').addEventListener('change', function (e) {
  var fs = e.target.files;
  window.GalProbe.file = fs && fs.length ? fs[0].name : '';
  out.textContent = location.hash + ' file:' + window.GalProbe.file;
});
</script>
</body></html>
"""


def _pick_gate_photo(tmpdir):
    """Una foto da ~/.cache/galleria-gate/photos/ (cartella nascosta: e' apposta, cosi' il
    selftest prova la copia automatica di set_file). Se e' vuota se ne scrive una di ripiego."""
    base = os.path.expanduser(GATE_PHOTOS)
    cands = []
    if os.path.isdir(base):
        for name in sorted(os.listdir(base)):
            if name.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
                cands.append(os.path.join(base, name))
    if cands:
        cands.sort(key=lambda p: os.path.getsize(p))
        return cands[0], False
    os.makedirs(base, exist_ok=True)
    fallback = os.path.join(base, 'selftest_fallback.png')
    # PNG 1×1 minimo, scritto a mano: niente Pillow.
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
    with io.open(fallback, 'wb') as fh:
        fh.write(png)
    return fallback, True


def _serve_ok(base):
    """La pagina minima risponde davvero? (con --page-dir l'inlining di M1 potrebbe dire 500)"""
    try:
        with urllib.request.urlopen(base + '/config.html', timeout=5) as resp:
            body = resp.read().decode('utf-8', 'replace')
            return resp.getcode() == 200 and 'Galleria prova' in body
    except Exception:
        return False


def _stop_proc(proc):
    """Fermata per PID (mai `pkill -f`: ucciderebbe la shell che contiene lo stesso testo)."""
    if proc is None:
        return
    try:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
    except Exception:
        pass


def _spawn_devserver(dev, tmpdir, page_args, log_path):
    """Avvia il dev server su porta effimera e legge l'URL dalla sua prima riga di log."""
    log = io.open(log_path, 'wb')
    proc = subprocess.Popen([sys.executable, dev, '--port', '0'] + page_args,
                            stdout=log, stderr=subprocess.STDOUT, cwd=tmpdir)
    base = None
    deadline = time.time() + 25.0
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        try:
            with io.open(log_path, encoding='utf-8', errors='replace') as fh:
                text = fh.read()
        except OSError:
            text = ''
        match = re.search(r'dev server Galleria\s+(http://[^\s/]+)/', text)
        if match:
            base = match.group(1)
            break
        time.sleep(0.15)
    return proc, log, base


def _log_tail_file(path, limit=1200):
    try:
        with io.open(path, encoding='utf-8', errors='replace') as fh:
            return fh.read()[-limit:]
    except OSError:
        return ''


def _start_devserver(tmpdir, results):
    """Dev server in modalita' relay (nessun --album) su porta effimera, con la pagina
    minima: --page-dir se il server lo conosce gia' (S6), altrimenti --page. Se con
    --page-dir la pagina non arriva (inliner di M1 in corso d'opera) si ripiega su --page."""
    tools_dir = os.path.dirname(os.path.abspath(__file__))
    dev = os.path.join(tools_dir, 'galleria_devserver.py')
    if not os.path.exists(dev):
        raise BrowserError('galleria_devserver.py non trovato accanto a questo tool (%s)' % tools_dir)
    page = os.path.join(tmpdir, 'page.html')
    with io.open(page, 'w', encoding='utf-8') as fh:
        fh.write(SELFTEST_PAGE)
    try:
        helptext = subprocess.run([sys.executable, dev, '--help'], stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, timeout=30).stdout.decode('utf-8', 'replace')
    except Exception:
        helptext = ''
    candidates = []
    if '--page-dir' in helptext:
        candidates.append(['--page-dir', tmpdir])
    candidates.append(['--page', page])

    last = ''
    for i, page_args in enumerate(candidates):
        log_path = os.path.join(tmpdir, 'devserver%d.log' % i)
        proc, log, base = _spawn_devserver(dev, tmpdir, page_args, log_path)
        if base and _serve_ok(base):
            results.append(('dev server in relay su %s (%s)' % (base, page_args[0]), True, ''))
            return proc, log, base
        last = '%s → %s\n%s' % (' '.join(page_args),
                                'nessun URL nel log' if not base else '/config.html non serve la pagina',
                                _log_tail_file(log_path))
        _stop_proc(proc)
        try:
            log.close()
        except Exception:
            pass
        if i + 1 < len(candidates):
            results.append(('--page-dir non utilizzabile: ripiego su --page', True, last.split('\n')[0]))
    raise BrowserError('dev server non partito (%s)' % last)


def _gecko_procs():
    """pid → riga di comando di geckodriver e dei Firefox pilotati da lui (-marionette).
    Un Firefox aperto a mano dall'utente non ha -marionette: non viene contato."""
    try:
        out = subprocess.run(['ps', '-eo', 'pid,args'], stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, timeout=15).stdout.decode('utf-8', 'replace')
    except Exception:
        return {}
    procs = {}
    for line in out.splitlines()[1:]:
        parts = line.strip().split(None, 1)
        if len(parts) != 2 or not parts[0].isdigit():
            continue
        if 'geckodriver' in parts[1] or '-marionette' in parts[1]:
            procs[int(parts[0])] = parts[1][:110]
    return procs


def _check_pure(check, tmpdir, opts):
    """Controlli che non hanno bisogno del browser (avvolgimento exec, staging, argomenti,
    scatola dei passi, timeout, coda del log)."""
    # --- exec: avvolgimento in `return (…)` (finding: risultato null in silenzio)
    check('exec: "return" dentro una stringa non impedisce l\'avvolgimento',
          _as_body('x.indexOf("return")') == 'return (x.indexOf("return"));',
          _as_body('x.indexOf("return")'))
    check('exec: il punto e virgola finale non trasforma l\'espressione in un corpo',
          _as_body('window.MARK.length;') == 'return (window.MARK.length);',
          _as_body('window.MARK.length;'))
    check('exec: un corpo con `return` vero resta intatto',
          _as_body('var a = 1; return a;') == 'var a = 1; return a;')
    check('exec: un `;` vero (non finale) resta un corpo',
          _as_body('var a = 1; a') == 'var a = 1; a')

    # --- staging dei file (finding alta: cartelle nascoste illeggibili dallo snap)
    check('set_file: riconosce i percorsi che Firefox snap non legge',
          _needs_stage(GATE_PHOTOS + '/a.jpg') and _needs_stage('/tmp/a.jpg')
          and _needs_stage('~/.hidden/a.jpg') and not _needs_stage('~/foto/a.jpg')
          and not _needs_stage('~/foto/sub/a.jpg'),
          'nascosta=%s /tmp=%s visibile=%s' % (_needs_stage(GATE_PHOTOS + '/a.jpg'),
                                               _needs_stage('/tmp/a.jpg'),
                                               _needs_stage('~/foto/a.jpg')))

    # --- open dello stesso documento: quando serve il giro da about:blank (gate M7)
    base = 'http://127.0.0.1:8765/config.html'
    check('_same_document: stesso URL, frammento diverso o assente → stesso documento',
          _same_document(base + '#AAA', base + '#BBB') and _same_document(base, base + '#X')
          and _same_document(base + '#A', base),
          '%s' % _same_document(base + '#AAA', base + '#BBB'))
    check('_same_document: URL diverso, about:blank o pagina non ancora aperta → no',
          not _same_document(base, base + 'x') and not _same_document(base, 'about:blank')
          and not _same_document(base, '') and not _same_document(base, None),
          'diverso=%s vuoto=%s' % (_same_document(base, base + 'x'), _same_document(base, '')))
    check('`into-view` è fra i comandi elencati nell\'aiuto',
          'into-view' in COMMANDS and 'into-view CSS' in EPILOG)

    # --- argomenti non numerici: messaggio chiaro e nessun Firefox avviato
    bad = []
    box = [None, False]
    for cmd, args in (('sleep', ['abc']), ('drag', ['#h', 'a', 'b']),
                      ('wheel', ['#h', 'xyz']), ('wait', ['#h', 'xyz'])):
        try:
            run_step(box, cmd, args, opts)
            bad.append('%s: nessun errore' % cmd)
        except BrowserError as exc:
            if 'non numerico' not in str(exc):
                bad.append('%s: %s' % (cmd, exc))
        except Exception as exc:
            bad.append('%s: eccezione nuda %r' % (cmd, exc))
    check('argomenti non numerici → BrowserError (niente traceback) e nessun browser avviato',
          not bad and box[0] is None, '; '.join(bad) or 'box=%r' % box[0])

    # --- dopo `close` non si riapre Firefox di nascosto
    closed_box = [None, False]
    run_step(closed_box, 'close', [], opts)
    try:
        run_step(closed_box, 'title', [], opts)
        check('dopo `close` un comando non riapre una sessione in silenzio', False, 'nessun errore')
    except BrowserError as exc:
        check('dopo `close` un comando non riapre una sessione in silenzio',
              'chiusa' in str(exc) and closed_box[0] is None, _first_line(str(exc), 90))

    # --- il Browser finisce nella scatola PRIMA di start() (niente orfani con Ctrl-C)
    opts_nogd = argparse.Namespace(**vars(opts))
    opts_nogd.geckodriver = os.path.join(tmpdir, 'geckodriver-inesistente')
    box2 = [None, False]
    try:
        run_step(box2, 'title', [], opts_nogd)
    except BrowserError:
        pass
    check('run_step registra il Browser prima di start() (Ctrl-C in avvio → niente orfani)',
          box2[0] is not None)

    # --- timeout non valido
    try:
        Browser(timeout=0)
        check('Browser(timeout=0) → BrowserError', False, 'nessun errore')
    except BrowserError as exc:
        check('Browser(timeout=0) → BrowserError', 'timeout' in str(exc), _first_line(str(exc), 70))
    check('--timeout 0 → exit 2 con messaggio, senza avviare nulla',
          main(['--timeout', '0', 'title']) == 2)

    # --- coda del log di geckodriver corta (prima annegava il messaggio d'errore)
    fake = Browser()
    fake._log_path = os.path.join(tmpdir, 'gecko_finto.log')
    with io.open(fake._log_path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join('riga %d %s' % (i, 'x' * 400) for i in range(40)))
    tail = fake._log_tail()
    check('coda del log di geckodriver limitata (≤ 3 righe accorciate)',
          tail.count('\n') <= 3 and len(tail) < 700, '%d caratteri, %d righe'
          % (len(tail), tail.count('\n')))


def _check_interrupts(check, tmpdir, opts):
    """Ctrl-C: in avvio (KeyboardInterrupt) e dentro close(). Niente processi orfani."""
    victim = Browser(geckodriver=opts.geckodriver or 'geckodriver', firefox=opts.firefox,
                     driver_log=os.path.join(tmpdir, 'gecko_ki.log'))
    seen = {}

    def boom():
        seen['pid'] = victim.proc.pid
        raise KeyboardInterrupt()

    victim._new_session = boom
    got_ki = False
    try:
        victim.start()
    except KeyboardInterrupt:
        got_ki = True
    except BrowserError as exc:
        seen['err'] = str(exc)
    pid = seen.get('pid')
    check('Ctrl-C durante l\'avvio: KeyboardInterrupt propagato e geckodriver ucciso subito',
          got_ki and pid and not _pid_alive(pid),
          'ki=%s pid=%s vivo=%s %s' % (got_ki, pid, _pid_alive(pid), seen.get('err', '')))

    # Ctrl-C dentro close() (urlopen del DELETE): il processo va ucciso lo stesso
    victim2 = Browser()
    victim2.session = 'finta'
    victim2.proc = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'],
                                    start_new_session=True)
    pid2 = victim2.proc.pid

    def boom_raw(*_a, **_k):
        raise KeyboardInterrupt()

    victim2._raw = boom_raw
    raised = False
    try:
        victim2.close()
    except BaseException:
        raised = True
    time.sleep(0.3)
    check('Ctrl-C dentro close(): close() non lancia e il processo muore lo stesso',
          not raised and not _pid_alive(pid2), 'raised=%s vivo=%s' % (raised, _pid_alive(pid2)))


def _check_sigint_child(check, opts):
    """Ctrl-C vero su un'esecuzione del tool mentre Firefox sta partendo: exit 130, messaggio
    in chiaro (mai un traceback) e zero geckodriver/Firefox superstiti."""
    before = set(_gecko_procs())
    cmd = [sys.executable, os.path.abspath(__file__),
           '--url', 'data:text/html,%3Ctitle%3Ex%3C/title%3E', 'sleep', '5']
    if opts.geckodriver:
        cmd += ['--geckodriver', opts.geckodriver]
    if opts.firefox:
        cmd += ['--firefox', opts.firefox]
    child = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             start_new_session=True)
    time.sleep(1.2)
    child.send_signal(signal.SIGINT)
    try:
        _out, err = child.communicate(timeout=60)
    except subprocess.TimeoutExpired:
        child.kill()
        _out, err = child.communicate()
    err = (err or b'').decode('utf-8', 'replace')
    check('Ctrl-C sul tool: exit 130 e messaggio in chiaro (mai un traceback)',
          child.returncode == 130 and 'interrotto' in err and 'Traceback' not in err,
          'exit=%s stderr=%r' % (child.returncode, _first_line(err, 100)))
    left = {}
    deadline = time.time() + 10.0
    while time.time() < deadline:
        left = dict((p, a) for p, a in _gecko_procs().items() if p not in before)
        if not left:
            break
        time.sleep(0.4)
    check('Ctrl-C sul tool: nessun geckodriver/Firefox orfano',
          not left, '%d superstiti: %s' % (len(left), '; '.join(list(left.values())[:2])))


def selftest(opts):
    """Prova end-to-end: dev server in relay + pagina minima + Firefox headless."""
    gd = shutil.which(opts.geckodriver or 'geckodriver')
    ff = shutil.which(opts.firefox or 'firefox') if opts.firefox else shutil.which('firefox')
    if not gd or not ff:
        missing = ' e '.join([n for n, v in (('geckodriver', gd), ('firefox', ff)) if not v])
        print('browser selftest: saltato (%s non trovato: `snap install firefox geckodriver`)' % missing)
        return 0

    results = []

    def check(label, cond, detail=''):
        results.append((label, bool(cond), detail))
        return bool(cond)

    tmpdir = tempfile.mkdtemp(prefix='galleria_browser_')
    proc = log = None
    browser = None
    interrupted = []
    try:
        _check_pure(check, tmpdir, opts)
        _check_interrupts(check, tmpdir, opts)

        proc, log, base = _start_devserver(tmpdir, results)
        photo, made = _pick_gate_photo(tmpdir)
        if made:
            results.append(('nessuna foto in %s: uso un PNG di ripiego' % GATE_PHOTOS, True, photo))

        browser = Browser(width=opts.width, height=opts.height, headless=not opts.no_headless,
                          geckodriver=opts.geckodriver, firefox=opts.firefox,
                          timeout=opts.timeout, verbose=opts.verbose, driver_log=opts.driver_log)
        t0 = time.time()
        browser.start()
        check('sessione Firefox headless avviata (%.1f s, %s)'
              % (time.time() - t0, browser.caps.get('browserVersion', '?')), True)
        check('viewport reale misurato (Firefox non scende sotto %d px)' % MIN_FF_WIDTH,
              browser.viewport is not None and browser.viewport[0] >= MIN_FF_WIDTH,
              'chiesto %dx%d, viewport %s' % (opts.width, opts.height, browser.viewport))

        url = base + '/config.html#PROVA'
        browser.open(url)
        title = browser.title()
        check('titolo della pagina = "Galleria prova"', title == 'Galleria prova', 'letto %r' % title)
        got_hash = browser.exec('return location.hash;')
        check('location.hash = "#PROVA" (il frammento sopravvive)', got_hash == '#PROVA',
              'letto %r' % got_hash)
        check('#out contiene l\'hash', '#PROVA' in (browser.text('#out') or ''),
              'letto %r' % browser.text('#out'))
        check('wait_for(js:…) su una condizione gia\' vera',
              browser.wait_for('js:document.getElementById("c") !== null', timeout=5) < 5)

        # exec: espressioni che prima davano null in silenzio
        check('exec: espressione con la parola "return" in una stringa',
              browser.exec('"xxreturnxx".indexOf("return")') == 2,
              'letto %r' % browser.exec('"xxreturnxx".indexOf("return")'))
        check('exec: espressione con il punto e virgola finale',
              browser.exec('window.GalProbe.wheel;') == 0,
              'letto %r' % browser.exec('window.GalProbe.wheel;'))

        browser.set_file('#f', photo)
        picked = browser.exec('var f = document.getElementById("f").files;'
                              ' return f.length ? f[0].name : "";')
        check('set_file: il file di %s arriva all\'input col nome giusto' % GATE_PHOTOS,
              picked == os.path.basename(photo), 'letto %r' % picked)
        readable = browser._verify_readable('#f', photo)
        check('set_file: la pagina legge DAVVERO i byte (copia automatica fuori dalla '
              'cartella nascosta)', readable and readable > 0, 'letti %s B' % readable)
        try:
            browser.set_file('#f', photo, stage=False)
            check('set_file(stage=False) da una cartella nascosta → errore invece di falso verde',
                  False, 'nessun errore')
        except BrowserError as exc:
            check('set_file(stage=False) da una cartella nascosta → errore invece di falso verde',
                  'non riesce a leggere' in str(exc), _first_line(str(exc), 90))
        browser.set_file('#f', photo)       # ripristina un input valido

        # drag/wheel su un elemento SOTTO LA PIEGA (prima: "move target out of bounds")
        browser.drag('#c', 40, 26)
        browser.wheel('#c', -120)
        probe = browser.exec('return window.GalProbe;') or {}
        check('drag su un elemento sotto la piega (scroll automatico nel viewport)',
              (probe.get('down') or 0) >= 1, 'GalProbe=%s' % json.dumps(probe))
        check('drag: almeno 2 movimenti', (probe.get('move') or 0) >= 2,
              'move=%s' % probe.get('move'))
        check('wheel su un elemento sotto la piega', (probe.get('wheel') or 0) >= 1,
              'wheel=%s' % probe.get('wheel'))

        # M7 #7: clic su un bottone sotto la piega con un footer `position: fixed` come quello
        # della config page. Senza il centraggio, il clic W3C allinea l'elemento IN BASSO,
        # cioe' sotto il footer, e muore con «element click intercepted».
        browser.click('#sotto')
        clicks = browser.exec('return window.GalProbe.click;')
        check('click su un bottone sotto la piega e sotto il footer fisso (centrato prima '
              'del clic)', clicks == 1, 'click=%s' % clicks)
        pos = browser.exec('var r = document.querySelector("#sotto").getBoundingClientRect();'
                           ' return [Math.round(r.top + r.height / 2), window.innerHeight];')
        pos = pos if isinstance(pos, list) and len(pos) == 2 else [0, 0]
        check('into_view: l\'elemento resta al centro del viewport, non incollato in basso',
              pos[1] > 0 and abs(pos[0] - pos[1] / 2.0) < pos[1] / 4.0,
              'centro %s su viewport %s' % (pos[0], pos[1]))
        check('passo CLI `into-view CSS`',
              run_step([browser, False], 'into-view', ['#h'], opts) is True)
        try:
            run_step([browser, False], 'into-view', [], opts)
            check('`into-view` senza selettore → errore', False, 'nessun errore')
        except BrowserError as exc:
            check('`into-view` senza selettore → errore', 'into-view CSS' in str(exc),
                  _first_line(str(exc), 70))

        # un overlay che copre TUTTO: il ritentativo non deve diventare un falso verde
        browser.exec('var v = document.createElement("div"); v.id = "velo";'
                     ' document.body.appendChild(v); return 1;')
        try:
            browser.click('#sotto')
            check('click davvero intercettato (overlay a tutto schermo) → errore, non falso '
                  'verde', False, 'nessun errore')
        except BrowserError as exc:
            check('click davvero intercettato (overlay a tutto schermo) → errore che lo spiega',
                  'intercettato' in str(exc), _first_line(str(exc), 90))
        browser.exec('var v = document.getElementById("velo");'
                     ' if (v) { v.parentNode.removeChild(v); } return 1;')
        clicks = browser.exec('return window.GalProbe.click;')
        check('dopo l\'overlay il contatore dei clic è ancora 1 (nessun clic fantasma)',
              clicks == 1, 'click=%s' % clicks)

        # set_value: <select> con valore inesistente, range fuori scala
        check('set_value su <select> con un valore valido', browser.set_value('#sel', 1) == '1')
        try:
            browser.set_value('#sel', 9)
            check('set_value su <select> con un valore inesistente → errore', False, 'nessun errore')
        except BrowserError as exc:
            check('set_value su <select> con un valore inesistente → errore',
                  'opzioni' in str(exc), _first_line(str(exc), 90))
        check('set_value su un range fuori scala restituisce il valore vero',
              browser.set_value('#rg', 99) == '10')

        shot = os.path.join(tmpdir, 'shot.png')
        info = browser.screenshot(shot)
        head = b''
        if os.path.exists(shot):
            with io.open(shot, 'rb') as fh:
                head = fh.read(8)
        check('screenshot scritto in una cartella temporanea ed e\' un PNG',
              head == b'\x89PNG\r\n\x1a\n' and info['bytes'] > 1000,
              '%s, %d B, %sx%s' % (shot, info.get('bytes', 0), info.get('w'), info.get('h')))

        full = browser.screenshot(os.path.join(tmpdir, 'full.png'), full=True)
        check('screenshot-full: pagina intera, piu\' alta del viewport',
              full.get('h', 0) > info.get('h', 0) + 500,
              'viewport %s px, pagina %s px' % (info.get('h'), full.get('h')))

        el_shot = os.path.join(tmpdir, 'canvas.png')
        browser.screenshot(el_shot, '#c')
        check('screenshot del solo #c', os.path.getsize(el_shot) > 100)

        # pagina in un iframe da 400 px: l'unico modo di provarla sotto i 500 di Firefox
        browser.open_narrow(url, 400)
        inner = browser.exec('return window.innerWidth;')
        in_title = browser.exec('return document.title;')
        in_hash = browser.exec('return location.hash;')
        narrow = browser.screenshot(os.path.join(tmpdir, 'narrow.png'))
        check('narrow: la pagina (con il suo hash) gira a 400 px in un iframe e lo screenshot '
              'e\' largo 400',
              inner == 400 and in_title == 'Galleria prova' and in_hash == '#PROVA'
              and narrow.get('w') == 400,
              'innerWidth=%s titolo=%r hash=%r PNG %sx%s'
              % (inner, in_title, in_hash, narrow.get('w'), narrow.get('h')))
        narrow_full = browser.screenshot(os.path.join(tmpdir, 'narrow_full.png'), full=True)
        check('narrow + screenshot-full: inquadra la cornice (400 px), non di nascosto la '
              'finestra intera', narrow_full.get('w') == 400,
              'PNG %sx%s' % (narrow_full.get('w'), narrow_full.get('h')))
        # Gate M7: dopo il narrow, `open` dello STESSO URL deve RICARICARE. Firefox tratta la
        # navigazione verso lo stesso documento come un salto al frammento: senza il giro da
        # about:blank la pagina restava dentro la cornice da 400 px (e l'`open` di rimedio
        # dopo un errore ripartiva dal DOM di prima).
        browser.frame_top()
        browser.open(url)
        ancora = browser.exec('return !!document.getElementById(arguments[0]);',
                              [Browser.NARROW_ID])
        larghezza = browser.exec('return window.innerWidth;')
        check('open dello stesso URL dopo un `narrow`: ricarica davvero (la cornice sparisce)',
              ancora is False and (larghezza or 0) >= MIN_FF_WIDTH - 40,
              'iframe presente=%s innerWidth=%s' % (ancora, larghezza))
        browser.exec('window.GalMarker = 1; return 1;')
        browser.open(url)
        marker = browser.exec('return typeof window.GalMarker;')
        check('open dello stesso URL (frammento compreso) ricarica: il DOM di prima sparisce',
              marker == 'undefined', 'typeof GalMarker = %r' % marker)
        check('e l\'URL (con il frammento) e\' quello chiesto',
              browser.current_url() == url, browser.current_url())

        # errori: messaggi chiari, niente traceback
        try:
            browser.click('#non-esiste')
            check('selettore inesistente → BrowserError', False, 'nessun errore')
        except BrowserError as exc:
            check('selettore inesistente → BrowserError con messaggio chiaro',
                  'non-esiste' in str(exc), str(exc)[:80])
        try:
            browser.set_file('#f', os.path.join(tmpdir, 'manca.jpg'))
            check('set_file su file assente → errore', False, 'nessun errore')
        except BrowserError as exc:
            check('set_file su file assente → errore', 'non trovato' in str(exc), str(exc)[:80])
        for label, dest in (('percorso non scrivibile', '/proc/non-scrivibile/x.png'),
                            ('una directory', tmpdir)):
            try:
                browser.screenshot(dest)
                check('screenshot su %s → BrowserError' % label, False, 'nessun errore')
            except BrowserError as exc:
                check('screenshot su %s → BrowserError (niente traceback)' % label,
                      'impossibile scrivere' in str(exc), _first_line(str(exc), 80))
            except Exception as exc:
                check('screenshot su %s → BrowserError (niente traceback)' % label, False,
                      'eccezione nuda %r' % (exc,))
        t_wait = time.time()
        try:
            browser.wait_for('#mai', timeout=0.6)
            check('wait_for scaduto → errore', False, 'nessun errore')
        except BrowserError as exc:
            elapsed = time.time() - t_wait
            check('wait_for scaduto → errore', 'scaduto' in str(exc), str(exc)[:80])
            check('wait_for non sfora il proprio timeout', elapsed < 0.6 + 2.0,
                  'atteso %.2f s su 0,6 richiesti' % elapsed)

        # emu_config_url: file finto, meta refresh con entita' HTML
        fake = os.path.join(tmpdir, 'pebble-tool-emu-app-config-99.html')
        with io.open(fake, 'w', encoding='utf-8') as fh:
            fh.write('<html><head><meta http-equiv="refresh" content="0;URL=http://127.0.0.1:8765'
                     '/config.html?return_to=http%3A//localhost%3A1234/close%3F&amp;a=1#XY">'
                     '</head></html>')
        got = emu_config_url(timeout=1.0, pattern=os.path.join(tmpdir, 'pebble-tool-emu-app-config-*.html'))
        check('emu_config_url legge il meta refresh e fa l\'unescape',
              got.endswith('&a=1#XY') and got.startswith('http://127.0.0.1:8765/config.html?return_to='),
              got)
        try:
            emu_config_url(timeout=0.4, pattern=os.path.join(tmpdir, 'nessun-file-*.html'))
            check('emu_config_url senza file → errore', False, 'nessun errore')
        except BrowserError as exc:
            check('emu_config_url senza file → errore con il consiglio giusto',
                  'emu-app-config' in str(exc), str(exc)[:80])

        staged = list(browser._staged)
        browser.close()
        check('close(): sessione, processo e copie dei file rimossi',
              all(not os.path.exists(p) for p in staged), '%d copie' % len(staged))
        try:
            browser.title()
            check('un Browser chiuso non riapre Firefox di nascosto', False, 'nessun errore')
        except BrowserError as exc:
            check('un Browser chiuso non riapre Firefox di nascosto',
                  'chiusa' in str(exc), _first_line(str(exc), 80))
        browser = None

        _check_sigint_child(check, opts)
    except KeyboardInterrupt:
        interrupted.append(True)
        results.append(('selftest interrotto (Ctrl-C)', False, ''))
    except BrowserError as exc:
        results.append(('errore nel selftest: %s' % exc, False, ''))
    except Exception as exc:                                    # pragma: no cover
        results.append(('eccezione inattesa: %r' % (exc,), False, ''))
    finally:
        if browser is not None:
            browser.close()
        _stop_proc(proc)                        # per PID, mai con pkill -f
        if log is not None:
            try:
                log.close()
            except Exception:
                pass
        if opts.keep:
            print('cartella temporanea tenuta: %s' % tmpdir)
        else:
            shutil.rmtree(tmpdir, ignore_errors=True)

    ok = sum(1 for _l, good, _d in results if good)
    bad = len(results) - ok
    for label, good, detail in results:
        if not good:
            print('FALLITO  %s%s' % (label, ('  [%s]' % detail) if detail else ''))
        elif opts.verbose:
            print('ok       %s%s' % (label, ('  [%s]' % detail) if detail else ''))
    print('browser selftest: %d ok, %d falliti' % (ok, bad))
    if interrupted:
        return 130          # Ctrl-C: non e' un fallimento del tool
    return 1 if bad else 0


# --------------------------------------------------------------------- CLI ----

EPILOG = """\
Comandi: open URL | open-emu [SEC] | emu-url [SEC] | narrow URL LARGH [ALT] | frame CSS
         frame-top | title | current-url | viewport | exec SCRIPT [ARG…] | find CSS | click CSS
         into-view CSS | set-file CSS PERCORSO | set-value CSS VALORE | text CSS
         wait SELETTORE|js:ESPR [SEC] | drag CSS DX DY | wheel CSS DY
         screenshot FILE [CSS] | screenshot-full FILE | sleep SEC | close

Esempi:
  galleria_browser.py --url http://127.0.0.1:8765/config.html#AAA screenshot ~/pagina.png
  galleria_browser.py --script gate.json
  echo '[["open-emu"],["title"],["screenshot","~/p.png"]]' | galleria_browser.py --script -
  galleria_browser.py --selftest

Script JSON: lista di passi [{"cmd": "open", "args": ["…"]}] oppure [["open", "…"], …];
tutti i passi girano nella stessa sessione, il risultato di ognuno viene stampato.
Limiti dello snap Firefox: i file per <input type=file> vengono copiati in
~/galleria-browser-files/ se stanno fuori da $HOME o in una cartella nascosta (~/.cache/…),
e set-file verifica che la pagina riesca a leggerli; la finestra non scende sotto 500 px
(per una prova a 360-400 px usare `narrow URL 400`); `screenshot` inquadra il viewport,
`screenshot-full` la pagina intera.
Config page: `click` centra l'elemento prima di cliccarlo (il clic W3C lo allineerebbe in
basso, sotto il footer `position: fixed`: «element click intercepted») e riprova una volta se
viene intercettato; `into-view CSS` fa solo lo scroll (block center), utile prima di uno
screenshot o di una sequenza di azioni. `open` dello stesso URL (frammento a parte) passa da
about:blank, altrimenti Firefox salta al frammento senza ricaricare (dopo un `narrow` la
pagina resterebbe nella cornice).
"""


def build_parser():
    ap = argparse.ArgumentParser(
        prog='galleria_browser.py',
        description='Client WebDriver (solo stdlib) per Firefox headless: config page di Galleria.',
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=EPILOG)
    ap.add_argument('--url', metavar='URL', help='apre questo URL prima del comando')
    ap.add_argument('--script', metavar='FILE', help='lista di passi JSON ("-" = stdin)')
    ap.add_argument('--selftest', action='store_true', help='prova il tool (exit 0 se manca Firefox)')
    ap.add_argument('--timeout', type=float, default=DEFAULT_TIMEOUT, metavar='SEC',
                    help='timeout dei comandi, > 0 (default %(default)s)')
    ap.add_argument('--width', type=int, default=DEFAULT_WIDTH, metavar='PX',
                    help='larghezza finestra (Firefox non scende sotto %d: per meno usare '
                         '`narrow`)' % MIN_FF_WIDTH)
    ap.add_argument('--height', type=int, default=DEFAULT_HEIGHT, metavar='PX',
                    help='altezza finestra (il viewport e\' ~86 px piu\' basso)')
    ap.add_argument('--no-headless', action='store_true', help='finestra visibile (serve un display)')
    ap.add_argument('--geckodriver', metavar='PERCORSO', default=None)
    ap.add_argument('--firefox', metavar='PERCORSO', default=None)
    ap.add_argument('--driver-log', metavar='FILE', default=None,
                    help='tiene il log di geckodriver in questo file')
    ap.add_argument('--keep', action='store_true', help='--selftest: non cancella la cartella temporanea')
    ap.add_argument('-v', '--verbose', action='store_true')
    ap.add_argument('cmd', nargs='?', metavar='COMANDO', help='vedi sotto')
    ap.add_argument('args', nargs='*', metavar='ARG')
    ap.add_argument('--version', action='version', version='galleria_browser.py ' + VERSION)
    return ap


def _run(opts, ap):
    if opts.selftest:
        if opts.cmd or opts.script:
            sys.stderr.write('--selftest non si combina con un comando o con --script\n')
            return 2
        return selftest(opts)

    if opts.script and opts.cmd:
        sys.stderr.write('--script non si combina con un comando sulla riga\n')
        return 2
    if not opts.script and not opts.cmd and not opts.url:
        ap.print_help()
        return 2

    steps = []
    if opts.url:
        steps.append(('open', [opts.url]))
    try:
        if opts.script:
            steps += load_script(opts.script)
        elif opts.cmd:
            steps.append((opts.cmd, opts.args))
    except BrowserError as exc:
        sys.stderr.write('%s\n' % exc)
        return 2

    box = [None, False]
    try:
        for i, (cmd, args) in enumerate(steps):
            try:
                value = run_step(box, cmd, args, opts)
            except BrowserError as exc:
                sys.stderr.write('passo %d (%s): %s\n' % (i + 1, cmd, exc))
                return 1
            _print_value(value)
    finally:
        if box[0] is not None:
            box[0].close()
    return 0


def main(argv=None):
    ap = build_parser()
    opts = ap.parse_args(argv)
    if opts.timeout <= 0:
        sys.stderr.write('--timeout deve essere > 0 (letto %g)\n' % opts.timeout)
        return 2
    if opts.width <= 0 or opts.height <= 0:
        sys.stderr.write('--width e --height devono essere > 0 (letti %dx%d)\n'
                         % (opts.width, opts.height))
        return 2
    try:
        return _run(opts, ap)
    except KeyboardInterrupt:
        sys.stderr.write('interrotto\n')
        return 130
    except BrowserError as exc:
        sys.stderr.write('%s\n' % exc)
        return 1
    except Exception as exc:                    # mai un traceback in faccia all'utente
        if opts.verbose:
            raise
        sys.stderr.write('errore inatteso: %s: %s (riprovare con -v per il traceback)\n'
                         % (type(exc).__name__, exc))
        return 1


if __name__ == '__main__':
    sys.exit(main())
