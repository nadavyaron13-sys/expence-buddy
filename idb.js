(function(){
  const DB_NAME = 'finance-dashboard-db';
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (evt) => {
        const db = evt.target.result;
        if (!db.objectStoreNames.contains('transactions')) {
          db.createObjectStore('transactions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('budgets')) {
          db.createObjectStore('budgets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('notifications')) {
          db.createObjectStore('notifications', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode, cb) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try {
        result = cb(store);
      } catch (e) {
        reject(e);
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  window.IDBStore = {
    async getAll(storeName) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    async get(storeName, key) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async put(storeName, value) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).put(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async delete(storeName, key) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    async clear(storeName) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    // Migrate existing localStorage keys into IDB (non-destructive)
    async migrateFromLocalStorage(keys) {
      try {
        const promises = [];
        if (keys.transactions) {
          const raw = localStorage.getItem(keys.transactions);
          if (raw) {
            const parsed = JSON.parse(raw);
            parsed.forEach((t) => {
              if (!t.id) t.id = `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
              promises.push(this.put('transactions', t));
            });
          }
        }
        if (keys.budgets) {
          const raw = localStorage.getItem(keys.budgets);
          if (raw) {
            const parsed = JSON.parse(raw);
            // store as single record with id 'budgets'
            promises.push(this.put('budgets', { id: 'budgets', value: parsed }));
          }
        }
        if (keys.notifications) {
          const raw = localStorage.getItem(keys.notifications);
          if (raw) {
            const parsed = JSON.parse(raw);
            parsed.forEach((n) => {
              if (!n.id) n.id = `n_${Date.now()}_${Math.random().toString(16).slice(2)}`;
              promises.push(this.put('notifications', n));
            });
          }
        }
        if (keys.currency) {
          const raw = localStorage.getItem(keys.currency);
          if (raw) {
            promises.push(this.put('settings', { id: 'currency', value: raw }));
          }
        }
        await Promise.all(promises);
      } catch (e) {
        // ignore migration errors
      }
    }
  };
})();
