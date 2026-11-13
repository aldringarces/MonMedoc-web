// Réglages: language, profiles (switch, add, rename, invite, join,
// Mon profil, leave, delete), the shown profile's details, address book,
// account.
import { useState, useEffect } from "https://esm.sh/preact@10.24.3/hooks";
import { html, supabase, T, languageSetting, setLanguage, profileName, menuName, detailsTitle, ofProfile, mine, AREAS, LEVELS, accessOf, canSee, inviteLink, message } from "./lib.js";
import { Avatar, Sheet, ErrorBox } from "./components.js";
import { PrescriptionFiles } from "./meds.js";
import { Spending } from "./spending.js";

export function Settings({ session, profiles, active, onSwitch, reload, openDetails, setOpenDetails }) {
  const [sheet, setSheet] = useState(null);   // "profiles" | "doctors" | "pharmacies"
  return html`
    <div class="section-title">${T("Langue", "Language")}</div>
    <div class="card form">
      <label class="row"><span class="main">${T("Langue", "Language")}</span>
        <select value=${languageSetting} onChange=${(e) => setLanguage(e.target.value)}>
          <option value="system">${T("Comme le navigateur", "Same as browser")}</option>
          <option value="fr">Français</option><option value="en">English</option>
        </select></label>
    </div>

    <div class="section-title">${T("Profils", "Profiles")}</div>
    <div class="card">
      <button class="row rowbtn" onClick=${() => setSheet("profiles")}>
        <${Avatar} profile=${active} size=${34} />
        <div class="main"><div class="name">${active ? profileName(active) : ""}</div>
          <div class="sub">${T("Changer, ajouter ou partager un profil", "Switch, add or share a profile")}</div></div>
        <span class="chev">›</span>
      </button>
      ${canSee(active, "details") && html`<button class="row rowbtn" onClick=${() => setOpenDetails(true)}>
        <div class="main name">${detailsTitle(active)}</div><span class="chev">›</span>
      </button>`}
    </div>

    <div class="section-title">${ofProfile(active, "Mon dossier santé", "My health records", "Dossier santé", "health records")}</div>
    <div class="card">
      ${canSee(active, "appointments") && html`<button class="row rowbtn" onClick=${() => setSheet("doctors")}><div class="main name">${mine(active, "Mes médecins", "My doctors", "Médecins", "Doctors")}</div><span class="chev">›</span></button>
      <button class="row rowbtn" onClick=${() => setSheet("pharmacies")}><div class="main name">${mine(active, "Mes pharmacies", "My pharmacies", "Pharmacies", "Pharmacies")}</div><span class="chev">›</span></button>`}
      ${canSee(active, "prescriptions") && html`<button class="row rowbtn" onClick=${() => setSheet("prescriptions")}><div class="main name">${mine(active, "Mes ordonnances", "My prescriptions", "Ordonnances", "Prescriptions")}</div><span class="chev">›</span></button>`}
      ${canSee(active, "spending") && html`<button class="row rowbtn" onClick=${() => setSheet("spending")}><div class="main name">${mine(active, "Mes dépenses en pharmacie", "My pharmacy spending", "Dépenses en pharmacie", "Pharmacy spending")}</div><span class="chev">›</span></button>`}
    </div>
    <p class="note indent">${!active || active.is_self
      ? T("Vos médecins et pharmacies, vos ordonnances et ce que vous avez dépensé.", "Your doctors and pharmacies, your prescriptions and what you've spent.")
      : T("Ses médecins et pharmacies, ses ordonnances et ce qui a été dépensé pour ce profil.", "Their doctors and pharmacies, their prescriptions and what was spent for this profile.")}</p>

    <div class="section-title">${T("Compte", "Account")}</div>
    <div class="card">
      <div class="row"><div class="main">E-mail</div><div class="sub">${session.user.email}</div></div>
      <button class="row rowbtn red" onClick=${() => confirm(T("Se déconnecter de MonMédoc sur ce navigateur ?", "Sign out of MonMédoc in this browser?")) && supabase.auth.signOut()}>${T("Se déconnecter", "Sign out")}</button>
    </div>
    <p class="note center">${T("Rappels, scan et ajout de traitements : dans l'app iPhone.", "Reminders, scanning and adding treatments: in the iPhone app.")}</p>

    ${sheet === "profiles" && html`<${ProfilesSheet} profiles=${profiles} onSwitch=${onSwitch} reload=${reload} onClose=${() => setSheet(null)} />`}
    ${(sheet === "doctors" || sheet === "pharmacies") && html`<${PlacesSheet} kind=${sheet} active=${active} onClose=${() => setSheet(null)} />`}
    ${sheet === "prescriptions" && html`<${Sheet} title=${mine(active, "Mes ordonnances", "My prescriptions", "Ordonnances", "Prescriptions")} onClose=${() => setSheet(null)}>
        <${PrescriptionFiles} all=${true} /><//>`}
    ${sheet === "spending" && html`<${Spending} onClose=${() => setSheet(null)} />`}
    ${openDetails && html`<${DetailsSheet} active=${active} reload=${reload} onClose=${() => setOpenDetails(false)} />`}`;
}

// ---------- Profiles ----------
function ProfilesSheet({ profiles, onSwitch, reload, onClose }) {
  const [error, setError] = useState(null);
  const [code, setCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [people, setPeople] = useState(false);
  const sorted = [...profiles].sort((a, b) => (b.is_self - a.is_self) || profileName(a).localeCompare(profileName(b)));
  const active = profiles.find((p) => p.is_active);

  async function run(fn) {
    setError(null);
    try { await fn(); await reload(); } catch (e) { setError(message(e)); }
  }
  const rpc = async (name, args) => { const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data; };

  function add() {
    const first = prompt(T("Prénom du nouveau profil", "New profile's first name"));
    if (!first || !first.trim()) return;
    const last = prompt(T("Nom (facultatif)", "Last name (optional)")) || "";
    run(() => rpc("create_profile", { p_first_name: first.trim(), p_last_name: last.trim().toUpperCase() }));
  }
  function rename(p) {
    const first = prompt(T("Prénom", "First name"), ["Moi", "Me"].includes(p.first_name) ? "" : p.first_name);
    if (first === null || !first.trim()) return;
    const last = prompt(T("Nom (facultatif)", "Last name (optional)"), p.last_name || "");
    if (last === null) return;
    run(async () => {
      const { error } = await supabase.from("profiles").update({ first_name: first.trim(), last_name: last.trim().toUpperCase() || null }).eq("id", p.id);
      if (error) throw error;
    });
  }
  function join() {
    const value = prompt(T("Code d'invitation (6 caractères)", "Invitation code (6 characters)"));
    if (value && value.trim()) run(() => rpc("accept_profile_invite", { p_code: value.trim() }));
  }
  async function invite() {
    setError(null); setCopied(false);
    try { setCode(await rpc("create_profile_invite")); } catch (e) { setError(message(e)); }
  }
  async function copy() {
    const text = T(`Rejoins le profil « ${profileName(active)} » dans MonMédoc : ${inviteLink(code)} (code ${code}, valable 7 jours)`,
                   `Join the "${profileName(active)}" profile in MonMédoc: ${inviteLink(code)} (code ${code}, valid 7 days)`);
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { prompt(T("Copiez ce message :", "Copy this message:"), text); }
  }

  return html`<${Sheet} title=${T("Profils", "Profiles")} onClose=${onClose}>
    <${ErrorBox} error=${error} />
    <div class="card">${sorted.map((p) => html`<div class="row">
      <button class="plainbtn" onClick=${() => onSwitch(p.id)}><${Avatar} profile=${p} size=${36} /></button>
      <button class="main plainbtn left" onClick=${() => onSwitch(p.id)}>
        <div class="name">${p.is_self ? T(`${profileName(p)} · Mon profil`, `${profileName(p)} · My profile`) : profileName(p)}</div>
        <div class="sub">${p.role === "owner" ? T("Créé par vous", "Created by you") : T("Rejoint avec un code", "Joined with a code")} · ${p.member_count > 1 ? T(`Partagé à ${p.member_count}`, `Shared by ${p.member_count}`) : T("Seulement vous", "Only you")}</div>
      </button>
      ${p.is_active && html`<span class="check">✓</span>`}
      <details class="more"><summary aria-label=${T("Plus", "More")}>⋯</summary><div class="menu small">
        <button onClick=${() => rename(p)}>${T("Renommer", "Rename")}</button>
        ${!p.is_self && html`<button onClick=${() => run(() => rpc("set_self_profile", { p_profile: p.id }))}>${T("Mon profil", "My profile")}</button>`}
        ${p.member_count > 1 && html`<button onClick=${() => confirm(T("Quitter ce profil ? Ses données restent pour les autres.", "Leave this profile? Its data stays for the others.")) && run(() => rpc("leave_profile", { p_profile: p.id }))}>${T("Quitter", "Leave")}</button>`}
        ${p.role === "owner" && html`<button class="red" onClick=${() => confirm(T("Supprimer ce profil et toutes ses données, pour tout le monde ?", "Delete this profile and all its data, for everyone?")) && run(() => rpc("delete_profile", { p_profile: p.id }))}>${T("Supprimer", "Delete")}</button>`}
      </div></details>
    </div>`)}</div>
    <p class="note">${T("Touchez un profil pour l'afficher.", "Tap a profile to show it.")}</p>

    <div class="section-title">${T("Partager", "Share")}</div>
    <div class="card">
      ${(!active || active.role === "owner") && html`<button class="row rowbtn" onClick=${invite}>${T(`Inviter quelqu'un sur « ${active ? profileName(active) : ""} »`, `Invite someone to "${active ? profileName(active) : ""}"`)}</button>`}
      ${active && active.member_count > 1 && html`<button class="row rowbtn" onClick=${() => setPeople(true)}><div class="main name">${T("Personnes et accès", "People and access")}</div><span class="chev">›</span></button>`}
      ${code && html`<div class="row"><div class="main center">
        <div class="code">${code}</div>
        <div class="sub">${inviteLink(code)}</div>
        <button class="primary small" onClick=${copy}>${copied ? T("Copié ✓", "Copied ✓") : T("Copier le message", "Copy the message")}</button>
      </div></div>`}
      <button class="row rowbtn" onClick=${join}>${T("Rejoindre avec un code", "Join with a code")}</button>
      <button class="row rowbtn" onClick=${add}>${T("Ajouter un profil", "Add a profile")}</button>
    </div>
    <p class="note">${T("Code valable 7 jours, une seule fois. Dans « Personnes et accès », choisissez ce que chacun peut voir ou modifier.",
                        "Code valid 7 days, once. In \"People and access\", choose what each person can see or change.")}</p>
    ${people && html`<${PeopleSheet} active=${active} onClose=${() => { setPeople(false); reload(); }} />`}
  </${Sheet}>`;
}

// ---------- People and access (update 036) ----------
function memberName(m) {
  if (m.name && !["Moi", "Me"].includes(m.name)) return m.name;
  if (m.email && !m.email.endsWith("privaterelay.appleid.com")) return m.email;
  return m.name || T("Quelqu'un", "Someone");
}
const memberLevel = (m, area) => (m.role === "owner" ? "edit" : (m.permissions || {})[area] || "edit");
function memberSummary(m) {
  if (m.role === "owner") return T("Propriétaire", "Owner");
  const levels = AREAS.map(([a]) => memberLevel(m, a));
  if (levels.every((l) => l === "edit")) return T("Peut tout modifier", "Can edit everything");
  if (levels.every((l) => l === "view")) return T("Peut tout voir", "Can view everything");
  return T("Accès limité", "Limited access");
}

function PeopleSheet({ active, onClose }) {
  const [members, setMembers] = useState(null);
  const [open, setOpen] = useState(null);       // user_id being edited
  const [error, setError] = useState(null);
  const owner = active && active.role === "owner";

  async function load() {
    const { data, error } = await supabase.rpc("profile_member_list");
    if (error) setError(message(error)); else setMembers(data || []);
  }
  useEffect(() => { load(); }, []);

  async function setLevel(m, area, level) {
    setError(null);
    setMembers((list) => list.map((x) => x.user_id === m.user_id ? { ...x, permissions: { ...(x.permissions || {}), [area]: level } } : x));
    const { error } = await supabase.rpc("set_member_access", { p_user: m.user_id, p_area: area, p_level: level });
    if (error) { setError(message(error)); load(); }
  }
  async function setAll(m, level) { for (const [a] of AREAS) await setLevel(m, a, level); }
  async function remove(m) {
    if (!confirm(T(`Retirer ${memberName(m)} de ce profil ?`, `Remove ${memberName(m)} from this profile?`))) return;
    const { error } = await supabase.rpc("remove_member", { p_user: m.user_id });
    if (error) setError(message(error)); else { setOpen(null); load(); }
  }

  return html`<${Sheet} title=${T("Personnes et accès", "People and access")} onClose=${onClose}>
    <${ErrorBox} error=${error} />
    <div class="card">${!members ? html`<div class="row">…</div>` : members.map((m) => html`
      ${owner && m.role !== "owner"
        ? html`<button class="row rowbtn" onClick=${() => setOpen(open === m.user_id ? null : m.user_id)}>
            <div class="main"><div class="name">${memberName(m)}</div><div class="sub">${memberSummary(m)}</div></div>
            <span class="chev">${open === m.user_id ? "⌄" : "›"}</span></button>`
        : html`<div class="row"><div class="main"><div class="name">${memberName(m)}${m.is_me ? T(" (vous)", " (you)") : ""}</div><div class="sub">${memberSummary(m)}</div></div></div>`}
      ${open === m.user_id && html`<div class="row access"><div class="main">
        <div class="quick">
          <button class="small" onClick=${() => setAll(m, "edit")}>${T("Tout modifier", "Edit everything")}</button>
          <button class="small" onClick=${() => setAll(m, "view")}>${T("Tout voir", "View everything")}</button>
        </div>
        ${AREAS.map(([a, fr, en]) => html`<div class="access-row">
          <div class="name">${T(fr, en)}</div>
          <div class="segmented small">${LEVELS.map(([l, lfr, len]) => html`<button class=${memberLevel(m, a) === l ? "on" : ""} onClick=${() => setLevel(m, a, l)}>${T(lfr, len)}</button>`)}</div>
          ${a === "treatments" && html`<div class="sub">${T("« Voir » permet quand même de cocher une prise.", "\"View\" still lets them tick a dose.")}</div>`}
        </div>`)}
        <button class="rowbtn red" onClick=${() => remove(m)}>${T("Retirer de ce profil", "Remove from this profile")}</button>
      </div></div>`}`)}
    </div>
    <p class="note">${owner
      ? T("Masqué : la partie n'apparaît pas. Voir : lecture seule. Modifier : peut ajouter, changer et supprimer. Ses rappels suivent les mêmes règles.",
          "Hidden: the part doesn't appear. View: read only. Edit: can add, change and delete. Their reminders follow the same rules.")
      : T("Seul le propriétaire du profil choisit ce que chacun peut voir ou modifier.", "Only the profile's owner chooses what each person can see or change.")}</p>
    ${!owner && active && html`<div class="section-title">${T("Vos accès", "Your access")}</div>
      <div class="card">${AREAS.map(([a, fr, en]) => html`<div class="row"><div class="main">${T(fr, en)}</div>
        <div class="sub">${T(...LEVELS.find(([l]) => l === accessOf(active, a)).slice(1))}</div></div>`)}</div>`}
  </${Sheet}>`;
}

// ---------- Address book (read-only here) ----------
function PlacesSheet({ kind, active, onClose }) {
  const [places, setPlaces] = useState(null);
  useEffect(() => { supabase.from(kind).select().order("name").then(({ data }) => setPlaces(data || [])); }, []);
  return html`<${Sheet} title=${kind === "doctors" ? mine(active, "Mes médecins", "My doctors", "Médecins", "Doctors") : mine(active, "Mes pharmacies", "My pharmacies", "Pharmacies", "Pharmacies")} onClose=${onClose}>
    <div class="card">${!places ? html`<div class="row">…</div>` : !places.length ? html`<div class="row sub">${T("Aucun pour l'instant.", "None yet.")}</div>` :
      places.map((p) => html`<div class="row"><div class="main">
        <div class="name">${p.name}</div>
        ${p.speciality && html`<div class="sub">${p.speciality}</div>`}
        ${p.address && html`<div class="sub">${p.address}</div>`}
        ${p.phone && html`<a class="link small" href=${"tel:" + p.phone.replace(/[^\d+]/g, "")}>${p.phone}</a>`}
      </div></div>`)}</div>
  </${Sheet}>`;
}

// ---------- Profile details ----------
const BLOOD = ["", "A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"];
const RELATIONS = () => [
  ["spouse", T("Conjoint(e)", "Spouse")], ["partner", T("Partenaire", "Partner")], ["parent", T("Parent", "Parent")],
  ["child", T("Enfant", "Child")], ["sibling", T("Frère ou sœur", "Brother or sister")], ["family", T("Autre membre de la famille", "Other relative")],
  ["friend", T("Ami(e)", "Friend")], ["neighbour", T("Voisin(e)", "Neighbour")], ["carer", T("Aidant(e)", "Carer")], ["other", T("Autre", "Other")],
];
const FIELDS = ["birth_date", "birth_place", "blood_type", "address", "phone", "allergies", "conditions", "gp_doctor_id",
                "emergency_name", "emergency_relation", "emergency_phone"];

/// "+33612345678" → "+33 6 12 34 56 78" (same rules as the app, main countries)
function formatPhone(raw) {
  const t = raw.trim();
  const intl = t.startsWith("+") || t.startsWith("00");
  let digits = t.replace(/\D/g, "");
  if (t.startsWith("00")) digits = digits.slice(2);
  if (!digits) return intl ? "+" : "";
  const group = (d, sizes) => { const parts = []; let i = 0;
    sizes.forEach((s, k) => { if (i < d.length) { const take = k === sizes.length - 1 ? d.length - i : Math.min(s, d.length - i); parts.push(d.slice(i, i + take)); i += take; } });
    return parts.join(" "); };
  if (intl) {
    const countries = [["351", [3, 3, 3]], ["352", [3, 3, 3]], ["212", [3, 2, 2, 2]], ["33", [1, 2, 2, 2, 2]], ["32", [3, 2, 2, 2]],
      ["41", [2, 3, 2, 2]], ["44", [4, 6]], ["63", [3, 3, 4]], ["49", [3, 8]], ["34", [3, 2, 2, 2]], ["39", [3, 3, 4]], ["1", [3, 3, 4]]];
    const c = countries.find(([code]) => digits.startsWith(code));
    if (c) { let rest = digits.slice(c[0].length); if (rest.startsWith("0")) rest = rest.slice(1); return rest ? `+${c[0]} ${group(rest, c[1])}` : `+${c[0]}`; }
    return "+" + group(digits, [3, 3, 3, 3, 3]);
  }
  return group(digits, [2, 2, 2, 2, 2, 2]);
}

function DetailsSheet({ active, reload, onClose }) {
  const [first, setFirst] = useState(active ? active.first_name : "");
  const [last, setLast] = useState(active && active.last_name ? active.last_name.toUpperCase() : "");
  const [d, setD] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const [details, docs] = await Promise.all([
        supabase.from("profile_details").select().limit(1),
        supabase.from("doctors").select("id,name").order("name"),
      ]);
      setD((details.data && details.data[0]) || {});
      setDoctors(docs.data || []);
    })();
  }, []);

  const set = (key) => (e) => { setSaved(false); setD({ ...d, [key]: e.target.value }); };
  const setPhone = (key) => (e) => { setSaved(false); setD({ ...d, [key]: formatPhone(e.target.value) }); };

  async function save() {
    setError(null);
    const row = { profile_id: active.id };
    for (const k of FIELDS) row[k] = d[k] && String(d[k]).trim() ? String(d[k]).trim() : null;
    const { error: e1 } = await supabase.from("profile_details").upsert(row, { onConflict: "profile_id" });
    if (e1) { setError(message(e1)); return; }
    if (first.trim() && (first.trim() !== active.first_name || last.trim().toUpperCase() !== (active.last_name || ""))) {
      const { error: e2 } = await supabase.from("profiles").update({ first_name: first.trim(), last_name: last.trim().toUpperCase() || null }).eq("id", active.id);
      if (e2) { setError(message(e2)); return; }
      await reload();
    }
    setSaved(true);
  }

  return html`<${Sheet} title=${detailsTitle(active)} onClose=${onClose}
      actions=${html`<button class="link strong" onClick=${save} disabled=${!d}>${saved ? T("Enregistré ✓", "Saved ✓") : T("Enregistrer", "Save")}</button>`}>
    <${ErrorBox} error=${error} />
    ${!d ? html`<div class="empty">…</div>` : html`
      <div class="section-title">${T("Identité", "Identity")}</div>
      <div class="card form">
        <label class="row"><span class="main">${T("Prénom", "First name")}</span><input value=${first} onInput=${(e) => { setSaved(false); setFirst(e.target.value); }} /></label>
        <label class="row"><span class="main">${T("Nom", "Last name")}</span><input value=${last} onInput=${(e) => { setSaved(false); setLast(e.target.value.toUpperCase()); }} /></label>
        <label class="row"><span class="main">${T("Date de naissance", "Date of birth")}</span><input type="date" value=${d.birth_date || ""} onInput=${set("birth_date")} /></label>
        <label class="row"><span class="main">${T("Lieu de naissance", "Place of birth")}</span><input placeholder=${T("Ville, Pays", "City, Country")} value=${d.birth_place || ""} onInput=${set("birth_place")} /></label>
        <label class="row"><span class="main">${T("Groupe sanguin", "Blood type")}</span>
          <select value=${d.blood_type || ""} onChange=${set("blood_type")}>${BLOOD.map((b) => html`<option value=${b}>${b || T("Non renseigné", "Not set")}</option>`)}</select></label>
      </div>
      <div class="section-title">${T("Coordonnées", "Contact details")}</div>
      <div class="card form">
        <label class="row"><span class="main">${T("Adresse", "Address")}</span><input value=${d.address || ""} onInput=${set("address")} /></label>
        <label class="row"><span class="main">${T("Téléphone", "Phone")}</span><input type="tel" value=${d.phone || ""} onInput=${setPhone("phone")} /></label>
      </div>
      <div class="section-title">${T("Santé", "Health")}</div>
      <div class="card form">
        <label class="row"><span class="main">${T("Allergies", "Allergies")}</span><input value=${d.allergies || ""} onInput=${set("allergies")} /></label>
        <label class="row"><span class="main">${T("Autres informations", "Other information")}</span><input value=${d.conditions || ""} onInput=${set("conditions")} /></label>
        <label class="row"><span class="main">${T("Médecin traitant", "GP")}</span>
          <select value=${d.gp_doctor_id || ""} onChange=${set("gp_doctor_id")}>
            <option value="">${T("Aucun", "None")}</option>${doctors.map((doc) => html`<option value=${doc.id}>${doc.name}</option>`)}</select></label>
      </div>
      <div class="section-title">${T("Personne à prévenir", "Emergency contact")}</div>
      <div class="card form">
        <label class="row"><span class="main">${T("Nom", "Name")}</span><input value=${d.emergency_name || ""} onInput=${set("emergency_name")} /></label>
        <label class="row"><span class="main">${T("Lien", "Relationship")}</span>
          <select value=${d.emergency_relation || ""} onChange=${set("emergency_relation")}>
            <option value="">${T("Non précisé", "Not set")}</option>${RELATIONS().map(([v, t]) => html`<option value=${v}>${t}</option>`)}</select></label>
        <label class="row"><span class="main">${T("Téléphone", "Phone")}</span><input type="tel" value=${d.emergency_phone || ""} onInput=${setPhone("emergency_phone")} /></label>
      </div>
      <p class="note">${T("Le numéro de sécurité sociale reste sur l'iPhone, il n'est jamais enregistré en ligne.",
                          "The social security number stays on the iPhone; it's never stored online.")}</p>`}
  </${Sheet}>`;
}
