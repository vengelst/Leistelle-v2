# WireGuard Pilot-Setup

## Zielbild

Fuer den Pilotbetrieb wird ein einfaches Hub-and-Spoke-Modell erwartet:

- der Leitstellenserver ist der zentrale WireGuard-Hub
- jeder Standort-Router ist ein eigener Peer
- das Standort-LAN liegt hinter dem jeweiligen Router
- ein PC-Testclient kann optional als separater Peer aufgenommen werden

## Repo-seitige Annahmen

Das Repo selbst verwaltet keine Tunnel, Keys oder Firewall-Regeln. Dokumentiert werden nur die Netzannahmen, unter denen Standortgeraete und Leitstellenserver erreichbar sein sollen.

## Minimale Netzannahmen

- der Server hat eine feste WireGuard-Adresse im VPN
- jeder Standort nutzt ein eigenes, nicht ueberlappendes LAN-Subnetz
- die AllowedIPs des Standort-Peers enthalten das jeweilige Standort-LAN
- der Testclient bekommt nur die fuer Tests benoetigten Ziele

Beispielhaft:

- Leitstellenserver: `10.20.0.1/24`
- Standort A Router: `10.20.0.11/32`, LAN `192.168.10.0/24`
- Standort B Router: `10.20.0.12/32`, LAN `192.168.20.0/24`
- Testclient: `10.20.0.200/32`

## Operative Hinweise

- Standortkameras, NVRs und Router bleiben in ihren Standortnetzen
- das Backend braucht nur die fuer Monitoring, Alarmquelle und Medienpfad noetigen Routen
- keine Herstellerlogik in das VPN-Setup ziehen
- keine Secrets oder Private Keys im Repo ablegen

## Externe Restarbeiten

- Server-Haertung und Firewall
- Peer-Key-Erzeugung und sichere Verteilung
- NAT-/Routing-Konfiguration an den Standorten
- Erreichbarkeitstests fuer Standortgeraete
