# Déployer Piochéo comme Wayd

Wayd tourne sur le VPS OVH géré avec Coolify : l'application et MongoDB y sont des conteneurs Docker, et les journaux et sauvegardes passent par Coolify (voir `wayd-api/docs/CONTEXT_APP.md` et `docs/rgpd/registre-des-traitements.md` dans Wayd). Piochéo suit le même modèle, avec des ressources, une base et des secrets séparés de Wayd.

## Ressources Coolify

Créer un projet Coolify « Piochéo » avec trois ressources sur le même VPS.

| Ressource | Type | Source | Réseau |
| --- | --- | --- | --- |
| `piocheo-db` | Base MongoDB 7 ou 8 | Image officielle | Interne uniquement, aucun port publié |
| `piocheo-api` | Application Dockerfile | `alexandre-becquart/piocheo-api`, branche `main`, port 3100 | Interne uniquement, pas de domaine public |
| `piocheo-web` | Application Dockerfile | `alexandre-becquart/piocheo-web`, branche `main`, port 80 | Domaine public en HTTPS |

Le front sert l'application et relaie `/api` vers l'API par le réseau interne. Le navigateur ne parle qu'à une seule origine, ce qui évite les problèmes de CORS et garde le cookie de session en `SameSite=Lax`.

## Variables d'environnement

`piocheo-api` :

```
NODE_ENV=production
PORT=3100
HOST=0.0.0.0
PIOCHEO_MONGODB_URI=<URL interne de piocheo-db, base piocheo>
PIOCHEO_JWT_SECRET=<openssl rand -hex 32, propre à Piochéo>
PIOCHEO_WEB_ORIGINS=https://<domaine du front>
PIOCHEO_TRUST_PROXY=2
```

`piocheo-web` :

```
PIOCHEO_API_UPSTREAM=http://<nom interne de piocheo-api>:3100
```

Option de build : `VUE_APP_PILOT_CITY=Tournai`.

`PIOCHEO_TRUST_PROXY=2` correspond à Traefik (Coolify) puis au Nginx du front. Avec cette valeur, la limite de tentatives de connexion s'applique par visiteur et non au conteneur Nginx, et le cookie `Secure` reconnaît le HTTPS.

## Mise en ligne

1. Créer `piocheo-db`, puis noter son URL interne.
2. Créer `piocheo-api` avec les variables ci-dessus et vérifier `/health` depuis le terminal Coolify du conteneur.
3. Créer `piocheo-web`, lui attribuer le domaine et activer le certificat HTTPS.
4. Créer le premier compte organisateur, puis lui donner le rôle `organizer` en base. Le seed de démonstration refuse la production et ne doit pas y être lancé.
5. Activer les sauvegardes planifiées Coolify sur `piocheo-db`, comme pour `Wayd-DB`.

## Données personnelles

Comme Wayd, les données restent sur le VPS OVH (Canada, décision d'adéquation UE-Canada). Avant une ouverture publique, il faut ajouter Piochéo au registre des traitements et publier une politique de confidentialité propre à Piochéo.
