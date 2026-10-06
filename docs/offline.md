# Mode hors ligne

L'application reste utilisable sans réseau pour le travail de chantier :
ouvrir un plan, voir les pins, créer et modifier des pins, prendre des photos.
Tout ce qui est fait hors ligne est envoyé automatiquement au retour du réseau.

Restent en ligne uniquement : discussions, documents, rapports, import /
renommage / suppression de plans, commentaires, tags, création de projet.

## Ce qui est disponible hors ligne

| Donnée | Quand est-elle enregistrée sur l'appareil ? |
| --- | --- |
| Profil, organisation, rôle | à chaque ouverture en ligne |
| Projets, plans, statuts, catégories, membres | à chaque affichage en ligne |
| Pins d'un projet / d'un plan, détail d'un pin | à chaque affichage en ligne |
| Image des plans (tuiles) | bouton nuage sur la carte du plan, ou « Rendre tous les plans disponibles hors ligne » |

Un plan non téléchargé reste visible hors ligne pour les zones déjà consultées
(cache d'images du système), sans garantie.

## Organisation du code (`lib/offline/`)

| Fichier | Rôle |
| --- | --- |
| `errors.js` | distingue coupure réseau (on réessaiera) et refus du serveur |
| `cache.js` | `cachedSelect(clé, requête)` : lecture avec repli sur la copie locale |
| `outbox.js` | file d'attente persistante, envoyée dans l'ordre |
| `pending.js` | superpose aux listes les modifications faites sur l'appareil |
| `storage.js` | fichiers JSON dans `documentDirectory/offline/data` |
| `tiles.js` | téléchargement et recherche des tuiles locales |
| `index.js` | branchement Supabase : `runOrQueue`, `queue`, `syncNow`, `startSync` |

Les quatre premiers n'importent rien de React Native : ils se testent dans Node.

### Lire

```js
const { data, error, cachedAt } = await cachedSelect(`pins-tasks-${projectId}`, () =>
  supabase.from('pdf_pins').select('…').eq('project_id', projectId));
setPins(withPendingPins(data ?? [], { projectId }, cachedAt));
```

- En ligne : la réponse est enregistrée puis renvoyée.
- Hors ligne : la dernière copie est renvoyée ; sans copie, `error.offline` vaut `true`.
- La clé doit distinguer tout ce qui change le résultat (projet, plan, invité).

### Écrire

```js
await runOrQueue('pin.update', { id, patch }, async () => {
  const { error } = await supabase.from('pdf_pins').update(patch).eq('id', id);
  if (error) throw error;
});
```

- Réseau disponible : la requête part tout de suite.
- Coupure : l'opération rejoint la file et part plus tard.
- Refus du serveur : l'erreur remonte à l'écran, rien n'est mis en file.

Types d'opération : `pin.insert`, `pin.update` (y compris la suppression, par
`deleted_at`), `photo.upload`.

## Règles

- **Identifiants générés sur l'appareil** (pins, photos) : renvoyer une
  opération ne crée jamais de doublon.
- **Ordre conservé** : la création d'un pin part avant ses photos.
- **Conflits** : seuls les champs modifiés sont envoyés ; le dernier envoi
  l'emporte, champ par champ. Il n'y a pas de fusion ni d'alerte de conflit.
- **Refus du serveur** : l'opération est mise de côté et signalée par la
  pastille rouge ; l'utilisateur peut réessayer ou l'abandonner.
- **Déconnexion** : impossible hors ligne ; en ligne, elle efface toutes les
  données locales (avec avertissement s'il reste des envois en attente).
- **Changement de compte** sur le même appareil : les données locales du
  compte précédent sont effacées, y compris ses envois en attente.

## Session

Sans réseau, Supabase ne peut pas renouveler un jeton expiré et rend une
session vide. `components/AuthGate.js` ouvre alors l'application avec le
profil enregistré sur l'appareil, et reprend la vraie session dès qu'elle
redevient disponible.
