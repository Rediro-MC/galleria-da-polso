# Test host della logica pura di Galleria (gcc). Flag allineati all'SDK (C99, -Os, -Wall -Wextra
# -Werror, -Wno-unused-parameter) + -funsigned-char perché su ARM EABI `char` è unsigned.
# NON allineabili: size_t/long sono 8 B sull'host → nei moduli puri usare solo tipi a larghezza
# fissa (uint8_t per byte/pixel, uint16_t/uint32_t), mai char/long/size_t in aritmetica.
# Uso: make -C apps/galleria/test            tutti i test (+ selftest Python di photo_prep.py e test JS del PKJS)
#      make -C apps/galleria/test run-test_luma   un solo test
#      make -C apps/galleria/test jstest          solo i test JS del PKJS (b64, album, motore, smoke)
#      make -C apps/galleria/test devtest         solo l'autotest del dev server
#      make -C apps/galleria/test pagecheck       S6: config_page.js e fixture_page.js aggiornati (build_config_page.py --check, gen_page_fixture.py --check)
#      make -C apps/galleria/test logstats        S8: autotest di tools/galleria_logstats.py (riepilogo dei log dell'orologio reale) + test_logstats.py
#      make -C apps/galleria/test cards           S8: test_cards.py (tools/gen_test_cards.py --selftest e --check; salta se manca Pillow)
#      make -C apps/galleria/test browsertest     S6: autotest del client WebDriver (Firefox headless via geckodriver; fuori da `all`)
#      make -C apps/galleria/test clean ; EXTRA_CFLAGS="..." per flag in più
# I test girano con cwd = questa cartella (fixture in fixtures/, generate da photo_prep.py --fixture).
CC      = gcc
CFLAGS  = -std=c99 -Wall -Wextra -Werror -Wno-unused-parameter -Os -g -funsigned-char -I$(SRC_DIR) $(EXTRA_CFLAGS)
EXTRA_CFLAGS ?=
SRC_DIR  = ../src/c
OUT      = build
PYTHON  ?= python3
NODE    ?= node
PHOTO_PREP = ../../../tools/photo_prep.py

TESTS = test_timefmt test_crc test_photo_codec test_luma test_rotation test_storage test_storage_adv test_sync_proto test_model
# S7: test_sync (sync.c compilato INALTERATO su host con lo shim AppMessage/dict) entra in `all` solo se il file esiste.
TESTS += $(if $(wildcard test_sync.c),test_sync,)
# Revisione v1.9 (05/09, F36): test_sync compilato anche come build M (-DGALLERIA_DEBUG_TIMING=1): la riga
# "sync: gap" una sola volta per foto (mai per un PHOTO_END ritrasmesso) e le letture di time_ms della build M.
TESTS += $(if $(wildcard test_sync.c),test_sync_timing,)

all: $(addprefix run-,$(TESTS)) pyselftest jstest devtest dumbtest pagecheck logstats cards

# run-<test>: ricompila se serve ed esegue (FORCE: un target .PHONY non attiverebbe la regola a pattern).
run-%: $(OUT)/% FORCE
	./$<

FORCE:

$(OUT)/test_timefmt: test_timefmt.c $(SRC_DIR)/timefmt.c $(SRC_DIR)/timefmt.h | $(OUT)
	$(CC) $(CFLAGS) -o $@ test_timefmt.c $(SRC_DIR)/timefmt.c

$(OUT)/test_crc: test_crc.c $(SRC_DIR)/crc.c $(SRC_DIR)/crc.h | $(OUT)
	$(CC) $(CFLAGS) -o $@ test_crc.c $(SRC_DIR)/crc.c

$(OUT)/test_photo_codec: test_photo_codec.c $(SRC_DIR)/photo_codec.c $(SRC_DIR)/photo_codec.h $(SRC_DIR)/crc.c $(SRC_DIR)/crc.h | $(OUT)
	$(CC) $(CFLAGS) -o $@ test_photo_codec.c $(SRC_DIR)/photo_codec.c $(SRC_DIR)/crc.c

$(OUT)/test_rotation: test_rotation.c $(SRC_DIR)/rotation.c $(SRC_DIR)/rotation.h $(SRC_DIR)/gal_types.h $(SRC_DIR)/settings.h $(SRC_DIR)/photo_codec.c | $(OUT)
	$(CC) $(CFLAGS) -o $@ test_rotation.c $(SRC_DIR)/rotation.c $(SRC_DIR)/photo_codec.c

# storage.c usa <pebble.h>: viene compilato INALTERATO con lo shim host in shim/ (-Ishim davanti
# a -I$(SRC_DIR), che è già dentro CFLAGS).
$(OUT)/test_storage: test_storage.c shim/pebble.h shim/pebble_shim.c $(SRC_DIR)/storage.c $(SRC_DIR)/storage.h $(SRC_DIR)/gal_types.h $(SRC_DIR)/settings.c $(SRC_DIR)/settings.h $(SRC_DIR)/timefmt.c $(SRC_DIR)/crc.c $(SRC_DIR)/crc.h | $(OUT)
	$(CC) -Ishim $(CFLAGS) -o $@ test_storage.c shim/pebble_shim.c $(SRC_DIR)/storage.c $(SRC_DIR)/settings.c $(SRC_DIR)/timefmt.c $(SRC_DIR)/crc.c

# Revisione v1.9 (05/09): test adversariali aggiuntivi di storage.c (migrazione a metà, album disabilitato,
# ritentativi del timer, open_ms, chiavi legacy): stessa ricetta di test_storage.
$(OUT)/test_storage_adv: test_storage_adv.c shim/pebble.h shim/pebble_shim.c $(SRC_DIR)/storage.c $(SRC_DIR)/storage.h $(SRC_DIR)/gal_types.h $(SRC_DIR)/settings.c $(SRC_DIR)/settings.h $(SRC_DIR)/timefmt.c $(SRC_DIR)/crc.c $(SRC_DIR)/crc.h | $(OUT)
	$(CC) -Ishim $(CFLAGS) -o $@ test_storage_adv.c shim/pebble_shim.c $(SRC_DIR)/storage.c $(SRC_DIR)/settings.c $(SRC_DIR)/timefmt.c $(SRC_DIR)/crc.c

# sync_proto.c e' puro ma trascina storage.c/settings.c (<pebble.h>): stesso trattamento con -Ishim.
$(OUT)/test_sync_proto: test_sync_proto.c shim/pebble.h shim/pebble_shim.c $(SRC_DIR)/sync_proto.c $(SRC_DIR)/sync_proto.h $(SRC_DIR)/storage.c $(SRC_DIR)/storage.h $(SRC_DIR)/settings.c $(SRC_DIR)/settings.h $(SRC_DIR)/timefmt.c $(SRC_DIR)/photo_codec.c $(SRC_DIR)/photo_codec.h $(SRC_DIR)/gal_types.h $(SRC_DIR)/crc.c $(SRC_DIR)/crc.h | $(OUT)
	$(CC) -Ishim $(CFLAGS) -o $@ test_sync_proto.c shim/pebble_shim.c $(SRC_DIR)/sync_proto.c $(SRC_DIR)/storage.c $(SRC_DIR)/settings.c $(SRC_DIR)/timefmt.c $(SRC_DIR)/photo_codec.c $(SRC_DIR)/crc.c

# model.c usa <pebble.h> e le API di ui_photo/ui_time: compilato INALTERATO con lo shim + shim/ui_fake.c
# (ui_photo_*/ui_time_photo_changed finti che registrano le chiamate). Revisione post code-review 29/08 (F1).
$(OUT)/test_model: test_model.c shim/pebble.h shim/pebble_shim.c shim/ui_fake.c shim/ui_fake.h $(SRC_DIR)/ui_photo.h $(SRC_DIR)/ui_time.h $(SRC_DIR)/model.c $(SRC_DIR)/model.h $(SRC_DIR)/storage.c $(SRC_DIR)/storage.h $(SRC_DIR)/settings.c $(SRC_DIR)/settings.h $(SRC_DIR)/rotation.c $(SRC_DIR)/rotation.h $(SRC_DIR)/timefmt.c $(SRC_DIR)/photo_codec.c $(SRC_DIR)/crc.c $(SRC_DIR)/gal_types.h | $(OUT)
	$(CC) -Ishim $(CFLAGS) -o $@ test_model.c shim/pebble_shim.c shim/ui_fake.c $(SRC_DIR)/model.c $(SRC_DIR)/storage.c $(SRC_DIR)/settings.c $(SRC_DIR)/rotation.c $(SRC_DIR)/timefmt.c $(SRC_DIR)/photo_codec.c $(SRC_DIR)/crc.c

$(OUT)/test_luma: test_luma.c $(SRC_DIR)/luma.c $(SRC_DIR)/luma.h | $(OUT)
	$(CC) $(CFLAGS) -o $@ test_luma.c $(SRC_DIR)/luma.c

# S7: sync.c (trasporto AppMessage) compilato INALTERATO con lo shim esteso (app_message_*/dict_*/heap_bytes_*,
# MESSAGE_KEY_*), model.c + rotation.c reali (F1: hold della rotazione durante la sync) e i finti ui_*
# di shim/ui_fake.c (estesi con le ui_time_* usate da sync.c). Pinna F1, F2 (timer di silenzio), F4 (outbox
# esatta + tripwire), coda outbox, decodifica per lunghezza di tupla, negoziazione del chunk.
$(OUT)/test_sync: test_sync.c shim/pebble.h shim/pebble_shim.c shim/ui_fake.c shim/ui_fake.h $(SRC_DIR)/sync.c $(SRC_DIR)/sync.h $(SRC_DIR)/sync_proto.c $(SRC_DIR)/sync_proto.h $(SRC_DIR)/model.c $(SRC_DIR)/model.h $(SRC_DIR)/rotation.c $(SRC_DIR)/rotation.h $(SRC_DIR)/storage.c $(SRC_DIR)/storage.h $(SRC_DIR)/settings.c $(SRC_DIR)/settings.h $(SRC_DIR)/timefmt.c $(SRC_DIR)/photo_codec.c $(SRC_DIR)/crc.c $(SRC_DIR)/gal_types.h $(SRC_DIR)/ui_photo.h $(SRC_DIR)/ui_time.h | $(OUT)
	$(CC) -Ishim $(CFLAGS) -o $@ test_sync.c shim/pebble_shim.c shim/ui_fake.c $(SRC_DIR)/sync.c $(SRC_DIR)/sync_proto.c $(SRC_DIR)/model.c $(SRC_DIR)/rotation.c $(SRC_DIR)/storage.c $(SRC_DIR)/settings.c $(SRC_DIR)/timefmt.c $(SRC_DIR)/photo_codec.c $(SRC_DIR)/crc.c

# Build M di test_sync (F36): stesso file e stesse dipendenze, in piu' -DGALLERIA_DEBUG_TIMING=1 (caso gap_once).
$(OUT)/test_sync_timing: test_sync.c shim/pebble.h shim/pebble_shim.c shim/ui_fake.c shim/ui_fake.h $(SRC_DIR)/sync.c $(SRC_DIR)/sync.h $(SRC_DIR)/sync_proto.c $(SRC_DIR)/sync_proto.h $(SRC_DIR)/model.c $(SRC_DIR)/model.h $(SRC_DIR)/rotation.c $(SRC_DIR)/rotation.h $(SRC_DIR)/storage.c $(SRC_DIR)/storage.h $(SRC_DIR)/settings.c $(SRC_DIR)/settings.h $(SRC_DIR)/timefmt.c $(SRC_DIR)/photo_codec.c $(SRC_DIR)/crc.c $(SRC_DIR)/gal_types.h $(SRC_DIR)/gal_log.h $(SRC_DIR)/ui_photo.h $(SRC_DIR)/ui_time.h | $(OUT)
	$(CC) -Ishim $(CFLAGS) -DGALLERIA_DEBUG_TIMING=1 -o $@ test_sync.c shim/pebble_shim.c shim/ui_fake.c $(SRC_DIR)/sync.c $(SRC_DIR)/sync_proto.c $(SRC_DIR)/model.c $(SRC_DIR)/rotation.c $(SRC_DIR)/storage.c $(SRC_DIR)/settings.c $(SRC_DIR)/timefmt.c $(SRC_DIR)/photo_codec.c $(SRC_DIR)/crc.c


# Autotest del tool Python (pack6/pack1/CRC32 contro i vettori noti; nessuna foto necessaria).
pyselftest:
	$(PYTHON) $(PHOTO_PREP) --selftest

# Test node del PKJS: base64url (src/pkjs/b64.js + fixture test/fixture_photo.js generata da
# ./gen_sync_fixture.py), album (S5b: src/pkjs/album.js + crc.js), motore di sync (S5b:
# src/pkjs/sync.js con l'orologio finto shim/fakewatch.js) e smoke test end-to-end di index.js.
# NODE_PATH=shim risolve require('message_keys') (chiavi generate dall'SDK) e gli shim.
# Node non è una dipendenza dell'SDK: se manca, avvisa e non fa fallire il make.
JSTESTS = test_b64.js test_album.js test_sync_engine.js smoke_s5b.js test_index_retry.js test_devstorage.js test_devpage.js test_pipeline.js test_page.js
jstest:
	@if command -v $(NODE) >/dev/null 2>&1; then \
	  for t in $(JSTESTS); do \
	    if [ -f $$t ]; then echo "== $$t"; NODE_PATH=shim $(NODE) $$t || exit 1; else echo "jstest: $$t assente, saltato"; fi; \
	  done; \
	else echo "jstest: $(NODE) non trovato, test JS saltati"; fi

# Autotest del dev server di S5b (tools/galleria_devserver.py --selftest): avvia un server su
# porta effimera con 3 PNG sintetici ed esercita ogni endpoint (Pillow per le immagini).
DEVSERVER = ../../../tools/galleria_devserver.py
devtest:
	@if [ -f $(DEVSERVER) ]; then $(PYTHON) $(DEVSERVER) --selftest; else echo "devtest: $(DEVSERVER) assente, saltato"; fi

# Revisione 29/08 (F11): durabilità del localStorage di pypkjs (dbm.dumb) con removeItem+setItem e
# SIGKILL simulato (os._exit): solo stdlib.
dumbtest:
	@if [ -f test_dumb_durability.py ]; then $(PYTHON) test_dumb_durability.py; else echo "dumbtest: test_dumb_durability.py assente, saltato"; fi

$(OUT):
	mkdir -p $(OUT)

clean:
	rm -rf $(OUT)

# S6: la config page inlinata (src/pkjs/config_page.js) e la fixture del round trip (fixture_page.js)
# sono generate: --check fallisce se non sono aggiornate rispetto a src/pkjs/config/ e photo_prep.py.
BUILD_PAGE = ../../../tools/build_config_page.py
BROWSER_TOOL = ../../../tools/galleria_browser.py
FONT_PREVIEWS = ../../../tools/gen_font_previews.py
pagecheck:
	@if [ -f $(BUILD_PAGE) ]; then $(PYTHON) $(BUILD_PAGE) --check; else echo "pagecheck: $(BUILD_PAGE) assente, saltato"; fi
	@if [ -f gen_page_fixture.py ]; then $(PYTHON) gen_page_fixture.py --check; else echo "pagecheck: gen_page_fixture.py assente, saltato"; fi
	@if [ -f $(FONT_PREVIEWS) ]; then $(PYTHON) $(FONT_PREVIEWS) --check; else echo "pagecheck: $(FONT_PREVIEWS) assente, saltato"; fi

# S8: riepilogo dei log catturati sull'orologio reale (tools/galleria_logstats.py): autotest del tool
# (--selftest, solo stdlib) + test_logstats.py sulle fixture in fixtures/logs/. Saltato se i file mancano.
LOGSTATS = ../../../tools/galleria_logstats.py
logstats:
	@if [ -f $(LOGSTATS) ]; then $(PYTHON) $(LOGSTATS) --selftest; else echo "logstats: $(LOGSTATS) assente, saltato"; fi
	@if [ -f test_logstats.py ]; then $(PYTHON) test_logstats.py; else echo "logstats: test_logstats.py assente, saltato"; fi

# S8: test card per soglie luma/LUT (tools/gen_test_cards.py): --selftest + --check in una dir temporanea.
cards:
	@if [ -f test_cards.py ]; then $(PYTHON) test_cards.py; else echo "cards: test_cards.py assente, saltato"; fi

# Autotest del client WebDriver (S6): serve Firefox + geckodriver; non fa parte di `all`.
browsertest:
	@if [ -f $(BROWSER_TOOL) ]; then $(PYTHON) $(BROWSER_TOOL) --selftest; else echo "browsertest: $(BROWSER_TOOL) assente, saltato"; fi

.PHONY: all clean pyselftest jstest devtest dumbtest pagecheck logstats cards browsertest FORCE
