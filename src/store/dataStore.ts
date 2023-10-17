// dataStore.ts

import { Credentails } from '../app.interface';

class DataStore {
  private static instance: DataStore;
  private postData: Credentails;

  private constructor() {
    // Initialize postData with default values or leave it empty.
    this.postData = {
      APIKEY: '',
      CLIENT_CODE: '',
      CLIENT_PIN: '',
      CLIENT_TOTP_PIN: '',
    };
  }

  static getInstance() {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  setPostData(data: Credentails) {
    this.postData = data;
  }

  getPostData() {
    return this.postData;
  }
}

export default DataStore;
