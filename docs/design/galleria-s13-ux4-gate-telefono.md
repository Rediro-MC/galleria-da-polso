# Galleria — UX-4: gate sul telefono (U-18b)

> Consegna dell'utente per il **gate U-18b** (`galleria-s13-ux-casual.md` §6, UX-4): venti prove sul telefono vero
> con la Galleria **0.4.0**, una per volta, ognuna con il suo criterio **pass/fail**. Ogni passo dice **che cosa fa
> l'utente** (telefono/orologio), **che cosa lancia Claude** (comando esatto, file di log), **che cosa ci aspettiamo**
> (con i numeri), **come si decide**, **che cosa fare se va storto** e **quale screenshot** resta. Convenzioni dei
> runbook S8 (`galleria-s8-runbook-android.md`); i risultati vanno in §3 e poi in `apps/galleria/PIANO.md` §8.
>
> `IP` = indirizzo IPv4 del telefono mostrato dall'app Pebble; tutti i comandi si lanciano da
> `~/ProgettiClaude/Pebble/apps/galleria` dopo `. ~/ProgettiClaude/Pebble/tools/pebble-env.sh`. **Mai** `pebble wipe`,
> `pebble kill`, `emu-*`, `insert-pin` verso l'orologio reale.
>
> **Privacy: nel repo non entra nessuna foto personale.** Gli screenshot che finiscono in
> `docs/design/galleria/s13_ux4_*.png` possono mostrare solo le foto del gate o le demo CC0; se l'utente prova con
> foto sue, lo screenshot resta sul suo telefono e la riga di risultato dice «screenshot privato» (precedente del
> 05/09/2026: uno screenshot con una foto personale fu rimosso dal repo, `galleria-s8-risultati.md`).
>
> **19/09/2026**: la **0.4.0 è uscita il 18/09/2026** (tag `v0.4.0`) **senza questo gate** (scelta dell'utente) e il
> titolo nello store è già **«Galleria»** (messo dall'utente dalla dashboard). Il gate resta utile a release uscita;
> di §5 valgono il punto 1 (risultati) e, del punto 3, solo il `PATCH` di `apps/galleria/store/PUBLISH.md` §0.1 per
> la **sola descrizione** (online c'è ancora quella della 0.2.0); i punti 2–3 sono superati e il punto 4 (verifica
> finale) vale per la descrizione nuova. Sono superate anche la domanda 7 di §1.1 e la scelta (a)/(b) di §4: se
> P15 non regge, l'RLE delle maschere va in una release successiva (o il limite «su iPhone fino a N foto» nel
> listing).

## 0. Che cosa si prova e perché

Il gate U-18b chiude la catena UX-1 → UX-2 → UX-3: la pagina delle impostazioni è stata rifatta al banco (emulatore,
Firefox headless, confronti al pixel) ma **non è mai stata toccata con un dito su un telefono vero**. Due cose non si
possono provare al banco:

1. **D59 — l'URL `data:` con 12 foto.** La pagina viaggia dentro l'URL (`data:text/html;charset=utf-8;base64,` +
   pagina + `#` + stato): ad album vuoto **195.223 caratteri su emery**, con 12 foto e miniature **221.703**, fino a
   **292.908** nel caso peggiore (miniature al tetto di 6.000 caratteri l'una). Android ha già aperto 198.455 e
   201.484 caratteri (06/09/2026); **l'iPhone non è mai andato oltre 138.249** (`run_ios_04.log:4`, 2 foto).
2. **I gesti e i tempi veri**: pinch nella cornice, corsie di 28 px e footer fisso sotto il pollice, doppio tocco
   che non deve ingrandire la pagina, i 5 secondi di «Invio all'orologio…», la sync di 12 foto sul PT2 (minuti, non
   secondi), HEIC e foto verticali dalla fotocamera.

| Prova | Che cosa prova | Telefono | Tipo |
|---|---|---|---|
| **P01** | collegamento, firmware dell'orologio, versione dell'app Pebble | Android + iPhone | log |
| **P02** | installazione della 0.4.0, avvio pulito, album conservato | Android + iPhone | log |
| **P03** | prima apertura della pagina: URL «zero», intestazione, ordine delle sezioni | Android + iPhone | log + vista |
| **P04** | «Aggiungi foto» → «Un momento…» → editor; doppio tocco che non zooma | Android + iPhone | vista |
| **P05** | pinch e trascinamento nella cornice; corsie di 28 px | Android + iPhone | vista |
| **P06** | anteprima a 200 px con «12:34» sulla foto appena caricata | Android + iPhone | vista |
| **P07** | «Usa questa foto» dal footer: tessera, messaggio verde, footer che cambia | Android + iPhone | vista |
| **P08** | Salva → chiusura → sync → foto sull'orologio; timer dei 5 s | Android + iPhone | log |
| **P09** | l'ora sul vetro uguale all'anteprima (font, stile, colore, alone) | Android + iPhone | log + vista |
| **P10** | «Esci senza salvare» → «Esci comunque» (e WebView che non si chiude) | Android + iPhone | log + vista |
| **P11** | chiusura dal chrome della WebView con una foto aggiunta | Android + iPhone | log |
| **P12** | ✕ a due tocchi sulle tessere | Android + iPhone | vista |
| **P13** | foto scattata in verticale (EXIF 6/8) | Android + iPhone | vista |
| **P14** | HEIC: si apre oppure «Prova con un'altra foto» | iPhone | vista |
| **P15** | **dodici foto con miniature: l'URL `data:` (D59, la prova decisiva)** | Android + iPhone | log |
| **P16** | Salva vicino al tetto dei 200 KB di iOS (**= lotto 1 di P15**) | iPhone | log + vista |
| **P17** | tema scuro di Android: la pagina non si inverte (G47) | Android | vista |
| **P18** | nomi reali dei pulsanti dell'app Core Devices in it e de (D55) | Android + iPhone | vista |
| **P19** | riapertura dopo la sync: tessere, badge, ordine | Android + iPhone | vista |
| **P20** | una persona non tecnica mette la sua prima foto | uno dei due | vista |

Ordine: **prima Android, poi iPhone** (come in S8); solo sul **Pebble Time 2** (il Pebble 2 Duo reale — O11 — non è
in U-18b). Una prova ❌ non blocca le successive, salvo **P02** (installazione) e **P15 su iPhone**, che decide §4.

**Un orologio, due telefoni.** Galleria tiene l'album **sul telefono** (`localStorage` dell'app Pebble) e a ogni
`HELLO` ogni telefono confronta il suo album con gli slot dell'orologio (`album.js` `plan()`): una foto locale con
CRC diverso nello stesso slot viene **rimandata** (`album.js:588`), gli slot pieni che il telefono non conosce
diventano tessere «solo sull'orologio» (`page_core.js:204`) che contano nel contatore e nel tetto delle 12
(«12 di 12 foto», «Aggiungi foto» grigio con «Massimo 12 foto: togline una per aggiungerne un'altra»:
`page.js:395`, `:414`), e le impostazioni viaggiano se il telefono le ha salvate almeno una volta e il CRC
differisce (`album.js:625-628`). Perciò, dopo P15 su Android, l'iPhone troverebbe 12 tessere «solo
sull'orologio» e P04–P16 non si potrebbero fare. **Passaggio da Android a iPhone (dopo P20 su Android, prima di
P01 su iPhone)**, in questo ordine: (a) dall'Android, pagina delle impostazioni → ✕ due volte su ognuna delle 12
tessere → Salva → nel log `[sync] fine: {… "deletes":["0:OK",…,"11:OK"] …}` e, al riavvio della watchface,
`storage: … valid=0` (12 `ALBUM_DELETE`: secondi, non minuti — il 06/09 due eliminazioni in 1 s,
`run_ios_04.log:17-27`, con 2 foto nel file; con 12 foto ogni eliminazione è una riscrittura del manifest,
`storage.c:502`, cioè una scansione del file da ≈ 0,4–1 s (CLAUDE.md dell'app, «Persist»): stima, non misurata; le foto restano nella libreria del telefono e l'album dell'Android
resta **vuoto**); in
alternativa **rimuovere e reinstallare Galleria** (cancella il persist dell'orologio, ma l'album dell'Android resta
a 12 e le sue foto vengono **rimandate** — minuti — al primo `HELLO` in cui l'Android si ricollega, sopra quelle
dell'iPhone negli stessi slot: scegliere questa via solo se si vuole ritrovare l'album dell'Android a fine gate);
(b) chiudere l'app Pebble sull'Android (o spegnere il suo Bluetooth) e collegare il PT2 all'iPhone (Dev Connection
come in §1.4): due app collegate insieme si contendono l'orologio; (c) l'album dell'iPhone è **vuoto** dal 06/09
(`run_ios_04.log:28-29`: `ALBUM_DELETE` 0 e 1, «0 foto») ma ha le impostazioni salvate (`run_ios_04.log:7`
`settings crc 0xe545` e `:12` «impostazioni no» = salvate e in quel momento uguali all'orologio, che era su layout B,
Francois One, contorno con ombra: `run_ios_02.log:7`): al primo `HELLO` le manda se il CRC dell'orologio è diverso — atteso, e P09 le reimposta.
**Al ritorno sull'Android** vale la stessa regola: con l'album svuotato dall'Android (via a) le foto dell'iPhone
restano e compaiono come «solo sull'orologio»; con la reinstallazione l'Android rimanda le sue 12 (è la lettura più
plausibile del 06/09, il rinvio in sé non è in nessun log: `run_ios_04.log:31` `valid=0` alle 09:53 dopo le eliminazioni
dall'iPhone, poi `run_and_s12_01.log:4,7-8` alle 13:02 l'album dell'Android con 4 foto [0,3,4,5] e gli stessi 4 slot
già validi sull'orologio con «piano: 0 foto»).

## 1. Prima di iniziare

### 1.1 Da chiedere all'utente

1. **Telefoni**: modello e versione di Android, di iOS e delle due app Pebble (dell'iPhone non sono mai stati
   annotati).
2. **Punto di partenza**: l'album dell'orologio si lascia com'è o si svuota prima (✕ su tutte + Salva)? Rimuovere e
   reinstallare Galleria dall'app è ammesso (cancella il persist; le foto tornano dal telefono)?
3. **Foto del gate**: 12 foto personali (e allora gli screenshot delle tessere restano fuori dal repo) oppure quelle
   del banco + le demo CC0 trasferite sul telefono (screenshot pubblicabili)? Servono comunque **una foto scattata
   in verticale** e, sull'iPhone, **una HEIC**.
4. **Lingua tedesca**: si può cambiare per qualche minuto la lingua di sistema dei due telefoni (P18)?
5. **Persona non tecnica** (P20): c'è? quando? su quale telefono?
6. **Pebble 2 Duo reale**: si conferma che il gate è solo sul PT2?
7. **Se l'iPhone non apre 12 foto** (P15): sessione RLE prima della release, oppure 0.4.0 pubblicata con il limite
   «su iPhone fino a N foto» scritto nel listing? (vedi §4)
8. **Chiusura dal chrome della WebView** (P11): la foto non salvata va persa per design; serve una frase nel README
   o nell'Aiuto, o basta il footer verde «tocca Salva…»?
9. **Tempo**: la sync di 12 foto sul PT2 dura minuti (le scritture persist rallentano con il file che cresce): ci
   sono ~20–30 min per telefono?
10. **Versione**: si conferma che il lavoro esce come **0.4.0** (già in `package.json`) e che `pebble publish` e il
    `PATCH` li lancia l'utente dopo il gate (§5)?
11. **Cambio di telefono** (fra P20 su Android e P01 su iPhone, §0): si svuota l'album dall'Android (✕ su tutte
    le 12 + Salva: l'album dell'Android resta vuoto, l'iPhone parte da 0 foto, al ritorno le foto dell'iPhone
    restano «solo sull'orologio») oppure si rimuove e reinstalla Galleria (persist cancellato, l'album
    dell'Android resta a 12 e viene rimandato — minuti — quando l'Android si ricollega, sopra le foto
    dell'iPhone negli stessi slot)? Durante le prove sull'iPhone l'app Pebble dell'Android resta chiusa (o
    Bluetooth spento)?

### 1.2 Prima del gate, al banco (Claude): le misure B1–B9

Sono i numeri con cui le prove si confrontano: **già misurati il 14/09/2026**, `.pbw` del gate compreso (B1).

| # | Che cos'è | Valore atteso / esito |
|---|---|---|
| **B1** | il `.pbw` del gate (già pronto) e la riconferma della build | si installa **`build_s8/galleria_p_0.4.0_ux4.pbw`** (1.088.314 B, 14/09/2026) con gli ELF in `build_s8/p040/{emery,flint}.elf`: `grep versionLabel <(unzip -p build_s8/galleria_p_0.4.0_ux4.pbw appinfo.json)` → **0.4.0**, `companyName` Rediro. Un `pebble clean && pebble build` serve solo a **riconfermare** lo statico (**29.080 B emery / 28.968 B flint**, zero C in UX-4) insieme a B2: **nessun `cp` sopra il `.pbw` del gate**, che non è riproducibile al byte (i `manifest.json` portano il timestamp: la build del 17/09 a sorgenti identici dà 1.088.312 B). Se il `.pbw` mancasse (clone pulito: `build_s8/` non è versionata, `.gitignore:31`), rifare `pebble clean && pebble build`, usare il `.pbw` nuovo e annotarne i byte, sapendo che **non sarà identico** a quello del 14/09 |
| **B2** | suite e pagina | `make -C test` verde (≈ 60 s), `test_page` **2.687 sorgenti / 2.712 inlinato**; `python3 ../../tools/build_config_page.py --check` → pagina **85.476 B** (modulo `config_page.js` 88.284 B; avviso soft 86.016, tetto 98.304) |
| **B3** | URL «zero» (album vuoto) | **195.223 caratteri su emery**, **171.556 su flint** = 36 (prefisso) + **113.968** (pagina in base64) + 1 + stato **81.218 / 57.551**. È lo zero di P03: il telefono deve starci a ±100 caratteri (cambiano solo `dev:false`, `openMs` e lo snapshot dell'orologio) |
| **B4** | URL con 12 foto | **221.703 emery / 198.020 flint** con le miniature vere del gate (1.235–1.887 caratteri l'una); **292.908 / 269.225** con 12 miniature al tetto (6.000 caratteri: caso peggiore). Con 4 foto: **204.033 / 180.361** |
| **B5** | finestra attesa di P15 | con 12 tessere **e** 12 miniature l'URL su emery deve cadere fra **≈ 215.000 e ≈ 295.000**. Sotto 215.000 con 12 tessere = miniature mancanti (rifare); sopra 295.000 = lo stato non è quello previsto (guardare `stato M` nel log) |
| **B6** | riferimenti visivi per P09 | `docs/design/galleria/s12_emery_b_francois_t3d_dark.png` (orologio in emulatore: layout B, Francois One, «contorno con ombra», 1.541 pixel bianchi) e `s13_ux3_preview_editor_dark_b.png` (lo stesso canvas nell'editor): la coppia da mettere accanto allo screenshot dal vetro |
| **B7** | tetto di iOS per P16 | `cap` iOS = **200 KB**, costo della prossima foto = **52 KB** (formato a colori): «Aggiungi foto» si spegne da **kb ≥ 149**. Con miniature grandi la **quarta** foto è bloccata a 3 (≈ 155 KB); con miniature piccole entra (≈ 189–195 KB). Il gate accetta **entrambi** gli esiti |
| **B8** | nomi dei file | log `apps/galleria/run_s13_ux4_<and\|ios>_<NN>.log` (ignorati da git: `.gitignore:5` `apps/*/*.log`), riepiloghi con `python3 ../../tools/galleria_logstats.py --md run_s13_ux4_*.log`; screenshot in `docs/design/galleria/s13_ux4_*.png` (i nomi sono nella riga «Screenshot» di ogni prova) |
| **B9** | ordine | Android prima, poi iPhone; solo sul PT2 |

### 1.3 Le foto del gate

Dodici foto sul telefono, miste (scure, chiare, un volto, un cielo, un paesaggio con dettagli fini), fra cui **una
scattata in verticale** con la fotocamera (EXIF orientation 6/8, non un file già ruotato) e, sull'iPhone, **una
HEIC** (Impostazioni → Fotocamera → Formati → «Alta efficienza»). Le foto del banco sono in
`~/galleria-gate/photos/`: **sei JPEG** (`dark_portrait.jpg` serve a P09, `light_landscape.jpg`, `mid_landscape.jpg`,
`red_exif6.jpg` ha già orientation 6, `tiny.jpg`, `big_12mp.jpg`) **più `alpha.png`** (PNG con trasparenza, 1.541 B).
Le due demo CC0 sono i JPEG sorgente `~/galleria-gate/s9/src/d10_lauklines.jpg` e `b06_bryce.jpg` (nel repo ci sono
solo i `.raw6`/`.raw1`: `apps/galleria/resources/photos/README.md`). Vanno copiate sul telefono prima di cominciare
**come nel §0 punto 5 di `galleria-s8-runbook-android.md`**: cavo dal PC Windows, cloud/e-mail, oppure
`adb push ~/galleria-gate/photos/ /sdcard/Download/GalleriaGate/` se si usa la via B.
**Nessuna foto personale entra nel repo**, né come file né dentro uno screenshot.

### 1.4 Collegamento (la prima via che funziona)

| Via | L'utente fa | Claude lancia | Ci aspettiamo | Se va storto |
|---|---|---|---|---|
| **A — LAN** (consigliata) | App Pebble: ⚙ Settings → Connectivity → **«Use LAN developer connection»** ON; scheda dell'orologio → **⋯ → «Dev Connection»** ON; legge l'**IP** e lo detta; app in primo piano, schermo acceso. Questo è il percorso dell'app **Android**; sull'**iPhone**, come il 06/09 (`galleria-s8-runbook-android.md` §4): scheda dell'orologio → **⋯ → «Dev Connection»** ON, con l'IP che dovrebbe comparire nella stessa schermata come su Android (il 06/09 `--phone <IP>` ha funzionato, `galleria-s8-risultati.md:184`, ma dove si legge l'IP non è annotato: da verificare sul telefono); se la LAN non risponde → via C | `pebble ping --phone $IP` | `Pong!` | `Connection refused`/timeout: ricontrollare i due interruttori e l'IP (cambia a ogni riconnessione Wi‑Fi); spegnere e riaccendere «Dev Connection»; se il router isola i client Wi‑Fi → via C |
| **B — adb wireless** (solo Android, app ≥ 1.10.0) | Opzioni sviluppatore → Debug wireless → «Accoppia dispositivo con codice»: detta IP:porta di accoppiamento e il codice; poi IP:porta di **connessione** (porta diversa) | `adb pair IP:PORTA CODICE` → `adb connect IP:PORTA` → `adb devices` → `pebble ping --adb` | `Successfully paired`, `connected to …`, `Pong!` | `failed to authenticate`: porte scambiate; `offline`: sbloccare lo schermo e riconnettere; la porta di connessione cambia a ogni riattivazione |
| **C — CloudPebble** | «Dev Connection» ON **senza** il LAN; telefono anche in 4G | `pebble login` (o `pebble login --no-open-browser`) → `pebble ping --cloudpebble` | `CloudPebble proxy authentication succeeded.` … `Pong!` | verifica con `pebble login --status`; mai incollare token in riga di comando |

**Attenzione (`--phone` senza IP = CloudPebble)**: l'IP va sempre scritto.

**iPhone: la Dev Connection cade spesso** (dopo la chiusura della pagina, con l'app in secondo piano, al cambio di
watchface). I log si prendono con un ciclo di ritentativi, già usato il 06/09:

```bash
while :; do
  timeout -s INT 900 pebble logs --phone $IP >> run_s13_ux4_ios_<NN>.log 2>&1
  sleep 5
done
```

Il ciclo non si ferma da solo (anche un `pebble logs` **riuscito** scade dopo 900 s): lo si chiude con **Ctrl-C** a
prova finita. I `Connection refused` ripetuti dentro il file sono normali.

### 1.5 Regole comuni

- **Il log parte prima della pagina**: `timeout -s INT 900 pebble logs --phone $IP > run_s13_ux4_<tel>_<NN>.log 2>&1`
  (exit code 124 normale; **sempre `-s INT`**: con SIGTERM il log shipping resta acceso). **`<tel>` = `and`
  (Android) o `ios` (iPhone)** — la forma `<and|ios>` di B8 e dei nomi degli screenshot — e **`<NN>` = il numero
  della prova che *chiude* l'apertura della pagina**, secondo la tabella qui sotto (una sola apertura può coprire
  più prove: il log non si riattacca a ogni prova).

| Apertura della pagina | File di log | Prove che ci stanno dentro |
|---|---|---|
| P03 | `run_s13_ux4_<tel>_03.log` | P03 |
| P04 (**il log si attacca prima di P04**) | `run_s13_ux4_<tel>_08.log` | P04, P05, P06, P07, P08: una sola apertura (editor in P04–P07, «Salva» che chiude in P08) |
| P09 | `run_s13_ux4_<tel>_09.log` | P09 |
| P10 | `run_s13_ux4_<tel>_10.log` | P10 |
| P11 (compresa la riapertura in coda a P11) | `run_s13_ux4_<tel>_11.log` | P11 e P12 (P12 lavora sulla pagina riaperta a fine P11 e la chiude con «Esci comunque») |
| P13, P14 | facoltativi (`..._13.log`, `..._14.log`): sono prove «a vista», nessun `grep` | P13, P14 |
| P15, per tutta la durata (tutti i lotti; su iPhone il ciclo di §1.4, che *appende* a un solo file) | `run_s13_ux4_<tel>_15.log` (i `grep` usano il glob `_15*.log`) | P15 **e P16**: P16 è il **lotto 1 di P15** e non ha un log proprio |
| P19 | `run_s13_ux4_<tel>_19.log` | P19 |
| P20 | `run_s13_ux4_<tel>_20.log` | P20 |

P01 non ha log; P02 ha i suoi due file (`..._02.log` dell'install e `..._02b.log` del riavvio, §2 P02) e non è
un'apertura della pagina. I `run_*.log` **non sono versionati** (`.gitignore:5`): stanno solo nella cartella di lavoro.

- `pebble install --logs` aggancia i log **dopo** l'installazione: per vedere l'avvio, con `pebble logs` già
  attaccato **riavviare la watchface** dall'orologio (Select → Watchfaces → un'altra → Select → Watchfaces →
  Galleria). Su/Giù da una watchface non cambiano watchface: aprono la timeline.
- Nei comandi `pebble install` il `.pbw` viene **prima** delle opzioni. **Con la pagina aperta non si tocca
  l'orologio** (pulsanti, altra watchface, installazioni): l'app la chiude e le foto preparate vanno perse.
- L'app perde le righe JavaScript quando arrivano a raffica (canale da 2 righe): le `[sync] chunk … ack` non sono
  affidabili. Contano `sync: end` e `photo:` dell'orologio e, per la pagina, `[config]`, `[album] payload`,
  `[sync] fine`.
- Screenshot dell'orologio: `pebble screenshot --phone $IP --no-open ../../docs/design/galleria/s13_ux4_<nome>_<and\|ios>.png`
  (via BLE: 10–30 s; `AlreadyInProgress` → aspettare 30 s). Screenshot della pagina e dell'app: dal telefono, poi
  copiati in `docs/design/galleria/` con il nome indicato nella prova.
- Le frasi fra « » sono i testi italiani di oggi di `apps/galleria/i18n/messages.json`.
- Ogni prova si chiude compilando la sua riga in §3.

## 2. Le prove

### P01 — Collegamento, firmware, versione dell'app Pebble (Android + iPhone)
| | |
|---|---|
| L'utente fa | §1.4: «Use LAN developer connection» ON, «Dev Connection» ON sulla scheda dell'orologio, detta l'**IP**; annota **modello del telefono, versione di Android/iOS, versione dell'app Pebble** (per l'iPhone non sono mai state annotate). |
| Claude lancia | `pebble ping --phone $IP` ; `grep -i watchversion <(pebble ping --phone $IP -vvv 2>&1)` |
| Ci aspettiamo | `Pong!`; `WatchVersion(... version_tag=v4.36.2 ...)` o più recente. |
| Criterio | **PASS** = `Pong!` e firmware **≥ 4.32** (l'app è costruita con l'SDK 4.33.1). **FAIL** = `Connection refused` dopo 3 tentativi con i due interruttori ricontrollati → via C. |
| Se va storto | §1.4 (IP cambiato, isolamento dei client Wi‑Fi, interruttore spento e riacceso). Firmware < 4.32: aggiornare l'orologio dall'app prima di continuare. |
| Screenshot | nessuno |

### P02 — Installazione della 0.4.0 e avvio pulito (Android + iPhone)
| | |
|---|---|
| L'utente fa | Niente durante l'installazione (alla fine l'orologio passa da solo a Galleria); poi, quando Claude lo dice, **riavvia la watchface** (Select → Watchfaces → un'altra → Select → Watchfaces → Galleria). Nell'app Pebble apre la scheda di Galleria e legge la **versione**: deve dire 0.4.0. |
| Claude lancia | `timeout -s INT 300 pebble install build_s8/galleria_p_0.4.0_ux4.pbw --phone $IP --logs > run_s13_ux4_<tel>_02.log 2>&1`; poi, **dopo `App install succeeded.`** (Ctrl-C sull'install, oppure aspettandone l'uscita: due client sulla stessa Dev Connection sono un'ipotesi **non verificata**, `apps/galleria/PIANO.md` §7.1, punto (a) di «S8 prep (30/08/2026), ipotesi del runbook NON verificate senza telefono»), `timeout -s INT 600 pebble logs --phone $IP > run_s13_ux4_<tel>_02b.log 2>&1` e il riavvio della watchface. |
| Ci aspettiamo | `Installing app...`, `App install succeeded.`; al riavvio `heap main: used= free=`, `watch: fw 4.36.2 model=11`, `batt: N% chg= plug= up N min`, `storage: quota=1048576 album=1 schema=2 manifest=persist valid=k` (k = le foto già sull'orologio, **conservate** dalla 0.2.0: stesso UUID), `settings: persist layout= font= sty= interval= order= shake= lang=`, `luma(photo): …`, `heap after first render: used= free=`, `[album] pronto (telefono): …`, `[sync] JS_READY`, `[sync] HELLO proto=1 maxChunk=4096 open=NNNms slots=…`, `[album] piano: …`, `[sync] fine: {…}`. **Il `free` si confronta con il riferimento del layout attivo**: in layout A **≥ 40.000** (42.476 misurati sul vetro in S8b con layout A + demo, `run_ios_01.log:15`; con lo statico della 0.4.0 — 29.080 B contro i 28.800 della 0.2.0, cioè 280 B in meno di heap totale — l'atteso è ≈ 42.200), mentre **in layout B il valore è più basso per design** (D28, `docs/design/galleria.md` §2; `docs/design/galleria-s8-risultati.md:192`): sul vetro **36.900** con Francois One (`run_ios_02.log:16`, `settings: persist layout=1 font=4 sty=2`) e **38.580** a regime con Anton, cioè ≈ 36.600–38.300 con la 0.4.0 — **non è un FAIL**. Sull'iPhone, dopo il cambio di telefono di §0: `valid=0`, `[album] piano: 0 foto, 0 eliminazioni, ordine no, impostazioni si'` (`si'` se il CRC delle impostazioni dell'orologio è diverso da quelle salvate sull'iPhone il 06/09: le rimanda, ed è atteso). |
| Criterio | **PASS** = installazione riuscita, **0.4.0** nella scheda dell'app (se l'app la mostra; altrimenti fa fede il `versionLabel 0.4.0` di B1), avvio con le righe sopra (**heap: confrontare `free` con il riferimento del layout attivo** — A ≈ 42.200, B ≈ 36.600 con Francois One / ≈ 38.300 con Anton —, non con i 40.000 di O1), nessun `ERROR`/`WARNING`/`App fault`, foto e impostazioni di prima conservate (`valid=k` invariato — sull'Android; sull'iPhone k = 0 dopo lo svuotamento di §0, e dopo il primo `HELLO` le impostazioni dell'orologio possono essere quelle dell'iPhone —, `settings: persist` con i valori dell'utente). **FAIL** = `App install failed`, `Incompatible SDK`, `quota=4096` o `album=0`, `crc MISMATCH`, album perso, oppure `free` molto sotto il riferimento del layout attivo insieme a un `ERROR` di allocazione o a un `App fault`. |
| Se va storto | installazione fallita o oltre i 300 s: schermo del telefono acceso, orologio vicino, ripetere. `App fault`: conservare il log e l'ELF `build_s8/p040/`. Album perso (non atteso, stesso UUID): annotare e **fermarsi**. |
| Screenshot | `s13_ux4_watch_start_<and\|ios>.png` (`pebble screenshot`) |

### P03 — Prima apertura della pagina: URL «zero» e intestazione (Android + iPhone)
| | |
|---|---|
| L'utente fa | App Pebble → Galleria → **Impostazioni** (⚙). Guarda l'intestazione: «Galleria», «Pebble Time 2», nessun contatore di KB, nessun riquadro giallo; «Le tue foto» con **«Aggiungi foto»** blu in cima e, con 0 foto (sull'iPhone sempre, dopo il cambio di telefono di §0), «Senza foto tue, l'orologio mostra 2 foto di esempio: spariscono quando arriva la tua prima foto. Ne puoi mettere fino a 12.». Scorre tutta la pagina: «Cambio foto» → «Impostazioni» → «Aspetto dell'ora» → «Anteprima» → «Lingua (pagina e data)» → «Altre impostazioni» chiuso (aperto da solo se una delle sue voci non è al valore automatico: non è un errore) → «Aiuto». Footer fisso «Salva» / «Chiudi». Poi tocca **«Chiudi»**. |
| Claude lancia | log attaccato (§1.5); `grep -E '\[config\]' run_s13_ux4_<tel>_03.log` |
| Ci aspettiamo | `[config] lang auto=it (watch it_IT)`; `[config] masks emery: 5 font, 45 glifi + 60 larghezze, N car. di bit`; `[config] apro la pagina (URL N car., stato M)` con **N = 195.223 ± 100 a 0 foto** su emery (ogni foto già in album aggiunge ≈ 180 caratteri più la miniatura); la pagina compare **entro 10 s**; alla chiusura `[config] pagina chiusa: risposta di 0 car. dopo T ms` e `[config] pagina chiusa senza modifiche`. Sull'iPhone finora si era arrivati a 138.249 caratteri: qui sono ≈ 195 k, ed è già il primo passo di D59. |
| Criterio | **PASS** = pagina a video, N annotato nella finestra attesa, intestazione e ordine delle sezioni come in S13 §3, footer «Salva» / «Chiudi» fisso in fondo allo schermo mentre si scorre e raggiungibile col pollice, «Chiudi» che chiude con `senza modifiche`. **FAIL** = pagina bianca, errore dell'app, o `apro la pagina` senza che la pagina compaia (iPhone: passare subito a §4, la ricerca della soglia). |
| Se va storto | annotare tempo di attesa, versione dell'app e che cosa mostra la WebView (bianco, errore, spinner). iPhone che non apre 195 k → §4 (bisezione) e sessione RLE. |
| Screenshot | `s13_ux4_page_top_<and\|ios>.png` |

### P04 — «Aggiungi foto» → «Un momento…» → editor; doppio tocco (Android + iPhone)
| | |
|---|---|
| L'utente fa | Riapre la pagina (app Pebble → Galleria → **Impostazioni**) e tocca **«Aggiungi foto»** → selettore del telefono (Android: File/Galleria; iPhone: Libreria foto) → una foto del gate (es. `mid_landscape.jpg`). Guarda il pulsante mentre carica. Poi, con l'editor aperto, prova un **doppio tocco veloce** su un pulsante (es. «Riparti da capo») e, dopo P07, su ▲ di una tessera. |
| Claude lancia | nulla (prova a vista); il log `run_s13_ux4_<tel>_08.log` deve essere **già attaccato** (§1.5): la pagina che si apre qui si chiude in P08 |
| Ci aspettiamo | il pulsante diventa grigio **«Un momento…»** e il footer dice **«caricamento di \<nome\>…»**; poi la pagina scorre da sola all'editor **«Ritaglio»** con la cornice; il doppio tocco **non ingrandisce la pagina** (`touch-action: manipulation`, `page.css:210`) e vale come due tocchi. |
| Criterio | **PASS** = stato di caricamento visibile (anche per un istante), editor aperto con lo scroll automatico, nessuno zoom della pagina al doppio tocco. **FAIL** = la pagina zooma al doppio tocco; «Un momento…» che resta senza esito entro 30 s; «Impossibile aprire …» su una JPEG normale. |
| Se va storto | zoom al doppio tocco = la WebView ignora `touch-action`: l'unica leva sarebbe `user-scalable=no` nel viewport (costo di accessibilità, decisione dell'utente, **non** in UX-4). Caricamento senza esito: annotare telefono e dimensione della foto (12 Mpx?) e riprovare con `tiny.jpg`. |
| Screenshot | `s13_ux4_loading_<and\|ios>.png` (se si fa in tempo) |

### P05 — Pinch e trascinamento nella cornice; corsie di 28 px (Android + iPhone)
| | |
|---|---|
| L'utente fa | Nell'editor: **un dito** dentro la cornice sposta la foto; **due dita** ingrandiscono o riducono (pinch) e poi trascinano; **un dito nella corsia** bianca a destra o a sinistra della cornice fa scorrere la pagina; il cursore **«Zoom»** cambia l'ingrandimento; **«Riparti da capo»** ricentra. Telefono in verticale. |
| Claude lancia | nulla |
| Ci aspettiamo | dentro la cornice la pagina **non scorre** (`touch-action: none`, `page.css:163`) e la foto segue il dito, come dice «Trascina per spostare, due dita per ingrandire o ridurre.»; il pinch ingrandisce **la foto, non la pagina**, attorno al punto fra le dita; nelle corsie la pagina scorre senza muovere la foto; la cornice è larga ≈ 300 px (meno su schermi corti) e sta tutta sopra il footer. |
| Criterio | **PASS** = i quattro gesti fanno quello che dice l'istruzione, nessuno scroll accidentale con il dito nella cornice, scroll possibile dalle corsie. **FAIL** = la pagina scorre mentre si trascina la foto, il pinch zooma la pagina, o la cornice esce dallo schermo / finisce sotto il footer. |
| Se va storto | annotare telefono e gesto; il ripiego `preventDefault` su `touchmove` è già nel codice: se non basta è un finding per una sessione successiva. |
| Screenshot | `s13_ux4_editor_<and\|ios>.png` (cornice, corsie, Zoom e anteprima nella stessa schermata) |

### P06 — Anteprima a 200 px con «12:34» sulla foto appena caricata (Android + iPhone)
| | |
|---|---|
| L'utente fa | Sotto la cornice guarda il canvas con la didascalia **«Così si vede sull'orologio»**: sposta la foto e osserva; poi, sempre con l'editor aperto, scorre ad **«Aspetto dell'ora»** e cambia **Font** (frecce ‹ ›) e **«Stile cifre»** («solo contorno»), con **«Colore dell'ora»** su «automatico (dalla foto)». |
| Claude lancia | nulla |
| Ci aspettiamo | canvas di 200 px con la foto ditherata e «12:34» nel font, stile e colore scelti, **nitido** (pixel visibili, non sfocato), che segue il ritaglio **entro ~0,5 s** dal rilascio del dito (debounce 150 ms + render); cambiando font o stile si ridisegna subito; con «Font di sistema (solo Ora in alto)» compare la sola foto e la nota «Font di sistema: qui non si vedono, sull'orologio sì». |
| Criterio | **PASS** = anteprima presente, aggiornata e coerente con le scelte, didascalia «Così si vede sull'orologio». **FAIL** = «Anteprima non aggiornata: vale il ritaglio nella cornice», «Anteprima non disponibile», canvas vuoto o sfocato, ritardo > 2 s. |
| Se va storto | «Anteprima non aggiornata» = eccezione nel render (memoria del canvas su WebView vecchie?): annotare telefono e foto, riprovare con `tiny.jpg`. Sfocatura = `image-rendering: pixelated` ignorato: solo cosmetico, annotare. |
| Screenshot | quello di P05, più `s13_ux4_editor_font_<and\|ios>.png` con Francois One e «contorno con ombra» (serve a P09) |

### P07 — «Usa questa foto» dal footer: tessera, messaggio verde, footer (Android + iPhone)
| | |
|---|---|
| L'utente fa | Con l'editor aperto legge il **footer**: deve dire **«Usa questa foto»** (blu) e **«Non aggiungere»** (sotto la cornice la coppia di pulsanti **non c'è**: D119). Tocca «Usa questa foto». Poi ripete con una seconda foto e tocca **«Non aggiungere»**. |
| Claude lancia | nulla |
| Ci aspettiamo | l'editor si chiude, la pagina **scorre alla tessera nuova** (badge «da salvare», nome su due righe, ▲ ▼ affiancati e ✕ sotto), il footer diventa verde **«Foto aggiunta: tocca Salva per inviarla all'orologio»** con sotto la riga grigia **«Dopo Salva, le foto passano all'orologio una alla volta: tieni aperta l'app Pebble»**, pulsanti «Salva» / «Esci senza salvare»; il contatore sale di uno («k+1 di 12 foto»); l'Anteprima in fondo mostra la stessa foto con la didascalia «\<nome\>: così si vede con l'ora (12:34 è solo un esempio)». Con «Non aggiungere»: editor chiuso, **«Foto non aggiunta»**, scroll ad «Aggiungi foto», contatore invariato. |
| Criterio | **PASS** = tutto quanto sopra, in particolare lo scroll alla tessera e i due testi del footer. **FAIL** = pagina ferma dopo la chiusura dell'editor (nessuno scroll), messaggio mancante, footer ancora «Usa questa foto». Tessera senza miniatura su una JPEG normale («Foto aggiunta (senza miniatura): …»): annotare, non blocca. |
| Se va storto | nessuno scroll = `scrollIntoView` ignorato dalla WebView (già protetto da try/catch): annotare. Il resto sono difetti veri da riportare. |
| Screenshot | `s13_ux4_after_add_<and\|ios>.png` |

### P08 — Salva → sync → foto sull'orologio; timer dei 5 s (Android + iPhone)
| | |
|---|---|
| L'utente fa | Tocca **«Salva»**. Guarda: il footer dice **«Invio all'orologio…»**, Salva si spegne, la pagina si chiude da sola. Poi guarda l'orologio: icona di sync e «1/1», poi la foto nuova. **Tiene l'app Pebble in primo piano** finché la foto non è arrivata. Se la pagina **non** si chiude entro 5 s: annotarlo e guardare se «Salva» torna toccabile. |
| Claude lancia | log attaccato; `grep -E -e '\[config\]' -e '\[album\] payload' -e 'sync: end' -e 'photo: slot' -e '\[sync\] fine' run_s13_ux4_<tel>_08.log` |
| Ci aspettiamo | `[config] pagina chiusa: risposta di N car. dopo T ms` con **N ≈ 47.000–52.000** per una foto con miniatura (49.806 e 49.327 su iPhone, 48.095 su Android in S12); `[album] payload delta: ok, cambiato true, nuove [k] aggiornate [] eliminate []`; `[config] payload applicato in N ms` con **N ≤ 100** (6–18 misurati; soglia di allarme 5 s); `[sync] JS_READY` → `sync: msg=1 f= -> act= out=2 code= off= st= heap` (JS_READY ricevuto → HELLO spedito) → PHOTO_BEGIN → 9 PHOTO_DATA silenziosi → `sync: end s=<slot> c=0 n=9 commit C photo P ch max M avg A heap H` con **P ≈ 3–15 s** → `[sync] fine: {"photosOk":1,…}`; sull'orologio `photo: slot k persist crc ok 134 ch N ms heap u/f`. |
| Criterio | **PASS** = chiusura automatica entro 5 s, `payload applicato`, `sync: end` con `c=0`, `photosOk:1`, foto sul vetro senza riavvio. **FAIL** = `pagina chiusa: risposta di 0 car.` dopo Salva, `risposta della pagina non valida`, `sync: 30 s idle -> IDLE` senza ripresa entro 2 min, `crc MISMATCH`. Sul timer: se la pagina resta aperta, è PASS **solo** se dopo 5 s «Salva» è di nuovo toccabile con «Invio all'orologio…» ancora a video, e un secondo Salva ripete l'invio. |
| Se va storto | risposta di 0 caratteri = limite del close URL (annotare N atteso); `idle -> IDLE` = telefono lontano o app in secondo piano (su iOS l'app deve stare in primo piano); ripresa oltre 2 min = backoff da accorciare. |
| Screenshot | `s13_ux4_watch_sync_<and\|ios>.png` durante la sync (icona + «1/1»), `s13_ux4_watch_photo_<and\|ios>.png` dopo |

### P09 — L'ora sull'orologio come nell'anteprima (Android + iPhone, sul PT2)
| | |
|---|---|
| L'utente fa | **Riapre la pagina** (app Pebble → Galleria → **Impostazioni**: P08 l'ha chiusa da sola con «Salva») e **aggiunge la foto del confronto**: «Aggiungi foto» → `dark_portrait.jpg` → **«Usa questa foto»**. (L'Anteprima disegna **solo le foto aggiunte in questa apertura** — D47, `page.js:421-423`: su una pagina appena riaperta la didascalia dice «Aggiungi una foto e la vedrai qui con l'ora: quelle già presenti no»; con **una sola** foto nuova l'occhio 👁 non compare e l'anteprima mostra quella, con **due o più** si sceglie con l'occhio 👁 sulla tessera.) Poi scorre ad «Aspetto dell'ora» e sceglie **Disposizione «Ora grande, senza info»**, **Font** Francois One, **«Stile cifre» «contorno con ombra»**, **«Colore dell'ora» «automatico (dalla foto)»**; legge la nota sotto l'anteprima **«Colore automatico: bianco/nero · bordo di contrasto: sì/no»**; fa lo screenshot del telefono con l'anteprima a video; **Salva**. Dopo la sync guarda l'orologio: con due foto in elenco la rotazione (sequenziale, ogni 30 min) può tenere a video la vecchia, quindi se sul vetro c'è l'altra foto **scuote il polso** finché compare `dark_portrait.jpg` (la scossa è accesa di fabbrica). Alla fine di P09 l'album ha due foto (`mid_landscape.jpg` + `dark_portrait.jpg`): va bene per P10–P19. |
| Claude lancia | dopo la sync: `pebble screenshot --phone $IP --no-open ../../docs/design/galleria/s13_ux4_watch_b_francois_<and\|ios>.png`; `grep -E -e 'luma\(' -e 'rot\(' -e 'photo: slot' -e 'sync: msg=10' -e 'sync: end' run_s13_ux4_<tel>_09.log` (**non** `settings: ` né `ui_time:`: in questo log non compaiono, vedi «Ci aspettiamo»; `luma\(` prende `luma(photo)`, `luma(band)` e `luma(style)`) |
| Ci aspettiamo | sul vetro la stessa foto con l'ora in Francois One, contorno con ombra, nello stesso punto e dello stesso colore dell'anteprima; nel log la riga del colore `luma(<perché>): m= b= h= ph= w= bad=(w/b) mean= fg=ff\|c0 halo=0\|1` d'accordo con la nota della pagina (bianco = `fg=ff`, nero = `fg=c0`, «bordo di contrasto: sì» = `halo=1`), con `m=2` (layout B con le sprite). Il `SETTINGS` viaggia **prima** della foto (`sync.js:223` contro `:267`): `luma(band)` e `luma(style)` sono calcolate sulla foto ancora a video, `luma(photo)` su quella nuova. Il `<perché>` è **`band`** per le impostazioni arrivate senza cambio di foto — Disposizione e font passano da `ui_time_layout_changed`, che chiama `ui_time_band_changed` (`sync.c:440-441`, `ui_time.c:1067-1073`), mentre stile, colore e bordo da soli danno `luma(style)` (`sync.c:442-443`) — e **`photo`** quando a video arriva la foto nuova, insieme a `rot(album\|sync): … slot=k` a fine sync oppure `rot(shake): … slot=k` dopo la scossa (`model.c:108`, `:240`, `:262`, `:274`); più `photo: slot k persist crc ok … ch N ms heap u/f` della foto ricevuta. Le impostazioni applicate **senza riavvio** si leggono da `sync: msg=10 f= -> act= out=8 code=0 off= st= heap` (messaggio SETTINGS accettato, `sync.c:388`) e dalla riga `luma(…)` che il cambio provoca: **non** cercare `settings: persist …` né `ui_time: … lay= font= sty=`, che sono scritte solo all'avvio (`settings.c:103` in `settings_init()`, `ui_time.c:932` in `ui_time_init()`) e dove i valori scelti si rileggono solo dopo un riavvio della watchface (layout B = `lay=1`, Francois One = **`font=4`**, contorno con ombra = `sty=2`). Il confronto al pixel è già stato fatto in emulatore (B6): qui basta l'occhio più l'accordo colore/alone. |
| Criterio | **PASS** = la foto nuova a video (se serve portata a video con una scossa), font, stile, posizione e colore uguali all'anteprima; `fg`/`halo` della riga `luma(photo)` di `dark_portrait.jpg` — la foto dell'anteprima, a freddo come nella pagina; **non** `luma(band)`, che vale per la foto ancora a video e con l'isteresi — uguali alla nota della pagina. **FAIL** = colore o alone diversi (divergenza fra `luma.c` e `preview.js`), cifre in un altro font o stile, impostazioni non applicate (nessun `sync: msg=10 … code=0` — ma se la pagina manda le stesse impostazioni che l'orologio ha già, il telefono non spedisce `SETTINGS` (`album.js:626-628`) e la riga manca senza che sia un FAIL: P06/P08 lasciano l'orologio su «solo contorno», quindi qui il blob parte —, oppure `code=3` = blob rifiutato, oppure nessuna riga `luma(band)`/`luma(style)` dopo il cambio). |
| Se va storto | divergenza di colore: conservare foto e log (`luma(photo)` con `mean=` e `bad=`) per il confronto al banco con `preview.js`: sarebbe un difetto di S12, non di UX-4. |
| Screenshot | `s13_ux4_watch_b_francois_<and\|ios>.png` (vetro) + `s13_ux4_preview_b_francois_<and\|ios>.png` (pagina) |

### P10 — «Esci senza salvare» → «Esci comunque» (Android + iPhone)
| | |
|---|---|
| L'utente fa | Riapre la pagina e cambia una cosa (es. la casella **«Scuoti il polso per cambiare foto»**). Il footer dice «Salva» / **«Esci senza salvare»** e la riga grigia **«Modifiche da salvare: tocca Salva per inviarle all'orologio»**. Tocca «Esci senza salvare» **una volta**: il pulsante diventa **rosso «Esci comunque»** e compare **«Modifiche non salvate: tocca di nuovo per uscire senza salvare»**. Cambia un'altra impostazione: il pulsante torna «Esci senza salvare» e l'avviso sparisce. Tocca di nuovo «Esci senza salvare» e poi **«Esci comunque»**. |
| Claude lancia | log; `grep -E 'pagina chiusa' run_s13_ux4_<tel>_10.log` |
| Ci aspettiamo | `[config] pagina chiusa: risposta di 0 car. dopo T ms` e `[config] pagina chiusa senza modifiche`; nessuna sync; alla riapertura la casella è com'era. **Se la WebView non si chiude** al secondo tocco, il pulsante deve tornare **«Esci senza salvare»** (non restare rosso) e un altro tocco lo riarma. |
| Criterio | **PASS** = due tocchi necessari, disarmo su modifica, chiusura con `senza modifiche`, impostazione non applicata. **FAIL** = uscita al primo tocco, pulsante rosso che resta dopo una chiusura mancata, o `payload applicato` dopo «Esci comunque». |
| Se va storto | WebView che ignora `pebblejs://close#` vuoto: annotare (su iOS il ritorno da 218 caratteri ha funzionato il 06/09). |
| Screenshot | `s13_ux4_exit_armed_<and\|ios>.png` |

### P11 — Chiusura dal chrome della WebView con una foto aggiunta (Android + iPhone)
| | |
|---|---|
| L'utente fa | Riapre la pagina, aggiunge una foto («Usa questa foto», footer verde) e **non** tocca Salva: chiude con il controllo della WebView — iPhone: il pulsante in alto (annotare il testo reale: «Done»/«Fine»/«Chiudi»); Android: il tasto indietro di sistema o la ✕/freccia nella barra. Poi riapre la pagina e conta le foto. |
| Claude lancia | log; `grep -E -e '\[config\]' -e '\[album\]' run_s13_ux4_<tel>_11.log` |
| Ci aspettiamo | o `[config] pagina chiusa: risposta di 0 car. dopo T ms` con `pagina chiusa senza modifiche`, oppure **nessuna riga** (l'app non emette `webviewclosed`): annotare quale dei due. **Mai** `payload applicato`; nessuna sync; alla riapertura il contatore è quello di prima, cioè **la foto aggiunta è persa** (la pagina non ha `localStorage`: D1). Finché non si tocca Salva il payload non esiste: non c'è niente di «parziale» da applicare. |
| Criterio | **PASS** = nessun `payload applicato`, album del telefono e dell'orologio intatti (`[album] pronto` con lo stesso riepilogo, nessun `ERROR`), app che non si blocca. **FAIL** = `payload applicato` con foto o impostazioni che l'utente non ha salvato, `risposta della pagina non valida` (anche se viene ignorata: annotare), o app bloccata. |
| Se va storto | la perdita è **attesa**: resta da decidere (§1.1 domanda 8) se il README o l'Aiuto devono dirlo. Un blocco dell'app va riportato con la versione. |
| Screenshot | `s13_ux4_chrome_close_<and\|ios>.png` (il controllo con cui si chiude, per annotarne il nome) |

### P12 — ✕ a due tocchi sulle tessere (Android + iPhone)
| | |
|---|---|
| L'utente fa | Su una tessera tocca **✕**: diventa rossa e il footer dice **«Tocca di nuovo ✕ per togliere Foto N»**. Tocca ▲ di un'altra tessera (o cambia un'impostazione): la ✕ si **disarma**. Poi **aggiunge `tiny.jpg`** («Aggiungi foto» → «Usa questa foto»: a questo punto nessuna tessera è «da salvare», P11 ha perso la sua) e tocca ✕ due volte di fila **su quella tessera** → **«Foto nuova tolta»**; poi ✕ due volte su una tessera **già sull'orologio** → **«Foto tolta: sparirà dall'orologio quando salvi»**. Poi **«Esci senza salvare» → «Esci comunque»** (come P10): la foto tolta **non deve arrivare a un Salva**, perché un ripristino non c'è (`page.js:373`: il secondo tocco la mette in `G.deleted`, nessun ritorno indietro; «Ripristina» è D52 (b), futura). Per provare la rimozione vera usare una foto del gate e riaggiungerla dopo. |
| Claude lancia | nulla |
| Ci aspettiamo | due tocchi sempre necessari; disarmo con qualunque altra azione (frecce, aggiunta, apertura dell'editor, impostazioni, lingua, occhio); nessuna finestra di conferma. |
| Criterio | **PASS** = nessuna eliminazione al primo tocco, disarmo che funziona, messaggio giusto per i due casi. **FAIL** = eliminazione al primo tocco, o ✕ che resta rossa dopo un'altra azione. Osservazione (non pass/fail): se durante P20 qualcuno toglie una foto per sbaglio, D52 (b) «Ripristina» torna in tavola. |
| Se va storto | riportare con il modello del telefono; D52 (b) è la riserva già decisa. |
| Screenshot | `s13_ux4_del_armed_<and\|ios>.png` |

### P13 — Foto scattata in verticale, EXIF orientation 6/8 (Android + iPhone)
| | |
|---|---|
| L'utente fa | (pagina riaperta dopo P12) «Aggiungi foto» → una foto **scattata in verticale con la fotocamera del telefono** (non un file già ruotato): sull'iPhone dalla Libreria, su Android da Fotocamera/Galleria. Guarda la cornice e l'anteprima; dopo Salva guarda il vetro. |
| Claude lancia | nulla (prova a vista) |
| Ci aspettiamo | foto **dritta** nella cornice, nell'anteprima e sull'orologio (`createImageBitmap(file, { imageOrientation: 'from-image' })`, `page.js:631`, con ripiego `<img>` che applica l'EXIF da solo sui browser di oggi). |
| Criterio | **PASS** = dritta in tutti e tre. **FAIL** = ruotata di 90° o 180° in uno dei tre: annotare **quale** (cornice diversa dal vetro sarebbe un difetto della pipeline, non dell'EXIF). |
| Se va storto | conservare il file o uno equivalente non personale (`red_exif6.jpg` del gate ha orientation 6) e il modello del telefono: la correzione è una sessione di codice, non UX-4. |
| Screenshot | `s13_ux4_exif_<and\|ios>.png` (cornice + anteprima) |

### P14 — HEIC dall'iPhone: si apre oppure «Prova con un'altra foto» (iPhone)
| | |
|---|---|
| L'utente fa | **Riapre la pagina** (P13 l'ha chiusa con Salva); «Aggiungi foto» → una foto **HEIC** (formato di fabbrica della fotocamera). Osserva. Poi **risceglie lo stesso file** una seconda volta. Se il selettore converte da solo in JPEG, annotare il nome mostrato nell'editor (`.HEIC` o `.jpeg`). |
| Claude lancia | nulla |
| Ci aspettiamo | uno dei due esiti ammessi: **(a)** l'editor si apre e la foto si ritaglia come una JPEG; **(b)** footer rosso **«Impossibile aprire \<nome\>. Prova con un'altra foto.»** (il dettaglio tecnico sta nel `title` di `#msg`, in inglese, non visibile) e «Aggiungi foto» torna blu; alla seconda scelta dello stesso file il messaggio **ricompare** (l'input viene azzerato apposta). |
| Criterio | **PASS** = (a) oppure (b). **FAIL** = «Un momento…»/«caricamento di …» senza esito; il messaggio generico «Qualcosa non ha funzionato: riprova…»; pagina bloccata; seconda scelta dello stesso file che non fa nulla. |
| Se va storto | annotare versione di iOS e dell'app; in (b) la risposta di prodotto è già nel testo. Un blocco è un difetto da riprodurre al banco — ma **nella VM non c'è nessun tool HEIC**: questa prova la fa solo l'iPhone. |
| Screenshot | `s13_ux4_ios_heic.png` |

### P15 — Dodici foto con miniature: l'URL `data:` (D59, la prova decisiva) (Android + iPhone)
| | |
|---|---|
| L'utente fa | Porta l'album a **12 foto**. Android: anche tutte in una volta (12 × «Aggiungi foto» → Salva). iPhone: **a lotti di 3–4**, perché «Aggiungi foto» si spegne con **«Salva queste foto, poi riapri le impostazioni per aggiungerne altre»** quando la prossima non ci starebbe nei 200 KB (B7); **il primo lotto è P16**: aggiungere finché «Aggiungi foto» non si spegne, annotare i KB, Salva. Dopo ogni Salva aspetta che l'orologio arrivi a «n/n» (**minuti**: le scritture persist rallentano man mano; tenere l'app in primo piano). Poi **riapre la pagina** con 12 foto: guarda le 12 tessere con la miniatura, il contatore **«12 di 12 foto»**, «Aggiungi foto» grigio con **«Massimo 12 foto: togline una per aggiungerne un'altra»**, l'Anteprima con **«Aggiungi una foto e la vedrai qui con l'ora: quelle già presenti no»**, e se compare il riquadro **«Galleria ci mette N secondi ad avviarsi quando torni all'orologio…»**. Chiude con «Chiudi». |
| Claude lancia | log per tutta la durata (su iPhone il ciclo di §1.4); `grep -E -e 'apro la pagina' -e 'pagina chiusa' -e 'payload applicato' -e 'sync: end' -e 'HELLO' run_s13_ux4_<tel>_15*.log`; `python3 ../../tools/galleria_logstats.py --md run_s13_ux4_<tel>_15*.log` |
| Ci aspettiamo | per ogni foto una riga `sync: end s=k c=0 n=9 commit C photo P ch max M avg A heap H` (con `ch max` che cresce col file, fino a ~1 s alla dodicesima) e `[sync] fine` con `photosOk` = le foto del lotto; nessun `NO_SPACE`/`STORAGE_ERR`; al riavvio `storage: … valid=12`; nell'HELLO `open=NNNms` (annotare: la soglia dell'avviso è 400 + 100 × 12 = **1.600 ms**). Alla riapertura **`[config] apro la pagina (URL N car., stato M)` con N fra ≈ 215.000 e ≈ 295.000 su emery** (**221.703** con le miniature del gate, **292.908** con 12 miniature al tetto; su flint 198.020 / 269.225), la pagina a video con 12 miniature, `pagina chiusa: risposta di 0 car.` alla chiusura. Android ha già aperto 201.484 caratteri; **l'iPhone non è mai andato oltre 138.249**: qui si decide. |
| Criterio | **PASS** = l'URL con 12 foto **si apre su tutti e due i telefoni** (pagina a video con 12 miniature, `apro la pagina` seguito da `pagina chiusa`), N annotato in §3 e in `PIANO.md` §8, nessun errore di sync, `valid=12`. **FAIL** = pagina bianca, timeout o errore dell'app su uno dei due (iPhone → §4); N < 215.000 con 12 tessere = miniature mancanti (rifare con foto che le producono: D59 vuole «con miniature»); `NO_SPACE` o `MISMATCH` nella sync = fermarsi e conservare il log. |
| Se va storto | **iPhone che non apre**: §4 (bisezione e leve). **Android che non apre**: inatteso (tetto 2 MiB): annotare la versione dell'app e riprovare con meno foto. |
| Screenshot | `s13_ux4_12photos_<and\|ios>.png` (le 12 tessere con miniatura; se le foto sono personali resta **fuori dal repo**), `s13_ux4_watch_12_<and\|ios>.png` (orologio) |

### P16 — Salva vicino al tetto dei 200 KB (iPhone)
| | |
|---|---|
| L'utente fa | Si fa **dentro P15, come primo lotto** (album a ≤ 8 foto: dopo P15 l'iPhone è già a 12 e bisognerebbe togliere foto per rifarla). Aggiunge foto **nella stessa apertura** finché «Aggiungi foto» non si spegne o finché non ne ha 4: guarda il contatore grigio **«Da inviare: N KB / 200 KB»** (compare da 100 KB) e, se il pulsante si spegne, la frase «Salva queste foto, poi riapri le impostazioni per aggiungerne altre». Tocca Salva. |
| Claude lancia | nessun log nuovo: P16 è il lotto 1 di P15 e le sue righe stanno nel log di P15 (§1.5); `grep -E -e 'pagina chiusa' -e 'payload applicato' -e 'sync: end' run_s13_ux4_ios_15*.log` |
| Ci aspettiamo | esito **(a)**: il pulsante si spegne dopo 3 foto (miniature grandi: 3 × ≈ 52 = 155 KB ≥ 149) → Salva manda ≈ 150–160 KB → `pagina chiusa: risposta di ≈ 155.000–165.000 car.`; esito **(b)**: la quarta entra (miniature piccole) → «Da inviare: 185–195 KB / 200 KB» → `risposta di ≈ 190.000–200.000 car.`. In tutti e due i casi `payload applicato in N ms` (≤ 100 ms attesi) e poi 3–4 righe `sync: end`. **Mai** un Salva toccabile sopra i 200 KB (in quel caso compare in rosso «Troppe foto per un solo invio (N KB su 200)»). |
| Criterio | **PASS** = (a) oppure (b), con `payload applicato` e le foto sull'orologio: il close URL da 155–200 k caratteri passa in WKWebView. **FAIL** = `pagina chiusa: risposta di 0 car.` o `risposta della pagina non valida` dopo Salva (limite del close URL su iOS: annotare i KB), Salva toccabile sopra 200 KB, «Aggiungi foto» spento con meno di 3 foto. |
| Se va storto | limite del close URL trovato → il tetto di iOS va abbassato al valore che passa (una costante in `page_core.js:227` e seguenti, **non** in UX-4) e la nota va nel README. |
| Screenshot | `s13_ux4_ios_cap.png` (contatore + pulsante spento con la frase) |

### P17 — Tema scuro di Android (G47) (Android)
| | |
|---|---|
| L'utente fa | Impostazioni di Android → Display → **Tema scuro ON** (senza toccare le opzioni sviluppatore); riapre la pagina e la scorre tutta (intestazione, tessere con miniature, editor con una foto (poi «Non aggiungere»), anteprima, select, footer). Poi rimette il tema chiaro. Bonus iPhone: Aspetto scuro ON e una scorsa. |
| Claude lancia | nulla |
| Ci aspettiamo | pagina **identica al tema chiaro**: fondo bianco, testo scuro, «Aggiungi foto» blu, miniature e canvas dell'anteprima **non invertiti** (`color-scheme: only light`, `page.css:6` e `page.html:6`, è l'opt-out dal Force Dark di Chromium). |
| Criterio | **PASS** = nessuna inversione, contrasti come in chiaro. **FAIL** = fondo nero con testo chiaro, miniature o anteprima invertite, select illeggibili. |
| Se va storto | la WebView dell'app forza il tema scuro nonostante `only light`: è un'impostazione dell'app, non c'è altra leva lato pagina. Annotare le versioni di Android, dell'app e di Android System WebView e riportare. |
| Screenshot | `s13_ux4_and_dark_top.png`, `s13_ux4_and_dark_editor.png` |

### P18 — Nomi reali dei pulsanti dell'app Core Devices in it e de (D55) (Android + iPhone)
| | |
|---|---|
| L'utente fa | Con il telefono in **italiano**: app Pebble → scheda dell'orologio → elenco delle app → **Galleria** → la schermata con i pulsanti (impostazioni, rimozione, aggiornamento): **solo screenshot, non toccare «Rimuovi»/«Disinstalla»** (cancella le foto dall'orologio) **né «Aggiorna»**. Poi mette il telefono in **tedesco** e rifà lo screenshot; poi torna all'italiano — Android (di solito, Android stock 14/15; su altri produttori la voce può stare altrove, es. «Gestione generale»: non verificabile al banco): Impostazioni → Sistema → Lingue → Deutsch, e al ritorno **Einstellungen → System → Sprachen → Italiano** (l'app Pebble può riavviarsi: riaccendere «Dev Connection»); iPhone: Impostazioni → Generali → Lingua e zona, al ritorno **Einstellungen → Allgemein → Sprache & Region**. Su tutti e due i telefoni (le due app hanno interfacce diverse). Annota anche il nome del pulsante che apre la pagina (oggi il README dice «⚙ Impostazioni»). |
| Claude lancia | nulla |
| Ci aspettiamo | i nomi veri, in it e de, di: il pulsante che **apre la pagina**, quello che **rimuove** Galleria (cancella il persist) e quello che **aggiorna** (non lo cancella), su Android e su iOS. |
| Criterio | **PASS** = screenshot fatti e nomi trascritti in §3 per 2 telefoni × 2 lingue. Non è pass/fail sulla pagina: alimenta D55 (a). Finché l'utente non decide, i passi dell'Aiuto restano descrittivi («tocca Galleria nell'elenco delle app», «rimuovi Galleria dall'orologio (non aggiornarla)»). |
| Se va storto | se il tedesco non è disponibile sul telefono: screenshot in inglese e in italiano, e la decisione D55 resta aperta. |
| Screenshot | `s13_ux4_app_and_it.png`, `s13_ux4_app_and_de.png`, `s13_ux4_app_ios_it.png`, `s13_ux4_app_ios_de.png` |

### P19 — Riapertura dopo la sync: stato coerente, tessere, ordine (Android + iPhone)
| | |
|---|---|
| L'utente fa | Dopo P08/P15 riapre la pagina: le tessere hanno la miniatura e **nessun badge** (le foto sono già sull'orologio), i nomi sono quelli dei file, l'ordine è quello dell'orologio; «Cambio foto» mostra i valori salvati; l'Anteprima dice «Aggiungi una foto e la vedrai qui con l'ora: quelle già presenti no»; il footer dice «Salva» / «Chiudi». Sposta una foto con ▲ e tocca Salva. |
| Claude lancia | log; `grep -E -e 'ALBUM_ORDER' -e '\[sync\] fine' -e 'rot\(' run_s13_ux4_<tel>_19.log` |
| Ci aspettiamo | `[sync] ALBUM_ORDER [...]` → `[sync] ALBUM_ORDER -> OK`, `[sync] fine: {… "order":"OK" …}` con `photosOk:0` (nessuna foto rimandata); sull'orologio, alla prossima rotazione o scossa, l'ordine nuovo (`rot(tick\|shake): … slot=k`). Nessun badge «non è ancora sull'orologio» né «da togliere e riaggiungere» su foto arrivate. |
| Criterio | **PASS** = stato coerente e riordino con la sola `ALBUM_ORDER`. **FAIL** = badge sbagliati, foto rimandate senza motivo (`nuove [k]` su una foto già presente), ordine non applicato. Sull'iPhone, tessere «solo sull'orologio» = il cambio di telefono di §0 non è stato fatto: sono le foto dell'Android, non un FAIL della pagina. |
| Se va storto | riportare le righe `[album] piano:` e `[sync] fine`. |
| Screenshot | `s13_ux4_reopen_<and\|ios>.png` |

### P20 — Una persona non tecnica mette la sua prima foto (uno dei due telefoni)
| | |
|---|---|
| L'utente fa | Consegna il telefono (pagina già aperta, album con al massimo 2 foto) e dice solo: «metti una tua foto sull'orologio». Non aiuta; annota in silenzio. Alla fine chiede: «che cosa faresti per cambiare il font dell'ora?» e «se volessi togliere una foto?». |
| Claude lancia | nulla; dopo, `grep -E -e '\[config\]' -e '\[sync\] fine' run_s13_ux4_<tel>_20.log` per i tempi (`pagina chiusa … dopo T ms` = quanto è durata la visita) |
| Ci aspettiamo (che cosa osservare) | (1) trova «Aggiungi foto» senza cercare? (2) capisce il gesto nella cornice, usa due dita, o resta sullo Zoom? (3) guarda l'anteprima con «12:34» e ne capisce il senso? (4) tocca «Usa questa foto» **nel footer** o cerca un pulsante sotto la cornice? (5) dopo il verde «Foto aggiunta: tocca Salva…» tocca Salva o si ferma? (6) tiene l'app aperta durante la sync (la riga grigia lo dice) o la chiude? (7) tocca «Esci senza salvare» per sbaglio e capisce il rosso? (8) toglie una foto per errore con ✕? (9) cerca «Invia all'orologio» al posto di «Salva»? (10) quanto tempo passa dalla pagina aperta alla foto sul polso? |
| Criterio | **Osservazione, non pass/fail**: il percorso di S13 §5 riuscito **senza aiuto** in ~3 minuti è il segnale verde. Ogni esitazione va annotata con il numero (1)–(10). Le decisioni che dipendono da qui sono già scritte: D52 (b) «Ripristina», D53 (U-17, riquadro dell'ora sopra la cornice), D58 («Invia all'orologio» al posto di «Salva»). |
| Se va storto | niente da «riparare» sul momento: si annota e basta. |
| Screenshot | nessuno (privacy): solo appunti nella riga di risultato |

## 3. Riga di risultato

Una riga per prova e per telefono, da compilare mentre si va avanti (poi copiata in `apps/galleria/PIANO.md` §8).

| Prova | Telefono (modello, OS, app Pebble) | Esito ✅/❌/⚠️ | Misura (caratteri dell'URL, KB, ms, testo del pulsante) | Log (file:riga) | Screenshot | Note |
|---|---|---|---|---|---|---|
| P01 | Android: | | | | | |
| P01 | iPhone: | | | | | |
| P02 | Android | | | | | |
| P02 | iPhone | | | | | |
| P03 | Android | | URL: | | | |
| P03 | iPhone | | URL: | | | |
| P04 | Android | | | | | |
| P04 | iPhone | | | | | |
| P05 | Android | | | | | |
| P05 | iPhone | | | | | |
| P06 | Android | | | | | |
| P06 | iPhone | | | | | |
| P07 | Android | | | | | |
| P07 | iPhone | | | | | |
| P08 | Android | | risposta: car. — applicato: ms — photo: ms | | | |
| P08 | iPhone | | risposta: car. — applicato: ms — photo: ms | | | |
| P09 | Android | | fg= halo= / nota della pagina: | | | |
| P09 | iPhone | | fg= halo= / nota della pagina: | | | |
| P10 | Android | | | | | |
| P10 | iPhone | | | | | |
| P11 | Android | | controllo usato: | | | |
| P11 | iPhone | | controllo usato: | | | |
| P12 | Android | | | | | |
| P12 | iPhone | | | | | |
| P13 | Android | | | | | |
| P13 | iPhone | | | | | |
| P14 | iPhone | | esito (a) o (b): | | | |
| P15 | Android | | **URL 12 foto: car.** — open= ms — sync: min | | | |
| P15 | iPhone | | **URL 12 foto: car.** — open= ms — sync: min | | | |
| P16 | iPhone | | KB mostrati: — risposta: car. | | | |
| P17 | Android | | | | | |
| P18 | Android | | it: / de: | | | |
| P18 | iPhone | | it: / de: | | | |
| P19 | Android | | | | | |
| P19 | iPhone | | | | | |
| P20 | telefono usato: | | tempo totale: min — punti (1)–(10): | | — | |

Le righe che **devono** avere un numero: **P03** (URL «zero», atteso 195.223 su emery), **P08** (`risposta di N car.`,
`payload applicato N ms`, `photo P ms`), **P15** (**URL con 12 foto** per telefono, `open=` dell'HELLO, durata della
sync), **P16** (KB mostrati e `risposta di N car.`), **P18** (i nomi dei pulsanti). Se P15 è ❌ sull'iPhone, la riga
riporta anche il **massimo N che si è aperto** (§4).

### Chiusura del gate — quando U-18b si può dichiarare passata

Sono le voci del gate di S13 §6 (UX-4), una per una:

1. **Android e iPhone aprono la pagina con 12 foto**, caratteri annotati (P15 ✅ su tutti e due; con l'iPhone ❌ si
   va a §4 e U-18b **non** è passata finché non c'è la decisione dell'utente).
2. **Sull'orologio reale la foto arriva e l'ora si vede come nell'anteprima** (P08 ✅ e P09 ✅).
3. **HEIC aperto oppure messaggio «Prova con un'altra foto» corretto** (P14 ✅).
4. **Build emery + flint verde con statico invariato 29.080 / 28.968 B** e `make -C test` verde (B1 e B2, al banco).
5. **`PIANO.md` §8 e `docs/CONTINUA-QUI.md`** aggiornati con la tabella dei costi misurati e le righe di §3.
6. **Decisione sulla versione presa dall'utente** (0.4.0: §5).

Prima di chiudere: **Dev Connection OFF** sui due telefoni (Debug wireless OFF e `adb kill-server` se si è usata la
via B); i log `run_s13_ux4_*.log` restano in `apps/galleria/` (git li ignora) con i riepiloghi
`galleria_logstats.py --md`; screenshot in `docs/design/galleria/s13_ux4_*.png`, **solo con foto del gate o CC0**.
L'album sull'orologio a fine gate è quello dell'**ultimo telefono collegato**: l'altro telefono, al
ricollegamento, rimanda le proprie foto (se il suo album ne ha) sopra gli slot con CRC diverso (§0). Prima di
tornare all'uso normale scegliere il telefono e svuotare l'album dell'altro (✕ su tutte + Salva), sapendo che il rinvio
parte da solo al primo `HELLO` del ricollegamento, prima che si possa aprire la pagina (una sync intera), e che dopo lo
svuotamento il telefono scelto rimanda a sua volta le sue foto (una seconda sync: minuti, `album.js:588`).

## 4. Se l'iPhone non apre la pagina con 12 foto

**P15-bis — bisezione (≈ 5 minuti).** Serve il numero, non l'impressione: si tolgono foto con ✕ e si tocca Salva (un
payload di sole eliminazioni è piccolo, la sync è immediata), poi si riapre la pagina e si legge `[config] apro la
pagina (URL N car., …)` nel log. Sequenza **12 → 8 → 6 → 4**, annotando il **massimo N che si apre** e il **primo che
non si apre**. Riferimenti: 12 foto ≈ **221.703**, 4 foto ≈ **204.033**, album vuoto **195.223**; finora l'iPhone ha
aperto al massimo **138.249**.

Le foto tolte escono dall'album di Galleria (telefono **e** orologio) ma **restano nella libreria del telefono**: a
bisezione finita vanno riaggiunte con «Aggiungi foto» + Salva, cioè minuti di sync. Togliere prima le foto del gate,
poi le altre.

**Le leve, in ordine** (nessuna è in UX-4: sono sessioni a parte, con Fable, perché toccano il PKJS e le maschere):

| Leva | Guadagno stimato su emery | Costo |
|---|---|---|
| **RLE delle maschere delle cifre** | **≈ −28.000 caratteri** (misurato ×2,86: 29,8 k → 10,4 k caratteri di bit; l'`masks` dell'hash passa da ≈ 43.276 a ≈ 15.000) | una sessione di codice sul PKJS e sulla pagina; nessun cambio visibile |
| Miniature più piccole (`MAX_THUMB_CHARS` 6.000 → 3.000) | fino a −36.000 nel caso peggiore, ≈ −9.000 con le miniature vere | miniature più grossolane nelle tessere |
| Mandare **solo il font scelto** nelle maschere | ≈ −34.000 | la pagina non potrebbe più cambiare font senza tornare al PKJS: **contro D45** |
| Un solo dizionario invece di sei | ≈ −30.000 | **contro D36** (cambio lingua istantaneo nella pagina) |

**Decisione dell'utente** (domanda 7 di §1.1), fra: **(a)** una sessione RLE **prima** della release 0.4.0 (leva
misurata, nessun cambiamento visibile, P15 si rifà dopo) e **(b)** pubblicare la 0.4.0 con il **limite dichiarato nel
listing** («su iPhone fino a N foto», N dalla bisezione), RLE in una release successiva. Su Android non cambia nulla.

## 5. Dopo il gate

Nell'ordine:

> 19/09/2026: i punti 2–3 sono superati (0.4.0 pubblicata il 18/09, titolo «Galleria» online) e il punto 4 vale per
> la descrizione nuova; resta il `PATCH`
> della sola descrizione.

1. **Risultati**: le righe di §3 in `apps/galleria/PIANO.md` §8 (tabella dei costi misurati) e il riassunto in
   `docs/design/galleria-s13-ux-casual.md` §15; i riepiloghi con `galleria_logstats.py --md run_s13_ux4_*.log`; gli
   screenshot in `docs/design/galleria/`. Se P18 ha dato i nomi veri dei pulsanti, **D55 (a)** torna in tavola.
2. **Conferma della versione**: l'utente conferma che il lavoro esce come **0.4.0** (`package.json` la porta già) e
   che il gate è passato (§3, Chiusura).
3. **Pubblicazione, lanciata dall'utente** (in UX-4 non si pubblica niente):
   - i controlli obbligatori di `store/LISTING.md` §6 («Prima»): `build_config_page.py --check`, `make -C test`,
     `pebble clean && pebble build`, `unzip -p build/galleria.pbw appinfo.json` (atteso `versionLabel 0.4.0`,
     `companyName Rediro`), `store/make_assets.py --check`, `wc -m` dei testi dello store, `pebble login --status`;
   - la release, riga pronta in `store/LISTING.md` §6: `pebble publish --non-interactive --no-gif-all-platforms --version 0.4.0 --release-notes "$(cat store/release_notes_0.4.0.txt)"`;
   - subito prima o subito dopo, il **`PATCH`** di `store/PUBLISH.md` §0.1 con il nome **«Galleria»** e la descrizione
     nuova: **`title=Galleria` è obbligatorio in ogni `PATCH`**, quindi lo stesso comando fa le due cose. Gli
     screenshot dello store restano quelli di oggi (D131: nessun `--replace-screenshots`).
4. **Verifica finale**: `GET https://appstore-api.repebble.com/api/v1/apps/id/cdf80cc3bf6745b1a310e4c8` deve dire
   `title` «Galleria», `latest_release.version` 0.4.0 e la descrizione nuova.
