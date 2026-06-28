# Ad-ops Copilot — démo web (cible : Massive Dynamic)

Une interface façon **copilote ad-ops** (inspirée du produit de Massive Dynamic) :
panneau copilote à gauche, tableau de campagnes multi-canal à droite. Elle lit un
export Meta / Google / TikTok, **calcule tous les KPI en TypeScript** (par campagne
ET agrégats), et **Claude rédige uniquement la reco de réallocation** à partir de
ces chiffres — sans en inventer aucun.

C'est la version visuelle de la démo console (`../demo-ad-ops/`), pensée pour un Loom
et pour être déployée sur une URL Vercel gratuite.

## Stack

- **Next.js 14** (App Router) + React 18 + TypeScript.
- Calculs : `lib/metrics.ts` (déterministe, partagé client + serveur).
- IA : route serverless `app/api/analyze/route.ts` → SDK `@anthropic-ai/sdk`, modèle `claude-opus-4-8`.

## Lancer en local

```bash
cd demo-ad-ops-web
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local   # ta clé Anthropic
npm run dev          # http://localhost:3000
```

Sans clé, l'app tourne quand même : le tableau et les chiffres restent exacts
(ils sont calculés), seule la rédaction IA de la reco affiche un message.

## Déployer sur Vercel (URL gratuite)

1. Pousse ce dossier sur un repo GitHub (ou `vercel` en CLI depuis ce dossier).
2. Sur **vercel.com** → New Project → importe le repo. Vercel détecte Next.js, rien à configurer.
3. **Settings → Environment Variables** → ajoute :
   - `ANTHROPIC_API_KEY` = `sk-ant-...`
4. Deploy. Tu obtiens une URL `*.vercel.app` gratuite.

> ⚠️ La clé vit **uniquement** dans les variables d'environnement Vercel (côté serveur),
> jamais dans le code ni le navigateur. Ne commit jamais de `.env.local`.

### Option CLI rapide

```bash
npm i -g vercel
cd demo-ad-ops-web
vercel              # suit l'assistant, lie le projet
vercel env add ANTHROPIC_API_KEY    # colle ta clé
vercel --prod       # déploie en prod → URL finale
```

## Ce qu'il faut savoir pour la démo

- L'analyse se lance automatiquement au chargement de la page (bon pour filmer).
- Le bouton ↑ (ou un clic dans la barre du bas) **relance** le daily check.
- Le chiffre clé à dire en voix-off : *« tous les nombres sont calculés en amont,
  l'IA ne fait que rédiger — je ne la laisse pas inventer de chiffres »*.
- Pour changer le scénario : édite `lib/data.ts` (les 8 campagnes + leurs valeurs).

## Coût

Un chargement = un appel Claude (~1-2 centimes). À chaque relance, idem.
