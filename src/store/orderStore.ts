// dataStore.ts

import { OrderData } from '../app.interface'

class OrderStore {
  private static instance: OrderStore
  private postData: OrderData

  private constructor() {
    // Initialize postData with default values or leave it empty.
    this.postData = {
      hasOrderTaken: false,
    }
  }

  static getInstance() {
    if (!OrderStore.instance) {
      OrderStore.instance = new OrderStore()
    }
    return OrderStore.instance
  }

  setPostData(data: OrderData) {
    this.postData = data
  }

  getPostData() {
    return this.postData
  }
}

export default OrderStore
