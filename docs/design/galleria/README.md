# Screenshot di lavoro di Galleria

Screenshot dell'emulatore, della config page (Firefox headless) e — per
`s8_02_emery_a_anton_reale.png` — del Pebble Time 2 reale, raccolti gate per gate: `s1_*`, `s2_*`,
`s3_*`, `s4_*`, `s5a_*`, `s5b_*`, `s6_*`, `s7_*`, `s8perf_*`, `s8stile_*`, `s8_02_…_reale`, `s9_*`,
`rev19_*`, `s10_*`, `s11_*`, `s12_*`, `s13_ux_before_*`, `s13_ux3_*`, `s13_ux4_*`, `store040_*`
(18/09/2026, non da un gate), `s14_*`. Servono da prova visiva delle sessioni descritte in
`../../../apps/galleria/PIANO.md` e nei documenti di design accanto a questa cartella; non entrano nel
`.pbw`; **otto** di essi (elenco in `../../../apps/galleria/store/README.md`: sei `s9_*` e i due
`store040_*`) sono le sorgenti degli asset dello store. Al 17/09/2026 erano **169 PNG** per
5.658.891 B; al 19/09/2026 erano **171** per 5.681.308 B (5,4 MiB) con i due `store040_*` e, con i
**13 `s14_*`** del gate di S14 (19/09/2026 sera), sono **184** per **6.152.180 B** (5,9 MiB).

## Politica della cartella (dal 17/09/2026)

**Un set per gate**, e ogni PNG nuovo **citato per nome** in un `.md` (documento di design, `PIANO.md`,
`README.md` dell'app o di radice), non solo per glob. Le varianti di lingua e di larghezza, i set
intermedi dello stesso artefatto rifatto più volte (la config page: S6 → S10 → S12 → UX-1 → UX-2 →
UX-3/UX-4) e le prove scartate **restano nell'archivio locale fuori dal repo** (`~/galleria-gate/…`,
non versionato). Ogni set nuovo va aggiunto a questo file, con la sua licenza, nello stesso commit.

Applicando la regola il 17/09/2026 la cartella è passata da **234 a 169 PNG**: via 64 file mai citati
per nome (11 `s13_ux1_*`, 18 `s13_ux2_*`, 8 dei 10 `s13_ux_before_*`, 11 varianti di lingua e larghezza
`s13_ux3_*`, 16 `s6_*`) e 2 doppioni byte-identici (`s2_emery_tick_before`, `s3_emery_b_tick_after`);
è entrato `s8_02_emery_a_anton_reale.png`, l'unico scatto dall'orologio vero. I set più vecchi
(schermate dell'orologio da 1–24 KB) restano interi anche dove i documenti li citano per glob: sono
leggeri e sono la prova visiva dei gate S1–S9.

## Che foto si vede in ogni set

| Set (quanti) | Che cosa mostra | Foto |
|---|---|---|
| `s1_*` (12) | ora e riga info su sfondo pieno | nessuna |
| `s2_*` (11), `s3_*` (19), `s4_*` (4), `s5b_*` (6), `s6_*` (6), `s7_*` (28), `s8perf_*` (4), `s8stile_*` (17), `rev19_*` (5) — salvo le eccezioni elencate sotto | orologio e config page con le foto **di prova** | wallpaper `ubuntu-wallpapers` → **CC-BY-SA-4.0** |
| `s5a_*` (4) e `s5b_*_fixture_*` (1) | sync con la figura sintetica a barre colorate | nessuna |
| `s9_*` (10) | gate della pubblicazione | foto demo dell'app → **CC0 1.0** |
| `s8_02_emery_a_anton_reale.png` (1) | unico scatto dal **PT2 reale** (30/08/2026) | demo_1 **storica** (`mizuno-as-Big_Dipper.jpg`) → **CC-BY-SA-4.0** |
| `s10_*` (14) | 10 scatti dell'orologio (lingue, icona di sync) + 4 pagine `s10_page_*` | orologio: demo CC0 e le candidate CC0 di S9 (`b01_densefog`…`b04_sprucefog`, Wikimedia/Unsplash); pagine: **solo segnaposto grigi** |
| `s11_*` (6) | 4 scatti dell'orologio (es/pt) + 2 pagine di impostazioni | orologio: demo CC0 «Bryce Canyon»; pagine: nessuna miniatura |
| `s12_*` (6) | anteprima della watchface dentro la config page | foto di prova `dark_portrait.jpg` e `light_landscape.jpg` → **CC-BY-SA-4.0** |
| `s13_ux_before_*` (2), `s13_ux3_*` (10), `s13_ux4_*` (4) | config page prima e dopo il rifacimento UX | pagine ed editor: foto di prova `dark_portrait`/`light_landscape`/`mid_landscape` → **CC-BY-SA-4.0**; i quattro `s13_ux*_emu_*` (orologio) mostrano le demo CC0 |
| `s14_*` (13) | gate di **S14** (19/09/2026 sera): 7 scatti emery e 2 flint della disposizione «**Ora in basso**» (`layout 2`, D136) + 4 schermate della config page (elenco qui sotto) | orologio: foto demo dell'app → **CC0 1.0**; pagina: `demo1.jpg`, ricavata dalla **demo_1** raw6 (Lauklines, CC0) → **CC0 1.0** |
| `store040_*` (2) | sorgenti degli screenshot extra dello store (18/09/2026): layout B in emulatore, build 0.4.0 | foto demo dell'app → **CC0 1.0** |

I **nomi di file** che si leggono nelle tessere degli screenshot `s13_*` (`IMG_20260905_181233.jpg`,
`vacanze_mare_2026.jpg`, `Screenshot_2026-09-01.png`) sono **inventati dagli script del gate**
(`~/galleria-gate/ux/*/mkstate_ux*.js`) per simulare una libreria foto vera: non sono foto dell'autore.

## I tredici `s14_*` (gate di S14, 19/09/2026 sera)

Emulatore `emery`/`flint` con l'SDK 4.33.1 e Firefox headless sulla config page servita dal dev server
(`tools/galleria_devserver.py --page-dir src/pkjs/config`). Le decisioni sono in
`../galleria-s14-feature-v1.md` §1 (**D136–D141**), la geometria in `../galleria.md` §3.1.

| File | Che cosa mostra |
|---|---|
| `s14_emery_l2_24h.png` | «Ora in basso» con Anton in 24 h: riga info in alto nella fascia `[122,228)`, inchiostro delle cifre a 154..217 |
| `s14_emery_l2_12h.png` | lo stesso in 12 h: il «PM» resta accanto alle cifre, a filo del fondo |
| `s14_emery_l2_qv.png` | Quick View acceso: la fascia sale a `[63,169)` con il colore ricalcolato (isteresi) |
| `s14_emery_l2_xl.png` | content size **ExtraLarge**: fascia `[118,228)`, riga info Gothic 24 |
| `s14_emery_l2_leco.png` | font di sistema (LECO) in basso, ammesso anche in questa disposizione |
| `s14_emery_l2_francois_t3d.png` | Francois One trasparente 3D: anello da 156, ombra fino a 223 |
| `s14_emery_l2_sync.png` | sync in corso: icona e «1/1» nella riga info **sopra** le cifre (foto demo Bryce Canyon) |
| `s14_flint_l2_24h.png` | Pebble 2 Duo: fascia `[92,168)`, riempimento 119..160 |
| `s14_flint_l2_qv.png` | Pebble 2 Duo con Quick View: fascia `[41,117)` |
| `s14_page400_settings.png` | config page «Aspetto dell'ora» a **400 px**: riga Font senza frecce su una riga, «Disposizione» con tre voci |
| `s14_page360_settings.png` | la stessa sezione a **360 px**: la riga Font resta su una riga (40 px) |
| `s14_page400_editor_adv.png` | editor con «**Ottimizza per lo schermo dell'orologio**» spuntata di serie (D138) e l'anteprima di «Ora in basso» |
| `s14_page400_prev.png` | sezione «Anteprima»: la foto con l'ora in basso, cifre alle stesse righe dell'emulatore |

Le foto sono **CC0 1.0**: sull'orologio le due demo dell'app (aurora a Lauklines, Bryce Canyon dopo la neve,
`../../../apps/galleria/resources/photos/README.md`); nella pagina `demo1.jpg`, ricavata dalla **demo_1** raw6
(Lauklines) per avere un file da caricare nell'editor. **Nessuna foto personale** e nessuna immagine CC-BY-SA in
questo set.

## Licenza delle immagini

Il codice del repository è **MIT** (`../../../LICENSE`), ma **alcuni di questi PNG no**.

Negli screenshot `{s2,s3,s4,s5b,s6,s7,s8perf,s8stile,rev19,s12,s13_ux_before,s13_ux3,s13_ux4}_*.png` e
in `s8_02_emery_a_anton_reale.png` le foto mostrate sono **foto di prova** derivate da wallpaper del
pacchetto **`ubuntu-wallpapers`**, che sono **CC-BY-SA-4.0**. Essendo opere derivate, **quei file
immagine sono disponibili sotto CC-BY-SA-4.0**, con questa attribuzione:

> © 2016-2025 Canonical Ltd e gli autori dei wallpaper `ubuntu-wallpapers` — Hajime Mizuno
> (`mizuno-as-Big_Dipper.jpg`), Vladimir Moskalenko (`moskalenko-v-Snowy_Ubuntu_Light.webp`),
> osselo (`osselo-Ask_a_friend.jpg`), mendhak (`mendhak-Bluebells_Suspended_In_Time.jpg`,
> `mendhak-Red_Acer.jpg`), jdituicha (`jdituicha-raccoon1-light.jpg`) — licenza CC-BY-SA-4.0,
> <https://creativecommons.org/licenses/by-sa/4.0/>

Il **logo Ubuntu**, marchio di Canonical Ltd, è visibile dentro alcune di quelle foto (per esempio
nelle miniature chiare di `s12_page_tiles_eye.png` e delle pagine `s13_*`): compare solo come
contenuto dell'immagine di prova, senza alcuna affiliazione con Canonical.

Non riguardano la CC-BY-SA: gli `s1_*` (nessuna foto), gli `s5a_*` e `s5b_*_fixture_*` (figura di prova
sintetica), le schermate della config page senza miniature (per esempio `rev19_page_slow_4foto.png`, i
quattro `s10_page_*` e i due `s11_page_*`), gli `s9_*`, gli scatti dell'orologio di `s10_*`/`s11_*`, i
quattro `s13_ux*_emu_*`, i **tredici `s14_*`** del 19/09/2026 (gate di S14: orologio con le demo, pagina con
`demo1.jpg` ricavata dalla demo_1) e i due `store040_*` del 18/09/2026 (sorgenti degli screenshot extra dello
store: layout B in emulatore con la build 0.4.0, elenco in `../../../apps/galleria/store/README.md`) —
tutte foto demo e candidate **CC0 1.0**. Il file `rev19_watch_francois_3d.png`, l'unica fotografia
personale dell'autore, è stato **rimosso dal repository e dalla sua storia** il 05/09/2026. **Nessuno
di questi file entra nell'app pubblicata**: dal 05/09/2026 l'app e gli asset dello store usano solo le
foto CC0. L'unica eccezione è stata `../../../apps/galleria/store/emery_screenshot_6.png`, generato
il 18/09/2026 da `s8stile_emery_b_staatliches_trasparente.png` (foto di prova **CC-BY-SA-4.0**,
attribuzione qui sopra): **non è mai andato online** ed è stato **tolto dal repo il 19/09/2026**; resta
solo nella storia git (commit `3504762` e `7a6ed8f`). La sorgente
`s8stile_emery_b_staatliches_trasparente.png` resta in questa cartella, ma non è più sorgente di alcun
asset dello store (elenco aggiornato in `../../../apps/galleria/store/README.md`).

Dettagli, elenco completo dei file e testi di licenza: **[`../../../THIRD-PARTY-NOTICES.md`](../../../THIRD-PARTY-NOTICES.md)** §5.
