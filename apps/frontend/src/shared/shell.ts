/**
 * Beschreibt Titel, Regionen und Kurztexte der gemeinsamen Frontend-Shell.
 */
import type { UiShellDescriptor } from "@leitstelle/contracts";

export const shell: UiShellDescriptor = {
  title: "Leitstelle",
  subtitle: "Operative Leitstellenoberflaeche mit Alarm-Core, Monitoring, Karte und Archiv",
  regions: [
    { id: "authentication", title: "Zugang", description: "Authentifizierung und Session-Basis." },
    { id: "dashboard", title: "Dashboard", description: "Kompakte operative Uebersicht ueber Lage und Systemzustand." },
    { id: "reporting", title: "Reporting", description: "Kompakte Auswertung mit Zeitraum-, Filter- und Gruppierungslogik." },
    { id: "archive", title: "Archiv", description: "Archivierte Alarmfaelle, Filter und kontrollierter Medienzugriff." },
    { id: "map", title: "DACH-Karte", description: "Operative Standortuebersicht mit Statusmarkern." },
    { id: "pipeline", title: "Offene Alarme", description: "Minimale Pipeline offener Alarmfaelle." },
    { id: "monitoring", title: "Technische Stoerungen", description: "Eigene Pipeline fuer offene technische Stoerungen." },
    { id: "master-data", title: "Stammdaten", description: "Customers, Standorte, Geraete und Plan-Grunddaten." }
  ]
};
