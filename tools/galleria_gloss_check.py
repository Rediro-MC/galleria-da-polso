#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
galleria_gloss_check.py - tripwire del glossario di Galleria (UX-4, D132).

A CHE SERVE
-----------
Il glossario di `docs/design/galleria-s10-i18n.md` §3 e' una tabella di
traduzioni scritta a mano; la fonte unica dei testi della config page e'
`apps/galleria/i18n/messages.json` (134 chiavi x 6 lingue, generato in
`src/pkjs/i18n.js` da `tools/build_i18n.py`). Questo tool confronta i due e
fallisce quando divergono, cosi' il glossario non puo' piu' invecchiare in
silenzio ne' restare parziale: gira dentro `make -C apps/galleria/test`
(bersaglio `glosscheck`, accanto a `pagecheck`). Deriva dallo script di
ricognizione `r2_gloss.py` di UX-4 (rapporto R2).

METODO
------
1. **Fonte unica**: `json.load` di `messages.json` (una voce per chiave, sei
   lingue `it, en, de, fr, es, pt`; i campi che iniziano con `_` sono commenti
   del file e vengono ignorati).
2. **Tabella viva**: si scandisce la sola §3 (da `## 3.` fino al `## `
   successivo) e si prendono le righe che iniziano con `|`. L'unica tabella di
   §3 e' quella con l'intestazione
   `| it (riferimento) | en | de («du») | fr («vous») | es («tú») | pt («você») | chiavi |`
   (sette colonne). I blocchi di storia («riallineata il …») sono **blockquote**
   e iniziano con `>`: restano fuori per costruzione, non per una lista di
   eccezioni.
3. **Allineamento parti <-> chiavi**: l'ultima colonna elenca 1..N chiavi fra
   backtick e le sei colonne di lingua tengono i testi separati da « · ». Lo
   split ingenuo non basta, perche' due testi contengono essi stessi un « · »
   (`watch_flint` «Pebble 2 Duo · bianco e nero», `preview_auto` «Colore
   automatico: {0} · bordo di contrasto: {1}»): quando il numero delle parti non
   coincide con il numero delle chiavi, i gruppi CONTIGUI di parti vengono
   assegnati alle chiavi nell'ordine con una programmazione dinamica che
   massimizza la somiglianza (`difflib.SequenceMatcher`) con il testo JSON di
   quella chiave. Una cella riallineata cosi' e' segnalata ma NON fa fallire:
   se il riallineamento fosse sbagliato, i testi assegnati non coinciderebbero
   e la differenza uscirebbe al punto 4. Fa fallire la cella che non si puo'
   allineare affatto (meno parti che chiavi, o nessuna soluzione) e la riga
   senza chiavi.
4. **Confronto a tre livelli**, per OGNI occorrenza della chiave (una chiave
   puo' comparire in due righe, come `opt_never` nelle select «mai»):
   identico byte per byte -> identico dopo NORMALIZZAZIONE di forma (caporali e
   virgolette curve, apostrofi U+2019, spazi unificatori, «…» -> «...», trattini
   lunghi, `**` e backtick di markdown, spazi multipli) -> parole diverse (token
   alfanumerici minuscoli, senza punteggiatura). La normalizzazione non tocca
   mai le PAROLE, quindi non puo' nascondere una traduzione diversa: solo il
   terzo livello e' un errore, il secondo si stampa come «forma» (con
   `--verbose` anche le due stringhe) e non fa fallire.
5. **Copertura**: chiavi del JSON che la tabella non ha (glossario incompleto) e
   chiavi della tabella che il JSON non ha piu' (residui di chiavi eliminate).
6. **Informativo** (non cambia l'esito): i segnaposto `{0}`/`{1}` devono formare
   lo stesso insieme nelle sei lingue di ogni voce.

USO
---
    python3 tools/galleria_gloss_check.py              # percorsi di default
    python3 tools/galleria_gloss_check.py --verbose    # anche le differenze di forma
    python3 tools/galleria_gloss_check.py --doc D --json J
    python3 tools/galleria_gloss_check.py --selftest   # fixture sintetica, nessun file del repo

I percorsi di default sono RELATIVI alla radice del repo, calcolata da
`__file__` (questo file sta in `tools/`): quindi il tool funziona da qualunque
cartella. Solo stdlib, Python 3.8+.

ESITO
-----
Esce **0 solo se**: nessuna chiave del JSON manca nella tabella, nessuna chiave
in piu', nessuna riga/cella che non si allinea alle chiavi, nessuna differenza
di parole. Le differenze di sola forma e le celle riallineate si stampano ma non
fanno fallire. Ogni errore e' un messaggio di una riga, mai un traceback.
"""
import argparse
import difflib
import json
import os
import re
import sys
import tempfile
import unicodedata

LANGS = ["it", "en", "de", "fr", "es", "pt"]
MIDDOT = "·"
SEP = " " + MIDDOT + " "

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEF_DOC = os.path.join(ROOT, "docs", "design", "galleria-s10-i18n.md")
DEF_JSON = os.path.join(ROOT, "apps", "galleria", "i18n", "messages.json")

HEADER_FIRST = "it (riferimento)"
HEADER_LAST = "chiavi"


class GlossError(Exception):
    """Errore di lettura o di formato: diventa una riga «ERRORE: …», mai un traceback."""


# ----------------------------------------------------------------- normalizza
TRANS = {
    "«": '"', "»": '"',                      # « »
    "“": '"', "”": '"', "„": '"',       # “ ” „
    "‘": "'", "’": "'", "′": "'",       # ‘ ’ ′
    " ": " ", " ": " ", " ": " ", " ": " ",
    "–": "-", "—": "-", "−": "-",       # – — −
    "…": "...",                                   # …
}


def norm(s):
    """Normalizzazione di FORMA: non deve mai cambiare le parole."""
    s = unicodedata.normalize("NFC", s)
    s = s.replace("**", "").replace("`", "")
    s = "".join(TRANS.get(ch, ch) for ch in s)
    return re.sub(r"\s+", " ", s).strip()


WORD_RE = re.compile(r"[0-9A-Za-zÀ-ɏ]+")


def words(s):
    return WORD_RE.findall(unicodedata.normalize("NFC", norm(s).lower()))


def sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


# -------------------------------------------------------------------- parsing
KEY_RE = re.compile(r"`([a-z0-9_]+)`")


def split_row(line):
    """Celle di una riga markdown, senza i pipe esterni."""
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse_table(doc_path):
    """Ritorna (rows, header_lineno). rows = [(lineno, [6 celle], [chiavi], cella chiavi)]."""
    try:
        with open(doc_path, encoding="utf-8") as f:
            lines = f.read().split("\n")
    except (OSError, ValueError) as e:  # non UTF-8 = UnicodeDecodeError (ValueError)
        raise GlossError("documento illeggibile: %s" % e)
    start = end = None
    for i, l in enumerate(lines):
        if start is None:
            if l.startswith("## 3."):
                start = i
        elif l.startswith("## "):
            end = i
            break
    if start is None:
        raise GlossError("sezione «## 3.» non trovata in %s" % doc_path)
    if end is None:
        end = len(lines)
    header = None
    rows = []
    for i in range(start, end):
        l = lines[i]
        if not l.startswith("|"):
            continue                      # i blocchi di storia sono blockquote: iniziano con «>»
        cells = split_row(l)
        if header is None:
            if cells[0].startswith(HEADER_FIRST) and cells[-1] == HEADER_LAST:
                if len(cells) != len(LANGS) + 1:
                    raise GlossError("intestazione della tabella viva con %d colonne invece di %d "
                                     "(riga %d)" % (len(cells), len(LANGS) + 1, i + 1))
                header = i + 1
            continue
        if set(cells[0]) <= set("-: "):    # riga separatrice |---|---|
            continue
        if len(cells) != len(LANGS) + 1:
            raise GlossError("riga %d con %d colonne invece di %d"
                             % (i + 1, len(cells), len(LANGS) + 1))
        rows.append((i + 1, cells[:len(LANGS)], KEY_RE.findall(cells[-1]), cells[-1]))
    if header is None:
        raise GlossError("tabella viva non trovata in §3 di %s (intestazione attesa: "
                         "«| %s … | %s |»)" % (doc_path, HEADER_FIRST, HEADER_LAST))
    if not rows:
        raise GlossError("tabella viva senza righe di dati in %s" % doc_path)
    return rows, header


def align(parts, keys, ref):
    """Assegna gruppi CONTIGUI di `parts` alle `keys` (stesso ordine), massimizzando la
    somiglianza con i testi di riferimento `ref` (lista parallela a keys, None = assente).
    Ritorna la lista dei testi ricomposti, oppure None se non e' possibile."""
    n, m = len(parts), len(keys)
    if m == 0:
        return None
    if n == m:
        return list(parts)
    if n < m:
        return None
    NEG = float("-inf")
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for j in range(1, m + 1):
        for i in range(j, n - (m - j) + 1):
            for k in range(j - 1, i):              # il gruppo j usa parts[k:i]
                if dp[k][j - 1] == NEG:
                    continue
                r = ref[j - 1]
                text = SEP.join(parts[k:i])
                sc = sim(text, r) if r is not None else (1.0 if i - k == 1 else 0.0)
                v = dp[k][j - 1] + sc
                if v > dp[i][j]:
                    dp[i][j] = v
                    back[i][j] = k
    if dp[n][m] == NEG:
        return None
    out, i, j = [], n, m
    while j > 0:
        k = back[i][j]
        out.append(SEP.join(parts[k:i]))
        i, j = k, j - 1
    return list(reversed(out))


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except OSError as e:
        raise GlossError("dizionario illeggibile: %s" % e)
    except ValueError as e:
        raise GlossError("dizionario non e' JSON valido: %s" % e)
    if not isinstance(data, dict):
        raise GlossError("il dizionario %s non ha un oggetto in cima" % path)
    out = {}
    for k, v in data.items():
        if k.startswith("_"):
            continue                       # commenti del file
        if not isinstance(v, dict):
            raise GlossError("la chiave %s non ha un oggetto di lingue" % k)
        mancanti = [l for l in LANGS if l not in v]
        if mancanti:
            raise GlossError("la chiave %s non ha le lingue %s" % (k, ",".join(mancanti)))
        out[k] = v
    if not out:
        raise GlossError("dizionario vuoto: %s" % path)
    return out


# ---------------------------------------------------------------------- check
def check(json_path=DEF_JSON, doc_path=DEF_DOC, verbose=False, out=None):
    """Confronta glossario e dizionario. Stampa il rapporto su `out` e ritorna 0/1."""
    out = out if out is not None else sys.stdout

    def p(fmt, *a):
        print(fmt % a if a else fmt, file=out)

    try:
        data = load_json(json_path)
        rows, header = parse_table(doc_path)
    except GlossError as e:
        p("ERRORE: %s", e)
        p("ESITO: DA CORREGGERE")
        return 1

    p("== galleria_gloss_check - glossario S10 §3 contro i18n/messages.json ==")
    p("JSON : %s (%d chiavi, lingue %s)", json_path, len(data), ",".join(LANGS))
    p("DOC  : %s (§3, intestazione riga %d, %d righe di dati: %d-%d)",
      doc_path, header, len(rows), rows[0][0], rows[-1][0])

    occ = {}                 # chiave -> [(riga, {lingua: testo}), ...], una voce per OCCORRENZA
    dup, realigned, broken = [], [], []
    seen = []
    for lineno, cells, keys, kcell in rows:
        if not keys:
            broken.append((lineno, "riga senza chiavi: %s" % kcell[:60]))
            continue
        for k in keys:
            if k in seen:
                dup.append((lineno, k))
            seen.append(k)
        per_lang = {}
        for li, lang in enumerate(LANGS):
            parts = [x.strip() for x in cells[li].split(SEP)]
            if len(parts) == len(keys):
                texts = parts
            else:
                texts = align(parts, keys, [data.get(k, {}).get(lang) for k in keys])
                if texts is None:
                    broken.append((lineno, "%s: %d parti per %d chiavi, non allineabile"
                                   % (lang, len(parts), len(keys))))
                    texts = [None] * len(keys)
                else:
                    realigned.append((lineno, lang, len(parts), len(keys)))
            per_lang[lang] = texts
        for ki, k in enumerate(keys):
            occ.setdefault(k, []).append((lineno, dict((l, per_lang[l][ki]) for l in LANGS)))

    missing = [k for k in data if k not in occ]
    extra = [k for k in occ if k not in data]

    p("")
    p("-- 1. copertura --")
    p("chiavi nel JSON      : %d", len(data))
    p("chiavi nella tabella : %d (%d righe, %d occorrenze)", len(occ), len(rows), len(seen))
    p("MANCANTI nella tabella (nel JSON, non nel glossario): %d", len(missing))
    for k in missing:
        p("   - %-24s it=%s", k, data[k]["it"][:70])
    p("IN PIU' nella tabella (non nel JSON): %d", len(extra))
    for k in extra:
        p("   + %s", k)
    if dup:
        p("chiavi ripetute (ogni occorrenza viene confrontata): %s",
          ", ".join("%s (riga %d)" % (k, l) for l, k in dup))

    p("")
    p("-- 2. allineamento parti/chiavi --")
    p("celle riallineate (un testo contiene « · »): %d", len(realigned))
    for lineno, lang, np_, nk in realigned:
        p("   ~ riga %d  %s: %d parti per %d chiavi -> riallineata sul JSON", lineno, lang, np_, nk)
    p("righe/celle NON allineabili: %d", len(broken))
    for lineno, msg in broken:
        p("   ! riga %d: %s", lineno, msg)

    p("")
    p("-- 3. confronto dei testi --")
    exact = form = mism = nulls = 0
    forms, mismatches = [], []
    for k in data:
        for lineno, cell in occ.get(k, []):
            for lang in LANGS:
                t, j = cell.get(lang), data[k][lang]
                if t is None:
                    nulls += 1
                    continue                   # gia' contata fra le celle non allineabili
                if t == j:
                    exact += 1
                elif norm(t) == norm(j) or words(t) == words(j):
                    form += 1
                    forms.append((k, lang, lineno, t, j))
                else:
                    mism += 1
                    mismatches.append((k, lang, lineno, t, j))
    p("celle confrontate: %d   identiche: %d   diverse solo di forma: %d   PAROLE DIVERSE: %d",
      exact + form + mism + nulls, exact, form, mism)
    if forms:
        if verbose:
            p("  [forma] (non fa fallire)")
            for k, lang, lineno, t, j in forms:
                p("   ~ %-22s %s (riga %d)\n       tabella: %s\n       json   : %s",
                  k, lang, lineno, t, j)
        else:
            p("  [forma] %s (--verbose per vederle)",
              ", ".join("%s/%s" % (k, lang) for k, lang, _l, _t, _j in forms))
    if mismatches:
        p("  [parole diverse]")
        for k, lang, lineno, t, j in mismatches:
            p("   ! %-22s %s (riga %d)\n       tabella: %s\n       json   : %s",
              k, lang, lineno, t, j)
            wt, wj = words(t), words(j)
            p("       solo tabella: %s | solo json: %s",
              [w for w in wt if w not in wj], [w for w in wj if w not in wt])

    p("")
    p("-- 4. segnaposto {0}/{1} coerenti fra le sei lingue (informativo) --")
    ph = re.compile(r"\{(\d)\}")
    badph = [(k, dict((l, sorted(set(ph.findall(v[l])))) for l in LANGS))
             for k, v in data.items()
             if len(set(frozenset(ph.findall(v[l])) for l in LANGS)) > 1]
    p("chiavi con segnaposto incoerenti: %d", len(badph))
    for k, sets in badph:
        p("   ! %s %s", k, sets)

    def plur(n, uno, molti):
        return "%d %s" % (n, uno if n == 1 else molti)

    motivi = []
    if missing:
        motivi.append(plur(len(missing), "chiave mancante", "chiavi mancanti"))
    if extra:
        motivi.append(plur(len(extra), "chiave in piu'", "chiavi in piu'"))
    if broken:
        motivi.append(plur(len(broken), "riga/cella non allineata", "righe/celle non allineate"))
    if mism:
        motivi.append(plur(mism, "cella con parole diverse", "celle con parole diverse"))
    p("")
    p("-- 5. esito --")
    if motivi:
        p("ESITO: DA CORREGGERE (%s)", ", ".join(motivi))
        p("La fonte unica e' %s: si corregge il glossario, mai il contrario.", json_path)
        return 1
    p("ESITO: ALLINEATO (%d chiavi, %d celle; %d diverse solo di forma)",
      len(data), exact + form, form)
    return 0


# ------------------------------------------------------------------- selftest
FX = {
    "watch_flint": {                       # un testo che contiene esso stesso « · »
        "it": "Pebble 2 Duo · bianco e nero", "en": "Pebble 2 Duo · black and white",
        "de": "Pebble 2 Duo · Schwarz-Weiß", "fr": "Pebble 2 Duo · noir et blanc",
        "es": "Pebble 2 Duo · blanco y negro", "pt": "Pebble 2 Duo · preto e branco"},
    "btn_save": {
        "it": "Salva", "en": "Save", "de": "Speichern",
        "fr": "Enregistrer", "es": "Guardar", "pt": "Salvar"},
    "btn_cancel": {
        "it": "Esci senza salvare", "en": "Leave without saving",
        "de": "Ohne Speichern verlassen", "fr": "Quitter sans enregistrer",
        "es": "Salir sin guardar", "pt": "Sair sem salvar"},
    "msg_added": {                         # con i caporali: serve al caso «differenza di forma»
        "it": "Foto aggiunta: tocca «Salva»", "en": "Photo added: tap «Save»",
        "de": "Foto hinzugefügt: tippe auf «Speichern»",
        "fr": "Photo ajoutée : touchez «Enregistrer»",
        "es": "Foto añadida: toca «Guardar»",
        "pt": "Foto adicionada: toque em «Salvar»"},
}

FX_HEADER = ("| it (riferimento) | en | de («du») | fr («vous») | "
             "es («tú») | pt («você») | chiavi |")


def _row(keys, cell_override=None, keycell=None):
    """Riga della tabella fixture: testi presi da FX e uniti con « · »."""
    cells = []
    for lang in LANGS:
        if cell_override and lang in cell_override:
            cells.append(cell_override[lang])
        else:
            cells.append(SEP.join(FX[k][lang] for k in keys))
    kc = keycell if keycell is not None else ", ".join("`%s`" % k for k in keys)
    return "| " + " | ".join(cells + [kc]) + " |"


def _doc(rows, blockquote=True, section=True, header=True):
    out = ["# S10 - fixture del selftest", "", "## 2. Contratti", "",
           "Testo qualunque, con una tabella che NON e' il glossario:", "",
           "| a | b |", "|---|---|", "| 1 | 2 |", ""]
    if section:
        out += ["## 3. Glossario e regole di traduzione", ""]
    if blockquote:
        out += ["> \U0001f501 Tabella riallineata il 14/09/2026 (storia, va ignorata):",
                "> " + FX_HEADER,
                "> |---|---|---|---|---|---|---|",
                "> | vecchio | old | alt | ancien | viejo | velho | `chiave_morta` |", ""]
    if header:
        out += [FX_HEADER, "|---|---|---|---|---|---|---|"]
    out += rows
    if blockquote:
        # secondo blocco di storia, DOPO la tabella viva (come la nota es/pt di S11 in §3)
        out += ["", "> \U0001f501 Nota di S11 (storia, va ignorata anche se viene dopo la tabella):",
                "> | vecchio | old | alt | ancien | viejo | velho | `chiave_morta` |"]
    out += ["", "## 4. Compiti", "", "fine.", ""]
    return "\n".join(out)


def selftest(out=None):
    out = out if out is not None else sys.stdout
    import io
    ok = 0
    fails = []
    td = tempfile.TemporaryDirectory(prefix="gloss_selftest_")  # rimossa anche se un caso solleva
    tmp = td.name
    jpath = os.path.join(tmp, "messages.json")
    with open(jpath, "w", encoding="utf-8") as f:
        json.dump(FX, f, ensure_ascii=False, indent=1)

    def run(doc_text, verbose=False, json_path=jpath):
        dpath = os.path.join(tmp, "doc.md")
        with open(dpath, "w", encoding="utf-8") as fh:
            fh.write(doc_text)
        buf = io.StringIO()
        rc = check(json_path, dpath, verbose=verbose, out=buf)
        return rc, buf.getvalue()

    def caso(nome, cond):
        nonlocal ok
        if cond:
            ok += 1
        else:
            fails.append(nome)

    base_rows = [_row(["watch_flint"]), _row(["btn_save", "btn_cancel"]), _row(["msg_added"])]

    # 1. tabella allineata: esce 0
    rc, o = run(_doc(base_rows))
    caso("1 allineato rc=0", rc == 0)
    caso("1 ESITO ALLINEATO", "ESITO: ALLINEATO" in o)
    caso("1 quattro chiavi, quattro righe", "chiavi nella tabella : 4 (3 righe, 4 occorrenze)" in o)
    caso("1 ventiquattro celle identiche", "celle confrontate: 24   identiche: 24" in o)
    caso("1 nessuna mancante", "non nel glossario): 0" in o)

    # 2. chiave del JSON che la tabella non ha
    rc, o = run(_doc(base_rows[:2]))
    caso("2 chiave mancante rc=1", rc == 1)
    caso("2 conta le mancanti", "non nel glossario): 1" in o and "- msg_added" in o)
    caso("2 motivo nell'esito", "ESITO: DA CORREGGERE (1 chiave mancante)" in o)

    # 3. chiave in piu' nella tabella (residuo di una chiave eliminata)
    extra_row = "| vecchio | old | alt | ancien | viejo | velho | `preview_off` |"
    rc, o = run(_doc(base_rows + [extra_row]))
    caso("3 chiave in piu' rc=1", rc == 1)
    caso("3 nomina la chiave in piu'", "IN PIU' nella tabella (non nel JSON): 1" in o
         and "+ preview_off" in o)

    # 4. una parola diversa in una sola lingua (de)
    rc, o = run(_doc([base_rows[0],
                      _row(["btn_save", "btn_cancel"],
                           {"de": "Sichern" + SEP + FX["btn_cancel"]["de"]}),
                      base_rows[2]]))
    caso("4 parola diversa rc=1", rc == 1)
    caso("4 una sola cella diversa", "PAROLE DIVERSE: 1" in o)
    caso("4 nomina chiave e lingua", "! btn_save" in o and "solo json: ['speichern']" in o)

    # 5. differenza di SOLA FORMA (caporali -> virgolette dritte): non fa fallire
    forma = _row(["msg_added"], {"it": 'Foto aggiunta: tocca "Salva"'})
    rc, o = run(_doc([base_rows[0], base_rows[1], forma]))
    caso("5 forma rc=0", rc == 0)
    caso("5 contata come forma", "diverse solo di forma: 1" in o and "PAROLE DIVERSE: 0" in o)
    caso("5 senza --verbose la elenca in breve", "[forma] msg_added/it" in o)
    rc, o = run(_doc([base_rows[0], base_rows[1], forma]), verbose=True)
    caso("5 con --verbose mostra le due stringhe", "tabella: Foto aggiunta: tocca \"Salva\"" in o
         and "json   : Foto aggiunta: tocca «Salva»" in o)

    # 6. riga con DUE chiavi separate da « · »
    rc, o = run(_doc([base_rows[1]]))
    caso("6 due chiavi in una riga: due chiavi lette", "chiavi nella tabella : 2 (1 righe" in o)
    caso("6 nessun riallineamento", "celle riallineate (un testo contiene « · »): 0" in o)
    caso("6 dodici celle identiche", "celle confrontate: 12   identiche: 12" in o)

    # 7. testo che contiene esso stesso « · »: riallineato, non e' un errore
    rc, o = run(_doc([base_rows[0]]))
    caso("7 riallineate le sei lingue", "celle riallineate (un testo contiene « · »): 6" in o)
    caso("7 nessuna cella non allineabile", "righe/celle NON allineabili: 0" in o)
    caso("7 testi comunque identici", "identiche: 6" in o and "PAROLE DIVERSE: 0" in o)

    # 8. il blockquote di storia non entra nella tabella viva
    rc, o = run(_doc(base_rows, blockquote=True))
    caso("8 blockquote ignorato rc=0", rc == 0)
    caso("8 nessuna chiave in piu' dal blockquote", "IN PIU' nella tabella (non nel JSON): 0" in o)
    caso("8 le righe restano tre (nessuna riga di storia letta)", "(3 righe, 4 occorrenze)" in o)
    rc2, o2 = run(_doc(base_rows, blockquote=False))
    caso("8 stessi conteggi senza i due blockquote", rc2 == 0
         and "chiavi nella tabella : 4 (3 righe, 4 occorrenze)" in o2
         and "celle confrontate: 24   identiche: 24" in o2)

    # 9. cella con MENO parti che chiavi: non allineabile
    rc, o = run(_doc([base_rows[0],
                      _row(["btn_save", "btn_cancel"], {"fr": "Enregistrer"}),
                      base_rows[2]]))
    caso("9 cella corta rc=1", rc == 1)
    caso("9 segnalata come non allineabile",
         "righe/celle NON allineabili: 1" in o and "fr: 1 parti per 2 chiavi" in o)

    # 10. riga senza chiavi nell'ultima colonna
    rc, o = run(_doc(base_rows + [_row(["btn_save"], keycell="da decidere")]))
    caso("10 riga senza chiavi rc=1", rc == 1)
    caso("10 messaggio con la riga", "riga senza chiavi" in o)

    # 11. §3 assente
    rc, o = run(_doc(base_rows, section=False))
    caso("11 senza §3 rc=1", rc == 1)
    caso("11 messaggio, non traceback", "ERRORE: sezione «## 3.» non trovata" in o)

    # 12. tabella viva senza intestazione
    rc, o = run(_doc(base_rows, header=False))
    caso("12 senza intestazione rc=1", rc == 1)
    caso("12 messaggio chiaro", "ERRORE: tabella viva non trovata" in o)

    # 13. intestazione con cinque lingue invece di sei
    corta = FX_HEADER.replace(" pt («você») |", " ")
    rc, o = run(_doc(base_rows, header=False).replace("## 3. Glossario e regole di traduzione",
                                                      "## 3. Glossario e regole di traduzione\n\n"
                                                      + corta))
    caso("13 intestazione corta rc=1", rc == 1)
    caso("13 dice quante colonne", "colonne invece di 7" in o)

    # 14. dizionario assente o non JSON
    rc, o = run(_doc(base_rows), json_path=os.path.join(tmp, "assente.json"))
    caso("14 JSON assente rc=1", rc == 1)
    caso("14 messaggio, non traceback", "ERRORE: dizionario illeggibile" in o)
    rotto = os.path.join(tmp, "rotto.json")
    with open(rotto, "w", encoding="utf-8") as f:
        f.write("{ questo non e' json")
    rc, o = run(_doc(base_rows), json_path=rotto)
    caso("14 JSON rotto rc=1", rc == 1 and "non e' JSON valido" in o)

    # 15. la stessa chiave in due righe (come `opt_never`): tutte le occorrenze confrontate
    rc, o = run(_doc(base_rows + [_row(["btn_save"])]))
    caso("15 chiave ripetuta rc=0", rc == 0)
    caso("15 dichiarata come ripetuta", "chiavi ripetute" in o and "btn_save" in o)
    caso("15 confrontate 30 celle (5 occorrenze)", "celle confrontate: 30" in o)
    rc, o = run(_doc(base_rows + [_row(["btn_save"], {"pt": "Gravar"})]))
    caso("15 una occorrenza sbagliata fa fallire", rc == 1 and "PAROLE DIVERSE: 1" in o)

    # 16. lingua mancante nel dizionario
    mezzo = os.path.join(tmp, "mezzo.json")
    with open(mezzo, "w", encoding="utf-8") as f:
        json.dump({"btn_save": {"it": "Salva"}}, f, ensure_ascii=False)
    rc, o = run(_doc(base_rows), json_path=mezzo)
    caso("16 lingue mancanti rc=1", rc == 1 and "non ha le lingue" in o)

    td.cleanup()                       # ricorsiva: regge anche una sottocartella nella fixture

    for nome in fails:
        print("  FALLITO: %s" % nome, file=out)
    print("galleria_gloss_check --selftest: %d ok%s"
          % (ok, "" if not fails else ", %d FALLITI" % len(fails)), file=out)
    return 1 if fails else 0


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Confronta il glossario di docs/design/galleria-s10-i18n.md §3 con "
                    "apps/galleria/i18n/messages.json (D132).")
    ap.add_argument("--doc", default=DEF_DOC, help="documento con il glossario (default: %(default)s)")
    ap.add_argument("--json", default=DEF_JSON, help="dizionario (default: %(default)s)")
    ap.add_argument("--verbose", action="store_true",
                    help="mostra anche le differenze di sola forma")
    ap.add_argument("--selftest", action="store_true",
                    help="autotest su una fixture sintetica (nessun file del repo)")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    return check(a.json, a.doc, a.verbose)


if __name__ == "__main__":
    sys.exit(main())
