// MonMédoc — web version (same Supabase database as the iPhone app).
// No build step: Preact + htm and supabase-js are loaded from esm.sh.
// Sign-in: a link (or code) sent by email. Using the same email as your
// Apple account gives the same account, so the same data. Everything goes
// through the database's own rules: you only see the profile shown.
import { render } from "https://esm.sh/preact@10.24.3";
import { useState, useEffect } from "https://esm.sh/preact@10.24.3/hooks";
import { html, supabase, T, tz, profileName, message, canSee } from "./js/lib.js";
import { ProfileMenu, ErrorBox } from "./js/components.js";
import { Today } from "./js/today.js";
import { History } from "./js/history.js";
import { Treatments, Inventory, loadShortages } from "./js/meds.js";
import { loadIndications } from "./js/info.js";
import { FollowUp } from "./js/followup.js";
import { Settings } from "./js/settings.js";

// An invitation opened in the browser: /app/?join=ABC123 (kept until signed in)
const joinFromLink = new URLSearchParams(location.search).get("join");
if (joinFromLink) {
  try { sessionStorage.setItem("join", joinFromLink.toUpperCase()); } catch {}
  history.replaceState(null, "", location.pathname);
}

// ---------- Sign-in ----------
function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [usesCode, setUsesCode] = useState(false);   // false = password
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function send(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
    setBusy(false);
    // The mail server is slow: Supabase gives up after 10 s ("Load failed",
    // 504) although the email still goes out. Show the code screen anyway.
    const slow = error && (error.name === "AuthRetryableFetchError" || !error.status || error.status >= 500);
    if (error && !slow) setError(message(error)); else setSent(true);
  }
  async function passwordSignIn(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) setError(/invalid login/i.test(error.message)
      ? T("E-mail ou mot de passe incorrect. Pas encore de mot de passe ? Utilisez « Code par e-mail », puis Réglages › Mot de passe.",
          "Wrong email or password. No password yet? Use \"Email code\", then Settings › Password.")
      : message(error));
  }
  async function verify(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(message(error));
  }

  return html`<div class="page"><div class="signin">
    <img src="logo.png" alt="" />
    <h1>MonMédoc</h1>
    <div class="segmented signin-mode">
      <button class=${!usesCode ? "on" : ""} onClick=${() => { setUsesCode(false); setError(null); }}>${T("Mot de passe", "Password")}</button>
      <button class=${usesCode ? "on" : ""} onClick=${() => { setUsesCode(true); setError(null); }}>${T("Code par e-mail", "Email code")}</button>
    </div>
    ${!usesCode ? html`
      <form onSubmit=${passwordSignIn}>
        <input class="field" type="email" required placeholder=${T("Adresse e-mail", "Email address")}
               value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="username" />
        <input class="field" type="password" required placeholder=${T("Mot de passe", "Password")}
               value=${password} onInput=${(e) => setPassword(e.target.value)} autocomplete="current-password" />
        <button class="primary" disabled=${busy || !email || password.length < 6}>${T("Se connecter", "Sign in")}</button>
      </form>` : !sent ? html`
      <p class="sub">${T("Recevez un code par e-mail (adresse de votre compte MonMédoc).",
                         "Get a code by email (your MonMédoc account's address).")}</p>
      <form onSubmit=${send}>
        <input class="field" type="email" required placeholder=${T("Adresse e-mail", "Email address")}
               value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="email" />
        <button class="primary" disabled=${busy || !email}>${T("Recevoir un code", "Send me a code")}</button>
      </form>` : html`
      <p class="sub">${T(`Un e-mail a été envoyé à ${email} (il peut mettre une minute). Tapez le code, ou touchez le lien sur cet appareil.`,
                         `An email was sent to ${email} (it can take a minute). Type the code, or tap the link on this device.`)}</p>
      <form onSubmit=${verify}>
        <input class="field" inputmode="numeric" autocomplete="one-time-code" placeholder=${T("Code à 6 chiffres", "6-digit code")}
               value=${code} onInput=${(e) => setCode(e.target.value)} />
        <button class="primary" disabled=${busy || code.trim().length < 6}>${T("Se connecter", "Sign in")}</button>
      </form>
      <button class="link" onClick=${() => { setSent(false); setCode(""); }}>${T("Changer d'adresse", "Use another email")}</button>`}
    <${ErrorBox} error=${error} />
    <p class="note">${T("Les mêmes données que l'app iPhone, protégées par les mêmes règles.", "The same data as the iPhone app, protected by the same rules.")}</p>
  </div></div>`;
}

// ---------- The signed-in app ----------
function Main({ session }) {
  const [tab, setTab] = useState("today");
  const [medsView, setMedsView] = useState("treatments");
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [doses, setDoses] = useState(null);
  const [meds, setMeds] = useState(null);
  const [shortages, setShortages] = useState({});
  const [indications, setIndications] = useState({});
  const [summary, setSummary] = useState("");
  const [openDetails, setOpenDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState(null);
  const active = profiles.find((p) => p.is_active);
  const showsInventory = medsView === "inventory" && canSee(active, "inventory");

  async function loadProfiles() {
    const { error: e1 } = await supabase.rpc("ensure_my_profile", { p_first_name: T("Moi", "Me") });
    if (e1) throw e1;
    const { data, error } = await supabase.from("my_profiles").select();
    if (error) throw error;
    setProfiles(data);
  }
  async function loadData() {
    await supabase.rpc("ensure_today_doses", { p_tz: tz });
    const [d, m] = await Promise.all([supabase.from("today_doses").select().order("scheduled_for"), supabase.from("med_list").select()]);
    if (d.error) throw d.error;
    if (m.error) throw m.error;
    setDoses(d.data);
    setMeds(m.data);
    const [sh, ind] = await Promise.all([loadShortages(m.data), loadIndications(m.data.map((x) => x.cis_code))]);
    setShortages(sh);
    setIndications(ind);
  }
  async function loadAll() {
    setError(null);
    try { await loadProfiles(); await loadData(); } catch (e) { setError(message(e)); }
    // Invitation link opened before signing in
    let code = null;
    try { code = sessionStorage.getItem("join"); sessionStorage.removeItem("join"); } catch {}
    if (code && confirm(T(`Rejoindre le profil partagé avec le code ${code} ?`, `Join the shared profile with code ${code}?`))) {
      const { error } = await supabase.rpc("accept_profile_invite", { p_code: code });
      if (error) setError(message(error)); else await loadAll();
    }
  }

  useEffect(() => { loadAll(); }, [session.user.id]);
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && loadData().catch(() => {});
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  async function switchTo(id) {
    if (active && id === active.id) return;
    setDoses(null); setMeds(null); setShortages({}); setSummary("");
    const { error } = await supabase.rpc("set_active_profile", { p_profile: id });
    if (error) setError(message(error));
    await loadAll();
  }

  async function toggle(d) {
    const status = d.status === "taken" ? "pending" : "taken";
    setDoses(doses.map((x) => (x.dose_log_id === d.dose_log_id ? { ...x, status } : x)));
    const { error } = await supabase.from("dose_logs").update({ status }).eq("id", d.dose_log_id);
    if (error) setError(message(error));
    await loadData().catch(() => {});
  }

  // "Si besoin" doses aren't planned: they don't count in the progress
  const planned = (doses || []).filter((d) => !d.as_needed);
  const taken = planned.filter((d) => d.status === "taken").length;
  const titles = { today: T("Aujourd'hui", "Today"), meds: T("Médicaments", "Medicines"), followup: T("Suivi", "Follow-up"), settings: T("Réglages", "Settings") };

  // One line under every title, same height on every tab
  const subline = {
    today: planned.length
      ? html`<div class="progress"><div style=${`width:${(100 * taken) / planned.length}%`}></div></div>
             <span>${T(`${taken}/${planned.length} prises`, `${taken}/${planned.length} taken`)}</span>`
      : html`<span>${T("Aucune prise prévue", "No doses planned")}</span>`,
    meds: html`<div class="segmented">
      <button class=${medsView === "treatments" ? "on" : ""} onClick=${() => setMedsView("treatments")}>${T("Traitements", "Treatments")}</button>
      ${canSee(active, "inventory") && html`<button class=${medsView === "inventory" ? "on" : ""} onClick=${() => setMedsView("inventory")}>${T("Inventaire", "Inventory")}</button>`}</div>`,
    followup: html`<span>${summary}</span>`,
    settings: html`<span>${session.user.email}</span>`,
  }[tab];

  return html`<div class="page">
    <div class="header">
      <div class="header-row">
        <h1>${titles[tab]}</h1>
        ${tab === "today" && html`<button class="iconbtn" onClick=${() => setShowHistory(true)} title=${T("Historique des prises", "Dose history")}
            aria-label=${T("Historique des prises", "Dose history")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg></button>`}
        <${ProfileMenu} profiles=${profiles} active=${active} onSwitch=${switchTo} onManage=${() => setTab("settings")} />
      </div>
      <div class="header-sub">${subline}</div>
      ${tab === "meds" && showsInventory && html`<input class="search" type="search"
          placeholder=${T("Nom, substance ou code CIP", "Name, substance or CIP code")} value=${search} onInput=${(e) => setSearch(e.target.value)} />`}
    </div>
    <${ErrorBox} error=${error} />
    ${active && !active.is_self && tab !== "settings" && html`<p class="sub indent">${T("Profil affiché :", "Profile shown:")} ${profileName(active)}</p>`}
    ${tab === "today" && html`<${Today} doses=${doses} meds=${meds} indications=${indications} onToggle=${toggle}
        onChanged=${() => loadData().catch((e) => setError(message(e)))} onError=${setError} />`}
    ${showHistory && html`<${History} onClose=${() => setShowHistory(false)} onChanged=${() => loadData().catch(() => {})} />`}
    ${tab === "meds" && (!showsInventory ? html`<${Treatments} meds=${meds} shortages=${shortages} indications=${indications} />` : html`<${Inventory} key=${active && active.id} search=${search} />`)}
    ${tab === "followup" && html`<${FollowUp} key=${active && active.id} meds=${meds} shortages=${shortages} onSummary=${setSummary} />`}
    ${tab === "settings" && html`<${Settings} session=${session} profiles=${profiles} active=${active} onSwitch=${switchTo}
        reload=${loadAll} openDetails=${openDetails} setOpenDetails=${setOpenDetails} />`}
    <nav class="tabs">
      ${[["today", T("Aujourd'hui", "Today")], ["meds", T("Médicaments", "Medicines")], ["followup", T("Suivi", "Follow-up")], ["settings", T("Réglages", "Settings")]]
        .map(([id, label]) => html`<button class=${tab === id ? "on" : ""} onClick=${() => setTab(id)}>${label}</button>`)}
    </nav>
  </div>`;
}

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
