# Tests du mode hors ligne

Sans dépendance à installer (Node 20 ou plus) :

```bash
npm run test:offline
```

- `unit.test.mjs` : classification des erreurs, cache de lecture, file d'attente, superposition des modifications.
- `flow.test.mjs` : parcours complet — créer un pin, le modifier et y joindre une photo hors ligne, puis retour du réseau ; téléchargement des tuiles ; vidage des données.

Ces tests remplacent le système de fichiers, React Native et Supabase par des doublures (`mocks/`). Ils vérifient la logique, pas le comportement sur un appareil.
