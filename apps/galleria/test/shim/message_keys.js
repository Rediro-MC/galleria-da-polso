/* message_keys.js — shim per i test node del PKJS: le stesse chiavi che l'SDK genera dal
 * package.json (messageKeys, in ordine: MESSAGE_KEY_* = 10000…). In node `require('message_keys')`
 * lo trova con NODE_PATH=shim (test/Makefile). */
var NAMES = ['MSG', 'PROTO', 'MAX_CHUNK', 'SLOTS', 'COUNT', 'SLOT', 'PHOTO_ID', 'FORMAT', 'LENGTH',
             'CRC', 'OFFSET', 'DATA', 'CODE', 'ORDER', 'SETTINGS', 'REPLY_TO'];
var keys = {};
for (var i = 0; i < NAMES.length; i++) { keys[NAMES[i]] = 10000 + i; }
module.exports = keys;
