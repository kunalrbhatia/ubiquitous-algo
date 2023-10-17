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