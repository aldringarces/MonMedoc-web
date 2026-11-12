// "What it's for" in a few words, from the official indications —
// the same table as the iPhone app (Services/Purpose.swift).
import { T } from "./lib.js";

const TABLE = [
  [/trouble(s)? bipolaire|maladie bipolaire|maniaco/, "Trouble bipolaire", "Bipolar disorder"],
  [/schizophren/, "Schizophrénie", "Schizophrenia"],
  [/deficit(aire)? de l.attention|tdah/, "TDAH", "ADHD"],
  [/narcolep/, "Narcolepsie", "Narcolepsy"],
  [/insomni/, "Insomnie", "Insomnia"],
  [/depressi/, "Dépression", "Depression"],
  [/anxi/, "Anxiété", "Anxiety"],
  [/epilep|convulsi/, "Épilepsie", "Epilepsy"],
  [/alzheimer|demence/, "Démence / Alzheimer", "Dementia / Alzheimer's"],
  [/parkinson/, "Parkinson", "Parkinson's"],
  [/sclerose en plaques/, "Sclérose en plaques", "Multiple sclerosis"],
  [/migraine/, "Migraine", "Migraine"],
  [/hypertension (arterielle|essentielle)/, "Hypertension", "High blood pressure"],
  [/hypertension (arterielle )?pulmonaire/, "Hypertension pulmonaire", "Pulmonary hypertension"],
  [/insuffisance cardiaque/, "Insuffisance cardiaque", "Heart failure"],
  [/angor|angine de poitrine/, "Angine de poitrine", "Angina"],
  [/fibrillation auriculaire|troubles du rythme/, "Rythme cardiaque", "Heart rhythm"],
  [/thrombo|embolie/, "Caillots sanguins", "Blood clots"],
  [/hypercholesterol|dyslipid|hyperlipid/, "Cholestérol", "Cholesterol"],
  [/diabete/, "Diabète", "Diabetes"],
  [/hypothyroid/, "Hypothyroïdie", "Underactive thyroid"],
  [/hyperthyroid/, "Hyperthyroïdie", "Overactive thyroid"],
  [/hyperuricemi/, "Acide urique élevé", "High uric acid"],
  [/\bgoutte\b/, "Goutte", "Gout"],
  [/maladie periodique|fievre mediterraneenne/, "Maladie périodique", "Familial Mediterranean fever"],
  [/reflux/, "Reflux gastrique", "Acid reflux"],
  [/ulcere/, "Ulcère", "Ulcer"],
  [/nausee|vomissement/, "Nausées", "Nausea"],
  [/constipation/, "Constipation", "Constipation"],
  [/diarrhee/, "Diarrhée", "Diarrhoea"],
  [/polyarthrite rhumatoide/, "Polyarthrite", "Rheumatoid arthritis"],
  [/arthrose/, "Arthrose", "Osteoarthritis"],
  [/tendinite|tendinopathie/, "Tendinite", "Tendinitis"],
  [/entorse|contusion|traumatisme/, "Entorse / choc", "Sprain / bruise"],
  [/osteoporose/, "Ostéoporose", "Osteoporosis"],
  [/douleur/, "Douleur", "Pain"],
  [/fievre/, "Fièvre", "Fever"],
  [/asthme/, "Asthme", "Asthma"],
  [/bpco|bronchopneumopathie chronique obstructive/, "BPCO", "COPD"],
  [/toux/, "Toux", "Cough"],
  [/rhinite allergique|allergi|urticaire/, "Allergie", "Allergy"],
  [/psoriasis/, "Psoriasis", "Psoriasis"],
  [/eczema|dermatite/, "Eczéma", "Eczema"],
  [/acne/, "Acné", "Acne"],
  [/glaucome/, "Glaucome", "Glaucoma"],
  [/hypertrophie benigne de la prostate/, "Prostate", "Enlarged prostate"],
  [/vessie hyperactive|incontinence/, "Vessie", "Bladder"],
  [/contracept/, "Contraception", "Contraception"],
  [/menopause/, "Ménopause", "Menopause"],
  [/anemie|carence (martiale|en fer)/, "Anémie", "Anaemia"],
  [/carence en vitamine d|vitamine d/, "Vitamine D", "Vitamin D"],
  [/\bvih\b/, "VIH", "HIV"],
  [/hepatite/, "Hépatite", "Hepatitis"],
  [/cancer|carcinome|tumeur|leucemie|lymphome/, "Cancer", "Cancer"],
  [/infection/, "Infection", "Infection"],
];

const fold = (s) => s.toLowerCase().replace(/œ/g, "oe").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/// "Goutte · Acide urique élevé": the first two conditions mentioned.
export function purposeFrom(indications, limit = 2) {
  if (!indications) return null;
  const text = fold(indications);
  const found = [];
  for (const [re, fr, en] of TABLE) {
    const m = text.search(re);
    if (m >= 0 && !found.some((f) => f.fr === fr)) found.push({ at: m, fr, en });
  }
  const list = found.sort((a, b) => a.at - b.at).slice(0, limit).map((f) => T(f.fr, f.en));
  return list.length ? list.join(" · ") : null;
}
