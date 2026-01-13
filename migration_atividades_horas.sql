-- Migration: Add horas_previstas to atividades
ALTER TABLE public.atividades ADD COLUMN horas_previstas NUMERIC(5,2);

-- Update timestamp trigger (if needed, but usually not needed for column addition)
COMMENT ON COLUMN public.atividades.horas_previstas IS 'Horas previstas/estimadas para a conclusão da atividade';
