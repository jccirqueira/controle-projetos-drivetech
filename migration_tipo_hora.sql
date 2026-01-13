-- Migration: Add hour type to time entries
ALTER TABLE apontamentos_horas 
ADD COLUMN IF NOT EXISTS tipo_hora TEXT DEFAULT 'normal' CHECK (tipo_hora IN ('normal', 'extra'));

COMMENT ON COLUMN apontamentos_horas.tipo_hora IS 'Tipo da hora apontada: normal ou extra';
