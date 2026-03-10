import TronWeb from 'tronweb';

export class ProxiedProvider extends TronWeb.providers.HttpProvider {
  ready: boolean;
  queue: Array<{
    args: [string, any?, string?];
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  }>;

  constructor() {
    super('http://127.0.0.1');

    this.ready = false;
    this.queue = [];
  }

  configure(url: string) {
    this.host = url;
    
    // We override request method so we don't strictly need to reset the internal axios instance,
    // but we can set the url just in case TronWeb internally accesses it.
    (this as any).fullUrl = url;
    this.ready = true;

    while (this.queue.length) {
      const item = this.queue.shift();
      if (!item) continue;
      
      const { args, resolve, reject } = item;
      this.request(...args)
        .then(resolve)
        .catch(reject);
    }
  }

  request(endpoint: string, payload: any = {}, method: string = 'get'): Promise<any> {
    if (!this.ready) {
      return new Promise((resolve, reject) => {
        this.queue.push({
          args: [endpoint, payload, method],
          resolve,
          reject
        });
      });
    }

    const url = `${this.host}${endpoint}`;
    
    const options: RequestInit = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (method.toLowerCase() !== 'get' && method.toLowerCase() !== 'head') {
      options.body = JSON.stringify(payload);
    }

    return fetch(url, options)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(res => {
        const response = res.transaction || res;

        Object.defineProperty(response, '__payload__', {
          writable: false,
          enumerable: false,
          configurable: false,
          value: payload
        });

        return res;
      });
  }
}
