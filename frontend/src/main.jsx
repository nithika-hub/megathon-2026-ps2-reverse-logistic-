import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./services/api";
import {
  getPendingCollections,
  queueCollection,
  removePendingCollection,
} from "./services/offlineDb";
import { hashFile, startVoiceCapture } from "./services/evidence";
import "./style.css";

const ROLES = [
  { id: "collector", label: "Collector", description: "Capture field collections offline-first" },
  { id: "aggregator", label: "Aggregator", description: "Confirm pickup and verified weight" },
  { id: "recycler", label: "Recycler", description: "Confirm receipt and verification" },
  { id: "brand", label: "Brand / PRO", description: "View compliance-ready evidence" },
];

const STATUS_LABELS = {
  COLLECTED: "Collected",
  AGGREGATOR_CONFIRMED: "Aggregator confirmed",
  EPR_ELIGIBLE: "EPR eligible",
  FLAGGED: "Flagged",
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function statusTone(status) {
  if (status === "EPR_ELIGIBLE") return "success";
  if (status === "FLAGGED") return "danger";
  if (status === "AGGREGATOR_CONFIRMED") return "success";
  return "neutral";
}

function Badge({ status, children }) {
  return <span className={`badge ${statusTone(status)}`}>{children || STATUS_LABELS[status] || status}</span>;
}

function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

function EmptyState({ title, message, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">✓</div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

function ErrorBox({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="alert error">
      <div><strong>Something went wrong</strong><span>{message}</span></div>
      {onRetry && <button className="button secondary small" onClick={onRetry}>Retry</button>}
    </div>
  );
}

function PortalShell({ role, setRole, children, title, subtitle }) {
  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => setRole(null)} aria-label="Back to portals">
          <span className="brand-mark">♻</span>
          <span>EcoTrace</span>
        </button>
        <div className="topbar-right">
          <span className="role-chip">{ROLES.find((r) => r.id === role)?.label}</span>
          <button className="button ghost" onClick={() => setRole(null)}>Change role</button>
        </div>
      </header>
      <main className="page">
        <div className="page-heading">
          <div>
            <h1>{title}</h1>
            <p className="subtitle">{subtitle}</p>
          </div>
        </div>
        {children}
      </main>
    </>
  );
}

function PortalSelector({ setRole }) {
  return (
    <>
      <header className="topbar landing-bar">
        <div className="brand"><span className="brand-mark">♻</span><span>EcoTrace</span></div>
        <span className="secure-label">Evidence-linked compliance platform</span>
      </header>
      <main className="landing">
        <section className="hero">
          <h1>Connect the collection event<br />to the compliance record.</h1>
          <p className="hero-copy">
            EcoTrace creates an evidence-linked trail from field collection through aggregator
            verification and recycler receipt to EPR eligibility.
          </p>
        </section>
        <section>
          <p className="section-label">Choose your portal</p>
          <div className="portal-grid">
            {ROLES.map((role, i) => (
              <button className="portal-card" key={role.id} onClick={() => setRole(role.id)}>
                <span className="portal-index">{String(i + 1).padStart(2, "0")}</span>
                <span className="portal-icon">{role.id === "collector" ? "C" : role.id === "aggregator" ? "A" : role.id === "recycler" ? "R" : "P"}</span>
                <span className="portal-text"><strong>{role.label}</strong><small>{role.description}</small></span>
                <span className="arrow">›</span>
              </button>
            ))}
          </div>
        </section>
        <div className="principle">
          <strong>Core principle</strong>
          <span>Solving only one layer is not a solution. Connecting the informal collection event to the formal regulatory record is.</span>
        </div>
      </main>
    </>
  );
}

function JourneyTracker({ status }) {
  const steps = [
    ["COLLECTED", "Collection", "Collector logs evidence"],
    ["AGGREGATOR_CONFIRMED", "Pickup verified", "Aggregator confirms weight"],
    ["RECYCLER_RECEIVED", "Receipt", "Recycler confirms receipt"],
    ["EPR_ELIGIBLE", "EPR eligibility", "Compliance-ready outcome"],
  ];
  const actual = status === "FLAGGED" ? "FLAGGED" : status;
  const order = { COLLECTED: 0, AGGREGATOR_CONFIRMED: 1, EPR_ELIGIBLE: 3, FLAGGED: 3 };
  const currentIndex = order[actual] ?? 0;

  return (
    <div className="journey">
      <div className="journey-head">
        <div><p className="section-label">Collection journey</p><h3>From evidence to verified compliance</h3></div>
        <Badge status={status}>{status === "FLAGGED" ? "Flagged" : STATUS_LABELS[status]}</Badge>
      </div>
      <div className="journey-steps">
        {steps.map(([key, label, desc], index) => {
          const completed = key !== "EPR_ELIGIBLE" && index < currentIndex + 1;
          const active = key === status || (status === "EPR_ELIGIBLE" && key === "EPR_ELIGIBLE");
          const flagged = status === "FLAGGED" && index === 3;
          return (
            <React.Fragment key={key}>
              <div className={`journey-step ${completed || active ? "done" : ""} ${active ? "active" : ""} ${flagged ? "flagged" : ""}`}>
                <span className="step-dot">{flagged ? "!" : completed || active ? "✓" : index + 1}</span>
                <div><strong>{label}</strong><small>{desc}</small></div>
              </div>
              {index < steps.length - 1 && <div className={`journey-line ${index < currentIndex ? "done" : ""}`} />}
            </React.Fragment>
          );
        })}
      </div>
      {status === "FLAGGED" && <div className="flag-note">This collection reached recycler verification but was flagged by the backend's rule-based checks. EPR eligibility is not granted.</div>}
    </div>
  );
}

function EvidenceSummary({ row }) {
  const items = [
    ["Photo", row.photo_hash ? "Hash recorded" : "Not provided"],
    ["Voice", row.voice_transcript_text ? "Transcript recorded" : "Not provided"],
    ["GPS", row.lat != null && row.lng != null ? `${Number(row.lat).toFixed(4)}, ${Number(row.lng).toFixed(4)}` : "Not provided"],
  ];
  return <div className="evidence-row">{items.map(([name, value]) => <div key={name} className={value.startsWith("Not") ? "muted" : ""}><span>{name}</span><strong>{value}</strong></div>)}</div>;
}

function Collector() {
  const [form, setForm] = useState({
    material: "Mobile Phones",
    material_category: "IT_EQUIPMENT",
    declared_weight_kg: "2.5",
    location_text: "",
    lat: null,
    lng: null,
    photo_hash: null,
    voice_transcript_text: "",
  });
  const [file, setFile] = useState(null);
  const [history, setHistory] = useState([]);
  const [pending, setPending] = useState([]);
  const [tab, setTab] = useState("new");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef(null);

  const refreshLocal = useCallback(async () => setPending(await getPendingCollections()), []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setError("");
    try { setHistory(await api.myCollections("C001")); }
    catch (e) { setError(e.message); }
    finally { setLoadingHistory(false); }
  }, []);

  const syncPending = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      const rows = await getPendingCollections();
      for (const row of rows) {
        try {
          await api.createCollection({
            collector_id: row.collector_id,
            material: row.material,
            material_category: row.material_category,
            declared_weight_kg: Number(row.declared_weight_kg),
            location_text: row.location_text || null,
            lat: row.lat ?? null,
            lng: row.lng ?? null,
            photo_hash: row.photo_hash || null,
            voice_transcript_text: row.voice_transcript_text || null,
          });
          await removePendingCollection(row.localId);
        } catch {
          // Leave failed rows queued for the next retry.
        }
      }
    } finally {
      setSyncing(false);
      await refreshLocal();
      await loadHistory();
    }
  }, [loadHistory, refreshLocal, syncing]);

  useEffect(() => {
    refreshLocal();
    loadHistory();
    const handler = () => syncPending();
    window.addEventListener("online", handler);
    return () => {
      window.removeEventListener("online", handler);
      recognitionRef.current?.stop?.();
    };
  }, [loadHistory, refreshLocal, syncPending]);

  async function saveCollection() {
    setMessage(null); setError("");
    const weight = Number(form.declared_weight_kg);
    if (!weight || weight <= 0) { setError("Enter a valid collection weight greater than 0 kg."); return; }

    let photoHash = form.photo_hash;
    if (file) {
      try { photoHash = await hashFile(file); }
      catch { setError("The photo could not be hashed. Please try another image."); return; }
    }

    const payload = {
      collector_id: "C001",
      ...form,
      declared_weight_kg: weight,
      photo_hash: photoHash,
      location_text: form.location_text || null,
      voice_transcript_text: form.voice_transcript_text || null,
    };

    if (!navigator.onLine) {
      await queueCollection(payload);
      await refreshLocal();
      setMessage("Saved securely on this device. It will sync when the connection returns.");
      return;
    }

    try {
      const result = await api.createCollection(payload);
      setMessage(`Collection ${result.id} synced successfully.`);
      setForm((f) => ({ ...f, declared_weight_kg: "2.5", voice_transcript_text: "", photo_hash: null }));
      setFile(null);
      await loadHistory();
    } catch {
      await queueCollection(payload);
      await refreshLocal();
      setMessage("Backend unavailable. Collection saved offline and queued for sync.");
    }
  }

  function getGps() {
    setError("");
    if (!navigator.geolocation) { setError("GPS is not supported by this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setForm((f) => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude }));
        setMessage("GPS location captured.");
      },
      () => setError("GPS permission is unavailable. You can still save the collection.")
    );
  }

  function toggleVoice() {
    if (recording) { recognitionRef.current?.stop?.(); setRecording(false); return; }
    const recognition = startVoiceCapture(
      (text) => {
        setForm((f) => ({ ...f, voice_transcript_text: f.voice_transcript_text ? `${f.voice_transcript_text} ${text}` : text }));
        setRecording(false);
      },
      (msg) => { setError(msg); setRecording(false); }
    );
    if (recognition) { recognitionRef.current = recognition; setRecording(true); }
  }

  return (
    <PortalShell role="collector" setRole={() => window.dispatchEvent(new Event("change-role"))} title="Collector" subtitle="Capture an e-waste collection with field evidence, even when offline.">
      <div className="status-strip">
        <span className={`connection ${navigator.onLine ? "online" : "offline"}`}><i />{navigator.onLine ? "Online" : "Offline"}</span>
        <span>Collector ID <strong>C001</strong></span>
        <span>Pending sync <strong>{pending.length}</strong></span>
        {pending.length > 0 && navigator.onLine && <button className="text-button" onClick={syncPending}>{syncing ? "Syncing…" : "Sync now"}</button>}
      </div>

      <div className="tabs">
        <button className={tab === "new" ? "selected" : ""} onClick={() => setTab("new")}>Add Collection</button>
        <button className={tab === "history" ? "selected" : ""} onClick={() => { setTab("history"); loadHistory(); }}>Collection History</button>
      </div>

      <ErrorBox message={error} onRetry={loadHistory} />
      {message && <div className="alert success"><span>✓ {message}</span><button onClick={() => setMessage(null)}>×</button></div>}

      {tab === "new" ? (
        <div className="form-card">
          <div className="form-title"><div><p className="section-label">Field collection</p><h2>Log e-waste</h2></div><span className="offline-pill">Offline-first</span></div>
          <div className="form-grid">
            <label>Material
              <select value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })}>
                <option>Mobile Phones</option><option>Laptops</option><option>Monitors</option><option>Small Appliances</option>
              </select>
            </label>
            <label>Declared weight (kg)
              <input type="number" min="0.1" step="0.1" value={form.declared_weight_kg} onChange={(e) => setForm({ ...form, declared_weight_kg: e.target.value })} />
            </label>
          </div>
          <label>Collection location / note
            <input value={form.location_text} placeholder="e.g. Perungudi collection point" onChange={(e) => setForm({ ...form, location_text: e.target.value })} />
          </label>
          <div className="evidence-grid">
            <label className="upload-box">
              <span className="upload-icon">▣</span><strong>Photo evidence</strong><small>{file ? file.name : "Capture or select an image"}</small>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <div className="voice-box">
              <div><span className="upload-icon">◉</span><strong>Voice / notes</strong></div>
              <textarea value={form.voice_transcript_text} placeholder="Add a note or use voice capture…" onChange={(e) => setForm({ ...form, voice_transcript_text: e.target.value })} />
              <button className={`button secondary small ${recording ? "recording" : ""}`} onClick={toggleVoice}>{recording ? "Stop recording" : "Start voice capture"}</button>
            </div>
          </div>
          <div className="gps-line">
            <button className="button secondary" onClick={getGps}>◎ Capture GPS</button>
            <span>{form.lat != null ? `Location captured: ${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}` : "GPS is optional but strengthens the evidence trail."}</span>
          </div>
          <div className="form-footer"><span className="hint">Photo is represented by a SHA-256 evidence hash in the backend.</span><button className="button primary" onClick={saveCollection}>Save Collection</button></div>
        </div>
      ) : (
        <div className="section">
          {loadingHistory ? <div className="loading"><Spinner />Loading collection history…</div> :
            history.length === 0 ? <EmptyState title="No collections yet" message="Saved collections will appear here." /> :
            <div className="collection-list">{history.map((row) => <CollectionCard key={row.id} row={row} compact />)}</div>}
        </div>
      )}

      {pending.length > 0 && <div className="queue-panel"><div><strong>Offline queue</strong><span>{pending.length} collection{pending.length > 1 ? "s" : ""} waiting to sync</span></div><span className="badge warning">PENDING SYNC</span></div>}
    </PortalShell>
  );
}

function CollectionCard({ row, compact = false, onSelect }) {
  return (
    <div className={`collection-card ${onSelect ? "clickable" : ""}`} onClick={() => onSelect?.(row)}>
      <div className="collection-main">
        <div className="id-line"><strong>{row.id}</strong><Badge status={row.status} /></div>
        <h3>{row.material}</h3>
        <div className="meta-grid">
          <span>Collector <b>{row.collector_id}</b></span>
          <span>Declared <b>{row.declared_weight_kg} kg</b></span>
          <span>Created <b>{formatDate(row.created_at)}</b></span>
        </div>
      </div>
      {!compact && <div className="collection-side"><EvidenceSummary row={row} /></div>}
      {onSelect && <span className="arrow">→</span>}
    </div>
  );
}

function Aggregator() {
  const [rows, setRows] = useState([]);
  const [weights, setWeights] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await api.aggregatorPending()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirm(row) {
    const weight = Number(weights[row.id]);
    if (!weight || weight <= 0) { setError("Enter a valid verified weight."); return; }
    setError(""); setMessage("");
    try {
      const result = await api.aggregatorConfirm({
        collection_id: row.id, aggregator_id: "AGG001", weight_kg: weight, lat: null, lng: null,
      });
      setMessage(`${result.id} pickup confirmed. Status: ${result.status}.`);
      setSelected(null);
      await load();
    } catch (e) { setError(e.message); }
  }

  const pendingWeight = useMemo(() => rows.reduce((sum, r) => sum + Number(r.declared_weight_kg || 0), 0), [rows]);

  return (
    <PortalShell role="aggregator" setRole={() => window.dispatchEvent(new Event("change-role"))} title="Aggregator" subtitle="Confirm field pickups and establish the verified handoff record.">
      <div className="metric-grid three">
        <Metric label="Pending pickups" value={rows.length} />
        <Metric label="Pending declared weight" value={`${pendingWeight.toFixed(1)} kg`} />
        <Metric label="Demo identity" value="AGG001" />
      </div>
      <ErrorBox message={error} onRetry={load} />
      {message && <div className="alert success">✓ {message}</div>}
      <div className="section-heading"><div><p className="section-label">Pending pickups</p><h2>Awaiting verification</h2></div><button className="button secondary small" onClick={load}>Refresh</button></div>
      {loading ? <div className="loading"><Spinner />Loading pending collections…</div> :
        rows.length === 0 ? <EmptyState title="No pending pickups" message="New collector submissions will appear here after they sync." /> :
        <div className="collection-list">
          {rows.map((row) => (
            <div className="verification-card" key={row.id}>
              <CollectionCard row={row} onSelect={() => setSelected(row)} />
              <div className="verify-bar">
                <div className="weight-input"><label>Verified weight (kg)<input type="number" min="0.1" step="0.1" placeholder={row.declared_weight_kg} value={weights[row.id] || ""} onChange={(e) => setWeights({ ...weights, [row.id]: e.target.value })} /></label></div>
                <button className="button primary" onClick={() => confirm(row)}>Confirm Pickup</button>
              </div>
            </div>
          ))}
        </div>}
      {selected && <EvidenceModal row={selected} onClose={() => setSelected(null)} />}
    </PortalShell>
  );
}

function Recycler() {
  const [rows, setRows] = useState([]);
  const [weights, setWeights] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setRows(await api.recyclerPending()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function receive(row) {
    const weight = Number(weights[row.id]);
    if (!weight || weight <= 0) { setError("Enter a valid received weight."); return; }
    setError(""); setResult(null);
    try {
      const data = await api.recyclerReceive({ collection_id: row.id, recycler_id: "REC001", weight_kg: weight });
      setResult(data);
      setSelected(null);
      await load();
    } catch (e) { setError(e.message); }
  }

  return (
    <PortalShell role="recycler" setRole={() => window.dispatchEvent(new Event("change-role"))} title="Recycler" subtitle="Confirm receipt and let the backend determine EPR eligibility.">
      <div className="metric-grid three">
        <Metric label="Awaiting receipt" value={rows.length} />
        <Metric label="Demo identity" value="REC001" />
        <Metric label="Decision" value="Rule-based" />
      </div>
      <ErrorBox message={error} onRetry={load} />
      {result && (
        <div className={`result-card ${result.status === "FLAGGED" ? "danger" : "success"}`}>
          <div><span className="result-icon">{result.status === "FLAGGED" ? "!" : "✓"}</span><div><p className="section-label">Verification result</p><h2>{result.id} · {result.status === "FLAGGED" ? "Flagged" : "EPR eligible"}</h2></div></div>
          <div className="result-grid"><span>Variance <b>{result.variance_pct}%</b></span><span>Eligible weight <b>{result.epr_eligible_weight_kg ?? "—"} kg</b></span><span>Reason <b>{result.flag_reason || "No anomaly returned"}</b></span></div>
          <button className="button secondary small" onClick={() => setResult(null)}>Dismiss</button>
        </div>
      )}
      <div className="section-heading"><div><p className="section-label">Aggregator confirmed</p><h2>Awaiting recycler receipt</h2></div><button className="button secondary small" onClick={load}>Refresh</button></div>
      {loading ? <div className="loading"><Spinner />Loading collections…</div> :
        rows.length === 0 ? <EmptyState title="No collections awaiting receipt" message="Aggregator-confirmed collections will appear here." /> :
        <div className="collection-list">
          {rows.map((row) => (
            <div className="verification-card" key={row.id}>
              <CollectionCard row={row} onSelect={() => setSelected(row)} />
              <div className="recycler-details">
                <span>Aggregator <b>{row.aggregator_id || "—"}</b></span>
                <span>Verified weight <b>{row.aggregator_weight_kg} kg</b></span>
                <span>Status <Badge status={row.status} /></span>
              </div>
              <div className="verify-bar">
                <div className="weight-input"><label>Received weight (kg)<input type="number" min="0.1" step="0.1" placeholder={row.aggregator_weight_kg} value={weights[row.id] || ""} onChange={(e) => setWeights({ ...weights, [row.id]: e.target.value })} /></label></div>
                <button className="button primary" onClick={() => receive(row)}>Confirm Receipt</button>
              </div>
            </div>
          ))}
        </div>}
      {selected && <EvidenceModal row={selected} onClose={() => setSelected(null)} />}
    </PortalShell>
  );
}

function Metric({ label, value }) {
  return <div className="metric"><small>{label}</small><strong>{value}</strong></div>;
}

function Brand() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auditId, setAuditId] = useState("");
  const [audit, setAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [collections, setCollections] = useState([]);
  const [collectionError, setCollectionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setSummary(await api.eprSummary()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadCollections = useCallback(async () => {
    try {
      // The backend intentionally exposes collection history only for the collector.
      // EPR summary is therefore the authoritative Brand / PRO overview.
      setCollections([]);
    } catch (e) { setCollectionError(e.message); }
  }, []);

  useEffect(() => {
    load(); loadCollections();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load, loadCollections]);

  async function showAudit() {
    if (!auditId.trim()) return;
    setAuditLoading(true); setCollectionError("");
    try { setAudit(await api.audit(auditId.trim().toUpperCase())); }
    catch (e) { setCollectionError(e.message); setAudit(null); }
    finally { setAuditLoading(false); }
  }

  if (loading && !summary) return <PortalShell role="brand" setRole={() => window.dispatchEvent(new Event("change-role"))} title="Brand / PRO" subtitle="Compliance visibility backed by the EcoTrace evidence chain."><div className="loading"><Spinner />Loading EPR summary…</div></PortalShell>;

  return (
    <PortalShell role="brand" setRole={() => window.dispatchEvent(new Event("change-role"))} title="Brand / PRO" subtitle="Compliance-ready visibility into verified collection outcomes.">
      <ErrorBox message={error} onRetry={load} />
      {summary && <>
        <div className="metric-grid four">
          <Metric label="EPR target" value={`${summary.target_kg} kg`} />
          <Metric label="Fulfilled" value={`${summary.fulfilled_kg} kg`} />
          <Metric label="Remaining" value={`${summary.remaining_kg} kg`} />
          <Metric label="Compliance" value={`${summary.compliance_pct}%`} />
        </div>
        <div className="compliance-card">
          <div className="section-heading"><div><p className="section-label">Compliance progress</p><h2>{summary.compliance_pct}% fulfilled</h2></div><Badge status={summary.remaining_kg <= 0 ? "EPR_ELIGIBLE" : "AGGREGATOR_CONFIRMED"}>{summary.remaining_kg <= 0 ? "Target met" : "In progress"}</Badge></div>
          <div className="progress"><span style={{ width: `${Math.min(Number(summary.compliance_pct) || 0, 100)}%` }} /></div>
          <div className="progress-labels"><span>0 kg</span><span>{summary.fulfilled_kg} / {summary.target_kg} kg</span></div>
        </div>
        <div className="section-heading"><div><p className="section-label">Collection status</p><h2>Pipeline overview</h2></div></div>
        <div className="status-overview">
          <StatusCount label="Collected" value={summary.counts?.COLLECTED ?? 0} />
          <StatusCount label="Aggregator confirmed" value={summary.counts?.AGGREGATOR_CONFIRMED ?? 0} />
          <StatusCount label="EPR eligible" value={summary.counts?.EPR_ELIGIBLE ?? 0} tone="success" />
          <StatusCount label="Flagged" value={summary.counts?.FLAGGED ?? 0} tone="danger" />
        </div>
        <div className="two-col">
          <div className="panel">
            <div className="section-heading"><div><p className="section-label">Audit trail</p><h2>Inspect a collection</h2></div></div>
            <p className="panel-copy">Enter a real collection ID to view its recorded actor actions and timestamps.</p>
            <div className="audit-search"><input value={auditId} placeholder="e.g. COL-1001" onChange={(e) => setAuditId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && showAudit()} /><button className="button primary" onClick={showAudit}>{auditLoading ? <Spinner /> : "View audit"}</button></div>
            <ErrorBox message={collectionError} />
            {audit && <AuditTimeline records={audit} />}
          </div>
          <div className="panel">
            <p className="section-label">Evidence model</p>
            <h2>Compliance-ready evidence</h2>
            <p className="panel-copy">Each collection can link field evidence with the verified handoffs that follow.</p>
            <div className="evidence-checks">
              {["Photo hash", "Voice transcript", "GPS / location", "Declared weight", "Aggregator verified weight", "Recycler received weight", "Audit history"].map((item) => <span key={item}>✓ {item}</span>)}
            </div>
            <div className="honesty-note">EcoTrace reports the evidence recorded by this system. It does not claim government certification or direct CPCB integration.</div>
          </div>
        </div>
      </>}
    </PortalShell>
  );
}

function StatusCount({ label, value, tone }) {
  return <div className="status-count"><span className={`status-dot ${tone || ""}`} /><div><strong>{value}</strong><small>{label}</small></div></div>;
}

function AuditTimeline({ records }) {
  return <div className="timeline">{records.map((item, index) => <div className="timeline-item" key={item.id || index}><span className="timeline-dot" /><div><div className="timeline-title"><strong>{item.actor_role}</strong><Badge status={item.to_status}>{item.to_status}</Badge></div><p>{item.action.replaceAll("_", " ")}</p><small>{item.actor_id} · {formatDate(item.created_at)}</small></div></div>)}</div>;
}

function EvidenceModal({ row, onClose }) {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.audit(row.id).then(setAudit).catch(() => setAudit([])).finally(() => setLoading(false)); }, [row.id]);
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><p className="section-label">Collection record</p><h2>{row.id}</h2></div><button className="close" onClick={onClose}>×</button></div><CollectionCard row={row} /><EvidenceSummary row={row} /><JourneyTracker status={row.status} /><div className="modal-audit"><p className="section-label">Audit</p>{loading ? <Spinner /> : audit?.length ? <AuditTimeline records={audit} /> : <p>No audit record returned.</p>}</div></div></div>;
}

function App() {
  const [role, setRole] = useState(null);
  useEffect(() => {
    const handler = () => setRole(null);
    window.addEventListener("change-role", handler);
    return () => window.removeEventListener("change-role", handler);
  }, []);
  if (!role) return <PortalSelector setRole={setRole} />;
  return role === "collector" ? <Collector /> : role === "aggregator" ? <Aggregator /> : role === "recycler" ? <Recycler /> : <Brand />;
}

createRoot(document.getElementById("root")).render(<App />);
