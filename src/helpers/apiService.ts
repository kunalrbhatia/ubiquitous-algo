import { get, isArray } from 'lodash';
let { SmartAPI, WebSocketV2 } = require('smartapi-javascript');
const totp = require('totp-generator');
import {
  ISmartApiData,
  LtpDataType,
  OpenWebsocketType,
  Position,
  ScripResponse,
  Scrips,
  doOrderResponse,
  doOrderType,
  getLtpDataType,
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
      return get(response, 'data', []) || [];
      // console.log(
      //   `${ALGO}: response if script master api loaded and its length is ${acData.length}`
      // );
      // let scripMaster = acData.map((element, index) => {
      //   return {
      //     ...element,
      //   };
      // });
      // return scripMaster;
    })
    .catch((evt: object) => {
      console.log(`${ALGO}: fetchData failed error below`);
      throw evt;
    });
};
export const getStocks = async ({
  scriptName,
  strike,
  optionType,
}: {
  scriptName: string;
  strike: string;
  optionType: string;
}) => {
  await delay({ milliSeconds: DELAY });
  let scripMaster: scripMasterResponse[] = await fetchData();
  // console.log(
  //   `${ALGO}: scriptName: ${scriptName}, is scrip master an array: ${isArray(
  //     scripMaster
  //   )}, its length is: ${scripMaster.length}`
  // );
  if (scriptName && isArray(scripMaster) && scripMaster.length > 0) {
    console.log(`${ALGO}: all check cleared getScrip call`);
    let filteredScrip = scripMaster.filter((scrip) => {
      const _scripName: string = get(scrip, 'symbol', '') || '';
      return (
        _scripName.includes(scriptName) &&
        get(scrip, 'exch_seg') === 'NFO' &&
        _scripName.includes(strike) &&
        _scripName.includes(optionType)
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
export const getOptionScrip = async ({ scrips }: { scrips: Scrips[] }) => {
  await delay({ milliSeconds: DELAY });
  let scripMaster: scripMasterResponse[] = await fetchData();
  if (
    isArray(scrips) &&
    scrips.length > 0 &&
    isArray(scripMaster) &&
    scripMaster.length > 0
  ) {
    let filteredScrip = scripMaster.filter((scrip) => {
      const _scripName: string = get(scrip, 'symbol', '') || '';
      const collectedScrips = [];
      for (const _scrip of scrips) {
        if (_scripName === _scrip.name) collectedScrips.push(_scrip);
      }
      return collectedScrips.length > 0;
    });
    return filteredScrip;
  } else {
    const errorMessage = `${ALGO}: getStock failed`;
    console.log(errorMessage);
    throw errorMessage;
  }
};
const takeOrbTrade = async ({
  scrip,
  price,
}: {
  scrip: scripMasterResponse;
  price: number;
}) => {
  let optionScrip: scripMasterResponse | null = null;
  console.log(`${ALGO}: fetching open positions ...`);
  await delay({ milliSeconds: DELAY });
  /* Below code is in hold */
  /* 
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
      if (scripData.ltp > price) {
        console.log(`${ALGO}: fetching option ...`);
        await delay({ milliSeconds: DELAY });
        const optionScrip = await getOptionScrip({
          scriptName: scrip.symbol,
        });
        console.log(`${ALGO}: option `, optionScrip);
        if (optionScrip) {
          await delay({ milliSeconds: DELAY });
          const doOrderResponse = await doOrder({
            tradingsymbol: get(optionScrip, 'symbol', '') || '',
            symboltoken: get(optionScrip, 'token', '') || '',
            qty: getLotSize({ scrip: optionScrip }),
            transactionType: TRANSACTION_TYPE_BUY,
            productType: 'INTRADAY',
          });
          console.log(`${ALGO}: order status: `, doOrderResponse);
        }
      }
    }
  }
  */
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
  scrip,
  mtm,
}: {
  maxSl: number;
  trailSl: number;
  scrip: ScripResponse | null;
  mtm: number;
}) => {
  const updatedMaxSl = updateMaxSl({ mtm, maxSl, trailSl });
  console.log(`${ALGO}: updatedMaxSl: ${updatedMaxSl}`);
  if (mtm < 0 && Math.abs(mtm) > updatedMaxSl && scrip) {
    await stopTrade({ scrip });
  }
};
const stopTrade = async ({ scrip }: { scrip: ScripResponse | null }) => {
  if (scrip) {
    await delay({ milliSeconds: DELAY });
    await doOrder({
      tradingsymbol: scrip.symbol,
      symboltoken: scrip.token,
      transactionType: TRANSACTION_TYPE_SELL,
      qty: getLotSize({ scrip: scrip }),
      productType: 'INTRADAY',
    });
  }
};
const checkExistingTrades = async ({
  scrips,
}: {
  scrips: scripMasterResponse[];
}): Promise<[] | Position[]> => {
  let positionsResponse = await getPositions();
  let positionsData = get(positionsResponse, 'data', []) ?? [];
  if (Array.isArray(positionsData) && positionsData.length > 0) {
    const existingPosition = positionsData.filter((position: Position) => {
      const positions: Position[] = [];
      for (const scrip of scrips) {
        if (get(position, 'tradingsymbol') === scrip.symbol)
          positions.push(position);
      }
      return positions.length > 0;
    });
    // console.log(`${ALGO}: existingPosition, `, existingPosition);
    if (existingPosition.length > 0) return existingPosition;
  }
  return [];
};
export const runOrb = async ({ scrips, price, maxSl, trailSl }: runOrbType) => {
  console.log(`${ALGO}: getting scrip ...`);
  const scripsWithDetails = await getOptionScrip({ scrips });
  // console.log(`${ALGO}: fetched scrip: `, scripsWithDetails);
  const hasExistingTrades = await checkExistingTrades({
    scrips: scripsWithDetails,
  });
  console.log(`${ALGO}: hasExistingTrades, ${hasExistingTrades.length}`);
  openWebsocket({ optionScrips: scripsWithDetails, hasExistingTrades });
  /* await delay({ milliSeconds: DELAY });
  const optionScript = await takeOrbTrade({ price, scrip });
  await delay({ milliSeconds: DELAY });
  const mtm = (await getMtm({ scrip })) || 0;
  console.log(`${ALGO}: mtm ${mtm}`);
  await delay({ milliSeconds: DELAY });
  await checkSL({ mtm, maxSl, trailSl, scrip: optionScript });
  const isTimePassedToCloseTrade = isCurrentTimeGreater({
    hours: 15,
    minutes: 15,
  });
  if (isTimePassedToCloseTrade) await stopTrade({ scrip: optionScript }); */
  // return { mtm: mtm };
  return { mtm: 0 };
};
export const openWebsocket = async ({
  optionScrips,
  hasExistingTrades,
}: OpenWebsocketType) => {
  const smartApiData = SmartSession.getInstance().getPostData();
  const cred = DataStore.getInstance().getPostData();
  let web_socket = new WebSocketV2({
    jwttoken: smartApiData.jwtToken,
    apikey: cred.APIKEY,
    clientcode: cred.CLIENT_CODE,
    feedtype: smartApiData.feedToken,
  });
  const receiveTick = (data: object) => {
    if (hasExistingTrades) {
      for (const trade of hasExistingTrades) {
        console.log(
          `trade symbol ${trade.tradingsymbol}, trade u-pnl ${trade.unrealised}`
        );
      }
    }
    console.log('receiveTick:::::', data);
  };
  web_socket.connect().then((res: object) => {
    const tokens: string[] = optionScrips.map(
      (scrip: scripMasterResponse) => scrip.token
    );
    let json_req = {
      correlationID: 'abcde12345',
      action: 1,
      mode: 1,
      exchangeType: 2,
      tokens: tokens,
    };
    web_socket.fetchData(json_req);
    web_socket.on('tick', receiveTick);
  });
};
