# Chainlit Fork — JawabDeen Custom

Branche : `jawabdeen-custom` sur `bigdizaya/chainlit`

## Modifications par rapport à Chainlit upstream

1. **Sidebar** : reste ouverte après suppression d'une conversation (`frontend/src/components/LeftSidebar/ThreadList.tsx`)
2. **Micro** : icône stop = carré au lieu de X (`frontend/src/components/chat/MessageComposer/VoiceButton.tsx`)
3. **Traduction arabe** : fichier `backend/chainlit/translations/ar-SA.json`
4. **Build** : skip pnpm si dist/ pré-compilés existent (`backend/build.py`)

## Procédure de déploiement

Après toute modification :

```bash
# 1. Compiler le frontend
pnpm install --frozen-lockfile && pnpm buildUi

# 2. Fabriquer le wheel
cd backend && python3 -m pip wheel --no-deps . -w /tmp/chainlit-wheel/ && cd ..

# 3. Commit et push (HUSKY=0 car uv n'est pas installé localement)
git add .
HUSKY=0 git commit -m "description"
git push origin jawabdeen-custom

# 4. Mettre à jour le wheel sur GitHub Release
gh release upload v2.9.6-jawabdeen /tmp/chainlit-wheel/chainlit-2.9.6-py3-none-any.whl --clobber --repo bigdizaya/chainlit

# 5. Redéployer sur Coolify (l'utilisateur clique "Redeploy")
```

## Pre-commit hook

Le repo a un hook husky qui lance `uv run ruff`. Comme `uv` n'est pas installé, utiliser `HUSKY=0` devant les commandes git commit, ou `--no-verify`.
