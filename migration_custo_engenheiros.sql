-- Migration: Add hourly cost fields to engineers table
ALTER TABLE engenheiros 
ADD COLUMN IF NOT EXISTS custo_hora_normal NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS custo_hora_extra NUMERIC(10, 2) DEFAULT 0;

COMMENT ON COLUMN engenheiros.custo_hora_normal IS 'Custo da hora normal do engenheiro para análise de projeto';
COMMENT ON COLUMN engenheiros.custo_hora_extra IS 'Custo da hora extra do engenheiro para análise de projeto';
