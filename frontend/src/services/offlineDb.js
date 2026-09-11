import Dexie from "dexie";

export const offlineDB = new Dexie("ecotrace_offline");

offlineDB.version(1).stores({
  pending: "++localId,createdAt",
});

export async function queueCollection(payload) {
  return offlineDB.pending.add({ ...payload, createdAt: new Date().toISOString() });
}

export async function getPendingCollections() {
  return offlineDB.pending.toArray();
}

export async function removePendingCollection(localId) {
  return offlineDB.pending.delete(localId);
}

export async function clearPendingCollections() {
  return offlineDB.pending.clear();
}
