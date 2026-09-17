# Ágile Talentos — Vercel

Aplicação React + Vite com Vercel Functions, Postgres, Blob e IA opcional.

1. Crie um banco Neon Postgres no Marketplace da Vercel. O Blob Store é opcional.
2. Execute `db/schema.sql` no banco.
3. A integração Neon fornece `DATABASE_URL` automaticamente. O sistema também aceita `POSTGRES_URL`. `BLOB_READ_WRITE_TOKEN` e `OPENAI_API_KEY` são opcionais.
4. Importe esta pasta na Vercel ou execute `vercel --prod`.

A tela de cadastro contém somente o upload do currículo. O sistema extrai o conteúdo, usa IA para identificar automaticamente os dados e salva tudo no banco. A pesquisa funciona por interpretação local mesmo sem a chave de IA.

Na primeira utilização, a tabela é criada automaticamente. Se o Blob não estiver conectado, o currículo é armazenado diretamente no Postgres.
