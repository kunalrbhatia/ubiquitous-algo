export interface ISmartApiData {
  jwtToken: string;
  refreshToken: string;
  feedToken: string;
}
export type Credentails = {
  APIKEY: string;
  CLIENT_CODE: string;
  CLIENT_PIN: string;
  CLIENT_TOTP_PIN: string;
};
export type bodyType = {
  api_key: string;
  client_code: string;
  client_pin: string;
  client_totp_pin: string;
};
export type reqType = { body: bodyType };
export enum TradeType {
  POSITIONAL = 'positional',
  INTRADAY = 'intraday',
}
export type Scrips = {
  name: string;
  price: number;
  sl: number;
  tsl: number;
};
export type runOrbType = {
  scrips: Scrips[];
};
export type getLtpDataType = {
  exchange: string;
  tradingsymbol: string;
  symboltoken: string;
};
export type LtpDataType = {
  exchange: string;
  tradingsymbol: string;
  symboltoken: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ltp: number;
};
export type updateMaxSlType = { mtm: number; maxSl: number; trailSl: number };
export type delayType = {
  milliSeconds: number | undefined | string;
};
export type doOrderType = {
  tradingsymbol: string;
  symboltoken: string;
  transactionType: string | undefined;
  productType?: 'DELIVERY' | 'CARRYFORWARD' | 'MARGIN' | 'INTRADAY' | 'BO';
  qty: number;
};
export type doOrderResponse = {
  status: boolean;
  message: string;
  errorcode: string;
  data: {
    script: string;
    orderid: string;
  };
};
export type getScripType = {
  scriptName: string;
  strikePrice?: string;
  optionType?: 'CE' | 'PE';
  expiryDate: string;
};
export type scripMasterResponse = {
  token: string;
  symbol: string;
  name: string;
  expiry: string;
  strike: string;
  lotsize: string;
  instrumenttype: string;
  exch_seg: string;
  tick_size: string;
};
export type ScripResponse = {
  token: string;
  symbol: string;
  name: string;
  expiry: string;
  strike: string;
  lotsize: string;
  instrumenttype: string;
  exch_seg: string;
  tick_size: string;
};
export type TimeComparisonType = { hours: number; minutes: number };
export type OpenWebsocketType = {
  optionScrips: scripMasterResponse[];
  hasExistingTrades: [] | Position[];
  scrips: Scrips[];
};
export type Position = {
  symboltoken: string;
  symbolname: string;
  instrumenttype: string;
  priceden: string;
  pricenum: string;
  genden: string;
  gennum: string;
  precision: string;
  multiplier: string;
  boardlotsize: string;
  exchange: string;
  producttype: string;
  tradingsymbol: string;
  symbolgroup: string;
  strikeprice: string;
  optiontype: 'CE' | 'PE';
  expirydate: string;
  lotsize: string;
  cfbuyqty: string;
  cfsellqty: string;
  cfbuyamount: string;
  cfsellamount: string;
  buyavgprice: string;
  sellavgprice: string;
  avgnetprice: string;
  netvalue: string;
  netqty: string;
  totalbuyvalue: string;
  totalsellvalue: string;
  cfbuyavgprice: string;
  cfsellavgprice: string;
  totalbuyavgprice: string;
  totalsellavgprice: string;
  netprice: string;
  buyqty: string;
  sellqty: string;
  buyamount: string;
  sellamount: string;
  pnl: string;
  realised: string;
  unrealised: string;
  ltp: string;
  close: string;
};
export type Tick = {
  subscription_mode: string;
  exchange_type: string;
  token: string;
  sequence_number: string;
  exchange_timestamp: string;
  last_traded_price: string;
};
