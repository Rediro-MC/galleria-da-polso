#!/usr/bin/env python3
"""test_logstats.py — S8: test di `tools/galleria_logstats.py` sulle fixture reali.

Esegue il tool come processo separato (subprocess, `sys.executable`) sui log catturati in
`fixtures/logs/` e confronta i numeri con quelli contati a mano nei file, sia nella resa
testuale sia nel JSON (`--json -`). Copre anche i codici di uscita (file inesistente = 2,
file vuoto = 0), i filtri `--since/--until`, `--threshold-ms` e `--md`.

Esecuzione: `python3 test_logstats.py` con cwd = questa cartella (lo lancia
`make -C apps/galleria/test logstats`, che prima esegue `galleria_logstats.py --selftest`).
I percorsi sono comunque ricavati da __file__, quindi funziona da qualunque cartella.
Stampa 'test_logstats: N ok, M falliti' ed esce con 1 se qualcosa fallisce. Solo stdlib.

`prova_avvio_uscita` copre la sezione 13 (build M): le righe `init:`/`deinit:` e la riga di
migrazione del manifest sulle due fixture nuove (`run_s8_emu_m_init_emery.log`,
`run_s8_emu_m_deinit_restart.log`), e verifica che su tutte le fixture precedenti la sezione resti
vuota — gli altri numeri delle fixture vecchie sono quelli di sempre, controllati uno per uno dalle
prove che c'erano gia'.

Nota: le fixture nuove che venissero aggiunte a `fixtures/logs/` non rompono il test — i
controlli nominano i file uno per uno e l'unico controllo su tutta la cartella guarda solo il
codice di uscita e la presenza delle 12 sezioni.

Le fixture reali hanno un solo `heap main` per file, quindi il caso "riavvio in mezzo al log"
(heap, batteria, sync e stato BT su tutti e due gli avvii) si prova su un log sintetico scritto
in una cartella temporanea da `prova_riavvio_in_mezzo`: pendenze e durate non devono mai
attraversare un riavvio."""
import json
import os
import subprocess
import sys
import tempfile

QUI = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.normpath(os.path.join(QUI, '..', '..', '..', 'tools', 'galleria_logstats.py'))
LOGS = os.path.join(QUI, 'fixtures', 'logs')

SINCRO = 'run_s7_emery_b_synced.log'
RIAVVIO = 'run_s7_emery_b_synced_restart.log'
BT_OFF = 'run_s7_emery_a_bt_off.log'
SCOSSA = 'run_s7_emery_a_shake_b.log'
QV = 'run_s7_emery_b_qv.log'
ANTON = 'run_s7_timing_a_anton_emery.log'
ANTON_TICK = 'run_s7_timing_a_anton_emery_tick.log'
LECO = 'run_s7_timing_a_leco_flint.log'
TOOL540 = 'run_tool540_emery.log'
LECO_TICK = 'run_s7_timing_a_leco_flint_tick.log'
S8_M = 'run_s8_emu_m_newlines.log'          # build M in emulatore (righe nuove di S8)
S8_INIT = 'run_s8_emu_m_init_emery.log'     # build M 04/09: riga `init:` + migrazione schema 1->2
S8_DEINIT = 'run_s8_emu_m_deinit_restart.log'   # `deinit:` di un avvio e `init:` di quello dopo

# Fixture PRECEDENTI alle righe `init:`/`deinit:` (build di produzione o build M piu' vecchia):
# la sezione 13 deve restare vuota e tutti gli altri numeri devono essere quelli di prima.
SENZA_BUILD_M = [SINCRO, RIAVVIO, BT_OFF, SCOSSA, QV, ANTON, ANTON_TICK, LECO, LECO_TICK,
                 TOOL540, S8_M]


class Prova(object):
    """Raccoglitore di controlli: uguale()/vero() non fermano il test, contano i falliti."""

    def __init__(self):
        self.ok = 0
        self.falliti = []

    def vero(self, condizione, descrizione):
        if condizione:
            self.ok += 1
        else:
            self.falliti.append(descrizione)

    def uguale(self, ottenuto, atteso, descrizione):
        if ottenuto == atteso:
            self.ok += 1
        else:
            self.falliti.append('%s: atteso %r, ottenuto %r' % (descrizione, atteso, ottenuto))


def esegui(argomenti):
    """Lancia il tool e ritorna (codice, stdout, stderr)."""
    p = subprocess.run([sys.executable, TOOL] + argomenti, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE, universal_newlines=True)
    return p.returncode, p.stdout, p.stderr


def log(*nomi):
    return [os.path.join(LOGS, n) for n in nomi]


def dati(nomi, extra=None):
    """JSON del riepilogo dei file indicati (lista di nomi in fixtures/logs/)."""
    codice, out, err = esegui(log(*nomi) + ['--json', '-'] + (extra or []))
    assert codice == 0, 'uscita %d per %s: %s' % (codice, nomi, err)
    return json.loads(out)


# ---------------------------------------------------------------- controlli


def prova_uscite(p):
    codice, out, _ = esegui(['--selftest'])
    p.uguale(codice, 0, 'selftest del tool')
    p.vero('falliti' in out, 'selftest stampa il riepilogo')
    codice, _, err = esegui([os.path.join(LOGS, 'non_esiste.log')])
    p.uguale(codice, 2, 'file inesistente -> 2')
    p.vero('inesistente' in err, 'messaggio del file inesistente')
    codice, _, _ = esegui([])
    p.uguale(codice, 2, 'nessun file -> 2')
    codice, _, _ = esegui(log(SINCRO) + ['--since', '10:46'])
    p.uguale(codice, 2, '--since malformato -> 2')
    with tempfile.TemporaryDirectory() as d:
        vuoto = os.path.join(d, 'vuoto.log')
        open(vuoto, 'w').close()
        codice, out, _ = esegui([vuoto])
        p.uguale(codice, 0, 'file vuoto -> 0')
        p.vero('nessun evento riconosciuto' in out, 'file vuoto: nessun evento riconosciuto')
        # righe sconosciute (formati S5a-S6) ignorate senza errore
        vecchio = os.path.join(d, 'vecchio.log')
        with open(vecchio, 'w') as fh:
            fh.write('[10:00:00] ui_time.c:1> tick: 3 ms\n[10:00:00] boh.c:9> formato ignoto\n'
                     'riga senza timestamp\n')
        codice, out, _ = esegui([vecchio])
        p.uguale(codice, 0, 'righe sconosciute -> 0')
        j = json.loads(esegui([vecchio, '--json', '-'])[1])
        p.uguale(j['rendering']['tick']['n'], 1, 'un tick senza draw')
        p.uguale(j['righe']['ignorate'], 2, 'due righe ignorate')


def prova_sync(p):
    """run_s7_emery_b_synced.log: 73 righe, 1 avvio, 2 END (ch max 49 avg 18 e 103/54)."""
    j = dati([SINCRO])
    p.uguale(j['righe']['totali'], 73, 'righe totali del log di sync')
    p.uguale(j['avvii']['n'], 1, 'un avvio')
    p.uguale(j['avvii']['riavvii_spontanei'], [], 'nessun riavvio spontaneo')
    p.uguale(j['avvii']['app_fault'], [], 'nessun App fault')
    p.uguale(j['orologio']['fw'], None, 'niente riga watch: nei log S7')
    p.uguale(j['orologio']['ui_time'][0]['band'], 109, 'fascia del layout B')
    p.uguale(sorted(j['heap']['fasi'].keys()),
             ['after first render', 'init', 'main', 'services', 'sync_end', 'window_load'],
             'fasi di heap presenti')
    p.uguale(j['heap']['fasi']['main']['primo_free'], 105752, 'heap main free')
    p.uguale(j['init']['storage'][0]['quota'], 1048576, 'quota persist')
    p.uguale(j['init']['sync_open'][0]['chunk'], 4096, 'chunk negoziato')
    end = j['sync']['end']
    p.uguale(len(end), 2, 'due righe sync: end')
    p.uguale([e['slot'] for e in end], [0, 1], 'slot delle due END')
    p.uguale([e['ch_max'] for e in end], [49, 103], 'ch max delle due END')
    p.uguale([e['ch_avg'] for e in end], [18, 54], 'ch avg delle due END')
    p.uguale([e['n'] for e in end], [9, 9], 'PHOTO_DATA per foto')
    p.uguale([e['commit_ms'] for e in end], [2, 5], 'ms di commit')
    p.uguale([e['photo_ms'] for e in end], [669, 0], 'ms per foto')
    p.uguale(end[0]['non_persist_ms'], 669 - 18 * 9, 'stima non-persist della prima foto')
    # la seconda END ha `photo 0` con avg 54 x 9: la stima verrebbe -486 (impossibile) -> n/d
    p.uguale(end[1]['non_persist_ms'], None, 'stima non-persist negativa -> None')
    p.uguale(end[1]['non_persist_grezzo'], -486, 'valore grezzo della stima impossibile')
    p.uguale([e['gap'] for e in end], [None, None], 'nessuna riga sync: gap in S7')
    p.uguale((j['sync']['foto_ok'], j['sync']['foto_fallite']), (2, 0), 'due foto ok')
    p.uguale(j['sync']['msg'], {'1': {'n': 1, 'code_non_zero': 0, 'esempi': []},
                                '3': {'n': 1, 'code_non_zero': 0, 'esempi': []},
                                '5': {'n': 2, 'code_non_zero': 0, 'esempi': []},
                                '9': {'n': 1, 'code_non_zero': 0, 'esempi': []},
                                '11': {'n': 1, 'code_non_zero': 0, 'esempi': []}},
             'sei righe sync: msg= per messaggio')
    p.uguale(len(j['sync']['durate']), 1, 'una sync')
    p.uguale((j['sync']['durate'][0]['durata_s'], j['sync']['durate'][0]['end']), (2, 2),
             'sync di 2 s con 2 END')
    p.uguale((j['sync']['durate'][0]['fine'], j['sync']['durate'][0]['completa']),
             ('10:46:52', True), 'la sync finisce sul SYNC_DONE (msg=9)')
    p.uguale(j['sync']['warning'], {}, 'nessun WARNING di sync')
    p.uguale(j['foto_persist']['righe'],
             [{'ora': '10:46:52', 'slot': 1, 'esito': 'ok', 'chunk': 134, 'ms': 7,
               'heap_used': 66064, 'heap_free': 39712}], 'unica lettura da persist')
    p.uguale(j['rendering']['draw'], {}, 'nessun draw (build di produzione)')
    p.uguale(sorted(j['rotazione'].keys()), ['album', 'init'], 'rotazione init e album')
    p.uguale(j['colore']['per_fg'], {'c0': 2}, 'due decisioni di colore, fg c0')
    p.uguale(j['pkjs']['tag'], {'[album]': 7, '[sync]': 41}, 'righe PKJS per tag')
    p.uguale(j['pkjs']['chunk_ack']['n'], 18, 'ack dei chunk (9 + 9)')
    p.uguale(j['pkjs']['chunk_ack']['max'], 146, 'ack piu lento')
    p.uguale(j['pkjs']['phonesim'], 0, 'nessuna riga PHONESIM')
    tipi = [e['tipo'] for e in j['pkjs']['eventi']]
    p.uguale(tipi.count('foto OK'), 2, 'due foto OK nel PKJS')
    p.uguale(tipi.count('foto k/n'), 2, 'due righe foto k/n')
    p.uguale(j['anomalie'], [], 'nessuna anomalia')


def prova_riavvio_e_bt_off(p):
    j = dati([RIAVVIO])
    p.uguale(j['init']['storage'][0]['schema'], 1, 'schema del persist scritto')
    p.uguale(j['init']['storage'][0]['manifest'], 'persist', 'manifest da persist')
    p.uguale(j['init']['storage'][0]['valid'], 2, 'due slot validi')
    p.uguale(j['foto_persist']['righe'][0]['ms'], 9, 'ms della foto letta al riavvio')
    p.uguale(j['foto_persist']['mismatch'], 0, 'nessun CRC MISMATCH')
    # due file distinti: il secondo `heap main` non e un riavvio spontaneo
    j2 = dati([SINCRO, RIAVVIO])
    p.uguale(j2['avvii']['n'], 2, 'due avvii in due file')
    p.uguale(j2['avvii']['riavvii_spontanei'], [], 'avvii in file diversi: nessuno spontaneo')
    p.uguale(len(j2['file']), 2, 'due file nel riepilogo')
    j3 = dati([BT_OFF])
    p.uguale(j3['orologio']['ui_time'][0]['bt'], 0, 'bt=0 nella riga ui_time')
    p.uguale(len(j3['anomalie']), 1, 'una anomalia PKJS (dev server irraggiungibile)')
    p.uguale(j3['anomalie'][0]['dove'], 'pkjs', 'anomalia lato telefono')
    p.uguale(j3['anomalie'][0]['sorgente'], None, 'nessun file C per un anomalia PKJS')
    p.uguale(j3['anomalie'][0]['n'], 1, 'anomalia vista una volta')
    p.uguale(j3['bt_batteria']['bt'], [], 'nessuna riga bt: connected= nei log S7')


def prova_scossa_e_qv(p):
    j = dati([SCOSSA])
    p.uguale(j['rotazione']['shake']['n'], 20, 'venti rotazioni da scossa')
    p.uguale(j['rotazione']['shake']['ultimo_slot'], 1, 'ultimo slot dopo le scosse')
    p.uguale(j['foto_persist']['ms']['n'], 20, 'venti letture da persist')
    p.uguale((j['foto_persist']['ms']['min'], j['foto_persist']['ms']['max']), (0, 7),
             'ms minimo e massimo delle letture')
    p.uguale(j['foto_persist']['ms']['media'], 5.8, 'media delle letture (115/20)')
    p.uguale(j['colore']['per_fg'], {'ff': 10, 'c0': 10}, 'dieci decisioni per colore')
    p.uguale(j['heap']['fasi']['shake']['n'], 20, 'venti righe heap shake')
    p.uguale(j['pkjs']['phonesim'], 12, 'dodici righe PHONESIM')
    p.uguale(j['pkjs']['tag'], {}, 'nessuna riga PKJS con tag')
    p.uguale(j['anomalie'], [], 'PHONESIM non e un anomalia')
    j2 = dati([QV])
    p.uguale(j2['heap']['fasi']['qv']['n'], 42, 'quarantadue righe heap qv')
    p.uguale(len(j2['colore']['righe']), 42, 'quarantadue righe luma')
    p.uguale(j2['colore']['per_fg'], {'ff': 42}, 'sempre testo bianco in Quick View')
    p.uguale(sorted({r['motivo'] for r in j2['colore']['righe']}), ['band'], 'luma(band)')
    p.uguale(j2['pkjs']['phonesim'], 24, 'ventiquattro righe PHONESIM')
    p.uguale(j2['anomalie'], [], 'le righe digits informative non sono anomalie')


def prova_timing(p):
    """run_s7_timing_a_anton_emery.log: 5 draw: e 2 tick:."""
    j = dati([ANTON])
    g = j['rendering']['draw']
    p.uguale(sorted(g.keys()), ['mode=1 full=0', 'mode=1 full=1'], 'due gruppi di draw')
    p.uguale(g['mode=1 full=0']['n'] + g['mode=1 full=1']['n'], 5, 'cinque righe draw')
    p.uguale(g['mode=1 full=0']['n'], 3, 'tre render parziali')
    p.uguale((g['mode=1 full=0']['min'], g['mode=1 full=0']['max']), (1, 2), 'ms dei parziali')
    p.uguale(g['mode=1 full=1']['media'], 2.5, 'media dei render pieni (3 e 2)')
    p.uguale(g['mode=1 full=0']['info']['n'], 0, 'niente campo info nei log S7')
    p.uguale(g['mode=1 full=0']['sopra_soglia'], 0, 'nessun render lento su emery')
    p.uguale(j['rendering']['tick']['n'], 2, 'due righe tick')
    p.uguale((j['rendering']['tick']['min'], j['rendering']['tick']['max']), (1, 4), 'ms dei tick')
    p.uguale(j['rendering']['sopra_soglia'], 0, 'nessun draw sopra i 10 ms')
    # i due file dello stesso gate si sommano
    j2 = dati([ANTON, ANTON_TICK])
    g2 = j2['rendering']['draw']
    p.uguale(g2['mode=1 full=0']['n'] + g2['mode=1 full=1']['n'], 7, 'sette draw nei due file')
    p.uguale(j2['rendering']['tick']['n'], 3, 'tre tick nei due file')
    # flint: tutti i render stanno sopra i 10 ms (obiettivo O4)
    j3 = dati([LECO])
    g3 = j3['rendering']['draw']
    p.uguale(g3['mode=0 full=0']['n'], 3, 'tre render parziali su flint')
    p.uguale(g3['mode=0 full=0']['sopra_soglia'], 3, 'tre render sopra i 10 ms')
    p.uguale(g3['mode=0 full=1']['sopra_soglia'], 2, 'due render pieni sopra i 10 ms')
    p.uguale(j3['rendering']['sopra_soglia'], 5, 'cinque draw sopra la soglia')
    j4 = dati([LECO], ['--threshold-ms', '30'])
    p.uguale(j4['rendering']['sopra_soglia'], 0, 'con --threshold-ms 30 nessun draw lento')
    p.uguale(j4['filtro']['threshold_ms'], 30, 'soglia nel JSON')
    p.uguale(j4['init']['sync_open'][0]['chunk'], 3072, 'chunk di flint')


def prova_s8_righe_nuove(p):
    """run_s8_emu_m_newlines.log: build M con le righe nuove di S8 (§2.3)."""
    if not os.path.isfile(os.path.join(LOGS, S8_M)):
        sys.stdout.write('test_logstats: %s assente, controlli S8 saltati\n' % S8_M)
        return
    j = dati([S8_M])
    p.uguale(j['orologio']['fw'], '4.33.2', 'firmware dalla riga watch:')
    p.uguale(j['orologio']['model'], 11, 'modello dalla riga watch:')
    p.uguale(len(j['bt_batteria']['batt']), 1, 'una riga batt:')
    p.uguale(j['bt_batteria']['batt'][0]['pct'], 100, 'batteria al 100%')
    p.uguale(j['bt_batteria']['pendenza_pct_ora'], None, 'un solo punto: nessuna pendenza')
    p.uguale(j['heap']['fasi']['tick']['n'], 3, 'tre righe heap tick')
    p.uguale(j['heap']['fasi']['tick']['pendenza_used_b_ora'], 0.0, 'heap tick stabile')
    end = j['sync']['end']
    p.uguale([e['gap'] for e in end],
             [{'n': 8, 'max': 1082, 'avg': 187}, {'n': 8, 'max': 124, 'avg': 79}],
             'due righe sync: gap attaccate alle END')
    p.uguale([e['gap_attendibile'] for e in end], [False, True],
             'gap della prima foto marcato n/d (1082 e 8x187 > photo 651: salto d\'orologio)')
    p.uguale([e['non_persist_ms'] for e in end], [651 - 21 * 9, 771 - 48 * 9],
             'stima non-persist delle due foto')
    g = j['rendering']['draw']
    p.uguale(g['mode=1 full=0']['n'], 6, 'sei render parziali')
    p.uguale(g['mode=1 full=1']['n'], 3, 'tre render pieni')
    p.uguale(g['mode=1 full=0']['info']['n'], 6, 'campo info in ogni draw parziale')
    p.uguale((g['mode=1 full=0']['info']['min'], g['mode=1 full=0']['info']['max']), (0, 1),
             'ms della riga info')
    p.uguale(j['rendering']['tick']['n'], 4, 'quattro righe tick')
    p.uguale(j['pkjs']['chunk_ack']['n'], 18, 'diciotto ack')


def prova_avvio_uscita(p):
    """Sezione 13 (build M): righe `init:`/`deinit:` e migrazione dello schema del manifest."""
    if not os.path.isfile(os.path.join(LOGS, S8_INIT)):
        sys.stdout.write('test_logstats: %s assente, controlli sezione 13 saltati\n' % S8_INIT)
        return
    j = dati([S8_INIT])
    a = j['avvio_uscita']
    p.uguale(j['righe']['totali'], 33, 'righe totali del log con init:')
    p.uguale(j['righe']['ignorate'], 2, 'solo le due righe di `pebble install` ignorate')
    p.uguale(len(a['avvii']), 1, 'un avvio nella sezione 13')
    p.uguale(a['avvii'][0]['init'],
             {'ora': '19:56:14', 'open': 10, 'man': 4, 'sto': 15, 'set': 0, 'mod': 8, 'win': 8,
              'syn': 1, 'resto': 3, 'tot': 35}, 'campi della riga init: (emery)')
    p.uguale(a['avvii'][0]['deinit'], None, 'nessuna riga deinit: nel log')
    p.uguale(a['avvii'][0]['file'], S8_INIT, 'file dell avvio')
    p.uguale(a['stat']['init']['tot'], {'n': 1, 'min': 35, 'max': 35, 'media': 35.0, 'p95': 35},
             'statistica di init tot con un solo avvio')
    p.uguale(a['stat']['deinit']['tot'], {'n': 0}, 'nessuna statistica di deinit')
    p.uguale(a['migrazioni'], [{'ora': '19:56:14', 'file': S8_INIT, 'seg': 2, 'da': 1, 'a': 2,
                                'settings': 1, 'shake': 1}], 'riga di migrazione del manifest')
    p.uguale([x['classe'] for x in j['anomalie']], ['[dev]'],
             'la migrazione non e un anomalia (solo il dev server irraggiungibile)')
    # la riga `storage: quota=` di quell avvio e' letta PRIMA della migrazione: schema ancora 1
    p.uguale(j['init']['storage'][0]['schema'], 1, 'schema letto prima della migrazione')
    # secondo log: un `deinit:` (avvio finito prima dell inizio del log) e l `init:` di quello dopo
    j2 = dati([S8_DEINIT])
    a2 = j2['avvio_uscita']
    p.uguale(len(a2['avvii']), 2, 'due segmenti: uscita del primo avvio, avvio del secondo')
    p.uguale(a2['avvii'][0]['init'], None, 'il primo segmento non ha init: (log cominciato dopo)')
    p.uguale(a2['avvii'][0]['deinit'],
             {'ora': '19:59:06', 'mod': 1, 'fl': 0, 'win': 0, 'resto': 1, 'tot': 2},
             'campi della riga deinit:')
    p.uguale(a2['avvii'][1]['init']['tot'], 38, 'tot dell init: del secondo avvio')
    p.uguale(a2['avvii'][1]['deinit'], None, 'il secondo avvio non si chiude dentro il log')
    p.uguale(a2['migrazioni'], [], 'nessuna migrazione al secondo avvio (schema gia 2)')
    p.uguale(j2['init']['storage'][0]['schema'], 2, 'schema 2 dopo la migrazione')
    p.uguale(j2['avvii']['n'], 1, 'un solo heap main')
    p.uguale(j2['avvii']['deinit'], 1, 'un heap deinit')
    p.uguale(j2['avvii']['riavvii_spontanei'], [],
             'un deinit prima del primo heap main non e un riavvio spontaneo')
    # i due file insieme: le statistiche sommano gli avvii, ognuno resta nel suo file
    j3 = dati([S8_INIT, S8_DEINIT])
    a3 = j3['avvio_uscita']
    p.uguale(len(a3['avvii']), 3, 'tre segmenti nei due file')
    p.uguale([x['file'] for x in a3['avvii']], [S8_INIT, S8_DEINIT, S8_DEINIT],
             'ogni riga resta nel suo file')
    p.uguale(a3['stat']['init']['tot'],
             {'n': 2, 'min': 35, 'max': 38, 'media': 36.5, 'p95': 38}, 'init tot sui due avvii')
    p.uguale(a3['stat']['init']['open']['media'], 11.5, 'media di open sui due avvii')
    p.uguale(a3['stat']['deinit']['tot']['n'], 1, 'una sola riga deinit: nei due file')
    p.uguale(len(a3['migrazioni']), 1, 'una migrazione nei due file')
    p.uguale(a3['campi_init'],
             ['open', 'man', 'sto', 'set', 'mod', 'win', 'syn', 'resto', 'tot'],
             'campi di init: nel JSON')
    p.uguale(a3['campi_deinit'], ['mod', 'fl', 'win', 'resto', 'tot'], 'campi di deinit: nel JSON')
    # resa testuale e markdown
    codice, testo, _ = esegui(log(S8_INIT, S8_DEINIT))
    p.uguale(codice, 0, 'resa testuale con la sezione 13')
    p.vero('13. Avvio/uscita (build M)' in testo, 'titolo della sezione 13')
    p.vero('migrazione del manifest: schema 1 -> 2' in testo, 'migrazione nel testo')
    p.vero('resto negativo' not in testo, 'nessun resto negativo su questi log')
    codice, md, _ = esegui(log(S8_INIT, S8_DEINIT) + ['--md'])
    p.vero('## 13. Avvio/uscita (build M)' in md, 'sezione 13 in markdown')
    # le fixture precedenti non hanno le righe nuove: sezione vuota, niente errori
    for nome in SENZA_BUILD_M:
        jv = dati([nome])
        p.uguale(jv['avvio_uscita']['avvii'], [], 'sezione 13 vuota per %s' % nome)
        p.uguale(jv['avvio_uscita']['migrazioni'], [], 'nessuna migrazione in %s' % nome)
        p.uguale(jv['avvio_uscita']['stat']['init']['tot'], {'n': 0},
                 'nessuna statistica init in %s' % nome)
    codice, testo2, _ = esegui(log(SINCRO))
    p.vero('nessuna riga `init:`/`deinit:`' in testo2, 'nota della build di produzione')
    p.vero('nessuna migrazione dello schema' in testo2, 'nota della migrazione assente')


# Log sintetico con DUE avvii (il secondo dopo un `App fault!`, senza `heap deinit`): righe
# `batt:`, `heap tick`, `bt:` e una sync per avvio, con il `sync: open` dell'init in mezzo.
# Scarica reale: -2 %/h in tutti e due gli avvii; heap piatto in tutti e due; sync di 2 s.
RIAVVIO_IN_MEZZO = """[07:59:59] main.c:14> heap main: used=24 free=106040
[07:59:59] main.c:83> watch: fw 4.36.2 model=12
[07:59:59] main.c:23> batt: 90% chg=0 plug=0 up 0 min
[07:59:59] sync.c:470> sync: open(4153/110) -> 0 chunk=4096 heap 58992/47072 (cost 4364)
[07:59:59] ui_time.c:819> bt: connected=1
[08:00:00] sync.c:376> sync: msg=1 f=0 -> act=1 out=2 code=0 off=0 st=0 heap 45880
[08:00:02] sync.c:370> sync: end s=0 c=0 n=9 commit 2 photo 651 ch max 51 avg 21 heap 45880
[08:00:02] sync.c:376> sync: msg=9 f=0 -> act=0 out=0 code=0 off=0 st=0 heap 45880
[08:01:00] main.c:32> heap tick: used=58900 free=45880
[08:31:00] main.c:32> heap tick: used=58900 free=45880
[08:59:59] main.c:23> batt: 88% chg=0 plug=0 up 60 min
[09:00:00] ui_time.c:646> App fault! {6f2dd646-a76a-44ff-8719-b012d04c79a4} PC: 0x08014a2c LR: 0x08014a31
Program Counter (PC)    : 0x08014a2c ui_time.c:646
Link Register (LR)      : 0x08014a31 ui_time.c:700
[09:00:05] main.c:14> heap main: used=24 free=106040
[09:00:05] main.c:23> batt: 87% chg=0 plug=0 up 0 min
[09:00:05] sync.c:470> sync: open(4153/110) -> 0 chunk=4096 heap 58992/47072 (cost 4364)
[09:00:06] ui_time.c:819> bt: connected=1
[09:01:00] main.c:32> heap tick: used=52000 free=52780
[09:02:00] sync.c:345> sync: inbox dropped (2) state=0
[09:31:00] main.c:32> heap tick: used=52000 free=52780
[10:00:05] main.c:23> batt: 85% chg=0 plug=0 up 60 min
[10:00:10] sync.c:376> sync: msg=1 f=0 -> act=1 out=2 code=0 off=0 st=0 heap 45880
[10:00:12] sync.c:370> sync: end s=1 c=0 n=9 commit 5 photo 771 ch max 103 avg 48 heap 45880
[10:00:12] sync.c:376> sync: msg=9 f=0 -> act=0 out=0 code=0 off=0 st=0 heap 45880
[10:00:20] main.c:23> batt: 85% chg=1 plug=1 up 60 min
[10:00:30] main.c:14> heap deinit: used=24 free=106040
"""


def prova_riavvio_in_mezzo(p):
    """Un riavvio dentro il log non deve inquinare pendenze, delta e durate (O7/O8)."""
    with tempfile.TemporaryDirectory() as d:
        percorso = os.path.join(d, 'run_riavvio.log')
        with open(percorso, 'w') as fh:
            fh.write(RIAVVIO_IN_MEZZO)

        def leggi(extra=None):
            codice, out, err = esegui([percorso, '--json', '-'] + (extra or []))
            p.uguale(codice, 0, 'uscita del log con riavvio')
            return json.loads(out)

        j = leggi()
        p.uguale(j['avvii']['n'], 2, 'due avvii nello stesso file')
        p.uguale(len(j['avvii']['riavvii_spontanei']), 1, 'il secondo avvio e spontaneo')
        p.uguale(len(j['avvii']['app_fault']), 1, 'un App fault prima del riavvio')
        p.uguale(j['avvii']['app_fault'][0]['contesto'][0][:20], 'Program Counter (PC)',
                 'prima riga di contesto del fault')
        # batteria: -2 %/h in tutti e due gli avvii (il vecchio calcolo su `up min` dava -5)
        b = j['bt_batteria']
        p.uguale([s['pendenza_pct_ora'] for s in b['pendenza_segmenti']], [-2.0, -2.0],
                 'pendenza batteria per avvio')
        p.uguale([s['n'] for s in b['pendenza_segmenti']], [2, 2], 'due campioni per tratto')
        p.uguale(b['pendenza_pct_ora'], -2.0, 'pendenza batteria complessiva')
        p.uguale(b['batt_in_carica'], 1, 'campione in carica scartato')
        p.uguale([x['connected'] for x in b['bt']], [1, 1], 'stato BT iniziale dei due avvii')
        p.uguale([x['iniziale'] for x in b['bt']], [True, True], 'tutte e due righe iniziali')
        # heap: piatto dentro ogni avvio, nessuna pendenza a cavallo del riavvio
        tick = j['heap']['fasi']['tick']
        p.uguale(tick['n'], 4, 'quattro righe heap tick')
        p.uguale(tick['n_avvii'], 2, 'heap tick su due avvii')
        p.uguale(tick['pendenza_used_b_ora'], None, 'nessuna pendenza aggregata')
        p.uguale(tick['delta_used'], None, 'nessun delta aggregato')
        p.uguale([s['pendenza_used_b_ora'] for s in tick['segmenti']], [0.0, 0.0],
                 'heap piatto in tutti e due gli avvii')
        p.uguale([s['delta_used'] for s in tick['segmenti']], [0, 0], 'delta per avvio')
        # sync: due sync di 2 s. La prima non deve arrivare ne' al `sync: inbox dropped` del
        # secondo avvio (09:02:00) ne' al `sync: open` del suo init (09:00:05).
        durate = j['sync']['durate']
        p.uguale([s['durata_s'] for s in durate], [2, 2], 'due sync di 2 s')
        p.uguale([s['fine'] for s in durate], ['08:00:02', '10:00:12'], 'fine di ogni sync')
        p.uguale([s['end'] for s in durate], [1, 1], 'una END per sync')
        p.uguale([s['completa'] for s in durate], [True, True], 'tutte e due chiuse da SYNC_DONE')
        p.uguale(j['sync']['warning'], {'sync inbox dropped': 1}, 'un WARNING di sync')
        # conteggi dell'intestazione: totali = orologio + pkjs + fault + ignorate + fuori filtro
        r = j['righe']
        p.uguale(r['fault'], 1, 'la riga App fault! contata a parte')
        p.uguale(r['orologio'] + r['pkjs'] + r['fault'] + r['ignorate'] + r['fuori_filtro'],
                 r['totali'], 'i conteggi dell intestazione tornano')
        # --since dentro la finestra: il riavvio spontaneo resta spontaneo (criterio di O8)
        j2 = leggi(['--since', '09:00:00'])
        p.uguale(j2['avvii']['n'], 1, '--since tiene solo il secondo avvio')
        p.uguale(len(j2['avvii']['riavvii_spontanei']), 1,
                 'con --since il riavvio spontaneo resta segnalato')
        p.uguale(j2['righe']['fuori_filtro'] > 0, True, 'righe tagliate dal filtro contate a parte')
        codice, testo, _ = esegui([percorso, '--since', '09:00:00'])
        p.vero('RIAVVIO SPONTANEO' in testo, 'riavvio spontaneo in evidenza anche con --since')
        # due file distinti: le sync non si fondono attraverso i file
        j3 = dati([SINCRO, RIAVVIO])
        p.uguale([s['durata_s'] for s in j3['sync']['durate']], [2, 0],
                 'la sync del primo file non arriva all init del secondo')
        p.uguale([s['file'] for s in j3['sync']['durate']], [SINCRO, RIAVVIO],
                 'ogni sync resta nel suo file')


# `pebble install --logs` attacca il printer DOPO l'installazione: le prime righe (`heap main`)
# possono mancare. Qui il secondo avvio si vede solo dalla riga `sync: open` del suo init.
LOG_SENZA_HEAP_MAIN = """[08:00:00] sync.c:376> sync: msg=1 f=0 -> act=1 out=2 code=0 off=0 st=0 heap 45880
[08:00:01] sync.c:376> sync: msg=5 f=7e -> act=1 out=8 code=0 off=0 st=1 heap 45880
[08:00:02] sync.c:370> sync: end s=0 c=0 n=9 commit 2 photo 651 ch max 51 avg 21 heap 45880
[08:00:02] sync.c:376> sync: msg=9 f=0 -> act=0 out=0 code=0 off=0 st=0 heap 45880
[09:00:05] sync.c:470> sync: open(4153/110) -> 0 chunk=4096 heap 58992/47072 (cost 4364)
[09:00:10] sync.c:376> sync: msg=1 f=0 -> act=1 out=2 code=0 off=0 st=0 heap 45880
[09:00:12] sync.c:376> sync: msg=9 f=0 -> act=0 out=0 code=0 off=0 st=0 heap 45880
"""


def prova_init_senza_heap_main(p):
    """`sync: open` e' dell'init, non della sync: non deve chiudere la sync precedente."""
    with tempfile.TemporaryDirectory() as d:
        percorso = os.path.join(d, 'run_troncato.log')
        with open(percorso, 'w') as fh:
            fh.write(LOG_SENZA_HEAP_MAIN)
        codice, out, err = esegui([percorso, '--json', '-'])
        p.uguale(codice, 0, 'uscita del log senza heap main')
        j = json.loads(out)
        p.uguale(j['avvii']['n'], 0, 'nessun heap main nel log troncato')
        durate = j['sync']['durate']
        p.uguale([s['durata_s'] for s in durate], [2, 2],
                 'la sync finisce sul suo SYNC_DONE, non sul sync: open dell init successivo')
        p.uguale([s['fine'] for s in durate], ['08:00:02', '09:00:12'], 'fine di ogni sync')
        p.uguale(len(j['init']['sync_open']), 1, 'la riga sync: open resta nella sezione Init')


def prova_argomenti_orari(p):
    """--since/--until: orari impossibili e intervallo vuoto sono errori di argomento (2)."""
    for cattivo in ('25:00:00', '09:60:00', '09:00:60', 'ore 9'):
        codice, _, err = esegui(log(SINCRO) + ['--since', cattivo])
        p.uguale(codice, 2, '--since %s -> 2' % cattivo)
        p.vero('orario' in err or 'HH:MM:SS' in err, 'messaggio per --since %s' % cattivo)
    codice, _, _ = esegui(log(SINCRO) + ['--until', '24:00:00'])
    p.uguale(codice, 2, '--until 24:00:00 -> 2')
    codice, _, err = esegui(log(SINCRO) + ['--since', '10:47:00', '--until', '10:46:00'])
    p.uguale(codice, 2, 'intervallo vuoto -> 2')
    p.vero('vuoto' in err, 'messaggio dell intervallo vuoto')
    codice, _, _ = esegui(log(SINCRO) + ['--since', '10:46:50', '--until', '10:46:50'])
    p.uguale(codice, 0, 'since == until e un intervallo valido')


def prova_filtri_e_rese(p):
    j = dati([SINCRO], ['--until', '10:46:51'])
    p.uguale(j['filtro']['until'], '10:46:51', 'filtro nel JSON')
    p.uguale(len(j['sync']['end']), 2, 'le due END restano dentro --until')
    p.uguale(j['foto_persist']['righe'], [], '--until taglia la lettura da persist')
    p.uguale(j['colore']['per_fg'], {'c0': 1}, '--until taglia la seconda luma')
    j2 = dati([SINCRO], ['--since', '10:46:52'])
    p.uguale(j2['avvii']['n'], 0, '--since taglia l avvio')
    p.uguale(len(j2['foto_persist']['righe']), 1, '--since tiene la lettura da persist')
    # resa testuale e markdown: 12 sezioni nell'ordine dato
    titoli = ['1. Avvii', '2. Orologio', '3. Heap per fase', '4. Init', '5. Sync',
              '6. Foto da persist', '7. Rendering', '8. Rotazione', '9. Colore',
              '10. BT e batteria', '11. PKJS', '12. Anomalie', '13. Avvio/uscita']
    codice, testo, _ = esegui(log(SINCRO))
    p.uguale(codice, 0, 'resa testuale')
    posizioni = [testo.find(t) for t in titoli]
    p.vero(all(x > 0 for x in posizioni), 'tutte le 13 sezioni nel testo')
    p.uguale(posizioni, sorted(posizioni), 'sezioni nell ordine della specifica')
    p.vero('ch max' in testo and '10:46:51' in testo, 'numeri delle END nel testo')
    codice, md, _ = esegui(log(SINCRO) + ['--md'])
    p.uguale(codice, 0, 'resa markdown')
    p.vero(md.startswith('# Galleria'), 'titolo markdown')
    p.vero(all(('## ' + t) in md for t in titoli), 'sezioni markdown')
    p.vero(md.count('|---') >= 10, 'tabelle markdown')
    # --json PATH scrive il file e stampa comunque il riepilogo
    with tempfile.TemporaryDirectory() as d:
        fuori = os.path.join(d, 'r.json')
        codice, testo2, _ = esegui(log(SINCRO) + ['--json', fuori])
        p.uguale(codice, 0, '--json PATH')
        p.vero('5. Sync' in testo2, '--json PATH stampa anche il testo')
        with open(fuori) as fh:
            j3 = json.load(fh)
        p.uguale(j3, dati([SINCRO]), '--json PATH uguale a --json -')


def prova_tutte_le_fixture(p):
    """Ultimo controllo: tutta la cartella insieme (non dipende dall'elenco dei file)."""
    nomi = sorted(n for n in os.listdir(LOGS) if n.endswith('.log'))
    p.vero(len(nomi) >= 13, 'almeno tredici fixture di log')
    codice, testo, err = esegui(log(*nomi))
    p.uguale(codice, 0, 'riepilogo di tutte le fixture')
    p.uguale(err, '', 'nessun messaggio su stderr')
    p.vero('12. Anomalie' in testo, 'sezioni presenti nel riepilogo cumulativo')
    p.vero('13. Avvio/uscita (build M)' in testo, 'sezione 13 nel riepilogo cumulativo')
    j = json.loads(esegui(log(*nomi) + ['--json', '-'])[1])
    p.uguale(len(j['file']), len(nomi), 'un elemento per file nel JSON')
    p.uguale(j['righe']['totali'], sum(f['righe'] for f in j['file']), 'righe totali coerenti')
    p.uguale(j['versione'], 1, 'versione del formato JSON')
    # su tutte le fixture insieme: solo i due log della build M portano righe `init:`/`deinit:`
    a = j['avvio_uscita']
    p.uguale(a['stat']['init']['tot']['n'], 2, 'due righe init: in tutta la cartella')
    p.uguale(a['stat']['deinit']['tot']['n'], 1, 'una riga deinit: in tutta la cartella')
    p.uguale(len(a['migrazioni']), 1, 'una migrazione in tutta la cartella')
    p.uguale(sorted({x['file'] for x in a['avvii']}), sorted([S8_INIT, S8_DEINIT]),
             'solo le fixture della build M nella sezione 13')


def main():
    if not os.path.isfile(TOOL):
        sys.stderr.write('test_logstats: %s assente\n' % TOOL)
        return 1
    p = Prova()
    for prova in (prova_uscite, prova_sync, prova_riavvio_e_bt_off, prova_scossa_e_qv,
                  prova_timing, prova_s8_righe_nuove, prova_avvio_uscita,
                  prova_riavvio_in_mezzo,
                  prova_init_senza_heap_main, prova_argomenti_orari,
                  prova_filtri_e_rese, prova_tutte_le_fixture):
        prova(p)
    for descrizione in p.falliti:
        sys.stderr.write('  FALLITO: %s\n' % descrizione)
    sys.stdout.write('test_logstats: %d ok, %d falliti\n' % (p.ok, len(p.falliti)))
    return 1 if p.falliti else 0


if __name__ == '__main__':
    sys.exit(main())
