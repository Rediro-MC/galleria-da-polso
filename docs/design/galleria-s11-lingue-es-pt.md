# Galleria — S11: lingue spagnola e portoghese (orologio + config page + store)

> Decisioni prese dall'utente il 06/09/2026 sulle domande di `galleria-s11-analisi-anteprima-lingue.md` §4:
> forme dei **pack** per lo spagnolo, portoghese **come il pack**, **nessuna eccezione** sul separatore delle migliaia,
> registro delle traduzioni scelto dall'orchestratore purché **uniforme** con le altre lingue, prima le lingue e poi
> l'anteprima (S12), nome nello store **«Galleria»** e descrizione con «pensata per Pebble Time 2 (schermo a colori)».
> Vale tutto di `galleria-s10-i18n.md` (D31–D38) salvo quanto esteso qui. Versione **0.3.0**.

> 🔁 **Riletta il 17/09/2026** (come i blocchi di revisione di S10 e S12, D129; primo e terzo punto
> aggiornati e quarto punto aggiunto il 19/09/2026). Le decisioni **D39–D42** sono vive e valgono come
> sono scritte, salvo i punti qui sotto (versione, nome nello store e release notes di **D42**); il resto
> del documento è il contratto di quella sessione e resta come storia, con tre numeri e una regola da
> aggiornare quando si legge:
> - **la versione non è la 0.3.0**: la 0.3.0 non è mai uscita e il lavoro di S11, S12 e UX-1…UX-4 è uscito in
>   una sola release **0.4.0**, pubblicata il 18/09/2026 (**D126**; `apps/galleria/package.json` →
>   `"version": "0.4.0"`);
> - **le chiavi non sono 121**: `apps/galleria/i18n/messages.json` ne ha **135** × 6 lingue (39.834 B), dopo le
>   aggiunte e le fusioni di UX-1…UX-3 (**D116**);
> - **il nome nello store è «Galleria»** (verificato il **19/09/2026**): il «Galleria» di **D42** è stato
>   applicato dall'utente dalla dashboard, a 0.4.0 già pubblicata (18/09/2026); la descrizione nuova è
>   **online dal 19/09/2026 sera**, mandata con il `PATCH` di `apps/galleria/store/PUBLISH.md` §0.1
>   (che porta comunque `title=Galleria`);
> - **le release notes non hanno più una riga per lingua** (D42): dal 18/09/2026 si scrivono solo in
>   inglese (`apps/galleria/store/LISTING.md` §3); le sei righe della 0.4.0 e quelle della 0.2.0 restano
>   come storia.

## 0. Decisioni (D39–D42)

- **D39 — es = 5, pt = 6, sempre in coda, in tutte le copie della lista** (`enum GalLang`, `datefmt.h`, `page_core.js` `LANGS`/`LANG_NAMES`, `index.js` `LANGS`/`LANG_ORDER`, `build_i18n.py` `LANGS`/`OUT_LANGS`, `galleria_devserver.py` `PAGE_LANGS`, `messages.json`). Si introducono `GAL_LANG_LAST` (= `GAL_LANG_PT`) e `DATEFMT_LANG_LAST` al posto dei confronti «≤ FR»; il build tool verifica che le lingue di `src/pkjs/i18n.js`, `LANGS` di `page_core.js` e `LANG_ORDER` di `index.js` coincidano.
- **D40 — Data con lingua forzata (estende D34: abbreviazioni identiche ai pack di PebleOS `es_ES` e `pt_PT`)**:
  - es: giorni **«do lu ma mi ju vi sá»**, mesi **«ene feb mar abr mayo jun jul ago sep oct nov dic»** (msgstr verbatim dei `.po`; «mayo» è l'unica forma del pack per «May»). Ordine **giorno-mese** come it/fr: livello 0 «sá 5 sep» / «mi 31 mayo», livello 1 «sá 5», livello 2 «5». Motivo: il `%c` del pack spagnolo è il msgid inglese **non tradotto** («%a %b %e»): non è una convenzione spagnola, e «sá 5 sep» coincide con ciò che l'orologio mostra già in automatico con il pack (l'app compone «%a %d %b», `ui_time.c:527-536`).
  - pt: giorni **«Dom Seg Ter Qua Qui Sex Sáb»**, mesi **«Jan Fev Mar Abr Mai Jun Jul Ago Set Out Nov Dez»**; formato del `%c` del pack («%a %e de %b»): livello 0 **«Sáb 5 de Set»**, livello 1 «Sáb 5», livello 2 «5».
  - `DATEFMT_MAX_LEN` 13 → **14** («Sáb 31 de Set» = 14 B: «á» vale 2), `DATEFMT_BUFSZ` 15; `s_date_buf[24]` in `ui_time.c` resta.
  - Celle: `WDAY[6][7][5]` («Sáb» = 4 B + NUL non entra in 4) e `MON[6][12][7]` = 714 B; letterali **UTF-8 diretti** («Sáb», «sá», «Mär»): mai `"\xC3\xA1b"` (la «b» diventerebbe parte dell'escape).
- **D41 — Separatore delle migliaia: nessuna eccezione**: es e pt → `'.'` in `datefmt_thousands_sep` (come i pack Kickstart e come l'automatico di oggi); `prv_update_thousands_sep` considera «note» en/it/de/fr/es/pt (esito per es/pt invariato: `'.'`). Nessuna impostazione nuova, nessuno spazio per il portoghese.
- **D42 — Traduzioni e store**: registro **es «tú»**, **pt «você»** (informale come it «tu» e de «du»), lessico neutro valido in Spagna/America e Brasile/Portogallo; endonimi «Español», «Português»; stesse regole del glossario S10 (`galleria-s10-i18n.md` §3: `{0}`/`{1}`, «KB», nomi propri invariati, niente backtick, etichette ≤ 28 caratteri dove possibile, `dec()` per i numeri: es/pt virgola). Versione **0.3.0**. Store: nome **«Galleria»** (PATCH `title`, `store/PUBLISH.md` §0), descrizione inglese con «Designed for Pebble Time 2 (colour display); also runs on Pebble 2 Duo», sei lingue, «Photo upload tested on Android and iPhone»; release notes 0.3.0 in ASCII, una riga per lingua (6 righe). Il PATCH allo store lo lancia l'utente (o l'orchestratore su richiesta): non è parte del gate.

## 1. Contratti per file (chi tocca cosa: file DISGIUNTI fra agenti)

### 1.1 Orologio — C (alta, Fable; agente C1: SOLO `src/c/settings.h`, `src/c/settings.c`, `src/c/datefmt.h`, `src/c/datefmt.c`, `src/c/ui_time.c`)
- `settings.h`: `enum GalLang { …, GAL_LANG_ES = 5, GAL_LANG_PT = 6, GAL_LANG_LAST = GAL_LANG_PT }`; commento D31 aggiornato («1..6»); `gal_lang_from_locale`: prefissi `es` → ES, `pt` → PT (confronto sui 2 caratteri: «es» ≠ «en»), resto invariato (sconosciuto → EN).
- `settings.c:47`: `s->lang <= GAL_LANG_LAST`; commento di `GALLERIA_DEBUG_LANG` (:73) «0 auto, 1 en, 2 it, 3 de, 4 fr, 5 es, 6 pt».
- `datefmt.h`: `DATEFMT_LANG_ES = 5, DATEFMT_LANG_PT = 6, DATEFMT_LANG_LAST`; `DATEFMT_MAX_LEN 14`; commento con i formati es/pt; clamp «lang fuori 1..6 → EN».
- `datefmt.c`: tabelle a 6 righe (D40, verbatim), ramo pt («%s %u de %s» al livello 0), es come it; `datefmt_thousands_sep`: `case ES: case PT: return '.'`; commento sulle dimensioni (714 B) e sulla scelta del formato es.
- `ui_time.c:547-557`: lingue note = en/it/de/fr/es/pt (una funzione o tabella, non sei `prv_locale_is` in fila se si può evitare); commento aggiornato. Nessun altro cambiamento in `ui_time.c`.
- Verifica dell'agente: `make -C test run-test_datefmt run-test_storage run-test_sync` **dopo** che T1 ha aggiornato i test (C1 lavora prima: compila con `gcc -fsyntax-only` e con la toolchain ARM `arm-none-eabi-gcc -std=c11 -mcpu=cortex-m4 -mthumb -Os -fPIE -ffunction-sections -fdata-sections -Wall -Wextra -Werror -c src/c/datefmt.c` + `arm-none-eabi-size -A`); riporta i byte (atteso `datefmt.o` ≈ 1.019 B, +330). **Niente `pebble build`** (lo fa l'orchestratore).

### 1.2 Test C (alta, Fable; agente T1, dopo C1: SOLO `test/test_datefmt.c`, `test/test_storage.c`, `test/test_sync.c`, `test/shim/fakewatch.js`)
- `test_datefmt.c`: loop esaustivi su lang 1..6 (da 31.248 a ≈ 46.872 casi), pin verbatim delle 19 stringhe es e 19 pt, formati es («sá 5 sep», «mi 31 mayo», livelli 1/2) e pt («Sáb 5 de Set», «Sáb 31 de Set» = 14 B, «Sáb 5», «5»), `DATEFMT_MAX_LEN == 14` e `BUFSZ == 15`, `datefmt_thousands_sep(5/6) == '.'`, lang 7/255 → EN; la regola «byte ≥ 0x80 mai ai livelli 1/2» diventa **per lingua** (de/fr solo mese al livello 0; es/pt anche nel giorno ai livelli 0 e 1; en/it mai); tabella dei mutanti nel commento di testa aggiornata con ≥ 4 mutanti nuovi (riga es/pt scambiate, «de» mancante, cella WDAY a 4, ES → EN nel clamp) e verifica che ognuno faccia fallire almeno un'asserzione (riportare il conteggio).
- `test_storage.c` (:2320, :2335, :2412): lang 5 e 6 **validi**, primo non valido **7**.
- `test_sync.c:1419-1427`: `blob[13] = 7` → `BAD_FORMAT`; caso nuovo `blob[13] = 5` e `= 6` accettati con `shim_ui_lang_calls() == 1`; :1307 loop `<= GAL_LANG_LAST`.
- `test/shim/fakewatch.js:256-259`: `blob[13] > 6`.

### 1.3 Tool (medio-bassa, Opus; agente P1: SOLO `tools/build_i18n.py`, `tools/build_config_page.py`, `tools/galleria_devserver.py`, `tools/README.md`)
- `build_i18n.py`: `LANGS = ('it','en','de','fr','es','pt')`, `OUT_LANGS = ('en','it','de','fr','es','pt')`; docstring/README generato; `--selftest` con fixture a 6 lingue (i casi `fails` restano 10: «lingua mancante» = 5 su 6, «fuori ordine»).
- `build_config_page.py`: `_check_i18n_module` verifica anche le **lingue**: gli array presenti in `src/pkjs/i18n.js` == `LANGS` di `src/pkjs/config/page_core.js` == `LANG_ORDER` di `src/pkjs/index.js` (regex sui letterali; errore chiaro se differiscono; salto con avviso se i file mancano nelle copie di prova); `--selftest` con un caso positivo e uno negativo.
- `galleria_devserver.py`: `PAGE_LANGS += ('es','pt')`, `metavar 'en|it|de|fr|es|pt'`, selftest: `--lang es` **valido** (:2387-2390 e :1993: usare `ru` come lingua non valida), pagina di prova/`--dump-json` con `hooks.lang` es.
- `tools/README.md`: righe su `--lang` e su `build_i18n` (6 lingue).
- Verifica: `python3 tools/build_i18n.py --selftest`, `python3 tools/build_config_page.py --selftest`, `python3 tools/galleria_devserver.py --selftest` (i selftest del devserver che usano `messages.json` reale vanno bene anche a 4 lingue finché il MERGE non è fatto: dirlo nel report).

### 1.4 Traduzioni (medio-bassa, Opus; TR-es, TR-pt, poi revisori REV-es, REV-pt; SOLO file nello scratchpad)
- Input: `apps/galleria/i18n/messages.json` (121 chiavi, it/en/de/fr), glossario S10 §3, D42.
- Output: `<scratch>/s11/es.json` e `pt.json` = `{ "chiave": "testo", … }` con TUTTE le 121 chiavi, stessi segnaposto della voce (`{0}`/`{1}`), niente backtick, niente `</script>`; accenti ammessi (i dizionari viaggiano nell'hash, non nei log). Il revisore corregge nel posto e produce `es.rev.json`/`pt.rev.json` + un elenco delle correzioni.
- Agente MERGE (Opus, dopo revisori e P1; SOLO `apps/galleria/i18n/messages.json`, `i18n/README.md`, e i generati `src/pkjs/i18n.js`, `test/fixture_i18n.js`): inserisce `es` e `pt` in **ogni** voce nell'ordine `it, en, de, fr, es, pt`, controlla segnaposto e chiavi, aggiorna `i18n/README.md` (6 lingue, ordine, numeri), esegue `python3 ../../tools/build_i18n.py` (rigenera `i18n.js` e `fixture_i18n.js`) e `--check`; riporta la dimensione di `i18n.js` (atteso ≈ 30 KB).

### 1.5 PKJS, pagina, test node (medio-bassa, Opus; agente J1, dopo MERGE: SOLO `src/pkjs/index.js`, `src/pkjs/album.js`, `src/pkjs/config/page_core.js`, `src/pkjs/config/page.js`, `test/test_index_retry.js`, `test/test_page.js`, `test/test_album.js`, `test/shim/i18n_stub*.js`, altri `test/test_*.js` che pinnano 4 lingue)
- `index.js:340-341`: `LANGS` e `LANG_ORDER` con es/pt (ordine D39); `album.js:78` (normalizzazione `lang` 0..6); `page_core.js:25` (`['lang', 0, 6, 0]`), `:28` (`LANGS` + `LANG_NAMES` «Español», «Português»), `dec` invariato (es/pt → virgola); `page.js` solo se serve (le option nascono da `LANGS`).
- Test: `test_index_retry.js:589-591` (es_ES → `es`), `test_page.js:3148-3149` (lang_auto `es` → spagnolo) e le asserzioni «5 option»/«4 lingue» → 7/6, `test_album.js:501-502`, stub `test/shim/i18n_stub*.js` a 6 lingue; per il caso «lingua sconosciuta» usare `ru`. `make -C test jstest` verde (riportare i conteggi).
- Log PKJS solo ASCII (F-S8-2): nessun accento in `log()`.

### 1.6 Documenti e store (bassa, Opus; agente D1: SOLO `apps/galleria/package.json`, `apps/galleria/CLAUDE.md`, `apps/galleria/store/*`, `docs/design/galleria-s10-i18n.md`, `docs/design/galleria-s6-config-page.md`, `docs/design/galleria.md`, `README.md` radice se cita le lingue)
- `package.json`: `version` **0.3.0** (solo quello).
- `apps/galleria/CLAUDE.md`: righe 61-65 (enum 0..6, `GALLERIA_DEBUG_LANG` 5 es / 6 pt, `messages.json` 121 × 6, `--lang en|it|de|fr|es|pt`), versione 0.3.0.
- `galleria-s10-i18n.md`: nota in testa che rimanda a S11 (D39–D42) e glossario esteso con le colonne es/pt per le righe del §3 (prese dalle traduzioni di MERGE se già pronte, altrimenti dalla bozza TR: dirlo).
- `galleria-s6-config-page.md:65-69/129`, `galleria.md` (riga di `datefmt.h`: tabelle 714 B, `DATEFMT_MAX_LEN` 14): aggiornare i numeri.
- Store: `description.txt` (≤ 800 caratteri, inglese) con «Designed for Pebble Time 2 (colour display); also runs on Pebble 2 Duo» nella prima o seconda riga, «Settings page in English, Italian, German, French, Spanish and Portuguese», «Photo upload tested on Android and iPhone», «Beta 0.3.0»; `LISTING.md` (nome nello store «Galleria», descrizione, sezione release notes 0.3.0); `release_notes_0.3.0.txt` ASCII, 6 righe (en/it/de/fr/es/pt, «Espanol»/«Portugues» senza accenti), contenuto: spagnolo e portoghese su pagina e orologio, nome «Galleria»; `PUBLISH.md` §0: comando PATCH con `--form-string "title=Galleria"` e la descrizione, e nota che `title` rinomina l'app.

## 2. Gate (orchestratore, emulatore esclusivo)
1. `python3 ../../tools/build_i18n.py --check`, `python3 ../../tools/build_config_page.py` (rigenera `config_page.js`; misurare: atteso 64.699 + ~46 B), `make -C test pagecheck`, `make -C test` verde (riportare i conteggi nuovi).
2. `pebble build` emery + flint (statico atteso ≈ +330 B: ≈ 29.130 / 29.020 B).
3. Emulatore emery: `GALLERIA_DEFINES="GALLERIA_DEBUG_LANG=5" pebble build` → screenshot con data «do 6 sep» e passi «6.532»; `=6` → «Dom 6 de Set»; flint con 6 → data al livello 0 o 1 secondo lo spazio (annotare quale); build normale → auto invariato.
4. Config page in Firefox via `galleria_devserver.py --page-dir src/pkjs/config --lang es` e `--lang pt`: select «Automatica (orologio: Español)», testi tradotti, `dec` con la virgola; screenshot a 400 px.
5. Revisione: scettici Fable sul diff C/test C, Opus sul resto; correzioni; PIANO §4/§5/§8, CONTINUA-QUI, memoria.

## 3. Regole per gli agenti
- Ogni agente tocca **solo** i file del suo contratto; niente `git`, niente `pebble build`/emulatore, niente `pip install`; file temporanei in `<scratch>/s11/<agente>/`. Riportare comandi eseguiti e output in breve, numeri misurati, dubbi aperti.
- Ordine delle lingue **sempre** en, it, de, fr, es, pt negli array e it, en, de, fr, es, pt in `messages.json`.
- Commenti in italiano, ASCII nei `log()` del PKJS, stile dei file esistenti (ES5, C99 senza float, regole del root `CLAUDE.md`).
