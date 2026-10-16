// Браузерная сборка GramJS для SQUAD SOUND (пересборка: scripts/build-telegram.sh)
const { TelegramClient, Api, utils } = require('telegram');
const { StringSession } = require('telegram/sessions');
const bigInt = require('big-integer');
window.GramJS = { TelegramClient, Api, utils, StringSession, bigInt };
