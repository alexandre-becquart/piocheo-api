# Déployer Piochéo comme Wayd

Wayd tourne sur le VPS OVH géré avec Coolify : l'application et MongoDB y sont des conteneurs Docker, et les journaux et sauvegardes passent par Coolify (voir `wayd-api/docs/CONTEXT_APP.md` et `docs/rgpd/registre-des-traitements.md` dans Wayd). Piochéo suit le même modèle, avec des ressources, une base et des secrets séparés de Wayd.

## Ressources Coolify

Créer un projet Coolify « Piochéo » avec trois ressources sur le même VPS.

| Ressource | Type | Source | Réseau |
| --- | --- | --- | --- |
| `piocheo-db` | Base MongoDB 7 ou 8 | Image officielle | Interne uniquement, aucun port publié |
| `piocheo-api` | Application Dockerfile | `alexandre-becquart/piocheo-api`, branche `main`, port 3100 | `https://api.piocheo.com` |
| `piocheo-web` | Application Dockerfile | `alexandre-becquart/piocheo-web`, branche `main`, port 80 | `https://piocheo.com` |

Comme Wayd (`getwayd.com` et `api.getwayd.com`), le front et l'API ont chacun leur domaine. Les deux sont sur le même site `piocheo.com` : le cookie de session `SameSite=Lax` est envoyé aux appels du front vers l'API, et l'API n'accepte que l'origine `https://piocheo.com`.

## Variables d'environnement

`piocheo-api` :

```
NODE_ENV=production
PORT=3100
HOST=0.0.0.0
PIOCHEO_MONGODB_URI=<URL interne de piocheo-db, base piocheo>
PIOCHEO_JWT_SECRET=<openssl rand -hex 32, propre à Piochéo>
PIOCHEO_WEB_ORIGINS=https://piocheo.com
PIOCHEO_TRUST_PROXY=1
RESEND_API_KEY=<clé Resend, domaine piocheo.com vérifié>
EMAIL_FROM=Piochéo <noreply@piocheo.com>
PIOCHEO_GOOGLE_CLIENT_ID=<identifiant client OAuth Google>
PIOCHEO_GOOGLE_CLIENT_SECRET=<secret client OAuth Google>
PIOCHEO_GOOGLE_CALLBACK_URL=https://api.piocheo.com/auth/google/callback
```

### Connexion (comme Wayd)

- **Mot de passe oublié** : l'e-mail part par Resend, comme pour Wayd. Ajouter le domaine `piocheo.com` dans Resend (enregistrements DNS SPF/DKIM chez le registraire), puis créer une clé d'API propre à Piochéo. Sans `RESEND_API_KEY`, la demande répond normalement mais aucun e-mail ne part (le journal l'indique).
- **Continuer avec Google** : dans Google Cloud Console, créer un identifiant OAuth « Application Web » pour Piochéo. Origine JavaScript autorisée : `https://piocheo.com`. URI de redirection autorisée : `https://api.piocheo.com/auth/google/callback`. Écran de consentement : nom Piochéo, champs d'application `openid`, `email`, `profile`. Tant que les trois variables Google ne sont pas remplies, le bouton renvoie vers la connexion avec un message.

`piocheo-web` :

```
# Variable de build (cocher « Build Variable » dans Coolify)
VUE_APP_API_URL=https://api.piocheo.com
# Variable d'exécution, pour la CSP
PIOCHEO_API_ORIGIN=https://api.piocheo.com
```

Option de build : `VUE_APP_PILOT_CITY=Tournai`.

`PIOCHEO_TRUST_PROXY=1` correspond à Traefik (Coolify) devant l'API. Avec cette valeur, la limite de tentatives de connexion s'applique par visiteur, et le cookie `Secure` reconnaît le HTTPS. Si l'on passe plutôt par le relais `/api` du front (sans `VUE_APP_API_URL`, avec `PIOCHEO_API_UPSTREAM` vers le nom interne de l'API), utiliser `2`.

## Mise en ligne

1. Chez le registraire de `piocheo.com`, faire pointer `piocheo.com` et `api.piocheo.com` (enregistrements A) vers l'IP du VPS OVH.
2. Créer `piocheo-db`, puis noter son URL interne.
3. Créer `piocheo-api` avec les variables ci-dessus et le domaine `https://api.piocheo.com`, puis vérifier `https://api.piocheo.com/health`.
4. Créer `piocheo-web` avec le domaine `https://piocheo.com`. Coolify génère les certificats HTTPS.
5. Créer le premier compte organisateur, puis lui donner le rôle `organizer` en base. Le seed de démonstration refuse la production et ne doit pas y être lancé.
6. Activer les sauvegardes planifiées Coolify sur `piocheo-db`, comme pour `Wayd-DB`.

## Données personnelles

Comme Wayd, les données restent sur le VPS OVH (Canada, décision d'adéquation UE-Canada). Avant une ouverture publique, il faut ajouter Piochéo au registre des traitements et publier une politique de confidentialité propre à Piochéo.
