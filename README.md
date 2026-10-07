# Gravador de tela

Aplicação web estática que grava **tela inteira, janela ou aba** com **áudio do sistema e microfone**, direto no navegador — sem instalar nada, sem backend e sem enviar dados para servidor algum. Tudo acontece no seu computador.

Funciona em **computador com Windows, no Chrome ou no Edge atualizados**. Não funciona no celular (a tela inicial avisa isso).

## Recursos

- Fonte: tela inteira, janela ou aba (dica para o seletor do navegador)
- Áudio do sistema + microfone (com seleção de dispositivo), mixados em uma trilha
- Qualidades 480p, 720p e 1080p; 15, 24 ou 30 fps; estimativa de tamanho por minuto
- Formatos MP4 (H.264, compatível) e WebM (VP9, arquivo menor)
- Contagem regressiva de 3 s ou 5 s (ou desligada), com cancelamento por botão ou Escape
- Iniciar, pausar, retomar e parar (botão da página, barra nativa do navegador ou mini controle)
- Captura de imagem (PNG) durante a gravação, na página ou no mini controle
- Teste prévio de áudio (microfone e sistema) com reaproveitamento da captura
- Salvar direto no disco (opcional, para gravações longas)
- Pré-visualização com duração, tamanho, formato e resolução
- Configurações lembradas entre acessos + botão "Restaurar padrões"
- Tema escuro (padrão) e claro; instalável como PWA, funciona offline após o primeiro acesso

## Requisitos

- Node.js 22 (apenas para desenvolver/publicar; quem usa só precisa do navegador)
- Chrome ou Edge atual no Windows (para gravar)

## Uso local

```bash
npm install
npm run dev
```

Abra o endereço mostrado (geralmente `http://localhost:5173/`).

Para testar o build igual ao publicado:

```bash
npm run build
npm run preview
```

Abra `http://localhost:4173/gravador-de-tela-web/`.

## Scripts

| Comando           | O que faz                              |
| ----------------- | -------------------------------------- |
| `npm run dev`     | Servidor de desenvolvimento            |
| `npm run build`   | Checagem de tipos + build em `dist/`   |
| `npm run preview` | Serve o build localmente para teste    |
| `npm run typecheck` | Só a checagem de tipos (`tsc --noEmit`) |

## Estrutura

```
index.html            (tema aplicado antes da pintura, CSP restritiva)
vite.config.ts        (base do Pages + PWA)
src/
  main.ts             (liga interface, gravação e todos os recursos)
  state.ts            (máquina de estados e configurações)
  core/               (capture, presets, audio-mixer, audio-meter, audio-test,
                       recorder, countdown, screenshot, download, pip-controller,
                       wake-lock, storage-writer, settings, capabilities, errors)
  ui/                 (views, componentes, ícones Lucide, tema)
  styles/             (tokens, base, componentes)
public/icons/         (ícones do PWA)
.github/workflows/    (deploy no GitHub Pages)
```

## Limitações conhecidas

- No Windows, o **áudio do sistema não é capturado ao gravar uma janela** (limitação do navegador) — use tela inteira ou aba
- O controle de **cursor do mouse está temporariamente oculto** na interface (código pronto, marcado com TEMP em `src/ui/views.ts`)
- Sem modo pasta nesta versão: as imagens (PNG) sempre baixam pelo navegador
- Atalhos de teclado globais não existem em página web (só Escape cancela a contagem com a aba em foco)
