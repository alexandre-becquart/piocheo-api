# Piochéo API

API Express et MongoDB dédiée à Piochéo. Le front se trouve dans le dépôt frère `piocheo-web`. Le pilote de démonstration se déroule à Tournai.

## Démarrer en local

Avec Node 22 et Docker Compose, exécuter depuis `piocheo-api` sur une installation neuve.

```sh
npm ci
docker compose up -d --wait
umask 077
sed '/^PIOCHEO_JWT_SECRET=$/d' .env.example > .env
printf 'PIOCHEO_JWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
npm run seed
npm start
```

Conserver le fichier `.env` entre les démarrages. En développement, l’API accepte le front ouvert via `localhost`, `127.0.0.1` ou une adresse du réseau local (test sur téléphone), quel que soit le port. En production, seules `https://piocheo.com` et `https://www.piocheo.com` sont acceptées, plus celles de `PIOCHEO_WEB_ORIGINS` si besoin. Pour contrôler la connexion à la base, interroger `/health` sur le port 3100. MongoDB écoute en local sur le port 27029. `docker compose stop` arrête la base en conservant le volume.

Le seed fournit douze jeux fictifs (deux pages de catalogue), deux avis, trois événements (soirée jeux, tournoi et rencontre), cinq tables dont une privée « Mon cercle », neuf résultats confirmés qui alimentent le classement de Tournai, un résultat en attente et deux notifications. Les comptes de démonstration sont `camille@example.test` (organisatrice), `sam@example.test`, `lea@example.test`, `thomas@example.test`, `nora@example.test` et `hugo@example.test`. Leur mot de passe de démonstration est `DemoPiocheo2026!`. On peut aussi se connecter avec le pseudo (`camille`, `sam`…). Sam est invité à la table privée de Camille et doit confirmer un score qu’elle a encodé. Le seed vérifie que la base est locale et refuse le mode production. Il actualise les dates des activités de démonstration et préserve les inscriptions déjà enregistrées.

## Vérifier

`npm test` utilise MongoDB en local et crée une base de test isolée, supprimée à la fin. Les tests Supertest couvrent la recherche, les avis, les autorisations, les réponses concurrentes pour la dernière place, l’historique, les décisions sur les résultats, les inscriptions aux événements et les notifications nominatives. Définir `PIOCHEO_TEST_MONGODB_URI` pour un autre port local.

## Règles de cette version

- L’organisateur occupe une place. Une demande ouverte passe par son acceptation. Une table privée requiert une invitation nominative. Le cercle facilite la sélection des invités. L’adresse détaillée est réservée aux personnes confirmées.
- Un résultat lié à une table reprend ses participants confirmés après le début du créneau. Pour une partie improvisée, l’auteur saisit les comptes ou les noms d’invités. Le premier participant identifié autre que l’auteur peut confirmer ou contester. Une partie dont seul l’auteur a un compte reste dans son historique privé.
- Le service `services/ranking.js` applique le barème provisoire `demo-v1`. Une partie ouverte confirmée attribue 3 points aux meilleurs scores ou places, ex æquo compris, et 1 point aux autres comptes. Les parties privées, contestées et coopératives restent dans l’historique. Le classement est calculé depuis les résultats confirmés, avec une transition atomique par résultat.
- Les notifications (`services/notifications.js`) sont nominatives et créées après chaque action réussie : demande de place, réponse de l’organisateur, invitation privée et sa réponse, score à confirmer, confirmation ou contestation. Seules les personnes déjà autorisées à voir la table ou le résultat les reçoivent. `GET /notifications` renvoie les vingt dernières et le nombre de non lues, `POST /notifications/read` les marque comme lues.
- Sans jeu précisé, `GET /rankings?city=` ouvre le classement du jeu qui compte le plus de parties classées dans la zone, ou renvoie un classement vide.
- La création d’événements nécessite le rôle organisateur. L’inscription à un événement et la réservation d’une table sont deux actions indépendantes.
- L’interface utilise l’heure de Bruxelles. Pour les clients externes, les dates envoyées à l’API doivent inclure un décalage ou le suffixe UTC `Z`.
- À décider pour le produit. Le barème définitif, le processus après une contestation, l’éligibilité des parties privées et coopératives, et l’attribution du rôle organisateur au-delà de la démo.

## Structure

`server.js` démarre le serveur et `app.js` configure Express. Le point d’entrée `routes/index.js` monte les routes de `routes/collections/`. Les contrôleurs gèrent les requêtes, les modèles Mongoose vivent dans `models/` et le barème dans `services/`. Les middlewares d’authentification et d’erreur sont dans `_middleware/`. Le seed se trouve dans `scripts/`.

## Réemploi Wayd

Référence `wayd-api` au commit `4b3277f`, consultée en lecture seule.

Le verrou Piochéo intègre les correctifs signalés par l’audit des dépendances d’exécution après la reprise de Wayd.

| Source | Adaptation Piocheo |
| --- | --- |
| `package.json`, `package-lock.json`, `Dockerfile`, `.github/workflows/tests.yml` | Sous-ensemble verrouillé des dépendances Express, Mongoose et Supertest, image Node et contrôle CI. Les tests utilisent le runner Node avec un MongoDB de test. |
| `app.js`, `_helpers/corsOrigins.js`, `_middleware/error-handler.js` | Protections Helmet et Mongo, origines exactes dans `app.js` et traitement centralisé dans `_middleware/error-handler.js`. |
| `routes/collections/auth.js`, `controllers/authController.js` (wayd-api, mêmes fichiers) | Mêmes routes et limites que Wayd : `check-username`, `register` (prénom, nom, pseudo facultatif), `login` par e-mail ou pseudo, `forgot-password` et `reset-password` (jeton haché, valable 1 h, e-mail Resend), `google` et `google/callback` (redirection serveur, state anti-CSRF et PKCE, liaison d'un compte existant seulement si Google a vérifié l'e-mail). Piochéo garde son cookie de session HttpOnly de 7 jours au lieu du couple jeton d'accès + refresh de Wayd ; `sessionVersion` coupe toutes les sessions après une réinitialisation ou une liaison Google, comme `revokeUserSessions`. |
| Notifications Wayd (reprise du principe, non du code : le dépôt n’était pas accessible depuis cette session) | Modèle `Notification` et service `notify` découplé des contrôleurs, sans temps réel. |
| `controllers/disponibiliteController.js`, `_helpers/demandeJeu.js`, `controllers/resultatController.js` | Parcours demande, acceptation et décision repris comme conventions. Les modèles Piochéo couvrent plusieurs participants, les ex æquo, les résultats coopératifs et la capacité atomique. |

## Déploiement séparé

Le guide `docs/DEPLOIEMENT.md` décrit la mise en ligne sur le VPS OVH avec Coolify, comme Wayd : `https://piocheo.com` pour le front et `https://api.piocheo.com` pour l'API.


Le Dockerfile lance l’API sur le port 3100. Il fixe `NODE_ENV=production` ; les adresses de production sont dans le code, comme sur Wayd. Fournir un `PIOCHEO_MONGODB_URI` dédié, un `PIOCHEO_JWT_SECRET` indépendant, et pour la connexion `RESEND_API_KEY` et `PIOCHEO_GOOGLE_CLIENT_ID`/`PIOCHEO_GOOGLE_CLIENT_SECRET` (voir `docs/DEPLOIEMENT.md`). Les données de démonstration sont destinées au développement.
