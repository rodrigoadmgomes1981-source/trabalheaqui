# Ágile Talentos — Vercel

Aplicação React + Vite com Vercel Functions, Postgres (Neon), Blob e IA opcional.

## Como publicar

1. Crie um banco Neon Postgres no Marketplace da Vercel. O Blob Store é opcional.
2. (Opcional) Execute `db/schema.sql` no banco. Na primeira utilização a tabela e os índices são criados automaticamente.
3. Variáveis de ambiente:
   - `DATABASE_URL` (fornecida pela integração Neon) ou `POSTGRES_URL` — obrigatória.
   - `BLOB_READ_WRITE_TOKEN` — opcional. Sem ela, o currículo é armazenado no próprio Postgres.
   - `OPENAI_API_KEY` — opcional. Sem ela, a leitura do currículo e a pesquisa usam interpretação local.
   - `OPENAI_MODEL` — opcional (padrão `gpt-4.1-mini`).
   - `APP_PASSWORD` — opcional, **recomendada**. Protege pesquisa, cadastro e currículos com senha.
4. Importe esta pasta na Vercel ou execute `vercel --prod`.

## Funcionamento

A tela de cadastro contém somente o upload do currículo (PDF ou DOCX, até 4 MB — limite de corpo das Vercel Functions). O navegador extrai o texto, a IA identifica os dados e tudo é salvo no banco. A pesquisa entende profissão, estado e tempo mínimo de experiência, ignorando acentos, plural e gênero.

> Atenção (LGPD): com o Blob, os currículos ficam em URLs públicas não listadas. Use `APP_PASSWORD` para proteger o acesso ao sistema.
