# Ágile Talentos — Vercel

Aplicação React + Vite com Vercel Functions, Postgres, Blob e IA opcional.

1. Crie um banco Neon Postgres e um Blob Store no Marketplace da Vercel.
2. Execute `db/schema.sql` no banco.
3. Configure `POSTGRES_URL`, `BLOB_READ_WRITE_TOKEN` e, opcionalmente, `OPENAI_API_KEY`.
4. Importe esta pasta na Vercel ou execute `vercel --prod`.

A tela de cadastro contém somente o upload do currículo. O sistema extrai o conteúdo, usa IA para identificar automaticamente os dados e salva tudo no banco. A pesquisa funciona por interpretação local mesmo sem a chave de IA.
