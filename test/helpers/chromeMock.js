/**
 * Reusable Chrome extension API mock for Node tests.
 *
 * The mock supports the callback-first APIs used by the extension while also
 * returning Promises when a callback is omitted. Tests can install it on
 * `globalThis`, reset all mutable state between cases, and inspect calls
 * through `chrome.__mock`.
 */

const cloneValue = (value) => {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
};

const invokeAsync = (callback, ...args) => {
  if (typeof callback !== "function") {
    return;
  }

  queueMicrotask(() => callback(...args));
};

const createEvent = () => {
  const listeners = new Set();

  return {
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    },
    hasListener(listener) {
      return listeners.has(listener);
    },
    hasListeners() {
      return listeners.size > 0;
    },
    dispatch(...args) {
      return [...listeners].map((listener) => listener(...args));
    },
    clear() {
      listeners.clear();
    },
    get listeners() {
      return [...listeners];
    },
  };
};

const getRequestedStorage = (store, keys) => {
  if (keys === null || keys === undefined) {
    return cloneValue(store);
  }

  if (typeof keys === "string") {
    return { [keys]: cloneValue(store[keys]) };
  }

  if (Array.isArray(keys)) {
    return keys.reduce((result, key) => {
      result[key] = cloneValue(store[key]);
      return result;
    }, {});
  }

  if (typeof keys === "object") {
    return Object.keys(keys).reduce((result, key) => {
      result[key] = store[key] === undefined ? cloneValue(keys[key]) : cloneValue(store[key]);
      return result;
    }, {});
  }

  return {};
};

const createStorageArea = () => {
  let store = {};

  const area = {
    get(keys, callback) {
      const result = getRequestedStorage(store, keys);
      invokeAsync(callback, result);
      return typeof callback === "function" ? undefined : Promise.resolve(result);
    },
    set(items, callback) {
      Object.assign(store, cloneValue(items || {}));
      invokeAsync(callback);
      return typeof callback === "function" ? undefined : Promise.resolve();
    },
    remove(keys, callback) {
      const keysToRemove = Array.isArray(keys) ? keys : [keys];
      keysToRemove.forEach((key) => delete store[key]);
      invokeAsync(callback);
      return typeof callback === "function" ? undefined : Promise.resolve();
    },
    clear(callback) {
      store = {};
      invokeAsync(callback);
      return typeof callback === "function" ? undefined : Promise.resolve();
    },
    __getStore() {
      return cloneValue(store);
    },
    __setStore(nextStore) {
      store = cloneValue(nextStore || {});
    },
    __reset() {
      store = {};
    },
  };

  return area;
};

export const createChromeMock = () => {
  let lastError = null;
  const runtimeOnMessage = createEvent();
  const calls = {
    runtimeSendMessage: [],
    tabsSendMessage: [],
    tabsCreate: [],
    tabsQuery: [],
  };

  const storage = {
    sync: createStorageArea(),
    local: createStorageArea(),
    session: createStorageArea(),
  };

  const chrome = {
    runtime: {
      onMessage: runtimeOnMessage,
      get lastError() {
        return lastError;
      },
      set lastError(error) {
        lastError = error;
      },
      sendMessage(message, callback) {
        calls.runtimeSendMessage.push(cloneValue(message));
        const sender = { id: "test-extension" };
        let settled = false;
        let responseValue;
        let resolvePromise;
        const responsePromise = new Promise((resolve) => {
          resolvePromise = resolve;
        });

        const sendResponse = (response) => {
          settled = true;
          responseValue = response;
          invokeAsync(callback, response);
          resolvePromise(response);
        };

        const results = runtimeOnMessage.dispatch(message, sender, sendResponse);
        const hasAsyncListener = results.some((result) => result === true);

        if (!settled && !hasAsyncListener) {
          invokeAsync(callback, undefined);
          resolvePromise(undefined);
        }

        if (typeof callback === "function") {
          return undefined;
        }

        return settled ? Promise.resolve(responseValue) : responsePromise;
      },
    },
    storage,
    tabs: {
      sendMessage(tabId, message, callback) {
        calls.tabsSendMessage.push({ tabId, message: cloneValue(message) });
        invokeAsync(callback, undefined);
        return typeof callback === "function" ? undefined : Promise.resolve(undefined);
      },
      create(createProperties, callback) {
        const tab = { id: calls.tabsCreate.length + 1, active: true, ...cloneValue(createProperties || {}) };
        calls.tabsCreate.push(cloneValue(createProperties || {}));
        invokeAsync(callback, tab);
        return typeof callback === "function" ? undefined : Promise.resolve(tab);
      },
      query(queryInfo, callback) {
        calls.tabsQuery.push(cloneValue(queryInfo || {}));
        const tabs = [];
        invokeAsync(callback, tabs);
        return typeof callback === "function" ? undefined : Promise.resolve(tabs);
      },
    },
    __mock: {
      calls,
      reset() {
        lastError = null;
        runtimeOnMessage.clear();
        storage.sync.__reset();
        storage.local.__reset();
        storage.session.__reset();
        calls.runtimeSendMessage.length = 0;
        calls.tabsSendMessage.length = 0;
        calls.tabsCreate.length = 0;
        calls.tabsQuery.length = 0;
      },
      setLastError(error) {
        lastError = error;
      },
      clearLastError() {
        lastError = null;
      },
      dispatchRuntimeMessage(message, sender = { id: "test-extension" }) {
        const responses = [];
        const sendResponse = (response) => responses.push(response);
        const listenerResults = runtimeOnMessage.dispatch(message, sender, sendResponse);
        return { listenerResults, responses };
      },
      getStorageArea(areaName) {
        return storage[areaName].__getStore();
      },
      setStorageArea(areaName, nextStore) {
        storage[areaName].__setStore(nextStore);
      },
    },
  };

  return chrome;
};

export const installChromeMock = (target = globalThis, chromeMock = createChromeMock()) => {
  target.chrome = chromeMock;
  return chromeMock;
};

export const resetChromeMock = (chromeMock = globalThis.chrome) => {
  if (!chromeMock?.__mock?.reset) {
    throw new Error("Chrome mock is not installed");
  }

  chromeMock.__mock.reset();
  return chromeMock;
};
