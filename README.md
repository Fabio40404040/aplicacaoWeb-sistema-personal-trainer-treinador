# FRS Coach

Painel administrativo responsivo para profissionais de Educação Física que atuam com musculação, com login, gestão de alunos, fichas de treino, biblioteca de exercícios, avaliação física completa e acompanhamento de evolução. A prescrição nutricional não faz parte do sistema e pode ser conduzida por nutricionista parceiro.

## Rodar o projeto

```bash
npm install
npm run dev
```

O comando `npm run dev` prepara o banco local e inicia automaticamente a interface e a API. O site abre na porta 5173 e a API usa a porta 8787. Pressione `Ctrl+C` para encerrar os dois serviços.

O painel demonstrativo do coach guarda alterações no dispositivo. O cadastro e login do aluno usam Cloudflare Workers + D1. O Vite encaminha `/api` para esse serviço. Para uma API publicada em outro domínio, informe sua URL em `VITE_API_URL` antes de compilar.

## Adicionar à tela inicial

O site inclui um manifesto PWA, ícones para Android e iPhone e uma página de aviso quando estiver offline. No Android, use o botão **Adicionar à tela inicial** quando aparecer. No iPhone, abra a versão publicada em HTTPS no Safari e escolha **Compartilhar → Adicionar à Tela de Início**. O endereço `localhost` funciona apenas no próprio computador; para instalar no celular, publique o site em HTTPS. Contas, treinos e avaliações exigem conexão com a API e não são armazenados no cache offline.

## Estrutura

- `index.html`: toda a marcação da interface, incluindo formulários e templates.
- `src/styles`: tokens visuais, base, layout, componentes e responsividade.
- `src/modules`: autenticação, rotas, estado, API e regras da interface.
- `src/main.js`: apenas importa e inicializa os módulos.
- `src/assets`: fontes e demais recursos locais.
- `public`: favicon, manifesto, ícones e página offline da PWA.
- `backend`: Cloudflare Worker, banco D1 e instruções de implantação na Cloudflare.

## Verificação

```bash
npm run lint
npm run build
```

As etapas específicas da API estão em `backend/README.md`.
