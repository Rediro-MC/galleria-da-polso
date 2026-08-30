#!/usr/bin/env python3
"""test_dumb_durability.py — durabilità del localStorage di pypkjs (un dbm.dumb di CPython) con
un runtime che muore senza chiudere il database (`pebble kill` = SIGKILL): revisione post
code-review 29/08 (F11). Solo stdlib.

dbm.dumb (Lib/dbm/dumb.py): __setitem__ su una chiave GIÀ presente aggiorna l'indice solo in
memoria (_setval in place se il valore sta negli stessi blocchi da 512 B, altrimenti _addval in
coda al .dat) e il file indice .dir viene riscritto solo da _commit() (close/sync/__del__, e da
__delitem__); una chiave NUOVA viene invece appesa al .dir subito (_addkey). Quindi:
  - riscrittura semplice + crash → .dir punta ancora al vecchio (pos, size): si rilegge il valore
    VECCHIO (se il nuovo non stava nei blocchi) o un valore TRONCATO/misto (se ci stava e la
    lunghezza è diversa) — il bug che il padding di index.js non riusciva a evitare;
  - del + set + crash → __delitem__ riscrive il .dir senza la chiave e __setitem__ la appende
    di nuovo con la posizione nuova: si rilegge il valore NUOVO (fix di index.js: in dev
    removeItem(k) immediatamente prima di ogni setItem(k)).
Il "crash" è un processo figlio (subprocess) che scrive e termina con os._exit(0) senza close().

Esecuzione: python3 test_dumb_durability.py (oppure make -C test dumbtest). Stampa
'test_dumb_durability: N ok, M falliti' ed esce con 1 se qualcosa fallisce."""
import dbm.dumb
import os
import subprocess
import sys
import tempfile

KEY = 'galleria.v1.album'
OLD = 'a' * 65536                        # 65.536 B ASCII = esattamente 128 blocchi da 512 B
NEW = 'à' + 'b' * 65535                  # 65.536 caratteri, 65.537 B in UTF-8 (129 blocchi): non sta più
SMALL = '{"n":"small"}'                  # 13 B: sta nei blocchi vecchi (_setval in place)
BIG = '{"n":"big","x":"' + 'y' * 70000 + '"}'   # 70 KB (S6: thumb nell'album)

VALUES = {'old': OLD, 'new': NEW, 'small': SMALL, 'big': BIG, 'first': '{"n":"first","name":"città"}'}


def child(base, mode, name):
    """Sessione che muore senza chiudere il db: set (riscrittura semplice) o del+set (fix)."""
    db = dbm.dumb.open(base, 'c')
    if mode == 'delset' and KEY in db:
        del db[KEY]
    db[KEY] = VALUES[name]
    assert db[KEY].decode('utf-8') == VALUES[name]     # in sessione si rilegge sempre il nuovo
    sys.stdout.flush()
    os._exit(0)                          # niente close(), niente __del__: nessun _commit()


def clean_write(base, name):
    db = dbm.dumb.open(base, 'c')
    db[KEY] = VALUES[name]
    db.close()


def read_back(base):
    db = dbm.dumb.open(base, 'c')
    try:
        raw = db[KEY] if KEY in db else None
    finally:
        db.close()
    return raw


def crash_write(base, mode, name):
    r = subprocess.run([sys.executable, os.path.abspath(__file__), '--child', base, mode, name],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    if r.returncode != 0:
        raise RuntimeError('figlio fallito (%d): %s' % (r.returncode, r.stderr.decode('utf-8', 'replace')[-400:]))


def main():
    ok = 0
    failed = 0

    def check(cond, what):
        nonlocal ok, failed
        if cond:
            ok += 1
        else:
            failed += 1
            print('FAIL ' + what)

    with tempfile.TemporaryDirectory(prefix='galleria_dumb_') as tmp:
        n = 0

        def fresh():
            nonlocal n
            n += 1
            return os.path.join(tmp, 'ls%d' % n)

        # --- riproduzione del bug: riscrittura semplice che non sta più nei blocchi vecchi -> valore VECCHIO ---
        base = fresh()
        clean_write(base, 'old')
        check(os.path.getsize(base + '.dat') == 65536, 'bug: .dat iniziale di 65536 B')
        crash_write(base, 'set', 'new')
        raw = read_back(base)
        check(raw == OLD.encode('utf-8'), 'bug: dopo set + crash si rilegge il valore VECCHIO (65536 B ASCII)')
        check(raw != NEW.encode('utf-8'), 'bug: il valore nuovo (65537 B con "à") NON è stato reso durabile')
        check(os.path.getsize(base + '.dat') >= 65536 + 65537, 'bug: il nuovo valore è stato appeso al .dat ma il .dir non lo indica')

        # --- riproduzione: riscrittura più corta che sta nei blocchi -> valore TRONCATO/misto (né vecchio né nuovo) ---
        base = fresh()
        clean_write(base, 'old')
        crash_write(base, 'set', 'small')
        raw = read_back(base)
        check(raw is not None and len(raw) == 65536, 'bug: dopo set (più corto) + crash la lunghezza è quella VECCHIA')
        check(raw is not None and raw[:13] == SMALL.encode('utf-8') and raw[13:] == b'a' * (65536 - 13), 'bug: valore misto (nuovo + coda del vecchio): JSON troncato/corrotto')

        # --- fix: del + set + crash -> valore NUOVO, per ogni transizione ---
        base = fresh()
        clean_write(base, 'old')
        crash_write(base, 'delset', 'new')
        raw = read_back(base)
        check(raw == NEW.encode('utf-8'), 'fix: dopo del + set + crash si rilegge il valore NUOVO (65537 B con "à")')
        check(raw is not None and raw.decode('utf-8') == NEW, 'fix: decodifica UTF-8 corretta ("à" in testa)')

        base = fresh()
        clean_write(base, 'big')
        crash_write(base, 'delset', 'small')
        check(read_back(base) == SMALL.encode('utf-8'), 'fix: restringimento 70 KB -> 13 B durabile')

        base = fresh()
        clean_write(base, 'small')
        crash_write(base, 'delset', 'big')
        check(read_back(base) == BIG.encode('utf-8'), 'fix: crescita 13 B -> 70 KB durabile')

        base = fresh()
        crash_write(base, 'delset', 'first')          # chiave assente: nessun del, solo _addkey
        check(read_back(base) == VALUES['first'].encode('utf-8'), 'fix: prima scrittura assoluta (chiave nuova) durabile anche senza close')

        # --- fix: più riscritture nella stessa sessione morta -> l'ultima vince; il .dat cresce (costo noto) ---
        base = fresh()
        clean_write(base, 'small')
        r = subprocess.run([sys.executable, os.path.abspath(__file__), '--child-many', base, '5'],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        check(r.returncode == 0, 'fix: figlio con 5 riscritture terminato (%s)' % r.stderr.decode('utf-8', 'replace')[-200:])
        check(read_back(base) == b'{"n":4,"name":"citt\xc3\xa0"}', 'fix: dopo 5 del+set senza close si rilegge l\'ultimo valore')
        check(os.path.getsize(base + '.dat') == 5 * 512 + len('{"n":4,"name":"città"}'.encode('utf-8')), 'fix: il .dat cresce di un blocco (512 B) per riscrittura: spazio perso, azzerato da pebble wipe (got %d)' % os.path.getsize(base + '.dat'))

    print('test_dumb_durability: %d ok, %d falliti' % (ok, failed))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    if len(sys.argv) >= 5 and sys.argv[1] == '--child':
        child(sys.argv[2], sys.argv[3], sys.argv[4])
    elif len(sys.argv) >= 4 and sys.argv[1] == '--child-many':
        _db = dbm.dumb.open(sys.argv[2], 'c')
        for _i in range(int(sys.argv[3])):
            if KEY in _db:
                del _db[KEY]
            _db[KEY] = '{"n":%d,"name":"città"}' % _i
        os._exit(0)
    else:
        main()
