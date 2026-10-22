import { Camera, ClipboardList, FileDown, Search, Share2, Trash2, Trophy, UserPlus, Medal, type LucideIcon } from "lucide-react";
import type { SceneId } from "./help-illustrations";

// The Fest Portal's help guides (/help). Plain copy in English and Malayalam,
// like every other static string in the app. Quoted UI labels ("Register
// now", "My regs", …) stay in English in both languages: the app's own
// buttons never localize, so a translated label would send someone looking
// for text that isn't on screen.

export type Lang = "en" | "ml";

export interface HelpStep {
  en: string;
  ml: string;
  /** Drawn screen shown with this step (help-illustrations.tsx). */
  scene?: SceneId;
}

export interface HelpGuide {
  id: string;
  icon: LucideIcon;
  title: Record<Lang, string>;
  summary: Record<Lang, string>;
  steps: HelpStep[];
}

export const HELP_HEADER: Record<Lang, { title: string; subtitle: string; index: string; askAngel: string; askAngelHint: string }> = {
  en: {
    title: "Help",
    subtitle: "Step-by-step guides for registering, results and sharing.",
    index: "Guides",
    askAngel: "Ask Angel",
    askAngelHint: "Can't find it? Ask Angel about a participant, shakha, meghala or competition.",
  },
  ml: {
    title: "സഹായം",
    subtitle: "രജിസ്ട്രേഷൻ, ഫലങ്ങൾ, ഷെയർ ചെയ്യൽ — ഘട്ടം ഘട്ടമായുള്ള സഹായം.",
    index: "ഗൈഡുകൾ",
    askAngel: "Angel-നോട് ചോദിക്കൂ",
    askAngelHint: "കണ്ടെത്താനായില്ലേ? ഒരു പങ്കാളി, ശാഖ, മേഖല അല്ലെങ്കിൽ മത്സരത്തെക്കുറിച്ച് Angel-നോട് ചോദിക്കൂ.",
  },
};

export const HELP_GUIDES: HelpGuide[] = [
  {
    id: "register",
    icon: UserPlus,
    title: { en: "Register a participant", ml: "ഒരു പങ്കാളിയെ രജിസ്റ്റർ ചെയ്യാം" },
    summary: { en: "For Shakha, Meghala and Diocese admins.", ml: "ശാഖ, മേഖല, രൂപത അഡ്മിൻമാർക്ക്." },
    steps: [
      { en: "On the Fest Portal home, tap the fest card under Active Fests.", ml: "Fest Portal ഹോമിൽ Active Fests-ന് താഴെയുള്ള ഫെസ്റ്റ് കാർഡ് ടാപ്പ് ചെയ്യുക.", scene: "home-fests" },
      { en: "Tap \"Login to register\" and sign in with your Shakha, Meghala or Diocese admin login. Then tap \"Register now\".", ml: "\"Login to register\" ടാപ്പ് ചെയ്ത് നിങ്ങളുടെ ശാഖ, മേഖല അല്ലെങ്കിൽ രൂപതാ അഡ്മിൻ ലോഗിൻ ഉപയോഗിച്ച് സൈൻ ഇൻ ചെയ്യുക. പിന്നെ \"Register now\" ടാപ്പ് ചെയ്യുക.", scene: "fest-actions" },
      { en: "Fill in the name, house name, date of birth, gender and phone. The age category is worked out from the date of birth.", ml: "പേര്, വീട്ടുപേര്, ജനനത്തീയതി, ലിംഗം, ഫോൺ നമ്പർ എന്നിവ പൂരിപ്പിക്കുക. ജനനത്തീയതിയിൽ നിന്ന് പ്രായവിഭാഗം സ്വയം കണ്ടെത്തും.", scene: "register-details" },
      { en: "Pick up to 2 individual competitions, and any team events. Items whose places are full are locked.", ml: "പരമാവധി 2 വ്യക്തിഗത മത്സരങ്ങളും ടീം ഇനങ്ങളും തിരഞ്ഞെടുക്കുക. സ്ഥാനങ്ങൾ നിറഞ്ഞ ഇനങ്ങൾ ലോക്ക് ആയിരിക്കും.", scene: "register-events" },
      { en: "Check everything on Review and tap \"Confirm Registration\". Keep the registration number shown on the next screen.", ml: "Review-ൽ എല്ലാം പരിശോധിച്ച് \"Confirm Registration\" ടാപ്പ് ചെയ്യുക. അടുത്ത സ്ക്രീനിൽ കാണിക്കുന്ന രജിസ്ട്രേഷൻ നമ്പർ സൂക്ഷിക്കുക.", scene: "register-review" },
    ],
  },
  {
    id: "photo",
    icon: Camera,
    title: { en: "Add a participant photo", ml: "പങ്കാളിയുടെ ഫോട്ടോ ചേർക്കാം" },
    summary: { en: "Shown on the winner poster and the results screen.", ml: "വിജയി പോസ്റ്ററിലും ഫല സ്ക്രീനിലും കാണിക്കും." },
    steps: [
      { en: "When an individual event is picked, a Photo step appears after Events. Tap \"Take photo\" or \"Choose photo\".", ml: "ഒരു വ്യക്തിഗത ഇനം തിരഞ്ഞെടുത്താൽ Events-ന് ശേഷം Photo ഘട്ടം വരും. \"Take photo\" അല്ലെങ്കിൽ \"Choose photo\" ടാപ്പ് ചെയ്യുക.", scene: "register-photo" },
      { en: "Drag and zoom to frame the face, then tap \"Use photo\". It's compressed before upload.", ml: "മുഖം ഫ്രെയിമിൽ വരുന്ന വിധം നീക്കി സൂം ചെയ്യുക, പിന്നെ \"Use photo\" ടാപ്പ് ചെയ്യുക. അപ്‌ലോഡിന് മുമ്പ് ഫോട്ടോ ചെറുതാക്കും." },
      { en: "No photo now? Tap \"Skip for now\" and add it later from My regs → edit.", ml: "ഇപ്പോൾ ഫോട്ടോ ഇല്ലേ? \"Skip for now\" ടാപ്പ് ചെയ്യുക; പിന്നീട് My regs → എഡിറ്റിൽ നിന്ന് ചേർക്കാം." },
    ],
  },
  {
    id: "my-registrations",
    icon: ClipboardList,
    title: { en: "See my registrations", ml: "എന്റെ രജിസ്ട്രേഷനുകൾ കാണാം" },
    summary: { en: "Every entry for your shakha, grouped by competition.", ml: "നിങ്ങളുടെ ശാഖയുടെ എല്ലാ എൻട്രികളും, മത്സരം അനുസരിച്ച്." },
    steps: [
      { en: "Open the fest and tap the \"My regs\" tile. Sign in if asked.", ml: "ഫെസ്റ്റ് തുറന്ന് \"My regs\" ടൈൽ ടാപ്പ് ചെയ്യുക. ചോദിച്ചാൽ സൈൻ ഇൻ ചെയ്യുക.", scene: "fest-actions" },
      { en: "Entries are listed by competition. Tap a row to see the people in it.", ml: "എൻട്രികൾ മത്സരം അനുസരിച്ച് പട്ടികപ്പെടുത്തിയിരിക്കുന്നു. ഒരു വരി ടാപ്പ് ചെയ്താൽ അതിലെ പങ്കാളികളെ കാണാം.", scene: "my-regs" },
    ],
  },
  {
    id: "edit-delete",
    icon: Trash2,
    title: { en: "Edit or delete a registration", ml: "രജിസ്ട്രേഷൻ തിരുത്താം / ഡിലീറ്റ് ചെയ്യാം" },
    summary: { en: "Change details, events or the photo — or remove the entry.", ml: "വിവരങ്ങൾ, ഇനങ്ങൾ, ഫോട്ടോ എന്നിവ മാറ്റാം — അല്ലെങ്കിൽ എൻട്രി നീക്കാം." },
    steps: [
      { en: "In My regs, tap the pencil next to the participant.", ml: "My regs-ൽ പങ്കാളിയുടെ അരികിലുള്ള പെൻസിൽ ടാപ്പ് ചെയ്യുക.", scene: "my-regs" },
      { en: "Change what you need and tap \"Save Changes\". To delete, tap \"Remove Registration\" and confirm with \"Yes, Delete\".", ml: "വേണ്ടത് മാറ്റി \"Save Changes\" ടാപ്പ് ചെയ്യുക. ഡിലീറ്റ് ചെയ്യാൻ \"Remove Registration\" ടാപ്പ് ചെയ്ത് \"Yes, Delete\" കൊണ്ട് സ്ഥിരീകരിക്കുക.", scene: "edit-remove" },
      { en: "Deleting removes the participant and all their competition entries. It can't be undone.", ml: "ഡിലീറ്റ് ചെയ്താൽ പങ്കാളിയും അവരുടെ എല്ലാ മത്സര എൻട്രികളും നീക്കം ചെയ്യപ്പെടും. ഇത് തിരിച്ചെടുക്കാനാവില്ല." },
    ],
  },
  {
    id: "pdf",
    icon: FileDown,
    title: { en: "Download the registration PDF", ml: "രജിസ്ട്രേഷൻ PDF ഡൗൺലോഡ് ചെയ്യാം" },
    summary: { en: "A printable sheet of your shakha's entries.", ml: "നിങ്ങളുടെ ശാഖയുടെ എൻട്രികളുടെ പ്രിന്റ് ചെയ്യാവുന്ന ഷീറ്റ്." },
    steps: [
      { en: "In My regs, tap \"Download\" at the top of the list.", ml: "My regs-ൽ പട്ടികയുടെ മുകളിലുള്ള \"Download\" ടാപ്പ് ചെയ്യുക.", scene: "my-regs" },
      { en: "The sheet opens in a new tab. Choose Print, then \"Save as PDF\".", ml: "ഷീറ്റ് പുതിയ ടാബിൽ തുറക്കും. Print തിരഞ്ഞെടുത്ത് \"Save as PDF\" ആക്കുക." },
    ],
  },
  {
    id: "results",
    icon: Trophy,
    title: { en: "Find results", ml: "ഫലങ്ങൾ കാണാം" },
    summary: { en: "Winners, places and grades for every published item.", ml: "പ്രസിദ്ധീകരിച്ച ഓരോ ഇനത്തിന്റെയും വിജയികൾ, സ്ഥാനങ്ങൾ, ഗ്രേഡുകൾ." },
    steps: [
      { en: "The newest result is on the home page under Latest Result.", ml: "ഏറ്റവും പുതിയ ഫലം ഹോം പേജിൽ Latest Result-ന് താഴെയുണ്ട്.", scene: "latest-result" },
      { en: "For all results, tap Results in the menu. Pick the fest and an age category, then tap a competition to open it.", ml: "എല്ലാ ഫലങ്ങൾക്കും മെനുവിൽ Results ടാപ്പ് ചെയ്യുക. ഫെസ്റ്റും പ്രായവിഭാഗവും തിരഞ്ഞെടുത്ത് ഒരു മത്സരം തുറക്കുക.", scene: "results-list" },
    ],
  },
  {
    id: "whatsapp",
    icon: Share2,
    title: { en: "Share a result on WhatsApp", ml: "ഫലം WhatsApp-ൽ ഷെയർ ചെയ്യാം" },
    summary: { en: "A winner poster with the details, ready to send.", ml: "വിവരങ്ങളോടെയുള്ള വിജയി പോസ്റ്റർ, അയയ്ക്കാൻ തയ്യാർ." },
    steps: [
      { en: "On any 1st, 2nd or 3rd place row, tap the green WhatsApp button.", ml: "ഒന്നാം, രണ്ടാം, മൂന്നാം സ്ഥാനങ്ങളുടെ വരിയിലെ പച്ച WhatsApp ബട്ടൺ ടാപ്പ് ചെയ്യുക.", scene: "latest-result" },
      { en: "The poster opens. Add a photo if you like, then tap \"Share on WhatsApp\".", ml: "പോസ്റ്റർ തുറക്കും. വേണമെങ്കിൽ ഫോട്ടോ ചേർക്കുക, പിന്നെ \"Share on WhatsApp\" ടാപ്പ് ചെയ്യുക.", scene: "poster-share" },
      { en: "On a phone, pick WhatsApp in the share sheet — the image and details are attached. On a computer, the poster downloads and WhatsApp opens with the message typed; attach the image there.", ml: "ഫോണിൽ ഷെയർ ലിസ്റ്റിൽ WhatsApp തിരഞ്ഞെടുക്കുക — ചിത്രവും വിവരങ്ങളും ചേർന്നിരിക്കും. കമ്പ്യൂട്ടറിൽ പോസ്റ്റർ ഡൗൺലോഡ് ആകും, WhatsApp സന്ദേശത്തോടെ തുറക്കും; അവിടെ ചിത്രം ചേർക്കുക." },
    ],
  },
  {
    id: "search",
    icon: Search,
    title: { en: "Look up a participant", ml: "ഒരു പങ്കാളിയെ കണ്ടെത്താം" },
    summary: { en: "By name, house name or registration number.", ml: "പേര്, വീട്ടുപേര് അല്ലെങ്കിൽ രജിസ്ട്രേഷൻ നമ്പർ വഴി." },
    steps: [
      { en: "Tap Search in the menu and type a name, house name or registration number.", ml: "മെനുവിൽ Search ടാപ്പ് ചെയ്ത് പേര്, വീട്ടുപേര് അല്ലെങ്കിൽ രജിസ്ട്രേഷൻ നമ്പർ ടൈപ്പ് ചെയ്യുക.", scene: "search" },
      { en: "Or ask Angel, the assistant at the bottom right — it also answers shakha, meghala and competition questions.", ml: "അല്ലെങ്കിൽ താഴെ വലതുവശത്തുള്ള Angel-നോട് ചോദിക്കൂ — ശാഖ, മേഖല, മത്സരങ്ങൾ എന്നിവയെക്കുറിച്ചും മറുപടി നൽകും.", scene: "angel" },
    ],
  },
  {
    id: "rankings",
    icon: Medal,
    title: { en: "Rankings", ml: "റാങ്കിംഗ്" },
    summary: { en: "Points, medals and grades for every shakha and meghala.", ml: "ഓരോ ശാഖയുടെയും മേഖലയുടെയും പോയിന്റുകൾ, മെഡലുകൾ, ഗ്രേഡുകൾ." },
    steps: [
      { en: "Tap Ranks in the menu. Switch between Shakha and Meghala, and between all fests and one fest.", ml: "മെനുവിൽ Ranks ടാപ്പ് ചെയ്യുക. ശാഖ / മേഖല, എല്ലാ ഫെസ്റ്റുകളും / ഒരു ഫെസ്റ്റ് എന്നിങ്ങനെ മാറ്റാം.", scene: "rankings" },
      { en: "Tap a row to see that shakha's or meghala's points by category.", ml: "ഒരു വരി ടാപ്പ് ചെയ്താൽ ആ ശാഖയുടെയോ മേഖലയുടെയോ വിഭാഗം തിരിച്ചുള്ള പോയിന്റുകൾ കാണാം." },
    ],
  },
];
