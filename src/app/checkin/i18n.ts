/**
 * Words for the guest check-in form, in English and Spanish.
 * The Spanish should be checked by a Spanish speaker before going live.
 * To change a sentence, change it here in both languages.
 */
import type { LotId, VehicleType } from "@/lib/lots";

export type Lang = "en" | "es";
export const LANG_KEY = "hojo-guest-lang";

const en = {
  checkIn: "Parking\ncheck-in",
  linkBroken: "This link isn't working",
  linkBrokenText: "Please scan the QR code at the front desk again, or ask the front desk to check you in.",
  allSet: (name: string) => `You're all set, ${name}!`,
  registered: (plate: string): [string, string, string] => ["Your car ", plate, " is registered."],
  parkIn: "Please park in",
  checkout: "Checkout",
  reference: "Reference",
  matched: "We found your online booking and linked it.",
  already: "This car was already checked in, so nothing new was added.",
  showDesk: "Show this screen to the front desk if they ask.",
  another: "Register another car",
  whatParking: "What are you parking?",
  chooseOne: "Please choose one.",
  chooseWhere: "Choose where to park",
  parkHere: "Park here",
  chooseLot: "Choose a lot",
  fromAbove: (lot: string) => `${lot} from above`,
  rules: "Parking rules",
  full: "Full",
  yourDetails: "Your details",
  fullName: "Full name",
  enterName: "Please enter your name.",
  phone: "Phone",
  optional: "Optional",
  yourCar: "Your car",
  plate: "License plate",
  enterPlate: "Please enter your plate.",
  state: "State",
  make: "Make",
  model: "Model",
  color: "Color",
  required: "Required",
  yourStay: "Your stay",
  checkoutDate: "Check-out date",
  days: (n: number) => `${n} day${n === 1 ? "" : "s"}`,
  ofParking: "of parking",
  confirmation: "Booked online? Confirmation #",
  submitting: "Submitting...",
  submit: "Submit check-in",
  wrong: "Something went wrong. Please ask the front desk.",
  isFull: (lot: string) => `${lot} is full`,
  parkingFull: "Parking is full",
  askDesk: "Please check with the front desk where to park.",
  dontPark: "Please don't park yet. The front desk will tell you which lot to use.",
  directionsTo: (lot: string) => `Directions to ${lot}`,
  appleMaps: "or open in Apple Maps",
  opensGoogle: ["Opens the lot in Google Maps. Tap ", "Directions", " there."] as [string, string, string],
  vehicle: { car: "Car", suv: "SUV", truck: "Truck" } as Record<VehicleType, string>,
  lotName: { lot1: "Lot 1", lot2: "Lot 2", lot3: "Lot 3", hotel: "Hotel Lot" } as Record<LotId, string>,
  lotRule: { lot1: "Cars & SUVs only", lot2: "Trucks only", lot3: "Any vehicle", hotel: "Ask the front desk" } as Record<LotId, string>,
  lotPlace: {
    lot1: "Fenced lot on E Melvin St",
    lot2: "401 N 41st St",
    lot3: "Along E Melvin St, behind the hotel building",
    hotel: "At the hotel, 4120 E Van Buren St",
  } as Record<LotId, string>,
  locale: "en-US",
};

const es: typeof en = {
  checkIn: "Registro de\nestacionamiento",
  linkBroken: "Este enlace no funciona",
  linkBrokenText: "Por favor, escanee otra vez el código QR de la recepción, o pida a la recepción que lo registre.",
  allSet: (name: string) => `¡Listo, ${name}!`,
  registered: (plate: string) => ["Su vehículo ", plate, " quedó registrado."],
  parkIn: "Por favor, estacione en",
  checkout: "Salida",
  reference: "Referencia",
  matched: "Encontramos su reservación en línea y la vinculamos.",
  already: "Este vehículo ya estaba registrado, así que no se agregó nada nuevo.",
  showDesk: "Muestre esta pantalla a la recepción si se lo piden.",
  another: "Registrar otro vehículo",
  whatParking: "¿Qué va a estacionar?",
  chooseOne: "Por favor, elija uno.",
  chooseWhere: "Elija dónde estacionar",
  parkHere: "Estacione aquí",
  chooseLot: "Elija un estacionamiento",
  fromAbove: (lot: string) => `${lot} visto desde arriba`,
  rules: "Reglas de estacionamiento",
  full: "Lleno",
  yourDetails: "Sus datos",
  fullName: "Nombre completo",
  enterName: "Por favor, escriba su nombre.",
  phone: "Teléfono",
  optional: "Opcional",
  yourCar: "Su vehículo",
  plate: "Placa",
  enterPlate: "Por favor, escriba su placa.",
  state: "Estado",
  make: "Marca",
  model: "Modelo",
  color: "Color",
  required: "Obligatorio",
  yourStay: "Su estancia",
  checkoutDate: "Fecha de salida",
  days: (n: number) => `${n} día${n === 1 ? "" : "s"}`,
  ofParking: "de estacionamiento",
  confirmation: "¿Reservó en línea? N.º de confirmación",
  submitting: "Enviando...",
  submit: "Enviar registro",
  wrong: "Algo salió mal. Por favor, pregunte en la recepción.",
  isFull: (lot: string) => `${lot} está lleno`,
  parkingFull: "El estacionamiento está lleno",
  askDesk: "Por favor, pregunte en la recepción dónde estacionar.",
  dontPark: "Por favor, no estacione todavía. La recepción le dirá qué estacionamiento usar.",
  directionsTo: (lot: string) => `Cómo llegar a ${lot}`,
  appleMaps: "o abrir en Apple Maps",
  opensGoogle: ["Abre el estacionamiento en Google Maps. Ahí toque ", "Cómo llegar", "."],
  vehicle: { car: "Auto", suv: "SUV", truck: "Pickup" },
  lotName: { lot1: "Lote 1", lot2: "Lote 2", lot3: "Lote 3", hotel: "Lote del hotel" },
  lotRule: { lot1: "Solo autos y SUV", lot2: "Solo pickups", lot3: "Cualquier vehículo", hotel: "Pregunte en la recepción" },
  lotPlace: {
    lot1: "Lote cercado en E Melvin St",
    lot2: "401 N 41st St",
    lot3: "A lo largo de E Melvin St, detrás del hotel",
    hotel: "En el hotel, 4120 E Van Buren St",
  },
  locale: "es-US",
};

export const WORDS = { en, es };
export type Words = typeof en;

/** Error messages from the database, in Spanish. Unknown messages stay in English. */
const ES_ERRORS: Record<string, string> = {
  "Could not submit.": "No se pudo enviar.",
  "One of the fields is too long.": "Uno de los campos es demasiado largo.",
  "Please choose Car, SUV or Truck.": "Por favor, elija Auto, SUV o Pickup.",
  "Please enter the make and model.": "Por favor, escriba la marca y el modelo.",
  "Please enter your full name.": "Por favor, escriba su nombre completo.",
  "Please enter your license plate (letters and numbers only).": "Por favor, escriba su placa (solo letras y números).",
  "Please pick a check-out date after today (up to 60 days).": "Por favor, elija una fecha de salida después de hoy (hasta 60 días).",
  "The check-in form is busy. Please wait a few minutes or ask the front desk.": "El formulario está ocupado. Por favor, espere unos minutos o pregunte en la recepción.",
  "This check-in link is no longer valid. Please ask the front desk.": "Este enlace de registro ya no es válido. Por favor, pregunte en la recepción.",
  "Too many tries from this phone. Please wait a few minutes or ask the front desk.": "Demasiados intentos desde este teléfono. Por favor, espere unos minutos o pregunte en la recepción.",
};

export function translateError(message: string, lang: Lang) {
  return lang === "es" ? ES_ERRORS[message] ?? message : message;
}

/** Spanish if the phone is set to Spanish (or the guest picked it before), otherwise English. */
export function startingLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    /* private window */
  }
  return (navigator.languages?.[0] ?? navigator.language ?? "en").toLowerCase().startsWith("es") ? "es" : "en";
}
