# DOC CSC · Banco de Talentos — Vercel

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

## Pesquisa inteligente

A barra de pesquisa entende linguagem natural e combina vários critérios:

- **Profissão** (enfermeiro, técnico de enfermagem, médico, fisioterapeuta...)
- **Cidade** e **estado** onde o profissional mora ("em Porto Velho", "no Pará", "Belém/PA")
- **Tempo de experiência** ("mais de 3 anos", "até 2 anos", "entre 2 e 5 anos", "recém-formado")
- **Setores** onde trabalhou (UTI, UTI neonatal, pronto-socorro, centro cirúrgico, home care, hemodiálise, atenção básica...)
- **Palavras-chave** do currículo: cursos, especializações, certificações e locais de trabalho ("ACLS", "Hospital de Base")

Com `OPENAI_API_KEY`, a IA interpreta a pesquisa e, no cadastro, extrai setores, especializações, locais de trabalho, formação, resumo e anos de experiência. Sem a chave, uma interpretação local cobre os casos mais comuns. Os resultados mostram o percentual de compatibilidade, o que foi encontrado e todas as informações do profissional. Digite **todos** para listar todos os cadastros.

### Atualizar cadastros antigos

Currículos cadastrados antes da versão 1.4 não têm o texto completo indexado. Quando existirem, a tela de pesquisa mostra um aviso com o botão **Atualizar agora**: o sistema relê os arquivos guardados (`/api/reprocess`), extrai o texto e preenche setores, especializações, locais de trabalho, formação e resumo, sem sobrescrever dados já preenchidos. Currículos digitalizados (imagem, sem texto) não podem ser lidos e são apenas marcados para não travar a fila.

## Excluir currículos

Cada resultado da pesquisa tem o botão **Excluir**, que pede confirmação e remove o cadastro e o arquivo (do banco ou do Blob).

## Receber currículos pelo WhatsApp (celular)

O sistema pode ser instalado como app (PWA) e aparece no menu **Compartilhar** do celular.

- **Android (Chrome):** abra o site, toque em **Instalar no celular** (ou menu ⋮ → Instalar app). No WhatsApp, toque e segure o currículo → **Compartilhar** → **Banco de Talentos**. O sistema abre, lê e cadastra automaticamente.
- **iPhone:** o iOS não permite que sites recebam arquivos pelo Compartilhar. No WhatsApp, use **Compartilhar → Salvar em Arquivos** e envie pela tela **Cadastrar currículo**.

> Atenção (LGPD): com o Blob, os currículos ficam em URLs públicas não listadas. Use `APP_PASSWORD` para proteger o acesso ao sistema.
