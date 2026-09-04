#!/usr/bin/env python3
"""test_cards.py — test delle test card del gate S8 (tools/gen_test_cards.py, spec
docs/design/galleria-s8-hardware.md §2.5). Esegue `--selftest` e `--check` in una cartella
temporanea e controlla il risultato riga per riga: le card devono realizzare DAVVERO la condizione
di apps/galleria/src/c/luma.h che dichiarano, e la previsione di tools/photo_prep.py deve
coincidere con l'atteso (è il test della card, non del C).

Gira con cwd = apps/galleria/test (come tutti i test della cartella); il tool sta in
../../../tools/. Serve Pillow: se manca, il test lo dice ed esce 0 (come `jstest` senza node).

Esecuzione: python3 test_cards.py (target suggerito: make -C test cards). Stampa
'test_cards: N ok, M falliti' ed esce 1 se qualcosa fallisce."""
import os
import re
import shutil
import subprocess
import sys
import tempfile

TOOL = os.path.join('..', '..', '..', 'tools', 'gen_test_cards.py')
PHOTO_PREP = os.path.join('..', '..', '..', 'tools', 'photo_prep.py')
REPO = os.path.abspath(os.path.join('..', '..', '..'))

EMERY_CARDS = ('c1_black', 'c2_white', 'c3_gray104', 'c4_y77', 'c5_y25', 'c6_tie_halo',
               'c7a_halo12', 'c7b_halo15', 'c7c_halo18', 'c8a_hyst_hold', 'c8b_hyst_flip',
               'palette64', 'gray4')
FLINT_CARDS = ('f1_black', 'f2_white', 'f3_5050', 'f4_40w', 'f5_60w')
ALL_CARDS = EMERY_CARDS + FLINT_CARDS
# c8a, c8b e palette64 si controllano su due fasce (106 = layout A, 228 = layout B)
DUE_FASCE = ('c8a_hyst_hold', 'c8b_hyst_flip', 'palette64')
ROWS = len(ALL_CARDS) + len(DUE_FASCE)
# Pezzi dell'avviso su come inviare le card (SEND_HINT del tool): la dimenticanza piu' facile e'
# la casella del vetro, che su palette64 falserebbe O6. HINT_UNA_VOLTA compare una volta sola
# nell'avviso (serve a scoprire se --check lo stampa due volte).
HINT_BITS = ('Ottimizza per il vetro', 'dithering "Nessuno"', 'gamma 1, lift 0')
HINT_UNA_VOLTA = 'ALTRIMENTI I NUMERI ATTESI NON VALGONO'

ok = 0
failed = 0


def check(cond, what):
    global ok, failed
    if cond:
        ok += 1
    else:
        failed += 1
        print('FAIL %s' % what)


def run(*args):
    """(returncode, output) di gen_test_cards.py con gli argomenti dati."""
    p = subprocess.run([sys.executable, TOOL] + list(args),
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return p.returncode, p.stdout.decode('utf-8', 'replace')


def tail(out, n=25):
    return '\n'.join(out.strip().splitlines()[-n:])


def mutated_tool(tmp):
    """Copia del tool con LUMA_HALO_PCT alterato, in una finta radice di repo (apps/ in symlink,
    photo_prep.py copiato) cosi' che REPO_ROOT del tool punti li'. None se non si puo' creare."""
    try:
        root = os.path.join(tmp, 'repo')
        os.makedirs(os.path.join(root, 'tools'))
        os.symlink(os.path.join(REPO, 'apps'), os.path.join(root, 'apps'))
        shutil.copy(PHOTO_PREP, os.path.join(root, 'tools', 'photo_prep.py'))
        src = open(TOOL, encoding='utf-8').read()
        old = 'LUMA_HALO_PCT = 15'
        if src.count(old) != 1:
            return None
        dst = os.path.join(root, 'tools', 'gen_test_cards.py')
        with open(dst, 'w', encoding='utf-8') as f:
            f.write(src.replace(old, 'LUMA_HALO_PCT = 20', 1))
        return dst
    except (OSError, NotImplementedError):
        return None


def main():
    if not os.path.exists(TOOL):
        print('test_cards: %s assente, saltato' % TOOL)
        return 0
    try:
        from PIL import Image                                 # il tool ne ha bisogno per i PNG
    except ImportError:
        print('test_cards: Pillow non installato, test saltato (il tool ne ha bisogno per i PNG)')
        return 0

    # --- 1. autotest del tool
    rc, out = run('--selftest')
    check(rc == 0, 'gen_test_cards.py --selftest esce 0 (ha dato %d)\n%s' % (rc, tail(out)))
    m = re.search(r'gen_test_cards selftest: (\d+) ok, (\d+) falliti', out)
    check(m is not None, '--selftest stampa il riepilogo\n%s' % tail(out))
    if m:
        check(int(m.group(1)) > 100 and int(m.group(2)) == 0,
              '--selftest: %s controlli, %s falliti' % (m.group(1), m.group(2)))

    with tempfile.TemporaryDirectory(prefix='galleria-test-cards-') as tmp:
        cards = os.path.join(tmp, 'cards')

        # --- 2. generazione + verifica con photo_prep.py
        rc, out = run('--out', cards, '--check')
        check(rc == 0, '--check esce 0 (ha dato %d)\n%s' % (rc, tail(out)))
        check('DISCORDE' not in out, '--check: nessuna riga DISCORDE\n%s' % tail(out))
        m = re.search(r'gen_test_cards --check: (\d+) righe, (\d+) discordanti', out)
        check(m is not None, '--check stampa il riepilogo\n%s' % tail(out))
        if m:
            check(int(m.group(1)) == ROWS and int(m.group(2)) == 0,
                  '--check: %s righe (attese %d), %s discordanti' % (m.group(1), ROWS, m.group(2)))

        # --- 3. la tabella copre ogni card, con l'esito ok
        for name in ALL_CARDS:
            rows = re.findall(r'^\| `%s` \|.*\| (ok|DISCORDE|[^|]*) \|$' % re.escape(name),
                              out, re.M)
            atteso = 2 if name in DUE_FASCE else 1
            check(len(rows) == atteso and set(rows) == {'ok'},
                  '%s: %d righe con esito %s (attese %d, tutte ok)' % (name, len(rows), rows, atteso))

        # --- 4. i PNG ci sono davvero, RGB 200x228 e con i soli colori della palette
        for name in ALL_CARDS:
            path = os.path.join(cards, name + '.png')
            if not os.path.exists(path):
                check(False, '%s.png scritto in %s' % (name, cards))
                continue
            img = Image.open(path)
            check(img.size == (200, 228) and img.mode == 'RGB',
                  '%s.png: RGB 200x228 (ha dato %s %s)' % (name, img.size, img.mode))
            check(set(img.tobytes()) <= {0, 85, 170, 255},
                  '%s.png: solo canali 0/85/170/255' % name)
        check(sorted(f for f in os.listdir(cards) if f.endswith('.png'))
              == sorted(n + '.png' for n in ALL_CARDS),
              'in %s ci sono esattamente le %d card attese' % (cards, len(ALL_CARDS)))

        # --- 5. filtri --emery / --flint
        solo_flint = os.path.join(tmp, 'flint')
        rc, out = run('--out', solo_flint, '--flint')
        check(rc == 0, '--flint esce 0 (ha dato %d)\n%s' % (rc, tail(out)))
        check(sorted(os.listdir(solo_flint)) == sorted(n + '.png' for n in FLINT_CARDS),
              '--flint scrive solo f1..f5 (ha dato %s)' % sorted(os.listdir(solo_flint)))
        solo_emery = os.path.join(tmp, 'emery')
        rc, out = run('--out', solo_emery, '--emery')
        check(rc == 0, '--emery esce 0 (ha dato %d)\n%s' % (rc, tail(out)))
        check(sorted(os.listdir(solo_emery)) == sorted(n + '.png' for n in EMERY_CARDS),
              '--emery scrive solo le card emery (ha dato %s)' % sorted(os.listdir(solo_emery)))

        # --- 6b. l'avviso su come inviare le card c'e' in entrambe le uscite (una volta sola)
        rc, out_plain = run('--out', os.path.join(tmp, 'hint'))
        check(rc == 0, 'generazione senza --check esce 0 (ha dato %d)\n%s' % (rc, tail(out_plain)))
        for bit in HINT_BITS + (HINT_UNA_VOLTA,):
            check(bit in out_plain, 'la generazione stampa l\'avviso (manca %r)' % bit)
        rc, out_chk = run('--out', os.path.join(tmp, 'hint2'), '--check')
        check(rc == 0, '--check esce 0 (ha dato %d)\n%s' % (rc, tail(out_chk)))
        for bit in HINT_BITS:
            check(bit in out_chk, '--check stampa l\'avviso (manca %r)' % bit)
        check(out_chk.count(HINT_UNA_VOLTA) == 1,
              '--check stampa l\'avviso una volta sola (ha dato %d)'
              % out_chk.count(HINT_UNA_VOLTA))
        # le note delle card finiscono nella tabella (markdown) e nella generazione (a capo)
        for name in ('c8b_hyst_flip', 'palette64', 'gray4', 'f3_5050', 'f4_40w'):
            check(('- `%s`: ' % name) in out_chk, '--check: nota markdown di %s' % name)
            check(('nota %s: ' % name) in out_plain, 'generazione: nota di %s' % name)
        check('ExtraLarge' in out_chk and '110' in out_chk,
              'la nota di c8b/palette64 avverte del content size ExtraLarge (fascia 110)')

        # --- 6c. --check confronta anche le soglie con luma.c/luma.h e se ne accorge se cambiano
        check('soglie e LUMA_SUN confrontate con luma.c/luma.h: ok' in out_chk,
              '--check dichiara il confronto con i sorgenti C\n%s' % tail(out_chk))
        mut = mutated_tool(tmp)
        if mut is None:
            print('test_cards: sandbox della mutazione non creabile, controllo saltato')
        else:
            p = subprocess.run([sys.executable, mut, '--out', os.path.join(tmp, 'mut'),
                                '--flint', '--check'], stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT)
            mo = p.stdout.decode('utf-8', 'replace')
            check(p.returncode == 1 and 'DISCORDANZ' in mo,
                  'soglia cambiata nel tool: --check esce 1 e lo dice (ha dato %d)\n%s'
                  % (p.returncode, tail(mo)))
            check('LUMA_HALO_PCT = 20 nel tool ma 15 in luma.h' in mo,
                  '--check nomina la soglia divergente\n%s' % tail(mo))

        # --- 7. cartella non scrivibile: messaggio ed exit 2, non un traceback
        blocco = os.path.join(tmp, 'un-file')
        with open(blocco, 'w') as f:
            f.write('x')
        rc, out = run('--out', os.path.join(blocco, 'cards'))
        check(rc == 2 and 'ERRORE' in out and 'Traceback' not in out,
              '--out impossibile: exit 2 con messaggio (ha dato %d)\n%s' % (rc, tail(out)))

    print('test_cards: %d ok, %d falliti' % (ok, failed))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
