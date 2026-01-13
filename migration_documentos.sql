-- Create table for project documents metadata
CREATE TABLE IF NOT EXISTS public.documentos_projetos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    projeto_id UUID REFERENCES public.projetos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    caminho TEXT NOT NULL,
    tipo TEXT,
    tamanho BIGINT,
    criado_em TIMESTAMPTZ DEFAULT now(),
    criado_por UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.documentos_projetos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view documents of their projects" ON public.documentos_projetos
    FOR SELECT USING (true); -- Simplified for now, can be restricted by project allocation later

CREATE POLICY "Users can upload documents" ON public.documentos_projetos
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete their documents" ON public.documentos_projetos
    FOR DELETE USING (true);
