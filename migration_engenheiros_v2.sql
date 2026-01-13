-- MIGRATION: Allow engineers without Auth User
-- Run this in Supabase SQL Editor

-- 1. Add columns to store engineer details directly
ALTER TABLE public.engenheiros ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.engenheiros ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Populate new columns with existing data from linked users
UPDATE public.engenheiros e
SET nome = u.nome, email = u.email
FROM public.usuarios u
WHERE e.usuario_id = u.id;

-- 3. Ensure they are not null for future consistency?
-- For now assume application handles validation.
