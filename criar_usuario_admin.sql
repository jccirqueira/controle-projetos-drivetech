-- PASSO A PASSO PARA RODAR ESTE ARQUIVO:

-- 1. Vá no menu "Authentication" > "Users" no site do Supabase.
-- 2. Copie o "User UID" do usuário que você criou (é um código longo, tipo: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11).
-- 3. Substitua o texto SEU_ID_AQUI abaixo pelo código que você copiou (mantenha as aspas simples!).

-- --- COMEÇO DO SCRIPT ---

-- Cria o usuário na tabela do sistema ligado ao login do Supabase
INSERT INTO public.usuarios (id, nome, email, perfil, ativo)
VALUES (
    '37f3c216-e081-4d6d-a7f0-d00adda414aa',           -- <--- COLE O ID AQUI, MANTENDO AS ASPAS (Ex: 'a0eebc99...')
    'Administrador',         -- Nome que vai aparecer no painel
    'admin@drivetech.com',   -- O mesmo email que você usou no Authentication
    'admin',                 -- Perfil administrativo
    true                     -- Usuário ativo
);

-- Cria o perfil de engenheiro para este administrador (para ele poder aparecer nas listas)
INSERT INTO public.engenheiros (usuario_id, especialidade, nivel, disponibilidade)
VALUES (
    '37f3c216-e081-4d6d-a7f0-d00adda414aa',           -- <--- COLE O MESMO ID AQUI TAMBÉM
    'Gestão',
    'especialista',
    100
);

-- --- FIM DO SCRIPT ---

-- DEPOIS DE EDITAR ESTE ARQUIVO COM SEU ID:
-- 1. Copie todo o conteúdo (exceto estas instruções de cima se quiser, ou tudo mesmo).
-- 2. Vá no "SQL Editor" no site do Supabase.
-- 3. Cole e clique em "Run" (botão verde).
