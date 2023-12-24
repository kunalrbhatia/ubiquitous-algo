import { get as _get, isArray, isObject } from 'lodash'
import {
  type ISmartApiData,
  type LtpDataType,
  type OpenWebsocketType,
  type Position,
  type Scrips,
  type Tick,
  type doOrderResponse,
  type doOrderType,
  type getLtpDataType,
  type runOrbType,
  type scripMasterResponse,
} from '../app.interface'
import DataStore from '../store/dataStore'
import {
  ALGO,
  DELAY,
  GET_LTP_DATA_API,
  GET_POSITIONS,
  ORDER_API,
  SCRIPMASTER,
  TRANSACTION_TYPE_BUY,
  TRANSACTION_TYPE_SELL,
} from './constants'
import axios, { type AxiosResponse } from 'axios'
import {
  convertToFloat,
  delay,
  findOptionScripByToken,
  findPositionByToken,
  findScripByToken,
  getLotSize,
  isCurrentTimeGreater,
  updateMaxSl,
} from './functions'
import SmartSession from '../store/smartSession'
import { type Response } from 'express'
import OrderStore from '../store/orderStore'
import WebSocketStore from '../store/webSocketStore'
const { SmartAPI, WebSocketV2 } = require('smartapi-javascript')
const totp = require('totp-generator')
let mtm = 0
export const generateSmartSession = async (): Promise<ISmartApiData> => {
  const cred = DataStore.getInstance().getPostData()
  const smart_api = new SmartAPI({
    api_key: cred.APIKEY,
  })
  const TOTP = totp(cred.CLIENT_TOTP_PIN)
  return smart_api
    .generateSession(cred.CLIENT_CODE, cred.CLIENT_PIN, TOTP)
    .then(async (response: object) => _get(response, 'data'))
    .catch((ex: object) => {
      console.log(`${ALGO}: generateSmartSession failed error below`)
      console.log(ex)
      throw ex
    })
}
export const getLtpData = async ({
  exchange,
  tradingsymbol,
  symboltoken,
}: getLtpDataType): Promise<LtpDataType> => {
  const smartInstance = SmartSession.getInstance()
  await delay({ milliSeconds: DELAY })
  const smartApiData: ISmartApiData = smartInstance.getPostData()
  const jwtToken = _get(smartApiData, 'jwtToken')
  const data = JSON.stringify({ exchange, tradingsymbol, symboltoken })
  const cred = DataStore.getInstance().getPostData()
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
    data,
  }
  try {
    const response = await axios(config)
    return _get(response, 'data.data', {}) || {}
  } catch (error) {
    console.log(`${ALGO}: the GET_LTP_DATA_API failed error below`)
    console.log(error)
    throw error
  }
}
export const getPositions = async () => {
  await delay({ milliSeconds: DELAY })
  const smartInstance = SmartSession.getInstance()
  await delay({ milliSeconds: DELAY })
  const smartApiData: ISmartApiData = smartInstance.getPostData()
  const jwtToken = smartApiData.jwtToken
  const cred = DataStore.getInstance().getPostData()
  const config = {
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
  }
  return axios(config)
    .then(function (response: object) {
      return _get(response, 'data')
    })
    .catch(function (error: object) {
      const errorMessage = `${ALGO}: getPositions failed error below`
      console.log(errorMessage)
      console.log(error)
      throw error
    })
}
export const doOrder = async ({
  tradingsymbol,
  transactionType,
  symboltoken,
  productType = 'CARRYFORWARD',
  qty,
}: doOrderType): Promise<doOrderResponse> => {
  const smartInstance = SmartSession.getInstance()
  await delay({ milliSeconds: DELAY })
  const smartApiData: ISmartApiData = smartInstance.getPostData()
  const jwtToken = _get(smartApiData, 'jwtToken')
  const data = JSON.stringify({
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
  })
  const cred = DataStore.getInstance().getPostData()
  const config = {
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
    data,
  }
  return await axios(config)
    .then((response: AxiosResponse) => {
      return _get(response, 'data')
    })
    .catch(function (error: Response) {
      const errorMessage = `${ALGO}: doOrder failed error below`
      console.log(errorMessage)
      console.log(error)
      throw error
    })
}
export const fetchData = async (): Promise<scripMasterResponse[]> => {
  return await axios
    .get(SCRIPMASTER)
    .then((response: AxiosResponse) => {
      return _get(response, 'data', []) || []
    })
    .catch((evt: object) => {
      console.log(`${ALGO}: fetchData failed error below`)
      throw evt
    })
}
export const getStocks = async ({
  scriptName,
  strike,
  optionType,
}: {
  scriptName: string
  strike: string
  optionType: string
}) => {
  await delay({ milliSeconds: DELAY })
  const scripMaster: scripMasterResponse[] = await fetchData()
  if (scriptName && isArray(scripMaster) && scripMaster.length > 0) {
    console.log(`${ALGO}: all check cleared getScrip call`)
    const filteredScrip = scripMaster.filter((scrip) => {
      const _scripName: string = _get(scrip, 'symbol', '') || ''
      return (
        _scripName.includes(scriptName) &&
        _get(scrip, 'exch_seg') === 'NFO' &&
        _scripName.includes(strike) &&
        _scripName.includes(optionType)
      )
    })
    // console.log('filteredScrip: ', filteredScrip);
    if (filteredScrip.length >= 1) return filteredScrip
    else throw new Error('stock(s) not found')
  } else {
    const errorMessage = `${ALGO}: getStock failed`
    console.log(errorMessage)
    throw errorMessage
  }
}
export const getOptionScrip = async ({ scrips }: { scrips: Scrips[] }) => {
  await delay({ milliSeconds: DELAY })
  const scripMaster: scripMasterResponse[] = await fetchData()
  if (
    isArray(scrips) &&
    scrips.length > 0 &&
    isArray(scripMaster) &&
    scripMaster.length > 0
  ) {
    const filteredScrip = scripMaster.filter((scrip) => {
      const _scripName: string = _get(scrip, 'symbol', '') || ''
      const collectedScrips = []
      for (const _scrip of scrips) {
        if (_scripName === _scrip.name) collectedScrips.push(_scrip)
      }
      return collectedScrips.length > 0
    })
    return filteredScrip
  } else {
    const errorMessage = `${ALGO}: getStock failed`
    console.log(errorMessage)
    throw errorMessage
  }
}
const stopTrade = async ({ scrip }: { scrip: Position | null | undefined }) => {
  if (scrip) {
    await doOrder({
      tradingsymbol: scrip.tradingsymbol,
      symboltoken: scrip.symboltoken,
      transactionType: TRANSACTION_TYPE_SELL,
      qty: getLotSize({ scrip }),
      productType: 'INTRADAY',
    })
  }
}
const checkExistingTrades = async ({
  scrips,
}: {
  scrips: scripMasterResponse[]
}): Promise<[] | Position[]> => {
  const positionsResponse = await getPositions()
  const positionsData = _get(positionsResponse, 'data', []) ?? []
  if (Array.isArray(positionsData) && positionsData.length > 0) {
    const existingPosition = positionsData.filter((position: Position) => {
      const positions: Position[] = []
      for (const scrip of scrips) {
        if (
          position.tradingsymbol === scrip.symbol &&
          position.cfbuyqty !== position.cfsellqty
        ) {
          positions.push(position)
        }
      }
      return positions.length > 0
    })
    // console.log(`${ALGO}: existingPosition, `, existingPosition);
    if (existingPosition.length > 0) return existingPosition
  }
  return []
}
export const runOrb = async ({ scrips }: runOrbType) => {
  console.log(`${ALGO}: getting scrip ...`)
  const scripsWithDetails = await getOptionScrip({ scrips })
  console.log(`${ALGO}: scrips fetched`)
  openWebsocket({ optionScrips: scripsWithDetails, scrips })
  return { mtm: mtm }
}
export const openWebsocket = async ({
  optionScrips,
  scrips,
}: OpenWebsocketType) => {
  const smartApiData = SmartSession.getInstance().getPostData()
  const cred = DataStore.getInstance().getPostData()
  const hasExistingTrades = await checkExistingTrades({
    scrips: optionScrips,
  })
  const web_socket = new WebSocketV2({
    jwttoken: smartApiData.jwtToken,
    apikey: cred.APIKEY,
    clientcode: cred.CLIENT_CODE,
    feedtype: smartApiData.feedToken,
  })
  WebSocketStore.getInstance().setPostData(web_socket)
  const receiveTick = async (data: Tick) => {
    const orderData = OrderStore.getInstance().getPostData()
    if (orderData.hasOrderTaken && isObject(data)) {
      console.log(`${ALGO}, position already exist`)
      const token = data.token
      const position = findPositionByToken(token, hasExistingTrades)
      const scrip = findScripByToken(token, scrips)
      const _token = position?.symboltoken || ''
      const unrealisedPnl = parseInt(position?.unrealised || '0')
      mtm += unrealisedPnl
      const updatedMaxSl = updateMaxSl({
        mtm: unrealisedPnl,
        maxSl: scrip?.sl || 2000,
        trailSl: scrip?.tsl || 500,
      })
      console.log(`${ALGO}, updatedMaxSl: ${updatedMaxSl}`)
      const isSameSymbol = token.localeCompare(_token) === 0
      console.log(`${ALGO}, isSameSymbol: ${isSameSymbol}`)
      const isNegativeUnrealisedPnl = unrealisedPnl < 0
      console.log(
        `${ALGO}, isNegativeUnrealisedPnl: ${isNegativeUnrealisedPnl}`,
      )
      const isGreaterThanSL = Math.abs(unrealisedPnl) > (scrip?.sl || 2000)
      console.log(`${ALGO}, isGreaterThanSL: ${isGreaterThanSL}`)
      const isAfterTradingHours = isCurrentTimeGreater({
        hours: 15,
        minutes: 17,
      })
      console.log(`${ALGO}, isAfterTradingHours: ${isAfterTradingHours}`)
      const shouldStopTrade =
        isSameSymbol &&
        ((isNegativeUnrealisedPnl && isGreaterThanSL) ||
          unrealisedPnl < updatedMaxSl ||
          isAfterTradingHours)
      if (shouldStopTrade) {
        stopTrade({ scrip: position })
      }
    } else if (isObject(data)) {
      console.log(
        `${ALGO}, no previous order checking conditions to place order`,
      )
      const ltp = convertToFloat(data.last_traded_price)
      const scrip = findScripByToken(data.token, scrips)
      if (
        scrip &&
        scrip.token.localeCompare(data.token) &&
        ltp >= scrip.price
      ) {
        console.log(`${ALGO}, conditions met, placing order`)
        const optionScrip = findOptionScripByToken(scrip.token, optionScrips)
        const orderData = await doOrder({
          tradingsymbol: scrip.name,
          qty: optionScrip ? parseInt(optionScrip.lotsize) : 1,
          symboltoken: scrip.token,
          transactionType: TRANSACTION_TYPE_BUY,
          productType: 'INTRADAY',
        })
        console.log(`${ALGO}, order status `, orderData)
        if (orderData.status) {
          OrderStore.getInstance().setPostData({ hasOrderTaken: true })
        }
      }
    }
  }
  web_socket.connect().then(() => {
    const tokens: string[] = optionScrips.map(
      (scrip: scripMasterResponse) => scrip.token,
    )
    const json_req = {
      correlationID: 'abcde12345',
      action: 1,
      mode: 1,
      exchangeType: 2,
      tokens,
    }
    web_socket.fetchData(json_req)
    web_socket.on('tick', receiveTick)
  })
}
