---
title: "Website SvelteKit — myTerm"
description: "Documentação do website de landing page do myTerm: SvelteKit, download dinâmico via GitHub Releases API e fallbacks estáticos."
---

# Website SvelteKit

O website do myTerm é uma **landing page de download** construída com [SvelteKit](https://kit.svelte.dev), hospedada no [Vercel](https://vercel.com). Ela obtém dinamicamente a versão e URLs de download mais recentes da **GitHub Releases API** com fallbacks estáticos para máxima disponibilidade.

---

## Estrutura do Projeto

```
website/
├── src/
│   └── routes/
│       ├── +layout.svelte      # Layout global (meta tags, fonts)
│       ├── +page.server.ts     # Load function: consulta GitHub Releases
│       └── +page.svelte        # Interface visual da landing page
├── static/                     # Assets estáticos (favicon, OG image)
├── svelte.config.js            # Adapter: @sveltejs/adapter-vercel
└── package.json
```

---

## `+page.server.ts` — Download Dinâmico

Essa é a peça central do website. Ela roda **apenas no servidor** (SSR ou Edge Function no Vercel) e retorna as URLs de download para a `+page.svelte`.

### Estratégia de Fetch

O `load` function tenta obter a release mais recente em dois passes:

```typescript
export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
  setHeaders({ 'cache-control': 'public, max-age=600, s-maxage=600' });

  try {
    // Passo 1: Endpoint /releases/latest (mais rápido)
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'myterm-website' } }
    );
    if (res.ok) return extractUrls(await res.json());

    // Passo 2: Lista de releases (fallback se /latest retornar 404)
    const listRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`,
      { headers }
    );
    if (listRes.ok) {
      const releases = await listRes.json();
      // Pula drafts e prereleases — pega a primeira release estável
      const latest = releases.find(r => !r.draft && !r.prerelease) ?? releases[0];
      if (latest) return extractUrls(latest);
    }
  } catch (e) {
    console.error('Erro ao buscar versão do GitHub:', e);
  }

  // Passo 3: URLs estáticas hardcoded (funciona 100% offline/rate-limited)
  return { version: FALLBACK_VERSION, ...FALLBACK_URLS, ...nullSizes };
};
```

**Por que dois passes?** O endpoint `/releases/latest` retorna 404 se só existirem pre-releases ou drafts. A listagem por `per_page=10` garante que a release estável mais recente seja encontrada nesses casos.

**Cache-Control**: `max-age=600, s-maxage=600` cacheia a resposta por 10 minutos tanto no cliente quanto no CDN do Vercel — evita bater no rate limit da API do GitHub sem comprometer os dados.

### Extração das URLs por Plataforma

```typescript
// +page.server.ts:42-74 (simplificado)
function extractUrls(data: Release) {
  const a = data.assets;
  const find = (pred: (n: string) => boolean) => a.find(x => pred(x.name));

  const installerAsset = find(n => n.includes('installer') && n.endsWith('.exe'));
  const windowsAsset   = find(n => n.includes('windows')   && n.endsWith('.exe') && !n.includes('installer'));
  const macosAsset     = find(n => n.includes('macos')     && n.endsWith('.dmg'));
  const macosZipAsset  = find(n => n.includes('macos')     && n.endsWith('.zip'));
  const linuxAsset     = find(n => n.includes('linux')     && n.endsWith('.tar.gz'));

  return {
    version:       data.tag_name ?? FALLBACK_VERSION,
    releasePageUrl: data.html_url ?? FALLBACK_URLS.releasePageUrl,
    installerUrl:  installerAsset?.browser_download_url ?? FALLBACK_URLS.installerUrl,
    installerSize: formatSize(installerAsset?.size),
    windowsUrl:    windowsAsset?.browser_download_url  ?? FALLBACK_URLS.windowsUrl,
    macosUrl:      macosAsset?.browser_download_url    ?? FALLBACK_URLS.macosUrl,
    // ...
  };
}
```

Os nomes dos assets seguem a convenção do `build.sh`:

| Plataforma | Asset name |
|---|---|
| Windows (NSIS installer) | `myterm-windows-amd64-installer.exe` |
| Windows (portátil) | `myterm-windows-amd64.exe` |
| macOS (DMG universal) | `myterm-macos-universal.dmg` |
| macOS (ZIP) | `myterm-macos-universal.zip` |
| Linux (tarball) | `myterm-linux-amd64.tar.gz` |

### `formatSize`

```typescript
function formatSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

O tamanho formatado é exibido nos botões de download (ex: "8.2 MB") para ajudar o usuário a decidir antes de clicar.

---

## `+page.svelte` — Interface Visual

A landing page renderiza os dados passados pelo `load` function.

### Dados recebidos via `export let data`

```typescript
// Tipagem inferida de PageServerLoad
data: {
  version: string;         // ex: "v0.3.1"
  installerUrl: string;    // URL do instalador NSIS
  installerSize: string | null;
  windowsUrl: string;      // URL do .exe portátil
  macosUrl: string;        // URL do .dmg
  macosZipUrl: string;     // URL do .zip (sem notarização)
  linuxUrl: string;        // URL do .tar.gz
  releasePageUrl: string;  // URL da página no GitHub
  // + tamanhos...
}
```

### Seções da página

| Seção | Conteúdo |
|---|---|
| **Hero** | Nome, tagline, screenshot/demo, botão de download principal |
| **Features** | Grid de features (multi-tab, splits, GPU, temas, etc.) |
| **Download** | Cards por plataforma com versão, tamanho e links alternativos |
| **Footer** | Links GitHub, licença MIT |

### Download inteligente por OS

A página detecta o SO do visitante via `navigator.platform` / `userAgent` e pré-seleciona o card de download correto. O botão de download principal no Hero aponta para o asset mais relevante (ex: instalador NSIS para Windows).

---

## Deploy no Vercel

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';

export default {
  kit: {
    adapter: adapter({
      runtime: 'edge', // Edge Functions para latência global mínima
    }),
  },
};
```

O uso de **Edge Runtime** garante que o fetch da GitHub API aconteça na região mais próxima do visitante, reduzindo o TTFB. O cache de 10 minutos garante que cada Edge node não consulte a API repetidamente.

---

## Configuração de Build Local

```bash
cd website
npm install
npm run dev        # http://localhost:5173

# Para visualizar como produção:
npm run build
npm run preview
```

### Variáveis de Ambiente

Nenhuma variável de ambiente é obrigatória. O `GITHUB_REPO` está hardcoded em `+page.server.ts` (`'marcelomatz/myterm'`). Não há tokens de API — o website usa o endpoint público do GitHub (60 req/hora por IP de Edge, suficiente com o cache de 600s).

---

## Fallbacks Estáticos

Os fallbacks em `FALLBACK_URLS` garantem que os botões de download funcionem mesmo se:
- A GitHub API estiver fora do ar
- O rate limit for atingido
- A Edge Function falhar por qualquer motivo

O tradeoff é que os links podem apontar para uma versão mais antiga até o próximo deploy ou expiração do cache.

```typescript
// +page.server.ts:10-19
const FALLBACK_VERSION = 'v0.3.1';
const BASE_RELEASE = `https://github.com/${GITHUB_REPO}/releases/download/${FALLBACK_VERSION}`;

const FALLBACK_URLS = {
  installerUrl: `${BASE_RELEASE}/myterm-windows-amd64-installer.exe`,
  windowsUrl:   `${BASE_RELEASE}/myterm-windows-amd64.exe`,
  macosUrl:     `${BASE_RELEASE}/myterm-macos-universal.dmg`,
  macosZipUrl:  `${BASE_RELEASE}/myterm-macos-universal.zip`,
  linuxUrl:     `${BASE_RELEASE}/myterm-linux-amd64.tar.gz`,
  releasePageUrl: `https://github.com/${GITHUB_REPO}/releases`,
};
```

Atualizar a constante `FALLBACK_VERSION` antes de cada deploy garante que o fallback sempre aponte para a release correta.
