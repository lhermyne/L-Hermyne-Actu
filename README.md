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
| `tweets-compact.json` | Pour l'IA : blocs `new` et `context`, avec `author_name`, `published_at` (Paris), `text`    |
| `gaps.json`           | Bilan de chaque lancement, trous possibles, synthèse sur 24 h et conseil sur la fréquence   |

### Pourquoi lancer le script régulièrement

Sans connexion, X ne fournit que **les ~100 derniers tweets de la liste** (endpoint public
d'intégration `syndication.twitter.com`), soit 25 à 50 min d'activité en journée. Le script doit
donc tourner régulièrement, **toutes les 30 min** par défaut : chaque lancement ajoute les nouveaux
tweets à `tweets.json` et supprime ceux de plus de 24 h.

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
  "generated_at": "2026-11-05 23:39",
  "period": "du 2026-11-04 23:39 au 2026-11-05 23:39",
  "new_period": "du 2026-11-05 20:00 au 2026-11-05 23:39",
  "context_period": "du 2026-11-04 23:39 au 2026-11-05 20:00",
  "coverage_complete": false,
  "new_count": 94,
  "context_count": 223,
  "duplicates_merged": 4,
  "empty_removed": 0,
  "new": [
    {
      "author_name": "Le Parisien | politique",
      "published_at": "2026-11-05 21:40",
      "text": "Budget de l’État 2027 : … ➡️ https://l.leparisien.fr/xxxx",
      "also_by": ["Le Parisien"]
    }
  ],
  "context": []
}
```

- **`new`** : tweets à résumer, depuis le dernier horaire de résumé (8 h ou 20 h, heure de Paris).
  Pendant les 2 h qui suivent un horaire, `new` couvre encore la période qui vient de se finir :
  un résumé lancé à 20 h 05 voit donc bien 8 h → 20 h 05.
- **`context`** : le reste des 24 h, déjà couvert par le résumé précédent, pour signaler les suites.
- **Doublons** : dans chaque bloc, les tweets au contenu identique (liens exclus) sont fusionnés
  sur le plus ancien ; `also_by` liste les autres comptes. Les textes de moins de 30 caractères
  ne sont pas fusionnés.
- **Tweets vides** (ni texte ni citation) : retirés.

Les retweets commencent par `[Retweet de @auteur]` ; les citations ajoutent `[Cite @auteur] texte cité`
(tronqué par X à ~280 caractères).

## Lancement automatique

Les fichiers publiés sont lisibles à l'adresse :

```
https://raw.githubusercontent.com/lhermyne/L-Hermyne-Actu/main/data/tweets-compact.json
```

### Lanceur local (principal)

`watch-and-push.mjs` lance un cycle toutes les 30 min tant que le terminal reste ouvert :

```bash
node watch-and-push.mjs
```

| Option        | Défaut                         | Rôle                             |
|---------------|--------------------------------|----------------------------------|
| `--interval`  | `30`                           | Minutes entre deux cycles        |
| `--once`      | désactivé                      | Un seul cycle, puis arrêt        |
| `--remote`    | `L-Hermyne-Actu` sur GitHub    | Dépôt à alimenter                |
| `--clone-dir` | `~/.l-hermyne-actu`            | Clone réservé au lanceur         |

Chaque cycle aligne le clone sur la version en ligne, fusionne les tweets sans doublon, puis fait
`commit` et `push`. Si le push est refusé, il recommence depuis la version en ligne (3 essais).
Le clone est réinitialisé à chaque cycle : n'y modifiez rien à la main.

Le push utilise les identifiants Git de la machine : ils doivent être ceux du compte `lhermyne`.

### GitHub Actions (secours)

Le workflow `.github/workflows/scrape.yml` prend le relais quand le PC est éteint. Son cron demande
un lancement toutes les 30 min, mais GitHub ne l'a exécuté que toutes les 6 à 8 h (mesuré en
novembre 2026) : seul, il laisse de grands trous.

## Limites

- L'endpoint n'est pas documenté : si X le modifie, le script s'arrête avec un message explicite.
