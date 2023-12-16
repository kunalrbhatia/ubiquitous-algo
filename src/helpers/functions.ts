import {
  Credentails,
  ISmartApiData,
  ScripResponse,
  TimeComparisonType,
  delayType,
  reqType,
  scripMasterResponse,
  updateMaxSlType,
} from '../app.interface';
import { Request } from 'express';
import DataStore from '../store/dataStore';
import SmartSession from '../store/smartSession';
import moment from 'moment-timezone';
import { get, isEmpty } from 'lodash';
import { generateSmartSession } from './apiService';
import { ALGO, DELAY } from './constants';
export const setCred = (req: Request | reqType) => {
  const creds: Credentails = {
    APIKEY: req.body.api_key,
    CLIENT_CODE: req.body.client_code,
    CLIENT_PIN: req.body.client_pin,
    CLIENT_TOTP_PIN: req.body.client_totp_pin,
  };
  DataStore.getInstance().setPostData(creds);
};
export const updateMaxSl = ({ mtm, maxSl, trailSl }: updateMaxSlType) => {
  if (mtm % trailSl === 0) {
    const quotientMultiplier = Math.floor(mtm / trailSl);
    maxSl += quotientMultiplier * trailSl;
  }
  return maxSl;
};
export const delay = ({ milliSeconds }: delayType) => {
  const FIVE_MINUTES = 5 * 60 * 1000;
  let delayInMilliseconds = 0;
  if (milliSeconds && typeof milliSeconds === 'number')
    delayInMilliseconds = milliSeconds;
  else if (milliSeconds && typeof milliSeconds === 'string')
    delayInMilliseconds = parseInt(milliSeconds);
  else delayInMilliseconds = FIVE_MINUTES;
  return new Promise((resolve) => {
    setTimeout(resolve, delayInMilliseconds);
  });
};
export const setSmartSession = (data: ISmartApiData) => {
  const smartData: ISmartApiData = {
    feedToken: data.feedToken,
    jwtToken: data.jwtToken,
    refreshToken: data.refreshToken,
  };
  SmartSession.getInstance().setPostData(smartData);
};
export const isMarketClosed = () => {
  if (
    isCurrentTimeGreater({ hours: 9, minutes: 15 }) &&
    !isCurrentTimeGreater({ hours: 15, minutes: 30 })
  ) {
    return false;
  } else {
    return true;
  }
};
export const isTradeAllowed = async () => {
  const isMarketOpen = !isMarketClosed();
  const hasTimePassedToTakeTrade = isCurrentTimeGreater({
    hours: 9,
    minutes: 15,
  });
  let isSmartAPIWorking = false;
  try {
    await delay({ milliSeconds: DELAY });
    const smartData = await generateSmartSession();
    isSmartAPIWorking = !isEmpty(smartData);
    if (isSmartAPIWorking) {
      setSmartSession(smartData);
    }
  } catch (err) {
    console.log('Error occurred for generateSmartSession');
  }
  console.log(
    `${ALGO}: checking conditions, isMarketOpen: ${isMarketOpen}, hasTimePassed 09:45am: ${hasTimePassedToTakeTrade}, isSmartAPIWorking: ${isSmartAPIWorking}`
  );
  return isMarketOpen && hasTimePassedToTakeTrade && isSmartAPIWorking;
};
export const isCurrentTimeGreater = ({
  hours,
  minutes,
}: TimeComparisonType): boolean => {
  const currentTime = moment().tz('Asia/Kolkata');
  const targetTime = moment()
    .tz('Asia/Kolkata')
    .set({ hours, minutes, seconds: 0 });
  return currentTime.isAfter(targetTime);
};
export const getLotSize = ({
  scrip,
}: {
  scrip: scripMasterResponse | ScripResponse;
}) => {
  let lotsize: string | number = get(scrip, 'lotsize');
  if (typeof lotsize === 'string' && !isEmpty(lotsize)) {
    lotsize = parseInt(lotsize, 10);
  } else {
    lotsize = 0;
  }
  return lotsize;
};
