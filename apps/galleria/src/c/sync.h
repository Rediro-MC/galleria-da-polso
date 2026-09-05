/* sync.h — trasporto AppMessage della sync (design D9 rivista in S5a, §5; regola 7 root): callback
 * registrati PRIMA di app_message_open; UNA sola inbox (4.153 B su emery = 41 di intestazioni + 16
 * di margine + 4.096 di DATA; 3.129 B su flint) aperta in init() e mai chiusa (app_message_close()
 * non è esportata dall'SDK 4.33.1); chunk negoziato a ogni JS_READY; outbox esatto da
 * dict_calc_buffer_size (119 B = HELLO con OPEN_MS, v1.9; il messaggio più grande; F4) con una coda di 4 messaggi
 * spediti uno alla volta da outbox_sent/outbox_failed; nessun retry (su
 * APP_MSG_NOT_CONNECTED la coda viene svuotata); 30 s di silenzio in SYNCING → IDLE; mai
 * app_comm_set_sniff_interval (il firmware passa già a 15 ms con traffico > 500 B). La logica del
 * protocollo è in sync_proto.c (puro); qui solo decodifica dei dizionari, dimensioni, timer e log.
 * F1: durante la sync il modello è in hold (model_sync_hold): nessun cambio foto fino a fine sync. */
#ifndef GALLERIA_SYNC_H
#define GALLERIA_SYNC_H

#include <stdbool.h>
#include <stdint.h>

/* Da chiamare in init() DOPO finestra e servizi (le notifiche possono toccare la UI). Registra i
 * callback, apre l'inbox (una volta per esecuzione), negozia il chunk iniziale. */
void sync_init(void);
/* deinit(): timer cancellati, callback deregistrati (nessuna scrittura persist qui). */
void sync_deinit(void);

#endif /* GALLERIA_SYNC_H */
