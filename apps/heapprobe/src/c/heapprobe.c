// App sonda di memoria (Fase 0) — vedi docs/ricerca/gap-1-memoria-emery.md §6
#include <pebble.h>

static Window *s_window;
static Layer *s_layer;
static bool s_probe_done;

// Decommentare per verificare che .bss costi heap 1:1 (atteso: free scende di 8192 B)
// static uint8_t s_pad[8 * 1024];

static void prv_log_heap(const char *tag) {
  APP_LOG(APP_LOG_LEVEL_INFO, "[%s] heap free=%u used=%u",
          tag, (unsigned)heap_bytes_free(), (unsigned)heap_bytes_used());
}

static void prv_probe(void) {
  static const size_t kSizesKiB[] = {8, 16, 32, 64, 96, 112, 120, 124, 128};
  for (size_t i = 0; i < ARRAY_LENGTH(kSizesKiB); i++) {
    const size_t bytes = kSizesKiB[i] * 1024;
    uint8_t *p = malloc(bytes);
    APP_LOG(APP_LOG_LEVEL_INFO, "malloc(%u KiB) -> %s (free after=%u)",
            (unsigned)kSizesKiB[i], p ? "OK" : "NULL", (unsigned)heap_bytes_free());
    if (p) { memset(p, 0xA5, bytes); free(p); }
  }
  void *blocks[32]; int n = 0;
  while (n < 32 && (blocks[n] = malloc(8 * 1024)) != NULL) n++;
  APP_LOG(APP_LOG_LEVEL_INFO, "8 KiB blocks alive at once: %d (free=%u)", n, (unsigned)heap_bytes_free());
  for (int i = 0; i < n; i++) free(blocks[i]);
  GBitmap *bmp = gbitmap_create_blank(GSize(PBL_DISPLAY_WIDTH, PBL_DISPLAY_HEIGHT),
                                      PBL_IF_COLOR_ELSE(GBitmapFormat8Bit, GBitmapFormat1Bit));
  APP_LOG(APP_LOG_LEVEL_INFO, "full-screen GBitmap %dx%d -> %s (free=%u)", PBL_DISPLAY_WIDTH, PBL_DISPLAY_HEIGHT,
          bmp ? "OK" : "NULL", (unsigned)heap_bytes_free());
  if (bmp) gbitmap_destroy(bmp);
  prv_log_heap("after probe");
  APP_LOG(APP_LOG_LEVEL_INFO, "PROBE DONE platform=%s", PBL_IF_COLOR_ELSE("color", "bw"));
}

static void prv_update_proc(Layer *layer, GContext *ctx) {
  graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkCandyAppleRed, GColorBlack));
  graphics_fill_rect(ctx, layer_get_bounds(layer), 0, GCornerNone);
  if (!s_probe_done) {
    s_probe_done = true;
    prv_log_heap("first render");
    prv_probe();
  }
}

static void prv_window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_layer = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_layer, prv_update_proc);
  layer_add_child(root, s_layer);
  prv_log_heap("window_load");
}

static void prv_window_unload(Window *window) { layer_destroy(s_layer); }

static void prv_init(void) {
  prv_log_heap("main entry");
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load, .unload = prv_window_unload,
  });
  window_stack_push(s_window, true);
  prv_log_heap("after init");
}

static void prv_deinit(void) { window_destroy(s_window); }

int main(void) { prv_init(); app_event_loop(); prv_deinit(); }
