import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listIncomeRecords from "./tools/list-income-records";
import incomeSummary from "./tools/income-summary";
import listNomenclature from "./tools/list-nomenclature";
import listGoals from "./tools/list-goals";
import listPortfolio from "./tools/list-portfolio";
import listPension from "./tools/list-pension";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "medincome-mcp",
  title: "MedIncome",
  version: "0.1.0",
  instructions:
    "Read-only toegang tot MedIncome-data van de ingelogde arts: inkomsten-records en samenvattingen, RIZIV-nomenclatuur, doelstellingen, pensioen/IPT snapshots en beursportfolio. Alle bedragen in EUR, taal Nederlands (nl-BE).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listIncomeRecords, incomeSummary, listNomenclature, listGoals, listPortfolio, listPension],
});
