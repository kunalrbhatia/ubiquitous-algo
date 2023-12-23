import {
  Credentails,
  ISmartApiData,
  Position,
  Scrips,
  TimeComparisonType,
  delayType,
  reqType,
  scripMasterResponse,
  updateMaxSlType,
} from '../app.interface'
import { Request } from 'express'
import DataStore from '../store/dataStore'
import SmartSession from '../store/smartSession'
import moment from 'moment-timezone'
import { isEmpty } from 'lodash'
import { generateSmartSession } from './apiService'
import { ALGO, DELAY } from './constants'
export const setCred = (req: Request | reqType) => {
  const creds: Credentails = {
    APIKEY: req.body.api_key,
    CLIENT_CODE: req.body.client_code,
    CLIENT_PIN: req.body.client_pin,
    CLIENT_TOTP_PIN: req.body.client_totp_pin,
  }
  DataStore.getInstance().setPostData(creds)
}
export const updateMaxSl = ({ mtm, maxSl, trailSl }: updateMaxSlType) => {
  if (mtm >= trailSl) {
    const quotientMultiplier = Math.floor(mtm / trailSl) - 1
    maxSl = quotientMultiplier * trailSl + (mtm % trailSl)
  }
  return maxSl
}
export const delay = ({ milliSeconds }: delayType) => {
  const FIVE_MINUTES = 5 * 60 * 1000
  let delayInMilliseconds = 0
  if (milliSeconds && typeof milliSeconds === 'number')
    delayInMilliseconds = milliSeconds
  else if (milliSeconds && typeof milliSeconds === 'string')
    delayInMilliseconds = parseInt(milliSeconds)
  else delayInMilliseconds = FIVE_MINUTES
  return new Promise((resolve) => {
    setTimeout(resolve, delayInMilliseconds)
  })
}
export const setSmartSession = (data: ISmartApiData) => {
  const smartData: ISmartApiData = {
    feedToken: data.feedToken,
    jwtToken: data.jwtToken,
    refreshToken: data.refreshToken,
  }
  SmartSession.getInstance().setPostData(smartData)
}
export const isMarketClosed = () => {
  if (
    isCurrentTimeGreater({ hours: 9, minutes: 15 }) &&
    !isCurrentTimeGreater({ hours: 15, minutes: 30 })
  ) {
    return false
  } else {
    return true
  }
}
export const isTradeAllowed = async () => {
  const isMarketOpen = !isMarketClosed()
  const hasTimePassedToTakeTrade = isCurrentTimeGreater({
    hours: 9,
    minutes: 15,
  })
  let isSmartAPIWorking = false
  try {
    await delay({ milliSeconds: DELAY })
    const smartData = await generateSmartSession()
    isSmartAPIWorking = !isEmpty(smartData)
    if (isSmartAPIWorking) {
      setSmartSession(smartData)
    }
  } catch (err) {
    console.log('Error occurred for generateSmartSession')
  }
  console.log(
    `${ALGO}: checking conditions, isMarketOpen: ${isMarketOpen}, hasTimePassed 09:45am: ${hasTimePassedToTakeTrade}, isSmartAPIWorking: ${isSmartAPIWorking}`,
  )
  return isMarketOpen && hasTimePassedToTakeTrade && isSmartAPIWorking
}
export const isCurrentTimeGreater = ({
  hours,
  minutes,
}: TimeComparisonType): boolean => {
  const currentTime = moment().tz('Asia/Kolkata')
  const targetTime = moment()
    .tz('Asia/Kolkata')
    .set({ hours, minutes, seconds: 0 })
  return currentTime.isAfter(targetTime)
}
export const getLotSize = ({ scrip }: { scrip: Position }) => {
  let lotsize: string | number = scrip.lotsize
  if (typeof lotsize === 'string' && !isEmpty(lotsize)) {
    lotsize = parseInt(lotsize, 10)
  } else {
    lotsize = 0
  }
  return lotsize
}
export const convertToFloat = (lastTradedPrice: string) => {
  const integerPart = parseInt(lastTradedPrice.slice(0, -2))
  const decimalPart = parseInt(lastTradedPrice.slice(-2))
  return parseFloat(`${integerPart}.${decimalPart}`)
}
export const findOptionScripByToken = (
  token: string,
  trades: scripMasterResponse[],
) =>
  trades.find((trade: scripMasterResponse) => trade.token.localeCompare(token))
export const findPositionByToken = (token: string, trades: Position[]) =>
  trades.find((trade: Position) => trade.symboltoken.localeCompare(token))
export const findScripByToken = (token: string, trades: Scrips[]) =>
  trades.find((trade: Scrips) => trade.token.localeCompare(token))
