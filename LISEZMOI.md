# Les ajouts AMP de TeamKit

Des personnalisations non officielles pour [AMP de CubeCoders](https://cubecoders.com/AMP), faites et utilisées
tous les jours sur les serveurs de [TeamKit](https://www.teamkit.fr). *English version: [README.md](README.md).*

| Ajout | Ce qu'il fait | Comment il s'installe |
|---|---|---|
| **Thème TeamKit** | thème sombre bleu nuit, accents cyan et violet doux, pensé pour les longues sessions | un thème CSS, la voie officielle |
| **Thème TeamKit-HUD** | le même, avec une page État façon écran de jeu : trois grands cadrans lumineux et de gros boutons ronds | un thème CSS, la voie officielle |
| **Barre de stats** | des tuiles au-dessus de la liste des instances (machine, serveurs en marche, joueurs, RAM, CPU, disque et sa limite), une pastille `💾 X Go` sur chaque carte et une quatrième jauge **Disque** sur la page État de chaque serveur | un fichier JavaScript + une ligne dans `AMP.html` |
| **Limites disque et gardien** | une limite par jeu ou par serveur dans un fichier de config : jauges et pastilles en `occupé / limite`, et (si on veut) le jeu coupé quand le disque est plein, gestionnaire de fichiers et SFTP restant ouverts | `disk-guard.py`, toutes les 5 minutes (facultatif) |

## Captures

La barre de stats marche dans **les quatre vues** de la page Instances (les quatre boutons en haut à droite : cartes ou liste, par groupe ou par machine). Chaque instance a aussi sa pastille `💾`.

| Cartes, par groupe | Liste, par groupe |
|---|---|
| ![Cartes par groupe, avec la barre de stats](screenshots/instances-with-stats.png) | ![Liste par groupe, avec la barre de stats](screenshots/instances-list-groups.png) |
| **Cartes, par machine** | **Liste, par machine** |
| ![Cartes par machine, avec la barre de stats](screenshots/instances-cards-machine.png) | ![Liste par machine, avec la barre de stats](screenshots/instances-list-machine.png) |

**La même page sans l'ajout** (thème seul) :

![Page Instances, thème seul](screenshots/instances-without-stats.png)

**TeamKit-HUD : la page État d'un serveur**, grands cadrans et boutons ronds. Le quatrième cadran, **Disque** (disque du serveur / limite du stockage), est ajouté par le script de stats :

![Page État avec le thème TeamKit-HUD](screenshots/status-hud.png)

*Captures prises sur le panel TeamKit ; les adresses des serveurs sont masquées.*

## 1. Les thèmes (officiel, sans risque)

AMP charge tout fichier CSS posé dans `ADS01/WebRoot/Themes/`.

1. Copier `TeamKit.css` (ou `TeamKit-HUD.css`) dans `/home/amp/.ampdata/instances/ADS01/WebRoot/Themes/`.
2. Dans ADS → **Configuration**, choisir le thème et enregistrer. Le thème d'ADS s'applique aussi aux pages des instances ouvertes depuis ADS.
3. Pour le voir sans le choisir : `https://<ton-amp>/ThemePreview.html?theme=TeamKit`.

## 2. La barre de stats (non officielle, en lecture seule)

Un thème ne peut pas ajouter de chiffres, d'où ce petit script. Il **lit** seulement ce qu'ADS envoie déjà à la page :
`API.ADSModule.GetInstancesAsync()` pour la machine et chaque instance, et `API.ADSModule.GetDatastoresAsync()` pour le disque
(`CurrentUsageMB`, `SoftLimitMB`). Il ne modifie rien, se rafraîchit toutes les 15 s et se tait en cas d'erreur.

- **La barre** : visible pour qui a le droit `Core.UserManagement.ViewActiveSessions` (les admins).
- **Les pastilles disque** : visibles pour tout le monde, chacun pour ses propres instances.
- **La jauge Disque** de la page État : visible par toute personne qui peut ouvrir ce serveur. Son rond = disque du serveur
  divisé par la limite du stockage (la seule limite qu'ADS connaisse) ; sans accès aux stockages, le rond reste vide.
- Les textes suivent la langue du navigateur : français ou anglais.

### Il faut

- AMP avec un contrôleur ADS sous Linux. Testé sur **AMP 2.8.0.8** (Proteus), instances en conteneurs Docker.
- Un navigateur récent (la grille à 4 jauges utilise `:has()` en CSS). Testé avec Chrome.
- Un accès root (ou l'utilisateur `amp`) sur la machine, pour copier un fichier et modifier `AMP.html`.

### Installer (Linux)

```sh
sudo sh install-stats.sh            # ADS01 et ./TeamKitStats.js par défaut
sudo sh install-stats.sh MonADS /chemin/TeamKitStats.js
```

Le script copie `TeamKitStats.js` dans `WebRoot/Scripts/`, ajoute une seule ligne `<script>` avant `</body>` de
`WebRoot/AMP.html` et garde une sauvegarde (`AMP.html.before-stats-<date>`). Recharger la page Instances avec Ctrl+F5.

On peut le relancer autant qu'on veut : si tout est déjà en place, il ne touche à rien et affiche `Already installed.`
Le numéro `?v=` (cache du navigateur) ne change que si le script lui-même a changé.

### Tous les serveurs, y compris ceux créés plus tard

Rien à installer serveur par serveur. Quand on ouvre un serveur depuis ADS, sa page est chargée dans un cadre de la page
d'ADS (même adresse, `/instance/<InstanceID>`). Le script d'ADS trouve ce cadre, lit l'occupation disque du serveur dans
`GetInstancesAsync()` (`DiskUsageMB`) et pose la jauge **Disque** à côté de CPU, Mémoire et Joueurs, en copiant la jauge
CPU d'AMP : elle suit donc le thème. Un serveur créé demain, à la main ou par une automatisation, l'a tout de suite.

Seule exception : quelqu'un qui se connecte **directement** sur le port web propre d'une instance (sans passer par ADS)
ne charge pas la page d'ADS, donc pas de jauge.

### Le garder après les mises à jour d'AMP (cron, facultatif)

Une mise à jour d'AMP réécrit `AMP.html` et retire la ligne `<script>`. Comme l'installeur n'écrit que s'il manque
quelque chose, une tâche cron peut la remettre toute seule :

```sh
# /etc/cron.d/teamkit-stats : toutes les 30 minutes, muet quand il n'y a rien à faire
*/30 * * * * root sh /opt/amp-addons-teamkit/install-stats.sh ADS01 /opt/amp-addons-teamkit/TeamKitStats.js >/dev/null
```

Chemins absolus obligatoires (cron ne démarre pas dans le dossier du dépôt). Une mise à jour peut aussi effacer les thèmes
de `WebRoot/Themes/` : en garder une copie et les remettre si le thème repasse à celui par défaut.

### À savoir

- **Une mise à jour d'AMP réécrit `AMP.html`** : la barre disparaît, rien ne casse. Relancer `install-stats.sh`, ou la ligne cron ci-dessus.
- La RAM et le CPU sont la **somme des instances**, pas la mesure de la machine entière.
- ADS ne donne pas l'espace libre du disque, seulement l'occupation du stockage et sa limite.
- Les chiffres de disque viennent d'ADS (`DiskUsageMB`), qui les mesure de temps en temps : quelques minutes de retard sont normales.
- Avant de contacter le support de CubeCoders pour un souci d'interface, désinstaller la barre ou la signaler.

### Masquer dans un seul navigateur

Dans la console : `localStorage.tkStatsOff = '1'` (et `localStorage.removeItem('tkStatsOff')` pour la remettre).

### Dépannage

| Ce qu'on voit | Ce qu'on vérifie |
|---|---|
| Rien n'a changé | Recharger avec **Ctrl+F5**. Dans la console du navigateur, `document.querySelector('script[src*=TeamKitStats]')` ne doit pas valoir `null` ; sinon `AMP.html` a été réécrit : relancer l'installeur. |
| Pastilles et jauge, mais pas de barre | La barre est réservée aux admins (`Core.UserManagement.ViewActiveSessions`). |
| Pas de barre pour un admin | `typeof API` doit valoir `"object"` dans la console ; `localStorage.tkStatsOff` ne doit pas valoir `"1"`. |
| Pas de jauge Disque sur une page État | Ouvrir le serveur depuis ADS, pas depuis son propre port. Attendre 15 s (un rafraîchissement). |
| Le thème est revenu à celui par défaut | Une mise à jour d'AMP a effacé `WebRoot/Themes/TeamKit*.css` : les recopier. |

### Personnaliser

- Qui voit la barre : changer le droit dans `estAdmin()`.
- Fréquence : `15000` (ms) dans `rafraichir()`.
- Couleur de la jauge Disque : `#f0b35a` dans `styleCadre()` ; elle se place après la jauge Joueurs (`ActiveUsers`).
- Les couleurs viennent des variables du thème (`--tk-carte`, `--tk-bord`, `--tk-texte`…), avec des valeurs sombres de secours.

### Désinstaller

Remettre la sauvegarde `AMP.html.before-stats-*` la plus récente (ou supprimer la ligne `TeamKitStats.js`), puis supprimer `WebRoot/Scripts/TeamKitStats.js`
et la ligne cron si elle a été ajoutée.

## 3. Limites disque et gardien (facultatif)

AMP ne limite pas le disque d'une instance. `disk-guard.py` l'ajoute, avec un seul fichier de config :

- **Affichage** : la jauge Disque et les pastilles `💾` montrent `occupé / limite` et passent en **orange** au seuil
  d'alerte, en **rouge** à 100 %. La barre des admins compte les serveurs au-delà de leur limite.
- **Gardien** (coupé par défaut) : au-delà du seuil de coupure, il arrête le **jeu** de l'instance (`Core/Stop`).
  L'instance AMP reste allumée, donc son **gestionnaire de fichiers et le SFTP restent ouverts** pour faire le ménage.
  Un jeu relancé alors que le disque est toujours plein est recoupé au passage suivant. Webhook Discord facultatif
  (alerte une fois par jour, coupure une fois par heure).

Python 3.7+, bibliothèque standard seulement, lancé toutes les 5 minutes par cron ou une minuterie systemd.

### Le fichier de config

Copier `disk-limits.example.json` en `/etc/amp-addons-teamkit/disk-limits.json` (`chmod 600` : il peut contenir un webhook).

| Clé | Rôle |
|---|---|
| `display` | ce que compare la jauge : `instance-limit` (ce serveur / sa limite, repli sur le stockage s'il n'en a pas), `instance-datastore` (ce serveur / limite du stockage), `all-datastore` (tous les serveurs / limite du stockage) |
| `default_limit_gb` | limite de tout serveur sans limite plus précise (`0` = aucune) |
| `templates` | limite par jeu, en Go, d'après le nom affiché par AMP (`ModuleDisplayName`, ex. `"Empyrion Galactic Survival"`, ou `Module`, ex. `"Minecraft"`) |
| `instances` | limite par serveur, en Go, par `InstanceName`, `FriendlyName` ou `InstanceID` — prime sur `templates` |
| `warn_pct`, `stop_pct` | seuils d'alerte et de coupure, en % de la limite (90 et 100 par défaut) |
| `enforce` | `false` = affichage seul (défaut). `true` = coupe le jeu au-delà de `stop_pct` |
| `webhook` | adresse d'un webhook Discord pour les alertes et les coupures (facultatif) |
| `amp` | `url`, `user`, `password_file` : un compte AMP qui voit et peut arrêter les instances. Obligatoire pour `enforce`, et pour publier les serveurs par identifiant plutôt que par nom |
| `ads_instance`, `ampdata` | où se trouve ADS (`ADS01`, `/home/amp/.ampdata/instances`) |
| `import` | facultatif : `url` d'un JSON `{"instances_mb": {"<InstanceID>": Mo}, "warn_pct": n, "stop_pct": n}` (avec `header` et `secret_file` s'il faut une clé), pour prendre les limites dans ton propre panel ou ta base |

Ordre de priorité pour un serveur : `instances` > `import` > `templates` > `default_limit_gb`.

### Installer

```sh
sudo install -d -m 755 /opt/amp-addons-teamkit && sudo install -d -m 700 /etc/amp-addons-teamkit
sudo install -m 755 disk-guard.py /opt/amp-addons-teamkit/
sudo install -m 600 disk-limits.example.json /etc/amp-addons-teamkit/disk-limits.json   # puis le remplir
sudo python3 /opt/amp-addons-teamkit/disk-guard.py --dry-run --verbose                  # montre ce qu'il ferait
```

Puis toutes les 5 minutes, par exemple dans `/etc/cron.d/amp-disk-guard` :

```sh
*/5 * * * * root /usr/bin/python3 /opt/amp-addons-teamkit/disk-guard.py >> /var/log/amp-disk-guard.log 2>&1
```

Il écrit `WebRoot/Scripts/TeamKitDisk.json` dans l'instance ADS (seulement si quelque chose a changé) : mode
d'affichage, seuils et limites par identifiant de serveur ou nom de jeu. **Ce fichier se lit sans être connecté** :
il ne contient jamais le compte, le mot de passe ni le webhook. Renseigner `amp` pour que les noms de serveurs soient
publiés sous forme d'identifiants.

Pour le compte AMP, créer dans ADS un utilisateur dédié qui a accès aux instances (et seulement ça), et mettre son
mot de passe seul dans le `password_file` (`chmod 600`).

### À savoir

- Les chiffres de disque viennent d'ADS (`DiskUsageMB`), mesurés de temps en temps : après un ménage, la jauge peut
  mettre quelques minutes à suivre, et un jeu relancé trop tôt peut être recoupé une fois.
- Couper le jeu n'est pas un vrai quota : ce qu'on dépose pendant que le jeu est arrêté (envoi en SFTP) n'est pas bloqué.
- Tester d'abord avec `"enforce": false` et `--dry-run`.

## Licence

Libre d'utilisation, de copie et d'adaptation. Une mention de TeamKit fait plaisir, sans obligation. Sans lien avec CubeCoders.
