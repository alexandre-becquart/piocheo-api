# Déployer Piochéo comme Wayd

Wayd tourne sur le VPS OVH géré avec Coolify : l'application et MongoDB y sont des conteneurs Docker, et les journaux et sauvegardes passent par Coolify (voir `wayd-api/docs/CONTEXT_APP.md` et `docs/rgpd/registre-des-traitements.md` dans Wayd). Piochéo suit le même modèle, avec des ressources, une base et des secrets séparés de Wayd.

## Ressources Coolify

Créer un projet Coolify « Piochéo » avec trois ressources sur le même VPS.

| Ressource | Type | Source | Réseau |
| --- | --- | --- | --- |
| `piocheo-db` | Base MongoDB 7 ou 8 | Image officielle | Interne uniquement, aucun port publié |
| `piocheo-api` | Application Dockerfile | `alexandre-becquart/piocheo-api`, branche `main`, port 3100 | `https://api.piocheo.com` |
| `piocheo-web` | Application Dockerfile | `alexandre-becquart/piocheo-web`, branche `main`, port 80 | `https://piocheo.com` |

Comme Wayd (`getwayd.com` et `api.getwayd.com`), le front et l'API ont chacun leur domaine. Les deux sont sur le même site `piocheo.com` : le cookie de session `SameSite=Lax` est envoyé aux appels du front vers l'API, et l'API n'accepte que `https://piocheo.com` et `https://www.piocheo.com`.

## Variables d'environnement

Comme pour Wayd, les adresses de production sont écrites dans le code : l'API accepte `https://piocheo.com` et `https://www.piocheo.com`, renvoie vers `https://piocheo.com` après Google et dans les e-mails, et Google revient sur `https://api.piocheo.com/auth/google/callback`. Le front appelle `https://api.piocheo.com` (fichier `.env.production` du dépôt web). Coolify ne fournit que les secrets.

`piocheo-api` :

```
PIOCHEO_MONGODB_URI=<URL interne de piocheo-db, base piocheo>
PIOCHEO_JWT_SECRET=<openssl rand -hex 32, propre à Piochéo>
RESEND_API_KEY=<clé Resend, domaine piocheo.com vérifié>
PIOCHEO_GOOGLE_CLIENT_ID=<identifiant client OAuth Google>
PIOCHEO_GOOGLE_CLIENT_SECRET=<secret client OAuth Google>
```

`NODE_ENV=production`, `HOST=0.0.0.0` et `PORT=3100` sont fixés par le Dockerfile. Réglages facultatifs, à n'utiliser que pour sortir du cas normal :

| Variable | Effet |
| --- | --- |
| `PIOCHEO_WEB_ORIGINS` (ou `ALLOWED_ORIGINS`) | Origines supplémentaires, séparées par des virgules (ex. une préversion). Les origines de production restent acceptées. |
| `PIOCHEO_WEB_URL` | Adresse du site si elle n'est plus `https://piocheo.com`. |
| `PIOCHEO_GOOGLE_CALLBACK_URL` | Adresse de retour Google si l'API change de domaine. Une valeur `localhost` est ignorée en production. |
| `PIOCHEO_TRUST_PROXY` | Nombre de proxys devant l'API. `1` par défaut en production (Traefik), `2` si l'on passe par le relais `/api` du front. |
| `EMAIL_FROM` | Expéditeur, `Piochéo <noreply@piocheo.com>` par défaut. |

Les anciennes variables `PIOCHEO_WEB_ORIGINS=https://piocheo.com`, `PIOCHEO_TRUST_PROXY=1` ou `NODE_ENV=production` peuvent rester dans Coolify : elles ne changent rien.

### Connexion (comme Wayd)

- **Mot de passe oublié** : l'e-mail part par Resend, comme pour Wayd. Ajouter le domaine `piocheo.com` dans Resend (enregistrements DNS SPF/DKIM chez le registraire), puis créer une clé d'API propre à Piochéo. Sans `RESEND_API_KEY`, la demande répond normalement mais aucun e-mail ne part (le journal l'indique).
- **Continuer avec Google** : dans Google Cloud Console, créer un identifiant OAuth « Application Web » pour Piochéo. Origine JavaScript autorisée : `https://piocheo.com`. URI de redirection autorisée : `https://api.piocheo.com/auth/google/callback`. Écran de consentement : nom Piochéo, champs d'application `openid`, `email`, `profile`. Tant que l'identifiant et le secret ne sont pas remplis, le bouton renvoie vers la connexion avec un message.

`piocheo-web` : aucune variable. L'adresse de l'API est dans `.env.production` et dans la CSP de Nginx, comme sur Wayd. Option de build : `VUE_APP_PILOT_CITY=Tournai`.

## Mise en ligne

1. Chez le registraire de `piocheo.com`, faire pointer `piocheo.com` et `api.piocheo.com` (enregistrements A) vers l'IP du VPS OVH.
2. Créer `piocheo-db`, puis noter son URL interne.
3. Créer `piocheo-api` avec les variables ci-dessus et le domaine `https://api.piocheo.com`, puis vérifier `https://api.piocheo.com/health`. Au premier démarrage, l’API ajoute les 100 jeux du catalogue de lancement (le journal Coolify affiche « Catalogue : 100 jeux ajoutés sur 100. »). Les démarrages suivants n’ajoutent que les jeux manquants et ne modifient jamais une fiche existante.
4. Créer `piocheo-web` avec le domaine `https://piocheo.com`. Coolify génère les certificats HTTPS.
5. Créer le premier compte organisateur, puis lui donner le rôle `organizer` en base. Le seed de démonstration refuse la production et ne doit pas y être lancé.
6. Activer les sauvegardes planifiées Coolify sur `piocheo-db`, comme pour `Wayd-DB`.

## Données personnelles

Comme Wayd, les données restent sur le VPS OVH (Canada, décision d'adéquation UE-Canada). Avant une ouverture publique, il faut ajouter Piochéo au registre des traitements et publier une politique de confidentialité propre à Piochéo.
