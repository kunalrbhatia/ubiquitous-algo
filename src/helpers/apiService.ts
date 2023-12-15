import { get, isArray } from 'lodash';
let { SmartAPI } = require('smartapi-javascript');
const totp = require('totp-generator');
import {
  ISmartApiData,
  LtpDataType,
  ScripResponse,
  doOrderResponse,
  doOrderType,
  getLtpDataType,
  getScripType,
  runOrbType,
  scripMasterResponse,
} from '../app.interface';
import DataStore from '../store/dataStore';
import {
  ALGO,
  DELAY,
  GET_LTP_DATA_API,
  GET_POSITIONS,
  ORDER_API,
  SCRIPMASTER,
  TRANSACTION_TYPE_BUY,
  TRANSACTION_TYPE_SELL,
} from './constants';
import axios, { AxiosResponse } from 'axios';
import {
  delay,
  getAtmStrikePrice,
  getLastThursdayOfCurrentMonth,
  getLotSize,
  isCurrentTimeGreater,
  updateMaxSl,
} from './functions';
import SmartSession from '../store/smartSession';
import { Response } from 'express';
export const generateSmartSession = async (): Promise<ISmartApiData> => {
  const cred = DataStore.getInstance().getPostData();
  const smart_api = new SmartAPI({
    api_key: cred.APIKEY,
  });
  const TOTP = totp(cred.CLIENT_TOTP_PIN);
  return smart_api
    .generateSession(cred.CLIENT_CODE, cred.CLIENT_PIN, TOTP)
    .then(async (response: object) => {
      return get(response, 'data');
    })
    .catch((ex: object) => {
      console.log(`${ALGO}: generateSmartSession failed error below`);
      console.log(ex);
      throw ex;
    });
};
export const getLtpData = async ({
  exchange,
  tradingsymbol,
  symboltoken,
}: getLtpDataType): Promise<LtpDataType> => {
  const smartInstance = SmartSession.getInstance();
  await delay({ milliSeconds: DELAY });
  const smartApiData: ISmartApiData = smartInstance.getPostData();
  const jwtToken = get(smartApiData, 'jwtToken');
  const data = JSON.stringify({ exchange, tradingsymbol, symboltoken });
  const cred = DataStore.getInstance().getPostData();
  const config = {
    method: 'post',
    url: GET_LTP_DATA_API,
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
      'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
      'X-MACAddress': 'MAC_ADDRESS',
      'X-PrivateKey': cred.APIKEY,
    },
    data: data,
  };
  try {
    const response = await axios(config);
    return get(response, 'data.data', {}) || {};
  } catch (error) {
    console.log(`${ALGO}: the GET_LTP_DATA_API failed error below`);
    console.log(error);
    throw error;
  }
};
export const getPositions = async () => {
  await delay({ milliSeconds: DELAY });
  const smartInstance = SmartSession.getInstance();
  await delay({ milliSeconds: DELAY });
  const smartApiData: ISmartApiData = smartInstance.getPostData();
  const jwtToken = get(smartApiData, 'jwtToken');
  const cred = DataStore.getInstance().getPostData();
  let config = {
    method: 'get',
    url: GET_POSITIONS,
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
      'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
      'X-MACAddress': 'MAC_ADDRESS',
      'X-PrivateKey': cred.APIKEY,
    },
    data: '',
  };
  return axios(config)
    .then(function (response: object) {
      return get(response, 'data');
    })
    .catch(function (error: object) {
      const errorMessage = `${ALGO}: getPositions failed error below`;
      console.log(errorMessage);
      console.log(error);
      throw error;
    });
};
export const doOrder = async ({
  tradingsymbol,
  transactionType,
  symboltoken,
  productType = 'CARRYFORWARD',
  qty,
}: doOrderType): Promise<doOrderResponse> => {
  const smartInstance = SmartSession.getInstance();
  await delay({ milliSeconds: DELAY });
  const smartApiData: ISmartApiData = smartInstance.getPostData();
  const jwtToken = get(smartApiData, 'jwtToken');
  let data = JSON.stringify({
    exchange: 'NFO',
    tradingsymbol,
    symboltoken,
    quantity: qty,
    disclosedquantity: qty,
    transactiontype: transactionType,
    ordertype: 'MARKET',
    variety: 'NORMAL',
    producttype: productType,
    duration: 'DAY',
  });
  console.log(`${ALGO}: doOrder data `, data);
  const cred = DataStore.getInstance().getPostData();
  let config = {
    method: 'post',
    url: ORDER_API,
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
      'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
      'X-MACAddress': 'MAC_ADDRESS',
      'X-PrivateKey': cred.APIKEY,
    },
    data: data,
  };
  return axios(config)
    .then((response: AxiosResponse) => {
      return get(response, 'data');
    })
    .catch(function (error: Response) {
      const errorMessage = `${ALGO}: doOrder failed error below`;
      console.log(errorMessage);
      console.log(error);
      throw error;
    });
};
export const fetchData = async (): Promise<scripMasterResponse[]> => {
  return await axios
    .get(SCRIPMASTER)
    .then((response: AxiosResponse) => {
      let acData: ScripResponse[] = get(response, 'data', []) || [];
      console.log(
        `${ALGO}: response if script master api loaded and its length is ${acData.length}`
      );
      let scripMaster = acData.map((element, index) => {
        return {
          ...element,
          label: get(element, 'name', 'NONAME') || 'NONAME',
          key: '0' + index + get(element, 'token', '00') || '00',
        };
      });
      return scripMaster;
    })
    .catch((evt: object) => {
      console.log(`${ALGO}: fetchData failed error below`);
      throw evt;
    });
};
export const getStocks = async ({
  scriptName,
  strike,
}: {
  scriptName: string;
  strike: string;
}) => {
  await delay({ milliSeconds: DELAY });
  let scripMaster: scripMasterResponse[] = await fetchData();
  console.log(
    `${ALGO}: scriptName: ${scriptName}, is scrip master an array: ${isArray(
      scripMaster
    )}, its length is: ${scripMaster.length}`
  );
  if (scriptName && isArray(scripMaster) && scripMaster.length > 0) {
    console.log(`${ALGO}: all check cleared getScrip call`);
    let filteredScrip = scripMaster.filter((scrip) => {
      const _scripName: string = get(scrip, 'symbol', '') || '';
      return (
        _scripName.includes(scriptName) &&
        get(scrip, 'exch_seg') === 'NFO' &&
        _scripName.includes(strike)
      );
    });
    //console.log('filteredScrip: ', filteredScrip);
    if (filteredScrip.length >= 1) return filteredScrip;
    else throw new Error('stock(s) not found');
  } else {
    const errorMessage = `${ALGO}: getStock failed`;
    console.log(errorMessage);
    throw errorMessage;
  }
};
export const getStock = async ({ scriptName }: { scriptName: string }) => {
  await delay({ milliSeconds: DELAY });
  let scripMaster: scripMasterResponse[] = await fetchData();
  console.log(
    `${ALGO}: scriptName: ${scriptName}, is scrip master an array: ${isArray(
      scripMaster
    )}, its length is: ${scripMaster.length}`
  );
  if (scriptName && isArray(scripMaster) && scripMaster.length > 0) {
    console.log(`${ALGO}: all check cleared getScrip call`);
    let filteredScrip = scripMaster.filter((scrip) => {
      const _scripName: string = get(scrip, 'symbol', '') || '';
      return (
        _scripName === scriptName.concat('-EQ') &&
        get(scrip, 'exch_seg') === 'NSE'
      );
    });
    //console.log('filteredScrip: ', filteredScrip);
    if (filteredScrip.length === 1) return filteredScrip[0];
    else throw new Error('stock not found');
  } else {
    const errorMessage = `${ALGO}: getStock failed`;
    console.log(errorMessage);
    throw errorMessage;
  }
};
export const getOption = async ({
  scriptName,
  strikePrice,
  optionType,
  expiryDate,
}: getScripType): Promise<scripMasterResponse[]> => {
  await delay({ milliSeconds: DELAY });
  let scripMaster: scripMasterResponse[] = await fetchData();
  console.log(
    `${ALGO}: scriptName: ${scriptName}, is scrip master an array: ${isArray(
      scripMaster
    )}, its length is: ${scripMaster.length}`
  );
  if (scriptName && isArray(scripMaster) && scripMaster.length > 0) {
    console.log(`${ALGO}: all check cleared getScrip call`);
    let scrips = scripMaster.filter((scrip) => {
      const _scripName: string = get(scrip, 'name', '') || '';
      const _symbol: string = get(scrip, 'symbol', '') || '';
      const _expiry: string = get(scrip, 'expiry', '') || '';
      return (
        (_scripName.includes(scriptName) || _scripName === scriptName) &&
        get(scrip, 'exch_seg') === 'NFO' &&
        get(scrip, 'instrumenttype') === 'OPTSTK' &&
        (strikePrice === undefined || _symbol.includes(strikePrice)) &&
        (optionType === undefined || _symbol.includes(optionType)) &&
        _expiry === expiryDate
      );
    });
    scrips.sort(
      (curr: object, next: object) =>
        get(curr, 'token', 0) - get(next, 'token', 0)
    );
    scrips = scrips.map((element: object, index: number) => {
      return {
        exch_seg: get(element, 'exch_seg', '') || '',
        expiry: get(element, 'expiry', '') || '',
        instrumenttype: get(element, 'instrumenttype', '') || '',
        lotsize: get(element, 'lotsize', '') || '',
        name: get(element, 'name', '') || '',
        strike: get(element, 'strike', '') || '',
        symbol: get(element, 'symbol', '') || '',
        tick_size: get(element, 'tick_size', '') || '',
        token: get(element, 'token', '') || '',
        label: get(element, 'name', 'NoName') || 'NoName',
        key: index.toString(),
      };
    });
    return scrips;
  } else {
    const errorMessage = `${ALGO}: getScrip failed`;
    console.log(errorMessage);
    throw errorMessage;
  }
};
const takeOrbTrade = async ({
  scrip,
  tradeDirection,
  price,
}: {
  scrip: scripMasterResponse;
  tradeDirection: 'up' | 'down';
  price: number;
}) => {
  let optionScrip: scripMasterResponse | null = null;
  console.log(`${ALGO}: fetching open positions ...`);
  await delay({ milliSeconds: DELAY });
  let positionsResponse = await getPositions();
  let positionsData = get(positionsResponse, 'data', []) ?? [];
  if (Array.isArray(positionsData) && positionsData.length > 0) {
    const position = positionsData.filter((position) => {
      if (get(position, 'name') === scrip.name) return position;
    });
    console.log(`${ALGO}: position: `, position);
    if (position.length === 0) {
      console.log(`${ALGO}: position not found for the selected scrip`);
      console.log(`${ALGO}: fetching current price of the selected scrip...`);
      await delay({ milliSeconds: DELAY });
      const scripData = await getLtpData({
        exchange: scrip.exch_seg,
        symboltoken: scrip.token,
        tradingsymbol: scrip.symbol,
      });
      console.log(
        `${ALGO}: current price of the selected scrip is ${scripData.ltp}`
      );
      console.log(`${ALGO}: calculating ATM strike price ...`);
      await delay({ milliSeconds: DELAY });
      const atm = await getAtmStrikePrice({ scrip, ltp: scripData.ltp });
      console.log(`${ALGO}: ATM strike price is `, atm);
      console.log(
        `${ALGO}: Direction is ${tradeDirection}, ltp is ${scripData.ltp}, user given price is ${price}`
      );
      if (tradeDirection === 'up' && scripData.ltp > price) {
        console.log(`${ALGO}: fetching ce option ...`);
        await delay({ milliSeconds: DELAY });
        const getCeScrip = await getOption({
          scriptName: scrip.name,
          strikePrice: atm.toString(),
          optionType: 'CE',
          expiryDate: getLastThursdayOfCurrentMonth(),
        });
        console.log(`${ALGO}: ce option `, getCeScrip);
        if (getCeScrip.length === 1) {
          optionScrip = getCeScrip[0];
          await delay({ milliSeconds: DELAY });
          const doOrderResponse = await doOrder({
            tradingsymbol: get(getCeScrip[0], 'symbol', '') || '',
            symboltoken: get(getCeScrip[0], 'token', '') || '',
            qty: getLotSize({ scrip: getCeScrip[0] }),
            transactionType: TRANSACTION_TYPE_BUY,
            productType: 'INTRADAY',
          });
          console.log(`${ALGO}: order status: `, doOrderResponse);
        }
      } else if (tradeDirection === 'down' && scripData.ltp < price) {
        console.log(`${ALGO}: fetching pe option ...`);
        await delay({ milliSeconds: DELAY });
        const getPeScrip = await getOption({
          scriptName: scrip.name,
          strikePrice: atm.toString(),
          optionType: 'PE',
          expiryDate: getLastThursdayOfCurrentMonth(),
        });
        console.log(`${ALGO}: pe option `, getPeScrip);
        if (getPeScrip.length === 1) {
          optionScrip = getPeScrip[0];
          await delay({ milliSeconds: DELAY });
          const doOrderResponse = await doOrder({
            tradingsymbol: get(getPeScrip[0], 'symbol', '') || '',
            symboltoken: get(getPeScrip[0], 'token', '') || '',
            qty: getLotSize({ scrip: getPeScrip[0] }),
            transactionType: TRANSACTION_TYPE_BUY,
            productType: 'INTRADAY',
          });
          console.log(`${ALGO}: order status: `, doOrderResponse);
        }
      }
    }
  }
  return optionScrip;
};
const getMtm = async ({ scrip }: { scrip: ScripResponse }) => {
  await delay({ milliSeconds: DELAY });
  let positionsResponse = await getPositions();
  let positionsData = get(positionsResponse, 'data', []) ?? [];
  let mtm = 0;
  if (Array.isArray(positionsData) && positionsData.length > 0) {
    const position = positionsData.filter((position) => {
      const tradingSymbol = get(position, 'tradingsymbol');
      // console.log(
      //   `${ALGO}: tradingSymbol: ${tradingSymbol} / scrip.symbol: ${scrip.symbol}`
      // );
      if (tradingSymbol === scrip.symbol) return position;
    });
    mtm = parseInt(get(position, 'unrealised', '0') ?? '0');
  }
  return mtm;
};
const checkSL = async ({
  maxSl,
  trailSl,
  tradeDirection,
  scrip,
  mtm,
}: {
  maxSl: number;
  trailSl: number;
  tradeDirection: 'up' | 'down';
  scrip: ScripResponse | null;
  mtm: number;
}) => {
  const updatedMaxSl = updateMaxSl({ mtm, maxSl, trailSl });
  console.log(`${ALGO}: updatedMaxSl: ${updatedMaxSl}`);
  if (
    mtm < 0 &&
    Math.abs(mtm) > updatedMaxSl &&
    scrip &&
    tradeDirection === 'up'
  ) {
    await delay({ milliSeconds: DELAY });
    await doOrder({
      tradingsymbol: scrip.symbol,
      symboltoken: scrip.token,
      transactionType: TRANSACTION_TYPE_SELL,
      qty: getLotSize({ scrip: scrip }),
      productType: 'INTRADAY',
    });
  } else if (
    mtm < 0 &&
    Math.abs(mtm) > updatedMaxSl &&
    scrip &&
    tradeDirection === 'down'
  ) {
    await delay({ milliSeconds: DELAY });
    await doOrder({
      tradingsymbol: scrip.symbol,
      symboltoken: scrip.token,
      transactionType: TRANSACTION_TYPE_BUY,
      qty: getLotSize({ scrip: scrip }),
      productType: 'INTRADAY',
    });
  }
};
const stopTrade = async ({
  tradeDirection,
  scrip,
}: {
  tradeDirection: 'up' | 'down';
  scrip: ScripResponse | null;
}) => {
  const hasTimePassedToTakeTrade = isCurrentTimeGreater({
    hours: 15,
    minutes: 15,
  });
  if (hasTimePassedToTakeTrade && tradeDirection === 'up' && scrip) {
    await delay({ milliSeconds: DELAY });
    await doOrder({
      tradingsymbol: scrip.symbol,
      symboltoken: scrip.token,
      transactionType: TRANSACTION_TYPE_SELL,
      qty: getLotSize({ scrip: scrip }),
      productType: 'INTRADAY',
    });
  } else if (hasTimePassedToTakeTrade && tradeDirection === 'down' && scrip) {
    await delay({ milliSeconds: DELAY });
    await doOrder({
      tradingsymbol: scrip.symbol,
      symboltoken: scrip.token,
      transactionType: TRANSACTION_TYPE_BUY,
      qty: getLotSize({ scrip: scrip }),
      productType: 'INTRADAY',
    });
  }
};
export const runOrb = async ({
  scriptName,
  price,
  maxSl,
  tradeDirection,
  trailSl,
}: runOrbType) => {
  console.log(`${ALGO}: getting scrip ...`);
  await delay({ milliSeconds: DELAY });
  const scrip = await getStock({ scriptName });
  console.log(`${ALGO}: fetched scrip: ${scrip.symbol}`);
  await delay({ milliSeconds: DELAY });
  const optionScript = await takeOrbTrade({ price, scrip, tradeDirection });
  await delay({ milliSeconds: DELAY });
  const mtm = await getMtm({ scrip });
  console.log(`${ALGO}: mtm ${mtm}`);
  await delay({ milliSeconds: DELAY });
  await checkSL({ mtm, maxSl, trailSl, tradeDirection, scrip: optionScript });
  await delay({ milliSeconds: DELAY });
  await stopTrade({ scrip: optionScript, tradeDirection });
  return { mtm };
};
