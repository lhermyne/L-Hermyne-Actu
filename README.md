# fetch-list-tweets

Accumule les tweets d'une liste X sur les dernières 24 h (fenêtre glissante) et produit
un fichier compact lisible par une IA pour en faire un résumé.

- **Prérequis** : Node.js ≥ 18, et rien d'autre (pas de `npm install`, de compte, de cookie, de clé d'API ni de navigateur).
- **Portable** : copiez le dossier (script + `lib/`) sur n'importe quel PC ou serveur.

## Utilisation

```bash
node fetch-list-tweets.mjs --list https://x.com/i/lists/1896274078501126399 --hours 24
```

| Option       | Défaut                   | Rôle                               |
|--------------|--------------------------|------------------------------------|
| `--list`     | `1896274078501126399`    | Identifiant ou URL de la liste     |
| `--hours`    | `24`                     | Fenêtre glissante conservée        |
| `--data-dir` | `data/` à côté du script | Dossier des fichiers produits      |

## Fichiers produits

| Fichier               | Contenu                                                                                     |
|-----------------------|---------------------------------------------------------------------------------------------|
| `tweets.json`         | Tous les tweets de la fenêtre, sans doublon, enrichi à chaque lancement                     |
| `tweets-compact.json` | Pour l'IA : `author_name`, `published_at` (heure de Paris), `text`, ordre chronologique     |
| `gaps.json`           | Bilan de chaque lancement, trous possibles, synthèse sur 24 h et conseil sur la fréquence   |

### Pourquoi lancer le script régulièrement

Sans connexion, X ne fournit que **les ~100 derniers tweets de la liste** (endpoint public
d'intégration `syndication.twitter.com`). Le script doit donc tourner toutes les 30 min à 1 h :
chaque lancement ajoute les nouveaux tweets à `tweets.json` et supprime ceux de plus de 24 h.

**Trou possible** : si tous les tweets récupérés sont plus récents que le dernier tweet déjà
connu, des tweets ont pu être publiés entre les deux sans être vus. Le trou est noté dans
`gaps.json` (durée, heures de début et de fin) et dans `tweets.json` (`possible_gaps`).
Si `gaps.json` signale des trous, rapprochez les lancements.

`coverage_complete: true` signifie que les 24 h sont entièrement couvertes, sans trou.

## Exemple de `tweets-compact.json`

```json
{
  "list_name": "Info Patrie France",
  "timezone": "Europe/Paris",
  "generated_at": "2026-11-03 03:51",
  "period": "du 2026-11-02 03:51 au 2026-11-03 03:51",
  "coverage_complete": true,
  "count": 94,
  "tweets": [
    {
      "author_name": "Le Parisien",
      "published_at": "2026-11-03 03:00",
      "text": "À Reims, l’installation du marché de Noël décalée… ➡️ https://l.leparisien.fr/wZk4"
    }
  ]
}
```

Les retweets commencent par `[Retweet de @auteur]` ; les citations ajoutent `[Cite @auteur] texte cité`
(tronqué par X à ~280 caractères).

## Lancement automatique avec GitHub Actions

Le workflow `.github/workflows/scrape.yml` lance le script toutes les 30 min et publie `data/`
dans le dépôt. Les fichiers sont alors lisibles à l'adresse :

```
https://raw.githubusercontent.com/<utilisateur>/<dépôt>/main/data/tweets-compact.json
```

## Limites

- L'endpoint n'est pas documenté : si X le modifie, le script s'arrête avec un message explicite.
- Le cron de GitHub Actions peut avoir quelques minutes de retard aux heures chargées.
