# Pebble Time 2 (emery) — display, resa visiva e performance di rendering

**Data ricerca: 2026-08-24.** Tutte le informazioni sono verificate su fonti primarie 2025-2026
(docs ufficiali Core Devices `developer.repebble.com`, sorgenti `github.com/coredevices/PebbleOS`,
`github.com/coredevices/sdk-docs`, `github.com/coredevices/pebble-tool`, changelog SDK).

> **Attenzione alla confusione storica.** Esistono DUE "Pebble Time 2":
> 1. Il Pebble Time 2 originale di Pebble Technology, **mai spedito** (Kickstarter 2016, cancellato
>    a dicembre 2016). Per esso fu creata la piattaforma SDK **emery** (SDK 4.2-beta4, 11/10/2016).
> 2. Il **nuovo Pebble Time 2 di Core Devices** (Eric Migicovsky), annunciato nel 2025 come
>    "Core Time 2", rinominato **Pebble Time 2**, in spedizione da **gennaio 2026**.
>
> Core Devices ha **riusato lo stesso nome di piattaforma SDK `emery`** e la stessa risoluzione
> 200x228, quindi molto materiale del 2016 è ancora tecnicamente valido — **tranne** il
> comportamento di compatibilità (vedi §5), che nel firmware 2026 è cambiato radicalmente.
> Il **nome della board** nel firmware è invece `obelix` (`src/fw/board/displays/display_obelix.h`).

---

## 0. Sintesi esecutiva (le 10 cose che contano davvero)

1. **emery = 200x228 px, 64 colori (RGB222), rettangolare, 202 PPI, 1.5"**, pannello **JDI
   LPM015M135A Memory-in-Pixel (MiP) riflettivo**. **Non è E Ink**: nessun ghosting, nessun
   refresh parziale "lento", aggiornamento full-frame **ben sotto i 20 ms**.
2. Il **contrasto reale del pannello è ~20:1** (contro ~1000:1 di un OLED). I colori saturi
   dell'SDK escono **molto più chiari e desaturati** sul vetro: `GColorRed` (#FF0000) appare come
   **#E35462**, `GColorYellow` come **#FFEEAB** (quasi bianco). Vedi la tabella completa in §4.3.
3. **`layer_mark_dirty()` NON fa un redraw parziale**: imposta solo un flag sulla `Window` e alla
   frame successiva viene ridisegnato **l'intero albero di layer**. L'unica ottimizzazione reale è
   *chiamarlo di rado* e *rendere economiche le update_proc*.
4. **Il driver del display trasmette solo l'intervallo di righe "dirty"** (`y0..y1`, larghezza
   piena). Quindi **la località verticale conta, quella orizzontale no**.
5. **Il background della Window viene riempito a ogni render** → dirtia tutto il framebuffer.
   `window_set_background_color(w, GColorClear)` disattiva questo fill e permette un vero
   aggiornamento parziale (a costo di gestire tu la cancellazione).
6. **Nel firmware 2026 le app senza build emery vengono SCALATE a schermo pieno per default**
   (nearest-neighbour), non centrate come nel 2016. L'utente può scegliere fra *Centered*,
   *Scaled (Nearest)*, *Scaled (Bilinear)* in **Settings → Display → Legacy Apps**.
7. **Costruire nativamente per emery raddoppia la RAM disponibile**: 135.168 B (132 KiB) contro
   67.584 B (66 KiB) che il firmware concede a un binario basalt/chalk. Il framebuffer app diventa
   200x228 invece di 144x168.
8. **Il Pebble Time 2 ha un touchscreen** (CST816D) con API pubbliche dal **SDK 4.33
   (12/08/2026)**: `TouchService` + gesture recognizer (tap/pan/swipe). **Non utilizzabile nei
   watchface**, solo nei watchapp.
9. **RGB backlight**: `light_set_color()` / `light_set_color_rgb888()` permettono di tingere la
   retroilluminazione — leva visiva esclusiva di PT2.
10. Un `GBitmap` full-screen 8-bit su emery costa **45.600 byte** = **~35% di tutta la memoria
    app**. Va evitato quasi sempre.

---

## 1. Hardware del display e conseguenze dirette

Fonte: `sdk-docs/source/_includes/hardware-platforms.html` (tabella ufficiale "Hardware
Information"), `docs.zephyrproject.org/latest/boards/coredevices/pt2/`, driver
`PebbleOS/src/fw/drivers/display/sf32lb/display_jdi.c`.

| Voce | Pebble Time 2 (emery / obelix) | Pebble 2 Duo (flint / asterix) |
|---|---|---|
| Risoluzione | **200 x 228** | 144 x 168 |
| Diagonale / PPI | 1.5" / **202 PPI** | 1.26" / 175 PPI |
| Colori | **64 (RGB222)** | **2 (B/N)** |
| Pannello | JDI **LPM015M135A** MiP riflettivo | Sharp LS013B7DH05 |
| Forma | Rettangolare | Rettangolare |
| Touch screen | **Sì** (CST816D capacitivo) | No |
| Backlight | **RGB LED multicolore** (AW2016) | LED bianco |
| SoC / CPU | SiFli **SF32LB52J**, Star-MC1 (Cortex-M33-like) **240 MHz** | Nordic nRF52840, Cortex-M4 64 MHz |
| SRAM totale | 511 KiB | — |
| Speaker / Microfono | Sì / Sì (2 mic) | Sì / Sì |
| Sensori | IMU 6 assi, bussola, barometro, HRM | IMU 6 assi, bussola |
| Autonomia dichiarata | ~30 giorni (mediana reale ~21 gg, luglio 2026) | ~30 giorni |

### 1.1 "Color e-paper" è marketing: è un MiP LCD riflettivo

Il pannello LPM015M135A è un **Memory-in-Pixel (MiP) reflective LCD**, non un E Ink. Ogni pixel ha
una cella SRAM che mantiene il proprio stato senza consumo. Conseguenze pratiche **importanti per
il design**:

* **Nessun ghosting**, nessun "flash" di refresh, nessun refresh parziale/completo da gestire.
  Puoi animare liberamente (a differenza dell'E Ink vero).
* **Aggiornamento full-frame < 20 ms** (commento esplicito nel driver: *"A normal full-frame
  transfer takes well under 20ms"*, con timeout di guardia a 500 ms).
* **Contrasto riflettivo tipico 20:1**, gamut ~**17% NTSC**, angoli di visione 60/65/65/60.
  È un display *pallido*: eccellente in pieno sole, mediocre in interni senza backlight.
* **Nessun backlight acceso di default**: la retroilluminazione si accende solo su interazione
  (pulsante, flick del polso, **o tocco**). Il tuo design deve funzionare **senza luce**.

### 1.2 Formato pixel e framebuffer

```c
// PebbleOS/src/fw/board/displays/display_obelix.h
#define PBL_DISPLAY_WIDTH  200
#define PBL_DISPLAY_HEIGHT 228
#define LEGACY_2X_DISP_COLS 144
#define LEGACY_2X_DISP_ROWS 168
#define LEGACY_3X_DISP_COLS LEGACY_2X_DISP_COLS   // 144
#define LEGACY_3X_DISP_ROWS LEGACY_2X_DISP_ROWS   // 168
#define DISPLAY_FRAMEBUFFER_BYTES (PBL_DISPLAY_WIDTH * PBL_DISPLAY_HEIGHT)  // = 45.600
```

* Framebuffer emery = **`GBitmapFormat8Bit`**, 1 byte per pixel = **45.600 byte**.
* Il driver converte in-place **RGB222 → RGB332** riga per riga (per risparmiare 44 KB di RAM),
  poi fa DMA via LCDC solo sull'intervallo `[y0..y1]`:

```c
// display_jdi.c
HAL_LCDC_SetROIArea(&state->hlcdc, 0, s_update_y0, PBL_DISPLAY_WIDTH - 1, s_update_y1);
```

→ **Solo le righe sporche vengono trasferite al pannello.** L'ampiezza orizzontale del rettangolo
sporco è irrilevante: viene sempre inviata la riga intera.

---

## 2. SDK: macro, dimensioni, tipi

### 2.1 Tabella completa delle piattaforme (SDK 4.33, agosto 2026)

Fonte primaria: `PebbleOS/tools/pebble_sdk_platform.py`.

| Piattaforma | Modello | Risoluzione | Colori | MAX_APP_BINARY | MAX_APP_MEMORY | MAX_RES (appstore) | MAX_FONT_GLYPH |
|---|---|---|---|---|---|---|---|
| `aplite` | Pebble / Steel | 144x168 | 2 | 64K | 24K | 128K | 256 |
| `basalt` | Pebble Time / Steel | 144x168 | 64 | 64K | 64K | 256K | 256 |
| `chalk` | Pebble Time Round | 180x180 | 64 | 64K | 64K | 256K | 256 |
| `diorite` | Pebble 2 | 144x168 | 2 | 64K | 64K | 256K | 256 |
| **`emery`** | **Pebble Time 2** | **200x228** | **64** | **128K** | **128K** | **256K** | **512** |
| `flint` | Pebble 2 Duo | 144x168 | 2 | 64K | 64K | 256K | 256 |
| `gabbro` | Pebble Round 2 | 260x260 | 64 | 128K | 128K | 256K | 512 |

`aplite`/`basalt`/`chalk`/`diorite` hanno il define `PBL_SDK_FROZEN`; **`emery`, `flint` e
`gabbro` no** (sono le piattaforme "vive" che continuano a ricevere API nuove).

### 2.2 Define e macro disponibili

Fonte: `sdk-docs/source/_guides/best-practices/building-for-every-pebble.md`.

| Define | Macro | Attivo quando |
|---|---|---|
| `PBL_BW` | `PBL_IF_BW_ELSE()` | hardware solo bianco/nero |
| `PBL_COLOR` | `PBL_IF_COLOR_ELSE()` | hardware a 64 colori |
| `PBL_RECT` | `PBL_IF_RECT_ELSE()` | display rettangolare |
| `PBL_ROUND` | `PBL_IF_ROUND_ELSE()` | display rotondo |
| `PBL_COMPASS` | — | bussola presente |
| `PBL_MICROPHONE` | `PBL_IF_MICROPHONE_ELSE()` | microfono presente |
| `PBL_HEALTH` | `PBL_IF_HEALTH_ELSE()` | Pebble Health / `HealthService` |
| `PBL_SMARTSTRAP` | `PBL_IF_SMARTSTRAP_ELSE` | smartstrap |
| `PBL_SMARTSTRAP_POWER` | — | smartstrap alimentato |
| **`PBL_TOUCH`** | — | **touchscreen presente (solo emery, gabbro)** |
| **`PBL_SPEAKER`** | — | **speaker presente (emery, flint)** |
| **`PBL_RGB_BACKLIGHT`** | — | **backlight RGB (solo emery)** |
| `PBL_DISPLAY_WIDTH` | — | larghezza schermo in px (200 su emery) |
| `PBL_DISPLAY_HEIGHT` | — | altezza schermo in px (228 su emery) |
| `PBL_PLATFORM_APLITE/BASALT/CHALK/DIORITE/`**`EMERY`**`/FLINT/GABBRO` | — | piattaforma di build |
| `PBL_SDK_3` | — | SDK 3.x o 4.x |

Nota ufficiale: *"It is strongly recommended to conditionally compile code using applicable
feature defines instead of `PBL_PLATFORM` defines"*.

**Rilevamento API** (approccio più a prova di futuro):

```c
#if PBL_API_EXISTS(health_service_peek_current_value)
  // ...
#endif
```

### 2.3 `PBL_PLATFORM_SWITCH` (SDK 4.9+)

Definito in `PebbleOS/src/fw/applib/platform.h`. Serve per selezionare un valore per piattaforma
**a runtime** (utile alle costanti di sistema):

```c
typedef enum PlatformType {
  PlatformTypeAplite, PlatformTypeBasalt, PlatformTypeChalk,
  PlatformTypeDiorite, PlatformTypeEmery, PlatformTypeFlint, PlatformTypeGabbro
} PlatformType;

#define PBL_PLATFORM_TYPE_CURRENT  /* = PlatformTypeEmery su emery */

#define PBL_PLATFORM_SWITCH(PLAT, APLITE, BASALT, CHALK, DIORITE, EMERY, FLINT, GABBRO)
#define PBL_PLATFORM_SWITCH_DEFAULT(PLAT, DEFAULT, APLITE, BASALT, CHALK, DIORITE, EMERY, FLINT, GABBRO)
```

⚠️ Nota dal sorgente: *"Optimal use of this does not call a function for the `PLAT` argument!"* —
passa sempre `PBL_PLATFORM_TYPE_CURRENT`, mai una chiamata a funzione (verrebbe valutata a ogni
confronto).

### 2.4 GColor8 / palette a 64 colori (RGB222)

```c
// PebbleOS/src/fw/applib/graphics/gtypes.h
typedef union GColor8 {
  uint8_t argb;
  struct {
    uint8_t b:2;  //!< Blue
    uint8_t g:2;  //!< Green
    uint8_t r:2;  //!< Red
    uint8_t a:2;  //!< Alpha: 3 = 100% opaco, 2 = 66%, 1 = 33%, 0 = trasparente
  };
} GColor8;
```

* `GColor` è `GColor8` sulle piattaforme a colori. **64 colori opachi** (a=3) + livelli di alpha.
* Macro di conversione (`gcolor_definitions.h`):
  `GColorFromRGBA(r,g,b,a)`, `GColorFromRGB(r,g,b)`, `GColorFromHEX(0xRRGGBB)`.
  Tutte fanno semplicemente `>> 6`: **quantizzazione a 2 bit per canale, senza dithering**.
* Ogni colore ha anche la costante `GColor<Nome>ARGB8` (es. `GColorRedARGB8`).
* Valore utile: `(GColor){ .argb = <byte> }` per accesso diretto al framebuffer.

### 2.5 Costanti di layout di sistema su emery (valori esatti)

Fonte: sorgenti `PebbleOS/src/fw/applib/ui/*.h` — **questi numeri non sono nei doxygen pubblici**.

```c
// status_bar_layer.h
#define _STATUS_BAR_LAYER_HEIGHT(plat) PBL_PLATFORM_SWITCH(plat,
  /*aplite*/ 16, /*basalt*/ 16, /*chalk*/ 24, /*diorite*/ 16,
  /*emery*/  20, /*flint*/  16, /*gabbro*/ 20)
#define STATUS_BAR_LAYER_HEIGHT  _STATUS_BAR_LAYER_HEIGHT(PBL_PLATFORM_TYPE_CURRENT)

// "Big & Bold" clock variant
//   emery/gabbro = 26, aplite/basalt/diorite/flint = 20, chalk = 24
#define STATUS_BAR_LAYER_LARGE_BOLD_HEIGHT ...
#define STATUS_BAR_LAYER_MIN_WIDTH        35
#define STATUS_BAR_LAYER_INFO_PADDING      7
#define STATUS_BAR_LAYER_SEPARATOR_Y_OFFSET 2

// action_bar_layer.h
#define _ACTION_BAR_WIDTH(plat) PBL_PLATFORM_SWITCH(plat,
  /*aplite*/ 30, /*basalt*/ 30, /*chalk*/ 40, /*diorite*/ 30,
  /*emery*/  34, /*flint*/  30, /*gabbro*/ 40)
#define ACTION_BAR_WIDTH  _ACTION_BAR_WIDTH(PBL_PLATFORM_TYPE_CURRENT)
#define NUM_ACTION_BAR_ITEMS 3
```

**Riepilogo emery:**

| Costante | emery | basalt (confronto) |
|---|---|---|
| `STATUS_BAR_LAYER_HEIGHT` | **20 px** | 16 px |
| `STATUS_BAR_LAYER_LARGE_BOLD_HEIGHT` | **26 px** | 20 px |
| `ACTION_BAR_WIDTH` | **34 px** | 30 px |
| Icone ActionBar (max) | **28 x 18 px**, "core visivo" ~15x15 px | idem |
| `menu_cell_basic_cell_height()` | **61 px** | 44 px |
| `menu_cell_small_cell_height()` | **42 px** | 34 px |
| `menu_cell_basic_horizontal_inset()` | **10 px** | 5 px |
| margine sinistro titolo/sottotitolo | **34 px** | 30 px |
| `MENU_CELL_BASIC_HEADER_HEIGHT` | 16 px | 16 px |
| `MENU_CELL_BASIC_SEPARATOR_HEIGHT` | 0 px | 0 px |
| `MENU_LAYER_BOTTOM_PADDING` | 20 px | 20 px |
| Timeline Quick View (`TIMELINE_PEEK_HEIGHT`) | **59 px** | 51 px |
| `TIMELINE_PEEK_ICON_BOX_WIDTH` | **34 px** | 30 px |
| `TIMELINE_PEEK_MARGIN` | 5 px | 5 px |

⚠️ **`MENU_CELL_BASIC_CELL_HEIGHT` non è più una costante**: nel firmware attuale è la funzione
`menu_cell_basic_cell_height()`, che dipende dal `PreferredContentSize` di default della
piattaforma. Su emery il default è `Large` (perché `PBL_DISPLAY_HEIGHT >= 200`) → **61 px**.
Con 228 px di altezza entrano quindi **~3,7 celle** (contro 3,8 su basalt): il MenuLayer su emery
è più grande ma non mostra più righe. Se ti serve densità, imposta una `get_cell_height` custom.

### 2.6 Area non ostruita (Timeline Quick View)

Fonte: `sdk-docs/source/_guides/user-interfaces/unobstructed-area.md`.

```c
Layer *root = window_get_root_layer(window);
GRect bounds = layer_get_unobstructed_bounds(root);   // <-- usa SEMPRE questa

UnobstructedAreaHandlers handlers = {
  .will_change = prv_will_change,   // GRect finale
  .change      = prv_change,        // AnimationProgress, chiamata ripetutamente
  .did_change  = prv_did_change
};
unobstructed_area_service_subscribe(handlers, NULL);
```

* L'**unico** overlay di sistema che genera ostruzione oggi è la **Timeline Quick View**.
* Su emery occupa **59 px in basso** (la doc pubblica dice ancora 51 px: valore basalt; il
  sorgente `popups/timeline/peek.h` usa `PREFERRED_CONTENT_SIZE_SWITCH` e su emery
  `PreferredContentSizeDefault == Large` → 59).
* Calcolo robusto a runtime:
  ```c
  GRect full = layer_get_bounds(root);
  GRect unob = layer_get_unobstructed_bounds(root);
  int16_t obstruction_h = full.size.h - unob.size.h;   // 0 oppure 59 su emery
  ```
* Non hardcodare **mai** né 51 né 59.

### 2.7 Margini sicuri consigliati su emery

Non esistono "safe area" imposte dall'hardware (display rettangolare, vetro piatto). Linee guida
pratiche derivate dalle costanti di sistema:

| Zona | Valore consigliato |
|---|---|
| Margine laterale contenuti testuali | **10 px** (= `menu_cell_basic_horizontal_inset()` su emery) |
| Riserva in alto se usi `StatusBarLayer` | **20 px** (26 px in modalità Big & Bold) |
| Riserva a destra se usi `ActionBarLayer` | **34 px** → area utile 166 px |
| Riserva in basso per Quick View | **59 px** (solo se `layer_get_unobstructed_bounds` lo indica) |
| Dead zone touch della status bar | **16 px** in alto (`TOUCH_NAV_STATUS_BAR_DEAD_ZONE_PX`) |
| Area utile "peggior caso" watchapp | 200 - 34 = 166 px x (228 - 20 - 59) = 149 px |

---

## 3. Font di sistema e tipografia su 200x228

### 3.1 Elenco completo delle chiavi font (SDK 4.33)

Fonte: `sdk-docs/source/_guides/app-resources/system-fonts.md` (la pagina mostra un'anteprima
**dedicata per emery** accanto a quella basalt — i font sono gli stessi, cambia solo il rendering).

**Raster Gothic** (testo generico, il più leggibile sul MiP):
`FONT_KEY_GOTHIC_14`, `FONT_KEY_GOTHIC_14_BOLD`, `FONT_KEY_GOTHIC_18`, `FONT_KEY_GOTHIC_18_BOLD`,
`FONT_KEY_GOTHIC_24`, `FONT_KEY_GOTHIC_24_BOLD`, `FONT_KEY_GOTHIC_28`, `FONT_KEY_GOTHIC_28_BOLD`

**Bitham** (serif/display, molto marcato):
`FONT_KEY_BITHAM_30_BLACK`, `FONT_KEY_BITHAM_34_MEDIUM_NUMBERS`, `FONT_KEY_BITHAM_42_BOLD`,
`FONT_KEY_BITHAM_42_LIGHT`, `FONT_KEY_BITHAM_42_MEDIUM_NUMBERS`

**Roboto / Droid Serif**:
`FONT_KEY_ROBOTO_CONDENSED_21`, `FONT_KEY_ROBOTO_BOLD_SUBSET_49`, `FONT_KEY_DROID_SERIF_28_BOLD`

**LECO** (solo numeri, ideale per orologi):
`FONT_KEY_LECO_20_BOLD_NUMBERS`, `FONT_KEY_LECO_26_BOLD_NUMBERS_AM_PM`,
`FONT_KEY_LECO_28_LIGHT_NUMBERS`, `FONT_KEY_LECO_32_BOLD_NUMBERS`, `FONT_KEY_LECO_36_BOLD_NUMBERS`,
`FONT_KEY_LECO_38_BOLD_NUMBERS`, `FONT_KEY_LECO_42_NUMBERS`,
**`FONT_KEY_LECO_60_NUMBERS_AM_PM`**, **`FONT_KEY_LECO_60_BOLD_NUMBERS_AM_PM`**

> Le due LECO da 60 px sono le più grandi disponibili e sono **il font "orologio" naturale su
> emery**: 60 px su 228 di altezza = 26% dello schermo, contro il 36% che occuperebbero su basalt.
> `FONT_KEY_ROBOTO_BOLD_SUBSET_49` è un subset (solo cifre + pochi glifi) e resta valido.

**Nota font custom**: su emery `MAX_FONT_GLYPH_SIZE = 512` (contro 256 sulle piattaforme legacy) —
puoi caricare font TTF custom con glifi molto più grandi. Il changelog SDK 4.9.127 (20/02/2026)
cita esplicitamente *"Maximum font glyph size increased to 512 for emery and gabbro platforms"*.

**Font interni non esposti**: il tema di sistema usa anche `FONT_KEY_GOTHIC_36` /
`FONT_KEY_GOTHIC_36_BOLD` (per `PreferredContentSizeExtraLarge`); non sono nell'elenco pubblico —
non contarci.

### 3.2 Dimensioni consigliate

La *Design & Interaction Guide* ufficiale dice: *"Use larger fonts to highlight the most important
data to be read at a glance. Consider **font size 28** for larger items, and a **minimum of 18**
for smaller ones."* Questi valori sono tarati su 144x168.

Riscalati proporzionalmente per emery (228/168 = 1,357):

| Ruolo | basalt | emery consigliato | Chiave suggerita |
|---|---|---|---|
| Dato principale glanceable | 28 | **≥ 36-42** | `GOTHIC_28_BOLD` è il max Gothic → usa `BITHAM_42_BOLD` o `LECO_42/60` |
| Testo secondario | 18 | **24** | `GOTHIC_24` / `GOTHIC_24_BOLD` |
| Minimo leggibile | 14 | **18** | `GOTHIC_18` |
| Caption / metadati | 14 | 18 | `GOTHIC_18` |

⚠️ **Trappola nota** (già segnalata nel 2016 e ancora valida): il PPI sale da 182 a 202, quindi
**un font di N px è fisicamente più piccolo su PT2 che su Pebble Time**. Non basta tenere le stesse
misure: vanno aumentate almeno del ~11% solo per compensare il PPI, e di più per sfruttare la
diagonale maggiore.

### 3.3 ContentSize / preferenza "Text Size"

Fonte: `sdk-docs/source/_guides/user-interfaces/content-size.md` + `preferred_content_size.h`.

```c
typedef enum PreferredContentSize {
  PreferredContentSizeSmall, PreferredContentSizeMedium,
  PreferredContentSizeLarge, PreferredContentSizeExtraLarge,
  NumPreferredContentSizes,
} PreferredContentSize;

PreferredContentSize preferred_content_size(void);   // API dal SDK 4.2
```

Mapping ufficiale *Settings → Notifications → Text Size* → `ContentSize`:

| Piattaforma | Text Size: Small | Medium | Large |
|---|---|---|---|
| Aplite, Basalt, Chalk, Diorite, Flint | Small | Medium | Large |
| **Emery** | **Medium** | **Large** | **Extra Large** |

* Su emery il **default è `PreferredContentSizeLarge`** (regola nel firmware:
  `#if PBL_DISPLAY_HEIGHT >= 200 → PreferredContentSizeDefault = Large`).
* **Su emery `Small` non è mai raggiungibile**; su tutte le altre piattaforme `ExtraLarge` non lo è.
* Il valore **non cambia durante il runtime**: leggilo una volta in `init()`.
* Il tema di sistema (`system_theme.c`) usa per `Large` (= default emery):
  Header `GOTHIC_24_BOLD`, Title `GOTHIC_28_BOLD`, Body `GOTHIC_28`, Subtitle `GOTHIC_28`,
  Caption `GOTHIC_18`, Footer `GOTHIC_18`, MenuCellTitle `GOTHIC_24_BOLD`,
  MenuCellSubtitle `GOTHIC_24`. **Allinearsi a questi font fa sembrare l'app "di sistema".**

---

## 4. Colore e contrasto: come rendere davvero bene su MiP

### 4.1 Il problema

Il pannello è riflettivo con contrasto ~20:1 e gamut ~17% NTSC. L'emulatore QEMU e il browser
mostrano i colori **RGB222 puri**, che sono molto più saturi di quanto appaiano sul vetro.

Core Devices distribuisce **due palette Aseprite distinte** proprio per questo
(`developer.repebble.com/guides/app-resources/images/`):

* `pebble_colors_uncorrected.aseprite` — *"raw colors, for watch displays"* (i valori RGB222 veri)
* `pebble_colors_sunlight.aseprite` — *"Sunlight, color-corrected for HD displays"* (come appaiono)

Altre palette: `pebble_colors_64.act` (Photoshop), `.ai` (Illustrator), `.pal` (GIMP),
`.gif` (ImageMagick). Tool interattivo: `developer.repebble.com/guides/tools-and-resources/color-picker/`
(ha il toggle **Uncorrected / Sunlight**).

### 4.2 Il fatto tecnico

Sia il color picker ufficiale (`sdk-docs/source/assets/js/tools/color-mapping-sunlight.js`, ©2025)
sia `pebble screenshot` (`pebble-tool/pebble_tool/commands/screenshot.py`, metodo `_correct_colours`)
usano **la stessa identica LUT a 64 voci**. `pebble screenshot` **applica la correzione per
default**; per disattivarla: `--no-correction`.

Esempi (RGB222 SDK → resa reale):

| GColor | SDK | Reso sul vetro |
|---|---|---|
| `GColorRed` | `#FF0000` | **`#E35462`** (rosa/corallo) |
| `GColorGreen` | `#00FF00` | **`#8EE391`** (verde menta pallido) |
| `GColorBlue` | `#0000FF` | **`#0068CA`** |
| `GColorYellow` | `#FFFF00` | **`#FFEEAB`** (quasi bianco!) |
| `GColorLightGray` | `#AAAAAA` | `#ABABAB` |
| `GColorWhite` / `GColorBlack` | `#FFFFFF` / `#000000` | invariati |

### 4.3 Tabella completa: 64 colori ordinati per luminanza reale

Luminanza relativa WCAG calcolata sul **colore corretto** (come appare sul display), con rapporto
di contrasto contro bianco e contro nero. **È la tabella da usare per scegliere le coppie
testo/sfondo.**

| GColor | RGB222 (SDK) | Resa reale (sunlight) | Luminanza L | Contrasto su bianco | Contrasto su nero |
|---|---|---|---|---|---|
| `GColorBlack` | #000000 | #000000 | 0.000 | 21.00:1 | 1.00:1 |
| `GColorOxfordBlue` | #000055 | #001E41 | 0.013 | 16.64:1 | 1.26:1 |
| `GColorBulgarianRose` | #550000 | #4A161B | 0.021 | 14.77:1 | 1.42:1 |
| `GColorImperialPurple` | #550055 | #482748 | 0.033 | 12.66:1 | 1.66:1 |
| `GColorDarkGreen` | #005500 | #2B4A2C | 0.056 | 9.91:1 | 2.12:1 |
| `GColorDukeBlue` | #0000AA | #004387 | 0.058 | 9.76:1 | 2.15:1 |
| `GColorMidnightGreen` | #005555 | #27514F | 0.069 | 8.84:1 | 2.38:1 |
| `GColorIndigo` | #5500AA | #40488A | 0.076 | 8.36:1 | 2.51:1 |
| `GColorArmyGreen` | #555500 | #564E36 | 0.077 | 8.27:1 | 2.54:1 |
| `GColorDarkGray` | #555555 | #545454 | 0.089 | 7.57:1 | 2.77:1 |
| `GColorDarkCandyAppleRed` | #AA0000 | #99353F | 0.097 | 7.15:1 | 2.94:1 |
| `GColorJazzberryJam` | #AA0055 | #983E5A | 0.109 | 6.62:1 | 3.17:1 |
| `GColorCobaltBlue` | #0055AA | #16638D | 0.110 | 6.56:1 | 3.20:1 |
| `GColorLiberty` | #5555AA | #4F6790 | 0.134 | 5.71:1 | 3.68:1 |
| `GColorBlue` | #0000FF | #0068CA | 0.142 | 5.48:1 | 3.83:1 |
| `GColorPurple` | #AA00AA | #955694 | 0.152 | 5.20:1 | 4.04:1 |
| `GColorWindsorTan` | #AA5500 | #9D5B4D | 0.152 | 5.20:1 | 4.04:1 |
| `GColorElectricUltramarine` | #5500FF | #2F6BCC | 0.155 | 5.13:1 | 4.10:1 |
| `GColorRoseVale` | #AA5555 | #9D6064 | 0.165 | 4.89:1 | 4.29:1 |
| `GColorBlueMoon` | #0055FF | #007DCE | 0.191 | 4.35:1 | 4.82:1 |
| `GColorPurpureus` | #AA55AA | #9A7099 | 0.208 | 4.08:1 | 5.15:1 |
| `GColorVeryLightBlue` | #5555FF | #4180D0 | 0.211 | 4.02:1 | 5.22:1 |
| `GColorVividViolet` | #AA00FF | #8F74D2 | 0.230 | 3.75:1 | 5.60:1 |
| `GColorRed` | #FF0000 | #E35462 | 0.235 | 3.68:1 | 5.71:1 |
| `GColorFolly` | #FF0055 | #E25874 | 0.244 | 3.57:1 | 5.88:1 |
| `GColorIslamicGreen` | #00AA00 | #5E9860 | 0.257 | 3.42:1 | 6.14:1 |
| `GColorJaegerGreen` | #00AA55 | #5C9B72 | 0.269 | 3.29:1 | 6.39:1 |
| `GColorKellyGreen` | #55AA00 | #759A64 | 0.278 | 3.20:1 | 6.56:1 |
| `GColorLavenderIndigo` | #AA55FF | #9587D5 | 0.285 | 3.13:1 | 6.70:1 |
| `GColorFashionMagenta` | #FF00AA | #E16AA3 | 0.290 | 3.09:1 | 6.79:1 |
| `GColorOrange` | #FF5500 | #E66E6B | 0.290 | 3.08:1 | 6.81:1 |
| `GColorMayGreen` | #55AA55 | #759D76 | 0.292 | 3.07:1 | 6.84:1 |
| `GColorSunsetOrange` | #FF5555 | #E6727C | 0.303 | 2.97:1 | 7.06:1 |
| `GColorTiffanyBlue` | #00AAAA | #57A5A2 | 0.316 | 2.87:1 | 7.31:1 |
| `GColorCadetBlue` | #55AAAA | #71A6A4 | 0.335 | 2.73:1 | 7.69:1 |
| `GColorBrilliantRose` | #FF55AA | #E37FA7 | 0.343 | 2.67:1 | 7.86:1 |
| `GColorLimerick` | #AAAA00 | #AFA072 | 0.355 | 2.59:1 | 8.09:1 |
| `GColorBrass` | #AAAA55 | #AEA382 | 0.368 | 2.51:1 | 8.36:1 |
| `GColorMagenta` | #FF00FF | #DE83DC | 0.369 | 2.50:1 | 8.39:1 |
| `GColorVividCerulean` | #00AAFF | #4CB4DB | 0.393 | 2.37:1 | 8.86:1 |
| `GColorLightGray` | #AAAAAA | #ABABAB | 0.407 | 2.30:1 | 9.14:1 |
| `GColorPictonBlue` | #55AAFF | #69B5DD | 0.413 | 2.27:1 | 9.25:1 |
| `GColorShockingPink` | #FF55FF | #E194DF | 0.425 | 2.21:1 | 9.50:1 |
| `GColorBabyBlueEyes` | #AAAAFF | #A7BAE2 | 0.488 | 1.95:1 | 10.76:1 |
| `GColorChromeYellow` | #FFAA00 | #F1AA86 | 0.492 | 1.94:1 | 10.83:1 |
| `GColorRajah` | #FFAA55 | #F1AD93 | 0.507 | 1.89:1 | 11.14:1 |
| `GColorMelon` | #FFAAAA | #EFB5B8 | 0.549 | 1.75:1 | 11.97:1 |
| `GColorGreen` | #00FF00 | #8EE391 | 0.627 | 1.55:1 | 13.55:1 |
| `GColorRichBrilliantLavender` | #FFAAFF | #ECC3EB | 0.629 | 1.55:1 | 13.57:1 |
| `GColorMalachite` | #00FF55 | #8EE69E | 0.648 | 1.50:1 | 13.96:1 |
| `GColorBrightGreen` | #55FF00 | #9EE594 | 0.654 | 1.49:1 | 14.09:1 |
| `GColorScreaminGreen` | #55FF55 | #9DE7A0 | 0.669 | 1.46:1 | 14.37:1 |
| `GColorMediumSpringGreen` | #00FFAA | #8AEBC0 | 0.686 | 1.43:1 | 14.73:1 |
| `GColorMediumAquamarine` | #55FFAA | #9BECC2 | 0.709 | 1.38:1 | 15.17:1 |
| `GColorSpringBud` | #AAFF00 | #C9E89D | 0.726 | 1.35:1 | 15.51:1 |
| `GColorInchworm` | #AAFF55 | #C9EAA7 | 0.741 | 1.33:1 | 15.81:1 |
| `GColorCyan` | #00FFFF | #84F5F1 | 0.766 | 1.29:1 | 16.31:1 |
| `GColorMintGreen` | #AAFFAA | #C7F0C8 | 0.786 | 1.26:1 | 16.73:1 |
| `GColorElectricBlue` | #55FFFF | #95F6F2 | 0.787 | 1.25:1 | 16.74:1 |
| `GColorYellow` | #FFFF00 | #FFEEAB | 0.854 | 1.16:1 | 18.07:1 |
| `GColorCeleste` | #AAFFFF | #C3F9F7 | 0.861 | 1.15:1 | 18.21:1 |
| `GColorIcterine` | #FFFF55 | #FFF1B5 | 0.875 | 1.14:1 | 18.50:1 |
| `GColorPastelYellow` | #FFFFAA | #FFF6D3 | 0.919 | 1.08:1 | 19.37:1 |
| `GColorWhite` | #FFFFFF | #FFFFFF | 1.000 | 1.00:1 | 21.00:1 |

### 4.4 Regole pratiche di contrasto per emery

1. **Testo su sfondo: mira a ≥ 4,5:1 sulla colonna "reale", non su quella SDK.**
   Esempi che *sembrano* validi ma non lo sono: `GColorYellow` su bianco = **1,16:1** (illeggibile);
   `GColorGreen` su bianco = 1,55:1; `GColorRed` su bianco = 3,68:1 (marginale).
2. **Coppie eccellenti su sfondo bianco** (contrasto ≥ 5:1): `GColorBlack` (21:1),
   `GColorOxfordBlue` (16,6), `GColorBulgarianRose` (14,8), `GColorImperialPurple` (12,7),
   `GColorDarkGreen` (9,9), `GColorDukeBlue` (9,8), `GColorArmyGreen` (8,3),
   `GColorDarkGray` (7,6), `GColorDarkCandyAppleRed` (7,2), `GColorCobaltBlue` (6,6),
   `GColorBlue` (5,5), `GColorWindsorTan` / `GColorPurple` (5,2).
3. **Coppie eccellenti su sfondo nero** (contrasto ≥ 10:1): `GColorWhite` (21),
   `GColorPastelYellow` (19,4), `GColorIcterine` (18,5), `GColorCeleste` (18,2),
   `GColorYellow` (18,1), `GColorElectricBlue` (16,7), `GColorMintGreen` (16,7),
   `GColorCyan` (16,3), `GColorSpringBud` (15,5), `GColorGreen` (13,6), `GColorMelon` (12,0),
   `GColorRajah` (11,1), `GColorChromeYellow` (10,8), `GColorBabyBlueEyes` (10,8).
4. **Il "dark mode" è la scelta giusta di default su PT2.** Il pannello è riflettivo: il nero è
   un nero vero e i toni chiari saturi rendono benissimo su nero, mentre su bianco quasi tutti
   i colori accesi collassano. Inoltre su MiP il nero **non** consuma di più (a differenza dei
   LCD transmissivi): il consumo dipende dai *cambi* di pixel, non dal colore.
5. **Non affidarti a differenze di tinta con luminanza simile.** Es. `GColorGreen` (L=0,627) e
   `GColorRichBrilliantLavender` (L=0,629) sono indistinguibili senza luce. Usa sempre un salto di
   luminanza, oppure aggiungi forma/spessore.
6. **Grigi:** hai solo 4 livelli grigi puri utili — `GColorBlack` (0,00), `GColorDarkGray` (0,089),
   `GColorLightGray` (0,407), `GColorWhite` (1,00). Non c'è un "mid gray": usa dithering o
   `GColorArmyGreen`/`GColorLiberty` come pseudo-grigi.
7. **Prova sempre senza backlight.** Il backlight è spento di default; usa `light_set_color()` per
   dare carattere quando si accende, non per compensare un contrasto insufficiente.

### 4.5 Immagini, palettizzazione e dithering

Fonte: `sdk-docs/source/_guides/app-resources/images.md`.

Attributi del resource `bitmap` in `package.json`:

| Attributo | Valori | Default |
|---|---|---|
| `memoryFormat` | `Smallest`, `SmallestPalette`, `1Bit`, `8Bit`, `1BitPalette`, `2BitPalette`, `4BitPalette` | `Smallest` |
| `storageFormat` | `pbi`, `png` | — (usa `spaceOptimization`) |
| `spaceOptimization` | `storage`, `memory` | `storage` (su non-Aplite) |
| `targetPlatforms` | array di piattaforme | tutte |
| `menuIcon` | bool, PNG **max 25x25** | false |

```json
{
  "type": "bitmap",
  "name": "IMAGE_EXAMPLE",
  "file": "images/example_image.png",
  "memoryFormat": "SmallestPalette",
  "spaceOptimization": "memory",
  "targetPlatforms": ["emery"]
}
```

**Costi in RAM di una GBitmap su emery (200x228):**

| memoryFormat | bit/px | Full screen 200x228 | Icona 48x48 |
|---|---|---|---|
| `8Bit` | 8 | **45.600 B (35% della RAM app!)** | 2.304 B |
| `4BitPalette` (≤16 colori) | 4 + palette | ~22.800 B | ~1.184 B |
| `2BitPalette` (≤4 colori) | 2 + palette | ~11.400 B | ~592 B |
| `1BitPalette` / `1Bit` | 1 | ~5.700 B | ~288 B |

→ **Usa sempre `SmallestPalette` o un `NBitPalette` esplicito**; `8Bit` full-screen è quasi sempre
un errore su emery. `Smallest` (default) sceglie già il formato più compatto in memoria.

**Dithering** — non c'è un tool ufficiale. Ricette pratiche con ImageMagick (la palette ufficiale
è distribuita come GIF):

```bash
# scarica la palette ufficiale a 64 colori
curl -O https://developer.repebble.com/assets/other/pebble_colors_64.gif

# quantizzazione con dithering Floyd-Steinberg (buona per foto/gradienti)
magick input.png -dither FloydSteinberg -remap pebble_colors_64.gif PNG8:out_emery.png

# quantizzazione senza dithering (nitida, per grafica flat/UI/icone)
magick input.png +dither -remap pebble_colors_64.gif PNG8:out_emery.png

# limitare a 16 colori per usare 4BitPalette (dimezza la RAM)
magick input.png -dither FloydSteinberg -remap pebble_colors_64.gif -colors 16 PNG8:out16.png
```

⚠️ **Il dithering è a doppio taglio su MiP**: aumenta il numero di pixel isolati che cambiano
(più byte dirty, più consumo) e su un pannello a 202 PPI il pattern è visibile. Per UI flat
**preferisci `+dither`** e disegna direttamente con i 64 colori nativi.

Trasparenza: serve **`GCompOpSet`** + PNG con alpha (poi quantizzato a 2 bit di alpha).

```c
graphics_context_set_compositing_mode(ctx, GCompOpSet);
graphics_draw_bitmap_in_rect(ctx, s_bitmap, bitmap_bounds);
// oppure
bitmap_layer_set_compositing_mode(s_bitmap_layer, GCompOpSet);
```

> Dal sorgente `gtypes.h`: *"For color displays, only two compositing modes are supported,
> `GCompOpAssign` and `GCompOpSet`. The behavior of other compositing modes are undefined."*
> Su emery **`GCompOpOr`, `GCompOpAnd`, `GCompOpClear`, `GCompOpAssignInverted` non funzionano
> come su B/N**: non usarli.

### 4.6 Risorse platform-specific: tag per emery

Fonte: `sdk-docs/source/_guides/app-resources/platform-specific.md`.

Tag disponibili per emery: **`rect`, `color`, `emery`, `200w`, `228h`, `compass`, `mic`, `strap`,
`strappower`, `health`** + (da `pebble_sdk_platform.py`, non ancora nella tabella della guida)
**`touch`, `speaker`**.

```text
resources/images/
  bg~bw.png            # aplite, diorite, flint
  bg~color~144w.png    # basalt
  bg~color~200w.png    # emery      <-- il tag di dimensione è il modo migliore
  bg~round.png         # chalk, gabbro
```

Raccomandazione ufficiale: *"We recommend avoiding the platform specific tags (aplite, basalt
etc)"* — usa i tag descrittivi (`color`, `rect`, `200w`, `228h`), così le piattaforme future
riusano automaticamente le tue risorse. Vince il file con **più tag corrispondenti**; ambiguità =
errore di compilazione.

`targetPlatforms` in `package.json` esclude del tutto una risorsa da certe build (risparmio di
spazio nel `.pbw` e nello storage del watch).

### 4.7 Icone e grafica vettoriale (PDC)

* **Menu/launcher icon**: PNG **max 25x25**, `"menuIcon": true`. Su piattaforme a colori i
  watchface usano la modalità *"non-inverting transparent color"* (colore pieno consentito), i
  watchapp la *"non-inverting transparent greyscale"* (viene convertita in grigi per luminanza).
  → Se fai un **watchapp**, disegna l'icona pensando alla **luminanza**, non al colore.
* **ActionBar icons**: max **28 x 18 px**, core visivo consigliato ~**15 x 15 px**.
* **PDC (Pebble Draw Commands)**: vettoriale, `type: "raw"` in `package.json`, API
  `gdraw_command_image_create_with_resource()`, `gdraw_command_image_draw()`,
  `gdraw_command_sequence_*` per animazioni. **Non creabili a runtime**, solo da risorse.
* Conversione: **`svg2pdc.py`** (`github.com/pebble-examples/cards-example/blob/master/tools/svg2pdc.py`).
  ⚠️ La guida ufficiale dice ancora *"Use python 2.x!"*: su Python 3.14 va **portato o eseguito
  con `2to3`** (è uno script breve, la conversione è banale). Supporta **solo** gli elementi SVG
  `g`, `layer`, `path`, `rect`, `polyline`, `polygon`, `line`, `circle` — quindi da Inkscape
  esporta come **"Plain SVG"** dopo aver fatto *Ungroup* completo; da Illustrator usa il profilo
  **SVG Tiny 1.1** con 1 decimale.
* **PDC vs bitmap su emery**: il PDC scala e si deforma a runtime senza artefatti (grande vantaggio
  con la risoluzione più alta) e occupa pochissimo storage; il costo è **CPU a ogni frame**. Per
  icone statiche ridisegnate spesso, un `GBitmap` palettizzato è più veloce.

---

## 5. Compatibilità: cosa succede alle app senza build emery

### 5.1 Il comportamento del 2016 (STORICO, non più il default)

Il post *"4.2-beta4 SDK — Emery Edition!"* (11/10/2016) descriveva la **"Bezel Mode"**: le app non
aggiornate *"appear centered on screen at their original resolution (144x168)"*, con cornice nera.

### 5.2 Il comportamento del firmware 2026 (ATTUALE)

Nel firmware Core Devices esiste `CONFIG_APP_SCALING` (Kconfig: *"Scale legacy lower-resolution
apps to the current display via the compositor"*), attivo **solo su obelix (= Pebble Time 2)**:

```c
// PebbleOS/src/fw/shell/prefs.h
typedef enum LegacyAppRenderMode {
  LegacyAppRenderMode_Bezel           = 0,  // Center with black bezel (original behavior)
  LegacyAppRenderMode_ScalingNearest  = 1,  // Scale to fill screen (nearest-neighbor)
  LegacyAppRenderMode_ScalingBilinear = 2,  // Scale to fill screen (bilinear)
  LegacyAppRenderModeCount
} LegacyAppRenderMode;
```

```c
// PebbleOS/src/fw/shell/normal/prefs.c
static uint8_t s_legacy_app_render_mode = 1; // Default to scaled mode
```

**→ Il default nel 2026 è `ScalingNearest`, non più Bezel.** L'utente può cambiarlo in
**Settings → Display → Legacy Apps**, con le etichette *"Centered"*, *"Scaled (Nearest)"*,
*"Scaled (Bilinear)"* (`src/fw/apps/system/settings/display.c`, commento: *"Legacy App Mode
Settings (Obelix only)"*).

Lo scaling è fatto dal **compositor** in fixed point 16.16 (`compositor.c`), fuori dal budget CPU
dell'app.

### 5.3 Perché lo scaling è brutto (numeri concreti)

* Fattori di scala: **200/144 = 1,3889** e **228/168 = 1,3571** → **non interi e nemmeno uguali**.
* Con nearest-neighbour, alcune colonne/righe sono duplicate e altre no: il testo bitmap-font
  perde uniformità, le linee da 1 px diventano alternate 1/2 px, i cerchi si ovalizzano
  leggermente (aspect ratio distorto del 2,3%).
* Con bilinear, tutto diventa **sfocato** — pessimo su un pannello a basso contrasto.

### 5.4 Quanto framebuffer/RAM ottiene un'app non nativa

```c
// PebbleOS/src/fw/process_management/app_manager.c
if (sdk_platform == PBL_PLATFORM_TYPE_CURRENT) { *size = GSize(DISP_COLS, DISP_ROWS); return; }
switch (sdk_platform) {
  case PlatformTypeAplite:  *size = GSize(LEGACY_2X_DISP_COLS, LEGACY_2X_DISP_ROWS); return; // 144x168
  case PlatformTypeBasalt:
  case PlatformTypeChalk:   *size = GSize(LEGACY_3X_DISP_COLS, LEGACY_3X_DISP_ROWS); return; // 144x168
  case PlatformTypeDiorite:
  case PlatformTypeEmery:
  case PlatformTypeFlint:
  case PlatformTypeGabbro:  *size = GSize(DISP_COLS, DISP_ROWS); return;                     // 200x228
}
```

E la RAM (Kconfig, `prv_get_app_segment_size()`):

| Tipo di app eseguita su emery | Segmento RAM app |
|---|---|
| Binario SDK 2.x (legacy2) | `APP_RAM_APLITE_SEGMENT_SIZE` = **25.952 B** |
| Binario SDK 3.x (legacy3) | `APP_RAM_BASALT_SEGMENT_SIZE` = **67.584 B** |
| **Binario SDK 4.x nativo emery** | `APP_RAM_EMERY_SEGMENT_SIZE` = **135.168 B** |

### 5.5 Conclusione: perché la build emery nativa è obbligatoria per i tuoi obiettivi

| Aspetto | Senza build emery | Con build emery |
|---|---|---|
| Pixel disponibili | 144x168 = 24.192 | **200x228 = 45.600 (+88%)** |
| Nitidezza | scalata (nearest o bilinear) | **1:1, pixel perfect** |
| RAM app | 67.584 B (o 25.952 B) | **135.168 B** |
| Binario massimo | 64 KiB | **128 KiB** |
| Glifi font max | 256 | **512** |
| `PBL_TOUCH`, `PBL_SPEAKER`, `PBL_RGB_BACKLIGHT` | non definiti | **definiti** |
| Alloy (JS nativo) | non disponibile | disponibile |
| Costanti UI (statusbar 20, actionbar 34, cella 61) | valori basalt scalati | **native** |

In `package.json`, `pebble.targetPlatforms` **di default include tutte le piattaforme**. Se il tuo
progetto lo elenca esplicitamente (molti template vecchi hanno
`["aplite","basalt","chalk"]`), **devi aggiungere `emery`** (e `flint`, `gabbro`) o rimuovere del
tutto il campo.

---

## 6. Performance di rendering: cosa è vero e cosa è mito

### 6.1 ❗ Mito da sfatare: "limita l'area di `layer_mark_dirty`"

```c
// PebbleOS/src/fw/applib/ui/layer.c
void layer_mark_dirty(Layer *layer) {
  if (layer->property_changed_proc) layer->property_changed_proc(layer);
  if (layer->window) window_schedule_render(layer->window);
}

// PebbleOS/src/fw/applib/ui/window.c
void window_schedule_render(Window *window) { window->is_render_scheduled = true; }

void window_render(Window *window, GContext *ctx) {
  ...
  layer_render_tree(&window->layer, ctx);   // <- TUTTO l'albero, ogni volta
  window->is_render_scheduled = false;
}
```

**Non esiste alcun dirty-rect per layer.** Marcare "dirty" un layer piccolo o quello radice ha
esattamente lo stesso costo CPU: viene richiamata la `update_proc` di **ogni layer visibile**.

Le ottimizzazioni **vere** sono quindi:

1. **Chiamare `layer_mark_dirty()` il minor numero di volte possibile.** Se aggiorni 3 layer
   nello stesso tick, una sola chiamata basta (è un flag booleano, non una coda).
2. **Ridurre il numero di layer** e rendere ogni `update_proc` economica.
3. **`layer_set_hidden(layer, true)`** salta il nodo e i suoi figli in `layer_render_tree()`
   (`goto node_hidden_do_not_descend`). È il modo migliore per "spegnere" parti di UI.
4. **Usare il clipping**: `layer_render_tree` calcola `clip_box` e **salta la `update_proc` se
   `grect_is_empty(&clip_box)`**. Layer fuori schermo o azzerati non costano nulla.
5. **Aggiornare a `MINUTE_UNIT` invece che `SECOND_UNIT`** nei watchface: `tick_timer_service_subscribe(MINUTE_UNIT, handler)`.
   Con `SECOND_UNIT` ridisegni 1.440 volte più spesso al giorno.

### 6.2 ✅ Ottimizzazione reale: ridurre le righe "dirty" del framebuffer

Il framebuffer **ha** un dirty rect (`framebuffer_mark_dirty_rect()` chiamato dalle primitive di
disegno) e il driver JDI invia solo `[y0..y1]`. Ma:

```c
// PebbleOS/src/fw/applib/ui/window.c — update proc del layer radice
void window_do_layer_update_proc(Layer *layer, GContext* ctx) {
  Window *window = layer_get_window(layer);
  const GColor bg_color = window->background_color;
  if (!gcolor_is_transparent(bg_color)) {          // <-- !!!
    graphics_context_set_fill_color(ctx, bg_color);
    graphics_fill_rect(ctx, &layer->bounds);       // riempie TUTTO lo schermo
  }
}
```

**Per default (`GColorWhite`) ogni singolo render sporca tutte le 228 righe** → 45.600 byte di
conversione RGB222→RGB332 + DMA a ogni frame.

**Trucco ad alto impatto:**

```c
window_set_background_color(s_window, GColorClear);   // a = 0 → gcolor_is_transparent() == true
```

Con lo sfondo trasparente il layer radice **non riempie nulla**, quindi il dirty rect è l'unione
di ciò che i *tuoi* layer disegnano davvero. Se aggiorni solo la fascia delle cifre dei minuti
(es. 60 righe su 228), il trasferimento scende a ~26% e la conversione riga per riga anche.

⚠️ **Contropartita**: i pixel vecchi restano. Devi ridipingere tu l'area che cambia (es.
`graphics_fill_rect` solo sul rettangolo del testo). È esattamente il pattern giusto per un
watchface offline che aggiorna solo l'ora.

### 6.3 Antialiasing

```c
// PebbleOS/src/fw/applib/graphics/graphics.c
.antialiased = !process_manager_compiled_with_legacy2_sdk(),   // default: TRUE

void graphics_context_set_antialiased(GContext* ctx, bool enable) {
#if PBL_COLOR
  ctx->draw_state.antialiased = enable;   // no-op sulle piattaforme B/N
#endif
}
```

* **Attivo di default su emery** (SDK 3/4). È un **no-op su flint** (B/N).
* Costo: per ogni linea/cerchio/arco antialiasato il codice prende un ramo separato
  (`graphics_private.c`, `graphics_circle.c`) che calcola coperture parziali e fa blending per
  pixel — indicativamente **2-3x** il costo della versione non antialiasata.
* **Quando disattivarlo** (`graphics_context_set_antialiased(ctx, false)`):
  - grafica ortogonale (rettangoli, linee orizzontali/verticali): l'AA non serve;
  - animazioni a 30 fps con molti archi/cerchi;
  - sul MiP a basso contrasto i pixel di AA **sbiadiscono i bordi** invece di ammorbidirli — a
    volte il risultato è *visivamente migliore* senza.
* **Quando tenerlo**: lancette d'orologio, archi di progresso, curve grandi. Su un display a
  202 PPI l'AA sulle diagonali fa una differenza reale.
* `graphics_context_set_stroke_width(ctx, n)` accetta **solo valori dispari**.

### 6.4 Costi relativi delle primitive (dal più economico)

| Operazione | Costo | Note |
|---|---|---|
| `graphics_fill_rect` (senza raggio) | **minimo** | memset per riga sul framebuffer 8-bit |
| `graphics_draw_line` orizz./vert. | minimo | riga contigua |
| `graphics_fill_rect` con `corner_radius` | basso | AA sugli angoli |
| `graphics_draw_bitmap_in_rect` (`GCompOpAssign`) | basso | blit diretto |
| `graphics_draw_bitmap_in_rect` (`GCompOpSet`) | medio | test alpha per pixel |
| `graphics_draw_line` diagonale con AA | medio | |
| `graphics_fill_circle` / `graphics_fill_radial` | medio-alto | trigonometria + AA |
| `graphics_draw_text` | **alto** | layout + rasterizzazione glifi |
| `gpath_draw_filled` (GPath) | **alto** | scanline fill di poligono arbitrario |
| `gdraw_command_image_draw` (PDC) | **alto** | interpreta i comandi ogni frame |
| `RotBitmapLayer` | **molto alto** | rotazione per pixel con campionamento inverso |

**Regole:**
* Sostituisci le `GPath` statiche con `GBitmap` palettizzati precalcolati quando la forma non
  cambia mai. Sostituisci le `GPath` *animate* con `graphics_fill_radial` / `graphics_draw_arc`
  quando la forma è un arco (molto più veloce).
* **Evita `RotBitmapLayer` per le lancette**: usa una `GPath` sottile ruotata con
  `gpath_rotate_to()` (`DEG_TO_TRIGANGLE()`), o `graphics_fill_radial()`. `RotBitmapLayer`
  su 200x228 è la cosa più costosa che puoi fare per frame.
* PDC: ottimo per icone che devono scalare/deformarsi, pessimo per contenuto ridisegnato 30 volte
  al secondo.

### 6.5 Testo: la voce di costo più sottovalutata

```c
GSize text_size = graphics_text_layout_get_content_size(
    text, font, bounds, GTextOverflowModeWordWrap, GTextAlignmentCenter);
graphics_draw_text(ctx, text, font, bounds, GTextOverflowModeWordWrap,
                   GTextAlignmentCenter, NULL);   // <-- ultimo arg = layout cache
```

* Il layout (word wrap, misura glifi) è **rifatto a ogni chiamata** se non passi una cache.
* `TextLayer` **ha una cache interna** attivabile: `text_layer_set_should_cache_layout(tl, true)`
  (`text_layer.c`). Viene attivata automaticamente da `text_layer_set_line_spacing_delta()` e
  `text_layer_get_content_size()`. **Attivala esplicitamente** su ogni `TextLayer` il cui testo
  cambia raramente.
* In una `LayerUpdateProc` custom **non chiamare `graphics_text_layout_get_content_size()` a ogni
  frame**: calcolala una volta quando il testo cambia e memorizza la `GSize` in una static.
* `GTextOverflowModeWordWrap` è molto più costoso di `GTextOverflowModeTrailingEllipsis` o
  `GTextOverflowModeFill`. Per un orologio usa testo monoriga e overflow "fill".
* `snprintf()` è costoso: pre-formatta le stringhe in buffer static nel tick handler, **mai**
  nella `update_proc`.
* Su emery hai **`FONT_KEY_LECO_60_*`**: usare un font di sistema è molto più economico (in RAM e
  in storage) che un font custom, perché è già in ROM.

### 6.6 Animazioni: frame rate e costo

```c
// PebbleOS/src/fw/applib/ui/animation.h
#define ANIMATION_DEFAULT_DURATION_MS 250

#if defined(CONFIG_PLATFORM_GABBRO)
#define ANIMATION_TARGET_FRAME_INTERVAL_MS 28
#else
#define ANIMATION_TARGET_FRAME_INTERVAL_MS 33      // 1000ms / 30 Hz  <-- emery
#endif

#if defined(CONFIG_PLATFORM_GABBRO)
#define ANIMATION_RENDER_FRAME_INTERVAL_MS 48      // pannello Sharp limitato a ~21 Hz
#else
#define ANIMATION_RENDER_FRAME_INTERVAL_MS ANIMATION_TARGET_FRAME_INTERVAL_MS  // 33 ms su emery
#endif
```

* **Su emery il sistema anima a 30 Hz** (33 ms/frame). Su gabbro (Round 2) il pannello è limitato
  a ~21 Hz. Su emery hai quindi il frame rate più alto della gamma.
* **Budget per frame: 33 ms.** A 240 MHz sono ~8 milioni di cicli, ma la conversione+DMA
  full-frame ne mangia una parte. Regola pratica: se la tua `update_proc` supera ~10-15 ms
  l'animazione scatta.
* Costo energetico: ogni frame = redraw completo dell'albero + conversione RGB222→RGB332 delle
  righe dirty + DMA LCDC. Il **CPU wake** è il costo dominante, non il pannello (MiP: i pixel
  invariati non consumano).
* API: `animation_set_duration()`, `animation_set_delay()`, `animation_set_curve()`,
  `animation_set_play_count(anim, ANIMATION_DURATION_INFINITE)`,
  `animation_sequence_create()`, `animation_spawn_create()`.
  Progresso normalizzato: `ANIMATION_NORMALIZED_MAX` (`progress * 100 / ANIMATION_NORMALIZED_MAX`).
* **Per un watchface offline con batteria come priorità**: nessuna animazione continua; usa
  animazioni brevi (≤ 500 ms) solo su transizione di minuto/evento, e `AppTimer` puntuali
  (`app_timer_register()`) invece di animazioni infinite.
* La guida ufficiale *Conserving Battery Life* insiste su: aggiornare a `MINUTE_UNIT`,
  disiscriversi dai servizi non usati, evitare `light_enable(true)` prolungato.

### 6.7 Accesso diretto al framebuffer

```c
static void layer_update_proc(Layer *layer, GContext *ctx) {
  GBitmap *fb = graphics_capture_frame_buffer(ctx);      // solo dentro una LayerUpdateProc
  GRect bounds = layer_get_bounds(layer);
  for (int y = 0; y < bounds.size.h; y++) {
    GBitmapDataRowInfo info = gbitmap_get_data_row_info(fb, y);   // UNA volta per riga!
    for (int x = info.min_x; x <= info.max_x; x++) {
      memset(&info.data[x], color.argb, 1);              // 1 byte/pixel su emery
    }
  }
  graphics_release_frame_buffer(ctx, fb);                // OBBLIGATORIO
}
```

* Su emery il framebuffer è **`GBitmapFormat8Bit`** (rettangolare regolare) → `info.min_x == 0`,
  `info.max_x == 199` sempre. Puoi anche usare `gbitmap_get_data()` + `row_size_bytes`, ma
  `gbitmap_get_data_row_info()` è più portabile (necessario su chalk, `8BitCircular`).
* ⚠️ Nota esplicita dalla doc: *"it is only necessary to call `gbitmap_get_data_row_info()` once
  per row. Calling it more often (such as for every pixel) will incur a significant speed penalty."*
* Il framebuffer diretto è **l'unico modo per fare effetti a schermo pieno a 30 fps** su emery
  (plasma, particelle, blur). Il costo è ~45.600 iterazioni: fattibile a 240 MHz se il corpo del
  loop è di pochi cicli, ma **fai i conti**.
* Attenzione: scrivere direttamente **non aggiorna** il dirty rect del framebuffer. Se disegni
  solo via framebuffer, disegna prima un `graphics_fill_rect` sull'area (o usa la `update_proc`
  di un layer che copre l'area) per far marcare le righe.
* Usa `graphics_context_get_framebuffer_size(ctx)` invece di hardcodare 200x228.

### 6.8 Checklist performance/memoria per emery

| ✅ | Azione | Guadagno |
|---|---|---|
| ☐ | `targetPlatforms` include `emery` | +88% pixel, +100% RAM |
| ☐ | `window_set_background_color(w, GColorClear)` + repaint mirato | fino a -75% righe dirty |
| ☐ | Un solo `layer_mark_dirty()` per tick | evita render duplicati |
| ☐ | `MINUTE_UNIT` invece di `SECOND_UNIT` | -98% wake-up |
| ☐ | `layer_set_hidden()` per UI non visibile | salta interi sottoalberi |
| ☐ | `text_layer_set_should_cache_layout(tl, true)` | -layout per frame |
| ☐ | `GSize` del testo memorizzata, non ricalcolata | idem |
| ☐ | `memoryFormat: SmallestPalette` sulle bitmap | fino a -87% RAM bitmap |
| ☐ | Nessuna `GBitmap` full-screen 8-bit | -45.600 B |
| ☐ | `graphics_context_set_antialiased(ctx, false)` per grafica ortogonale | -2/3x su quelle primitive |
| ☐ | `GPath`/`graphics_fill_radial` invece di `RotBitmapLayer` | ordini di grandezza |
| ☐ | `pebble analyze-size` a ogni build | monitoraggio |

---

## 7. Tooling

### 7.1 SDK e ambiente (Linux, senza sudo)

* SDK corrente: **4.33.1** (14/08/2026); emulatore con firmware 4.33.2. Precedenti rilevanti:
  **4.33** (12/08/2026, touch + gesture + binario 128 KiB su emery/gabbro),
  **4.9.127** (20/02/2026, aggiunta di `flint` e `gabbro`, glifi 512, GCC 14, Python 3).
* `pebble-tool` corrente: **v5.0.39** (30/06/2026). Richiede **Python ≥ 3.10** — Python 3.14 va bene.
* Installazione ufficiale (`developer.repebble.com/sdk/`):

  ```bash
  # 1) dipendenze di sistema (RICHIEDONO SUDO — vedi workaround sotto)
  sudo apt install nodejs npm libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g libsndio7.0

  # 2) uv (installabile in user space, niente sudo)
  curl -LsSf https://astral.sh/uv/install.sh | sh     # installa in ~/.local/bin
  uv tool install pebble-tool

  # 3) SDK + toolchain arm-none-eabi + QEMU (scaricati in ~/.pebble-sdk, niente sudo)
  pebble sdk install latest
  ```

* **Vincolo per la tua macchina (no sudo):** solo il punto 1 richiede root. `nodejs`/`npm` li hai
  già. Le librerie servono **solo a QEMU** (l'emulatore). Workaround in user space:

  ```bash
  mkdir -p ~/.local/deb && cd ~/.local/deb
  apt-get download libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g libsndio7.0
  for d in *.deb; do dpkg-deb -x "$d" ~/.local/sysroot; done
  export LD_LIBRARY_PATH="$HOME/.local/sysroot/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
  ```
  (su Ubuntu 26.04 desktop la maggior parte è già presente; realisticamente manca solo `libsndio`.)
  `pebble build` (compilazione, waf + arm-none-eabi) **non** ha bisogno di quelle librerie.

### 7.2 Comandi utili

```bash
pebble new-project my-face                     # crea progetto
pebble build                                   # build di tutte le targetPlatforms
pebble install --emulator emery                # avvia QEMU emery e installa
pebble install --emulator flint                # Pebble 2 Duo
pebble logs --emulator emery                   # stream di APP_LOG
pebble repl --emulator emery                   # REPL Python su libpebble2
pebble analyze-size                            # breakdown per simbolo dell'ELF
pebble login && pebble install --cloudpebble   # installa su watch reale via cloud relay
pebble install --phone 192.168.1.x             # installa su watch reale via Wi-Fi locale
```

Piattaforme emulatore documentate nelle FAQ: `aplite`, `basalt`, `chalk`, `diorite`, **`emery`**.
Il changelog 4.9.127 cita anche le board QEMU `silk_flint`, `snowy_emery`, `spalding_gabbro`, ma
le FAQ non elencano ancora `flint`/`gabbro` come valori di `--emulator` (documentazione in ritardo;
**da verificare sul posto**).

### 7.3 Screenshot e GIF

`pebble screenshot` funziona sia su watch fisico sia su emulatore
(`pebble-tool/pebble_tool/commands/screenshot.py`):

```bash
pebble screenshot                                  # correzione colore ATTIVA di default
pebble screenshot out.png --no-correction          # colori RGB222 grezzi
pebble screenshot --no-open                        # non apre il viewer
pebble screenshot --all-platforms                  # uno screenshot per piattaforma
pebble screenshot --gif-all-platforms --gif-fps 30 # GIF animate per piattaforma (richiede ffmpeg)
```

* **`--no-correction` è la chiave per capire la resa reale**: senza il flag ottieni l'immagine
  "sunlight-corrected", cioè **come appare sul vetro**; con il flag ottieni i colori SDK puri.
  Per valutare il design **guarda sempre la versione corretta** (default).
* Il flusso GIF usa `ffmpeg` con `palettegen=max_colors=64:reserve_transparent=0` e
  `paletteuse=dither=none` — cioè **64 colori senza dithering**, coerente con il display.
* Alternativa GUI (community, Windows): **Pebble Studio** (`github.com/therealjasonlin/pebble-studio`)
  — boot emulatore, Clay settings, controllo del tempo, screenshot + registrazione GIF.

### 7.4 Palette e color tool

| Risorsa | URL |
|---|---|
| Color picker interattivo (Uncorrected / Sunlight) | `developer.repebble.com/guides/tools-and-resources/color-picker/` |
| Photoshop `.act` | `developer.repebble.com/assets/other/pebble_colors_64.act` |
| GIMP `.pal` | `developer.repebble.com/assets/other/pebble_colors_64.pal` |
| ImageMagick `.gif` | `developer.repebble.com/assets/other/pebble_colors_64.gif` |
| Illustrator `.ai` | `developer.repebble.com/assets/other/pebble_colors_64.ai` |
| Aseprite grezzo (colori watch) | `developer.repebble.com/assets/other/pebble_colors_uncorrected.aseprite` |
| Aseprite Sunlight (per monitor HD) | `developer.repebble.com/assets/other/pebble_colors_sunlight.aseprite` |
| LUT Sunlight in JS (leggibile) | `github.com/coredevices/sdk-docs/blob/main/source/assets/js/tools/color-mapping-sunlight.js` |

### 7.5 Font e PDC

* Font custom TTF: entry `"type": "font"` in `package.json` con `"name": "FONT_NAME_28"` (il
  suffisso numerico è la dimensione). Attributi utili: `"characterRegex"` per limitare il set di
  glifi (**riduce moltissimo lo storage**), `"compatibility": "2.7"`.
* `MAX_FONT_GLYPH_SIZE = 512` su emery: puoi usare glifi fino a ~60-80 px senza problemi.
* PDC: `svg2pdc.py` (vedi §4.7). Non c'è un tool ufficiale mantenuto — considera di portarlo a
  Python 3 nel repo del tuo progetto.
* APNG per animazioni bitmap: `GBitmapSequence` (`gbitmap_sequence_create_with_resource()`,
  `gbitmap_sequence_update_bitmap_next_frame()`), risorsa `"type": "raw"`. Le GIF vanno convertite
  in APNG.
* Analisi dimensioni: `pebble analyze-size [--summary] [--verbose]`.

### 7.6 Skill/agent ufficiale

Core Devices pubblica **`github.com/coredevices/pebble-watchface-agent-skill`** — una Agent Skill
per Claude Code che genera watchface Pebble. Contiene template, API reference, drawing guide e
script helper, e **usa `emery` come piattaforma di default**. Vincoli che dichiara: niente
floating point (lookup table per la trigonometria), tick su minuto, distruzione delle risorse negli
unload handler, bounds dinamici. Utile come base di partenza / riferimento incrociato.

---

## 8. Inventario componenti UI e touch (SDK 4.33)

### 8.1 Layer e window disponibili

Dalla struttura di `developer.repebble.com/docs/c/User_Interface/`:

| Componente | Presente | Note su emery |
|---|---|---|
| `Layer` (+ `LayerUpdateProc`) | ✅ | base di tutto |
| `TextLayer` | ✅ | attiva `text_layer_set_should_cache_layout()` |
| `BitmapLayer` | ✅ | usa `GCompOpSet` per la trasparenza |
| `RotBitmapLayer` | ✅ | **costosissimo**, evitare su 200x228 |
| `MenuLayer` | ✅ | cella default **61 px**; scrolla via touch se opt-in |
| `SimpleMenuLayer` | ✅ | wrapper su MenuLayer |
| `ScrollLayer` | ✅ | **non** scrolla da solo via touch: serve un pan recognizer |
| `ActionBarLayer` | ✅ | **34 px** su emery, icone ≤ 28x18 |
| `StatusBarLayer` | ✅ | **20 px** (26 in Big & Bold) |
| `InverterLayer` | ⚠️ | deprecato, comportamento non definito a colori |
| `Window` / `WindowStack` | ✅ | |
| `ActionMenu` | ✅ | attivazione item via tap con touch nav |
| `NumberWindow` | ✅ | |
| `Dictation` (`DictationSession`) | ✅ | `PBL_MICROPHONE` definito su emery |
| `UnobstructedArea` | ✅ | vedi §2.6 |
| `Light` | ✅ | **+ `light_set_color()` / `light_set_color_rgb888()` su emery** |
| `Speaker` | ✅ | **nuovo, `PBL_SPEAKER`** (emery, flint) |
| **`Gesture Recognizers`** | ✅ | **nuovo in SDK 4.9+/4.33** |
| `TouchService` | ✅ | **nuovo, solo `PBL_TOUCH`** |
| `Animation` / `PropertyAnimation` | ✅ | 30 Hz su emery |
| `AppGlance` | ✅ | icona/testo nel launcher |
| `ContentIndicator` | ✅ | |
| `AppExitReason`, `LaunchReason` | ✅ | LaunchReason ora distingue quick-launch singolo/lungo |

### 8.2 Touch API (`TouchService`) — SDK 4.9+ / disponibile su emery

Fonte: `developer.repebble.com/docs/c/Foundation/Event_Service/TouchService/`,
`sdk-docs/source/_guides/events-and-services/touch.md`,
`PebbleOS/src/fw/applib/touch_service.h`.

```c
typedef enum TouchEventType {
  TouchEvent_Touchdown,
  TouchEvent_Liftoff,
  TouchEvent_PositionUpdate,
} TouchEventType;

typedef struct TouchEvent {
  TouchEventType type;
  bool non_navigational;   // true se non c'è una "interaction session" attiva
  int16_t x;
  int16_t y;               // coordinate schermo, stesso spazio dei Layer
} TouchEvent;

typedef void (*TouchServiceHandler)(const TouchEvent *event, void *context);

void touch_service_subscribe(TouchServiceHandler handler, void *context);
void touch_service_unsubscribe(void);
bool touch_service_is_enabled(void);
void app_touch_navigation_enable(bool enable);
```

**Vincoli fondamentali:**

* ⚠️ **Il touch NON è supportato nei watchface.** Citazione letterale dalla guida:
  *"Touch input is currently **not supported in watchfaces**. […] For now, only use the
  `TouchService` from a watchapp."*
* L'utente può disattivare il touch da **Settings → Display → Touch**: controlla sempre
  `touch_service_is_enabled()` (tipicamente nell'handler `appear`).
* Compile-time: `#if defined(PBL_TOUCH)`.
* Il sensore touch **consuma corrente in modo continuo mentre è abilitato**: iscriviti solo quando
  serve, disiscriviti in `disappear`.
* Ogni evento touch **accende il backlight** con l'auto-off di sistema: non serve chiamare
  `light_enable_interaction()`.

### 8.3 Touch Navigation (bridge di sistema)

* Dal **firmware 4.32** il sistema traduce tap/swipe in eventi pulsante: `MenuLayer` scrolla e
  attiva righe, i tap su `ActionBarLayer` sono zonati in up/select/down, gli item di `ActionMenu`
  si attivano al tap.
* Dal **firmware 4.33** la touch navigation è **abilitata di default** a livello di sistema, ma è
  **gated su una "interaction session"**: l'utente deve prima premere un tasto o svegliare
  l'orologio (evita navigazioni accidentali sfiorando il watchface).
* **I watchapp di terze parti sono OPT-OUT per default.** Per abilitare:
  ```c
  app_touch_navigation_enable(true);
  ```
* Per una `Window` che gestisce il touch da sola:
  ```c
  window_set_touch_bridge_disabled(window, true);
  ```
* La fascia superiore di **16 px** (`TOUCH_NAV_STATUS_BAR_DEAD_ZONE_PX`) è dead zone.

### 8.4 Gesture Recognizers

Fonte: `developer.repebble.com/docs/c/User_Interface/Gesture_Recognizers/`.

```c
typedef enum RecognizerEvent {
  RecognizerEvent_Started, RecognizerEvent_Updated,
  RecognizerEvent_Completed, RecognizerEvent_Cancelled,
} RecognizerEvent;

typedef enum PanAxis { PanAxis_Horizontal, PanAxis_Vertical } PanAxis;

typedef enum SwipeDirection {
  SwipeDirection_None, SwipeDirection_Up, SwipeDirection_Down,
  SwipeDirection_Left, SwipeDirection_Right,   // usabile come bitmask
} SwipeDirection;

typedef void (*RecognizerEventCb)(const Recognizer *recognizer, RecognizerEvent event_type);
typedef bool (*RecognizerSimultaneousWithCb)(const Recognizer *r, const Recognizer *with);

Recognizer *tap_recognizer_create(RecognizerEventCb cb, void *user_data);
Recognizer *pan_recognizer_create(RecognizerEventCb cb, void *user_data, PanAxis axis);
Recognizer *swipe_recognizer_create(RecognizerEventCb cb, void *user_data, uint8_t direction_mask);

GPoint tap_recognizer_get_tap_point(const Recognizer *r);
GPoint pan_recognizer_get_total_delta(const Recognizer *r);
GPoint pan_recognizer_get_delta_since_start(const Recognizer *r);   // (0,0) allo Start
GPoint pan_recognizer_get_delta_since_prev(const Recognizer *r);
GPoint pan_recognizer_get_velocity(const Recognizer *r);            // px/s
SwipeDirection swipe_recognizer_get_direction(const Recognizer *r);
GPoint swipe_recognizer_get_velocity(const Recognizer *r);

void recognizer_destroy(Recognizer *r);                 // solo se NON attaccato a una window
void recognizer_set_simultaneous_with(...);
void recognizer_set_fail_after(...);

void window_attach_recognizer(Window *window, Recognizer *r);   // la window ne diventa owner
void window_set_touch_bridge_disabled(Window *window, bool disabled);
```

Esempio ufficiale (scroll a dito di uno `ScrollLayer`):

```c
static void main_window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_scroll = scroll_layer_create(layer_get_bounds(root));
  scroll_layer_set_content_size(s_scroll, GSize(layer_get_bounds(root).size.w, total_h));
  layer_add_child(root, scroll_layer_get_layer(s_scroll));

  window_set_touch_bridge_disabled(window, true);   // NECESSARIO
  Recognizer *pan = pan_recognizer_create(pan_handler, NULL, PanAxis_Vertical);
  window_attach_recognizer(window, pan);            // la window lo distrugge da sé
}
```

⚠️ Bug noto risolto: SDK 4.33.1 (14/08/2026) *"Fixed a crash when adding the new touch recognizers
(`app_touch_navigation_enable()`)"* — il fix è nel **firmware 4.33.2**. Assicurati che l'orologio
sia aggiornato prima di testare la touch nav.

### 8.5 Backlight RGB (esclusiva emery)

```c
void light_enable_interaction(void);            // metodo preferito
void light_enable(bool enable);                 // attenzione alla batteria
bool light_is_on(void);                         // nuovo: true anche durante il fade-out
void light_set_color(GColor color);             // 64 tinte (2 bit/canale)
void light_set_color_rgb888(uint32_t rgb);      // 0x00RRGGBB, gamma completa 8 bit/canale
void light_set_system_color(...);
```

* La tinta **persiste finché l'app è in foreground** e torna al default utente (bianco) all'uscita
  o su notifica di sistema. No-op sulle piattaforme senza backlight a colori.
* `light_is_on()` è utile per **saltare un'animazione quando lo schermo è spento** — ottimo per
  batteria e per il tuo requisito "offline-first".

### 8.6 Altre novità 2026 rilevanti al display

* **Orientamento display / modalità mancini**: il firmware 4.33 espone rotazione e left-handed
  mode (`CONFIG_ORIENTATION_MANAGER`, `display_orientation_is_left()`). Il compositor gestisce lo
  specchiamento; **l'app non deve fare nulla**, ma non presumere che "in alto a destra" sia
  fisicamente dove pensi.
* **Rendering QR code** nel firmware (4.9.127).
* **Arabic text shaping / RTL** (4.9.127) — se fai testo internazionale.
* **Alloy (JavaScript nativo su watch)**: solo **emery e gabbro**, motore Moddable XS 17.8, con
  Piu (dichiarativo) e Poco (procedurale). Per i tuoi obiettivi (performance + memoria minima)
  **C resta la scelta giusta**; la FAQ ufficiale lo dice esplicitamente: *"Write in C when you
  need […] the smallest possible memory footprint."*

---

## 9. Azioni consigliate

### 9.1 Setup progetto (fai questo per primo)

1. **Verifica/forza il target emery** in `package.json`:
   ```json
   "pebble": {
     "sdkVersion": "3",
     "targetPlatforms": ["emery", "flint", "basalt", "diorite", "chalk", "aplite", "gabbro"]
   }
   ```
   oppure **rimuovi del tutto `targetPlatforms`** (il default è "tutte"). Se dimentichi `emery`
   la tua app girerà scalata a 144x168 e con metà RAM.
2. Installa lo SDK con `uv tool install pebble-tool` + `pebble sdk install latest` (nessun sudo
   per queste due). Per QEMU estrai le librerie Debian in `~/.local/sysroot` (§7.1).
3. Verifica subito: `pebble build && pebble install --emulator emery`.
4. Aggiungi al `Makefile`/script: `pebble analyze-size --summary` per tenere d'occhio i 128 KiB.

### 9.2 Layout (per sfruttare davvero i 200x228)

5. **Mai hardcodare 200/228.** Usa sempre:
   ```c
   Layer *root = window_get_root_layer(window);
   GRect bounds = layer_get_unobstructed_bounds(root);
   ```
   e derivane tutto in proporzione (`bounds.size.h / 3`, ecc.).
6. **Sottoscrivi `unobstructed_area_service_subscribe()`** e ricalcola il layout: la Timeline Quick
   View toglie **59 px** in basso su emery. Un watchface che non lo gestisce viene tagliato.
7. Usa le costanti di sistema (`STATUS_BAR_LAYER_HEIGHT`, `ACTION_BAR_WIDTH`,
   `menu_cell_basic_cell_height()`) invece di numeri: sono già per-piattaforma.
8. Leggi `preferred_content_size()` **una volta in `init()`** e scegli i font di conseguenza. Su
   emery aspettati `Large` (default) o `ExtraLarge`.
9. Considera una libreria di scaling percentuale se vuoi un solo layout per tutte le piattaforme:
   **`pebble-scalable`** (Chris Lewis, feb 2026) lavora in millesimi delle dimensioni schermo.
   Ma per il tuo obiettivo "sfruttare al meglio PT2" è **meglio un layout emery dedicato** con
   `#if PBL_DISPLAY_HEIGHT == 228`.

### 9.3 Colore e leggibilità

10. **Progetta in dark mode**: sfondo `GColorBlack`, testo `GColorWhite` / `GColorPastelYellow` /
    `GColorCeleste` / `GColorElectricBlue`. Contrasto reale 16-21:1.
11. **Scegli i colori dalla tabella §4.3** (colonna "resa reale"), mai dalla ruota colori del tuo
    editor. Verifica ogni coppia testo/sfondo con la colonna contrasto.
12. **Bandisci `GColorYellow`/`GColorGreen`/`GColorCyan` su sfondo bianco** (contrasto 1,1-1,6:1).
13. Guarda sempre gli screenshot **con la correzione colore attiva** (default di
    `pebble screenshot`); usa `--no-correction` solo per debug della palette.
14. Usa **massimo 3-4 colori** oltre a bianco/nero. Su un pannello a 20:1 di contrasto le palette
    ricche diventano fango.
15. Sfrutta l'esclusiva PT2: `light_set_color_rgb888()` per tingere il backlight in accordo col
    tema dell'app (es. rosso al mattino, blu di notte).

### 9.4 Performance e batteria (offline-first)

16. **`window_set_background_color(window, GColorClear)`** + repaint mirato dell'area che cambia:
    è la singola ottimizzazione con il rapporto beneficio/costo più alto su questo hardware.
17. **`tick_timer_service_subscribe(MINUTE_UNIT, handler)`**, un solo `layer_mark_dirty()` per tick.
18. **Zero animazioni continue.** Solo transizioni brevi (≤ 500 ms) su cambio di minuto/stato,
    e controlla `light_is_on()` per saltarle a schermo spento.
19. `graphics_context_set_antialiased(ctx, false)` nelle `update_proc` che disegnano solo
    rettangoli/linee ortogonali; lascialo attivo per lancette e archi.
20. `text_layer_set_should_cache_layout(tl, true)` su tutti i `TextLayer`; nelle `update_proc`
    custom memorizza la `GSize` del testo in una static, non ricalcolarla.
21. Bitmap: `"memoryFormat": "SmallestPalette"` (o `2BitPalette`/`4BitPalette` espliciti) +
    `"targetPlatforms": ["emery"]` per gli asset ad alta risoluzione. **Zero bitmap full-screen
    8-bit** (45.600 B = 35% della RAM).
22. Niente `RotBitmapLayer`: lancette con `GPath` + `gpath_rotate_to(path, DEG_TO_TRIGANGLE(deg))`
    oppure `graphics_fill_radial()`.
23. Offline-first: usa `persist_write_*` / `persist_read_*` per la cache dei dati e disegna sempre
    uno stato valido anche senza telefono; non bloccare la UI su `AppMessage`. Verifica
    `connection_service_peek_pebble_app_connection()` e mostra un indicatore discreto.

### 9.5 Touch (solo watchapp, non watchface)

24. Se fai un **watchapp**, valuta `app_touch_navigation_enable(true)` in `init()`: rende
    `MenuLayer`/`ActionBarLayer`/`ActionMenu` immediatamente utilizzabili a dito senza scrivere
    codice touch.
25. Per interazioni custom: `window_set_touch_bridge_disabled(window, true)` +
    `window_attach_recognizer()`. Ricorda che `ScrollLayer` **non** scrolla da solo.
26. Controlla sempre `touch_service_is_enabled()` e fornisci un fallback a pulsanti
    (`#if defined(PBL_TOUCH)` / `#else`). Disiscriviti in `disappear` (consumo del sensore).
27. Per il **watchface** progetta esclusivamente per i 4 pulsanti + flick del polso: il touch è
    esplicitamente disabilitato lì.

### 9.6 Verifica finale prima di pubblicare

28. `pebble screenshot --all-platforms` e confronta emery vs basalt vs flint.
29. Prova sul watch reale **in interni senza backlight** — è la condizione peggiore e la più comune.
30. Testa con la **Timeline Quick View attiva** (nell'emulatore premi Down dal watchface) e con
    **Text Size = Large** (→ `ExtraLarge` su emery).
31. Testa con **Legacy Apps = Centered** e **= Scaled** per capire cosa vedono gli utenti se per
    qualsiasi motivo la build emery non venisse selezionata.

---

## 10. Fonti (URL + data)

### Documentazione ufficiale Core Devices (consultata il 2026-08-24)
* Building for Every Pebble — https://developer.repebble.com/guides/best-practices/building-for-every-pebble/
* Platform (macro) — https://developer.repebble.com/docs/c/Foundation/Platform/
* Platform-specific Resources — https://developer.repebble.com/guides/app-resources/platform-specific/
* System Fonts — https://developer.repebble.com/guides/app-resources/system-fonts/
* Images (palette, memoryFormat) — https://developer.repebble.com/guides/app-resources/images/
* Content Size — https://developer.repebble.com/guides/user-interfaces/content-size/
* Unobstructed Area — https://developer.repebble.com/guides/user-interfaces/unobstructed-area/
* Framebuffer Graphics — https://developer.repebble.com/guides/graphics-and-animations/framebuffer-graphics/
* Drawing Primitives, Images and Text — https://developer.repebble.com/guides/graphics-and-animations/drawing-primitives-images-and-text/
* Vector Graphics (PDC) — https://developer.repebble.com/guides/graphics-and-animations/vector-graphics/
* Converting SVG to PDC — https://developer.repebble.com/guides/app-resources/converting-svg-to-pdc/
* Design & Interaction — Recommended — https://developer.repebble.com/guides/design-and-interaction/recommended/
* Touch (guida) — https://developer.repebble.com/guides/events-and-services/touch/
* TouchService (API) — https://developer.repebble.com/docs/c/Foundation/Event_Service/TouchService/
* Gesture Recognizers (API) — https://developer.repebble.com/docs/c/User_Interface/Gesture_Recognizers/
* Light (API, backlight RGB) — https://developer.repebble.com/docs/c/User_Interface/Light/
* StatusBarLayer / ActionBarLayer / MenuLayer — https://developer.repebble.com/docs/c/User_Interface/Layers/
* Color Picker — https://developer.repebble.com/guides/tools-and-resources/color-picker/
* Hardware Information — https://developer.repebble.com/guides/tools-and-resources/hardware-information/
* Pebble Tool — https://developer.repebble.com/guides/tools-and-resources/pebble-tool/
* FAQ — https://developer.repebble.com/faqs/
* Installazione SDK — https://developer.repebble.com/sdk/

### Changelog SDK (date di rilascio)
* SDK 4.33.1 — 2026-08-14 — https://developer.repebble.com/sdk/changelogs/4.33.1/
* SDK 4.33 — 2026-08-12 — https://developer.repebble.com/sdk/changelogs/4.33/
* SDK 4.9.127 — 2026-02-20 — https://developer.repebble.com/sdk/changelogs/4.9.127/

### Sorgenti primari (GitHub, branch `main`, letti il 2026-08-24)
* PebbleOS — https://github.com/coredevices/pebbleos
  - `src/fw/board/displays/display_obelix.h` (200x228, framebuffer, legacy 144x168)
  - `src/fw/applib/platform.h` (`PBL_PLATFORM_SWITCH`, `PlatformType`)
  - `src/fw/applib/ui/status_bar_layer.h` / `action_bar_layer.h` / `menu_cell_layer.h` / `menu_layer_system_cells.c`
  - `src/fw/applib/ui/layer.c`, `window.c`, `animation.h`
  - `src/fw/applib/graphics/gtypes.h`, `gcolor_definitions.h`, `graphics.c`, `framebuffer.c`
  - `src/fw/shell/prefs.h`, `shell/normal/prefs.c`, `apps/system/settings/display.c` (legacy render mode)
  - `src/fw/services/compositor/compositor.c` (scaling 16.16)
  - `src/fw/drivers/display/sf32lb/display_jdi.c` (ROI per righe, conversione 222→332, <20 ms)
  - `src/fw/popups/timeline/peek.h` (59 px su emery)
  - `src/fw/shell/system_theme.c`, `src/fw/applib/preferred_content_size.h`
  - `src/fw/process_management/app_manager.c`, `Kconfig` (segmenti RAM per piattaforma)
  - `tools/pebble_sdk_platform.py` (tabella completa piattaforme SDK)
* sdk-docs — https://github.com/coredevices/sdk-docs
  - `source/_includes/hardware-platforms.html` (tabella hardware ufficiale)
  - `source/assets/js/tools/color-mapping-sunlight.js` (LUT correzione colore, ©2025)
* pebble-tool v5.0.39 (2026-06-30) — https://github.com/coredevices/pebble-tool
  - `pebble_tool/commands/screenshot.py` (`_correct_colours`, `--no-correction`, GIF)
* Agent Skill ufficiale watchface — https://github.com/coredevices/pebble-watchface-agent-skill

### Blog / annunci / stampa
* "Pebble Mega Update — July 2026" (2026-07-14) — https://repebble.com/blog/pebble-mega-update-july-2026
* "CloudPebble Returns! Plus New Pure JavaScript and Round 2 SDK" (2026-02-20) — https://repebble.com/blog/cloudpebble-returns-plus-pure-javascript-and-round-2-sdk
* "(re)Introducing the Pebble Appstore" (2025-10-09) — https://ericmigi.com/blog/re-introducing-the-pebble-appstore/
* "Introducing two new Pebble watches!" (2025) — https://ericmigi.com/blog/introducing-two-new-pebbleos-watches/
* TechCrunch, "The $225 Pebble Time 2 is a refreshingly fun smartwatch" (2026-08-21) — https://techcrunch.com/2026/08/21/the-225-pebble-time-2-is-a-refreshingly-fun-smartwatch/
* Zephyr — board Pebble Time 2 (pt2) — https://docs.zephyrproject.org/latest/boards/coredevices/pt2/doc/index.html
* Chris Lewis, "Fast Emery Upgrades With Pebble-Scalable" (2026-02-01) — https://blog.chrislewis.me.uk/?post=2026-02-01-Fast-Emery-Upgrades-With-Pebble-Scalable

### STORICO (2016, piattaforma emery originale — NON applicare il comportamento di compatibilità)
* "4.2-beta4 SDK — Emery Edition!" (2016-10-11) — https://developer.rebble.io/blog/2016/10/11/Emery-SDK-Beta/

---

## 11. Domande aperte / da verificare sul campo

1. `pebble install --emulator flint` e `--emulator gabbro`: le FAQ elencano solo aplite/basalt/
   chalk/diorite/emery, ma il changelog 4.9.127 cita le board QEMU `silk_flint` e
   `spalding_gabbro`. **Verificare eseguendo il comando.**
2. La LUT di correzione colore "sunlight" risale al pannello JDI del Pebble Time (2015) ed è
   riusata invariata. Il pannello di PT2 (LPM015M135A) è della stessa famiglia MiP a 64 colori,
   ma **non è confermato che la resa sia identica**. Confrontare uno screenshot corretto con una
   foto del vetro reale.
3. La documentazione pubblica dice ancora **51 px** per la Timeline Quick View; il sorgente dà
   **59 px** su emery. Verificare con `layer_get_unobstructed_bounds()` sull'hardware.
4. Non ho trovato documentazione ufficiale su un tool di dithering fornito da Core Devices: le
   ricette ImageMagick in §4.5 sono mie, testarle.
5. Comportamento esatto del compositor quando **rotazione 180°/left-handed mode** è attiva insieme
   allo scaling legacy: il codice fa il mirror orizzontale in software riga per riga
   (`display_jdi.c`), ma non ho misurato l'impatto sul frame time.
6. `svg2pdc.py` è ancora documentato come Python 2. Non ho verificato se esista un fork Python 3
   ufficiale/mantenuto.
7. Non ho trovato numeri pubblicati (benchmark) sul costo in µs delle singole primitive grafiche
   su SF32LB52J: la classifica in §6.4 è derivata dal codice, non misurata.
