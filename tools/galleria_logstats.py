#!/usr/bin/env python3
"""galleria_logstats.py — S8: riepilogo dei log dell'orologio reale (app Galleria).

Scopo: trasformare uno o più file catturati con

    timeout -s INT 600 pebble logs --phone <IP> > run_s8_x.log      (oppure `pebble install ... --logs`)

in un riepilogo leggibile (testo o markdown) e in JSON, senza contare a mano. I formati delle
righe sono il contratto di `docs/design/galleria-s8-hardware.md` §2.3 (righe C in
`apps/galleria/src/c/*.c` e righe PKJS in `src/pkjs/index.js`, `sync.js`, `album.js`); le
sezioni del riepilogo, la CLI e i codici di uscita sono la §2.4. Solo stdlib (Python >= 3.10).

Uso:
    python3 tools/galleria_logstats.py run_s8_a.log [run_s8_b.log ...] [--md]
            [--json out.json | --json -] [--since HH:MM:SS] [--until HH:MM:SS]
            [--threshold-ms 10]
    python3 tools/galleria_logstats.py --selftest        # campioni incorporati + asserzioni

  --md            tabelle markdown invece del testo allineato (da incollare nei documenti).
  --json PATH     scrive il riepilogo strutturato (chiavi stabili) in PATH; `--json -` lo
                  stampa su stdout AL POSTO del riepilogo leggibile (comodo per i test).
  --since/--until filtro sull'orario delle righe (confronto su HH:MM:SS, estremi inclusi);
                  orari impossibili o `since` > `until` sono errori di argomento (uscita 2).
                  Il filtro vale solo per la resa: gli avvii (`heap main`/`heap deinit`) sono
                  contati su tutto il file, così un riavvio spontaneo resta spontaneo anche
                  quando la finestra taglia l'avvio precedente (§2.4 punto 1).
  --threshold-ms  soglia dei render "lenti" nella sezione 7 (default 10 ms, obiettivo O4).

Codici di uscita: 0 anche con righe sconosciute (ignorate in silenzio: i log S5a–S6 hanno
formati più vecchi) e con file vuoti ("nessun evento riconosciuto"); 1 solo se `--selftest`
fallisce; 2 per argomenti errati o file inesistente.

Note di lettura:
  * l'orario dei log ha risoluzione 1 s: ogni durata calcolata dagli orari è dichiarata "±1 s";
  * **segmenti**: heap, batteria e sync sono raggruppati per avvio (un segmento nuovo a ogni
    `heap main` e a ogni file, e per la batteria anche quando `up min` torna indietro): un
    riavvio azzera `up min` e rimescola l'heap, quindi pendenze e delta si calcolano DENTRO un
    segmento e mai a cavallo di un riavvio (righe `sync: open` escluse dalle durate: sono
    dell'init, non della sync);
  * l'app Android bufferizza i log PKJS in un canale da 2 con DROP_OLDEST: le raffiche
    (`[sync] chunk … ack`) si perdono, quindi le misure per chunk vanno lette nelle righe
    `sync: end` dell'orologio (§2.1 della specifica);
  * `[PHONESIM] [WARNING]` (pypkjs in emulatore) è rumore: contato a parte, mai anomalia;
  * `digits: font=… size=… WxH fill=…` è la riga informativa (LOGV) di `ui_digits.c`: le altre
    righe `digits:` sono ERROR e finiscono nelle anomalie;
  * la sezione 13 legge le due righe della build M (`GALLERIA_DEBUG_TIMING`) `init: open=… tot=… ms`
    e `deinit: mod=… tot=… ms` (una per avvio) e la riga di produzione, emessa una volta sola,
    `storage: manifest schema a -> b migrated (settings … shake …)`, che è informativa e non
    un'anomalia; con una build di produzione la sezione resta vuota e non è un errore.
"""

import argparse
import json
import os
import re
import sys

VERSIONE = 1

# ---------------------------------------------------------------- regex di riga


def _rx(pattern, flags=0):
    """Compila una regex tollerante: ogni spazio letterale diventa `\\s+`."""
    return re.compile(pattern.replace(' ', r'\s+'), flags)


RE_ANSI = re.compile(r'\x1b\[[0-9;]*m')
# Riga dell'orologio: [HH:MM:SS] file.c:NN> messaggio
RE_OROLOGIO = re.compile(r'^\[(\d\d:\d\d:\d\d)\] ([^\s:]{1,16}):(\d+)> (.*)$')
# Riga del telefono/PKJS: [HH:MM:SS] pkjs> messaggio
RE_PKJS = re.compile(r'^\[(\d\d:\d\d:\d\d)\] pkjs> (.*)$')
# Prefisso facoltativo del messaggio PKJS: `./src/pkjs/index.js:97:0 ` (pypkjs) o `Galleria:97 `
# (app reale). Tolto solo se davanti a un tag [album]/[sync]/[config]/[dev]/[PHONESIM].
RE_PKJS_PREFISSO = re.compile(r'^(\S+):(\d+)(?::(\d+))?\s+(?=\[)')
RE_ORA = re.compile(r'^\[(\d\d:\d\d:\d\d)\]')
RE_ORA_VALIDA = re.compile(r'^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$')   # anche HH<=23, MM/SS<=59

# --- messaggi dell'orologio (src/c) ---
RE_HEAP = _rx(r'^heap (.+?): used=(\d+) free=(\d+)\s*$')
RE_WATCH = _rx(r'^watch: fw (\d+)\.(\d+)\.(\d+) model=(\d+)')
RE_BATT = _rx(r'^batt: (\d+)% chg=(-?\d+) plug=(-?\d+) up (\d+) min')
RE_BT = _rx(r'^bt: connected=(-?\d+)')
RE_STORAGE = _rx(r'^storage: quota=(\d+) album=(-?\d+) schema=(-?\d+) manifest=(\S+) valid=(\d+)')
RE_SETTINGS = _rx(r'^settings: (\S+) layout=(\d+) font=(\d+) interval=(\d+) order=(\d+) shake=(\d+)')
RE_INIT = _rx(r'^init: open=(-?\d+) man=(-?\d+) sto=(-?\d+) set=(-?\d+) mod=(-?\d+)'
              r' win=(-?\d+) syn=(-?\d+) tot=(-?\d+) ms')
RE_DEINIT = _rx(r'^deinit: mod=(-?\d+) fl=(-?\d+) win=(-?\d+) tot=(-?\d+) ms')
RE_MIGRAZIONE = _rx(r'^storage: manifest schema (\d+) -> (\d+) migrated'
                    r' \(settings (-?\d+) shake (\d+)\)')
RE_SYNC_OPEN = _rx(r'^sync: open\((\d+)/(\d+)\) -> (-?\d+) chunk=(\d+) heap (\d+)/(\d+) \(cost (\d+)\)')
RE_SYNC_END = _rx(r'^sync: end s=(\d+) c=(\d+) n=(\d+) commit (-?\d+) photo (-?\d+)'
                  r' ch max (-?\d+) avg (-?\d+) heap (\d+)')
RE_SYNC_GAP = _rx(r'^sync: gap n=(\d+) max (-?\d+) avg (-?\d+)')
RE_SYNC_MSG = _rx(r'^sync: msg=(\d+) f=([0-9a-fA-F]+) -> act=(-?\d+) out=(\d+) code=(\d+)'
                  r' off=(\d+) st=(\d+) heap (\d+)')
RE_PHOTO = _rx(r'^photo: slot (\d+) persist crc (\S+) (\d+) ch (-?\d+) ms heap (\d+)/(\d+)')
RE_DRAW = _rx(r'^draw: mode=(\d+) full=(-?\d+) (-?\d+) ms(?: info (-?\d+))?')
RE_TICK = _rx(r'^tick: (-?\d+) ms')
RE_ROT = _rx(r'^rot\(([^)]*)\): t=(\d+) int=(\d+) ord=(\d+) shk=(\d+) slot=(\d+)'
             r' demo=(\d+) valid=(\d+) bad=([0-9a-fA-F]+)')
RE_LUMA = _rx(r'^luma\(([^)]*)\): m=(\d+) b=(-?\d+)\+(-?\d+) h=(-?\d+) ph=(-?\d+) w=(-?\d+)'
              r' bad=(\d+)\((\d+)/(\d+)\) mean=(\d+) fg=([0-9a-fA-F]+) halo=(-?\d+)')
RE_UITIME = _rx(r'^ui_time: cs=(-?\d+) bt=(-?\d+) loc=(\S+) (\d+)x(\d+) unob=(-?\d+)'
                r' lay=(\d+) font=(\d+) mode=(\d+) band=(-?\d+)')
RE_PHOTO_INFO = _rx(r'^photo: (?:bitmap \d|resource \d+ loaded=)')
RE_PHOTO_READ = _rx(r'^photo: slot \d+ chunk \d+ read')
RE_DIGITS_INFO = _rx(r'^digits: font=\d+ size=\d+ \d+x\d+ fill=')
RE_APP_FAULT = re.compile(r'App fault!(.*)$')
RE_PC = re.compile(r'PC:\s*(\S+)')
RE_LR = re.compile(r'LR:\s*(\S+)')

# --- messaggi del telefono (src/pkjs) ---
RE_JS_TAG = re.compile(r'^\[([A-Za-z]+)\]')
RE_JS_PRONTO = _rx(r'^\[album\] pronto \(([^)]*)\): (.*)$')
RE_JS_PIANO = _rx(r'^\[album\] piano: (\d+) foto, (\d+) eliminazioni, (.*)$')
RE_JS_READY = _rx(r'^\[sync\] JS_READY')
RE_JS_HELLO = _rx(r'^\[sync\] HELLO proto=(\d+) maxChunk=(\d+) slots=(\S*)')
RE_JS_SYNC_READY = _rx(r'^\[sync\] SYNC_READY chunk=(\d+)')
RE_JS_FOTO_N = _rx(r'^\[sync\] foto (\d+)/(\d+): slot (\d+)')
RE_JS_FOTO_OK = _rx(r'^\[sync\] foto slot (\d+) OK: (\d+) B in (\d+) messaggi, (\d+) ms')
RE_JS_FOTO_KO = _rx(r'^\[sync\] foto slot (\d+) FALLITA \(([^)]*)\) dopo (\d+) ms')
RE_JS_FINE = _rx(r'^\[sync\] fine: (.*)$')
RE_JS_RETRY = _rx(r'nuovo tentativo fra ([0-9.]+) s \((\d+)\)')
RE_JS_CHUNK = _rx(r'^\[sync\] chunk off=(\d+) n=(\d+) ack (\d+) ms')
RE_CFG_APRO = _rx(r'^\[config\] apro la pagina \(URL (\d+) car\., stato (\d+)\)')
RE_CFG_CHIUSA = _rx(r'^\[config\] pagina chiusa: risposta di (\d+) car\.(?: dopo (\d+) ms)?')
RE_CFG_APPLICATO = _rx(r'^\[config\] payload applicato in (\d+) ms')

# Anomalie dell'orologio: formati che in `src/c` sono APP_LOG_LEVEL_WARNING/ERROR (§2.4 punto 12).
ANOMALIE_OROLOGIO = [
    (_rx(r'^sync: outbox'), 'sync outbox'),
    (_rx(r'^sync: inbox dropped'), 'sync inbox dropped'),
    (_rx(r'^sync: \d+ s idle -> IDLE'), 'sync idle -> IDLE'),
    (_rx(r'^sync: idle timer alloc failed'), 'sync timer'),
    (_rx(r'^sync: dict_write'), 'sync dict_write'),
    (_rx(r'^rotation: '), 'rotazione'),
    (_rx(r'^demo photo '), 'demo'),
    (_rx(r'^photo: slot \d+ chunk \d+ read'), 'foto'),
    (_rx(r'^photo: .*(failed|unusable|MISMATCH)'), 'foto'),
    (_rx(r'^settings: .*(rejected|invalid)'), 'impostazioni'),
    (_rx(r'^seed: .*(disabled|!=)'), 'seed'),
]
PAROLE_ANOMALIA = ('failed', 'unusable', 'unreadable', 'invalid', 'dropped', 'incompleto',
                   'not loaded', 'out of range', 'rejected', 'MISMATCH')
PAROLE_ANOMALIA_JS = ('ERRORE', 'FALLITA', 'fallito', 'fallita', 'abbandonata', 'non raggiungibile',
                      'non supportato', 'rinuncio', 'errore permanente', 'annullate',
                      'CRC_ERR', 'SEQ_ERR', 'non valida')

MSG_NOMI = {1: 'JS_READY', 2: 'HELLO', 3: 'SYNC_REQUEST', 4: 'SYNC_READY', 5: 'PHOTO_BEGIN',
            6: 'PHOTO_DATA', 7: 'PHOTO_END', 8: 'STATUS', 9: 'SYNC_DONE', 10: 'SETTINGS',
            11: 'ALBUM_ORDER', 12: 'ALBUM_DELETE'}
CODE_NOMI = {0: 'OK', 1: 'CRC_ERR', 2: 'NO_SPACE', 3: 'BAD_FORMAT', 4: 'BUSY', 5: 'SEQ_ERR',
             6: 'NOT_SUPPORTED', 7: 'STORAGE_ERR'}
FASI_ORDINE = ['main', 'init', 'window_load', 'after first render', 'services', 'unsub',
               'qv', 'shake', 'sync_end', 'tick', 'deinit']
# Campi delle righe `init:`/`deinit:` (build M, GALLERIA_DEBUG_TIMING), nell'ordine in cui il
# codice li misura. `resto` e' derivato, non letto dal log: vedi Raccolta.avvio_uscita().
CAMPI_INIT = ['open', 'man', 'sto', 'set', 'mod', 'win', 'syn', 'resto', 'tot']
CAMPI_DEINIT = ['mod', 'fl', 'win', 'resto', 'tot']
# `open` e `man` sono DENTRO `sto` (storage_init): la somma delle parti di primo livello e'
# sto + set + mod + win + syn, e `resto` e' quello che avanza dentro `tot`.
PARTI_INIT = ['sto', 'set', 'mod', 'win', 'syn']
PARTI_DEINIT = ['mod', 'fl', 'win']


# ---------------------------------------------------------------- utilità


def ora_in_secondi(ora):
    """'HH:MM:SS' -> secondi dalla mezzanotte."""
    h, m, s = ora.split(':')
    return int(h) * 3600 + int(m) * 60 + int(s)


def normalizza(msg):
    """Chiave di deduplica: numeri ed esadecimali collassati (le anomalie si contano per forma)."""
    out = re.sub(r'0x[0-9a-fA-F]+', '0xN', msg)
    return re.sub(r'\d+', 'N', out)


def statistiche(valori):
    """min/media/max/p95 (p95 = nearest-rank) di una lista di numeri; {} se vuota."""
    if not valori:
        return {'n': 0}
    ordinati = sorted(valori)
    n = len(ordinati)
    indice = min(n - 1, max(0, -(-95 * n // 100) - 1))
    return {'n': n, 'min': ordinati[0], 'max': ordinati[-1],
            'media': round(sum(ordinati) / float(n), 1), 'p95': ordinati[indice]}


def fmt_stat(st):
    if not st or not st.get('n'):
        return '-'
    return 'n=%d min %s media %s max %s p95 %s' % (st['n'], st['min'], st['media'], st['max'], st['p95'])


def pendenza(punti):
    """Minimi quadrati su (x, y); None se meno di 2 punti o x tutti uguali."""
    n = len(punti)
    if n < 2:
        return None
    mx = sum(p[0] for p in punti) / float(n)
    my = sum(p[1] for p in punti) / float(n)
    num = sum((p[0] - mx) * (p[1] - my) for p in punti)
    den = sum((p[0] - mx) ** 2 for p in punti)
    if den == 0:
        return None
    return num / den


# ---------------------------------------------------------------- raccolta


class Raccolta(object):
    """Legge le righe e accumula gli eventi riconosciuti (uno stato per tutti i file)."""

    def __init__(self, since=None, until=None, soglia_ms=10):
        self.since = since
        self.until = until
        self.soglia_ms = soglia_ms
        self.file = []                 # [{nome, righe, riconosciute}]
        self.righe = 0
        self.n_orologio = 0
        self.n_pkjs = 0
        self.n_ignorate = 0            # riga di formato sconosciuto
        self.n_fuori_filtro = 0        # riga scartata da --since/--until (formato ignoto o no)
        self.n_fault = 0               # righe `App fault!` (non sono ne orologio ne pkjs)
        self.n_phonesim = 0
        self.avvii = []                # {ora, file, spontaneo, seg}
        self.deinit = []               # {ora, file}
        self.app_fault = []            # {ora, file, testo, pc, lr, contesto}
        self.watch = []                # {ora, fw, model}
        self.heap = {}                 # fase -> [{ora, t, used, free, file, seg}]
        self.ui_time = []
        self.storage = []
        self.settings = []
        self.init_ms = []              # righe `init:` (build M): {ora, file, seg, campi}
        self.deinit_ms = []            # righe `deinit:` (build M)
        self.migrazioni = []           # `storage: manifest schema a -> b migrated (...)`
        self.sync_open = []
        self.sync_end = []
        self.sync_msg = []
        self.sync_righe = []           # {t, ora, msg, seg} per le durate (senza `sync: open`)
        self.sync_warn = {}            # etichetta -> n
        self.foto = []                 # righe `photo: ... persist crc ...`
        self.foto_errori = 0
        self.draw = []
        self.tick = []
        self.rot = []
        self.luma = []
        self.bt = []                   # {ora, connected, iniziale}: transizioni + stato/avvio
        self.batt = []                 # {ora, t, pct, chg, plug, up_min, file, seg}
        self.pkjs_tag = {}
        self.pkjs_eventi = []          # {ora, tipo, testo, dati}
        self.pkjs_chunk = []
        self.anomalie = {}             # chiave normalizzata -> {...}
        self._gap = None               # `sync: gap` in attesa della END successiva
        self._bt_ultimo = None
        self._t_globale = 0            # tempo monotono fra i file (durate mai negative)
        self._seg = 0                  # segmento corrente: un avvio (`heap main`) di un file

    # -- ingresso ------------------------------------------------------------

    def aggiungi_file(self, nome, testo):
        righe = testo.splitlines()
        prima = self._riconosciute()
        stato = {'boot': 0, 'deinit_dal_boot': False, 'ultimo_grezzo': None, 'giorno': 0,
                 'offset': None, 'spontaneo': False}
        self._nuovo_segmento()                    # un file nuovo non continua l'avvio precedente
        for i, grezza in enumerate(righe):
            self.righe += 1
            riga = RE_ANSI.sub('', grezza).rstrip('\r\n ')
            self._riga(nome, riga, righe, i, stato)
        self.file.append({'nome': os.path.basename(nome), 'righe': len(righe),
                          'riconosciute': self._riconosciute() - prima})

    def _nuovo_segmento(self):
        """Nuovo avvio (o nuovo file): l'heap riparte, `up min` si azzera, lo stato BT e ignoto."""
        self._seg += 1
        self._bt_ultimo = None

    def _riconosciute(self):
        return self.n_orologio + self.n_pkjs + self.n_fault

    def _tempo(self, ora, stato):
        """Secondi monotoni: gestisce il passaggio di mezzanotte dentro il file e sposta in avanti
        i file successivi, cosi le durate non tornano mai indietro (i log hanno solo l'ora)."""
        t = ora_in_secondi(ora) + stato['giorno'] * 86400
        if stato['ultimo_grezzo'] is not None and t < stato['ultimo_grezzo'] - 60:
            stato['giorno'] += 1                      # mezzanotte: l'ora e ripartita da 00:00:00
            t += 86400
        stato['ultimo_grezzo'] = t
        if stato['offset'] is None:
            stato['offset'] = max(0, self._t_globale - t)
        t += stato['offset']
        self._t_globale = max(self._t_globale, t)
        return t

    def _fuori_filtro(self, ora):
        if self.since and ora < self.since:
            return True
        if self.until and ora > self.until:
            return True
        return False

    def _riga(self, nome, riga, tutte, i, stato):
        fault = RE_APP_FAULT.search(riga)
        if fault:
            m = RE_ORA.match(riga)
            ora = m.group(1) if m else '--:--:--'
            if self._fuori_filtro(ora):
                self.n_fuori_filtro += 1
                return
            self.n_fault += 1
            self.app_fault.append({
                'ora': ora, 'file': os.path.basename(nome), 'testo': riga.strip(),
                'pc': (RE_PC.search(riga).group(1) if RE_PC.search(riga) else None),
                'lr': (RE_LR.search(riga).group(1) if RE_LR.search(riga) else None),
                # anche le due righe di contesto (PC/LR desimbolizzate) vanno ripulite dall'ANSI
                'contesto': [RE_ANSI.sub('', r).strip() for r in tutte[i + 1:i + 3]]})
            return
        m = RE_OROLOGIO.match(riga)
        if m:
            ora, sorgente, msg = m.group(1), m.group(2), m.group(4).strip()
            # gli avvii si contano su tutto il file, anche fuori dalla finestra --since/--until:
            # e' l'unico modo per sapere se un `heap main` ha davvero un `heap deinit` prima.
            self._stato_avvio(msg, stato)
            if self._fuori_filtro(ora):
                self.n_fuori_filtro += 1
                return
            t = self._tempo(ora, stato)
            if self._orologio(nome, ora, t, sorgente, msg, stato):
                self.n_orologio += 1
            else:
                self.n_ignorate += 1
            return
        m = RE_PKJS.match(riga)
        if m:
            ora, msg = m.group(1), m.group(2).strip()
            if self._fuori_filtro(ora):
                self.n_fuori_filtro += 1
                return
            self._tempo(ora, stato)
            msg = RE_PKJS_PREFISSO.sub('', msg)
            if self._telefono(nome, ora, msg):
                self.n_pkjs += 1
            else:
                self.n_ignorate += 1
            return
        self.n_ignorate += 1

    def _stato_avvio(self, msg, stato):
        """Avanza lo stato avvii/deinit (e il segmento) leggendo `heap main`/`heap deinit`.
        Chiamata per OGNI riga dell'orologio, filtro compreso (§2.4 punto 1)."""
        m = RE_HEAP.match(msg)
        if not m:
            return
        fase = m.group(1)
        if fase == 'main':
            stato['spontaneo'] = stato['boot'] > 0 and not stato['deinit_dal_boot']
            stato['boot'] += 1
            stato['deinit_dal_boot'] = False
            self._nuovo_segmento()
        elif fase == 'deinit':
            stato['deinit_dal_boot'] = True

    # -- righe dell'orologio -------------------------------------------------

    def _orologio(self, nome, ora, t, sorgente, msg, stato):
        """Smista una riga dell'orologio; True se il formato e riconosciuto."""
        base = os.path.basename(nome)
        self._anomalia_orologio(base, ora, msg, sorgente)
        if msg.startswith('sync:'):
            m = RE_SYNC_MSG.match(msg)
            if not RE_SYNC_OPEN.match(msg):
                # `sync: open` e' stampata da prv_init a OGNI avvio: non appartiene a nessuna
                # sync e chiuderebbe la finestra della sync precedente sull'init successivo.
                self.sync_righe.append({'ora': ora, 't': t, 'seg': self._seg, 'file': base,
                                        'msg': int(m.group(1)) if m else None})
            if self._ol_sync(ora, t, msg):
                return True
        elif self._ol_sistema(ora, t, msg, base, stato) or self._ol_ui(ora, msg):
            return True
        return normalizza(msg) in self.anomalie   # le WARNING/ERROR contano come riconosciute

    def _ol_sistema(self, ora, t, msg, base, stato):
        """heap (avvii, deinit e fasi), watch:, batt:, bt:, storage:, settings:."""
        m = RE_HEAP.match(msg)
        if m:
            fase, used, free = m.group(1), int(m.group(2)), int(m.group(3))
            self.heap.setdefault(fase, []).append({'ora': ora, 't': t, 'used': used,
                                                   'free': free, 'file': base, 'seg': self._seg})
            if fase == 'main':                    # lo stato e' gia' avanzato in _stato_avvio
                self.avvii.append({'ora': ora, 'file': base, 'spontaneo': stato['spontaneo'],
                                   'seg': self._seg})
            elif fase == 'deinit':
                self.deinit.append({'ora': ora, 'file': base})
            return True
        m = RE_WATCH.match(msg)
        if m:
            self.watch.append({'ora': ora, 'fw': '%s.%s.%s' % (m.group(1), m.group(2), m.group(3)),
                               'model': int(m.group(4))})
            return True
        m = RE_BATT.match(msg)
        if m:
            self.batt.append({'ora': ora, 't': t, 'pct': int(m.group(1)), 'chg': int(m.group(2)),
                              'plug': int(m.group(3)), 'up_min': int(m.group(4)),
                              'file': base, 'seg': self._seg})
            return True
        m = RE_BT.match(msg)
        if m:
            valore = int(m.group(1))
            if valore != self._bt_ultimo:
                # `_bt_ultimo` e' azzerato a ogni avvio e a ogni file: la prima riga `bt:` di un
                # avvio e' lo stato iniziale e va elencata anche se ripete il valore precedente.
                self.bt.append({'ora': ora, 'connected': valore, 'file': base,
                                'iniziale': self._bt_ultimo is None})
                self._bt_ultimo = valore
            return True
        m = RE_INIT.match(msg)
        if m:
            voce = {'ora': ora, 'file': base, 'seg': self._seg}
            for i, campo in enumerate(['open', 'man', 'sto', 'set', 'mod', 'win', 'syn', 'tot']):
                voce[campo] = int(m.group(i + 1))
            voce['resto'] = voce['tot'] - sum(voce[c] for c in PARTI_INIT)
            self.init_ms.append(voce)
            return True
        m = RE_DEINIT.match(msg)
        if m:
            voce = {'ora': ora, 'file': base, 'seg': self._seg}
            for i, campo in enumerate(['mod', 'fl', 'win', 'tot']):
                voce[campo] = int(m.group(i + 1))
            voce['resto'] = voce['tot'] - sum(voce[c] for c in PARTI_DEINIT)
            self.deinit_ms.append(voce)
            return True
        m = RE_MIGRAZIONE.match(msg)
        if m:
            self.migrazioni.append({'ora': ora, 'file': base, 'seg': self._seg,
                                    'da': int(m.group(1)), 'a': int(m.group(2)),
                                    'settings': int(m.group(3)), 'shake': int(m.group(4))})
            return True
        m = RE_STORAGE.match(msg)
        if m:
            self.storage.append({'ora': ora, 'quota': int(m.group(1)), 'album': int(m.group(2)),
                                 'schema': int(m.group(3)), 'manifest': m.group(4),
                                 'valid': int(m.group(5))})
            return True
        m = RE_SETTINGS.match(msg)
        if m:
            self.settings.append({'ora': ora, 'origine': m.group(1), 'layout': int(m.group(2)),
                                  'font': int(m.group(3)), 'interval': int(m.group(4)),
                                  'order': int(m.group(5)), 'shake': int(m.group(6))})
            return True
        return False

    def _ol_sync(self, ora, t, msg):
        """sync: open / gap / end / msg (le altre righe `sync:` sono WARNING)."""
        m = RE_SYNC_OPEN.match(msg)
        if m:
            self.sync_open.append({'ora': ora, 'inbox': int(m.group(1)), 'outbox': int(m.group(2)),
                                   'esito': int(m.group(3)), 'chunk': int(m.group(4)),
                                   'heap_used': int(m.group(5)), 'heap_free': int(m.group(6)),
                                   'costo': int(m.group(7))})
            return True
        m = RE_SYNC_GAP.match(msg)
        if m:
            self._gap = {'n': int(m.group(1)), 'max': int(m.group(2)), 'avg': int(m.group(3))}
            return True
        m = RE_SYNC_END.match(msg)
        if m:
            n = int(m.group(3))
            avg = int(m.group(7))
            photo_ms = int(m.group(5))
            # `photo - avg*n` (tempo non speso in persist) e' fisicamente >= 0: se viene negativo
            # il campo `photo` di quella END non e' attendibile -> None (n/d nelle tabelle).
            stima = photo_ms - avg * n
            self.sync_end.append({'ora': ora, 't': t, 'seg': self._seg, 'slot': int(m.group(1)),
                                  'code': int(m.group(2)), 'n': n, 'commit_ms': int(m.group(4)),
                                  'photo_ms': photo_ms, 'ch_max': int(m.group(6)),
                                  'ch_avg': avg, 'heap_free': int(m.group(8)),
                                  'non_persist_ms': stima if stima >= 0 else None,
                                  'non_persist_grezzo': stima, 'gap': self._gap,
                                  # M1: gli intervalli fra PHOTO_DATA stanno per costruzione dentro
                                  # [BEGIN, END]: se la loro somma (o il max) supera `photo`, uno dei
                                  # due e' stato falsato da un salto d'orologio (risincronizzazione).
                                  'gap_attendibile': (self._gap is None or photo_ms < 0 or
                                                      (self._gap['max'] <= photo_ms and
                                                       self._gap['n'] * self._gap['avg'] <= photo_ms))})
            self._gap = None
            return True
        m = RE_SYNC_MSG.match(msg)
        if m:
            self.sync_msg.append({'ora': ora, 't': t, 'msg': int(m.group(1)), 'fields': m.group(2),
                                  'act': int(m.group(3)), 'out': int(m.group(4)),
                                  'code': int(m.group(5)), 'off': int(m.group(6)),
                                  'st': int(m.group(7)), 'heap_free': int(m.group(8))})
            return True
        return False

    def _ol_ui(self, ora, msg):
        """photo:, draw:, tick:, rot(), luma(), ui_time: e la riga informativa digits:."""
        m = RE_PHOTO.match(msg)
        if m:
            self.foto.append({'ora': ora, 'slot': int(m.group(1)), 'esito': m.group(2),
                              'chunk': int(m.group(3)), 'ms': int(m.group(4)),
                              'heap_used': int(m.group(5)), 'heap_free': int(m.group(6))})
            return True
        if RE_PHOTO_READ.match(msg):
            self.foto_errori += 1
            return True
        if RE_PHOTO_INFO.match(msg):
            return True
        m = RE_DRAW.match(msg)
        if m:
            self.draw.append({'ora': ora, 'mode': int(m.group(1)), 'full': int(m.group(2)),
                              'ms': int(m.group(3)),
                              'info': int(m.group(4)) if m.group(4) is not None else None})
            return True
        m = RE_TICK.match(msg)
        if m:
            self.tick.append({'ora': ora, 'ms': int(m.group(1))})
            return True
        m = RE_ROT.match(msg)
        if m:
            self.rot.append({'ora': ora, 'motivo': m.group(1), 't_min': int(m.group(2)),
                             'interval': int(m.group(3)), 'order': int(m.group(4)),
                             'shake': int(m.group(5)), 'slot': int(m.group(6)),
                             'demo': int(m.group(7)), 'valid': int(m.group(8)),
                             'bad': m.group(9)})
            return True
        m = RE_LUMA.match(msg)
        if m:
            self.luma.append({'ora': ora, 'motivo': m.group(1), 'mode': int(m.group(2)),
                              'band_y': int(m.group(3)), 'band_h': int(m.group(4)),
                              'luma_h': int(m.group(5)), 'photo': int(m.group(6)),
                              'white': int(m.group(7)), 'bad': int(m.group(8)),
                              'bad_w': int(m.group(9)), 'bad_b': int(m.group(10)),
                              'mean': int(m.group(11)), 'fg': m.group(12).lower(),
                              'halo': int(m.group(13))})
            return True
        m = RE_UITIME.match(msg)
        if m:
            self.ui_time.append({'ora': ora, 'cs': int(m.group(1)), 'bt': int(m.group(2)),
                                 'loc': m.group(3), 'w': int(m.group(4)), 'h': int(m.group(5)),
                                 'unob': int(m.group(6)), 'lay': int(m.group(7)),
                                 'font': int(m.group(8)), 'mode': int(m.group(9)),
                                 'band': int(m.group(10))})
            return True
        if RE_DIGITS_INFO.match(msg):
            return True
        return False

    def _anomalia_orologio(self, base, ora, msg, sorgente=None):
        etichetta = None
        for regex, nome in ANOMALIE_OROLOGIO:
            if regex.match(msg):
                etichetta = nome
                break
        if etichetta is None:
            if RE_DIGITS_INFO.match(msg) or RE_MIGRAZIONE.match(msg):
                # `storage: manifest schema 1 -> 2 migrated (...)` e' informativa (una volta sola,
                # al primo avvio dopo l'aggiornamento): sta nella sezione 13, non fra le anomalie.
                return
            if msg.startswith('digits:') or (msg.startswith('storage:') and 'quota=' not in msg):
                etichetta = 'digits' if msg.startswith('digits:') else 'storage'
            elif any(p in msg for p in PAROLE_ANOMALIA):
                etichetta = 'varie'
        if etichetta is None:
            return
        if etichetta.startswith('sync'):
            self.sync_warn[etichetta] = self.sync_warn.get(etichetta, 0) + 1
        self._registra_anomalia('orologio', etichetta, base, ora, msg, sorgente)

    def _registra_anomalia(self, dove, etichetta, base, ora, msg, sorgente=None):
        chiave = normalizza(msg)
        voce = self.anomalie.get(chiave)
        if voce is None:
            self.anomalie[chiave] = {'dove': dove, 'classe': etichetta, 'n': 1, 'prima_ora': ora,
                                     'file': base, 'sorgente': sorgente, 'esempio': msg}
        else:
            voce['n'] += 1

    # -- righe del telefono (PKJS) -------------------------------------------

    def _telefono(self, nome, ora, msg):
        base = os.path.basename(nome)
        m = RE_JS_TAG.match(msg)
        tag = ('[%s]' % m.group(1)) if m else None
        if tag == '[PHONESIM]':
            self.n_phonesim += 1            # rumore di pypkjs: contato, mai anomalia
            return True
        if tag:
            self.pkjs_tag[tag] = self.pkjs_tag.get(tag, 0) + 1
        if any(p in msg for p in PAROLE_ANOMALIA_JS):
            self._registra_anomalia('pkjs', tag or 'pkjs', base, ora, msg)
        m = RE_JS_CHUNK.match(msg)
        if m:
            self.pkjs_chunk.append(int(m.group(3)))
            return True
        for tipo, regex in (('pronto', RE_JS_PRONTO), ('piano', RE_JS_PIANO),
                            ('JS_READY', RE_JS_READY), ('HELLO', RE_JS_HELLO),
                            ('SYNC_READY', RE_JS_SYNC_READY), ('foto k/n', RE_JS_FOTO_N),
                            ('foto OK', RE_JS_FOTO_OK), ('foto FALLITA', RE_JS_FOTO_KO),
                            ('fine', RE_JS_FINE), ('config apro', RE_CFG_APRO),
                            ('config chiusa', RE_CFG_CHIUSA),
                            ('config applicato', RE_CFG_APPLICATO)):
            m = regex.match(msg)
            if m:
                self.pkjs_eventi.append({'ora': ora, 'tipo': tipo, 'testo': msg,
                                         'dati': [g for g in m.groups() if g is not None]})
                return True
        m = RE_JS_RETRY.search(msg)
        if m:
            self.pkjs_eventi.append({'ora': ora, 'tipo': 'nuovo tentativo', 'testo': msg,
                                     'dati': [m.group(1), m.group(2)]})
            return True
        return tag is not None

    # -- derivati ------------------------------------------------------------

    def durate_sync(self):
        """Una sync per ogni `sync: msg=1` (JS_READY): dura fino all'ultima riga `sync:` dello
        STESSO avvio prima del JS_READY successivo (`sync: open` non e' in `sync_righe`: e'
        dell'init). La finestra non attraversa mai un riavvio o un altro file; se non contiene
        un `msg=9` (SYNC_DONE) la sync non si e' chiusa dentro il log (`nota`).
        Risoluzione 1 s (orari del log): la durata è ±1 s."""
        inizi = [i for i, r in enumerate(self.sync_righe) if r['msg'] == 1]
        fuori = []
        for k, i in enumerate(inizi):
            limite = inizi[k + 1] - 1 if k + 1 < len(inizi) else len(self.sync_righe) - 1
            fine = i
            seg = self.sync_righe[i]['seg']
            while fine + 1 <= limite and self.sync_righe[fine + 1]['seg'] == seg:
                fine += 1
            prima, ultima = self.sync_righe[i], self.sync_righe[fine]
            completa = any(r['msg'] == 9 for r in self.sync_righe[i:fine + 1])
            fuori.append({'inizio': prima['ora'], 'fine': ultima['ora'], 'file': prima['file'],
                          'durata_s': ultima['t'] - prima['t'],
                          'completa': completa,
                          'nota': '' if completa else 'senza SYNC_DONE',
                          'end': len([e for e in self.sync_end
                                      if e['seg'] == prima['seg']
                                      and prima['t'] <= e['t'] <= ultima['t']])})
        return fuori

    def conteggio_msg(self):
        per_msg = {}
        for r in self.sync_msg:
            voce = per_msg.setdefault(r['msg'], {'n': 0, 'code_non_zero': 0, 'esempi': []})
            voce['n'] += 1
            if r['code']:
                voce['code_non_zero'] += 1
                if len(voce['esempi']) < 5:
                    voce['esempi'].append({'ora': r['ora'], 'code': r['code'],
                                           'code_nome': CODE_NOMI.get(r['code'], '?')})
        return per_msg

    @staticmethod
    def _segmenta(campioni):
        """Spezza una lista di campioni (in ordine di lettura) a ogni cambio di `seg`."""
        gruppi = []
        for c in campioni:
            if not gruppi or gruppi[-1][0]['seg'] != c['seg']:
                gruppi.append([])
            gruppi[-1].append(c)
        return gruppi

    def heap_fasi(self):
        """Un riepilogo per fase. Delta e pendenza si calcolano DENTRO un avvio: a cavallo di un
        riavvio l'heap riparte da un altro valore e la differenza non vuol dire niente, quindi
        con piu' segmenti i campi aggregati sono None e i numeri stanno in `segmenti`."""
        fuori = {}
        for fase, campioni in self.heap.items():
            segmenti = []
            for gruppo in self._segmenta(campioni):
                pu = pendenza([(c['t'], c['used']) for c in gruppo])
                pf = pendenza([(c['t'], c['free']) for c in gruppo])
                segmenti.append({
                    'file': gruppo[0]['file'], 'n': len(gruppo),
                    'prima_ora': gruppo[0]['ora'], 'ultima_ora': gruppo[-1]['ora'],
                    'primo_used': gruppo[0]['used'], 'primo_free': gruppo[0]['free'],
                    'ultimo_used': gruppo[-1]['used'], 'ultimo_free': gruppo[-1]['free'],
                    'min_free': min(c['free'] for c in gruppo),
                    'delta_used': gruppo[-1]['used'] - gruppo[0]['used'],
                    'delta_free': gruppo[-1]['free'] - gruppo[0]['free'],
                    'pendenza_used_b_ora': round(pu * 3600.0, 1) if pu is not None else None,
                    'pendenza_free_b_ora': round(pf * 3600.0, 1) if pf is not None else None})
            uno = segmenti[0] if len(segmenti) == 1 else None
            voce = {'n': len(campioni), 'primo_used': campioni[0]['used'],
                    'primo_free': campioni[0]['free'], 'ultimo_used': campioni[-1]['used'],
                    'ultimo_free': campioni[-1]['free'],
                    'min_free': min(c['free'] for c in campioni),
                    'delta_used': uno['delta_used'] if uno else None,
                    'delta_free': uno['delta_free'] if uno else None,
                    'prima_ora': campioni[0]['ora'], 'ultima_ora': campioni[-1]['ora'],
                    'n_avvii': len(segmenti), 'segmenti': segmenti}
            if fase == 'tick':
                voce['pendenza_used_b_ora'] = uno['pendenza_used_b_ora'] if uno else None
                voce['pendenza_free_b_ora'] = uno['pendenza_free_b_ora'] if uno else None
            fuori[fase] = voce
        return fuori

    def avvio_uscita(self):
        """Una riga per avvio con i campi di `init:` e di `deinit:` (build M). Le righe sono
        raggruppate per SEGMENTO, come heap/batteria/sync: il `deinit:` di un avvio precede il
        `heap main` di quello dopo, quindi cade nello stesso segmento del suo `init:` (se il log
        comincia a meta', un segmento puo' avere solo il `deinit:` o solo l'`init:`)."""
        righe = []
        indice = {}
        for tipo, elenco in (('init', self.init_ms), ('deinit', self.deinit_ms)):
            campi = CAMPI_INIT if tipo == 'init' else CAMPI_DEINIT
            for v in elenco:
                voce = indice.get(v['seg'])
                if voce is None:
                    voce = {'seg': v['seg'], 'file': v['file'], 'ora': v['ora'],
                            'init': None, 'deinit': None}
                    indice[v['seg']] = voce
                    righe.append(voce)
                voce[tipo] = dict([('ora', v['ora'])] + [(c, v[c]) for c in campi])
        righe.sort(key=lambda voce: voce['seg'])
        return righe

    def avvio_uscita_stat(self):
        """min/media/max/p95 per campo su TUTTI gli avvii dei file letti (le righe `init:` sono
        una per avvio: qui il confronto fra avvii ha senso anche a cavallo di un riavvio)."""
        return {
            'init': dict((c, statistiche([v[c] for v in self.init_ms])) for c in CAMPI_INIT),
            'deinit': dict((c, statistiche([v[c] for v in self.deinit_ms])) for c in CAMPI_DEINIT),
        }

    def fasi_ordinate(self):
        note = [f for f in FASI_ORDINE if f in self.heap]
        altre = sorted(f for f in self.heap if f not in FASI_ORDINE)
        return note + altre

    def draw_gruppi(self):
        gruppi = {}
        for d in self.draw:
            chiave = 'mode=%d full=%d' % (d['mode'], d['full'])
            gruppi.setdefault(chiave, []).append(d)
        fuori = {}
        for chiave in sorted(gruppi):
            campioni = gruppi[chiave]
            st = statistiche([d['ms'] for d in campioni])
            st['sopra_soglia'] = len([d for d in campioni if d['ms'] > self.soglia_ms])
            info = [d['info'] for d in campioni if d['info'] is not None and d['info'] >= 0]
            st['info'] = statistiche(info)
            fuori[chiave] = st
        return fuori

    def rot_motivi(self):
        fuori = {}
        for r in self.rot:
            voce = fuori.setdefault(r['motivo'], {'n': 0})
            voce['n'] += 1
            voce['ultimo_slot'] = r['slot']
            voce['demo'] = r['demo']
            voce['bad'] = r['bad']
            voce['ultima_ora'] = r['ora']
        return fuori

    def luma_per_fg(self):
        fuori = {}
        for r in self.luma:
            fuori[r['fg']] = fuori.get(r['fg'], 0) + 1
        return fuori

    def _batteria_gruppi(self):
        """Righe `batt:` raggruppate per tratto di scarica: un tratto nuovo a ogni avvio/file e
        ogni volta che `up min` torna indietro (riavvio senza `heap main` nel log); i campioni in
        carica (`chg=1`/`plug=1`) sono scartati e interrompono il tratto."""
        gruppi = []
        prec = None
        for b in self.batt:
            if b['chg'] or b['plug']:
                prec = None                     # la carica interrompe la scarica
                continue
            if prec is None or b['seg'] != prec['seg'] or b['up_min'] < prec['up_min']:
                gruppi.append([])
            gruppi[-1].append(b)
            prec = b
        return gruppi

    def batteria_segmenti(self):
        """Un riepilogo per tratto di scarica. La pendenza e' ai minimi quadrati sull'ORARIO DEL
        LOG (`up min` si azzera a ogni riavvio: non e' un asse dei tempi continuo). Un tratto con
        meno di 2 campioni o tutto dentro lo stesso secondo non ha pendenza."""
        fuori = []
        for gruppo in self._batteria_gruppi():
            p = pendenza([(b['t'], b['pct']) for b in gruppo])
            ore = (gruppo[-1]['t'] - gruppo[0]['t']) / 3600.0
            fuori.append({'file': gruppo[0]['file'], 'n': len(gruppo),
                          'da_ora': gruppo[0]['ora'], 'a_ora': gruppo[-1]['ora'],
                          'da_pct': gruppo[0]['pct'], 'a_pct': gruppo[-1]['pct'],
                          'ore': round(ore, 3),
                          'pendenza_pct_ora': round(p * 3600.0, 2) if p is not None else None})
        return fuori

    def batt_scartati(self):
        return len([b for b in self.batt if b['chg'] or b['plug']])

    def pendenza_batteria(self):
        """%/h complessiva: punti persi e ore SOMMATI sui tratti utilizzabili (mai a cavallo di
        un riavvio o di una ricarica). None se nessun tratto ha due campioni in secondi diversi."""
        tot_pct, tot_ore = 0.0, 0.0
        for gruppo in self._batteria_gruppi():
            if pendenza([(b['t'], b['pct']) for b in gruppo]) is None:
                continue
            tot_pct += gruppo[-1]['pct'] - gruppo[0]['pct']
            tot_ore += (gruppo[-1]['t'] - gruppo[0]['t']) / 3600.0
        if tot_ore <= 0:
            return None
        return round(tot_pct / tot_ore, 2)

    def vuota(self):
        return self._riconosciute() == 0


# ---------------------------------------------------------------- resa


MAX_RIGHE_TABELLA = 40


class Resa(object):
    """Accumula il riepilogo in testo allineato o in markdown (--md)."""

    def __init__(self, md=False):
        self.md = md
        self.righe = []

    def titolo(self, testo):
        self.righe.append('')
        self.righe.append(('## ' if self.md else '=== ') + testo + ('' if self.md else ' ==='))

    def riga(self, testo=''):
        self.righe.append(('' if self.md else '  ') + testo if testo else '')

    def elenco(self, testo):
        self.righe.append(('- ' if self.md else '  - ') + testo)

    def tabella(self, intestazioni, righe, max_righe=None):
        """max_righe: taglia le tabelle lunghe (il JSON resta completo)."""
        righe = [[('' if c is None else str(c)) for c in r] for r in righe]
        if not righe:
            self.riga('(nessuna riga)')
            return
        avanzo = 0
        if max_righe and len(righe) > max_righe:
            avanzo = len(righe) - max_righe
            righe = righe[:max_righe]
        if self.md:
            if self.righe and self.righe[-1] != '':
                self.righe.append('')      # in GFM una tabella vuole una riga vuota prima
            self.righe.append('| ' + ' | '.join(intestazioni) + ' |')
            self.righe.append('|' + '|'.join(['---'] * len(intestazioni)) + '|')
            for r in righe:
                self.righe.append('| ' + ' | '.join(r) + ' |')
            self.righe.append('')
            if avanzo:
                self.riga('(+ altre %d righe: vedi --json)' % avanzo)
            return
        larghezze = [len(h) for h in intestazioni]
        for r in righe:
            for i, c in enumerate(r):
                larghezze[i] = max(larghezze[i], len(c))
        fmt = '  '.join('%-' + str(w) + 's' for w in larghezze)
        self.righe.append('  ' + (fmt % tuple(intestazioni)).rstrip())
        self.righe.append('  ' + '  '.join('-' * w for w in larghezze))
        for r in righe:
            self.righe.append('  ' + (fmt % tuple(r)).rstrip())
        if avanzo:
            self.riga('(+ altre %d righe: vedi --json)' % avanzo)

    def testo(self):
        return '\n'.join(self.righe).strip('\n') + '\n'


def _riassunto_testa(d, r):
    nomi = ', '.join('%s (%d righe)' % (f['nome'], f['righe']) for f in d.file)
    if r.md:
        r.righe.append('# Galleria — riepilogo dei log')
        r.righe.append('')
    else:
        r.righe.append('Galleria — riepilogo dei log')
    r.riga('file: ' + (nomi or '(nessuno)'))
    r.riga('righe: %d totali, %d orologio, %d pkjs (%d PHONESIM), %d fault, %d ignorate%s'
           % (d.righe, d.n_orologio, d.n_pkjs, d.n_phonesim, d.n_fault, d.n_ignorate,
              (', %d fuori dal filtro' % d.n_fuori_filtro) if (d.since or d.until) else ''))
    filtri = []
    if d.since:
        filtri.append('--since ' + d.since)
    if d.until:
        filtri.append('--until ' + d.until)
    filtri.append('--threshold-ms %d' % d.soglia_ms)
    r.riga('filtri: ' + ' '.join(filtri))


def _sez1_avvii(d, r):
    r.titolo('1. Avvii')
    r.tabella(['ora', 'file', 'nota'],
              [[a['ora'], a['file'], 'RIAVVIO SPONTANEO' if a['spontaneo'] else 'ok']
               for a in d.avvii])
    spont = [a for a in d.avvii if a['spontaneo']]
    r.riga('avvii: %d, deinit: %d, riavvii spontanei: %d'
           % (len(d.avvii), len(d.deinit), len(spont)))
    for a in spont:
        r.elenco('!! riavvio spontaneo alle %s (%s): nessun `heap deinit` prima' % (a['ora'], a['file']))
    for f in d.app_fault:
        r.elenco('!! App fault! alle %s (%s) PC %s LR %s' % (f['ora'], f['file'], f['pc'], f['lr']))
        for c in f['contesto']:
            r.elenco('   %s' % c)
    if not spont and not d.app_fault:
        r.riga('nessun riavvio spontaneo, nessun App fault!')


def _sez2_orologio(d, r):
    r.titolo('2. Orologio')
    if d.watch:
        u = d.watch[-1]
        r.riga('firmware %s, model %d (%d righe `watch:`)' % (u['fw'], u['model'], len(d.watch)))
        diversi = sorted({(w['fw'], w['model']) for w in d.watch})
        if len(diversi) > 1:
            r.elenco('attenzione: firmware/modello diversi nei file: %s' % (diversi,))
    else:
        r.riga('nessuna riga `watch: fw` (build precedente a S8 o log troncato)')
    r.tabella(['ora', 'cs', 'bt', 'loc', 'schermo', 'unob', 'lay', 'font', 'mode', 'band'],
              [[u['ora'], u['cs'], u['bt'], u['loc'], '%dx%d' % (u['w'], u['h']), u['unob'],
                u['lay'], u['font'], u['mode'], u['band']] for u in d.ui_time],
              max_righe=MAX_RIGHE_TABELLA)


def _sez3_heap(d, r):
    r.titolo('3. Heap per fase')
    righe = []
    fasi = d.heap_fasi()
    multi = False
    for fase in d.fasi_ordinate():
        v = fasi[fase]
        uno = v['n_avvii'] == 1
        multi = multi or not uno
        righe.append([fase, v['n'], v['n_avvii'], '%d/%d' % (v['primo_used'], v['primo_free']),
                      '%d/%d' % (v['ultimo_used'], v['ultimo_free']), v['min_free'],
                      ('%+d' % v['delta_used']) if uno else 'n/d',
                      ('%+d' % v['delta_free']) if uno else 'n/d'])
    r.tabella(['fase', 'n', 'avvii', 'primo u/f', 'ultimo u/f', 'min free', 'd used', 'd free'],
              righe)
    if multi:
        r.riga('d used/d free: `n/d` quando la fase copre piu\' avvii (delta solo per segmento)')
    if 'tick' in fasi:
        for i, s in enumerate(fasi['tick']['segmenti']):
            r.riga('heap tick, avvio %d (%s %s-%s): %d campioni, pendenza used %s B/ora,'
                   ' free %s B/ora (O7: deve stare a 0)'
                   % (i + 1, s['file'], s['prima_ora'], s['ultima_ora'], s['n'],
                      s['pendenza_used_b_ora'], s['pendenza_free_b_ora']))


def _sez4_init(d, r):
    r.titolo('4. Init')
    r.tabella(['ora', 'quota', 'album', 'schema', 'manifest', 'valid'],
              [[s['ora'], s['quota'], s['album'], s['schema'], s['manifest'], s['valid']]
               for s in d.storage])
    r.tabella(['ora', 'origine', 'layout', 'font', 'interval', 'order', 'shake'],
              [[s['ora'], s['origine'], s['layout'], s['font'], s['interval'], s['order'],
                s['shake']] for s in d.settings])
    r.tabella(['ora', 'inbox/outbox', 'esito', 'chunk', 'heap u/f', 'costo'],
              [[s['ora'], '%d/%d' % (s['inbox'], s['outbox']), s['esito'], s['chunk'],
                '%d/%d' % (s['heap_used'], s['heap_free']), s['costo']] for s in d.sync_open])


def _sez5_sync(d, r):
    r.titolo('5. Sync')
    righe = []
    for e in d.sync_end:
        gap = e['gap']
        righe.append([e['ora'], e['slot'], '%d %s' % (e['code'], CODE_NOMI.get(e['code'], '?')),
                      e['n'], e['commit_ms'], e['photo_ms'], e['ch_max'], e['ch_avg'],
                      e['non_persist_ms'] if e['non_persist_ms'] is not None else 'n/d',
                      e['heap_free'],
                      ('' if gap is None else
                       ('n=%d max %d avg %d' % (gap['n'], gap['max'], gap['avg']))
                       + ('' if e.get('gap_attendibile', True) else ' n/d (salto orologio)')) or '-'])
    r.tabella(['ora', 'slot', 'code', 'n', 'commit', 'photo', 'ch max', 'ch avg',
               'photo-avg*n', 'heap free', 'gap'], righe, max_righe=MAX_RIGHE_TABELLA)
    inattendibili = [e for e in d.sync_end if e['non_persist_ms'] is None]
    if inattendibili:
        r.riga('photo-avg*n: `n/d` su %d END (photo < avg*n, cioe\' impossibile: il campo `photo`'
               ' di quelle righe non e\' attendibile)' % len(inattendibili))
    ok = len([e for e in d.sync_end if e['code'] == 0])
    r.riga('foto concluse: %d ok, %d fallite' % (ok, len(d.sync_end) - ok))
    if d.sync_end:
        r.riga('ch avg: %s ; ch max: %s'
               % (fmt_stat(statistiche([e['ch_avg'] for e in d.sync_end])),
                  fmt_stat(statistiche([e['ch_max'] for e in d.sync_end]))))
    per_msg = d.conteggio_msg()
    r.tabella(['msg', 'nome', 'n', 'code != 0'],
              [[k, MSG_NOMI.get(k, '?'), per_msg[k]['n'], per_msg[k]['code_non_zero']]
               for k in sorted(per_msg)])
    for k in sorted(per_msg):
        for e in per_msg[k]['esempi']:
            r.elenco('!! msg=%d (%s) alle %s -> code=%d %s'
                     % (k, MSG_NOMI.get(k, '?'), e['ora'], e['code'], e['code_nome']))
    durate = d.durate_sync()
    r.tabella(['inizio', 'fine', 'durata s (+/-1)', 'foto (END)', 'file', 'nota'],
              [[s['inizio'], s['fine'], s['durata_s'], s['end'], s['file'], s['nota']]
               for s in durate])
    if d.sync_warn:
        for k in sorted(d.sync_warn):
            r.elenco('!! %s: %d' % (k, d.sync_warn[k]))
    else:
        r.riga('nessun WARNING di sync (idle/outbox/inbox/dict_write)')
    gap_nd = [e for e in d.sync_end if e.get('gap') and not e.get('gap_attendibile', True)]
    if gap_nd:
        r.riga('gap n/d per %d foto: somma o max degli intervalli oltre `photo` -> salto '
               'd\'orologio (risincronizzazione): usare gli ack del PKJS se presenti' % len(gap_nd))


def _sez6_foto(d, r):
    r.titolo('6. Foto da persist')
    r.tabella(['ora', 'slot', 'esito', 'chunk', 'ms', 'heap u/f'],
              [[f['ora'], f['slot'], f['esito'], f['chunk'], f['ms'],
                '%d/%d' % (f['heap_used'], f['heap_free'])] for f in d.foto],
              max_righe=MAX_RIGHE_TABELLA)
    ms = statistiche([f['ms'] for f in d.foto])
    r.riga('ms di lettura: %s (O3: > 200 ms -> caricamento a lotti)' % fmt_stat(ms))
    cattive = [f for f in d.foto if f['esito'] != 'ok']
    r.riga('letture: %d, MISMATCH: %d, errori `photo: ... read`: %d'
           % (len(d.foto), len(cattive), d.foto_errori))
    for f in cattive:
        r.elenco('!! CRC %s sullo slot %d alle %s' % (f['esito'], f['slot'], f['ora']))


def _sez7_rendering(d, r):
    r.titolo('7. Rendering (build M)')
    gruppi = d.draw_gruppi()
    righe = []
    for chiave in sorted(gruppi):
        st = gruppi[chiave]
        info = st['info']
        righe.append([chiave, st['n'], st['min'], st['media'], st['max'], st['p95'],
                      st['sopra_soglia'],
                      fmt_stat(info) if info.get('n') else '-'])
    r.tabella(['gruppo', 'n', 'min', 'media', 'max', 'p95', '> %d ms' % d.soglia_ms, 'info ms'],
              righe)
    r.riga('tick: %s' % fmt_stat(statistiche([t['ms'] for t in d.tick])))
    lenti = [d_ for d_ in d.draw if d_['ms'] > d.soglia_ms]
    if lenti:
        r.riga('render sopra %d ms: %d (primo alle %s, %d ms)'
               % (d.soglia_ms, len(lenti), lenti[0]['ora'], lenti[0]['ms']))


def _sez8_rotazione(d, r):
    r.titolo('8. Rotazione')
    motivi = d.rot_motivi()
    r.tabella(['motivo', 'n', 'ultimo slot', 'demo', 'bad', 'ultima ora'],
              [[k, motivi[k]['n'], motivi[k]['ultimo_slot'], motivi[k]['demo'], motivi[k]['bad'],
                motivi[k]['ultima_ora']] for k in sorted(motivi)])


def _sez9_colore(d, r):
    r.titolo('9. Colore')
    r.tabella(['ora', 'motivo', 'mode', 'band h', 'mean', 'bad w/b', 'fg', 'halo'],
              [[l['ora'], l['motivo'], l['mode'], l['band_h'], l['mean'],
                '%d%% (%d/%d)' % (l['bad'], l['bad_w'], l['bad_b']), l['fg'], l['halo']]
               for l in d.luma], max_righe=MAX_RIGHE_TABELLA)
    per_fg = d.luma_per_fg()
    r.riga('decisioni per fg: ' + (', '.join('%s=%d' % (k, per_fg[k]) for k in sorted(per_fg))
                                   or '(nessuna)'))


def _sez10_bt_batteria(d, r):
    r.titolo('10. BT e batteria')
    r.tabella(['ora', 'connected', 'nota'],
              [[b['ora'], b['connected'], 'prima riga dell\'avvio' if b.get('iniziale') else '']
               for b in d.bt])
    r.tabella(['ora', '%', 'chg', 'plug', 'up min'],
              [[b['ora'], b['pct'], b['chg'], b['plug'], b['up_min']] for b in d.batt],
              max_righe=MAX_RIGHE_TABELLA)
    segmenti = d.batteria_segmenti()
    r.tabella(['tratto', 'file', 'da', 'a', 'n', '% da', '% a', 'ore', '%/h'],
              [[i + 1, s['file'], s['da_ora'], s['a_ora'], s['n'], s['da_pct'], s['a_pct'],
                s['ore'], s['pendenza_pct_ora'] if s['pendenza_pct_ora'] is not None else 'n/d']
               for i, s in enumerate(segmenti)])
    p = d.pendenza_batteria()
    r.riga('pendenza batteria: %s ; %d %s (uno per avvio), %d campioni in carica scartati'
           % ('%s %%/h' % p if p is not None
              else 'non calcolabile, nessun tratto con 2 campioni in secondi diversi',
              len(segmenti), 'tratto' if len(segmenti) == 1 else 'tratti', d.batt_scartati()))


def _sez11_pkjs(d, r):
    r.titolo('11. PKJS (telefono)')
    r.tabella(['tag', 'n'], [[k, d.pkjs_tag[k]] for k in sorted(d.pkjs_tag)])
    r.tabella(['ora', 'evento', 'testo'],
              [[e['ora'], e['tipo'], e['testo'][:90]] for e in d.pkjs_eventi],
              max_righe=MAX_RIGHE_TABELLA)
    if d.pkjs_chunk:
        r.riga('chunk ack: %s (raffiche perse dall\'app Android: canale da 2 con DROP_OLDEST)'
               % fmt_stat(statistiche(d.pkjs_chunk)))
    if d.n_phonesim:
        r.riga('[PHONESIM] [WARNING]: %d righe (rumore di pypkjs, ignorate)' % d.n_phonesim)


def _sez12_anomalie(d, r):
    r.titolo('12. Anomalie')
    righe = [[v['dove'], v['classe'], v['n'], v['prima_ora'], v['sorgente'] or v['file'],
              v['esempio'][:90]]
             for v in sorted(d.anomalie.values(), key=lambda v: (-v['n'], v['prima_ora']))]
    r.tabella(['dove', 'classe', 'n', 'prima', 'sorgente', 'esempio'], righe)
    if not righe:
        r.riga('nessuna riga WARNING/ERROR riconosciuta')


def _sez13_avvio_uscita(d, r):
    r.titolo('13. Avvio/uscita (build M)')
    righe = d.avvio_uscita()
    if not righe:
        r.riga('nessuna riga `init:`/`deinit:` (le emette solo la build M,'
               ' GALLERIA_DEBUG_TIMING)')
    else:
        tabella = []
        for i, v in enumerate(righe):
            ini, fin = v['init'], v['deinit']
            tabella.append([i + 1, v['ora'], v['file']]
                           + [(ini[c] if ini else None) for c in CAMPI_INIT]
                           + [(fin['ora'] if fin else None)]
                           + [(fin[c] if fin else None) for c in CAMPI_DEINIT])
        r.tabella(['#', 'ora', 'file'] + CAMPI_INIT + ['ora out']
                  + ['de ' + c for c in CAMPI_DEINIT], tabella, max_righe=MAX_RIGHE_TABELLA)
        st = d.avvio_uscita_stat()
        righe_st = []
        for riga, campi in (('init', CAMPI_INIT), ('deinit', CAMPI_DEINIT)):
            for c in campi:
                v = st[riga][c]
                if v.get('n'):
                    righe_st.append([riga, c, v['n'], v['min'], v['media'], v['max'], v['p95']])
        r.tabella(['riga', 'campo', 'n', 'min', 'media', 'max', 'p95'], righe_st)
        r.riga('ms: open = prima chiamata persist (il firmware apre il file) + chiave 0;'
               ' man = ricerca del manifest; sto = storage_init (comprende open e man);')
        r.riga('  set = settings_init; mod = model_init (comprende la lettura della foto, vedi'
               ' la sezione 6); win = window_create/push; syn = sync_init;')
        r.riga('  resto = tot - (sto+set+mod+win+syn), cioe\' quello che avanza dentro `tot`'
               ' (deinit: tot - (mod+fl+win)).')
        negativi = [v for v in d.init_ms if v['resto'] < 0] + \
                   [v for v in d.deinit_ms if v['resto'] < 0]
        if negativi:
            r.riga('!! resto negativo su %d riga/e (le parti sommano piu\' di `tot`: righe'
                   ' non attendibili)' % len(negativi))
    for m in d.migrazioni:
        r.elenco('migrazione del manifest: schema %d -> %d alle %s (%s), settings %d shake %d'
                 % (m['da'], m['a'], m['ora'], m['file'], m['settings'], m['shake']))
    if not d.migrazioni:
        r.riga('nessuna migrazione dello schema del manifest')


SEZIONI = [_sez1_avvii, _sez2_orologio, _sez3_heap, _sez4_init, _sez5_sync, _sez6_foto,
           _sez7_rendering, _sez8_rotazione, _sez9_colore, _sez10_bt_batteria, _sez11_pkjs,
           _sez12_anomalie, _sez13_avvio_uscita]


def riepilogo_testo(d, md=False):
    r = Resa(md)
    _riassunto_testa(d, r)
    if d.vuota():
        r.riga('nessun evento riconosciuto')
        return r.testo()
    for sezione in SEZIONI:
        sezione(d, r)
    return r.testo()


def riepilogo_json(d):
    """Stesso contenuto della resa testuale, con chiavi stabili (una per sezione, in ordine)."""
    per_msg = d.conteggio_msg()
    fasi = d.heap_fasi()
    return {
        'versione': VERSIONE,
        'file': d.file,
        'righe': {'totali': d.righe, 'orologio': d.n_orologio, 'pkjs': d.n_pkjs,
                  'phonesim': d.n_phonesim, 'fault': d.n_fault, 'ignorate': d.n_ignorate,
                  'fuori_filtro': d.n_fuori_filtro},
        'filtro': {'since': d.since, 'until': d.until, 'threshold_ms': d.soglia_ms},
        'avvii': {
            'n': len(d.avvii),
            'orari': [a['ora'] for a in d.avvii],
            'righe': d.avvii,
            'deinit': len(d.deinit),
            'riavvii_spontanei': [a for a in d.avvii if a['spontaneo']],
            'app_fault': d.app_fault,
        },
        'orologio': {
            'fw': d.watch[-1]['fw'] if d.watch else None,
            'model': d.watch[-1]['model'] if d.watch else None,
            'watch': d.watch,
            'ui_time': d.ui_time,
        },
        'heap': {'fasi': fasi, 'ordine': d.fasi_ordinate()},
        'init': {'storage': d.storage, 'settings': d.settings, 'sync_open': d.sync_open},
        'sync': {
            'end': d.sync_end,
            'foto_ok': len([e for e in d.sync_end if e['code'] == 0]),
            'foto_fallite': len([e for e in d.sync_end if e['code'] != 0]),
            'ch_avg': statistiche([e['ch_avg'] for e in d.sync_end]),
            'ch_max': statistiche([e['ch_max'] for e in d.sync_end]),
            'msg': dict((str(k), per_msg[k]) for k in per_msg),
            'durate': d.durate_sync(),
            'warning': d.sync_warn,
        },
        'foto_persist': {
            'righe': d.foto,
            'ms': statistiche([f['ms'] for f in d.foto]),
            'mismatch': len([f for f in d.foto if f['esito'] != 'ok']),
            'errori_read': d.foto_errori,
        },
        'rendering': {
            'draw': d.draw_gruppi(),
            'tick': statistiche([t['ms'] for t in d.tick]),
            'sopra_soglia': len([x for x in d.draw if x['ms'] > d.soglia_ms]),
        },
        'rotazione': d.rot_motivi(),
        'colore': {'righe': d.luma, 'per_fg': d.luma_per_fg()},
        'bt_batteria': {'bt': d.bt, 'batt': d.batt, 'pendenza_pct_ora': d.pendenza_batteria(),
                        'pendenza_segmenti': d.batteria_segmenti(),
                        'batt_in_carica': d.batt_scartati()},
        'pkjs': {
            'tag': d.pkjs_tag,
            'eventi': d.pkjs_eventi,
            'chunk_ack': statistiche(d.pkjs_chunk),
            'phonesim': d.n_phonesim,
        },
        'anomalie': sorted(d.anomalie.values(), key=lambda v: (-v['n'], v['prima_ora'])),
        'avvio_uscita': {
            'avvii': d.avvio_uscita(),
            'stat': d.avvio_uscita_stat(),
            'campi_init': CAMPI_INIT,
            'campi_deinit': CAMPI_DEINIT,
            'migrazioni': d.migrazioni,
        },
    }


# ---------------------------------------------------------------- CLI


def analizza(percorsi, since=None, until=None, soglia_ms=10):
    d = Raccolta(since=since, until=until, soglia_ms=soglia_ms)
    for percorso in percorsi:
        with open(percorso, 'r', encoding='utf-8', errors='replace') as fh:
            d.aggiungi_file(percorso, fh.read())
    return d


def _errore(messaggio):
    sys.stderr.write('galleria_logstats: %s\n' % messaggio)
    return 2


def main(argv=None):
    p = argparse.ArgumentParser(
        description='Riepilogo dei log dell\'orologio Galleria (S8). Solo stdlib.')
    p.add_argument('file', nargs='*', help='file di log (run_s8_*.log)')
    p.add_argument('--json', dest='json_out', metavar='PATH',
                   help='scrive il riepilogo strutturato (PATH, o "-" per stdout)')
    p.add_argument('--md', action='store_true', help='tabelle markdown')
    p.add_argument('--since', metavar='HH:MM:SS', help='ignora le righe prima di questo orario')
    p.add_argument('--until', metavar='HH:MM:SS', help='ignora le righe dopo questo orario')
    p.add_argument('--threshold-ms', type=int, default=10, dest='threshold_ms',
                   help='soglia dei render lenti (default 10)')
    p.add_argument('--selftest', action='store_true', help='campioni incorporati + asserzioni')
    try:
        a = p.parse_args(argv)
    except SystemExit as e:                       # --help esce 0; argomenti errati escono 2
        return 0 if (e.code or 0) == 0 else 2
    if a.selftest:
        return selftest()
    if not a.file:
        return _errore('serve almeno un file di log (oppure --selftest)')
    for chiave in ('since', 'until'):
        valore = getattr(a, chiave)
        if valore is not None and not RE_ORA_VALIDA.match(valore):
            return _errore('--%s vuole un orario HH:MM:SS (HH<=23, MM/SS<=59), ricevuto %r'
                           % (chiave, valore))
    if a.since and a.until and a.since > a.until:
        return _errore('intervallo vuoto: --since %s e dopo --until %s' % (a.since, a.until))
    if a.threshold_ms < 0:
        return _errore('--threshold-ms non puo\' essere negativo')
    for percorso in a.file:
        if not os.path.isfile(percorso):
            return _errore('file inesistente: %s' % percorso)
    d = analizza(a.file, since=a.since, until=a.until, soglia_ms=a.threshold_ms)
    if a.json_out == '-':
        sys.stdout.write(json.dumps(riepilogo_json(d), indent=1, ensure_ascii=False) + '\n')
        return 0
    if a.json_out:
        with open(a.json_out, 'w', encoding='utf-8') as fh:
            json.dump(riepilogo_json(d), fh, indent=1, ensure_ascii=False)
            fh.write('\n')
    sys.stdout.write(riepilogo_testo(d, md=a.md))
    return 0


# ---------------------------------------------------------------- autotest

# Campione incorporato (>= 40 righe) che copre tutte e 12 le sezioni: righe dell'orologio,
# righe PKJS con prefisso pypkjs (./src/pkjs/index.js:97:0), con prefisso dell'app (Galleria:97)
# e senza prefisso, righe estranee, codici ANSI (anche sulle righe PC/LR del fault), un riavvio
# spontaneo e un App fault!. I DUE avvii hanno entrambi righe `batt:`, `heap tick`, una riga
# `init:` della build M e una sync (con il `sync: open` dell'init in mezzo): pendenze, delta e
# durate non devono attraversarli. C'e' anche la riga `deinit:` (nel secondo avvio) e la riga di
# migrazione del manifest, che e' informativa e non un'anomalia.
CAMPIONE = """Installing app...
App install succeeded.
[08:00:01] main.c:14> heap main: used=24 free=106040
[08:00:01] main.c:83> watch: fw 4.36.2 model=11
[08:00:01] main.c:23> batt: 90% chg=0 plug=0 up 0 min
[08:00:01] storage.c:160> storage: manifest schema 1 -> 2 migrated (settings 1 shake 1)
[08:00:01] storage.c:140> storage: quota=1048576 album=1 schema=1 manifest=persist valid=3
[08:00:01] settings.c:93> settings: persist layout=0 font=0 interval=30 order=0 shake=1
[08:00:01] ui_photo.c:178> photo: slot 0 persist crc ok 134 ch 12 ms heap 45664/60400
[08:00:01] model.c:108> rot(init): t=29801524 int=30 ord=0 shk=0 slot=0 demo=255 valid=3 bad=0
[08:00:01] ui_time.c:732> ui_time: cs=2 bt=1 loc=it_IT 200x228 unob=228 lay=0 font=0 mode=1 band=106
[08:00:01] ui_time.c:682> luma(photo): m=1 b=0+106 h=106 ph=1 w=1 bad=13(13/59) mean=32 fg=ff halo=0
[08:00:01] main.c:14> heap window_load: used=52576 free=53488
[08:00:01] main.c:116> heap services: used=52576 free=53488
[08:00:01] sync.c:437> sync: open(4153/110) -> 0 chunk=4096 heap 58992/47072 (cost 4364)
[08:00:01] main.c:14> heap init: used=58992 free=47072
[08:00:01] main.c:141> init: open=12 man=0 sto=13 set=1 mod=7 win=7 syn=2 tot=33 ms
[08:00:01] ui_time.c:642> heap after first render: used=58992 free=47072
[08:00:01] ui_time.c:646> draw: mode=1 full=1 6 ms info 2
[08:00:01] ui_digits.c:120> digits: font=0 size=0 360x68 fill=1 outline=2 heap 73996/31100
[08:00:02] pkjs> ./src/pkjs/index.js:97:0 [album] pronto (telefono): 2 foto [0:6 1:6] ordine [0,1] eliminazioni [] settings crc 0x7ee7
[08:00:02] pkjs> Galleria:97 [sync] JS_READY
[08:00:02] pkjs> [sync] HELLO proto=1 maxChunk=4096 slots=1016b83c,-,-,-,-,-,-,-,-,-,-,-
[08:00:02] sync.c:343> sync: msg=1 f=0 -> act=1 out=2 code=0 off=0 st=0 heap 47152
[08:00:02] pkjs> Galleria:97 [album] piano: 2 foto, 0 eliminazioni, ordine no, impostazioni mai impostate
[08:00:02] pkjs> Galleria:97 [sync] SYNC_REQUEST count=2 from=0
[08:00:02] sync.c:343> sync: msg=3 f=41 -> act=1 out=4 code=0 off=0 st=1 heap 47152
[08:00:02] pkjs> Galleria:97 [sync] SYNC_READY chunk=4096
[08:00:02] pkjs> Galleria:97 [sync] foto 1/2: slot 1 id 0xf23a62 fmt 1 len 34200 crc 0xf23a62
[08:00:03] pkjs> Galleria:97 [sync] chunk off=0 n=4096 ack 69 ms
[08:00:03] pkjs> Galleria:97 [sync] chunk off=4096 n=4096 ack 81 ms
[08:00:05] sync.c:359> sync: gap n=8 max 240 avg 96
[08:00:05] sync.c:337> sync: end s=1 c=0 n=9 commit 2 photo 900 ch max 49 avg 18 heap 39712
[08:00:05] pkjs> Galleria:97 [sync] foto slot 1 OK: 34200 B in 9 messaggi, 852 ms
[08:00:06] sync.c:337> sync: end s=2 c=1 n=9 commit 3 photo 910 ch max 51 avg 19 heap 39700
[08:00:06] pkjs> Galleria:97 [sync] foto slot 2 FALLITA (CRC_ERR) dopo 913 ms
[08:00:06] sync.c:343> sync: msg=9 f=0 -> act=0 out=0 code=0 off=0 st=0 heap 39712
[08:00:06] pkjs> Galleria:97 [sync] fine: {"photosOk":1,"photosFailed":1,"settings":null}
[08:00:07] ui_photo.c:178> photo: slot 2 persist crc MISMATCH 134 ch 210 ms heap 45664/60400
[08:00:07] model.c:108> rot(album): t=29801525 int=30 ord=0 shk=0 slot=1 demo=255 valid=3 bad=0
[08:00:08] sync.c:369> sync: outbox failed (8), queue 2
[08:00:08] sync.c:223> sync: 30 s idle -> IDLE heap 66064/39712
[08:00:08] model.c:79> rotation: slot 3 unreadable, skipped until restart
\x1b[36m[08:00:09] ui_time.c:819> bt: connected=0\x1b[0m
[08:00:09] pkjs> \x1b[33m[sync] telefono lontano: nuovo tentativo fra 30 s (1)\x1b[0m
[08:00:20] ui_time.c:819> bt: connected=1
[08:01:00] main.c:14> heap tick: used=52576 free=53488
[08:02:00] main.c:14> heap tick: used=52580 free=53484
[08:02:00] ui_time.c:801> tick: 3 ms
[08:02:00] ui_time.c:646> draw: mode=1 full=0 2 ms info -1
[08:02:00] ui_time.c:646> draw: mode=1 full=0 12 ms info 4
[08:02:01] main.c:23> batt: 89% chg=0 plug=0 up 2 min
[08:02:05] model.c:108> rot(shake): t=29801527 int=30 ord=0 shk=1 slot=0 demo=255 valid=3 bad=0
[08:02:10] pkjs> ./src/pkjs/index.js:97:0 [config] apro la pagina (URL 152340 car., stato 412)
[08:02:40] pkjs> ./src/pkjs/index.js:97:0 [config] pagina chiusa: risposta di 51200 car. dopo 29500 ms
[08:02:41] pkjs> ./src/pkjs/index.js:97:0 [config] payload applicato in 1840 ms
[08:02:41] pkjs> [PHONESIM] [WARNING] Exception decoding QemuInboundPacket.footer
riga estranea senza timestamp
[08:02:42] altro.c:1> messaggio ignoto senza formato
[08:03:00] pebble-app> App fault! {6f2dd646-a76a-44ff-8719-b012d04c79a4} PC: 0x08014a2c LR: 0x08014a31
\x1b[31m??? (0x08014a2c)\x1b[0m
\x1b[31m??? (0x08014a31)\x1b[0m
[08:03:05] main.c:14> heap main: used=24 free=106040
[08:03:05] main.c:83> watch: fw 4.36.2 model=11
[08:03:05] main.c:23> batt: 88% chg=0 plug=0 up 0 min
[08:03:06] ui_time.c:819> bt: connected=1
[08:03:06] sync.c:437> sync: open(4153/110) -> 0 chunk=4096 heap 58992/47072 (cost 4364)
[08:03:06] main.c:141> init: open=1 man=0 sto=3 set=1 mod=2 win=16 syn=3 tot=29 ms
[08:04:00] main.c:14> heap tick: used=52576 free=53488
[08:04:10] sync.c:343> sync: msg=1 f=0 -> act=1 out=2 code=0 off=0 st=0 heap 47152
[08:04:12] sync.c:343> sync: msg=9 f=0 -> act=0 out=0 code=0 off=0 st=0 heap 47152
[08:05:00] main.c:14> heap tick: used=52576 free=53488
[08:05:05] main.c:23> batt: 86% chg=0 plug=0 up 2 min
[08:05:10] main.c:23> batt: 86% chg=1 plug=1 up 2 min
[08:05:20] main.c:14> heap deinit: used=24 free=106040
[08:05:20] main.c:177> deinit: mod=1 fl=0 win=0 tot=2 ms
"""


def _controlla(esiti, condizione, descrizione):
    esiti.append((bool(condizione), descrizione))


def selftest():
    """Asserzioni sui numeri del campione incorporato. Ritorna 0 (tutto ok) o 1."""
    esiti = []
    d = Raccolta()
    d.aggiungi_file('campione.log', CAMPIONE)
    j = riepilogo_json(d)
    c = _controlla

    c(esiti, len(CAMPIONE.splitlines()) >= 40, 'campione con almeno 40 righe')
    # 1. avvii
    c(esiti, j['avvii']['n'] == 2, 'due avvii (heap main)')
    c(esiti, len(j['avvii']['riavvii_spontanei']) == 1, 'un riavvio spontaneo')
    c(esiti, j['avvii']['riavvii_spontanei'][0]['ora'] == '08:03:05', 'riavvio spontaneo alle 08:03:05')
    c(esiti, j['avvii']['deinit'] == 1, 'un heap deinit')
    c(esiti, len(j['avvii']['app_fault']) == 1, 'un App fault!')
    c(esiti, j['avvii']['app_fault'][0]['pc'] == '0x08014a2c', 'PC del fault')
    c(esiti, j['avvii']['app_fault'][0]['lr'] == '0x08014a31', 'LR del fault')
    c(esiti, j['avvii']['app_fault'][0]['contesto'] == ['??? (0x08014a2c)', '??? (0x08014a31)'],
      'due righe dopo il fault, senza codici ANSI')
    # 2. orologio
    c(esiti, j['orologio']['fw'] == '4.36.2' and j['orologio']['model'] == 11, 'firmware e modello')
    c(esiti, len(j['orologio']['ui_time']) == 1 and j['orologio']['ui_time'][0]['loc'] == 'it_IT',
      'una riga ui_time con locale')
    c(esiti, j['orologio']['ui_time'][0]['w'] == 200, 'larghezza dello schermo')
    # 3. heap
    fasi = j['heap']['fasi']
    c(esiti, fasi['main']['n'] == 2 and fasi['tick']['n'] == 4, 'campioni di heap main e tick')
    c(esiti, 'after first render' in fasi, 'fase con spazi (after first render)')
    # i quattro `heap tick` stanno su due avvii: la pendenza si calcola per avvio, mai a cavallo
    c(esiti, fasi['tick']['n_avvii'] == 2, 'heap tick su due avvii')
    c(esiti, fasi['tick']['pendenza_used_b_ora'] is None, 'nessuna pendenza a cavallo del riavvio')
    c(esiti, fasi['tick']['delta_used'] is None, 'nessun delta a cavallo del riavvio')
    seg_tick = fasi['tick']['segmenti']
    c(esiti, [s['n'] for s in seg_tick] == [2, 2], 'due campioni di tick per avvio')
    c(esiti, seg_tick[0]['pendenza_used_b_ora'] == 240.0, 'pendenza tick avvio 1 (+4 B in 60 s)')
    c(esiti, seg_tick[1]['pendenza_used_b_ora'] == 0.0, 'pendenza tick avvio 2 (heap piatto)')
    c(esiti, fasi['window_load']['n_avvii'] == 1 and fasi['window_load']['delta_used'] == 0,
      'una fase di un solo avvio tiene il delta')
    c(esiti, j['heap']['ordine'][0] == 'main', 'main per primo nell ordine delle fasi')
    # 4. init
    c(esiti, j['init']['storage'][0]['quota'] == 1048576, 'quota persist')
    c(esiti, j['init']['settings'][0]['origine'] == 'persist', 'impostazioni da persist')
    c(esiti, j['init']['sync_open'][0]['chunk'] == 4096, 'chunk negoziato')
    # 5. sync
    s = j['sync']
    c(esiti, len(s['end']) == 2 and s['foto_ok'] == 1 and s['foto_fallite'] == 1, 'due END, una ok')
    c(esiti, s['end'][0]['gap'] == {'n': 8, 'max': 240, 'avg': 96}, 'gap attaccato alla prima END')
    c(esiti, s['end'][1]['gap'] is None, 'nessun gap sulla seconda END')
    c(esiti, s['end'][0]['non_persist_ms'] == 900 - 18 * 9, 'stima non-persist (photo - avg*n)')
    c(esiti, sorted(s['msg'].keys()) == ['1', '3', '9'], 'tre messaggi di controllo')
    # la sync 1 finisce sull'ultima riga `sync:` del SUO avvio (08:00:08), non sul `sync: open`
    # dell'init successivo (08:03:06) ne' sul JS_READY dell'avvio dopo
    c(esiti, len(s['durate']) == 2, 'due sync (una per avvio)')
    c(esiti, s['durate'][0]['durata_s'] == 6, 'durata della prima sync 6 s')
    c(esiti, s['durate'][0]['fine'] == '08:00:08', 'la sync finisce nel suo avvio')
    c(esiti, s['durate'][0]['end'] == 2, 'due END dentro la sync')
    c(esiti, s['durate'][1]['durata_s'] == 2 and s['durate'][1]['end'] == 0, 'sync del 2o avvio')
    c(esiti, all(x['completa'] for x in s['durate']), 'tutte e due chiuse da SYNC_DONE')
    c(esiti, s['warning'] == {'sync outbox': 1, 'sync idle -> IDLE': 1}, 'due WARNING di sync')
    # 6. foto da persist
    f = j['foto_persist']
    c(esiti, f['ms']['n'] == 2 and f['ms']['max'] == 210 and f['mismatch'] == 1,
      'due letture, una MISMATCH')
    # 7. rendering
    g = j['rendering']['draw']
    c(esiti, sorted(g.keys()) == ['mode=1 full=0', 'mode=1 full=1'], 'due gruppi di draw')
    c(esiti, g['mode=1 full=0']['n'] == 2 and g['mode=1 full=0']['max'] == 12, 'gruppo full=0')
    c(esiti, g['mode=1 full=0']['sopra_soglia'] == 1, 'un render sopra i 10 ms')
    c(esiti, g['mode=1 full=0']['info']['n'] == 1, 'info -1 escluso dalla statistica')
    c(esiti, g['mode=1 full=1']['info']['n'] == 1, 'info del render pieno')
    c(esiti, j['rendering']['tick']['n'] == 1 and j['rendering']['tick']['max'] == 3, 'un tick')
    # 8. rotazione
    c(esiti, sorted(j['rotazione'].keys()) == ['album', 'init', 'shake'], 'tre motivi di rotazione')
    c(esiti, j['rotazione']['shake']['ultimo_slot'] == 0, 'ultimo slot dopo la scossa')
    # 9. colore
    c(esiti, j['colore']['per_fg'] == {'ff': 1}, 'una decisione di colore, fg ff')
    c(esiti, j['colore']['righe'][0]['bad_w'] == 13, 'bad w della riga luma')
    # 10. bt e batteria
    b = j['bt_batteria']
    # la riga `bt: connected=1` del secondo avvio ripete il valore precedente ma e' lo stato
    # iniziale di quell'avvio: va elencata lo stesso
    c(esiti, [x['connected'] for x in b['bt']] == [0, 1, 1], 'tre righe BT (con lo stato iniziale)')
    c(esiti, [x['iniziale'] for x in b['bt']] == [True, False, True], 'stato BT iniziale per avvio')
    c(esiti, len(b['batt']) == 5, 'cinque righe batt')
    c(esiti, b['batt_in_carica'] == 1, 'una riga batt in carica, scartata dalla pendenza')
    c(esiti, [x['pendenza_pct_ora'] for x in b['pendenza_segmenti']] == [-30.0, -60.0],
      'pendenza batteria per avvio (-1 %% e -2 %% in 120 s)')
    c(esiti, [x['n'] for x in b['pendenza_segmenti']] == [2, 2], 'due campioni per tratto')
    c(esiti, b['pendenza_pct_ora'] == -45.0, 'pendenza batteria complessiva (-3 %% in 4 min)')
    # 11. pkjs
    p = j['pkjs']
    c(esiti, p['tag'] == {'[album]': 2, '[sync]': 11, '[config]': 3}, 'conteggio per tag PKJS')
    tipi = [e['tipo'] for e in p['eventi']]
    for atteso in ('pronto', 'JS_READY', 'HELLO', 'piano', 'SYNC_READY', 'foto k/n', 'foto OK',
                   'foto FALLITA', 'fine', 'nuovo tentativo', 'config apro', 'config chiusa',
                   'config applicato'):
        c(esiti, atteso in tipi, 'evento PKJS "%s"' % atteso)
    c(esiti, p['chunk_ack']['n'] == 2 and p['chunk_ack']['max'] == 81, 'ack dei chunk')
    c(esiti, p['phonesim'] == 1, 'una riga PHONESIM ignorata')
    chiusa = [e for e in p['eventi'] if e['tipo'] == 'config chiusa'][0]
    c(esiti, chiusa['dati'] == ['51200', '29500'], 'car. e ms della pagina chiusa')
    # 12. anomalie
    classi = sorted(a['classe'] for a in j['anomalie'])
    c(esiti, classi == ['[sync]', 'foto', 'rotazione', 'sync idle -> IDLE', 'sync outbox'],
      'cinque anomalie distinte')
    c(esiti, all(a['n'] == 1 for a in j['anomalie']), 'ogni anomalia una volta')
    sorgenti = dict((a['classe'], a['sorgente']) for a in j['anomalie'])
    c(esiti, sorgenti['sync outbox'] == 'sync.c' and sorgenti['rotazione'] == 'model.c',
      'file C che ha emesso l anomalia')
    c(esiti, sorgenti['[sync]'] is None, 'nessun file C per le anomalie del telefono')
    # righe estranee e ANSI
    r_ = j['righe']
    c(esiti, r_['ignorate'] >= 5, 'righe estranee ignorate')
    c(esiti, r_['fault'] == 1, 'la riga App fault! contata a parte')
    c(esiti, r_['totali'] == len(CAMPIONE.splitlines()), 'tutte le righe lette')
    c(esiti, (r_['orologio'] + r_['pkjs'] + r_['fault'] + r_['ignorate'] + r_['fuori_filtro']
              == r_['totali']), 'i conteggi dell intestazione tornano')
    # filtri --since/--until: valgono per la resa, non per il conteggio degli avvii
    d2 = Raccolta(since='08:02:00')
    d2.aggiungi_file('campione.log', CAMPIONE)
    j2 = riepilogo_json(d2)
    c(esiti, j2['avvii']['n'] == 1 and len(j2['avvii']['riavvii_spontanei']) == 1,
      '--since taglia il primo avvio ma il secondo resta un riavvio spontaneo')
    c(esiti, j2['rendering']['draw'].get('mode=1 full=1') is None, '--since taglia il primo draw')
    r2 = j2['righe']
    c(esiti, r2['fuori_filtro'] == 45 and r2['ignorate'] == r_['ignorate'],
      'le righe tagliate dal filtro non sono contate come formato ignoto')
    c(esiti, (r2['orologio'] + r2['pkjs'] + r2['fault'] + r2['ignorate'] + r2['fuori_filtro']
              == r2['totali']), 'i conteggi tornano anche col filtro')
    d3 = Raccolta(until='08:00:01')
    d3.aggiungi_file('campione.log', CAMPIONE)
    c(esiti, len(d3.sync_end) == 0 and len(d3.foto) == 1, '--until taglia la sync')
    c(esiti, riepilogo_json(Raccolta(since='08:09:00'))['bt_batteria']['pendenza_pct_ora'] is None,
      'nessuna pendenza senza campioni')
    # stima `photo - avg*n` negativa (campo `photo` non attendibile): n/d, mai un numero negativo
    d4 = Raccolta()
    d4.aggiungi_file('neg.log',
                     '[09:00:00] sync.c:337> sync: end s=1 c=0 n=9 commit 5 photo 0'
                     ' ch max 103 avg 54 heap 39712\n')
    j4 = riepilogo_json(d4)
    c(esiti, j4['sync']['end'][0]['non_persist_ms'] is None, 'photo - avg*n negativo -> None')
    c(esiti, j4['sync']['end'][0]['non_persist_grezzo'] == -486, 'valore grezzo conservato')
    c(esiti, 'n/d' in riepilogo_testo(d4), 'la stima impossibile esce come n/d')
    # 13. avvio/uscita (build M)
    a = j['avvio_uscita']
    c(esiti, len(a['avvii']) == 2, 'due avvii nella sezione 13 (uno per `heap main`)')
    c(esiti, [v['init']['tot'] for v in a['avvii']] == [33, 29], 'tot delle due righe init:')
    c(esiti, a['avvii'][0]['init'] == {'ora': '08:00:01', 'open': 12, 'man': 0, 'sto': 13,
                                       'set': 1, 'mod': 7, 'win': 7, 'syn': 2, 'resto': 3,
                                       'tot': 33}, 'campi della prima riga init:')
    c(esiti, a['avvii'][0]['deinit'] is None, 'nessun deinit: nel primo avvio')
    # il `deinit:` sta nello stesso segmento dell'`init:` del suo avvio (precede il `heap main`
    # successivo): qui e' il secondo avvio, chiuso da `heap deinit` alle 08:05:20
    c(esiti, a['avvii'][1]['deinit'] == {'ora': '08:05:20', 'mod': 1, 'fl': 0, 'win': 0,
                                         'resto': 1, 'tot': 2}, 'campi della riga deinit:')
    c(esiti, a['avvii'][1]['init']['resto'] == 29 - (3 + 1 + 2 + 16 + 3),
      'resto = tot - (sto+set+mod+win+syn)')
    c(esiti, a['stat']['init']['tot'] == {'n': 2, 'min': 29, 'max': 33, 'media': 31.0, 'p95': 33},
      'min/media/max di init tot sui due avvii')
    c(esiti, a['stat']['init']['win']['max'] == 16 and a['stat']['init']['win']['min'] == 7,
      'min/max di init win')
    c(esiti, a['stat']['deinit']['tot']['n'] == 1 and a['stat']['deinit']['mod']['media'] == 1.0,
      'statistiche del deinit')
    c(esiti, a['stat']['init']['open']['n'] == 2 and a['stat']['deinit']['fl']['max'] == 0,
      'un campione di open per avvio, fl del deinit')
    c(esiti, a['campi_init'] == CAMPI_INIT and a['campi_deinit'] == CAMPI_DEINIT,
      'elenco dei campi nel JSON')
    c(esiti, a['migrazioni'] == [{'ora': '08:00:01', 'file': 'campione.log', 'seg': 2, 'da': 1,
                                  'a': 2, 'settings': 1, 'shake': 1}], 'riga di migrazione')
    c(esiti, not any('migrated' in x['esempio'] for x in j['anomalie']),
      'la migrazione del manifest non e un anomalia')
    c(esiti, j['righe']['ignorate'] == r_['ignorate'],
      'init:/deinit:/migrazione sono righe riconosciute')
    # build P (nessuna riga della build M): la sezione c'e' ma dice che non ci sono righe
    d5 = Raccolta()
    d5.aggiungi_file('prod.log',
                     '[09:00:00] main.c:14> heap main: used=24 free=106040\n'
                     '[09:00:01] main.c:14> heap deinit: used=24 free=106040\n')
    j5 = riepilogo_json(d5)
    c(esiti, j5['avvio_uscita']['avvii'] == [] and j5['avvio_uscita']['migrazioni'] == [],
      'build di produzione: sezione 13 vuota')
    c(esiti, j5['avvio_uscita']['stat']['init']['tot'] == {'n': 0}, 'nessuna statistica init')
    t5 = riepilogo_testo(d5)
    c(esiti, '13. Avvio/uscita (build M)' in t5 and 'nessuna riga `init:`' in t5,
      'build P: la sezione 13 non sparisce e non va in errore')
    c(esiti, 'nessuna migrazione' in t5, 'build P: nessuna migrazione')
    # `resto` negativo: le parti sommano piu' di `tot` -> avviso, mai un numero nascosto
    d6 = Raccolta()
    d6.aggiungi_file('strana.log',
                     '[09:00:00] main.c:141> init: open=1 man=0 sto=30 set=1 mod=2 win=16'
                     ' syn=3 tot=29 ms\n')
    c(esiti, riepilogo_json(d6)['avvio_uscita']['avvii'][0]['init']['resto'] == -23,
      'resto negativo conservato')
    c(esiti, 'resto negativo su 1' in riepilogo_testo(d6), 'avviso del resto negativo')
    # resa testuale e markdown
    testo = riepilogo_testo(d)
    md = riepilogo_testo(d, md=True)
    c(esiti, all(('%d.' % i) in testo for i in range(1, 14)), 'tredici sezioni nel testo')
    c(esiti, md.count('|---') >= 8, 'tabelle markdown con --md')
    c(esiti, 'RIAVVIO SPONTANEO' in testo, 'riavvio spontaneo in evidenza')
    c(esiti, 'nessun evento riconosciuto' in riepilogo_testo(Raccolta()), 'file vuoto')

    falliti = [des for ok, des in esiti if not ok]
    for des in falliti:
        sys.stderr.write('  FALLITO: %s\n' % des)
    sys.stdout.write('galleria_logstats --selftest: %d controlli, %d falliti\n'
                     % (len(esiti), len(falliti)))
    return 1 if falliti else 0


if __name__ == '__main__':
    sys.exit(main())
