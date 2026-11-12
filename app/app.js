// MonMédoc — web version (same Supabase database as the iPhone app).
// No build step: Preact + htm and supabase-js are loaded from esm.sh.
// Sign-in: a link (or code) sent by email. Using the same email as your
// Apple account gives the same account, so the same data.
// Everything goes through the database's own rules (Row Level Security):
// you only ever see the profile shown, like in the app.

import { h, render } from "https://esm.sh/preact@10.24.3";
import { useState, useEffect, useRef } from "https://esm.sh/preact@10.24.3/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const html = htm.bind(h);

// Same project as the iPhone app (publishable key: safe in a web page)
const supabase = createClient(
  "https://fritnkzqgymhuthgysll.supabase.co",
  "sb_publishable_1XY9zX8MFCbL5Tc1J2a8xA_qEMo268k",
  { auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" } }
);

// ---------- Language: French or English, like the browser ----------
const english = !(navigator.language || "fr").toLowerCase().startsWith("fr");
const T = (fr, en) => (english ? en : fr);
document.documentElement.lang = english ? "en" : "fr";
const locale = english ? "en-GB" : "fr-FR";
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";

const shortTime = (t) => (t || "").slice(0, 5);                       // "08:00:00" → "08:00"
const timeOf = (ts) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
const dayText = (d) => new Date(d + "T12:00:00").toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
const clean = (n) => (Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(1));
const message = (e) => (e && (e.message || e.error_description)) || String(e);

// ---------- Sign-in ----------
function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function send(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    setBusy(false);
    if (error) setError(message(error)); else setSent(true);
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(message(error));
  }

  return html`
    <div class="page"><div class="signin">
      <img src="logo.png" alt="" />
      <h1>MonMédoc</h1>
      ${!sent ? html`
        <p class="sub">${T("Connectez-vous avec l'adresse e-mail de votre compte MonMédoc (celle de votre identifiant Apple).",
                           "Sign in with your MonMédoc account's email (the one on your Apple ID).")}</p>
        <form onSubmit=${send}>
          <input class="field" type="email" required placeholder=${T("Adresse e-mail", "Email address")}
                 value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="email" />
          <button class="primary" disabled=${busy || !email}>${T("Recevoir un lien de connexion", "Send me a sign-in link")}</button>
        </form>` : html`
        <p class="sub">${T(`Un e-mail a été envoyé à ${email}. Ouvrez-le sur cet ordinateur et touchez le lien.`,
                           `An email was sent to ${email}. Open it on this computer and tap the link.`)}</p>
        <form onSubmit=${verify}>
          <input class="field" inputmode="numeric" placeholder=${T("…ou entrez le code à 6 chiffres", "…or enter the 6-digit code")}
                 value=${code} onInput=${(e) => setCode(e.target.value)} />
          <button class="primary" disabled=${busy || code.trim().length < 6}>${T("Se connecter", "Sign in")}</button>
        </form>
        <button class="link" onClick=${() => { setSent(false); setCode(""); }}>${T("Changer d'adresse", "Use another email")}</button>`}
      ${error && html`<div class="error">${error}</div>`}
      <p class="note">${T("Les mêmes données que l'app iPhone, protégées par les mêmes règles.",
                          "The same data as the iPhone app, protected by the same rules.")}</p>
    </div></div>`;
}

// ---------- Profiles (same as the app: one shown at a time) ----------
function initials(p) {
  return ((p.first_name || "?")[0] + ((p.last_name || "")[0] || "")).toUpperCase();
}
function profileName(p) {
  return [p.first_name, p.last_name ? p.last_name.toUpperCase() : null].filter(Boolean).join(" ");
}
function menuName(p) {
  return p.is_self ? T("Mon profil", "My profile") : profileName(p);
}

function Avatar({ profile, onClick }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    setSrc(null);
    if (!profile || !profile.photo_updated_at) return;
    let url;
    supabase.storage.from("profile-photos").download(profile.id.toLowerCase() + ".jpg").then(({ data }) => {
      if (data) { url = URL.createObjectURL(data); setSrc(url); }
    });
    return () => url && URL.revokeObjectURL(url);
  }, [profile && profile.id, profile && profile.photo_updated_at]);
  return html`<button class="avatar" onClick=${onClick} title=${profile ? profileName(profile) : ""}>
    ${src ? html`<img src=${src} alt="" />` : profile ? initials(profile) : "?"}
  </button>`;
}

function ProfileMenu({ profiles, active, onSwitch, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const sorted = [...profiles].sort((a, b) => (b.is_self - a.is_self) || profileName(a).localeCompare(profileName(b)));
  return html`<div style="position:relative" ref=${ref}>
    <${Avatar} profile=${active} onClick=${() => setOpen(!open)} />
    ${open && html`<div class="menu">
      ${sorted.map((p) => html`<button onClick=${() => { setOpen(false); onSwitch(p.id); }}>
        <span class="check">${p.is_active ? "✓" : ""}</span>${menuName(p)}</button>`)}
      <hr />
      <button onClick=${onSignOut}><span class="check"></span>${T("Se déconnecter", "Sign out")}</button>
    </div>`}
  </div>`;
}

// ---------- Today ----------
const groups = [
  [T("Matin", "Morning"), 0, 10], [T("Midi", "Midday"), 11, 14],
  [T("Après-midi", "Afternoon"), 15, 17], [T("Soir", "Evening"), 18, 23],
];

function Today({ doses, onToggle }) {
  if (!doses) return html`<div class="empty">…</div>`;
  if (!doses.length) return html`<div class="empty">${T("Rien de prévu aujourd'hui.", "Nothing planned today.")}</div>`;
  return groups.map(([title, from, to]) => {
    const items = doses.filter((d) => { const hr = new Date(d.scheduled_for).getHours(); return hr >= from && hr <= to; });
    if (!items.length) return null;
    return html`<div>
      <div class="section-title">${title}</div>
      <div class="card">${items.map((d) => {
        const auto = d.logging_mode === "automatic";
        const taken = d.status === "taken";
        return html`<div class="row">
          <button class=${"tick" + (taken ? " done" : "") + (auto ? " auto" : "")} disabled=${auto}
                  onClick=${() => !auto && onToggle(d)} aria-label=${taken ? T("Pris", "Taken") : T("À prendre", "To take")}>
            ${taken ? "✓" : ""}</button>
          <div class="main">
            <div class="name">${d.display_name}</div>
            <div class="sub">${clean(d.units)} × ${d.form || T("unité", "unit")} · ${timeOf(d.scheduled_for)}</div>
            ${auto && html`<div class="sub">${taken ? T("Prise enregistrée automatiquement", "Logged automatically")
                                                    : T("Sera enregistrée automatiquement", "Will be logged automatically")}</div>`}
          </div>
        </div>`;
      })}</div>
    </div>`;
  });
}

// ---------- Treatments ----------
function Treatments({ meds }) {
  if (!meds) return html`<div class="empty">…</div>`;
  if (!meds.length) return html`<div class="empty">${T("Aucun traitement en cours.", "No current treatment.")}</div>`;
  return html`<div class="card" style="margin-top:12px">${meds.map((m) => html`<div class="row"><div class="main">
    <div class="name">${m.display_name}</div>
    ${m.purpose && html`<div class="purpose">${m.purpose}</div>`}
    <div class="sub">${clean(m.units_per_dose)} × ${(m.dose_times || []).map(shortTime).join(" · ")}</div>
    <div class="sub">${T(`${clean(m.current_stock)} restant(s)`, `${clean(m.current_stock)} left`)}
      ${m.days_of_stock_left != null ? ` · ${m.days_of_stock_left} ${T("j", "d")}` : ""}
      ${m.prescription_end_date ? ` · ${T("jusqu'au", "until")} ${dayText(m.prescription_end_date)}` : ""}</div>
    <div class="badges">
      ${m.low_stock && html`<span class="badge low">${T("Stock bas", "Low stock")}</span>`}
      ${m.pharmacy_owes && html`<span class="badge owes">${T(`La pharmacie doit ${clean(m.units_outstanding)}`, `Pharmacy owes ${clean(m.units_outstanding)}`)}</span>`}
      ${m.rdv_due && html`<span class="badge rdv">${T("RDV à prendre", "Book appointment")}</span>`}
    </div>
  </div></div>`)}</div>`;
}

// ---------- The signed-in app ----------
function Main({ session }) {
  const [tab, setTab] = useState("today");
  const [profiles, setProfiles] = useState([]);
  const [doses, setDoses] = useState(null);
  const [meds, setMeds] = useState(null);
  const [error, setError] = useState(null);
  const active = profiles.find((p) => p.is_active);

  async function loadProfiles() {
    // First time on the web: makes sure this account has a profile
    const { error: e1 } = await supabase.rpc("ensure_my_profile", { p_first_name: T("Moi", "Me") });
    if (e1) throw e1;
    const { data, error } = await supabase.from("my_profiles").select();
    if (error) throw error;
    setProfiles(data);
  }

  async function loadData() {
    await supabase.rpc("ensure_today_doses", { p_tz: tz });
    const [d, m] = await Promise.all([
      supabase.from("today_doses").select().order("scheduled_for"),
      supabase.from("med_list").select(),
    ]);
    if (d.error) throw d.error;
    if (m.error) throw m.error;
    setDoses(d.data);
    setMeds(m.data);
  }

  async function loadAll() {
    setError(null);
    try { await loadProfiles(); await loadData(); } catch (e) { setError(message(e)); }
  }

  useEffect(() => { loadAll(); }, [session.user.id]);
  // Coming back to the tab: refresh (the iPhone may have ticked doses)
  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && loadData().catch(() => {});
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, []);

  async function switchTo(id) {
    if (active && id === active.id) return;
    setDoses(null); setMeds(null);
    const { error } = await supabase.rpc("set_active_profile", { p_profile: id });
    if (error) setError(message(error));
    await loadAll();
  }

  async function toggle(d) {
    const status = d.status === "taken" ? "pending" : "taken";
    setDoses(doses.map((x) => (x.dose_log_id === d.dose_log_id ? { ...x, status } : x)));
    const { error } = await supabase.from("dose_logs").update({ status }).eq("id", d.dose_log_id);
    if (error) setError(message(error));   // e.g. not enough stock
    await loadData().catch(() => {});
  }

  const taken = (doses || []).filter((d) => d.status === "taken").length;
  const title = tab === "today" ? T("Aujourd'hui", "Today") : T("Traitements", "Treatments");

  return html`<div class="page">
    <div class="header">
      <div class="header-row">
        <h1>${title}</h1>
        <${ProfileMenu} profiles=${profiles} active=${active} onSwitch=${switchTo} onSignOut=${() => supabase.auth.signOut()} />
      </div>
      <div class="header-sub">
        ${tab === "today"
          ? (doses && doses.length
              ? html`<div class="progress"><div style=${`width:${(100 * taken) / doses.length}%`}></div></div>
                     <span>${T(`${taken}/${doses.length} prises`, `${taken}/${doses.length} taken`)}</span>`
              : html`<span>${active ? profileName(active) : ""}</span>`)
          : html`<span>${active ? profileName(active) : ""}</span>`}
      </div>
    </div>
    ${error && html`<div class="error">${error}</div>`}
    ${tab === "today" ? html`<${Today} doses=${doses} onToggle=${toggle} />` : html`<${Treatments} meds=${meds} />`}
    <nav class="tabs">
      <button class=${tab === "today" ? "on" : ""} onClick=${() => setTab("today")}>${T("Aujourd'hui", "Today")}</button>
      <button class=${tab === "meds" ? "on" : ""} onClick=${() => setTab("meds")}>${T("Traitements", "Treatments")}</button>
    </nav>
  </div>`;
}

// ---------- Root: signed in or not ----------
function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return html`<div class="empty">…</div>`;
  return session ? html`<${Main} session=${session} />` : html`<${SignIn} />`;
}

render(html`<${App} />`, document.getElementById("app"));
