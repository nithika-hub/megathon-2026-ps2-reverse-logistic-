const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new Error("Unable to connect to the EcoTrace backend. Check that it is running.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Keep a useful fallback for non-JSON responses.
  }

  if (!response.ok) {
    const detail = data?.detail || data?.message || `Request failed (${response.status})`;
    throw new Error(detail);
  }
  return data;
}

export const api = {
  health: () => request("/api/health"),
  createCollection: (payload) =>
    request("/api/collections", { method: "POST", body: JSON.stringify(payload) }),
  myCollections: (collectorId = "C001") =>
    request(`/api/collections/my?collector_id=${encodeURIComponent(collectorId)}`),
  aggregatorPending: () => request("/api/aggregator/pending"),
  aggregatorConfirm: (payload) =>
    request("/api/aggregator/confirm", { method: "POST", body: JSON.stringify(payload) }),
  recyclerPending: () => request("/api/recycler/pending"),
  recyclerReceive: (payload) =>
    request("/api/recycler/receive", { method: "POST", body: JSON.stringify(payload) }),
  eprSummary: () => request("/api/epr/summary"),
  audit: (collectionId) => request(`/api/audit/${encodeURIComponent(collectionId)}`),
};

export { API };
