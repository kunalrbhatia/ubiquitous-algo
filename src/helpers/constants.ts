// constants.ts

export const STREAM_URL = 'wss://smartapisocket.angelone.in/smart-stream';
export const GET_MARGIN =
  'https://apiconnect.angelbroking.com/rest/secure/angelbroking/user/v1/getRMS';
export const ORDER_API =
  'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/placeOrder';
export const MODIFY_ORDER_API =
  'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/modifyOrder';
export const CANCEL_ORDER_API =
  'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/cancelOrder';
export const GET_ORDER_BOOK_API =
  'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/getOrderBook';
export const GET_TRAD_BOOK_API =
  'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/getTradeBook';
export const GET_LTP_DATA_API =
  'https://apiconnect.angelbroking.com/order-service/rest/secure/angelbroking/order/v1/getLtpData';
export const SCRIPMASTER =
  'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
export const GET_POSITIONS =
  'https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/getPosition';
export const VARIETY_NORMAL = 'NORMAL';
export const VARIETY_STOPLOSS = 'STOPLOSS';
export const VARIETY_AMO = 'AMO';
export const VARIETY_ROBO = 'ROBO';
export const DELAY = 1000;
export const BIG_DELAY = 15000;
export const SHORT_DELAY = 500;
export const TRANSACTION_TYPE_BUY = 'BUY';
export const TRANSACTION_TYPE_SELL = 'SELL';
export const PORT = 8000;
export const MTMDATATHRESHOLD = 2000;
export const MTMDATATHRESHOLDPOSITIONAL = 10000;
export const STRIKE_DIFFERENCE = 200;
export const STRIKE_DIFFERENCE_POSITIONAL = 500;
export const MESSAGE_NOT_TAKE_TRADE = 'Conditions not right to take trade';
export const ME = 'Kunal';
export const ALGO = 'Algo';
