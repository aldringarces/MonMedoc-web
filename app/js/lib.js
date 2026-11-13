// Shared pieces: database connection, language, small helpers.
import { h } from "https://esm.sh/preact@10.24.3";
import htm from "https://esm.sh/htm@3.1.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const html = htm.bind(h);

// Same project as the iPhone app (publishable key: safe in a web page)
export const supabase = createClient(
  "https://fritnkzqgymhuthgysll.supabase.co",
  "sb_publishable_1XY9zX8MFCbL5Tc1J2a8xA_qEMo268k",
  { auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" } }
);

// ---------- Language: Réglages › Langue, else the browser's ----------
function storedLanguage() {
  try { return localStorage.getItem("lang") || "system"; } catch { return "system"; }
}
export const languageSetting = storedLanguage();
export const english = languageSetting === "en"
  || (languageSetting === "system" && !(navigator.language || "fr").toLowerCase().startsWith("fr"));
export const T = (fr, en) => (english ? en : fr);
export function setLanguage(value) {
  try { localStorage.setItem("lang", value); } catch {}
  location.reload();
}
document.documentElement.lang = english ? "en" : "fr";
export const locale = english ? "en-GB" : "fr-FR";
export const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";

// ---------- Dates and numbers ----------
export const shortTime = (t) => (t || "").slice(0, 5);
export const timeOf = (ts) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
export const parseDay = (d) => (d ? new Date(d + "T00:00:00") : null);
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
export const dayText = (date) => new Date(date).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
export const longDay = (date) => new Date(date).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
export const clean = (n) => (Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(1));
export const message = (e) => {
  const text = (e && (e.message || e.error_description)) || String(e);
  if (text.includes("row-level security"))
    return T("Vous n'avez pas le droit de modifier ceci sur ce profil. Demandez à son propriétaire.",
             "You're not allowed to change this on this profile. Ask its owner.");
  return text;
};

// What a shared person may see or change (update 036). Owner = everything; nothing set = edit.
export const AREAS = [
  ["treatments", "Traitements et prises", "Treatments and doses"],
  ["inventory", "Inventaire", "Inventory"],
  ["appointments", "Rendez-vous, médecins, pharmacies", "Appointments, doctors, pharmacies"],
  ["details", "Informations personnelles", "Personal details"],
  ["prescriptions", "Ordonnances", "Prescriptions"],
  ["spending", "Dépenses en pharmacie", "Pharmacy spending"],
];
export const LEVELS = [["hidden", "Masqué", "Hidden"], ["view", "Voir", "View"], ["edit", "Modifier", "Edit"]];
export const accessOf = (p, area) => (!p || p.role === "owner" ? "edit" : (p.permissions || {})[area] || "edit");
export const canSee = (p, area) => accessOf(p, area) !== "hidden";
export const canEdit = (p, area) => accessOf(p, area) === "edit";

/// "3 boîte(s) + 12" (or "40" when the box size is unknown)
export function boxes(units, perBox) {
  units = Number(units);
  if (!perBox || perBox <= 1) return clean(units);
  const full = Math.floor(units / perBox), rest = units - full * perBox;
  const b = T(`${full} boîte(s)`, `${full} box(es)`);
  return full === 0 ? clean(rest) : rest ? `${b} + ${clean(rest)}` : b;
}

// ---------- Profiles ----------
export const profileName = (p) => [p.first_name, p.last_name ? p.last_name.toUpperCase() : null].filter(Boolean).join(" ");
export const menuName = (p) => (p.is_self ? T("Mon profil", "My profile") : profileName(p));
export const initials = (p) => ((p.first_name || "?")[0] + ((p.last_name || "")[0] || "")).toUpperCase();
// "Mon dossier santé" on my own profile, "Dossier santé de Rubilita" on someone else's
export function ofProfile(p, mineFR, mineEN, nounFR, nounEN) {
  if (!p || p.is_self) return T(mineFR, mineEN);
  const first = (p.first_name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()[0] || "";
  return T(`${nounFR} ${"aeiouyh".includes(first) ? "d'" : "de "}${p.first_name}`, `${p.first_name}'s ${nounEN}`);
}
export const detailsTitle = (p) => ofProfile(p, "Mes informations", "My details", "Informations", "details");
// "Mes ordonnances" on my own profile, plain "Ordonnances" on someone else's
export const mine = (p, fr, en, otherFR, otherEN) => (!p || p.is_self ? T(fr, en) : T(otherFR, otherEN));
export const inviteLink = (code) => `https://monmedoc.kalatas.com/rejoindre/?code=${code}`;
