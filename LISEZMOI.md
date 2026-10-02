# Les ajouts AMP de TeamKit

Des personnalisations non officielles pour [AMP de CubeCoders](https://cubecoders.com/AMP), faites et utilisées
tous les jours sur les serveurs de [TeamKit](https://www.teamkit.fr). *English version: [README.md](README.md).*

| Ajout | Ce qu'il fait | Comment il s'installe |
|---|---|---|
| **Thème TeamKit** | thème sombre bleu nuit, accents cyan et violet doux, pensé pour les longues sessions | un thème CSS, la voie officielle |
| **Thème TeamKit-HUD** | le même, avec une page État façon écran de jeu : trois grands cadrans lumineux et de gros boutons ronds | un thème CSS, la voie officielle |
| **Barre de stats** | des tuiles au-dessus de la liste des instances (machine, serveurs en marche, joueurs, RAM, CPU, disque et sa limite) et une pastille `💾 X Go` sur chaque carte | un fichier JavaScript + une ligne dans `AMP.html` |

## Captures

**Page Instances avec la barre de stats** et les pastilles `💾` :

![Page Instances avec la barre de stats TeamKit](screenshots/instances-with-stats.png)

**La même page sans l'ajout** (thème seul) :

![Page Instances, thème seul](screenshots/instances-without-stats.png)

**TeamKit-HUD : la page État d'un serveur**, trois grands cadrans et boutons ronds :

![Page État avec le thème TeamKit-HUD](screenshots/status-hud.png)

*Captures prises sur le panel TeamKit ; l'adresse IP est un exemple (203.0.113.x) ou floutée.*

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
- Les textes suivent la langue du navigateur : français ou anglais.

### Installer (Linux)

```sh
sudo sh install-stats.sh            # ADS01 et ./TeamKitStats.js par défaut
```

Le script copie `TeamKitStats.js` dans `WebRoot/Scripts/`, ajoute une seule ligne `<script>` avant `</body>` de
`WebRoot/AMP.html` et garde une sauvegarde (`AMP.html.before-stats-<date>`). Recharger la page Instances avec Ctrl+F5.

### À savoir

- **Une mise à jour d'AMP réécrit `AMP.html`** : la barre disparaît, rien ne casse. Relancer `install-stats.sh`.
- La RAM et le CPU sont la **somme des instances**, pas la mesure de la machine entière.
- ADS ne donne pas l'espace libre du disque, seulement l'occupation du stockage et sa limite.
- La page État d'une instance est servie par la copie d'`AMP.html` de l'instance : le script n'y tourne pas.
- Avant de contacter le support de CubeCoders pour un souci d'interface, désinstaller la barre ou la signaler.

### Masquer dans un seul navigateur

Dans la console : `localStorage.tkStatsOff = '1'` (et `localStorage.removeItem('tkStatsOff')` pour la remettre).

### Désinstaller

Remettre la sauvegarde `AMP.html.before-stats-*` la plus récente (ou supprimer la ligne `TeamKitStats.js`), puis supprimer `WebRoot/Scripts/TeamKitStats.js`.

## Licence

Libre d'utilisation, de copie et d'adaptation. Une mention de TeamKit fait plaisir, sans obligation. Sans lien avec CubeCoders.
