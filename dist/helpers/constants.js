"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VARIETY_STOPLOSS = exports.VARIETY_ROBO = exports.VARIETY_NORMAL = exports.VARIETY_AMO = exports.TRANSACTION_TYPE_SELL = exports.TRANSACTION_TYPE_BUY = exports.STRIKE_DIFFERENCE_POSITIONAL = exports.STRIKE_DIFFERENCE = exports.STREAM_URL = exports.SHORT_DELAY = exports.SCRIPMASTER = exports.PORT = exports.ORDER_API = exports.MTMDATATHRESHOLDPOSITIONAL = exports.MTMDATATHRESHOLD = exports.MODIFY_ORDER_API = exports.MESSAGE_NOT_TAKE_TRADE = exports.ME = exports.GET_TRAD_BOOK_API = exports.GET_POSITIONS = exports.GET_ORDER_BOOK_API = exports.GET_MARGIN = exports.GET_LTP_DATA_API = exports.DELAY = exports.CANCEL_ORDER_API = exports.BIG_DELAY = exports.ALGO = void 0;
// constants.ts

var STREAM_URL = exports.STREAM_URL = 'wss://omnefeeds.angelbroking.com/NestHtml5Mobile/socket/stream';
var GET_MARGIN = exports.GET_MARGIN = 'https://apiconnect.angelbroking.com/rest/secure/angelbroking/user/v1/getRMS';
var ORDER_API = exports.ORDER_API = 'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/placeOrder';
var MODIFY_ORDER_API = exports.MODIFY_ORDER_API = 'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/modifyOrder';
var CANCEL_ORDER_API = exports.CANCEL_ORDER_API = 'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/cancelOrder';
var GET_ORDER_BOOK_API = exports.GET_ORDER_BOOK_API = 'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/getOrderBook';
var GET_TRAD_BOOK_API = exports.GET_TRAD_BOOK_API = 'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/getTradeBook';
var GET_LTP_DATA_API = exports.GET_LTP_DATA_API = 'https://apiconnect.angelbroking.com/order-service/rest/secure/angelbroking/order/v1/getLtpData';
var SCRIPMASTER = exports.SCRIPMASTER = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
var GET_POSITIONS = exports.GET_POSITIONS = 'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/getPosition';
var VARIETY_NORMAL = exports.VARIETY_NORMAL = 'NORMAL';
var VARIETY_STOPLOSS = exports.VARIETY_STOPLOSS = 'STOPLOSS';
var VARIETY_AMO = exports.VARIETY_AMO = 'AMO';
var VARIETY_ROBO = exports.VARIETY_ROBO = 'ROBO';
var DELAY = exports.DELAY = 1000;
var BIG_DELAY = exports.BIG_DELAY = 15000;
var SHORT_DELAY = exports.SHORT_DELAY = 500;
var TRANSACTION_TYPE_BUY = exports.TRANSACTION_TYPE_BUY = 'BUY';
var TRANSACTION_TYPE_SELL = exports.TRANSACTION_TYPE_SELL = 'SELL';
var PORT = exports.PORT = 8000;
var MTMDATATHRESHOLD = exports.MTMDATATHRESHOLD = 2000;
var MTMDATATHRESHOLDPOSITIONAL = exports.MTMDATATHRESHOLDPOSITIONAL = 10000;
var STRIKE_DIFFERENCE = exports.STRIKE_DIFFERENCE = 200;
var STRIKE_DIFFERENCE_POSITIONAL = exports.STRIKE_DIFFERENCE_POSITIONAL = 500;
var MESSAGE_NOT_TAKE_TRADE = exports.MESSAGE_NOT_TAKE_TRADE = 'Conditions not right to take trade';
var ME = exports.ME = 'Kunal';
var ALGO = exports.ALGO = 'Algo';