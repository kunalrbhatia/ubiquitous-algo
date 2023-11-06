// dataStore.ts

import { ISmartApiData } from '../app.interface';
import { generateSmartSession } from '../helpers/apiService';

class SmartSession {
  private static instance: SmartSession;
  private postData: ISmartApiData;

  private constructor() {
    // Initialize postData with default values or leave it empty.
    this.postData = {
      feedToken: '',
      jwtToken: '',
      refreshToken: '',
    };
    generateSmartSession().then((value: ISmartApiData) => {
      if (value) {
        this.postData.feedToken = value.feedToken;
        this.postData.jwtToken = value.jwtToken;
        this.postData.refreshToken = value.refreshToken;
      }
    });
  }

  static getInstance() {
    if (!SmartSession.instance) {
      SmartSession.instance = new SmartSession();
    }
    return SmartSession.instance;
  }

  setPostData(data: ISmartApiData) {
    this.postData = data;
  }

  getPostData() {
    return this.postData;
  }
}

export default SmartSession;
