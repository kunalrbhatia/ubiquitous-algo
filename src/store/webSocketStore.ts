class WebSocketStore {
  private static instance: WebSocketStore
  private postData: any

  private constructor() {
    // Initialize postData with default values or leave it empty.
    this.postData = null
  }

  static getInstance() {
    if (!WebSocketStore.instance) {
      WebSocketStore.instance = new WebSocketStore()
    }
    return WebSocketStore.instance
  }

  setPostData(data: any) {
    this.postData = data
  }

  getPostData() {
    return this.postData
  }
}

export default WebSocketStore
